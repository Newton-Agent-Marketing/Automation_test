import crypto from "crypto";
import CampaignPreparationSession from "../../models/campaignPreparationSession.js";
import { SourceSheetReader } from "./sourceSheetReader.js";
import { CampaignValidator } from "./campaignValidator.js";
import { MissingFieldCollector } from "./missingFieldCollector.js";
import { SheetUpdateService } from "./sheetUpdateService.js";
import { PreviewBuilder } from "./previewBuilder.js";
import { MetaAdsOrchestrator } from "./metaAdsOrchestrator.js";
import DynamicSheetFilter from "../data/dynamicSheetFilter.js";
import { DynamicFieldEditor } from "./dynamicFieldEditor.js";

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
  static isApprovalCommand(msg, session = null) {
    if (!msg || typeof msg !== "string") return false;
    // Guard: If there is an active pending edit awaiting confirmation, the message is NOT campaign approval!
    if (session && session.pendingEdit) {
      return false;
    }

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
  static isEditCommand(msg, session = null) {
    if (session && session.pendingEdit) return true;
    if (!msg || typeof msg !== "string") return false;
    const clean = msg.toLowerCase().trim();
    if (
      clean.startsWith("edit") ||
      clean.includes("edit") ||
      clean.includes("change") ||
      clean.includes("update") ||
      clean.includes("replace") ||
      clean.includes("modify") ||
      clean.startsWith("set ") ||
      clean.includes("i want to edit") ||
      clean.includes("want to edit")
    ) {
      return true;
    }
    // Pattern: "field, value" e.g. "budget, 500" or "headline: Diwali Sale"
    if (/^[a-z0-9_\s-]+[,:=]\s*.+$/i.test(clean)) {
      return true;
    }
    return false;
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

    // 0. Extract lineage flow and context node data from AI Context
    let contextNodeData = session?.contextNodeData || {};
    try {
      const { executeAgentTool, resolveAiContextSelection } = await import("../agent/queryDbMetrics.js");
      const aiCtx = await executeAgentTool("get_user_ai_context", { userId });
      if (aiCtx) {
        // Multi-Unit, Multi-Channel & Multi-Sheet dynamic resolution
        const selection = typeof resolveAiContextSelection === "function"
          ? resolveAiContextSelection({ aiCtx, userMessage: msg, requestedChannel: "Meta Ads" })
          : null;

        const resolvedBu = selection?.businessUnit || aiCtx.businessUnitsHierarchy?.[0] || {};
        const resolvedChannel = selection?.channel || aiCtx.adChannels?.[0] || {};
        const resolvedProduct = selection?.product || aiCtx.products?.[0] || {};
        const resolvedBrief = selection?.brief || aiCtx.marketingBriefs?.[0] || {};
        const resolvedWarehouse = selection?.warehouse || aiCtx.dataWarehouses?.[0] || {};
        const resolvedSheet = selection?.selectedSheet || resolvedWarehouse?.sheets?.[0] || null;

        const primaryFlow = aiCtx.flows?.[0];
        const flowParams = primaryFlow?.campaignLaunchParameters || {};

        contextNodeData = {
          adAccountId: resolvedChannel.accountId || flowParams.accountId || null,
          accountName: resolvedChannel.accountName || flowParams.accountName || null,
          channel: resolvedChannel.channel || resolvedChannel.channelName || flowParams.channel || "Meta Ads",
          funnelEvent: resolvedChannel.funnelEvent || resolvedBrief.funnelEvent || flowParams.funnelEvent || "Purchase",
          funnelDescription: resolvedChannel.funnelDescription || "",
          productName: resolvedProduct.productName || resolvedProduct.name || flowParams.productName || null,
          productUrl: resolvedProduct.productUrl || resolvedProduct.url || flowParams.productUrl || null,
          productPrice: resolvedProduct.productPrice !== undefined ? resolvedProduct.productPrice : flowParams.productPrice,
          products: resolvedProduct.products || resolvedProduct.catalog || flowParams.products || [],
          briefName: resolvedBrief.briefName || resolvedBrief.name || flowParams.briefName || null,
          metricsList: resolvedBrief.metricsList || flowParams.metricsList || [],
          sheetUrl: resolvedSheet?.sheetUrl || resolvedWarehouse.sheetUrl || flowParams.sheetUrl || null,
          sheets: resolvedWarehouse.sheets || flowParams.sheets || [],
          selectedSheet: resolvedSheet,
          businessUnitName: resolvedBu.name || resolvedChannel.businessUnitName || flowParams.businessUnitName || null,
          rawFlowSummary: primaryFlow?.flowSummary || null,
        };
      }
    } catch (ctxErr) {
      console.warn("[CampaignPreparation Context Resolution Warning]:", ctxErr.message);
    }

    const effectiveMetaAccountId = contextNodeData.adAccountId || metaAccountId || session?.metaAccountId;

    let effectiveAccountDoc = accountDoc;
    if (!effectiveAccountDoc && effectiveMetaAccountId) {
      try {
        const cleanId = String(effectiveMetaAccountId).replace(/^act_/, "");
        const MetaAccount = (await import("../../models/metaAccount.js")).default;
        effectiveAccountDoc = await MetaAccount.findOne({
          userId,
          $or: [{ accountId: effectiveMetaAccountId }, { accountId: `act_${cleanId}` }, { accountId: cleanId }],
        }).lean();
      } catch (accErr) {
        console.warn("[CampaignPreparation AccountDoc Warning]:", accErr.message);
      }
    }

    // =========================================================================
    // CONSOLE INSPECTION: DISPLAY EXACT AI CONTEXT NODE DATA ROUTED TO META ADS
    // =========================================================================
    console.log("\n================================================================================");
    console.log("🌐 [AI CONTEXT ➔ META ADS DATA INSPECTION]");
    console.log("================================================================================");
    console.log("🏢 1. Business Unit Node    :", contextNodeData.businessUnitName || "(Default Business Unit)");
    console.log("📢 2. Ad Channel Node       :", {
      channel: contextNodeData.channel,
      targetAdAccountId: contextNodeData.adAccountId ? `act_${String(contextNodeData.adAccountId).replace(/^act_/, "")}` : "(None)",
      accountName: contextNodeData.accountName || "(Unlabeled)",
      funnelEvent: contextNodeData.funnelEvent,
      funnelDescription: contextNodeData.funnelDescription || "(None)",
    });
    console.log("📝 3. Marketing Brief Node  :", {
      briefName: contextNodeData.briefName || "(None)",
      targetMetrics: contextNodeData.metricsList?.length ? contextNodeData.metricsList : "(None)",
    });
    console.log("📦 4. Product Catalog Node  :", {
      productName: contextNodeData.productName || "(None)",
      landingPageUrl: contextNodeData.productUrl || "(None)",
      price: contextNodeData.productPrice,
      catalogCount: contextNodeData.products?.length || 0,
    });
    console.log("📊 5. Data Warehouse Node   :", {
      activeSheet: contextNodeData.selectedSheet?.sheetName || "(Primary Sheet)",
      sheetUrl: contextNodeData.selectedSheet?.sheetUrl || contextNodeData.sheetUrl || "(None)",
      activeDataLabels: contextNodeData.selectedSheet?.dataLabels || "(None)",
      totalSheetsCount: contextNodeData.sheets?.length || (contextNodeData.sheetUrl ? 1 : 0),
    });
    console.log("--------------------------------------------------------------------------------");
    console.log(`🔒 STRICT TARGET META AD ACCOUNT: ${effectiveMetaAccountId || "(None)"}`);
    console.log("================================================================================\n");

    // =========================================================================
    // CASE A: USER APPROVAL ACTION ("Approve Campaign & Create Ads" or Retry)
    // =========================================================================
    if (!session?.pendingEdit && this.isApprovalCommand(msg, session) && session && (session.status === "READY_FOR_REVIEW" || session.status === "FAILED" || session.status === "APPROVED" || session.status === "STALE_APPROVAL")) {
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
            metaAccountId: effectiveMetaAccountId,
            accountDoc: effectiveAccountDoc,
            sourceData: latestSource,
            userAnswers: session.userAnswers || {},
            contextNodeData,
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
      session.contextNodeData = contextNodeData;
      if (effectiveMetaAccountId) session.metaAccountId = effectiveMetaAccountId;
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
    // CASE B: USER EDIT DETAILS ACTION (Dynamic Schema Discovery & Intelligent Field Editing)
    // =========================================================================
    if (session && (session.pendingEdit || this.isEditCommand(msg, session))) {
      emit("Analyzing fields and resolving edit intent...");
      session.status = "EDITING";

      const editResult = await DynamicFieldEditor.handleChatEdit({
        session,
        userMessage: msg,
        userId,
        userEmail,
        onProgress,
      });

      // If an update was applied, re-read source data, revalidate, and rebuild preview
      if (editResult.actionTaken === "APPLIED_UPDATE") {
        emit("Revalidating campaign configuration and updating preview...");

        // Invalidate old approval snapshot since data changed
        session.approval = { status: "NONE", approvedAt: null, approvedBy: null, snapshot: null };

        // 1. Re-read latest source data
        let sourceData = null;
        try {
          const rawSource = await SourceSheetReader.readSource({
            userId,
            sheetUrlOrId: session.source?.sheetUrl || session.source?.spreadsheetId,
            filePath: session.source?.filePath,
            worksheetName: session.source?.worksheetName,
          });
          const filtered = this.applyFiltersToSourceData(rawSource, "", session.filterCriteria);
          sourceData = filtered.filteredSource;
          if (sourceData?.dataFingerprint) {
            session.source.dataFingerprint = sourceData.dataFingerprint;
          }
        } catch (srcErr) {
          console.warn("[DynamicFieldEditor Re-read Warning]:", srcErr.message);
        }

        // 2. Revalidate
        const valResult = await CampaignValidator.validate({
          campaignName: session.campaignName,
          adSetName: session.adSetName,
          metaAccountId: effectiveMetaAccountId,
          accountDoc: effectiveAccountDoc,
          sourceData: sourceData || { headers: [], rows: [] },
          userAnswers: session.userAnswers || {},
          contextNodeData,
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
        session.contextNodeData = contextNodeData;
        if (effectiveMetaAccountId) session.metaAccountId = effectiveMetaAccountId;

        let replyMd = `### ✏️ Details Updated Successfully\n\n`;
        replyMd += editResult.content + `\n\n`;

        if (valResult.isValid) {
          session.status = "READY_FOR_REVIEW";
          const newVersion = (session.preview?.version || 1) + 1;
          const newPreview = PreviewBuilder.buildPreview({
            validationResult: valResult,
            sourceData: sourceData || { headers: [], rows: [] },
            userAnswers: session.userAnswers || {},
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
          toolCalls: editResult.toolCalls || [
            {
              toolName: "update_field",
              toolArgs: { instruction: msg },
              toolResult: editResult,
              status: "SUCCESS",
            },
          ],
        };
      }

      // If waiting for confirmation, clarification, or prompt:
      await session.save();
      return {
        content: editResult.content,
        preparationSession: session,
        toolCalls: editResult.toolCalls || [],
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
          metaAccountId: effectiveMetaAccountId,
          accountDoc: effectiveAccountDoc,
          sourceData,
          userAnswers: parsedAnswers,
          contextNodeData,
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
        session.contextNodeData = contextNodeData;
        if (effectiveMetaAccountId) session.metaAccountId = effectiveMetaAccountId;
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

    const campaignName = promptCampName || (existingCampaignId ? `Target Campaign (${existingCampaignId})` : (session?.campaignName || (contextNodeData?.productName ? `${contextNodeData.productName}|Campaign` : "NWTS|Image_Test")));
    const adSetName = promptAdSetName || (existingAdSetId ? `Target AdSet (${existingAdSetId})` : (session?.adSetName || (contextNodeData?.funnelEvent ? `${contextNodeData.funnelEvent}|AdSet` : "NWTS|test")));

    // 2. Read complete dataset from source
    let explicitSheetUrl = null;
    const urlMatch = msg.match(/https?:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/i);
    if (urlMatch) {
      explicitSheetUrl = urlMatch[0];
    } else if (contextNodeData?.selectedSheet?.sheetUrl) {
      explicitSheetUrl = contextNodeData.selectedSheet.sheetUrl;
    } else if (contextNodeData?.sheetUrl) {
      explicitSheetUrl = contextNodeData.sheetUrl;
    } else if (contextNodeData?.sheets?.length > 0 && contextNodeData.sheets[0]?.sheetUrl) {
      explicitSheetUrl = contextNodeData.sheets[0].sheetUrl;
    }

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
      metaAccountId: effectiveMetaAccountId,
      accountDoc: effectiveAccountDoc,
      sourceData,
      contextNodeData,
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
          metaAccountId: effectiveMetaAccountId || effectiveAccountDoc?.accountId || null,
          contextNodeData,
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
