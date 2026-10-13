import crypto from "crypto";
import AiContext from "../../models/aiContextModel.js";
import sheetsService from "../../google/sheetsService.js";
import { getIo } from "../../socket/index.js";

/**
 * SpreadsheetSyncService
 *
 * Provides reliable, stateful synchronization between Google Sheets and the AI Ads app:
 * 1. Automatically detects new rows (appended or newly populated blank rows).
 * 2. Detects cell modifications on existing rows (Primary text, Headline, Media Link, Page ID, etc.).
 * 3. Uses stable composite identities to track rows across row insertions/deletions.
 * 4. STRICT SEPARATION: Syncing imports/refreshes row data and NEVER creates or publishes ads automatically.
 * 5. Preserves physical 1-indexed Google Sheets row numbers and row-range isolation.
 * 6. Manages background polling with concurrency guards and real-time Socket.IO broadcasts.
 */
export class SpreadsheetSyncService {
  // In-memory concurrency locks to prevent overlapping sync executions
  static activeSyncs = new Set();
  static pollingTimer = null;
  static pollingIntervalMs = 60 * 1000; // 60 seconds default polling interval

  /**
   * Deterministically calculates a stable unique key for a spreadsheet row.
   * Uses explicit unique IDs if present, otherwise computes a semantic composite hash.
   */
  static computeRowStableKey(row = {}, headers = []) {
    if (!row || typeof row !== "object") {
      return `empty_${Math.random().toString(36).substring(2, 9)}`;
    }

    if (row._isBlank || (!row.isPopulated && Object.keys(row).length <= 3)) {
      return `blank_row_${row._originalRowNumber || "unknown"}`;
    }

    const normKeys = Object.keys(row);

    // 1. Check for explicit unique identifier column
    const idKeyAliases = [
      "creative_id", "creativeid", "ad_id", "adid", "id", "row_id", "rowid",
      "creative_code", "creativecode", "code", "sku", "identifier"
    ];

    for (const alias of idKeyAliases) {
      const match = normKeys.find(
        (k) => k.toLowerCase() === alias || k.toLowerCase().replace(/[\s_]+/g, "") === alias
      );
      if (match && row[match] !== undefined && String(row[match]).trim() !== "") {
        return `explicit_${String(row[match]).trim()}`;
      }
    }

    // 2. Build semantic composite signature from core business creative attributes
    const compositeAliases = [
      "headline", "headlines", "headline_1",
      "primary_text", "primarytext", "body", "copy",
      "landing_page", "landing_page_url", "link", "url", "destination_url", "website_url",
      "media_url", "creative_url", "drive_link", "image_url", "video_url",
      "campaign_name", "campaign", "adset_name", "ad_set_name"
    ];

    const tokens = [];
    compositeAliases.forEach((alias) => {
      const match = normKeys.find(
        (k) => k.toLowerCase() === alias || k.toLowerCase().replace(/[\s_]+/g, "") === alias
      );
      if (match && row[match] !== undefined && row[match] !== null) {
        const val = String(row[match]).trim();
        if (val) {
          tokens.push(`${alias}:${val.toLowerCase()}`);
        }
      }
    });

    if (tokens.length > 0) {
      const hash = crypto.createHash("sha256").update(tokens.join("|")).digest("hex").substring(0, 20);
      return `composite_${hash}`;
    }

    // 3. Fallback: hash of all non-empty cell values
    const nonMetaValues = [];
    normKeys.sort().forEach((k) => {
      if (!k.startsWith("_") && !k.startsWith("col_") && k !== "isPopulated" && row[k]) {
        nonMetaValues.push(`${k}:${String(row[k]).trim().toLowerCase()}`);
      }
    });

    if (nonMetaValues.length > 0) {
      const hash = crypto.createHash("sha256").update(nonMetaValues.join("|")).digest("hex").substring(0, 20);
      return `values_${hash}`;
    }

    return `row_pos_${row._originalRowNumber || "0"}`;
  }

