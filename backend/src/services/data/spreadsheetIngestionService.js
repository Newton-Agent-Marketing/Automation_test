import sheetsService from "../../google/sheetsService.js";
import ExcelReader from "./excelReader.js";

export class SpreadsheetIngestionService {
  /**
   * Automatically detect source type (Excel vs Google Sheets) and ingest data into a normalized common representation.
   */
  static async ingest({
    sourceType = null,
    sheetUrlOrId = null,
    filePath = null,
    fileBuffer = null,
    worksheetName = null,
    originalFilename = "",
    range = null,
    gid = null,
  } = {}) {
    // 1. Auto-detect source type if omitted
    let effectiveSourceType = sourceType;
    if (!effectiveSourceType) {
      if (
        (sheetUrlOrId && typeof sheetUrlOrId === "string" && (sheetUrlOrId.includes("docs.google.com/spreadsheets") || /^[a-zA-Z0-9-_]{20,60}$/.test(sheetUrlOrId.trim())))
      ) {
        effectiveSourceType = "google_sheets";
      } else if (filePath || fileBuffer || (originalFilename && /\.(xlsx|xls)$/i.test(originalFilename))) {
        effectiveSourceType = "excel";
      } else if (sheetUrlOrId) {
        effectiveSourceType = "google_sheets";
      } else {
        throw new Error("Unable to determine data source. Please provide a Google Sheet URL/ID or an Excel file (.xlsx/.xls).");
      }
    }

    // 2. Process Excel files
    if (effectiveSourceType === "excel") {
      console.log(`[SpreadsheetIngestionService] Processing Excel data source (File: ${originalFilename || filePath || "buffer"})...`);
      const result = ExcelReader.parseExcel({
        filePath,
        fileBuffer,
        worksheetName,
        originalFilename,
      });

      return {
        ...result,
        sourceIdentifier: filePath || originalFilename || "excel_upload",
      };
    }

    // 3. Process Google Sheets
    if (effectiveSourceType === "google_sheets") {
      console.log(`[SpreadsheetIngestionService] Processing Google Sheets data source (${sheetUrlOrId})...`);
      const result = await sheetsService.readSpreadsheet({
        spreadsheetIdOrUrl: sheetUrlOrId,
        range,
        gid,
        sheetTitle: worksheetName,
      });

      // Normalize Google Sheets output to the Common Data Format schema
      const spreadsheetName = result.spreadsheetName || `Google_Sheet_${(result.spreadsheetId || "doc").slice(0, 8)}`;
      const worksheetNameClean = result.sheetTitle || worksheetName || "Sheet1";
      const availableWorksheets = result.availableWorksheets || [worksheetNameClean];
      const detectedHeaderRowIndex = result.detectedHeaderRowIndex !== undefined ? result.detectedHeaderRowIndex : 0;
      const warnings = result.warnings || [];

      // Convert rows to common row format with originalRowNumber
      const rows = (result.rows || []).map((r, idx) => {
        const originalRowNumber = r._originalRowNumber || (r.originalRowNumber !== undefined ? r.originalRowNumber : idx + detectedHeaderRowIndex + 2);
        const isBlank = Boolean(r._isBlank || !r.isPopulated);
        
        // Ensure values contains both original header keys and cleaned keys
        const values = { ...(r.values || r) };
        delete values._originalRowNumber;
        delete values.originalRowNumber;

        return {
          originalRowNumber,
          values,
          rawCells: r.rawCells || {},
          isPopulated: !isBlank,
          _isBlank: isBlank,
        };
      });

      const populatedCount = rows.filter((r) => r.isPopulated).length;
      const totalSheetRows = result.totalSheetRows || (rows.length > 0 ? rows[rows.length - 1].originalRowNumber : 0);
      const lastRowNumber = result.lastRowNumber || (rows.length > 0 ? rows[rows.length - 1].originalRowNumber : 0);
      const headerRowNumber = result.headerRowNumber || (detectedHeaderRowIndex + 1);

      return {
        sourceType: "google_sheets",
        sourceIdentifier: result.spreadsheetId || sheetUrlOrId,
        spreadsheetName,
        worksheetName: worksheetNameClean,
        availableWorksheets,
        availableTabs: result.availableTabs || [],
        detectedHeaderRowIndex,
        headerRowNumber,
        lastRowNumber,
        dataRowStart: result.dataRowStart || (headerRowNumber + 1),
        totalSheetRows,
        totalDataRows: result.totalDataRows || populatedCount,
        blankRowsCount: result.blankRowsCount || (rows.length - populatedCount),
        headers: result.headers || [],
        originalColumnCount: (result.headers || []).length,
        originalRowCount: lastRowNumber,
        populatedRowCount: populatedCount,
        rows,
        totalRows: rows.length,
        warnings,
        lastSyncedAt: new Date().toISOString(),
      };
    }

    throw new Error(`Unsupported source type "${effectiveSourceType}". Supported sources: "excel" (.xlsx, .xls) and "google_sheets".`);
  }
}

export default SpreadsheetIngestionService;
