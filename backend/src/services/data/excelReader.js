import xlsx from "xlsx";
import fs from "fs";

export class ExcelReader {
  /**
   * Detect header row index by searching the top rows for known column names
   */
  static detectHeaderRowIndex(gridRows = []) {
    if (!gridRows || gridRows.length === 0) return 0;

    const keywords = [
      "primary text", "primarytext", "headline", "landing page",
      "campaign name", "adset name", "ad set name", "ad name",
      "creative code", "creative url", "drive link", "description",
      "call to action", "cta", "budget", "objective"
    ];

    for (let r = 0; r < Math.min(10, gridRows.length); r++) {
      const row = gridRows[r] || [];
      const rowStr = row.map((c) => String(c || "").toLowerCase()).join(" ");
      if (keywords.some((kw) => rowStr.includes(kw))) {
        return r;
      }
    }

    // Fall back to first non-empty row if keywords not explicitly found
    for (let r = 0; r < Math.min(10, gridRows.length); r++) {
      const row = gridRows[r] || [];
      const nonCount = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "").length;
      if (nonCount >= 2) return r;
    }

    return 0;
  }

  /**
   * Parse an Excel file (.xlsx, .xls) from buffer or file path
   */
  static parseExcel({ filePath = null, fileBuffer = null, worksheetName = null, originalFilename = "" } = {}) {
    let workbook;
    if (fileBuffer) {
      workbook = xlsx.read(fileBuffer, { type: "buffer", cellFormulas: true, cellDates: true, cellNF: true });
    } else if (filePath) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Excel file not found at path: ${filePath}`);
      }
      workbook = xlsx.readFile(filePath, { cellFormulas: true, cellDates: true, cellNF: true });
    } else {
      throw new Error("Either filePath or fileBuffer must be provided to ExcelReader.");
    }

    const availableWorksheets = workbook.SheetNames || [];
    if (availableWorksheets.length === 0) {
      throw new Error("The Excel workbook contains no worksheets.");
    }

    const targetSheetName = worksheetName && availableWorksheets.includes(worksheetName)
      ? worksheetName
      : availableWorksheets[0];

    const sheet = workbook.Sheets[targetSheetName];
    if (!sheet) {
      throw new Error(`Worksheet "${targetSheetName}" not found in workbook.`);
    }

    // Convert sheet to 2D array matrix (header: 1 returns raw cell values matrix)
    const rawGrid = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: "yyyy-mm-dd" }) || [];
    
    // Also get formula grid if formulas are present
    const formulaGrid = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true, cellFormulas: true }) || [];

    const warnings = [];

    if (rawGrid.length === 0) {
      return {
        sourceType: "excel",
        spreadsheetName: originalFilename || (filePath ? filePath.split("/").pop() : "uploaded_excel.xlsx"),
        worksheetName: targetSheetName,
        availableWorksheets,
        detectedHeaderRowIndex: 0,
        headers: [],
        originalColumnCount: 0,
        originalRowCount: 0,
        populatedRowCount: 0,
        rows: [],
        warnings: ["The selected worksheet is completely empty."],
        lastSyncedAt: new Date().toISOString(),
      };
    }

    const headerRowIdx = this.detectHeaderRowIndex(rawGrid);
    const rawHeaderRow = rawGrid[headerRowIdx] || [];

    // Preserve exact original headers
    const headers = [];
    const headerCounts = {};
    rawHeaderRow.forEach((h, idx) => {
      let headerStr = String(h || "").trim();
      if (!headerStr) {
        headerStr = `Column_${idx + 1}`;
        warnings.push(`Column ${idx + 1} at line ${headerRowIdx + 1} had no header name. Assigned default name "${headerStr}".`);
      }
      
      // Check duplicate header detection
      if (headerCounts[headerStr]) {
        headerCounts[headerStr] += 1;
        const deDupName = `${headerStr}_${headerCounts[headerStr]}`;
        warnings.push(`Duplicate header "${headerStr}" found at column ${idx + 1}. Disambiguated to "${deDupName}".`);
        headers.push(deDupName);
      } else {
        headerCounts[headerStr] = 1;
        headers.push(headerStr);
      }
    });

    const originalColumnCount = headers.length;
    const originalRowCount = rawGrid.length;
    const rows = [];
    let populatedRowCount = 0;

    for (let r = headerRowIdx + 1; r < rawGrid.length; r++) {
      const line = rawGrid[r] || [];
      const formulaLine = formulaGrid[r] || [];
      const originalRowNumber = r + 1; // 1-based index in Excel file

      const values = {};
      const rawCells = {};
      let isPopulated = false;

      headers.forEach((headerName, cIdx) => {
        let cellValue = line[cIdx] !== undefined && line[cIdx] !== null ? String(line[cIdx]).trim() : "";
        const rawCell = formulaLine[cIdx];

        // Check SheetJS cell object for underlying hyperlink target (Smart Chips / Excel Hyperlinks)
        const cellAddress = xlsx.utils.encode_cell({ r, c: cIdx });
        const sheetCellObj = sheet[cellAddress];

        // Preserve uncorrupted large integers (Page ID, Pixel ID, App ID, etc.) from sheetCellObj or rawCell
        // SheetJS with raw: false formats numbers >= 1e11 into scientific notation (e.g. 1.1516E+15), losing precision.
        const isScientific = /^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/i.test(cellValue);
        const normHeader = headerName.toLowerCase().replace(/[^a-z0-9]/g, "");
        const isIdColumn = /(?:id|page|pixel|app|account|ig|campaign|adset|ad)$/i.test(normHeader);

        const rawNumericVal = sheetCellObj?.v !== undefined && sheetCellObj?.v !== null ? sheetCellObj.v : rawCell;
        if (typeof rawNumericVal === "number" && Number.isInteger(rawNumericVal)) {
          if (isScientific || isIdColumn) {
            cellValue = BigInt(rawNumericVal).toString();
          }
        } else if (typeof rawNumericVal === "bigint") {
          cellValue = rawNumericVal.toString();
        } else if (typeof rawNumericVal === "string" && isScientific && !/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/i.test(rawNumericVal.trim())) {
          cellValue = rawNumericVal.trim();
        }
        let hyperlinkUrl = null;

        if (sheetCellObj) {
          // 1. Direct cell hyperlink target
          if (sheetCellObj.l && sheetCellObj.l.Target) {
            hyperlinkUrl = String(sheetCellObj.l.Target).trim();
          }

          // 2. Rich text runs (sheetCellObj.r)
          if (!hyperlinkUrl && Array.isArray(sheetCellObj.r)) {
            for (const run of sheetCellObj.r) {
              if (run && run.l && run.l.Target) {
                hyperlinkUrl = String(run.l.Target).trim();
                break;
              }
            }
          }

          // 3. Formula HYPERLINK
          if (!hyperlinkUrl && rawCell && typeof rawCell === "object" && rawCell.f && String(rawCell.f).includes("HYPERLINK")) {
            const match = String(rawCell.f).match(/HYPERLINK\(\s*["']([^"']+)["']/i);
            if (match) hyperlinkUrl = match[1].trim();
          }

          // 4. Raw cell JSON inspection for embedded Drive link URLs
          if (!hyperlinkUrl) {
            try {
              const rawJson = JSON.stringify(sheetCellObj);
              const driveMatch = rawJson.match(/https?:\/\/(?:drive|docs)\.google\.com\/[^\s"',;}\\]+/i);
              if (driveMatch) hyperlinkUrl = driveMatch[0];
            } catch (e) {}
          }
        }

        if (hyperlinkUrl && (hyperlinkUrl.includes("drive.google.com") || hyperlinkUrl.includes("docs.google.com") || hyperlinkUrl.length >= 25)) {
          if (!cellValue) {
            cellValue = hyperlinkUrl;
          } else if (!cellValue.includes(hyperlinkUrl)) {
            cellValue = `${cellValue}\n${hyperlinkUrl}`;
          }
        }
        
        let formula = null;
        if (rawCell && typeof rawCell === "object" && rawCell.f) {
          formula = `=${rawCell.f}`;
        } else if (typeof rawCell === "string" && rawCell.startsWith("=")) {
          formula = rawCell;
        }

        if (cellValue !== "") {
          isPopulated = true;
        }

        values[headerName] = cellValue;
        
        // Also add normalized key for case-insensitive lookup
        const cleanKey = headerName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
        if (cleanKey && !values[cleanKey]) {
          values[cleanKey] = cellValue;
        }

        rawCells[cIdx] = {
          colIndex: cIdx,
          header: headerName,
          value: cellValue,
          formattedValue: cellValue,
          hyperlink: hyperlinkUrl,
          formula,
        };
      });

      if (isPopulated) {
        populatedRowCount++;
      }

      rows.push({
        originalRowNumber,
        values,
        rawCells,
        isPopulated,
      });
    }

    return {
      sourceType: "excel",
      spreadsheetName: originalFilename || (filePath ? filePath.split("/").pop() : "uploaded_excel.xlsx"),
      worksheetName: targetSheetName,
      availableWorksheets,
      detectedHeaderRowIndex: headerRowIdx,
      headers,
      originalColumnCount,
      originalRowCount,
      populatedRowCount,
      rows,
      warnings,
      lastSyncedAt: new Date().toISOString(),
    };
  }
}

export default ExcelReader;