  /**
   * Computes a SHA-256 content hash of all current cell values in a row to detect modifications.
   */
  static computeContentHash(row = {}) {
    if (!row || typeof row !== "object") return "";
    const cleanEntries = [];
    Object.keys(row)
      .sort()
      .forEach((k) => {
        if (!k.startsWith("_") && !k.startsWith("col_") && k !== "isPopulated") {
          cleanEntries.push(`${k}:${String(row[k] ?? "").trim()}`);
        }
      });
    return crypto.createHash("sha256").update(cleanEntries.join("||")).digest("hex");
  }

  /**
   * Evaluates minimum required fields for Meta Ad creation
   */
  static evaluateRowAdEligibility(row = {}, headers = []) {
    const normKeys = Object.keys(row);
    const errors = [];

    // 1. Landing Page URL check
    const lpAliases = [
      "landing_page_web_app", "landingpagewebapp", "landing_page", "landingpage",
      "landing_page_url", "destination_url", "url", "link", "website"
    ];
    let landingPage = "";
    for (const alias of lpAliases) {
      const match = normKeys.find(
        (k) => k.toLowerCase() === alias || k.toLowerCase().replace(/[^a-z0-9]+/g, "") === alias
      );
      if (match && row[match] && String(row[match]).trim() !== "") {
        landingPage = String(row[match]).trim();
        break;
      }
    }

    if (!landingPage) {
      errors.push("Missing Landing Page URL");
    } else if (!landingPage.startsWith("http://") && !landingPage.startsWith("https://")) {
      errors.push("Landing Page URL must start with http:// or https://");
    }

    // 2. Ad Copy check (at least one of Headline or Primary Text)
    const hlAliases = ["headline", "headlines", "headline_1", "title", "header"];
    let headline = "";
    for (const alias of hlAliases) {
      const match = normKeys.find(
        (k) => k.toLowerCase() === alias || k.toLowerCase().replace(/[^a-z0-9]+/g, "") === alias
      );
      if (match && row[match] && String(row[match]).trim() !== "") {
        headline = String(row[match]).trim();
        break;
      }
    }

    const ptAliases = ["primary_text", "primarytext", "text", "body", "copy", "main_text"];
    let primaryText = "";
    for (const alias of ptAliases) {
      const match = normKeys.find(
        (k) => k.toLowerCase() === alias || k.toLowerCase().replace(/[^a-z0-9]+/g, "") === alias
      );
      if (match && row[match] && String(row[match]).trim() !== "") {
        primaryText = String(row[match]).trim();
        break;
      }
    }

    if (!headline && !primaryText) {
      errors.push("Both Headline and Primary Text are missing");
    }

    return {
      isEligible: errors.length === 0,
      errors,
    };
  }

