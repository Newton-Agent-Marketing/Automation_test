import crypto from "crypto";
import sheetsService from "../../google/sheetsService.js";
import { ExcelReader } from "../data/excelReader.js";
import AiContext from "../../models/aiContextModel.js";

export class SourceSheetReader {
  /**
   * Compute a deterministic hash of sheet data to detect any subsequent edits/stale approvals
   */
  static computeDataFingerprint(headers = [], rows = []) {
    const serialized = JSON.stringify({
      headers,
      rows: rows.map((r) => {
        const vals = r.values || r;
        const clean = {};
        Object.keys(vals || {})
          .sort()
          .forEach((k) => {
            if (!k.startsWith("_") && k !== "rawCells") {
              clean[k] = vals[k];
            }
          });
        return clean;
      }),
    });
    return crypto.createHash("sha256").update(serialized).digest("hex");
  }

  /**
   * Read source sheet from Google Sheets, uploaded Excel, or connected AI Context warehouse
   */
  static async readSource({
    userId,
    sheetUrlOrId = null,
    filePath = null,
    fileBuffer = null,
    worksheetName = null,
  } = {}) {
    let sourceType = "google_sheets";
    let spreadsheetName = "";
    let targetWorksheet = worksheetName || "Sheet1";
    let availableWorksheets = [];
    let headers = [];
    let rawRows = [];
    let headerRowNumber = 1;
    let dataRowStart = 2;
    let spreadsheetId = null;
    let isReadOnly = false;

    // 1. If explicit Google Sheet URL/ID is provided or detected
    const isGoogleSheetUrl =
      typeof sheetUrlOrId === "string" &&
      (sheetUrlOrId.includes("docs.google.com/spreadsheets") ||
        sheetUrlOrId.includes("drive.google.com") ||
        /^[a-zA-Z0-9-_]{25,60}$/.test(sheetUrlOrId.trim()));

    if (isGoogleSheetUrl) {
      sourceType = "google_sheets";
      spreadsheetId = sheetsService.extractSpreadsheetId(sheetUrlOrId);

      const readResult = await sheetsService.readSpreadsheet({
        spreadsheetIdOrUrl: sheetUrlOrId,
        sheetTitle: worksheetName,
      });

      spreadsheetName = readResult.spreadsheetName || `Google_Sheet_${spreadsheetId?.slice(0, 8)}`;
      targetWorksheet = readResult.sheetTitle || "Sheet1";
      availableWorksheets = readResult.availableWorksheets || [targetWorksheet];
      headers = readResult.headers || [];
      rawRows = readResult.rows || [];
      headerRowNumber = readResult.headerRowNumber || 1;
      dataRowStart = readResult.dataRowStart || 2;
    } else if (filePath || fileBuffer) {
      // 2. Direct Excel file buffer or disk path
      sourceType = "excel";
      const excelRes = ExcelReader.parseExcel({
        filePath,
        fileBuffer,
        worksheetName,
        originalFilename: filePath ? filePath.split("/").pop() : "uploaded_sheet.xlsx",
      });

      spreadsheetName = excelRes.spreadsheetName;
      targetWorksheet = excelRes.worksheetName;
      availableWorksheets = excelRes.availableWorksheets;
      headers = excelRes.headers;
      rawRows = excelRes.rows;
      headerRowNumber = excelRes.detectedHeaderRowIndex + 1;
      dataRowStart = headerRowNumber + 1;
    } else if (userId) {
      // 3. Look up connected AI Context data warehouse node for the user
      const context = await AiContext.findOne({ userId }).lean();
      const warehouseNodes = (context?.nodes || []).filter(
        (n) =>
          n.type === "data_warehouse" &&
          (n.data?.sheetUrl || (Array.isArray(n.data?.sheetRows) && n.data.sheetRows.length > 0))
      );

      // Sort by newest
      warehouseNodes.sort((a, b) => {
        const timeA = new Date(a.data?.lastSyncedAt || a.updatedAt || 0).getTime();
        const timeB = new Date(b.data?.lastSyncedAt || b.updatedAt || 0).getTime();
        return timeB - timeA;
      });

      const primaryNode = warehouseNodes[0];

      if (primaryNode) {
        const multiSheets = Array.isArray(primaryNode.data?.sheets) ? primaryNode.data.sheets.filter((s) => s.sheetUrl) : [];
        const primaryConnectedSheet = multiSheets[0] || null;

        const nodeSheetUrl = primaryNode.data?.sheetUrl || primaryConnectedSheet?.sheetUrl;
        spreadsheetName =
          primaryConnectedSheet?.workbookName ||
          primaryNode.data?.workbookName ||
          primaryNode.data?.fileName ||
          primaryNode.data?.sheetName ||
          "Connected Spreadsheet";
        targetWorksheet = primaryConnectedSheet?.worksheetName || primaryNode.data?.worksheetName || "Sheet1";

        if (nodeSheetUrl) {
          sourceType = "google_sheets";
          spreadsheetId = sheetsService.extractSpreadsheetId(nodeSheetUrl);
          try {
            const liveRead = await sheetsService.readSpreadsheet({
              spreadsheetIdOrUrl: nodeSheetUrl,
              sheetTitle: targetWorksheet,
            });
            headers = liveRead.headers || [];
            rawRows = liveRead.rows || [];
            headerRowNumber = liveRead.headerRowNumber || 1;
            dataRowStart = liveRead.dataRowStart || 2;
            availableWorksheets = liveRead.availableWorksheets || [targetWorksheet];
          } catch (syncErr) {
            console.warn("[SourceSheetReader Live Sync Fallback]:", syncErr.message);
            headers = primaryNode.data?.sheetColumns || [];
            rawRows = primaryNode.data?.sheetRows || [];
          }
        } else {
          sourceType = "excel";
          headers = primaryNode.data?.sheetColumns || [];
          rawRows = primaryNode.data?.sheetRows || [];
        }
      }
    }

    if (!headers.length && rawRows.length > 0) {
      const firstRow = rawRows[0]?.values || rawRows[0] || {};
      headers = Object.keys(firstRow).filter((k) => !k.startsWith("_") && k !== "rawCells");
    }

    // Normalize rows into standardized format with original row numbers
    const normalizedRows = [];
    const eligibleRows = [];
    const excludedRows = [];

    rawRows.forEach((row, idx) => {
      const sourceRowNo =
        row.originalRowNumber ||
        row._originalRowNumber ||
        row.rowNumber ||
        idx + (dataRowStart || 2);

      const cellValues = row.values || row;
      const isBlank =
        row.isPopulated === false ||
        row._isBlank === true ||
        !Object.values(cellValues).some((v) => v !== null && v !== undefined && String(v).trim() !== "");

      if (isBlank) {
        excludedRows.push({
          rowNumber: sourceRowNo,
          reason: "Empty or unpopulated row",
        });
        return;
      }

      normalizedRows.push({
        rowNumber: sourceRowNo,
        values: cellValues,
        rawCells: row.rawCells || null,
      });

      eligibleRows.push(sourceRowNo);
    });

    const dataFingerprint = this.computeDataFingerprint(headers, normalizedRows);

    return {
      sourceType,
      sheetUrl: isGoogleSheetUrl ? sheetUrlOrId : null,
      spreadsheetId,
      spreadsheetName,
      worksheetName: targetWorksheet,
      availableWorksheets,
      headers,
      totalRows: normalizedRows.length,
      headerRowNumber,
      dataRowStart,
      rows: normalizedRows,
      eligibleRows,
      excludedRows,
      dataFingerprint,
      isReadOnly,
    };
  }
}

export default SourceSheetReader;
