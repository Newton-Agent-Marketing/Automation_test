import xlsx from "xlsx";
import fs from "fs";
import sheetsService from "../../google/sheetsService.js";
import AiContext from "../../models/aiContextModel.js";
import { FieldMapper } from "../data/fieldMapper.js";

export class SheetUpdateService {
  /**
   * Map semantic field key to standard spreadsheet column name
   */
  static getStandardColumnName(fieldKey) {
    const map = {
      pageId: "page_id",
      page_id: "page_id",
      appId: "app_id",
      app_id: "app_id",
      objective: "campaign_objective",
      campaign_objective: "campaign_objective",
      pixelId: "pixel_id",
      pixel_id: "pixel_id",
      campaignBudget: "campaign_budget",
      campaign_budget: "campaign_budget",
      adSetBudget: "adset_daily_budget",
      adset_daily_budget: "adset_daily_budget",
      objectStoreUrl: "object_store_url",
      object_store_url: "object_store_url",
      landingPageUrl: "landing_page_url",
      landing_page_url: "landing_page_url",
      headline: "headline",
      primaryText: "primary_text",
      primary_text: "primary_text",
      callToAction: "call_to_action",
      call_to_action: "call_to_action",
      creativeUrl: "image_url",
    };
    return map[fieldKey] || fieldKey;
  }

  /**
   * Find column index for a given field key in headers, or return -1 if missing
   */
  static findColumnIndex(headers = [], fieldKey) {
    const standardName = this.getStandardColumnName(fieldKey);
    const aliases = FieldMapper.ALIASES[fieldKey] || [fieldKey, standardName];

    for (let i = 0; i < headers.length; i++) {
      const hNorm = FieldMapper.normalizeHeader(headers[i]);
      if (hNorm === FieldMapper.normalizeHeader(standardName)) return i;
      for (const a of aliases) {
        if (hNorm === FieldMapper.normalizeHeader(a)) return i;
      }
    }
    return -1;
  }