  /**
   * Compares freshly read rows from Google Sheets against previously tracked rows.
   * Categorizes rows into NEW, UPDATED, UNCHANGED, and tracks row number shifts.
   */
  static diffSpreadsheetRows(previousTrackedRows = [], freshRows = [], headers = []) {
    const prevMap = new Map();
    (previousTrackedRows || []).forEach((r) => {
      if (r && r.stableKey) {
        prevMap.set(r.stableKey, r);
      }
    });

    const diffResults = {
      newRowsCount: 0,
      updatedRowsCount: 0,
      unchangedRowsCount: 0,
      blankRowsCount: 0,
      validationErrorRowsCount: 0,
      eligibleAdRowsCount: 0,
      trackedRows: [],
      newRowNumbers: [],
      updatedRowNumbers: [],
      validationErrorRowNumbers: [],
      eligibleAdRowNumbers: [],
      blankRowNumbers: [],
      totalDataRows: 0,
      totalSheetRows: 0,
      lastRowNumber: 1,
      headerRowNumber: 1,
    };

    let maxPhysicalRowNumber = 1;

    freshRows.forEach((row, idx) => {
      const originalRowNumber = row._originalRowNumber || idx + 2;
      maxPhysicalRowNumber = Math.max(maxPhysicalRowNumber, originalRowNumber);
      const isBlank = Boolean(row._isBlank || !row.isPopulated);

      if (isBlank) {
        diffResults.blankRowsCount++;
        diffResults.blankRowNumbers.push(originalRowNumber);
        diffResults.trackedRows.push({
          stableKey: `blank_${originalRowNumber}`,
          originalRowNumber,
          contentHash: "",
          status: "SKIPPED_BLANK",
          isNew: false,
          isUpdated: false,
          isEligibleForAd: false,
          validationErrors: ["Row is blank"],
          adCreated: false,
          lastDetectedAt: new Date().toISOString(),
        });
        return;
      }

      diffResults.totalDataRows++;

      // Check ad eligibility vs validation errors
      const eligibility = this.evaluateRowAdEligibility(row, headers);
      if (eligibility.isEligible) {
        diffResults.eligibleAdRowsCount++;
        diffResults.eligibleAdRowNumbers.push(originalRowNumber);
      } else {
        diffResults.validationErrorRowsCount++;
        diffResults.validationErrorRowNumbers.push(originalRowNumber);
      }

      const stableKey = this.computeRowStableKey(row, headers);
      const contentHash = this.computeContentHash(row);
      const prev = prevMap.get(stableKey);

      if (!prev) {
        // Brand new row detected (or previously blank row now has content)
        diffResults.newRowsCount++;
        diffResults.newRowNumbers.push(originalRowNumber);

        diffResults.trackedRows.push({
          stableKey,
          originalRowNumber,
          contentHash,
          status: "NEW",
          isNew: true,
          isUpdated: false,
          isEligibleForAd: eligibility.isEligible,
          validationErrors: eligibility.errors,
          adCreated: false, // SYNC DOES NOT CREATE ADS
          metaAdId: null,
          metaCampaignId: null,
          metaAdSetId: null,
          firstDetectedAt: new Date().toISOString(),
          lastDetectedAt: new Date().toISOString(),
          changedFields: [],
        });
      } else if (prev.contentHash !== contentHash) {
        // Existing row was modified in Google Sheets
        diffResults.updatedRowsCount++;
        diffResults.updatedRowNumbers.push(originalRowNumber);

        // Detect which specific fields changed
        const changedFields = [];
        const prevValues = prev.cachedValues || {};
        headers.forEach((h) => {
          const oldVal = String(prevValues[h] || "").trim();
          const newVal = String(row[h] || "").trim();
          if (oldVal !== newVal) {
            changedFields.push(h);
          }
        });

        // If an ad was already published for this row, mark as UPDATED_NEEDS_REVIEW
        const status = prev.adCreated ? "UPDATED_NEEDS_REVIEW" : "UPDATED";

        diffResults.trackedRows.push({
          stableKey,
          originalRowNumber,
          contentHash,
          status,
          isNew: false,
          isUpdated: true,
          isEligibleForAd: eligibility.isEligible,
          validationErrors: eligibility.errors,
          adCreated: Boolean(prev.adCreated), // Preserves adCreated flag - DO NOT DUPLICATE AD
          metaAdId: prev.metaAdId || null,
          metaCampaignId: prev.metaCampaignId || null,
          metaAdSetId: prev.metaAdSetId || null,
          firstDetectedAt: prev.firstDetectedAt || new Date().toISOString(),
          lastDetectedAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
          changedFields,
          previousRowNumber: prev.originalRowNumber,
          rowNumberShifted: prev.originalRowNumber !== originalRowNumber,
        });
      } else {
        // Unchanged row (may have shifted row numbers due to row insertion/deletion above)
        diffResults.unchangedRowsCount++;

        diffResults.trackedRows.push({
          stableKey,
          originalRowNumber,
          contentHash,
          status: prev.status || "SYNCED",
          isNew: false,
          isUpdated: false,
          isEligibleForAd: eligibility.isEligible,
          validationErrors: eligibility.errors,
          adCreated: Boolean(prev.adCreated),
          metaAdId: prev.metaAdId || null,
          metaCampaignId: prev.metaCampaignId || null,
          metaAdSetId: prev.metaAdSetId || null,
          firstDetectedAt: prev.firstDetectedAt || new Date().toISOString(),
          lastDetectedAt: new Date().toISOString(),
          changedFields: [],
          previousRowNumber: prev.originalRowNumber,
          rowNumberShifted: prev.originalRowNumber !== originalRowNumber,
        });
      }
    });

    diffResults.lastRowNumber = maxPhysicalRowNumber;
    diffResults.headerRowNumber = 1;
    // Total rows containing data in sheet = header row + populated data rows
    diffResults.totalSheetRows = maxPhysicalRowNumber;

    return diffResults;
  }

