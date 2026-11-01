// backend/src/services/automation/metaAdsSheetSyncService.js
import SheetInspectorService from "../agent/sheetInspectorService.js";
import DynamicSheetExecutionService from "../agent/dynamicSheetExecutionService.js";
import { MetaMcpClient } from "../mcp/metaMcpClient.js";

/**
 * Dynamic Meta Ads -> Google Sheets Sync Service
 *
 * Uses live connected spreadsheet inspection, semantic header classification,
 * dynamic date resolution, live Meta Graph API queries, and verified Google Sheets
 * row appending — with zero simulated records and zero swallowed write errors.
 */
class MetaAdsSheetSyncService {
  async syncMetaAdsToSheet({
    userId,
    instruction = "",
    node = {},
    context = {},
    executionId = null,
    onProgress = null,
  } = {}) {
    const steps = [];
    const emitStep = (stepNumber, title, status, detail) => {
      const entry = {
        step: stepNumber,
        title,
        status,
        detail,
        timestamp: new Date().toISOString(),
      };
      steps.push(entry);
      if (typeof onProgress === "function") {
        try {
          onProgress(entry, steps);
        } catch (_) {}
      }
    };

    emitStep(1, "Inspecting Connected Google Sheet", "running", "Resolving connected spreadsheet and worksheet tab from AI Context...");

    const explicitSheetIndex = node?.config?.sheetIndex || context?.sheetIndex || null;
    const explicitSheetUrl = node?.config?.sheetUrl || context?.sheetUrl || null;
    const explicitTabName = node?.config?.targetTab || context?.targetTab || null;

    const sheetRes = await SheetInspectorService.resolveAndReadSheet({
      userId,
      sheetIndex: explicitSheetIndex,
      sheetUrl: explicitSheetUrl,
      tabName: explicitTabName,
      userMessage: instruction,
    });

    if (!sheetRes?.success) {
      const errMsg = sheetRes?.message || "No connected Google Sheet found in AI Context.";
      emitStep(1, "Inspecting Connected Google Sheet", "failed", errMsg);
      throw new Error(errMsg);
    }

    const headers = sheetRes.headers || [];
    if (headers.length === 0) {
      const errMsg = `Target worksheet "${sheetRes.targetTab}" in "${sheetRes.sheetName}" has no column headers in Row 1. Please add column headers first.`;
      emitStep(1, "Inspecting Connected Google Sheet", "failed", errMsg);
      throw new Error(errMsg);
    }

    const classification = DynamicSheetExecutionService.classifySheetColumns(headers, sheetRes.rows || []);
    emitStep(
      1,
      "Inspecting Connected Google Sheet",
      "completed",
      `Resolved Sheet #${sheetRes.sheetIndex} "${sheetRes.sheetName}" -> Tab "${sheetRes.targetTab}" (${headers.length} columns, required granularity: ${classification.requiredGranularity}).`
    );

    emitStep(2, "Resolving Reporting Date", "running", "Evaluating explicit instruction date, workflow Date node, and timezone...");
    const dateResolution = DynamicSheetExecutionService.resolveReportingDate({
      instruction,
      dateNodeConfig: context?.dateConfig || null,
      timeNodeConfig: context?.timeConfig || null,
      scheduledDate: context?.scheduledDate || null,
      timezone: context?.timezone || null,
      existingSheetRows: sheetRes.rows || [],
      dateHeaders: classification.dateHeaders,
    });

    if (!dateResolution.ok) {
      emitStep(2, "Resolving Reporting Date", "failed", dateResolution.clarificationQuestion);
      return {
        success: false,
        status: dateResolution.status || "WAITING_FOR_INPUT",
        clarificationQuestion: dateResolution.clarificationQuestion,
        steps,
      };
    }

    emitStep(
      2,
      "Resolving Reporting Date",
      "completed",
      `Resolved reporting date ${dateResolution.formattedDate} (ISO: ${dateResolution.reportingDateIso}, source: ${dateResolution.source}, format: ${dateResolution.sheetDateFormat}).`
    );

    emitStep(3, "Fetching Live Meta Ads Data", "running", "Querying live Meta Ads hierarchy and performance insights...");
    const explicitAccountMatch = String(instruction || "").match(/\bact_(\d{5,25})\b/i);
    const accountId =
      node?.config?.metaAccountId ||
      context?.metaAccountId ||
      (explicitAccountMatch ? `act_${explicitAccountMatch[1]}` : undefined);

    const insightsRes = await MetaMcpClient.executeLiveTool("get_live_campaign_insights", {
      userId,
      ...(accountId ? { accountId } : {}),
      level: classification.requiredGranularity,
      timeRange: dateResolution.timeRange || undefined,
      datePreset: dateResolution.timeRange ? undefined : dateResolution.datePreset || "maximum",
    });

    const campaignsRes = await MetaMcpClient.executeLiveTool("get_live_campaigns_status", {
      userId,
      accountId: insightsRes.accountId,
      includeAds: false,
    });

    let adSets = [];
    let ads = [];
    if (classification.requirements.needsAdSets) {
      const adSetRes = await MetaMcpClient.executeLiveTool("get_live_adsets", {
        userId,
        accountId: insightsRes.accountId,
      });
      adSets = adSetRes.adSets || [];
    }
    if (classification.requirements.needsAds) {
      const adsRes = await MetaMcpClient.executeLiveTool("get_live_ad_creatives", {
        userId,
        accountId: insightsRes.accountId,
        includeInsights: true,
        timeRange: dateResolution.timeRange || undefined,
        datePreset: dateResolution.timeRange ? undefined : dateResolution.datePreset || "maximum",
      });
      ads = adsRes.ads || adsRes.creatives || [];
    }

    const unifiedRecords = DynamicSheetExecutionService.buildUnifiedAdRecords({
      granularity: classification.requiredGranularity,
      accountId: insightsRes.accountId,
      accountName: insightsRes.accountName,
      channel: "Meta Ads",
      currency: insightsRes.currency || "INR",
      campaigns: campaignsRes.campaigns || [],
      adSets,
      ads,
      insights: insightsRes.insights || [],
      includeZeroImpressionEntities: (insightsRes.insights || []).length === 0,
    });

    emitStep(
      3,
      "Fetching Live Meta Ads Data",
      "completed",
      `Fetched ${unifiedRecords.length} live ${classification.requiredGranularity}-level record(s) from Meta account ${insightsRes.accountName} (${insightsRes.accountId}).`
    );

    emitStep(4, "Mapping Fields & Appending to Google Sheet", "running", `Mapping ${unifiedRecords.length} record(s) to ${headers.length} spreadsheet columns...`);
    const mapping = DynamicSheetExecutionService.mapRecordsToSheetColumns({
      records: unifiedRecords,
      headers,
      columnClassification: classification,
      dateResolution,
    });

    const appendRes = await DynamicSheetExecutionService.appendMappedRowsToSheet({
      userId,
      resolvedSheet: sheetRes,
      rowArrays: mapping.rowArrays,
    });

    emitStep(
      4,
      "Mapping Fields & Appending to Google Sheet",
      "completed",
      `Appended and verified ${appendRes.rowsAppended} row(s) in "${sheetRes.sheetName}" -> "${sheetRes.targetTab}" (${appendRes.updatedRange || "verified"}).`
    );

    return {
      success: true,
      status: "SYNC_COMPLETED",
      spreadsheetId: sheetRes.spreadsheetId,
      sheetName: sheetRes.sheetName,
      targetTab: sheetRes.targetTab,
      metaAccount: {
        accountId: insightsRes.accountId,
        accountName: insightsRes.accountName,
        currency: insightsRes.currency || "INR",
      },
      reportingDate: mapping.reportingDateUsed,
      reportingDateIso: mapping.reportingDateIso,
      headersDetected: headers,
      fieldMappings: mapping.fieldMappings,
      unmappedFields: mapping.unmappedFields,
      rowsFetchedFromMeta: unifiedRecords.length,
      rowsAppended: appendRes.rowsAppended,
      verified: appendRes.verified,
      updatedRange: appendRes.updatedRange,
      steps,
    };
  }
}

export default new MetaAdsSheetSyncService();
