import axios from "axios";
import googleOAuth from "../auth/googleOAuth.js";

class SheetsService {
  constructor() {
    this.defaultSheetId = process.env.DEFAULT_GOOGLE_SHEET_ID || "";
  }

  /**
   * Extract spreadsheet ID from link or raw ID
   */
  extractSpreadsheetId(sheetUrlOrId) {
    if (!sheetUrlOrId || typeof sheetUrlOrId !== "string") {
      return this.defaultSheetId || null;
    }
    const trimmed = sheetUrlOrId.trim();
    if (/^[a-zA-Z0-9-_]{20,60}$/.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) return match[1];
    return this.defaultSheetId || null;
  }

  /**
   * Auto-detect header row index (e.g. if Row 1 has group tags or empty rows)
   */
  detectHeaderRowIndex(gridRows = []) {
    if (!gridRows || gridRows.length === 0) return 0;

    const keywords = [
      "primary text", "primarytext", "headline", "landing page",
      "campaign name", "adset name", "ad set name", "ad name",
      "creative code", "creative url", "drive link", "description",
      "call to action", "cta", "budget", "objective"
    ];

    for (let r = 0; r < Math.min(10, gridRows.length); r++) {
      const row = gridRows[r] || [];
      const textStr = row.map((c) => String(c || "").toLowerCase()).join(" ");
      if (keywords.some((kw) => textStr.includes(kw))) {
        return r;
      }
    }

    // Fall back to first row that has 2+ non-empty cells
    for (let r = 0; r < Math.min(10, gridRows.length); r++) {
      const row = gridRows[r] || [];
      const count = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "").length;
      if (count >= 2) return r;
    }