  /**
   * Main synchronization execution for a specific user and their connected Google Sheet.
   */
  static async syncSpreadsheet({
    userId,
    sheetUrlOrId = null,
    worksheetName = null,
    trigger = "manual",
  } = {}) {
    const lockKey = String(userId || "system");
    if (this.activeSyncs.has(lockKey)) {
      return {
        success: false,
        syncStatus: "SYNCING",
        message: "A synchronization job is already running for this spreadsheet. Please wait a moment.",
        inProgress: true,
      };
    }

    this.activeSyncs.add(lockKey);

    try {
      // 1. Fetch current AI Context for user
      const context = await AiContext.findOne({ userId });
      if (!context) {
        throw new Error("No AI Context workspace found for user.");
      }

      // Find warehouse node
      const warehouseNode = (context.nodes || []).find((n) => n.type === "data_warehouse");
      if (!warehouseNode) {
        throw new Error("No Data Warehouse / Spreadsheet connection found in AI Context.");
      }

      const targetUrl = sheetUrlOrId || warehouseNode.data?.sheetUrl;
      if (!targetUrl || typeof targetUrl !== "string" || !targetUrl.trim()) {
        throw new Error("No Google Sheet URL is connected. Please connect a spreadsheet first.");
      }

      const targetSheetTitle = worksheetName || warehouseNode.data?.worksheetName || null;

      // 2. Read live spreadsheet directly from Google Sheets API
      const liveRead = await sheetsService.readSpreadsheet({
        spreadsheetIdOrUrl: targetUrl,
        sheetTitle: targetSheetTitle,
      });

      if (!liveRead || !liveRead.rows) {
        throw new Error("Failed to read data from Google Sheet. Please check spreadsheet permissions.");
      }

      const freshRows = liveRead.rows || [];
      const headers = liveRead.headers || [];
      const effectiveWorksheetName = liveRead.sheetTitle || targetSheetTitle || "Sheet1";
      const spreadsheetName = liveRead.spreadsheetName || warehouseNode.data?.workbookName || "Google Spreadsheet";

      // 3. Diff freshly read rows with previously stored tracked rows
      const previousTracked = warehouseNode.data?.sheetMetadata?.trackedRows || [];
      const diff = this.diffSpreadsheetRows(previousTracked, freshRows, headers);

      // Attach raw cell values snapshot to tracked rows for next diff comparison
      diff.trackedRows.forEach((tr, i) => {
        if (freshRows[i]) {
          tr.cachedValues = { ...freshRows[i] };
        }
      });

      const headerRowNumber = liveRead.headerRowNumber || diff.headerRowNumber || 1;
      const lastRowNumber = liveRead.lastRowNumber || diff.lastRowNumber || (freshRows.length > 0 ? (freshRows[freshRows.length - 1]._originalRowNumber || freshRows.length + 1) : 1);
      const totalSheetRows = liveRead.totalSheetRows || diff.totalSheetRows || (freshRows.length + 1);
      const totalDataRows = liveRead.totalDataRows || diff.totalDataRows || freshRows.filter((r) => !r._isBlank && r.isPopulated !== false).length;

      // 4. Update MongoDB AiContext node with fresh values and sync stats
      const now = new Date();
      warehouseNode.data = {
        ...warehouseNode.data,
        sheetUrl: targetUrl,
        workbookName: spreadsheetName,
        worksheetName: effectiveWorksheetName,
        availableWorksheets: liveRead.availableWorksheets || [effectiveWorksheetName],
        excelSyncStatus: "SYNCED",
        lastSyncedAt: now,
        totalRows: freshRows.length,
        totalDataRows,
        totalSheetRows,
        lastRowNumber,
        headerRowNumber,
        dataRowStart: headerRowNumber + 1,
        eligibleAdRowsCount: diff.eligibleAdRowsCount,
        validationErrorRowsCount: diff.validationErrorRowsCount,
        readyRowsCount: diff.eligibleAdRowsCount,
        correctionRequiredRowsCount: diff.validationErrorRowsCount,
        sheetColumns: headers,
        sheetRows: freshRows.map((r) => {
          const val = { ...r };
          return val;
        }),
        sheetMetadata: {
          ...(warehouseNode.data?.sheetMetadata || {}),
          trackedRows: diff.trackedRows,
          lastSyncDiff: {
            totalSheetRows,
            totalDataRows,
            lastRowNumber,
            headerRowNumber,
            eligibleAdRowsCount: diff.eligibleAdRowsCount,
            validationErrorRowsCount: diff.validationErrorRowsCount,
            newRowsCount: diff.newRowsCount,
            updatedRowsCount: diff.updatedRowsCount,
            unchangedRowsCount: diff.unchangedRowsCount,
            blankRowsCount: diff.blankRowsCount,
            newRowNumbers: diff.newRowNumbers,
            updatedRowNumbers: diff.updatedRowNumbers,
            validationErrorRowNumbers: diff.validationErrorRowNumbers,
            eligibleAdRowNumbers: diff.eligibleAdRowNumbers,
            blankRowNumbers: diff.blankRowNumbers,
            syncedAt: now.toISOString(),
            trigger,
          },
          lastSyncError: null,
        },
      };

      warehouseNode.subtitle = `🔗 ${spreadsheetName.slice(0, 30)} (${totalDataRows} data rows, through Row #${lastRowNumber})`;

      context.markModified("nodes");
      await context.save();

      // 5. Broadcast real-time Socket event to UI
      const io = getIo();
      if (io) {
        io.to(`user:${userId}`).emit("sheet:sync_status", {
          syncStatus: "SYNCED",
          spreadsheetName,
          worksheetName: effectiveWorksheetName,
          totalRows: freshRows.length,
          totalDataRows,
          totalSheetRows,
          lastRowNumber,
          headerRowNumber,
          eligibleAdRowsCount: diff.eligibleAdRowsCount,
          validationErrorRowsCount: diff.validationErrorRowsCount,
          newRowsCount: diff.newRowsCount,
          updatedRowsCount: diff.updatedRowsCount,
          blankRowsCount: diff.blankRowsCount,
          lastSyncedAt: now.toISOString(),
          newRowNumbers: diff.newRowNumbers,
          updatedRowNumbers: diff.updatedRowNumbers,
        });
      }

      console.log(`\n🔄 [SpreadsheetSyncService] Sync Successful for user ${userId}:`);
      console.log(`   - Spreadsheet: "${spreadsheetName}" (${effectiveWorksheetName})`);
      console.log(`   - Sheet rows through Row #${lastRowNumber} (${totalSheetRows} total with data)`);
      console.log(`   - Data rows: ${totalDataRows} (${diff.eligibleAdRowsCount} eligible, ${diff.validationErrorRowsCount} errors) | New: ${diff.newRowsCount} | Updated: ${diff.updatedRowsCount}`);

      return {
        success: true,
        syncStatus: "SYNCED",
        spreadsheetName,
        worksheetName: effectiveWorksheetName,
        availableWorksheets: liveRead.availableWorksheets || [effectiveWorksheetName],
        totalRows: freshRows.length,
        totalDataRows,
        totalSheetRows,
        lastRowNumber,
        headerRowNumber,
        dataRowStart: headerRowNumber + 1,
        eligibleAdRowsCount: diff.eligibleAdRowsCount,
        validationErrorRowsCount: diff.validationErrorRowsCount,
        readyRowsCount: diff.eligibleAdRowsCount,
        correctionRequiredRowsCount: diff.validationErrorRowsCount,
        newRowsCount: diff.newRowsCount,
        updatedRowsCount: diff.updatedRowsCount,
        unchangedRowsCount: diff.unchangedRowsCount,
        blankRowsCount: diff.blankRowsCount,
        newRowNumbers: diff.newRowNumbers,
        updatedRowNumbers: diff.updatedRowNumbers,
        validationErrorRowNumbers: diff.validationErrorRowNumbers,
        eligibleAdRowNumbers: diff.eligibleAdRowNumbers,
        blankRowNumbers: diff.blankRowNumbers,
        headers,
        lastSyncedAt: now.toISOString(),
        message: `Sync complete! Sheet data through Row #${lastRowNumber} (${totalSheetRows} total rows with data). Discovered ${totalDataRows} data rows (${diff.eligibleAdRowsCount} eligible for ads, ${diff.validationErrorRowsCount} require correction, ${diff.newRowsCount} new, ${diff.updatedRowsCount} updated).`,
      };
    } catch (err) {
      console.error("[SpreadsheetSyncService Error]:", err.message);

      // Persist failure status in AiContext so UI displays it
      try {
        if (userId) {
          const context = await AiContext.findOne({ userId });
          const warehouseNode = (context?.nodes || []).find((n) => n.type === "data_warehouse");
          if (warehouseNode) {
            warehouseNode.data.excelSyncStatus = "FAILED";
            warehouseNode.data.sheetMetadata = {
              ...(warehouseNode.data?.sheetMetadata || {}),
              lastSyncError: err.message,
            };
            context.markModified("nodes");
            await context.save();
          }

          const io = getIo();
          if (io) {
            io.to(`user:${userId}`).emit("sheet:sync_status", {
              syncStatus: "FAILED",
              error: err.message,
              lastSyncedAt: new Date().toISOString(),
            });
          }
        }
      } catch (dbErr) {
        // ignore secondary db error
      }

      return {
        success: false,
        syncStatus: "FAILED",
        error: err.message,
        message: `Sync failed: ${err.message}`,
      };
    } finally {
      this.activeSyncs.delete(lockKey);
    }
  }

