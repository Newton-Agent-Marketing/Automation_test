import driveService from "../google/driveService.js";
import SpreadsheetIngestionService from "../services/data/spreadsheetIngestionService.js";
import MetaAdsMapper from "../services/meta/metaAdsMapper.js";

export class CampaignPipeline {
  constructor() {
    this.driveService = driveService;
  }

  /**
   * Orchestrator integrating Drive media assets with Excel / Google Sheets campaign rows and Ad platforms
   */
  async processCampaignPipeline({
    sheetUrlOrId = null,
    filePath = null,
    fileBuffer = null,
    worksheetName = null,
    adAccountId = null,
    channel = "meta",
    autoDownloadCreatives = true,
  } = {}) {
    const report = {
      startedAt: new Date().toISOString(),
      channel,
      adAccountId,
      sourceType: sheetUrlOrId ? "google_sheets" : "excel",
      sheetStatus: "PENDING",
      spreadsheetName: "",
      worksheetName: "",
      availableWorksheets: [],
      headers: [],
      totalRows: 0,
      readyRowsCount: 0,
      correctionRequiredRowsCount: 0,
      ambiguousHeaders: [],
      groupedCampaigns: [],
      processedCreatives: [],
      errors: [],
      summary: "",
    };

    try {
      // 1. Unified Data Ingestion (Excel or Google Sheets)
      const ingestion = await SpreadsheetIngestionService.ingest({
        sheetUrlOrId,
        filePath,
        fileBuffer,
        worksheetName,
      });

      report.sheetStatus = "LOADED";
      report.sourceType = ingestion.sourceType;
      report.spreadsheetName = ingestion.spreadsheetName;
      report.worksheetName = ingestion.worksheetName;
      report.availableWorksheets = ingestion.availableWorksheets;
      report.headers = ingestion.headers;
      report.totalRows = ingestion.populatedRowCount;

      // 2. Field Mapping & Hierarchy Validation
      const mapping = MetaAdsMapper.mapAndValidate(ingestion);
      report.readyRowsCount = mapping.readyRowsCount;
      report.correctionRequiredRowsCount = mapping.correctionRequiredRowsCount;
      report.ambiguousHeaders = mapping.ambiguousHeaders;
      report.groupedCampaigns = mapping.groupedCampaigns;

      if (mapping.validationErrors && mapping.validationErrors.length > 0) {
        mapping.validationErrors.forEach((e) => {
          report.errors.push({ rowId: `ROW-${e.rowNumber}`, error: e.message, field: e.field });
        });
      }

      // 3. Process Google Drive Creatives (Images & Videos) for each mapped row
      const { default: MediaAssetResolver } = await import("../services/data/mediaAssetResolver.js");

      for (const r of mapping.mappedRows) {
        const rowVal = r.rawValues || {};
        const itemResult = {
          originalRowNumber: r.originalRowNumber,
          creativeCode: r.ad.creativeCode,
          campaignName: r.campaign.name,
          adName: r.ad.name,
          detectedAssets: [],
          downloadStatus: "SKIPPED",
          error: null,
        };

        if (autoDownloadCreatives) {
          try {
            const resolvedAssets = await MediaAssetResolver.resolveRowMediaAssets(rowVal);
            itemResult.detectedAssets = resolvedAssets;

            if (resolvedAssets.length > 0) {
              const hasSuccess = resolvedAssets.some((a) => a.mediaType !== "invalid" && !a.error);
              itemResult.downloadStatus = hasSuccess ? "DOWNLOADED" : "FAILED";
            }
          } catch (dlErr) {
            itemResult.downloadStatus = "FAILED";
            itemResult.error = dlErr.message;
            report.errors.push({ rowId: `ROW-${r.originalRowNumber}`, error: dlErr.message });
          }
        }

        report.processedCreatives.push(itemResult);
      }


      report.completedAt = new Date().toISOString();
      report.summary = `Pipeline executed successfully for ${ingestion.spreadsheetName} (${ingestion.worksheetName}). Processed ${report.totalRows} rows (${report.readyRowsCount} ready, ${report.correctionRequiredRowsCount} require correction) with ${
        report.processedCreatives.filter((c) => c.downloadStatus === "DOWNLOADED").length
      } media creatives downloaded from Google Drive.`;

      return report;
    } catch (pipelineErr) {
      report.sheetStatus = "FAILED";
      report.summary = `Pipeline failed: ${pipelineErr.message}`;
      report.errors.push({ general: pipelineErr.message });
      throw pipelineErr;
    }
  }
}

export const campaignPipeline = new CampaignPipeline();
export default campaignPipeline;
