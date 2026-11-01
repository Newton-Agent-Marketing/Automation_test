import axios from "axios";
import AiContext from "../../models/aiContextModel.js";
import sheetsService from "../../google/sheetsService.js";
import { googleDriveService } from "../google/googleDriveService.js";

const normalizeHeader = (str) =>
  String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const SEMANTIC_COLUMN_PATTERNS = {
  creativeCode: [
    /^creative_?code$/i,
    /^ad_?code$/i,
    /^asset_?code$/i,
    /^video_?code$/i,
    /^creative_?id$/i,
    /^code$/i,
  ],
  mediaType: [
    /^media_?type$/i,
    /^asset_?type$/i,
    /^creative_?media_?type$/i,
    /^file_?type$/i,
  ],
  creativeFormat: [
    /^creative_?format$/i,
    /^ad_?format$/i,
    /^format$/i,
  ],
  creativeName: [
    /^creative_?name$/i,
    /^video_?name$/i,
    /^asset_?name$/i,
    /^ad_?name$/i,
    /^file_?name$/i,
    /^nomenclature$/i,
  ],
  creativeStatus: [
    /^creative_?status$/i,
    /^asset_?status$/i,
    /^video_?status$/i,
    /^status$/i,
  ],
  videoUrl: [
    /^video_?links?$/i,
    /^video_?urls?$/i,
    /^creative_?smart_?chips?$/i,
    /^smart_?chips?$/i,
    /^creative_?urls?$/i,
    /^creative_?links?$/i,
    /^google_?drive_?links?$/i,
    /^google_?drive_?urls?$/i,
    /^drive_?urls?$/i,
    /^drive_?links?$/i,
    /^media_?urls?$/i,
    /^media_?links?$/i,
    /^asset_?urls?$/i,
    /^asset_?links?$/i,
    /^video_?files?$/i,
  ],
};

function findMatchingHeader(headers = [], patterns = []) {
  for (const pat of patterns) {
    for (const h of headers) {
      const norm = normalizeHeader(h);
      if (pat.test(norm) || pat.test(String(h || "").trim())) {
        return h;
      }
    }
  }
  return null;
}

function findAllMatchingHeaders(headers = [], patterns = []) {
  const matched = [];
  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (patterns.some((pat) => pat.test(norm) || pat.test(String(h || "").trim()))) {
      matched.push(h);
    }
  }
  return matched;
}

/**
 * Classify a URL into Google Drive file, Google Drive folder, direct video URL, or other URL.
 */