  /**
   * Batches multiple ad creation outcomes into a single atomic database operation.
   */
  static async recordAdCreationBatch({ userId, updates = [] }) {
    if (!userId || !Array.isArray(updates) || updates.length === 0) return;

    try {
      const context = await AiContext.findOne({ userId });
      const warehouseNode = (context?.nodes || []).find((n) => n.type === "data_warehouse");
      if (!warehouseNode) return;

      const trackedRows = warehouseNode.data?.sheetMetadata?.trackedRows || [];
      let modified = false;

      for (const update of updates) {
        const { rowNumber, stableKey = null, metaAdId = null, metaCampaignId = null, metaAdSetId = null } = update;
        const match = trackedRows.find(
          (tr) => (stableKey && tr.stableKey === stableKey) || tr.originalRowNumber === rowNumber
        );

        if (match) {
          if (metaAdId) {
            match.adCreated = true;
            match.metaAdId = metaAdId;
            match.status = "AD_CREATED";
            match.adCreatedAt = new Date().toISOString();
            modified = true;
          }
          if (metaCampaignId && match.metaCampaignId !== metaCampaignId) {
            match.metaCampaignId = metaCampaignId;
            modified = true;
          }
          if (metaAdSetId && match.metaAdSetId !== metaAdSetId) {
            match.metaAdSetId = metaAdSetId;
            modified = true;
          }
        }
      }

      if (modified) {
        context.markModified("nodes");
        await context.save();
      }
    } catch (err) {
      console.warn("[SpreadsheetSyncService.recordAdCreationBatch Warning]:", err.message);
    }
  }