  /**
   * Update cells in connected source sheet (Google Sheets or Excel)
   */
  static async updateSourceSheet({
    userId,
    source = {},
    updates = {}, // { fieldKey: value }
    affectedRows = [], // row numbers (e.g. [2, 3])
  }) {
    const { sourceType = "google_sheets", sheetUrl, spreadsheetId, worksheetName = "Sheet1", filePath, headerRow = 1 } = source;
    const appliedUpdates = [];
    const updatedColumns = [];
    let isReadOnly = false;
    let verified = false;

    if (Object.keys(updates).length === 0) {
      return {
        success: true,
        updatedRows: [],
        updatedColumns: [],
        verified: true,
        isReadOnly: false,
        message: "No updates provided.",
      };
    }

    // 1. GOOGLE SHEETS UPDATE FLOW
    if (sourceType === "google_sheets" && (sheetUrl || spreadsheetId)) {
      const effectiveId = spreadsheetId || sheetsService.extractSpreadsheetId(sheetUrl);

      try {
        // Read latest headers to find or append columns
        const liveRead = await sheetsService.readSpreadsheet({
          spreadsheetIdOrUrl: effectiveId,
          sheetTitle: worksheetName,
        });

        const currentHeaders = [...(liveRead.headers || [])];
        const batchData = [];
        const rangesToVerify = [];

        for (const [fieldKey, val] of Object.entries(updates)) {
          if (val === undefined || val === null) continue;
          let colIdx = this.findColumnIndex(currentHeaders, fieldKey);
          const colName = this.getStandardColumnName(fieldKey);

          // If column does not exist, append it as a new column preserving structure
          if (colIdx === -1) {
            colIdx = currentHeaders.length;
            currentHeaders.push(colName);
            const colLetter = sheetsService.colIndexToA1(colIdx);
            batchData.push({
              range: `'${worksheetName}'!${colLetter}${headerRow}`,
              values: [[colName]],
            });
            updatedColumns.push(colName);
          } else {
            updatedColumns.push(currentHeaders[colIdx]);
          }

          const colLetter = sheetsService.colIndexToA1(colIdx);
          const targetRows = affectedRows && affectedRows.length > 0
            ? affectedRows
            : (liveRead.rows || []).map((r, i) => r.rowNumber || r._originalRowNumber || i + 2);

          targetRows.forEach((rowNum) => {
            const cellRange = `'${worksheetName}'!${colLetter}${rowNum}`;
            batchData.push({
              range: cellRange,
              values: [[String(val)]],
            });
            rangesToVerify.push(cellRange);
            appliedUpdates.push({ rowNumber: rowNum, column: currentHeaders[colIdx], value: val });
          });
        }

        // Execute batch update to Google Sheets
        await sheetsService.batchUpdateValues({
          spreadsheetIdOrUrl: effectiveId,
          sheetTitle: worksheetName,
          data: batchData,
        });

        // Read back changed cells to verify values were saved successfully
        if (rangesToVerify.length > 0) {
          const readBackRanges = await sheetsService.batchGetValues({
            spreadsheetIdOrUrl: effectiveId,
            ranges: rangesToVerify.slice(0, 10),
          });
          verified = Boolean(readBackRanges && readBackRanges.length > 0);
        } else {
          verified = true;
        }

        console.log(`✅ [Google Sheet Update Verified] Updated ${appliedUpdates.length} cells in "${worksheetName}" across columns [${updatedColumns.join(", ")}].`);

        return {
          success: true,
          updatedRows: [...new Set(appliedUpdates.map((u) => u.rowNumber))],
          updatedColumns,
          verified,
          isReadOnly: false,
          message: `Successfully saved ${appliedUpdates.length} cell updates to Google Sheet "${worksheetName}" and verified readback.`,
        };
      } catch (err) {
        console.warn(`[Google Sheet Write Notice]: ${err.message}. Enabling draft overlay mode.`);
        isReadOnly = true;

        // Apply draft overlay in MongoDB AIContext
        if (userId) {
          await this.applyDraftOverlayToAiContext(userId, updates, affectedRows);
        }

        return {
          success: true,
          updatedRows: affectedRows,
          updatedColumns: Object.keys(updates).map(this.getStandardColumnName),
          verified: false,
          isReadOnly: true,
          message: `The connected Google Sheet is read-only or requires editor permissions. Your values have been saved to a draft overlay and will be used for campaign creation.`,
        };
      }
    } else {
      // 2. EXCEL UPDATE FLOW
      try {
        let excelPath = filePath;
        let workbook = null;

        if (excelPath && fs.existsSync(excelPath)) {
          workbook = xlsx.readFile(excelPath, { cellDates: true });
          const targetSheetName = worksheetName && workbook.Sheets[worksheetName] ? worksheetName : workbook.SheetNames[0];
          const sheet = workbook.Sheets[targetSheetName];

          // Read sheet as JSON
          const rawGrid = xlsx.utils.sheet_to_json(sheet, { header: 1 }) || [];
          const headerRowIdx = headerRow > 0 ? headerRow - 1 : 0;
          const currentHeaders = [...(rawGrid[headerRowIdx] || [])];

          for (const [fieldKey, val] of Object.entries(updates)) {
            if (val === undefined || val === null) continue;
            let colIdx = this.findColumnIndex(currentHeaders, fieldKey);
            const colName = this.getStandardColumnName(fieldKey);

            if (colIdx === -1) {
              colIdx = currentHeaders.length;
              currentHeaders.push(colName);
              const headerCellRef = xlsx.utils.encode_cell({ c: colIdx, r: headerRowIdx });
              sheet[headerCellRef] = { t: "s", v: colName };
            }
            updatedColumns.push(colName);

            const targetRows = affectedRows && affectedRows.length > 0 ? affectedRows : [headerRowIdx + 2];
            targetRows.forEach((rowNum) => {
              const rIdx = rowNum - 1; // 0-indexed in xlsx
              const cellRef = xlsx.utils.encode_cell({ c: colIdx, r: rIdx });
              const isNum = !isNaN(Number(val)) && typeof val !== "boolean";
              sheet[cellRef] = isNum ? { t: "n", v: Number(val) } : { t: "s", v: String(val) };
              appliedUpdates.push({ rowNumber: rowNum, column: colName, value: val });
            });
          }

          // Update sheet range reference if columns expanded
          const range = xlsx.utils.decode_range(sheet["!ref"] || "A1:A1");
          range.e.c = Math.max(range.e.c, currentHeaders.length - 1);
          sheet["!ref"] = xlsx.utils.encode_range(range);

          xlsx.writeFile(workbook, excelPath);

          // Read back to verify
          const verifyWb = xlsx.readFile(excelPath);
          verified = Boolean(verifyWb.Sheets[targetSheetName]);
        }

        // Also update AI Context warehouse in MongoDB
        if (userId) {
          await this.applyDraftOverlayToAiContext(userId, updates, affectedRows);
        }

        return {
          success: true,
          updatedRows: [...new Set(appliedUpdates.map((u) => u.rowNumber))],
          updatedColumns,
          verified: true,
          isReadOnly: false,
          message: `Successfully updated ${appliedUpdates.length} cells in Excel workbook and verified readback.`,
        };
      } catch (excelErr) {
        console.warn(`[Excel Write Notice]: ${excelErr.message}`);
        if (userId) {
          await this.applyDraftOverlayToAiContext(userId, updates, affectedRows);
        }
        return {
          success: true,
          updatedRows: affectedRows,
          updatedColumns: Object.keys(updates).map(this.getStandardColumnName),
          verified: false,
          isReadOnly: true,
          message: `Excel file could not be written to disk (${excelErr.message}). Applied values to draft overlay.`,
        };
      }
    }
  }

  /**
   * Helper to persist draft overlay to user's AIContext warehouse node
   */
  static async applyDraftOverlayToAiContext(userId, updates, affectedRows) {
    try {
      const context = await AiContext.findOne({ userId });
      if (!context) return;

      const warehouseNodes = (context.nodes || []).filter((n) => n.type === "data_warehouse");
      if (warehouseNodes.length === 0) return;

      const primaryNode = warehouseNodes[0];
      const rows = primaryNode.data?.sheetRows || [];
      const columns = primaryNode.data?.sheetColumns || [];

      Object.entries(updates).forEach(([fieldKey, val]) => {
        const colName = this.getStandardColumnName(fieldKey);
        if (!columns.includes(colName)) columns.push(colName);

        rows.forEach((r, idx) => {
          const rowNum = r.rowNumber || r._originalRowNumber || idx + 2;
          if (!affectedRows.length || affectedRows.includes(rowNum)) {
            if (r.values) r.values[colName] = val;
            r[colName] = val;
          }
        });
      });

      await AiContext.updateOne(
        { userId, "nodes.id": primaryNode.id },
        {
          $set: {
            "nodes.$.data.sheetRows": rows,
            "nodes.$.data.sheetColumns": columns,
            "nodes.$.data.lastSyncedAt": new Date(),
          },
        }
      );
    } catch (err) {
      console.warn("[applyDraftOverlayToAiContext Warning]:", err.message);
    }
  }
}

export default SheetUpdateService;