export function classifyMediaUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { validFormat: false, sourceType: "MISSING", url: "", fileId: null, folderId: null };
  }
  const url = rawUrl.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(url)) {
    return { validFormat: false, sourceType: "NON_URL_VALUE", url, fileId: null, folderId: null };
  }

  // Google Drive Folder
  const folderMatch =
    url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]{10,})/i) ||
    url.match(/drive\.google\.com\/folderview\?id=([a-zA-Z0-9_-]{10,})/i);
  if (folderMatch) {
    return {
      validFormat: true,
      sourceType: "GOOGLE_DRIVE_FOLDER",
      url,
      fileId: null,
      folderId: folderMatch[1],
    };
  }

  // Google Drive File
  const fileMatch =
    url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/i) ||
    url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]{10,})/i) ||
    url.match(/drive\.google\.com\/uc\?(?:[^#]*&)?id=([a-zA-Z0-9_-]{10,})/i) ||
    url.match(/docs\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/i);
  if (fileMatch) {
    return {
      validFormat: true,
      sourceType: "GOOGLE_DRIVE_FILE",
      url,
      fileId: fileMatch[1],
      folderId: null,
    };
  }

  if (/\.(mp4|mov|webm|m4v|avi|mkv)(?:[?#].*)?$/i.test(url)) {
    return {
      validFormat: true,
      sourceType: "DIRECT_VIDEO_URL",
      url,
      fileId: null,
      folderId: null,
    };
  }

  return {
    validFormat: true,
    sourceType: "EXTERNAL_URL",
    url,
    fileId: null,
    folderId: null,
  };
}

/**
 * Validate URL format & real accessibility without claiming any download took place.
 */
export async function validateVideoUrlAccessibility(rawUrl) {
  const info = classifyMediaUrl(rawUrl);
  if (!info.validFormat) {
    if (!rawUrl || !String(rawUrl).trim()) {
      return {
        ...info,
        accessible: false,
        validationSummary: "Missing URL",
      };
    }
    return {
      ...info,
      accessible: false,
      validationSummary: `Not a URL (text value: "${String(rawUrl).slice(0, 60)}")`,
    };
  }

  if (info.sourceType === "GOOGLE_DRIVE_FOLDER") {
    try {
      const res = await axios.get(`https://drive.google.com/drive/folders/${info.folderId}`, {
        timeout: 6000,
        maxRedirects: 5,
        headers: { "User-Agent": "Mozilla/5.0" },
        validateStatus: () => true,
      });
      const finalUrl = res.request?.res?.responseUrl || "";
      if (res.status === 200 && !finalUrl.includes("accounts.google.com")) {
        return {
          ...info,
          accessible: true,
          validationSummary: "Google Drive Folder (Accessible URL)",
        };
      }
      if (finalUrl.includes("accounts.google.com") || res.status === 401 || res.status === 403) {
        return {
          ...info,
          accessible: false,
          validationSummary: "Google Drive Folder (Restricted — requires Drive permission)",
        };
      }
      return {
        ...info,
        accessible: false,
        validationSummary: `Google Drive Folder (HTTP ${res.status})`,
      };
    } catch (_) {
      return {
        ...info,
        accessible: null,
        validationSummary: "Google Drive Folder (Valid URL format)",
      };
    }
  }

  if (info.sourceType === "GOOGLE_DRIVE_FILE") {
    // 1. Try authenticated Google Drive API metadata check if OAuth is connected
    try {
      const oauthCheck = await googleDriveService.validateDriveLink(info.url);
      if (oauthCheck?.valid) {
        const mimeInfo = oauthCheck.mimeType ? `, ${oauthCheck.mimeType}` : "";
        return {
          ...info,
          accessible: true,
          mimeType: oauthCheck.mimeType || null,
          fileName: oauthCheck.name || null,
          validationSummary: `Google Drive File — Accessible (${oauthCheck.isVideo ? "Video" : "Asset"}${mimeInfo})`,
        };
      }
      if (oauthCheck?.error && !/not connected/i.test(oauthCheck.error)) {
        return {
          ...info,
          accessible: false,
          validationSummary: `Google Drive File — Inaccessible (${oauthCheck.error})`,
        };
      }
    } catch (_) {}

    // 2. Lightweight non-downloading HTTP view check when Drive OAuth isn't active locally
    try {
      const viewUrl = `https://drive.google.com/file/d/${info.fileId}/view`;
      const res = await axios.get(viewUrl, {
        timeout: 6000,
        maxRedirects: 5,
        headers: { "User-Agent": "Mozilla/5.0" },
        validateStatus: () => true,
      });
      const finalUrl = res.request?.res?.responseUrl || "";
      const bodySample = typeof res.data === "string" ? res.data.slice(0, 8000) : "";
      if (res.status === 200 && !finalUrl.includes("accounts.google.com")) {
        const ogTitleMatch = bodySample.match(/property="og:title"\s+content="([^"]+)"/i);
        const ogTitle = ogTitleMatch?.[1] || null;
        return {
          ...info,
          accessible: true,
          fileName: ogTitle,
          validationSummary: `Google Drive File — Valid & Accessible${ogTitle ? ` (${ogTitle})` : ""}`,
        };
      }
      if (finalUrl.includes("accounts.google.com") || res.status === 401 || res.status === 403) {
        return {
          ...info,
          accessible: false,
          validationSummary: "Google Drive File — Valid URL format (Restricted / OAuth permission required)",
        };
      }
      if (res.status === 404) {
        return {
          ...info,
          accessible: false,
          validationSummary: "Google Drive File — Not Found (404)",
        };
      }
    } catch (_) {}

    return {
      ...info,
      accessible: null,
      validationSummary: "Google Drive File — Valid URL format",
    };
  }

  // Direct Video or External URL: lightweight HEAD check
  try {
    const headRes = await axios.head(info.url, {
      timeout: 5000,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    const contentType = headRes.headers?.["content-type"] || "";
    if (headRes.status >= 200 && headRes.status < 400) {
      return {
        ...info,
        accessible: true,
        mimeType: contentType || null,
        validationSummary: `${info.sourceType === "DIRECT_VIDEO_URL" ? "Direct Video URL" : "External URL"} — Accessible (HTTP ${headRes.status}${contentType ? `, ${contentType.split(";")[0]}` : ""})`,
      };
    }
    return {
      ...info,
      accessible: false,
      validationSummary: `URL returned HTTP ${headRes.status}`,
    };
  } catch (_) {
    return {
      ...info,
      accessible: null,
      validationSummary: `${info.sourceType === "DIRECT_VIDEO_URL" ? "Direct Video URL" : "External URL"} — Valid URL format`,
    };
  }
}

export class SheetInspectorService {
  /**
   * Gather all connected spreadsheets from user's AI Context in exact connection order (1-based).
   */
  static async listConnectedSpreadsheets(userId) {
    if (!userId) return [];
    const context = await AiContext.findOne({ userId }).lean().catch(() => null);
    const warehouseNodes = (context?.nodes || []).filter((n) => n.type === "data_warehouse");
    const allSheets = [];

    for (const w of warehouseNodes) {
      if (Array.isArray(w.data?.sheets) && w.data.sheets.length > 0) {
        for (const s of w.data.sheets) {
          if (s && (s.sheetUrl || (Array.isArray(s.sheetRows) && s.sheetRows.length > 0))) {
            const url = (s.sheetUrl || "").trim();
            allSheets.push({
              sheetIndex: allSheets.length + 1,
              sheetId: s.id || `sheet_${allSheets.length + 1}`,
              spreadsheetId: url ? sheetsService.extractSpreadsheetId(url) : (s.workbookId || null),
              warehouseNodeId: w.id,
              sheetName: s.workbookName || s.sheetName || `Sheet #${allSheets.length + 1}`,
              sheetUrl: url,
              provider: s.excelProvider || (url ? "Google Sheets" : "Excel File Upload"),
              rows: Array.isArray(s.sheetRows) ? s.sheetRows : [],
              columns: Array.isArray(s.sheetColumns) ? s.sheetColumns : Array.isArray(s.columns) ? s.columns : [],
              availableTabs: Array.isArray(s.availableTabs) ? s.availableTabs : [],
              selectedTabIds: Array.isArray(s.selectedTabIds)
                ? s.selectedTabIds
                : Array.isArray(s.selectedTabs)
                ? s.selectedTabs
                : [],
              selectedTabsData: Array.isArray(s.selectedTabsData) ? s.selectedTabsData : [],
              worksheetName: s.worksheetName || s.targetTab || null,
              dataLabels: s.dataLabels || s.dataLevel || "",
            });
          }
        }
      } else if (w.data?.sheetUrl || (Array.isArray(w.data?.sheetRows) && w.data.sheetRows.length > 0)) {
        const url = (w.data.sheetUrl || "").trim();
        allSheets.push({
          sheetIndex: allSheets.length + 1,
          sheetId: w.id,
          spreadsheetId: url ? sheetsService.extractSpreadsheetId(url) : (w.data.workbookId || null),
          warehouseNodeId: w.id,
          sheetName: w.data.workbookName || w.data.sheetName || w.data.title || `Sheet #${allSheets.length + 1}`,
          sheetUrl: url,
          provider: w.data.excelProvider || (url ? "Google Sheets" : "Excel File Upload"),
          rows: Array.isArray(w.data.sheetRows) ? w.data.sheetRows : [],
          columns: Array.isArray(w.data.sheetColumns) ? w.data.sheetColumns : Array.isArray(w.data.columns) ? w.data.columns : [],
          availableTabs: Array.isArray(w.data.availableTabs) ? w.data.availableTabs : [],
          selectedTabIds: Array.isArray(w.data.selectedTabIds)
            ? w.data.selectedTabIds
            : Array.isArray(w.data.selectedTabs)
            ? w.data.selectedTabs
            : [],
          selectedTabsData: Array.isArray(w.data.selectedTabsData) ? w.data.selectedTabsData : [],
          worksheetName: w.data.worksheetName || w.data.targetTab || null,
          dataLabels: w.data.dataLabels || w.data.dataLevel || "",
        });
      }
    }

    return allSheets;
  }

  /**
   * Parse explicit sheet index (1-based) from user instruction if present.
   * Distinguishes "2nd sheet" / "Sheet #2" from "2nd tab" / "2nd worksheet".
   */
  static parseRequestedSheetOrdinal(text = "") {
    if (!text) return null;
    const msg = String(text);

    // Explicit number e.g. "Sheet #2", "sheet 2", "2nd sheet", "second spreadsheet"
    const numMatch =
      msg.match(/\b(?:spreadsheet|sheet)\s*#?\s*([0-9]+)\b/i) ||
      msg.match(/\b([0-9]+)(?:st|nd|rd|th)\s+(?:connected\s+)?(?:spreadsheet|sheet)\b/i);
    if (numMatch) {
      return parseInt(numMatch[1], 10);
    }

    if (/\b(second|2nd|two\s*sheet|dusra|dusri|doosra|doosri)\s+(?:connected\s+)?(?:spreadsheet|sheet)\b/i.test(msg)) {
      return 2;
    }
    if (/\b(third|3rd|teesra|teesri)\s+(?:connected\s+)?(?:spreadsheet|sheet)\b/i.test(msg)) {
      return 3;
    }
    if (/\b(fourth|4th)\s+(?:connected\s+)?(?:spreadsheet|sheet)\b/i.test(msg)) {
      return 4;
    }
    if (/\b(first|1st|pehla|pehli)\s+(?:connected\s+)?(?:spreadsheet|sheet)\b/i.test(msg)) {
      return 1;
    }
    return null;
  }

  /**
   * Parse explicit worksheet/tab ordinal ONLY when paired with "tab" or "worksheet" (NEVER "sheet"!).
   */
  static parseRequestedTabOrdinal(text = "") {
    if (!text) return null;
    const msg = String(text);

    const numMatch =
      msg.match(/\b(?:worksheet|tab)\s*#?\s*([0-9]+)\b/i) ||
      msg.match(/\b([0-9]+)(?:st|nd|rd|th)\s+(?:worksheet|tab)\b/i);
    if (numMatch) {
      return parseInt(numMatch[1], 10);
    }
    if (/\b(second|2nd)\s+(?:worksheet|tab)\b/i.test(msg)) return 2;
    if (/\b(third|3rd)\s+(?:worksheet|tab)\b/i.test(msg)) return 3;
    if (/\b(first|1st)\s+(?:worksheet|tab)\b/i.test(msg)) return 1;
    return null;
  }

  /**
   * Resolve spreadsheet & worksheet tab, read live rows, and discover schema dynamically.
   */
  static async resolveAndReadSheet({
    userId,
    sheetIndex = null,
    sheetUrl = null,
    sheetName = null,
    tabName = null,
    userMessage = "",
    sessionSheetContext = null,
    enforceSelectedTabGate = false,
  }) {
    const allSheets = await this.listConnectedSpreadsheets(userId);

    // Check if user pasted a direct Google Sheets URL in the prompt or args
    const inlineUrlMatch = String(userMessage || "").match(/https?:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+[^\s"')>]*/i);
    const explicitUrl = sheetUrl || (inlineUrlMatch ? inlineUrlMatch[0] : null);

    let selectedSheet = null;
    const requestedOrdinal = sheetIndex || this.parseRequestedSheetOrdinal(userMessage);

    if (explicitUrl) {
      const targetId = sheetsService.extractSpreadsheetId(explicitUrl);
      selectedSheet = allSheets.find(
        (s) => s.sheetUrl === explicitUrl || (targetId && s.spreadsheetId === targetId)
      );
      if (!selectedSheet) {
        if (!targetId) {
          return {
            success: false,
            errorType: "INVALID_SPREADSHEET_ID",
            message: `Invalid Google Spreadsheet URL or ID: "${explicitUrl}".`,
          };
        }
        selectedSheet = {
          sheetIndex: null,
          sheetId: `direct_${targetId}`,
          spreadsheetId: targetId,
          sheetName: `Spreadsheet (${targetId.slice(0, 8)})`,
          sheetUrl: explicitUrl,
          provider: "Google Sheets",
          rows: [],
          columns: [],
          availableTabs: [],
          selectedTabIds: [],
          selectedTabsData: [],
        };
      }
    }

    if (!selectedSheet && requestedOrdinal !== null && requestedOrdinal !== undefined) {
      if (allSheets.length === 0) {
        return {
          success: false,
          errorType: "NO_CONNECTED_SHEETS",
          message: "No Google Sheets or Excel files are connected in AI Context → Data Warehouse.",
        };
      }
      if (requestedOrdinal < 1 || requestedOrdinal > allSheets.length) {
        const listDesc = allSheets
          .map((s) => `Sheet #${s.sheetIndex}: "${s.sheetName}"`)
          .join(", ");
        return {
          success: false,
          errorType: "SHEET_INDEX_OUT_OF_RANGE",
          message: `Requested Sheet #${requestedOrdinal}, but only ${allSheets.length} spreadsheet(s) are connected (${listDesc}).`,
          connectedSheets: allSheets.map((s) => ({
            sheetIndex: s.sheetIndex,
            sheetName: s.sheetName,
            spreadsheetId: s.spreadsheetId,
          })),
        };
      }
      selectedSheet = allSheets[requestedOrdinal - 1];
    }

    // Match by explicit sheetName if provided
    if (!selectedSheet && sheetName && allSheets.length > 0) {
      const cleanName = String(sheetName).toLowerCase().trim();
      selectedSheet =
        allSheets.find((s) => String(s.sheetName || "").toLowerCase().trim() === cleanName) ||
        allSheets.find((s) => String(s.sheetName || "").toLowerCase().includes(cleanName));
    }

    // Match by sheet title mentioned inside userMessage
    if (!selectedSheet && userMessage && allSheets.length > 1) {
      const msgLower = userMessage.toLowerCase();
      for (const s of allSheets) {
        const sLower = String(s.sheetName || "").toLowerCase().trim();
        if (sLower && sLower.length >= 4 && msgLower.includes(sLower)) {
          selectedSheet = s;
          break;
        }
      }
    }

    // Follow-up conversation context memory (e.g. "Now fetch creative codes for these videos")
    if (!selectedSheet && sessionSheetContext && allSheets.length > 0) {
      if (sessionSheetContext.spreadsheetId) {
        selectedSheet = allSheets.find((s) => s.spreadsheetId === sessionSheetContext.spreadsheetId);
      }
      if (!selectedSheet && sessionSheetContext.sheetIndex && sessionSheetContext.sheetIndex <= allSheets.length) {
        selectedSheet = allSheets[sessionSheetContext.sheetIndex - 1];
      }
    }

    if (!selectedSheet) {
      if (allSheets.length === 0) {
        return {
          success: false,
          errorType: "NO_CONNECTED_SHEETS",
          message: "No connected Google Sheet or Excel file was found in AI Context. Please connect a Google Sheet in the AI Context → Data Warehouse node.",
        };
      }
      selectedSheet = allSheets[0];
    }

    const effectiveUrl = selectedSheet.sheetUrl;
    let availableTabs = Array.isArray(selectedSheet.availableTabs) ? [...selectedSheet.availableTabs] : [];
    let discoveredSheetTitle = selectedSheet.sheetName;

    // Live discover tabs when URL is a Google Sheet
    if (effectiveUrl && /^https?:\/\//i.test(effectiveUrl)) {
      try {
        const tabMeta = await sheetsService.discoverWorksheetTabs({ spreadsheetIdOrUrl: effectiveUrl });
        if (Array.isArray(tabMeta?.tabs) && tabMeta.tabs.length > 0) {
          availableTabs = tabMeta.tabs;
        }
        if (tabMeta?.spreadsheetName && !tabMeta.spreadsheetName.startsWith("Google_Sheet_")) {
          discoveredSheetTitle = tabMeta.spreadsheetName;
        }
      } catch (discErr) {
        console.warn("[SheetInspectorService] Tab discovery warning:", discErr.message);
      }
    }

    const availableTabNames = availableTabs.map((t) => t.title || t.name || t.tabName).filter(Boolean);

    // Resolve target worksheet tab
    let resolvedTabName = tabName ? String(tabName).trim() : null;
    let explicitlyRequestedTab = Boolean(resolvedTabName);

    if (!resolvedTabName && userMessage) {
      const tabOrd = this.parseRequestedTabOrdinal(userMessage);
      if (tabOrd !== null) {
        explicitlyRequestedTab = true;
        if (availableTabNames.length > 0 && (tabOrd < 1 || tabOrd > availableTabNames.length)) {
          return {
            success: false,
            errorType: "MISSING_WORKSHEET_TAB",
            message: `Worksheet tab #${tabOrd} does not exist in "${discoveredSheetTitle}". Available tabs (${availableTabNames.length}): ${availableTabNames.join(", ")}.`,
            availableTabs: availableTabNames,
          };
        }
        if (availableTabNames[tabOrd - 1]) {
          resolvedTabName = availableTabNames[tabOrd - 1];
        }
      }
    }

    // Check if user mentioned an existing tab title by name, or explicitly named an unknown tab e.g. `tab "XYZ"`
    if (!resolvedTabName && userMessage) {
      for (const tName of availableTabNames) {
        const escaped = tName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?:$|[^a-zA-Z0-9])`, "i").test(userMessage)) {
          resolvedTabName = tName;
          explicitlyRequestedTab = true;
          break;
        }
      }
      if (!resolvedTabName) {
        const quotedTabMatch =
          userMessage.match(/\b(?:worksheet|tab)\s+(?:named\s+)?["']([^"']+)["']/i) ||
          userMessage.match(/["']([^"']+)["']\s+(?:worksheet|tab)\b/i);
        if (quotedTabMatch?.[1]) {
          resolvedTabName = quotedTabMatch[1].trim();
          explicitlyRequestedTab = true;
        }
      }
    }

    // Validate explicitly requested tab exists
    if (explicitlyRequestedTab && resolvedTabName && availableTabNames.length > 0) {
      const cleanReq = resolvedTabName.toLowerCase().trim();
      const matchedName =
        availableTabNames.find((t) => t.toLowerCase().trim() === cleanReq) ||
        availableTabNames.find((t) => t.toLowerCase().includes(cleanReq));
      if (!matchedName) {
        return {
          success: false,
          errorType: "MISSING_WORKSHEET_TAB",
          requestedTab: resolvedTabName,
          sheetName: discoveredSheetTitle,
          spreadsheetId: selectedSheet.spreadsheetId,
          availableTabs: availableTabNames,
          message: `Worksheet tab "${resolvedTabName}" was not found in spreadsheet "${discoveredSheetTitle}". Available worksheet tabs: ${availableTabNames.join(", ")}.`,
        };
      }
      resolvedTabName = matchedName;
    }

    // Otherwise use selected tab from AI Context -> or session memory tab -> or first tab
    const selectedTabsData = Array.isArray(selectedSheet.selectedTabsData) ? selectedSheet.selectedTabsData : [];
    const selectedTabIds = Array.isArray(selectedSheet.selectedTabIds) ? selectedSheet.selectedTabIds : [];

    if (!resolvedTabName) {
      if (selectedTabsData.length >= 1 && selectedTabsData[0]?.tabName) {
        resolvedTabName = selectedTabsData[0].tabName;
      } else if (selectedTabIds.length >= 1 && availableTabs.length > 0) {
        const firstSel = selectedTabIds[0];
        const selIdStr =
          typeof firstSel === "object" && firstSel !== null
            ? String(firstSel.sheetId ?? firstSel.id ?? "")
            : String(firstSel);
        const selTitleStr =
          typeof firstSel === "object" && firstSel !== null
            ? String(firstSel.title || firstSel.tabName || firstSel.name || "").toLowerCase()
            : String(firstSel).toLowerCase();
        const matchedSel = availableTabs.find(
          (t) =>
            (selIdStr && String(t.sheetId) === selIdStr) ||
            (selTitleStr && String(t.title || t.name || "").toLowerCase() === selTitleStr)
        );
        if (matchedSel) {
          resolvedTabName = matchedSel.title || matchedSel.name;
        }
      } else if (
        sessionSheetContext?.worksheetTab &&
        (!sessionSheetContext.spreadsheetId || sessionSheetContext.spreadsheetId === selectedSheet.spreadsheetId)
      ) {
        resolvedTabName = sessionSheetContext.worksheetTab;
      } else if (selectedSheet.worksheetName) {
        resolvedTabName = selectedSheet.worksheetName;
      } else if (availableTabNames.length > 0) {
        resolvedTabName = availableTabNames[0];
      }
    }

    if (enforceSelectedTabGate && explicitlyRequestedTab && selectedTabsData.length > 0 && resolvedTabName) {
      const allowed = selectedTabsData.some(
        (t) => String(t.tabName || "").toLowerCase().trim() === resolvedTabName.toLowerCase().trim()
      );
      if (!allowed) {
        return {
          success: false,
          errorType: "TAB_NOT_SELECTED_IN_CONTEXT",
          requestedTab: resolvedTabName,
          selectedTabs: selectedTabsData.map((t) => t.tabName),
          availableTabs: availableTabNames,
          message: `Worksheet tab "${resolvedTabName}" is currently unchecked/excluded in AI Context. Selected tab(s): ${selectedTabsData.map((t) => t.tabName).join(", ")}.`,
        };
      }
    }

    // Live read the resolved spreadsheet and worksheet tab
    let rows = selectedSheet.rows || [];
    let headers = selectedSheet.columns || (rows.length > 0 ? Object.keys(rows[0] || {}).filter((k) => !k.startsWith("_") && !/^col_\d+$/.test(k)) : []);
    let readSource = "cached_context";

    if (effectiveUrl && /^https?:\/\//i.test(effectiveUrl)) {
      try {
        const liveRead = await sheetsService.readSpreadsheet({
          spreadsheetIdOrUrl: effectiveUrl,
          sheetTitle: resolvedTabName || null,
        });

        if (liveRead?.requestedTabNotFound && explicitlyRequestedTab) {
          return {
            success: false,
            errorType: "MISSING_WORKSHEET_TAB",
            requestedTab: resolvedTabName,
            sheetName: liveRead.spreadsheetName || discoveredSheetTitle,
            spreadsheetId: liveRead.spreadsheetId || selectedSheet.spreadsheetId,
            availableTabs: liveRead.availableWorksheets || availableTabNames,
            message: `Worksheet tab "${resolvedTabName}" was not found in "${liveRead.spreadsheetName || discoveredSheetTitle}". Available tabs: ${(liveRead.availableWorksheets || availableTabNames).join(", ")}.`,
          };
        }

        if (liveRead) {
          rows = (liveRead.rows || []).filter((r) => r.isPopulated !== false && !r._isBlank);
          headers = liveRead.headers || headers;
          resolvedTabName = liveRead.sheetTitle || resolvedTabName || "Sheet1";
          if (liveRead.spreadsheetName && !liveRead.spreadsheetName.startsWith("Google_Sheet_")) {
            discoveredSheetTitle = liveRead.spreadsheetName;
          }
          if (Array.isArray(liveRead.availableWorksheets) && liveRead.availableWorksheets.length > 0 && availableTabNames.length === 0) {
            liveRead.availableWorksheets.forEach((w, idx) => availableTabs.push({ sheetId: idx, title: w, index: idx }));
          }
          readSource = liveRead.source || "live_google_sheets";
        }
      } catch (readErr) {
        if (!rows || rows.length === 0) {
          return {
            success: false,
            errorType: "SPREADSHEET_READ_FAILED",
            sheetName: discoveredSheetTitle,
            spreadsheetId: selectedSheet.spreadsheetId,
            sheetUrl: effectiveUrl,
            message: `Failed to read Google Spreadsheet "${discoveredSheetTitle}" (${selectedSheet.spreadsheetId || effectiveUrl}): ${readErr.message}`,
          };
        }
      }
    } else if (selectedTabsData.length > 0 && resolvedTabName) {
      const matchedTabObj = selectedTabsData.find(
        (t) => String(t.tabName || "").toLowerCase().trim() === resolvedTabName.toLowerCase().trim()
      );
      if (matchedTabObj) {
        rows = (matchedTabObj.rows || []).filter((r) => r.isPopulated !== false && !r._isBlank);
        headers = matchedTabObj.columns || headers;
      }
    }

    const schema = this.discoverSchema(headers, rows);

    return {
      success: true,
      readSource,
      sheetIndex: selectedSheet.sheetIndex || 1,
      totalConnectedSheets: allSheets.length,
      connectedSheets: allSheets.map((s) => ({
        sheetIndex: s.sheetIndex,
        sheetId: s.sheetId,
        spreadsheetId: s.spreadsheetId,
        sheetName: s.sheetName,
        sheetUrl: s.sheetUrl,
        selectedTabs: (s.selectedTabsData || []).map((t) => t.tabName),
      })),
      sheetId: selectedSheet.sheetId,
      spreadsheetId: selectedSheet.spreadsheetId,
      sheetName: discoveredSheetTitle || selectedSheet.sheetName,
      sheetUrl: effectiveUrl,
      worksheetTab: resolvedTabName || "Sheet1",
      availableTabs: availableTabs.map((t) => ({
        sheetId: t.sheetId,
        title: t.title || t.name || t.tabName,
      })),
      selectedTabsInContext: selectedTabsData.map((t) => t.tabName),
      headers,
      totalColumns: headers.length,
      totalRows: rows.length,
      rows,
      schema,
    };
  }

  /**
   * Dynamic spreadsheet schema & semantic column discovery.
   */
  static discoverSchema(headers = [], rows = []) {
    const semanticMap = {
      creativeCode: findMatchingHeader(headers, SEMANTIC_COLUMN_PATTERNS.creativeCode),
      mediaType: findMatchingHeader(headers, SEMANTIC_COLUMN_PATTERNS.mediaType),
      creativeFormat: findMatchingHeader(headers, SEMANTIC_COLUMN_PATTERNS.creativeFormat),
      creativeName: findMatchingHeader(headers, SEMANTIC_COLUMN_PATTERNS.creativeName),
      creativeStatus: findMatchingHeader(headers, SEMANTIC_COLUMN_PATTERNS.creativeStatus),
      videoUrlColumns: findAllMatchingHeaders(headers, SEMANTIC_COLUMN_PATTERNS.videoUrl),
    };

    // Also inspect actual cell values to detect any other column containing Google Drive or .mp4/.mov URLs
    const valueDetectedVideoCols = [];
    for (const h of headers) {
      if (semanticMap.videoUrlColumns.includes(h)) continue;
      if (/landing|website|destination|display\s*link|page\s*id|pixel|app\s*id|url\s*param/i.test(h)) continue;
      const hasDriveOrVideo = rows.some((r) => {
        const v = String(r?.[h] || "");
        return /drive\.google\.com|\.(mp4|mov|webm|m4v)\b/i.test(v);
      });
      if (hasDriveOrVideo) {
        valueDetectedVideoCols.push(h);
      }
    }
    semanticMap.videoUrlColumns = [...semanticMap.videoUrlColumns, ...valueDetectedVideoCols];

    const columnStats = headers.map((h) => {
      let populatedCount = 0;
      let emptyCount = 0;
      rows.forEach((r) => {
        const val = r?.[h];
        if (val !== undefined && val !== null && String(val).trim() !== "") populatedCount++;
        else emptyCount++;
      });
      return {
        header: h,
        normalizedKey: normalizeHeader(h),
        populatedCount,
        emptyCount,
      };
    });

    return {
      semanticMap,
      columnStats,
    };
  }

  /**
   * Match arbitrary user-requested column/field names against actual worksheet headers.
   * Never fabricates missing columns — explicitly reports missingFields!
   */
  static matchRequestedFields(headers = [], requestedFields = []) {
    const matched = [];
    const missing = [];

    const synonymGroups = [
      { terms: ["video link", "video links", "video url", "video urls", "drive url", "drive link", "smart chip", "creative smart chips", "creative url"], patterns: SEMANTIC_COLUMN_PATTERNS.videoUrl },
      { terms: ["creative code", "creative codes", "ad code", "asset code"], patterns: SEMANTIC_COLUMN_PATTERNS.creativeCode },
      { terms: ["media type", "asset type"], patterns: SEMANTIC_COLUMN_PATTERNS.mediaType },
      { terms: ["creative format", "ad format", "format"], patterns: SEMANTIC_COLUMN_PATTERNS.creativeFormat },
      { terms: ["creative status", "status"], patterns: SEMANTIC_COLUMN_PATTERNS.creativeStatus },
      { terms: ["creative name", "ad name", "video name"], patterns: SEMANTIC_COLUMN_PATTERNS.creativeName },
      { terms: ["landing page", "destination url", "website url"], patterns: [/landing_?page/i, /destination_?url/i, /website_?url/i] },
      { terms: ["primary text", "ad copy", "body text", "caption"], patterns: [/^primary_?text/i, /^ad_?copy/i, /^caption/i] },
      { terms: ["headline", "headlines"], patterns: [/^headlines?$/i, /^ad_?headlines?$/i] },
      { terms: ["daily budget", "budget"], patterns: [/daily_?budget/i, /^budget$/i] },
    ];

    for (const rawReq of requestedFields) {
      const reqTrim = String(rawReq || "").trim();
      if (!reqTrim) continue;
      const reqNorm = normalizeHeader(reqTrim);

      // 1. Exact or normalized match
      let found = headers.find((h) => normalizeHeader(h) === reqNorm);

      // 2. Singular/plural exact match
      if (!found) {
        const reqSingular = reqNorm.replace(/s$/, "");
        found = headers.find((h) => normalizeHeader(h).replace(/s$/, "") === reqSingular);
      }

      // 3. Substring match ONLY when multi-word or exact token match
      if (!found && reqNorm.length >= 4) {
        found = headers.find((h) => {
          const hNorm = normalizeHeader(h);
          const hTokens = hNorm.split("_");
          const rTokens = reqNorm.split("_");
          return rTokens.every((rt) => hTokens.some((ht) => ht === rt || ht.replace(/s$/, "") === rt.replace(/s$/, "")));
        });
      }

      // 4. Semantic synonym match ONLY if a matching header actually exists in this sheet
      if (!found) {
        const reqSpace = reqNorm.replace(/_/g, " ");
        const syn = synonymGroups.find((g) => g.terms.some((t) => t === reqSpace));
        if (syn) {
          found = findMatchingHeader(headers, syn.patterns);
        }
      }

      if (found) {
        if (!matched.some((m) => m.actualHeader === found)) {
          matched.push({ requested: reqTrim, actualHeader: found });
        }
      } else {
        missing.push(reqTrim);
      }
    }

    return { matched, missing };
  }

  /**
   * Extract and validate video links from resolved sheet data.
   * Preserves complete URLs, splits multiple URLs per cell into separate entries,
   * and maps Creative Code / Media Type / Creative Name / Validation accurately.
   */
  static async extractVideoLinks(sheetResult, { validateUrls = true } = {}) {
    if (!sheetResult?.success) {
      return sheetResult;
    }

    const { headers = [], rows = [], schema } = sheetResult;
    const sem = schema?.semanticMap || this.discoverSchema(headers, rows).semanticMap;

    const mediaTypeCol = sem.mediaType;
    const creativeFormatCol = sem.creativeFormat;
    const creativeCodeCol = sem.creativeCode;
    const creativeNameCol = sem.creativeName;
    const creativeStatusCol = sem.creativeStatus;
    const videoCols = sem.videoUrlColumns || [];

    const entries = [];
    let skippedNonVideoRows = 0;

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const rowNumber = r._originalRowNumber || idx + 2;
      const mediaTypeVal = mediaTypeCol ? String(r[mediaTypeCol] || "").trim() : "";
      const formatVal = creativeFormatCol ? String(r[creativeFormatCol] || "").trim() : "";
      const creativeCodeVal = creativeCodeCol ? String(r[creativeCodeCol] || "").trim() : null;
      const creativeStatusVal = creativeStatusCol ? String(r[creativeStatusCol] || "").trim() : null;

      // Check whether Media Type indicates Video (when Media Type column exists and is populated)
      if (mediaTypeCol && mediaTypeVal) {
        const isVideoMedia = /\b(video|reel|mp4|mov|short|animation|audiostory)\b/i.test(mediaTypeVal);
        if (!isVideoMedia) {
          skippedNonVideoRows++;
          continue;
        }
      }

      // Gather all candidate URLs (and non-URL Smart Chip labels if URL missing) across video columns
      const extractedUrlsForRow = [];
      let smartChipLabel = null;

      for (const col of videoCols) {
        const cellLabel = r._cellLabels?.[col] || "";
        if (cellLabel && !/^https?:\/\//i.test(cellLabel) && !smartChipLabel) {
          smartChipLabel = cellLabel;
        }

        const cellUrlsArr = Array.isArray(r._cellUrls?.[col]) ? r._cellUrls[col] : [];
        const rawCellStr = String(r[col] || "").trim();

        const rawCandidates = [];
        if (cellUrlsArr.length > 0) {
          rawCandidates.push(...cellUrlsArr);
        }
        if (rawCellStr) {
          const urlMatches = rawCellStr.match(/https?:\/\/[^\s"',;<>\\]+/gi);
          if (urlMatches && urlMatches.length > 0) {
            rawCandidates.push(...urlMatches);
          } else if (cellUrlsArr.length === 0) {
            // Non-URL text in video column (e.g. unlinked filename)
            if (!smartChipLabel) smartChipLabel = rawCellStr;
          }
        }

        for (const cand of rawCandidates) {
          const trimmed = cand.trim();
          if (trimmed && !extractedUrlsForRow.some((u) => u.url === trimmed)) {
            extractedUrlsForRow.push({ url: trimmed, sourceColumn: col, label: cellLabel || null });
          }
        }
      }

      // If no explicit video column existed, scan row for any Drive / .mp4 URL
      if (videoCols.length === 0) {
        for (const h of headers) {
          if (/landing|website|destination|display\s*link|url\s*param/i.test(h)) continue;
          const v = String(r[h] || "").trim();
          const matches = v.match(/https?:\/\/[^\s"',;<>\\]+/gi) || [];
          for (const m of matches) {
            if (/drive\.google\.com|\.(mp4|mov|webm|m4v)\b/i.test(m)) {
              if (!extractedUrlsForRow.some((u) => u.url === m)) {
                extractedUrlsForRow.push({ url: m, sourceColumn: h, label: r._cellLabels?.[h] || null });
              }
            }
          }
        }
      }

      const explicitCreativeName = creativeNameCol ? String(r[creativeNameCol] || "").trim() : "";
      const resolvedCreativeName = explicitCreativeName || smartChipLabel || null;
      const hasCreativeName = Boolean(creativeNameCol || smartChipLabel);

      if (extractedUrlsForRow.length === 0) {
        // If Media Type explicitly says Video, report this row with Missing/Unlinked Video URL
        if (mediaTypeCol && /\bvideo\b/i.test(mediaTypeVal)) {
          entries.push({
            rowNumber,
            ...(creativeCodeCol ? { creativeCode: creativeCodeVal || "—" } : {}),
            ...(mediaTypeCol ? { mediaType: mediaTypeVal } : {}),
            ...(creativeFormatCol && !mediaTypeCol ? { creativeFormat: formatVal } : {}),
            ...(hasCreativeName ? { creativeName: resolvedCreativeName || "—" } : {}),
            ...(creativeStatusCol ? { creativeStatus: creativeStatusVal || "—" } : {}),
            videoUrl: null,
            sourceColumn: videoCols[0] || null,
            sourceType: "MISSING",
            accessible: false,
            validation: smartChipLabel
              ? `No URL hyperlink embedded (text only: "${smartChipLabel}")`
              : "Missing Video URL",
          });
        }
        continue;
      }

      for (const item of extractedUrlsForRow) {
        const valRes = validateUrls
          ? await validateVideoUrlAccessibility(item.url)
          : { ...classifyMediaUrl(item.url), accessible: null, validationSummary: "Format checked (not probed)" };

        const entryCreativeName =
          explicitCreativeName ||
          item.label ||
          valRes.fileName ||
          smartChipLabel ||
          null;

        entries.push({
          rowNumber,
          ...(creativeCodeCol ? { creativeCode: creativeCodeVal || "—" } : {}),
          ...(mediaTypeCol ? { mediaType: mediaTypeVal || "Video" } : {}),
          ...(creativeFormatCol ? { creativeFormat: formatVal || null } : {}),
          ...((creativeNameCol || entryCreativeName) ? { creativeName: entryCreativeName || "—" } : {}),
          ...(creativeStatusCol ? { creativeStatus: creativeStatusVal || "—" } : {}),
          videoUrl: item.url,
          sourceColumn: item.sourceColumn,
          sourceType: valRes.sourceType,
          driveFileId: valRes.fileId || null,
          driveFolderId: valRes.folderId || null,
          accessible: valRes.accessible,
          validation: valRes.validationSummary,
        });
      }
    }

    const existingTableFields = ["Row"];
    if (creativeCodeCol) existingTableFields.push("Creative Code");
    if (mediaTypeCol) existingTableFields.push("Media Type");
    if (creativeNameCol || entries.some((e) => e.creativeName)) existingTableFields.push("Creative Name");
    existingTableFields.push("Video URL", "Validation");

    return {
      success: true,
      sheetIndex: sheetResult.sheetIndex,
      totalConnectedSheets: sheetResult.totalConnectedSheets,
      sheetId: sheetResult.sheetId,
      spreadsheetId: sheetResult.spreadsheetId,
      sheetName: sheetResult.sheetName,
      sheetUrl: sheetResult.sheetUrl,
      worksheetTab: sheetResult.worksheetTab,
      availableTabs: sheetResult.availableTabs,
      totalRowsInWorksheet: rows.length,
      skippedNonVideoRows,
      totalVideoEntries: entries.length,
      allRecordsExtracted: true,
      detectedColumns: {
        creativeCodeColumn: creativeCodeCol || null,
        mediaTypeColumn: mediaTypeCol || null,
        creativeFormatColumn: creativeFormatCol || null,
        creativeNameColumn: creativeNameCol || (entries.some((e) => e.creativeName) ? `${videoCols[0] || "Creative Smart Chips"} (Display Label)` : null),
        creativeStatusColumn: creativeStatusCol || null,
        videoUrlColumns: videoCols,
      },
      existingTableFields,
      entries,
    };
  }

  /**
   * Update specific cell(s) or column value in a connected Google Sheet with real write + read-back verification.
   */
  static async updateSheetCells({
    userId,
    sheetIndex = null,
    sheetUrl = null,
    tabName = null,
    rowNumber = null,
    columnName = null,
    cellRange = null,
    newValue = undefined,
    updates = null,
    userMessage = "",
    sessionSheetContext = null,
  }) {
    const resolved = await this.resolveAndReadSheet({
      userId,
      sheetIndex,
      sheetUrl,
      tabName,
      userMessage,
      sessionSheetContext,
    });
    if (!resolved.success) return resolved;

    if (!resolved.sheetUrl || !/^https?:\/\//i.test(resolved.sheetUrl)) {
      return {
        success: false,
        errorType: "UNSUPPORTED_WRITE_SOURCE",
        message: `Spreadsheet "${resolved.sheetName}" is a static file upload without a live Google Sheets URL, so live cell updates cannot be written via Google Sheets API.`,
      };
    }

    const batchItems = [];

    if (Array.isArray(updates) && updates.length > 0) {
      for (const u of updates) {
        if (u.range && u.values) {
          batchItems.push({ range: u.range, values: u.values });
        } else if (u.rowNumber && u.columnName && u.value !== undefined) {
          const colIdx = resolved.headers.findIndex(
            (h) => normalizeHeader(h) === normalizeHeader(u.columnName)
          );
          if (colIdx === -1) {
            return {
              success: false,
              errorType: "MISSING_COLUMN",
              message: `Column "${u.columnName}" was not found in "${resolved.sheetName}" (${resolved.worksheetTab}). Available columns: ${resolved.headers.join(", ")}.`,
            };
          }
          const colLetter = sheetsService.colIndexToA1(colIdx);
          batchItems.push({
            range: `${colLetter}${u.rowNumber}`,
            values: [[String(u.value)]],
          });
        }
      }
    } else if (cellRange && newValue !== undefined) {
      batchItems.push({
        range: cellRange,
        values: Array.isArray(newValue) ? newValue : [[String(newValue)]],
      });
    } else if (rowNumber && columnName && newValue !== undefined) {
      const colIdx = resolved.headers.findIndex(
        (h) => normalizeHeader(h) === normalizeHeader(columnName)
      );
      if (colIdx === -1) {
        return {
          success: false,
          errorType: "MISSING_COLUMN",
          message: `Column "${columnName}" was not found in "${resolved.sheetName}" (${resolved.worksheetTab}). Available columns: ${resolved.headers.join(", ")}.`,
        };
      }
      const colLetter = sheetsService.colIndexToA1(colIdx);
      batchItems.push({
        range: `${colLetter}${rowNumber}`,
        values: [[String(newValue)]],
      });
    } else {
      return {
        success: false,
        errorType: "MISSING_UPDATE_PARAMETERS",
        message: "Please specify the exact cell range (e.g. C2) or row number + column name + new value to update in the spreadsheet.",
      };
    }

    try {
      const writeRes = await sheetsService.batchUpdateValues({
        spreadsheetIdOrUrl: resolved.sheetUrl,
        sheetTitle: resolved.worksheetTab,
        data: batchItems,
      });

      const verifyRanges = batchItems.map((b) =>
        b.range.includes("!") ? b.range : `'${resolved.worksheetTab}'!${b.range}`
      );
      const readBack = await sheetsService.batchGetValues({
        spreadsheetIdOrUrl: resolved.sheetUrl,
        ranges: verifyRanges,
      });

      return {
        success: true,
        sheetIndex: resolved.sheetIndex,
        sheetName: resolved.sheetName,
        spreadsheetId: resolved.spreadsheetId,
        worksheetTab: resolved.worksheetTab,
        updatedCells: writeRes.updatedCells,
        updatesApplied: batchItems,
        verifiedValues: readBack,
      };
    } catch (err) {
      return {
        success: false,
        errorType: "GOOGLE_SHEETS_WRITE_ERROR",
        sheetName: resolved.sheetName,
        worksheetTab: resolved.worksheetTab,
        message: `Failed to update Google Sheet "${resolved.sheetName}" (${resolved.worksheetTab}): ${err.response?.data?.error?.message || err.message}`,
      };
    }
  }
}

export default SheetInspectorService;