  /**
   * Records an ad creation outcome against a specific sheet row to prevent duplicate ads on future syncs/retries.
   */
  static async recordAdCreation({
    userId,
    rowNumber,
    stableKey = null,
    metaAdId = null,
    metaCampaignId = null,
    metaAdSetId = null,
  }) {
    if (!userId || !rowNumber) return;

    try {
      const context = await AiContext.findOne({ userId });
      const warehouseNode = (context?.nodes || []).find((n) => n.type === "data_warehouse");
      if (!warehouseNode) return;

      const trackedRows = warehouseNode.data?.sheetMetadata?.trackedRows || [];
      const match = trackedRows.find(
        (tr) => (stableKey && tr.stableKey === stableKey) || tr.originalRowNumber === rowNumber
      );

      if (match) {
        if (metaAdId) {
          match.adCreated = true;
          match.metaAdId = metaAdId;
          match.status = "AD_CREATED";
          match.adCreatedAt = new Date().toISOString();
        }
        if (metaCampaignId) match.metaCampaignId = metaCampaignId;
        if (metaAdSetId) match.metaAdSetId = metaAdSetId;

        context.markModified("nodes");
        await context.save();
      }
    } catch (err) {
      console.warn("[SpreadsheetSyncService.recordAdCreation Warning]:", err.message);
    }
  }

