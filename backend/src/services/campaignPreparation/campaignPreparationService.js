import crypto from "crypto";
import CampaignPreparationSession from "../../models/campaignPreparationSession.js";
import { SourceSheetReader } from "./sourceSheetReader.js";
import { CampaignValidator } from "./campaignValidator.js";
import { MissingFieldCollector } from "./missingFieldCollector.js";
import { SheetUpdateService } from "./sheetUpdateService.js";
import { PreviewBuilder } from "./previewBuilder.js";
import { MetaAdsOrchestrator } from "./metaAdsOrchestrator.js";
import DynamicSheetFilter from "../data/dynamicSheetFilter.js";

export class CampaignPreparationService {
  /**
   * Find active preparation session for a conversation
   */
  static async getActiveSession(conversationId, userId) {
    if (!conversationId) return null;
    return await CampaignPreparationSession.findOne({
      conversationId,
      ...(userId ? { userId } : {}),
      status: { $ne: "COMPLETED" },
    }).sort({ createdAt: -1 });
  }

  /**
   * Detect if a user message is an explicit Approval command
   */
  static isApprovalCommand(msg) {
    if (!msg || typeof msg !== "string") return false;
    const clean = msg
      .toLowerCase()
      .replace(/^["'“`*.\s]+|["'”`*.\s]+$/g, "")
      .trim();

    // Guard: If the message specifies configuration parameters (campaign name, ad set name, sheet, rows, where), it is a SETUP command, NOT an approval!
    const hasConfigDeclarations =
      /\b(?:campaign\s*(?:names?|title|titled|label|called)?|campaign_name|camp_name)\s*[:=]/i.test(clean) ||
      /\b(?:adset\s*(?:names?|title|titled|label|called)?|ad_set_name|adset_name)\s*[:=]/i.test(clean) ||
      /\b(?:rows?|lines?)\s*#?\d+/i.test(clean) ||
      /\b(?:where|filter|using\s+sheet|attach\s+a\s+sheet|use\s+a\s+sheet)\b/i.test(clean);

    if (hasConfigDeclarations) {
      return false;
    }

    // 1. Direct or partial keyword matches
    if (
      clean === "approve" ||
      clean === "approved" ||
      clean === "approval" ||
      clean === "approve it" ||
      clean === "yes" ||
      clean === "haan" ||
      clean === "ha" ||
      clean === "proceed" ||
      clean === "confirm" ||
      clean === "ok create" ||
      clean === "ok approve"
    ) {
      return true;
    }

    // 2. Contains approval phrases
    if (
      clean.includes("approve") ||
      clean.includes("approved") ||
      clean.includes("approval") ||
      clean.includes("create ads now") ||
      clean.includes("publish ad") ||
      clean.includes("launch campaign") ||
      clean.includes("retry")
    ) {
      return true;
    }

    // 3. Hinglish commands: e.g., "approve karo", "ad create karo", "campaign banao", "haan create kar do"
    const hasIntentVerb = /karo|kardo|kar\s*do|chalau|shuru\s*karo|dal\s*do/i.test(clean);
    const hasTargetNoun = /approve/i.test(clean);
    if (hasIntentVerb && hasTargetNoun) {
      return true;
    }

    return false;
  }

  /**
   * Detect if a user message is an Edit request
   */
  static isEditCommand(msg) {
    if (!msg || typeof msg !== "string") return false;
    const clean = msg.toLowerCase().trim();
    return (
      clean.startsWith("edit") ||
      clean.includes("edit") ||
      clean.includes("change") ||
      clean.includes("update") ||
      clean.includes("replace") ||
      clean.includes("modify")
    );
  }

  /**
   * Dynamically apply row range / row list / field value filters from user prompt to sourceData
   */
  static applyFiltersToSourceData(sourceData, userMsg = "", existingCriteria = null) {
    if (!sourceData || !Array.isArray(sourceData.rows) || sourceData.rows.length === 0) {
      return {
        filteredSource: sourceData,
        filterApplied: false,
        filterSummary: null,
        filterCriteria: null,
      };
    }

    const maxRowNumber = Math.max(
      ...sourceData.rows.map((r) => r.rowNumber || 0),
      sourceData.rows.length + 1
    );

    let rowRangeInfo = null;
    let filterConditions = null;

    if (userMsg && typeof userMsg === "string" && userMsg.trim()) {
      rowRangeInfo = DynamicSheetFilter.parseRowRange(userMsg, maxRowNumber);
      filterConditions = DynamicSheetFilter.parseFilterConditions(userMsg, sourceData.headers);
    } else if (existingCriteria) {
      if (existingCriteria.targetRowNumbers && existingCriteria.targetRowNumbers.length > 0) {
        rowRangeInfo = {
          isExplicitRange: true,
          targetRowNumbers: new Set(existingCriteria.targetRowNumbers),
          start: Math.min(...existingCriteria.targetRowNumbers),
          end: Math.max(...existingCriteria.targetRowNumbers),
          rawText: existingCriteria.rowRangeText,
        };
      }
      if (existingCriteria.conditions && existingCriteria.conditions.length > 0) {
        filterConditions = {
          conditions: existingCriteria.conditions,
          logicalOperator: existingCriteria.logicalOperator || "AND",
        };
      }
    }

    let workingRows = [...sourceData.rows];
    let filterApplied = false;
    const filterDescriptions = [];

    // 1. Apply Row Range/List Filter
    if (rowRangeInfo && rowRangeInfo.isExplicitRange) {
      const { selectedRows } = DynamicSheetFilter.filterByRowRange(workingRows, rowRangeInfo);
      workingRows = selectedRows;
      filterApplied = true;
      if (rowRangeInfo.targetRowNumbers && rowRangeInfo.targetRowNumbers.size > 0) {
        const sorted = Array.from(rowRangeInfo.targetRowNumbers).sort((a, b) => a - b);
        filterDescriptions.push(`Rows: #${sorted.join(", #")}`);
      } else {
        filterDescriptions.push(`Rows: #${rowRangeInfo.start} to #${rowRangeInfo.end}`);
      }
    }

    // 2. Apply Column / Field Filter Conditions
    if (filterConditions && Array.isArray(filterConditions.conditions) && filterConditions.conditions.length > 0) {
      workingRows = DynamicSheetFilter.filterRows(
        workingRows,
        filterConditions.conditions,
        filterConditions.logicalOperator || "AND"
      );
      filterApplied = true;
      const condStrs = filterConditions.conditions.map(
        (c) => `${c.header} ${c.operator} "${Array.isArray(c.values) ? c.values.join(", ") : c.value}"`
      );
      filterDescriptions.push(`Field: ${condStrs.join(` ${filterConditions.logicalOperator || "AND"} `)}`);
    }

    if (!filterApplied) {
      return {
        filteredSource: sourceData,
        filterApplied: false,
        filterSummary: null,
        filterCriteria: null,
      };
    }

    const filteredEligibleRows = workingRows.map((r) => r.rowNumber);
    const filteredExcludedRows = (sourceData.rows || [])
      .filter((r) => !filteredEligibleRows.includes(r.rowNumber))
      .map((r) => ({
        rowNumber: r.rowNumber,
        reason: "Filtered out by requested criteria",
      }));

    const filteredSource = {
      ...sourceData,
      rows: workingRows,
      totalRows: workingRows.length,
      eligibleRows: filteredEligibleRows,
      excludedRows: [...(sourceData.excludedRows || []), ...filteredExcludedRows],
      dataFingerprint: SourceSheetReader.computeDataFingerprint(sourceData.headers, workingRows),
    };

    return {
      filteredSource,
      filterApplied: true,
      filterSummary: filterDescriptions.join(" | "),
      filterCriteria: {
        rowRangeText: rowRangeInfo?.isExplicitRange ? rowRangeInfo.rawText : null,
        targetRowNumbers: rowRangeInfo?.targetRowNumbers ? Array.from(rowRangeInfo.targetRowNumbers) : null,
        conditions: filterConditions?.conditions || [],
        logicalOperator: filterConditions?.logicalOperator || "AND",
      },
    };
  }

  /**
   * Master Workflow Handler: Validate ➔ Ask ➔ Update Sheet ➔ Revalidate ➔ Preview ➔ Approve/Edit ➔ Create
   */
  static async handleWorkflow({
    userId,
    userEmail,
    conversationId,
    userMessage = "",
    metaAccountId = null,
    accountDoc = null,
    onProgress = null,
  }) {
    const emit = (stageName) => {
      if (typeof onProgress === "function") {
        onProgress({
          type: "tool_status",
          toolName: "campaign_preparation_engine",
          status: stageName,
        });
      }
    };

    let session = await this.getActiveSession(conversationId, userId);
    const msg = (userMessage || "").trim();

    // =========================================================================
    // CASE A: USER APPROVAL ACTION ("Approve Campaign & Create Ads" or Retry)
    // =========================================================================
    if (this.isApprovalCommand(msg) && session && (session.status === "READY_FOR_REVIEW" || session.status === "FAILED" || session.status === "APPROVED" || session.status === "STALE_APPROVAL")) {
      emit("Verifying approval snapshot & checking source sheet integrity...");

      // 1. Sync latest source data if sheet was updated before taking approval snapshot
      try {
        const rawLatest = await SourceSheetReader.readSource({
          userId,
          sheetUrlOrId: session.source?.sheetUrl || session.source?.spreadsheetId,
          filePath: session.source?.filePath,
          worksheetName: session.source?.worksheetName,
        });

        const { filteredSource: latestSource } = this.applyFiltersToSourceData(rawLatest, "", session.filterCriteria);

        if (latestSource && latestSource.dataFingerprint && latestSource.dataFingerprint !== session.source?.dataFingerprint) {
          emit("Sheet data updated. Refreshing campaign configuration with latest sheet values...");
          const valResult = await CampaignValidator.validate({
            campaignName: session.campaignName,
            adSetName: session.adSetName,
            metaAccountId: metaAccountId || session.metaAccountId,
            accountDoc,
            sourceData: latestSource,
            userAnswers: session.userAnswers || {},
          });
          session.source.dataFingerprint = latestSource.dataFingerprint;
          const newPreview = PreviewBuilder.buildPreview({
            validationResult: valResult,
            sourceData: filteredSource,
            userAnswers: session.userAnswers || {},
            version: (session.preview?.version || 1) + 1,
          });
          session.preview = newPreview;
        }
      } catch (readErr) {
        console.warn("[Preparation Approval Sync Warning]:", readErr.message);
      }

      // Take final immutable snapshot
      session.status = "APPROVED";
      session.approval = {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: userId,
        snapshotDataFingerprint: session.source?.dataFingerprint,
        snapshot: JSON.parse(JSON.stringify(session.preview || {})),
      };
      session.creationJob = {
        status: "IN_PROGRESS",
        startedAt: new Date(),
        completedAt: null,
        campaignName: session.campaignName,
        metaCampaignId: null,
        metaAdSetId: null,
        adResults: [],
        totalAds: session.preview?.adDetails?.length || 0,
      };
      session.auditHistory.push({
        action: "APPROVED_CAMPAIGN",
        performedBy: userEmail || "USER",
        details: { previewVersion: session.preview?.version },
        timestamp: new Date(),
      });
      await session.save();

      emit("Starting Meta Ads creation in strict dependency order...");

      // 2. Execute creation in dependency order
      const creationResult = await MetaAdsOrchestrator.executeApprovalCreation({
        session,
        userId,
        userEmail,
        onProgress,
      });

      const responseMd = MetaAdsOrchestrator.formatCreationResultMarkdown(
        creationResult,
        session.campaignName,
        session.adSetName
      );

      return {
        content: responseMd,
        preparationSession: session,
        toolCalls: [
          {
            toolName: "execute_meta_ads_creation",
            toolArgs: { campaignName: session.campaignName, adSetName: session.adSetName },
            toolResult: creationResult,
            status: "SUCCESS",
          },
        ],
      };
    }

    // =========================================================================
    // CASE B: USER EDIT DETAILS ACTION
    // =========================================================================
    if (session && this.isEditCommand(msg)) {
      emit("Processing edit instruction & updating source data...");
      session.status = "EDITING";

      // Parse field changes from user message
      const parsedEdits = MissingFieldCollector.parseAnswersFromMessage(msg, session.missingFields || []);
      const affectedRows = [];
      const rowMatch = msg.match(/(?:row|ad)\s*#?([0-9]+)/i);
      if (rowMatch) affectedRows.push(Number(rowMatch[1]));

      // 1. Update source sheet
      const updateRes = await SheetUpdateService.updateSourceSheet({
        userId,
        source: session.source,
        updates: parsedEdits,
        affectedRows,
      });

      // 2. Re-read latest source data
      const rawSource = await SourceSheetReader.readSource({
        userId,
        sheetUrlOrId: session.source?.sheetUrl || session.source?.spreadsheetId,
        filePath: session.source?.filePath,
        worksheetName: session.source?.worksheetName,
      });

      const { filteredSource: sourceData } = this.applyFiltersToSourceData(rawSource, "", session.filterCriteria);

      // 3. Revalidate
      const valResult = await CampaignValidator.validate({
        campaignName: parsedEdits.campaignName || session.campaignName,
        adSetName: parsedEdits.adSetName || session.adSetName,
        metaAccountId: metaAccountId || session.metaAccountId,
        accountDoc,
        sourceData,
        userAnswers: parsedEdits,
      });

      session.validationReport = {
        summaryTable: valResult.summaryTable,
        campaignIssues: valResult.campaignIssues,
        adSetIssues: valResult.adSetIssues,
        adIssues: valResult.adIssues,
        mediaIssues: valResult.mediaIssues,
        blockingCount: valResult.blockingCount,
        warningCount: valResult.warningCount,
      };
      session.missingFields = valResult.missingFields;
      session.campaignType = valResult.campaignType;
      session.objective = valResult.objective;
      session.userAnswers = { ...(session.userAnswers || {}), ...parsedEdits };
      session.source.dataFingerprint = sourceData.dataFingerprint;

      // Invalidate any old approval
      session.approval = { status: "NONE", approvedAt: null, approvedBy: null, snapshot: null };

      let replyMd = `### ✏️ Details Updated Successfully\n\n`;
      replyMd += `${updateRes.message}\n\n`;

      if (valResult.isValid) {
        session.status = "READY_FOR_REVIEW";
        const newVersion = (session.preview?.version || 1) + 1;
        const newPreview = PreviewBuilder.buildPreview({
          validationResult: valResult,
          sourceData,
          userAnswers: parsedEdits,
          version: newVersion,
        });
        session.preview = newPreview;
        await session.save();

        replyMd += PreviewBuilder.formatPreviewMarkdown(newPreview);
      } else {
        session.status = "NEEDS_USER_INPUT";
        await session.save();
        replyMd += CampaignValidator.formatReportMarkdown(valResult);
        replyMd += `\n\n` + MissingFieldCollector.formatQuestionsMarkdown(valResult.missingFields);
      }

      return {
        content: replyMd,
        preparationSession: session,
        toolCalls: [
          {
            toolName: "update_source_sheet",
            toolArgs: parsedEdits,
            toolResult: updateRes,
            status: "SUCCESS",
          },
        ],
      };
    }

    // =========================================================================
    // CASE C: USER PROVIDING ANSWERS TO MISSING FIELDS
    // =========================================================================
    if (session && session.status === "NEEDS_USER_INPUT") {
      const parsedAnswers = MissingFieldCollector.parseAnswersFromMessage(msg, session.missingFields || []);
      const hasAnswers = Object.keys(parsedAnswers).length > 0;

      if (hasAnswers) {
        emit("Saving answers to connected source sheet and revalidating...");
        session.status = "UPDATING_SHEET";

        // Update sheet cells
        const updateRes = await SheetUpdateService.updateSourceSheet({
          userId,
          source: session.source,
          updates: parsedAnswers,
          affectedRows: [],
        });

        // Re-read back latest values
        const rawSource = await SourceSheetReader.readSource({
          userId,
          sheetUrlOrId: session.source?.sheetUrl || session.source?.spreadsheetId,
          filePath: session.source?.filePath,
          worksheetName: session.source?.worksheetName,
        });

        const { filteredSource: sourceData } = this.applyFiltersToSourceData(rawSource, "", session.filterCriteria);

        // Re-run validation
        emit("Revalidating configuration and dependencies...");
        const valResult = await CampaignValidator.validate({
          campaignName: session.campaignName,
          adSetName: session.adSetName,
          metaAccountId: metaAccountId || session.metaAccountId,
          accountDoc,
          sourceData,
          userAnswers: parsedAnswers,
        });

        session.source.dataFingerprint = sourceData.dataFingerprint;
        session.validationReport = {
          summaryTable: valResult.summaryTable,
          campaignIssues: valResult.campaignIssues,
          adSetIssues: valResult.adSetIssues,
          adIssues: valResult.adIssues,
          mediaIssues: valResult.mediaIssues,
          blockingCount: valResult.blockingCount,
          warningCount: valResult.warningCount,
        };
        session.missingFields = valResult.missingFields;
        session.campaignType = valResult.campaignType;
        session.objective = valResult.objective;
        session.userAnswers = { ...(session.userAnswers || {}), ...parsedAnswers };

        let replyMd = "";
        if (updateRes.message) {
          replyMd += `> 💾 ${updateRes.message}\n\n`;
        }

        if (valResult.isValid) {
          session.status = "READY_FOR_REVIEW";
          const preview = PreviewBuilder.buildPreview({
            validationResult: valResult,
            sourceData,
            userAnswers: parsedAnswers,
            version: (session.preview?.version || 1) + 1,
          });
          session.preview = preview;
          await session.save();

          replyMd += CampaignValidator.formatReportMarkdown(valResult);
          replyMd += `\n\n` + PreviewBuilder.formatPreviewMarkdown(preview);
        } else {
          session.status = "NEEDS_USER_INPUT";
          await session.save();

          replyMd += CampaignValidator.formatReportMarkdown(valResult);
          replyMd += `\n\n` + MissingFieldCollector.formatQuestionsMarkdown(valResult.missingFields);
        }

        return {
          content: replyMd,
          preparationSession: session,
          toolCalls: [
            {
              toolName: "save_missing_fields",
              toolArgs: parsedAnswers,
              toolResult: updateRes,
              status: "SUCCESS",
            },
          ],
        };
      }
    }

    // =========================================================================
    // CASE D: INITIAL CAMPAIGN CREATION COMMAND (START PREPARATION WORKFLOW)
    // =========================================================================
    emit("Reading source sheet and starting preflight validation...");

    // 1. Extract requested IDs or Names
    const promptCampId = DynamicSheetFilter.parseIdFromMessage(msg, "campaign");
    const promptAdSetId = DynamicSheetFilter.parseIdFromMessage(msg, "adset");

    const promptCampName = DynamicSheetFilter.parseNameFromMessage(msg, "campaign");
    const promptAdSetName = DynamicSheetFilter.parseNameFromMessage(msg, "adset");

    const existingCampaignId = promptCampId || session?.existingCampaignId || null;
    const existingAdSetId = promptAdSetId || session?.existingAdSetId || null;

    const campaignName = promptCampName || (existingCampaignId ? `Target Campaign (${existingCampaignId})` : (session?.campaignName || "NWTS|Image_Test"));
    const adSetName = promptAdSetName || (existingAdSetId ? `Target AdSet (${existingAdSetId})` : (session?.adSetName || "NWTS|test"));

    // 2. Read complete dataset from source
    let explicitSheetUrl = null;
    const urlMatch = msg.match(/https?:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/i);
    if (urlMatch) explicitSheetUrl = urlMatch[0];

    const rawSourceData = await SourceSheetReader.readSource({
      userId,
      sheetUrlOrId: explicitSheetUrl,
    });

    if (rawSourceData.rows.length === 0) {
      return {
        content: `### ⚠️ No Data Rows Found in Connected Sheet\n\nI connected to **"${rawSourceData.spreadsheetName || "your sheet"}"**, but found **0 populated rows**.\n\nPlease ensure your Excel or Google Sheet contains rows with creative media and ad details.`,
        toolCalls: [],
      };
    }

    // Apply dynamic row range / row list / field value filters from user prompt
    const {
      filteredSource,
      filterApplied,
      filterSummary,
      filterCriteria,
    } = this.applyFiltersToSourceData(rawSourceData, msg);

    if (filterApplied && filteredSource.rows.length === 0) {
      return {
        content: `### ⚠️ No Rows Matched Your Filter\n\nYour filter (**${filterSummary}**) did not match any populated rows in **"${rawSourceData.spreadsheetName || "the sheet"}"**.\n\nAvailable sheet rows: **Row #2 to #${rawSourceData.rows[rawSourceData.rows.length - 1]?.rowNumber || rawSourceData.rows.length + 1}** (${rawSourceData.rows.length} total populated rows).\n\nPlease check your row numbers or filter values and try again.`,
        toolCalls: [],
      };
    }

    const sourceData = filteredSource;

    // 3. Validate filtered sheet data across all levels
    emit("Validating fields at Campaign, Ad Set, Ad, and Media levels...");
    const valResult = await CampaignValidator.validate({
      campaignName,
      adSetName,
      metaAccountId,
      accountDoc,
      sourceData,
    });

    // 4. Create or update preparation session in MongoDB
    const sessionId = session?.sessionId || `prep_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    session = await CampaignPreparationSession.findOneAndUpdate(
      { conversationId, userId },
      {
        $set: {
          sessionId,
          conversationId,
          userId,
          metaAccountId: metaAccountId || accountDoc?.accountId || null,
          status: valResult.isValid ? "READY_FOR_REVIEW" : "NEEDS_USER_INPUT",
          campaignName,
          adSetName,
          existingCampaignId,
          existingAdSetId,
          ...(existingCampaignId ? { "creationJob.metaCampaignId": existingCampaignId } : {}),
          ...(existingAdSetId ? { "creationJob.metaAdSetId": existingAdSetId } : {}),
          campaignType: valResult.campaignType,
          objective: valResult.objective,
          appId: valResult.appId || null,
          objectStoreUrl: valResult.objectStoreUrl || null,
          pixelId: valResult.pixelId || null,
          filterCriteria: filterCriteria || null,
          source: {
            type: sourceData.sourceType,
            sheetUrl: sourceData.sheetUrl,
            spreadsheetId: sourceData.spreadsheetId,
            spreadsheetName: sourceData.spreadsheetName,
            worksheetName: sourceData.worksheetName,
            totalRows: sourceData.totalRows,
            headerRow: sourceData.headerRowNumber,
            dataRowStart: sourceData.dataRowStart,
            dataFingerprint: sourceData.dataFingerprint,
            lastSyncedAt: new Date(),
          },
          eligibleRows: sourceData.eligibleRows,
          excludedRows: sourceData.excludedRows,
          validationReport: {
            summaryTable: valResult.summaryTable,
            campaignIssues: valResult.campaignIssues,
            adSetIssues: valResult.adSetIssues,
            adIssues: valResult.adIssues,
            mediaIssues: valResult.mediaIssues,
            blockingCount: valResult.blockingCount,
            warningCount: valResult.warningCount,
          },
          missingFields: valResult.missingFields,
          approval: { status: "NONE" },
          auditHistory: [
            {
              action: "INITIAL_VALIDATION",
              performedBy: userEmail || "USER",
              details: {
                totalRows: sourceData.totalRows,
                blockingCount: valResult.blockingCount,
                filterApplied,
                filterSummary,
              },
              timestamp: new Date(),
            },
          ],
        },
      },
      { upsert: true, new: true }
    );

    let outputMd = "";
    if (filterApplied && filterSummary) {
      outputMd += `> 🎯 **Custom Row/Field Selection Applied**: ${filterSummary} (${sourceData.totalRows} ad rows selected from ${rawSourceData.rows.length} total sheet rows)\n\n`;
    }
    outputMd += CampaignValidator.formatReportMarkdown(valResult);

    // If blocking errors exist: ask missing fields. ZERO calls to Meta creation API!
    if (!valResult.isValid) {
      outputMd += `\n\n` + MissingFieldCollector.formatQuestionsMarkdown(valResult.missingFields);
    } else {
      // If valid: build and show the 3 Preview Tables + Approve/Edit actions
      const preview = PreviewBuilder.buildPreview({
        validationResult: valResult,
        sourceData,
        version: 1,
      });
      session.preview = preview;
      await session.save();

      outputMd += `\n\n` + PreviewBuilder.formatPreviewMarkdown(preview);
    }

    return {
      content: outputMd,
      preparationSession: session,
      toolCalls: [
        {
          toolName: "validate_campaign_preparation",
          toolArgs: { campaignName, adSetName, totalRows: sourceData.totalRows },
          toolResult: {
            status: valResult.isValid ? "READY_FOR_REVIEW" : "NEEDS_USER_INPUT",
            blockingCount: valResult.blockingCount,
            eligibleRowsCount: sourceData.eligibleRows.length,
          },
          status: "SUCCESS",
        },
      ],
    };
  }
}

export default CampaignPreparationService;