    return 0;
  }

  /**
   * Parse CSV string into headers and normalized row objects
   */
  parseCSVText(csvText) {
    if (!csvText || typeof csvText !== "string") return { headers: [], rows: [], warnings: [] };
    const lines = [];
    let row = [];
    let inQuotes = false;
    let field = "";

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        row.push(field.trim());
        field = "";
      } else if ((char === "\r" || char === "\n") && !inQuotes) {
        if (char === "\r" && nextChar === "\n") {
          i++;
        }
        row.push(field.trim());
        if (row.some((f) => f.length > 0)) {
          lines.push(row);
        }
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field.trim());
      if (row.some((f) => f.length > 0)) {
        lines.push(row);
      }
    }

    if (lines.length === 0) return { headers: [], rows: [], warnings: [] };

    const warnings = [];
    const headerRowIdx = this.detectHeaderRowIndex(lines);
    const rawHeaderRow = lines[headerRowIdx] || [];
    
    const headers = [];
    const headerCounts = {};
    rawHeaderRow.forEach((h, idx) => {
      let hStr = String(h || "").trim();
      if (!hStr) {
        hStr = `Column_${idx + 1}`;
        warnings.push(`Column ${idx + 1} at line ${headerRowIdx + 1} had no header name. Assigned default name "${hStr}".`);
      }
      if (headerCounts[hStr]) {
        headerCounts[hStr] += 1;
        const deDupName = `${hStr}_${headerCounts[hStr]}`;
        warnings.push(`Duplicate header "${hStr}" found at column ${idx + 1}. Disambiguated to "${deDupName}".`);
        headers.push(deDupName);
      } else {
        headerCounts[hStr] = 1;
        headers.push(hStr);
      }
    });

    const rows = [];
    let maxPopulatedRowNumber = headerRowIdx + 1;
    let totalPopulatedRows = headers.length > 0 ? 1 : 0;
    let blankRowsCount = 0;

    for (let r = headerRowIdx + 1; r < lines.length; r++) {
      const line = lines[r];
      const rowNumber = r + 1;
      const rowObj = { _originalRowNumber: rowNumber };
      let hasData = false;

      headers.forEach((header, idx) => {
        const val = line[idx] !== undefined ? String(line[idx]).trim() : "";
        if (val !== "") hasData = true;

        const cleanKey = header
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
        
        rowObj[header] = val;
        if (cleanKey && !rowObj[cleanKey]) {
          rowObj[cleanKey] = val;
        }
        rowObj[`col_${idx}`] = val;
      });

      rowObj.isPopulated = hasData;
      rowObj._isBlank = !hasData;
      if (hasData) {
        maxPopulatedRowNumber = Math.max(maxPopulatedRowNumber, rowNumber);
        totalPopulatedRows++;
      } else {
        blankRowsCount++;
      }
      rows.push(rowObj);
    }

    const totalDataRows = rows.filter((r) => r.isPopulated).length;

    return {
      headers,
      rows,
      detectedHeaderRowIndex: headerRowIdx,
      headerRowNumber: headerRowIdx + 1,
      lastRowNumber: maxPopulatedRowNumber,
      dataRowStart: headerRowIdx + 2,
      totalSheetRows: totalPopulatedRows,
      totalDataRows,
      blankRowsCount,
      totalRows: rows.length,
      warnings,
    };
  }

  /**
   * Read spreadsheet cells & rows from Google Sheets API v4 with fallbacks
   */
  async readSpreadsheet({ spreadsheetIdOrUrl, range = null, gid = null, sheetTitle = null } = {}) {
    const spreadsheetId = this.extractSpreadsheetId(spreadsheetIdOrUrl);
    if (!spreadsheetId) {
      throw new Error("No valid Google Sheet ID or URL provided.");
    }

    let effectiveGid = gid;
    if (!effectiveGid && typeof spreadsheetIdOrUrl === "string") {
      const gidMatch = spreadsheetIdOrUrl.match(/[#?&]gid=([0-9]+)/);
      if (gidMatch) effectiveGid = gidMatch[1];
    }

    let availableWorksheets = [];
    let spreadsheetName = `Google_Sheet_${spreadsheetId.slice(0, 8)}`;
    const warnings = [];

    // Method 1: Authenticated Google Sheets API v4
    try {
      const auth = await googleOAuth.getAuthenticatedClient();

      let targetSheetTitle = "";
      try {
        const metaRes = await auth.axiosInstance.get(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties/title,sheets.properties(sheetId,title)`
        );

        if (metaRes.data?.properties?.title) {
          spreadsheetName = metaRes.data.properties.title;
        }

        const sheetsList = metaRes.data?.sheets || [];
        availableWorksheets = sheetsList.map((s) => s.properties?.title).filter(Boolean);

        if (sheetsList.length > 0) {
          if (sheetTitle) {
            const cleanTarget = String(sheetTitle).toLowerCase().trim();
            const matchedSheet = sheetsList.find(
              (s) =>
                String(s.properties?.title || "").toLowerCase().trim() === cleanTarget ||
                String(s.properties?.title || "").toLowerCase().includes(cleanTarget)
            );
            if (matchedSheet) {
              targetSheetTitle = matchedSheet.properties.title;
            } else {
              console.warn(`[SheetsService Notice] Requested worksheet tab "${sheetTitle}" not found in spreadsheet "${spreadsheetName}". Available worksheets: [${availableWorksheets.join(", ")}]. Defaulting to "${sheetsList[0].properties?.title}".`);
              warnings.push(`Worksheet "${sheetTitle}" not found. Defaulted to "${sheetsList[0].properties?.title}".`);
            }
          }

          if (!targetSheetTitle && effectiveGid) {
            const matchedSheet = sheetsList.find((s) => String(s.properties?.sheetId) === String(effectiveGid));
            if (matchedSheet) targetSheetTitle = matchedSheet.properties.title;
          }

          if (!targetSheetTitle) {
            targetSheetTitle = sheetsList[0].properties?.title || "Sheet1";
          }
        }

        console.log(`\n📊 [SheetsService Diagnostics] Source Type: google_sheets | ID: ${spreadsheetId}`);
        console.log(`   - Spreadsheet Title : "${spreadsheetName}"`);
        console.log(`   - Target Worksheet  : "${targetSheetTitle}"`);
        console.log(`   - Available Tabs    : [${availableWorksheets.join(", ")}]`);
      } catch (metaErr) {
        if (metaErr.response?.status === 403) {
          console.warn("[SheetsService] Scope or Permission Error on Google Sheets API (403):", metaErr.message);
          warnings.push("Google Sheets API returned 403 Forbidden. Accessing via OAuth fallback.");
        }
      }

      let effectiveRange = range;
      if (targetSheetTitle) {
        const cleanTitle = targetSheetTitle.replace(/^'+|'+$/g, "").trim();
        // If range was explicitly provided with an invalid tab name, update range to targetSheetTitle
        if (effectiveRange && effectiveRange.includes("!")) {
          const rangeTab = effectiveRange.split("!")[0].replace(/^'+|'+$/g, "").trim();
          if (availableWorksheets.length > 0 && !availableWorksheets.map((w) => w.toLowerCase()).includes(rangeTab.toLowerCase())) {
            console.warn(`[SheetsService Notice] Requested range tab "${rangeTab}" is not in available worksheets [${availableWorksheets.join(", ")}]. Updating range to target tab "${cleanTitle}".`);
            effectiveRange = `'${cleanTitle.replace(/'/g, "''")}'`;
          }
        } else if (!effectiveRange) {
          effectiveRange = `'${cleanTitle.replace(/'/g, "''")}'`;
        }
      } else if (!effectiveRange) {
        effectiveRange = availableWorksheets[0] ? `'${availableWorksheets[0].replace(/'/g, "''")}'` : "Sheet1";
      }

      let res = null;
      try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(effectiveRange)}`;
        res = await auth.axiosInstance.get(url);
      } catch (rangeErr) {
        console.warn(`[SheetsService] Primary range (${effectiveRange}) failed with status ${rangeErr.response?.status || 400}. Retrying with default sheet range...`);
        const fallbackRange = targetSheetTitle ? `'${targetSheetTitle.replace(/'/g, "''")}'` : (availableWorksheets[0] ? `'${availableWorksheets[0].replace(/'/g, "''")}'` : "Sheet1");
        const fallbackUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(fallbackRange)}`;
        res = await auth.axiosInstance.get(fallbackUrl);
      }

      // Fetch cell hyperlinks (Smart Chips / embedded drive links) via spreadsheets.get gridData
      const gridHyperlinksMap = new Map();
      const gridRawValuesMap = new Map();
      try {
        const gridRange = effectiveRange;
        const gridUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=true&ranges=${encodeURIComponent(gridRange)}`;
        let gridRes = null;
        try {
          gridRes = await auth.axiosInstance.get(gridUrl);
        } catch (gUrlErr) {
          if (gridRange.includes("!")) {
            const fallbackGridUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=true&ranges=A1:Z1000`;
            gridRes = await auth.axiosInstance.get(fallbackGridUrl);
          }
        }

        const sheetsData = gridRes?.data?.sheets || [];
        const matchedSheetObj = sheetsData.find((s) => s.properties?.title === targetSheetTitle) || sheetsData[0];
        const sheetData = matchedSheetObj?.data?.[0]?.rowData || [];

        sheetData.forEach((rowItem, rIdx) => {
          const cells = rowItem.values || [];
          cells.forEach((cellItem, cIdx) => {
            let hLink = cellItem.hyperlink || null;

            // 1. Extract Smart Chip / rich-text links from textFormatRuns
            if (!hLink && Array.isArray(cellItem.textFormatRuns)) {
              for (const run of cellItem.textFormatRuns) {
                const runUri = run.format?.link?.uri || run.link?.uri;
                if (runUri && (runUri.includes("drive.google.com") || runUri.includes("docs.google.com") || runUri.length >= 25)) {
                  hLink = runUri;
                  break;
                }
              }
            }

            // 2. Extract formula HYPERLINK
            if (!hLink && cellItem.userEnteredValue?.formulaValue) {
              const formVal = String(cellItem.userEnteredValue.formulaValue);
              const match = formVal.match(/HYPERLINK\(\s*["']([^"']+)["']/i);
              if (match) hLink = match[1];
            }

            // 3. Raw JSON pattern matching on cell object for Drive URL or folder ID
            if (!hLink) {
              try {
                const jsonStr = JSON.stringify(cellItem);
                const driveMatch = jsonStr.match(/https?:\/\/(?:drive|docs)\.google\.com\/[^\s"',;}\\]+/i);
                if (driveMatch) {
                  hLink = driveMatch[0];
                }
              } catch (e) {}
            }

            if (hLink) {
              gridHyperlinksMap.set(`${rIdx}_${cIdx}`, hLink);
            }

            // 4. Extract uncorrupted raw numeric / string IDs to prevent Google Sheets scientific notation truncation
            let rawCellVal = null;
            if (cellItem.effectiveValue) {
              if (typeof cellItem.effectiveValue.numberValue === "number" && Number.isInteger(cellItem.effectiveValue.numberValue)) {
                rawCellVal = BigInt(cellItem.effectiveValue.numberValue).toString();
              } else if (cellItem.effectiveValue.stringValue) {
                rawCellVal = String(cellItem.effectiveValue.stringValue).trim();
              }
            }
            if (!rawCellVal && cellItem.userEnteredValue) {
              if (typeof cellItem.userEnteredValue.numberValue === "number" && Number.isInteger(cellItem.userEnteredValue.numberValue)) {
                rawCellVal = BigInt(cellItem.userEnteredValue.numberValue).toString();
              } else if (cellItem.userEnteredValue.stringValue) {
                rawCellVal = String(cellItem.userEnteredValue.stringValue).trim();
              }
            }
            if (rawCellVal) {
              gridRawValuesMap.set(`${rIdx}_${cIdx}`, rawCellVal);
            }
          });
        });
      } catch (gErr) {
        console.warn("[SheetsService] Grid hyperlink/Smart Chip extraction notice:", gErr.message);
      }

      const rawValues = res?.data?.values || [];
      if (rawValues.length > 0) {
        const headerRowIdx = this.detectHeaderRowIndex(rawValues);
        const rawHeaders = rawValues[headerRowIdx] || [];
        
        const headers = [];
        const headerCounts = {};
        rawHeaders.forEach((h, idx) => {
          let hStr = String(h || "").trim();
          if (!hStr) {
            hStr = `Column_${idx + 1}`;
            warnings.push(`Column ${idx + 1} at header row ${headerRowIdx + 1} was unnamed.`);
          }
          if (headerCounts[hStr]) {
            headerCounts[hStr] += 1;
            const deDup = `${hStr}_${headerCounts[hStr]}`;
            headers.push(deDup);
          } else {
            headerCounts[hStr] = 1;
            headers.push(hStr);
          }
        });

        const rows = [];
        let maxPopulatedRowNumber = headerRowIdx + 1;
        let totalPopulatedRows = rawHeaders.some((h) => String(h || "").trim() !== "") ? 1 : 0;
        let blankRowsCount = 0;

        for (let r = headerRowIdx + 1; r < rawValues.length; r++) {
          const rowData = rawValues[r] || [];
          const rowNumber = r + 1;
          const rowObj = { _originalRowNumber: rowNumber };
          let hasData = false;

          headers.forEach((header, idx) => {
            const hLink = gridHyperlinksMap.get(`${r}_${idx}`);
            let val = hLink || (rowData[idx] !== undefined ? String(rowData[idx]).trim() : "");
            const rawGridVal = gridRawValuesMap.get(`${r}_${idx}`);
            if (rawGridVal && (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/i.test(val) || (val === "" && rawGridVal))) {
              val = rawGridVal;
            }
            if (val !== "") hasData = true;

            const cleanKey = header
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "");
            
            rowObj[header] = val;
            if (cleanKey && !rowObj[cleanKey]) {
              rowObj[cleanKey] = val;
            }
            rowObj[`col_${idx}`] = val;
          });

          rowObj.isPopulated = hasData;
          rowObj._isBlank = !hasData;
          if (hasData) {
            maxPopulatedRowNumber = Math.max(maxPopulatedRowNumber, rowNumber);
            totalPopulatedRows++;
          } else {
            blankRowsCount++;
          }
          rows.push(rowObj);
        }

        const totalDataRows = rows.filter((r) => r.isPopulated).length;

        return {
          source: "oauth_sheets_api",
          spreadsheetId,
          spreadsheetName,
          sheetTitle: targetSheetTitle || "Sheet1",
          availableWorksheets: availableWorksheets.length > 0 ? availableWorksheets : [targetSheetTitle || "Sheet1"],
          detectedHeaderRowIndex: headerRowIdx,
          headerRowNumber: headerRowIdx + 1,
          lastRowNumber: maxPopulatedRowNumber,
          dataRowStart: headerRowIdx + 2,
          totalSheetRows: totalPopulatedRows,
          totalDataRows,
          blankRowsCount,
          headers,
          rows,
          totalRows: rows.length,
          warnings,
        };
      }
    } catch (authErr) {
      const errDetails = authErr.response?.data?.error?.message || authErr.message;
      console.warn(`[SheetsService] Google Sheets API v4 read notice (${errDetails}). Switching to Drive export handler...`);
    }

    // Method 2: Google Drive API v3 Authenticated CSV Export (with cache-busting timestamp)
    try {
      const accessToken = await googleOAuth.getAccessToken();
      if (accessToken) {
        const driveExportUrl = `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/export?mimeType=text/csv&_t=${Date.now()}`;
        const csvRes = await axios.get(driveExportUrl, {
          timeout: 15000,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "text/csv,text/plain,*/*",
            "Cache-Control": "no-cache, no-store, max-age=0",
            Pragma: "no-cache",
          },
        });

        if (csvRes.data && typeof csvRes.data === "string" && !csvRes.data.includes("<!DOCTYPE html>") && !csvRes.data.includes("<html")) {
          const parsed = this.parseCSVText(csvRes.data);
          return {
            source: "drive_api_v3_export",
            spreadsheetId,
            spreadsheetName,
            sheetTitle: sheetTitle || "Sheet1",
            availableWorksheets: [sheetTitle || "Sheet1"],
            detectedHeaderRowIndex: parsed.detectedHeaderRowIndex,
            headerRowNumber: parsed.headerRowNumber,
            lastRowNumber: parsed.lastRowNumber,
            dataRowStart: parsed.dataRowStart,
            totalSheetRows: parsed.totalSheetRows,
            totalDataRows: parsed.totalDataRows,
            blankRowsCount: parsed.blankRowsCount,
            headers: parsed.headers,
            rows: parsed.rows,
            totalRows: parsed.rows.length,
            warnings: parsed.warnings,
          };
        }
      }
    } catch (exportErr) {
      console.warn("[SheetsService] Authenticated Drive API export fallback to public export:", exportErr.message);
    }

    // Method 3: Public CSV export fallback (with cache-busting timestamp to avoid Google CDN edge cache)
    const publicExportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv${effectiveGid ? `&gid=${effectiveGid}` : ""}&_t=${Date.now()}`;
    const publicCsvRes = await axios.get(publicExportUrl, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/csv,text/plain,*/*",
        "Cache-Control": "no-cache, no-store, max-age=0",
        Pragma: "no-cache",
      },
    });

    if (!publicCsvRes.data || typeof publicCsvRes.data !== "string" || publicCsvRes.data.includes("<!DOCTYPE html>") || publicCsvRes.data.includes("<html")) {
      throw new Error("Could not read Google Sheet data. Please ensure your Google Account is connected with Google Sheets permissions or link sharing is set to 'Anyone with the link can view'.");
    }

    const parsedPublic = this.parseCSVText(publicCsvRes.data);
    return {
      source: "public_export",
      spreadsheetId,
      spreadsheetName,
      sheetTitle: sheetTitle || "Sheet1",
      availableWorksheets: [sheetTitle || "Sheet1"],
      detectedHeaderRowIndex: parsedPublic.detectedHeaderRowIndex,
      headerRowNumber: parsedPublic.headerRowNumber,
      lastRowNumber: parsedPublic.lastRowNumber,
      dataRowStart: parsedPublic.dataRowStart,
      totalSheetRows: parsedPublic.totalSheetRows,
      totalDataRows: parsedPublic.totalDataRows,
      blankRowsCount: parsedPublic.blankRowsCount,
      headers: parsedPublic.headers,
      rows: parsedPublic.rows,
      totalRows: parsedPublic.rows.length,
      warnings: parsedPublic.warnings,
    };
  }

  /**
   * Parse campaign instructions from sheet rows using MetaAdsMapper
   */
  parseCampaignRows(rows = []) {
    return rows.map((r, idx) => {
      const keys = Object.keys(r || {});
      const findVal = (possibleKeys, excludeKeys = []) => {
        for (const p of possibleKeys) {
          const pClean = String(p).toLowerCase().replace(/[^a-z0-9]/g, "");
          for (const k of keys) {
            const kClean = String(k).toLowerCase().replace(/[^a-z0-9]/g, "");
            if (kClean === pClean) {
              const val = r[k];
              if (val !== undefined && val !== null && String(val).trim() !== "") {
                return val;
              }
            }
          }
        }

        for (const p of possibleKeys) {
          const pClean = String(p).toLowerCase().replace(/[^a-z0-9]/g, "");
          if (pClean.length < 3) continue;

          for (const k of keys) {
            const kClean = String(k).toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!kClean.includes(pClean)) continue;

            if (excludeKeys.some((ex) => kClean.includes(ex))) {
              continue;
            }

            const val = r[k];
            if (val !== undefined && val !== null && String(val).trim() !== "") {
              return val;
            }
          }
        }

        return null;
      };

      const rawBudget = findVal([
        "campaign_campaign_daily_budget_inr",
        "campaign_daily_budget_inr",
        "campaign_daily_budget_rs",
        "campaign_daily_budget",
        "daily_budget_inr",
        "daily_budget_rs",
        "daily_budget",
        "campaign_budget_inr",
        "campaign_budget",
        "dailybudgetinr",
        "dailybudget",
        "budget_inr",
        "budget_rs",
        "daily_spend",
        "budget",
        "spend",
        "cost"
      ]);

      const parsedBudget = rawBudget ? Number(String(rawBudget).replace(/[^0-9.]/g, "")) : 0;

      return {
        rowIndex: r._originalRowNumber || idx + 1,
        rowId: r.creative_code || r.row_id || r.id || `ROW-${r._originalRowNumber || idx + 1}`,
        action: (r.action || r.status || "CREATE").toUpperCase(),
        campaignName: findVal(
          ["campaign_name", "campaignname", "camp_name", "campname", "campaign_title", "camptitle", "campaign_label", "campaign"],
          ["budget", "spend", "cost", "id", "status", "objective", "type", "url", "link", "date", "time"]
        ) || r.campaign_name || r.campaign || "",
        objective: findVal(["objective", "funnel_event", "funnel", "goal"]) || r.objective || "OUTCOME_SALES",
        dailyBudget: !isNaN(parsedBudget) && parsedBudget > 0 ? parsedBudget : Number(r.daily_budget || r.budget || 0),
        status: (r.status || r.action || "PAUSED").toUpperCase(),

        adSetName: findVal(["adset_name", "adset", "ad_set", "ad_set_name", "adgroup", "ad_group"]) || r.adset_name || r.ad_set || "",
        targetAudience: findVal(["target_audience", "audience", "targeting", "interests"]) || r.target_audience || r.audience || "",
        optimizationGoal: findVal(["optimization_goal", "opt_goal"]) || "OFFSITE_CONVERSIONS",

        adName: findVal(["ad_name", "adname", "ad_title", "creative_name"]) || r.ad_name || r.ad || "",
        creativeCode: r.creative_code || r.code || r.asset_code || `CREATIVE-${r._originalRowNumber || idx + 1}`,
        headline: findVal(["headline", "ad_headline", "creative_headline", "headline_1", "ad_title", "adheadline", "header", "title"]) || r.headline || r.title || "",
        primaryText: findVal(["primary_text", "primarytext", "main_text", "ad_text", "body_text", "body", "caption", "primary_text_1", "text", "copy", "ad_copy", "primary_copy", "post_text"]) || r.primary_text || r.body || r.description || "",
        description: findVal(["ad_description", "addescription", "description", "ad_desc", "desc", "link_description", "sub_headline", "subheadline", "description_1"]) || r.description || "",
        linkUrl: findVal(["landing_page", "landingpage", "landing_page_url", "ad_landing_page_url", "ad_landing_page", "destination_url", "destination", "website_url", "website", "target_url", "site_url", "link_url", "link", "url", "page"]) || r.link || r.url || "",
        displayLink: findVal(["ad_display_link", "display_link", "displaylink", "display_url", "display_domain", "show_link"]) || r.display_link || "",
        creativeUrl: findVal(["creative_smart_chips", "creative_smart_chip", "smart_chips", "smart_chip", "creativesmartchips", "google_drive_link", "drive_url", "media_url", "drive_link", "video_url", "image_url", "drive", "creative_url", "video", "media", "video_file", "creative"]) || r.creative_url || r.google_drive_link || r.drive_url || r.media_url || "",
        callToAction: findVal(["call_to_action", "cta"]) || r.call_to_action || r.cta || "LEARN_MORE",
        pageId: findVal(["facebook_page_id", "page_id", "fb_page_id"]) || r.facebook_page_id || r.page_id || "",
        instagramAccountId: findVal(["instagram_account_id", "instagram_id", "ig_account_id"]) || r.instagram_account_id || r.instagram_id || "",
        raw: r,
      };
    });
  }

  /**
   * Convert 0-indexed column number to A1 notation column letter (0 -> A, 1 -> B, 26 -> AA)
   */
  colIndexToA1(colIndex) {
    let temp = colIndex;
    let letter = "";
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  }

  /**
   * Update specific cells in Google Sheet using Google Sheets API v4
   */
  async batchUpdateValues({ spreadsheetIdOrUrl, sheetTitle = null, data = [] }) {
    const spreadsheetId = this.extractSpreadsheetId(spreadsheetIdOrUrl);
    if (!spreadsheetId) {
      throw new Error("No valid Google Sheet ID or URL provided.");
    }
    if (!data || data.length === 0) {
      return { success: true, updatedCells: 0 };
    }

    const auth = await googleOAuth.getAuthenticatedClient();
    const payload = {
      valueInputOption: "USER_ENTERED",
      data: data.map((item) => {
        let effectiveRange = item.range;
        if (sheetTitle && !effectiveRange.includes("!")) {
          effectiveRange = `'${sheetTitle}'!${effectiveRange}`;
        }
        return {
          range: effectiveRange,
          values: item.values,
        };
      }),
    };

    const res = await auth.axiosInstance.post(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      payload
    );

    return {
      success: true,
      updatedCells: res.data?.totalUpdatedCells || data.length,
      responses: res.data?.responses || [],
    };
  }

  /**
   * Read specific cell ranges back to verify saved values
   */
  async batchGetValues({ spreadsheetIdOrUrl, ranges = [] }) {
    const spreadsheetId = this.extractSpreadsheetId(spreadsheetIdOrUrl);
    if (!spreadsheetId) throw new Error("No valid Google Sheet ID or URL provided.");
    if (!ranges.length) return [];

    const auth = await googleOAuth.getAuthenticatedClient();
    const params = new URLSearchParams();
    ranges.forEach((r) => params.append("ranges", r));

    const res = await auth.axiosInstance.get(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params.toString()}`
    );

    return res.data?.valueRanges || [];
  }
}

export const sheetsService = new SheetsService();
export default sheetsService;