  /**
   * Retrieves all tracked rows for a user as an in-memory Map keyed by originalRowNumber and stableKey,
   * avoiding repeated single-row database queries during upload batches.
   */
  static async getTrackedRowsMap(userId) {
    const rowMap = new Map();
    if (!userId) return rowMap;
    try {
      const context = await AiContext.findOne({ userId }).lean();
      const warehouseNode = (context?.nodes || []).find((n) => n.type === "data_warehouse");
      const trackedRows = warehouseNode?.data?.sheetMetadata?.trackedRows || [];
      for (const tr of trackedRows) {
        if (tr.originalRowNumber) {
          rowMap.set(tr.originalRowNumber, tr);
        }
        if (tr.stableKey) {
          rowMap.set(tr.stableKey, tr);
        }
      }
    } catch (err) {
      console.warn("[SpreadsheetSyncService.getTrackedRowsMap Warning]:", err.message);
    }
    return rowMap;
  }

  /**
   * Retrieves a tracked row from AiContext for checking previously persisted Meta IDs.
   */
  static async getTrackedRow(userId, rowNumber, stableKey) {
    if (!userId || !rowNumber) return null;
    try {
      const context = await AiContext.findOne({ userId });
      if (!context) return null;
      const warehouseNode = (context?.nodes || []).find((n) => n.type === "data_warehouse");
      if (!warehouseNode) return null;
      const trackedRows = warehouseNode.data?.sheetMetadata?.trackedRows || [];
      return (
        trackedRows.find(
          (tr) => (stableKey && tr.stableKey === stableKey) || tr.originalRowNumber === rowNumber
        ) || null
      );
    } catch (err) {
      return null;
    }
  }

  /**
   * Starts automatic background synchronization polling.
   */
  static startPolling(intervalSeconds = 60) {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }

    this.pollingIntervalMs = Math.max(15, intervalSeconds) * 1000;
    console.log(`[SpreadsheetSyncService] 🕒 Background auto-sync polling started (Interval: ${intervalSeconds}s)...`);

    this.pollingTimer = setInterval(async () => {
      try {
        await this.runPollingCycle();
      } catch (err) {
        console.warn("[SpreadsheetSyncService Polling Cycle Warning]:", err.message);
      }
    }, this.pollingIntervalMs);
  }

  /**
   * Executes a single polling cycle across all connected spreadsheets.
   */
  static async runPollingCycle() {
    try {
      const contexts = await AiContext.find({
        "nodes.type": "data_warehouse",
        "nodes.data.sheetUrl": { $regex: /^https?:\/\//i },
      }).lean();

      for (const ctx of contexts) {
        const warehouseNode = (ctx.nodes || []).find(
          (n) => n.type === "data_warehouse" && n.data?.sheetUrl && n.data?.sheetUrl.startsWith("http")
        );

        if (warehouseNode && ctx.userId) {
          // Check if this sheet was synced recently (skip if synced in last 45 seconds)
          const lastSynced = warehouseNode.data?.lastSyncedAt
            ? new Date(warehouseNode.data.lastSyncedAt).getTime()
            : 0;
          if (Date.now() - lastSynced < 45000) {
            continue;
          }

          await this.syncSpreadsheet({
            userId: ctx.userId,
            sheetUrlOrId: warehouseNode.data.sheetUrl,
            worksheetName: warehouseNode.data.worksheetName,
            trigger: "polling",
          });
        }
      }
    } catch (err) {
      console.warn("[SpreadsheetSyncService runPollingCycle Warning]:", err.message);
    }
  }

  /**
   * Stops background polling cleanly.
   */
  static stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      console.log("[SpreadsheetSyncService] ⏹️ Background auto-sync polling stopped.");
    }
  }
}

export default SpreadsheetSyncService;
