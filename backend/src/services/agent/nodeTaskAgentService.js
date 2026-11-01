// backend/src/services/agent/nodeTaskAgentService.js
import axios from "axios";
import AiContext from "../../models/aiContextModel.js";
import MetaAccount from "../../models/metaAccount.js";
import GoogleAccount from "../../models/googleAccountModel.js";
import { AGENT_TOOLS_DEFINITIONS, executeAgentTool } from "./queryDbMetrics.js";
import SheetInspectorService from "./sheetInspectorService.js";
import DynamicSheetExecutionService from "./dynamicSheetExecutionService.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOOL_ITERATIONS = 12;

function sanitizeToolArgs(args = {}) {
  if (!args || typeof args !== "object") return {};
  const clone = {};
  for (const [k, v] of Object.entries(args)) {
    if (["accessToken", "refreshToken", "token", "apiKey", "clientSecret", "sessionSheetContext"].includes(k)) {
      continue;
    }
    if (k === "records" && Array.isArray(v)) {
      clone.recordsCount = v.length;
      clone.recordsSample = v.slice(0, 2);
      continue;
    }
    clone[k] = v;
  }
  return clone;
}

function summarizeToolResult(toolName, result) {
  if (!result || typeof result !== "object") {
    return String(result ?? "Completed");
  }
  if (result.error || result.success === false) {
    return `Error: ${result.error || result.message || result.clarificationQuestion || "Operation failed"}`;
  }

  switch (toolName) {
    case "list_connected_sheets":
      return `Found ${result.totalConnectedSheets ?? 0} connected spreadsheet(s): ${(result.sheets || [])
        .map((s) => `#${s.sheetIndex} "${s.sheetName}"`)
        .join(", ")}.`;
    case "inspect_sheet_schema":
      return `Inspected Sheet #${result.sheetIndex} "${result.sheetName}" -> Tab "${result.targetTab}" (${(result.headers || []).length} columns, ${result.totalRows ?? 0} rows).`;
    case "inspect_sheet_and_map_fields": {
      const mappedCount = result.classification?.mappedColumns?.length ?? 0;
      const unmappedCount = result.classification?.unmappedColumns?.length ?? 0;
      return `Inspected "${result.sheetName}" -> "${result.targetTab}": ${(result.headers || []).length} headers (${mappedCount} semantically mapped, ${unmappedCount} custom/unmapped, required granularity: ${result.classification?.requiredGranularity || "campaign"}).`;
    }
    case "append_rows_to_connected_sheet":
      return `Appended ${result.rowsAppended ?? 0} row(s) to "${result.sheetName}" -> "${result.targetTab}" (${result.updatedRange || "A1"}, verified: ${Boolean(result.verified)}, reporting date: ${result.reportingDateUsed || "N/A"}).`;
    case "update_connected_sheet_cells":
      return result.message || `Updated ${result.updatedCount ?? 0} cell(s) in "${result.sheetName}" -> "${result.targetTab}" (verified: ${Boolean(result.verified)}).`;
    case "extract_sheet_video_links":
      return `Extracted ${result.totalVideosFound ?? 0} video link(s) across ${result.totalRowsScanned ?? 0} row(s) in "${result.sheetName}" -> "${result.targetTab}".`;
    case "fetch_live_meta_ads_mcp":
      if (result.campaigns) {
        return `Fetched ${result.totalCampaigns ?? result.campaigns.length} live campaign(s) from Meta account ${result.accountName || ""} (${result.accountId || ""}).`;
      }
      if (result.insights) {
        return `Fetched ${result.totalInsightsRows ?? result.insights.length} live ${result.level || "campaign"}-level insight row(s) (total spend: ${result.currency || "INR"} ${result.totalAccountSpend ?? 0}) from ${result.accountId || "Meta Ads"}.`;
      }
      return `Executed Meta Ads MCP operation (${result.status || "OK"}).`;
    case "get_live_adsets":
      return `Fetched ${result.totalAdSets ?? (result.adSets || []).length} live Ad Set(s) from Meta account ${result.accountName || ""} (${result.accountId || ""}).`;
    case "get_live_ads":
    case "get_live_ad_creatives":
      return `Fetched ${result.totalAds ?? result.totalCreatives ?? (result.creatives || []).length} live Ad(s) from Meta account ${result.accountName || ""} (${result.accountId || ""}).`;
    case "fetch_live_google_ads_mcp":
    case "query_database_metrics":
      return result.message || `Retrieved ${result.totalRecords ?? (result.campaigns || []).length} record(s) from ${result.channel || "ad platform"}.`;
    case "get_user_connected_accounts":
      return `Discovered ${result.totalConnectedAccounts ?? (result.accounts || []).length} connected advertising account(s).`;
    case "get_user_ai_context":
      return `Loaded user AI Context configuration.`;
    default:
      return result.message || result.status || `Executed ${toolName} successfully.`;
  }
}

function fmtNum(val, decimals = 2) {
  if (val === null || val === undefined || val === "") return "—";
  const num = Number(val);
  if (!Number.isFinite(num)) return String(val);
  return Number.isInteger(num) ? num.toLocaleString("en-IN") : num.toFixed(decimals);
}

export class NodeTaskAgentService {
  /**
   * Gather complete connected context for the user:
   * - Connected Meta Ads & Google Ads accounts
   * - AI Context selected channel, account, business unit, and connected Google Sheets + selected tabs
   * - Available MCP/API tools and their JSON schemas
   */
  static async loadExecutionEnvelopeContext(userId) {
    const mongoose = (await import("mongoose")).default;
    const validUserId = userId && mongoose?.Types?.ObjectId?.isValid(userId) ? userId : null;

    const [aiContextDoc, metaAccounts, googleAccounts, connectedSheets] = await Promise.all([
      validUserId && mongoose?.connection?.readyState === 1
        ? AiContext.findOne({ userId: validUserId }).lean().catch(() => null)
        : null,
      validUserId && mongoose?.connection?.readyState === 1
        ? MetaAccount.find({ userId: validUserId, isActive: true }).select("-accessToken").lean().catch(() => [])
        : [],
      validUserId && mongoose?.connection?.readyState === 1
        ? GoogleAccount.find({ userId: validUserId, isActive: true }).select("-accessToken -refreshToken").lean().catch(() => [])
        : [],
      SheetInspectorService.listConnectedSpreadsheets(validUserId).catch(() => []),
    ]);

    const channelNodes = (aiContextDoc?.nodes || []).filter((n) => n.type === "ad_channel");
    const selectedChannelNode = channelNodes[0] || null;
    const selectedChannel = selectedChannelNode?.data?.channelName || selectedChannelNode?.data?.channel || (metaAccounts.length > 0 ? "Meta Ads" : googleAccounts.length > 0 ? "Google Ads" : null);
    const selectedAdAccountId =
      selectedChannelNode?.data?.adAccountId ||
      (metaAccounts.length === 1 ? metaAccounts[0].accountId : null);

    const availableTools = AGENT_TOOLS_DEFINITIONS.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      inputSchema: t.function.parameters || { type: "object", properties: {} },
    }));

    return {
      selectedChannel,
      selectedAdAccountId,
      aiContextSummary: {
        hasContext: Boolean(aiContextDoc),
        nodeCount: aiContextDoc?.nodes?.length || 0,
        channelNodes: channelNodes.map((n) => ({
          id: n.id,
          label: n.label,
          channel: n.data?.channelName || n.data?.channel,
          adAccountId: n.data?.adAccountId,
          adAccountName: n.data?.adAccountName,
        })),
      },
      metaAccounts: metaAccounts.map((a) => ({
        accountId: a.accountId.startsWith("act_") ? a.accountId : `act_${a.accountId}`,
        accountName: a.accountName,
        currency: a.currency || "INR",
      })),
      googleAccounts: googleAccounts.map((a) => ({
        accountId: a.selectedCustomerId || a.accountId,
        accountName: a.accountName,
        currency: a.currency || "INR",
      })),
      connectedSheets: connectedSheets.map((s) => ({
        sheetIndex: s.sheetIndex,
        spreadsheetId: s.spreadsheetId,
        sheetName: s.sheetName,
        sheetUrl: s.sheetUrl,
        availableTabs: (s.availableTabs || []).map((t) => t.title || t.name || String(t)),
        selectedTabIds: s.selectedTabIds || [],
        selectedTabNames: (s.selectedTabsData || []).map((t) => t.tabName).filter(Boolean),
      })),
      availableTools,
    };
  }

  /**
   * Aggregate structured outputs produced by upstream connected nodes in the current execution.
   */
  static collectUpstreamStructuredData(sharedWorkflowContext = {}) {
    const previousList = Array.isArray(sharedWorkflowContext?.previousNodeResults)
      ? sharedWorkflowContext.previousNodeResults
      : [];
    const nodeMap = sharedWorkflowContext?.nodeResults && typeof sharedWorkflowContext.nodeResults === "object"
      ? Object.values(sharedWorkflowContext.nodeResults)
      : [];

    const ordered = previousList.length > 0 ? previousList : nodeMap;

    const aggregated = {
      hasUpstreamNodes: ordered.length > 0,
      upstreamNodeSummaries: [],
      campaigns: [],
      adSets: [],
      ads: [],
      insights: [],
      unifiedRecords: [],
      sheetInspection: null,
      reportingDate: null,
      accountId: null,
      accountName: null,
      currency: null,
    };

    const seenCamp = new Set();
    const seenAdSet = new Set();
    const seenAd = new Set();

    for (const item of ordered) {
      if (!item || item.status !== "completed") continue;
      aggregated.upstreamNodeSummaries.push({
        nodeId: item.nodeId,
        nodeLabel: item.nodeLabel,
        instruction: item.originalInstruction || "",
        outputSummary: typeof item.outputText === "string" ? item.outputText.slice(0, 1500) : "",
      });

      const sd = item.structuredData || {};
      if (sd.accountId && !aggregated.accountId) aggregated.accountId = sd.accountId;
      if (sd.accountName && !aggregated.accountName) aggregated.accountName = sd.accountName;
      if (sd.currency && !aggregated.currency) aggregated.currency = sd.currency;
      if (sd.sheetInspection) aggregated.sheetInspection = sd.sheetInspection;
      if (sd.reportingDate) aggregated.reportingDate = sd.reportingDate;

      for (const c of sd.campaigns || []) {
        const key = String(c.id || c.campaignId || c.name || "");
        if (key && !seenCamp.has(key)) {
          seenCamp.add(key);
          aggregated.campaigns.push(c);
        }
      }
      for (const as of sd.adSets || []) {
        const key = String(as.id || as.adSetId || as.name || "");
        if (key && !seenAdSet.has(key)) {
          seenAdSet.add(key);
          aggregated.adSets.push(as);
        }
      }
      for (const ad of sd.ads || []) {
        const key = String(ad.adId || ad.id || ad.adName || "");
        if (key && !seenAd.has(key)) {
          seenAd.add(key);
          aggregated.ads.push(ad);
        }
      }
      if (Array.isArray(sd.insights) && sd.insights.length > 0) {
        aggregated.insights.push(...sd.insights);
      }
      if (Array.isArray(sd.unifiedRecords) && sd.unifiedRecords.length > 0) {
        aggregated.unifiedRecords = sd.unifiedRecords;
      }
    }

    return aggregated;
  }

  /**
   * Attempt multi-turn Claude tool-use execution when a valid ANTHROPIC_API_KEY is configured.
   * Returns null if API key is missing or returns 401 authentication failure so the
   * schema-driven dynamic planner executes seamlessly.
   */
  static async tryExecuteWithAnthropicLoop({
    userId,
    instruction,
    node,
    workflowId,
    executionId,
    envelopeContext,
    upstream,
    sharedWorkflowContext,
    runToolTracked,
  }) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (
      !apiKey ||
      apiKey.trim() === "" ||
      apiKey.includes("your_key") ||
      this._invalidAnthropicKey === apiKey
    ) {
      return null;
    }

    const anthropicTools = envelopeContext.availableTools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));

    const systemPrompt = [
      `You are an autonomous AI Automation Execution Agent executing a workflow node.`,
      `RULES:`,
      `1. Read the complete node instruction carefully and execute every part of it using real MCP/API tools.`,
      `2. Never fabricate data, campaign IDs, metrics, or Google Sheets write confirmations.`,
      `3. Use connected context (selected account, connected Google Sheets, selected tabs, upstream node outputs, and workflow dates/timezone).`,
      `4. When mapping data to Google Sheets, inspect actual sheet headers first via inspect_sheet_and_map_fields, map semantically, format dates to match the sheet, and write via append_rows_to_connected_sheet or update_connected_sheet_cells.`,
      `5. Never substitute today's date if the user specified another date. If required parameters are genuinely ambiguous or missing, start your final answer with "WAITING_FOR_INPUT:" followed by the exact clarification question.`,
      `6. Keep your final output factual, structured in clean Markdown tables/bullets, with zero private chain-of-thought.`,
    ].join("\n");

    const contextPayload = {
      workflowId,
      executionId,
      nodeId: node?.id,
      nodeType: node?.type || "generic",
      nodeLabel: node?.label || "Custom Task",
      selectedChannel: envelopeContext.selectedChannel,
      selectedAdAccountId: envelopeContext.selectedAdAccountId,
      connectedMetaAccounts: envelopeContext.metaAccounts,
      connectedGoogleAccounts: envelopeContext.googleAccounts,
      connectedGoogleSheets: envelopeContext.connectedSheets,
      workflowDateConfig: sharedWorkflowContext?.dateConfig || null,
      workflowTimeConfig: sharedWorkflowContext?.timeConfig || null,
      scheduledExecutionDate: sharedWorkflowContext?.scheduledDate || null,
      timezone: sharedWorkflowContext?.timezone || "Asia/Kolkata",
      previousNodes: {
        summaries: upstream.upstreamNodeSummaries,
        campaignsCount: upstream.campaigns.length,
        campaignsSample: upstream.campaigns.slice(0, 30),
        adSetsCount: upstream.adSets.length,
        adSetsSample: upstream.adSets.slice(0, 40),
        adsCount: upstream.ads.length,
        insightsCount: upstream.insights.length,
        unifiedRecordsCount: upstream.unifiedRecords.length,
        unifiedRecordsSample: upstream.unifiedRecords.slice(0, 30),
        sheetInspection: upstream.sheetInspection
          ? {
              sheetIndex: upstream.sheetInspection.sheetIndex,
              sheetName: upstream.sheetInspection.sheetName,
              targetTab: upstream.sheetInspection.targetTab,
              headers: upstream.sheetInspection.headers,
              requiredGranularity: upstream.sheetInspection.classification?.requiredGranularity,
            }
          : null,
        reportingDate: upstream.reportingDate,
      },
    };

    const messages = [
      {
        role: "user",
        content: `### COMPLETE NODE INSTRUCTION\n${instruction}\n\n### EXECUTION CONTEXT\n\`\`\`json\n${JSON.stringify(
          contextPayload,
          null,
          2
        )}\n\`\`\``,
      },
    ];

    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
    let finalMarkdown = "";

    for (let turn = 0; turn < MAX_TOOL_ITERATIONS; turn++) {
      let resp;
      try {
        resp = await axios.post(
          ANTHROPIC_API_URL,
          {
            model,
            max_tokens: 4096,
            temperature: 0.1,
            system: systemPrompt,
            tools: anthropicTools,
            messages,
          },
          {
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": ANTHROPIC_VERSION,
              "content-type": "application/json",
            },
            timeout: 45000,
          }
        );
      } catch (err) {
        const status = err.response?.status;
        if (status === 401 || status === 403) {
          this._invalidAnthropicKey = apiKey;
          if (turn === 0) return null;
        }
        if (
          turn === 0 &&
          (status === 400 ||
            status === 404 ||
            status === 429 ||
            status >= 500 ||
            !err.response)
        ) {
          return null;
        }
        throw err;
      }

      const contentBlocks = resp.data?.content || [];
      messages.push({ role: "assistant", content: contentBlocks });

      const toolUseBlocks = contentBlocks.filter((b) => b.type === "tool_use");
      const textBlocks = contentBlocks.filter((b) => b.type === "text").map((b) => b.text);
      if (textBlocks.length > 0) {
        finalMarkdown = textBlocks.join("\n\n").trim();
      }

      if (toolUseBlocks.length === 0) {
        break;
      }

      const toolResultsContent = [];
      for (const tu of toolUseBlocks) {
        const injectedArgs = {
          ...(tu.input || {}),
          userId,
          userMessage: instruction,
          userInstruction: instruction,
          dateNodeConfig: sharedWorkflowContext?.dateConfig || null,
          timeNodeConfig: sharedWorkflowContext?.timeConfig || null,
          scheduledDate: sharedWorkflowContext?.scheduledDate || null,
          upstreamReportingDate: upstream.reportingDate || null,
          timezone: sharedWorkflowContext?.timezone || "Asia/Kolkata",
        };
        if (tu.name === "append_rows_to_connected_sheet" && (!Array.isArray(injectedArgs.records) || injectedArgs.records.length === 0) && upstream.unifiedRecords.length > 0) {
          injectedArgs.records = upstream.unifiedRecords;
        }

        try {
          const out = await runToolTracked(tu.name, injectedArgs);
          toolResultsContent.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(out),
          });
        } catch (toolErr) {
          toolResultsContent.push({
            type: "tool_result",
            tool_use_id: tu.id,
            is_error: true,
            content: JSON.stringify({ error: toolErr.message }),
          });
        }
      }

      messages.push({ role: "user", content: toolResultsContent });
    }

    return { finalMarkdown };
  }

  /**
   * Schema-driven dynamic multi-step task planner & autonomous executor.
   * Dynamically decomposes any user instruction into required tool calls, consumes
   * upstream node structured outputs, performs semantic sheet mapping & date resolution,
   * executes real API calls, and builds factual outputs grounded 100% in tool results.
   */
  static async executeDynamicPlan({
    userId,
    instruction,
    node,
    envelopeContext,
    upstream,
    sharedWorkflowContext,
    runToolTracked,
  }) {
    const raw = String(instruction || "").trim();
    const lower = raw.toLowerCase();

    const executionPlan = [];
    const integrations = new Set();

    // Parse explicit account ID if written in instruction
    const explicitMetaActMatch = raw.match(/\bact_(\d{4,25})\b/i);
    const explicitAccountId = explicitMetaActMatch
      ? `act_${explicitMetaActMatch[1]}`
      : node?.config?.metaAccountId || upstream.accountId || undefined;

    // Parse sheet / tab targeting from instruction
    const requestedSheetIndex = SheetInspectorService.parseRequestedSheetOrdinal(raw);

    // Semantic capability signals derived from the complete instruction + upstream context
    const mentionsGoogleAds = /\bgoogle\s+ads\b|\bgads\b|\bad\s+groups?\b|\bkeywords?\b|\bcustomer\s*id\b/i.test(raw);
    const mentionsSheet =
      /\b(google\s+sheets?|spreadsheets?|sheets?|worksheets?|tabs?|columns?|fields?|headers?|rows?|cells?|append|insert\s+into|write\s+(?:to|into)|map\s+every\s+value|map\s+.*\bfields?)\b/i.test(raw);
    const wantsAppendSheet =
      /\b(append|insert\s+(?:rows?|data|records?|into)|add\s+rows?|write\s+(?:data|rows?|records?|into|to)\b|log\s+.*\b(?:into|to)\s+.*sheet|push\s+.*\bsheet|populate\s+.*sheet|save\s+.*\b(?:into|to)\s+.*sheet)\b/i.test(raw);
    const wantsUpdateCell =
      !wantsAppendSheet &&
      /\b(update|set|change|edit|modify)\b/i.test(raw) &&
      (/\brow\s*#?\s*\d+\b/i.test(raw) || /\b[A-Z]{1,3}\d{1,5}\b/.test(raw) || /\bcolumn\b/i.test(raw));
    const wantsVideoLinks =
      /\b(video\s*links?|video\s*urls?|drive\s*links?|drive\s*urls?|smart\s*chips?|extract\s+videos?)\b/i.test(raw);
    const referencesUpstream =
      /\b(previous\s+node|prior\s+node|preceding\s+node|above\s+node|collected\s+in\s+the\s+previous|from\s+step\s*1|from\s+node\s*1|according\s+to\s+the\s+previous)\b/i.test(raw);

    const strippedUpstreamRef = referencesUpstream
      ? raw.replace(
          /\b(?:according\s+to|based\s+on|using|for|matching|from)\s+(?:the\s+)?(?:previous|prior|preceding|above)\s+node(?:'s)?\s+[^.!?\n]*/gi,
          ""
        )
      : raw;

    const wantsCampaigns =
      /\bcampaigns?\b/i.test(strippedUpstreamRef);
    const wantsAdSets =
      /\bad\s*sets?\b|\badsets?\b/i.test(strippedUpstreamRef);
    const strippedPlatformAds = strippedUpstreamRef
      .replace(/\b(?:meta|facebook|google|instagram|tiktok|linkedin)\s+ads\b/gi, "ad_platform")
      .replace(/\bcreative\s+(?:code|url|link|smart\s*chips?|status|format)\b/gi, "sheet_creative_field");
    const wantsAds =
      !wantsVideoLinks &&
      /\b(?:fetch|get|list|show|find|retrieve|check|inspect|pull)\b[^.!?\n]*\bads\b|\bad\s+names?\b|\bad\s+ids?\b|\bad\s+creatives?\b|\bcreatives?\b|\bads\s+according\s+to\b|\bads\s+for\b|\bads\s+under\b|\bads\s+in\b|\bcampaign,?\s*ad\s*set,?\s*(?:and\s+)?ad\b/i.test(strippedPlatformAds);
    const wantsMetricsOrInsights =
      /\b(performance|metrics?|insights?|spend|amount\s+spent|impressions?|reach|clicks?|ctr|cpc|cpm|cpa|cpr|roas|conversions?|purchases?|leads?|results?|compare|comparison|best[\s-]*performing|top[\s-]*performing|worst[\s-]*performing|analy[sz]e|analysis|suggest|improvements?|optimi[sz]e|recommendations?|report)\b/i.test(raw);
    const wantsComparison = /\b(compare|comparison|versus|vs\.?)\b/i.test(raw);
    const wantsAnalysisAndSuggestions = /\b(analy[sz]e|analysis|suggest|improvements?|optimi[sz]e|recommendations?|insights\s+and\s+action)\b/i.test(raw);
    const wantsMetaCreation = /\bcreate\b/i.test(raw) && /\b(meta\s+campaign|campaign|ad\s*set|video\s+ad)\b/i.test(raw);

    // State collected during multi-tool execution
    const state = {
      sheetInspection: upstream.sheetInspection || null,
      videoExtraction: null,
      cellUpdate: null,
      appendResult: null,
      dateResolution: null,
      campaigns: [...upstream.campaigns],
      adSets: [...upstream.adSets],
      ads: [...upstream.ads],
      insights: [...upstream.insights],
      allCampaignsPerformance: [],
      unifiedRecords: [...upstream.unifiedRecords],
      googleAdsData: null,
      accountId: explicitAccountId || upstream.accountId || envelopeContext.selectedAdAccountId || null,
      accountName: upstream.accountName || null,
      currency: upstream.currency || "INR",
      previewMapping: null,
    };

    // STEP A: Inspect Google Sheet structure when sheet reading, field discovery, mapping, or writing is involved
    if (mentionsSheet) {
      integrations.add("Google Sheets");
      if (wantsVideoLinks) {
        executionPlan.push("Inspect connected Google Sheet and extract & validate video/Drive URLs.");
        state.videoExtraction = await runToolTracked("extract_sheet_video_links", {
          userId,
          sheetIndex: requestedSheetIndex || undefined,
          userMessage: raw,
          validateUrls: true,
        });
        if (state.videoExtraction?.success === false) {
          throw new Error(state.videoExtraction.message || "Failed to extract video links from connected Google Sheet.");
        }
      } else if (wantsUpdateCell) {
        executionPlan.push("Locate target cell(s) in connected Google Sheet, update value, and verify write.");
        state.cellUpdate = await runToolTracked("update_connected_sheet_cells", {
          userId,
          sheetIndex: requestedSheetIndex || undefined,
          userMessage: raw,
        });
        if (state.cellUpdate?.success === false) {
          throw new Error(state.cellUpdate.message || "Failed to update connected Google Sheet cell.");
        }
      } else {
        executionPlan.push("Inspect connected Google Sheet metadata, selected worksheet tab, actual headers, and semantic column mappings.");
        const inspectRes = await runToolTracked("inspect_sheet_and_map_fields", {
          userId,
          sheetIndex: requestedSheetIndex || upstream.sheetInspection?.sheetIndex || undefined,
          tabName: upstream.sheetInspection?.targetTab && !requestedSheetIndex ? upstream.sheetInspection.targetTab : undefined,
          userMessage: raw,
        });
        if (!inspectRes?.success) {
          throw new Error(inspectRes?.message || "Failed to inspect connected Google Sheet.");
        }
        state.sheetInspection = inspectRes;
      }
    }

    // STEP B: Resolve dynamic reporting date (Section 7 rules)
    const dateHeaders = state.sheetInspection?.classification?.dateHeaders || [];
    const existingRows = state.sheetInspection?.sampleExistingRows || [];
    state.dateResolution = DynamicSheetExecutionService.resolveReportingDate({
      instruction: raw,
      dateNodeConfig: sharedWorkflowContext?.dateConfig || null,
      timeNodeConfig: sharedWorkflowContext?.timeConfig || null,
      scheduledDate: sharedWorkflowContext?.scheduledDate || null,
      upstreamReportingDate: upstream.reportingDate || null,
      timezone: sharedWorkflowContext?.timezone || "Asia/Kolkata",
      existingSheetRows: existingRows,
      dateHeaders,
    });

    if (!state.dateResolution.ok) {
      return {
        status: "WAITING_FOR_INPUT",
        clarificationQuestion: state.dateResolution.clarificationQuestion,
        executionPlan: ["Validate reporting date parameters before executing data queries."],
        integrationsInvolved: Array.from(integrations),
        state,
      };
    }

    // STEP C: Determine whether we need live Google Ads or Meta Ads queries
    const sheetReqs = state.sheetInspection?.classification?.requirements || null;
    const isPureDownstreamSheetWrite =
      wantsAppendSheet &&
      referencesUpstream &&
      (upstream.unifiedRecords.length > 0 || upstream.campaigns.length > 0 || upstream.insights.length > 0) &&
      !/\b(fetch|query|go\s+to\s+my\s+connected\s+meta)\b/i.test(raw);

    if (mentionsGoogleAds) {
      integrations.add("Google Ads");
      executionPlan.push("Query Google Ads performance metrics and campaigns for the resolved timeframe.");
      state.googleAdsData = await runToolTracked("query_database_metrics", {
        userId,
        channel: "google",
        startDate: state.dateResolution.timeRange?.since,
        endDate: state.dateResolution.timeRange?.until,
      });
    }

    const needsMetaFetch =
      !mentionsGoogleAds &&
      !isPureDownstreamSheetWrite &&
      (wantsCampaigns ||
        wantsAdSets ||
        wantsAds ||
        wantsMetricsOrInsights ||
        /\bmeta\s*ads?\b|\bfacebook\s*ads?\b|\bad\s+account\b/i.test(raw) ||
        (sheetReqs &&
          (wantsAppendSheet || /\bfetch\b|\bcollect\b|\bmatching\b|\bcorresponding\b/i.test(raw))));

    if (needsMetaFetch) {
      integrations.add("Meta Ads");

      const needCampCall =
        wantsCampaigns ||
        wantsMetricsOrInsights ||
        Boolean(sheetReqs?.needsCampaigns);
      const needAdSetCall =
        wantsAdSets ||
        Boolean(sheetReqs?.needsAdSets);
      const needAdsCall =
        wantsAds ||
        Boolean(sheetReqs?.needsAds);
      const needInsightsCall =
        wantsMetricsOrInsights ||
        wantsComparison ||
        wantsAnalysisAndSuggestions ||
        Boolean(sheetReqs?.needsPerformanceInsights);

      // Filter criteria from upstream node if current node asks to fetch according to previous node's data
      const upstreamCampIds =
        referencesUpstream && upstream.campaigns.length > 0
          ? upstream.campaigns.map((c) => String(c.id || c.campaignId)).filter(Boolean)
          : undefined;
      const upstreamCampNames =
        referencesUpstream && upstream.campaigns.length > 0
          ? upstream.campaigns.map((c) => String(c.name || c.campaignName)).filter(Boolean)
          : undefined;
      const upstreamAdSetIds =
        referencesUpstream && upstream.adSets.length > 0
          ? upstream.adSets.map((as) => String(as.id || as.adSetId)).filter(Boolean)
          : undefined;
      const upstreamAdSetNames =
        referencesUpstream && upstream.adSets.length > 0
          ? upstream.adSets.map((as) => String(as.name || as.adSetName)).filter(Boolean)
          : undefined;

      if (needCampCall && !(referencesUpstream && !wantsCampaigns && !needInsightsCall && !sheetReqs)) {
        executionPlan.push("Fetch live campaigns and status from connected Meta Ads account.");
        const campRes = await runToolTracked("fetch_live_meta_ads_mcp", {
          userId,
          ...(explicitAccountId ? { accountId: explicitAccountId } : {}),
          toolType: "get_live_campaigns_status",
          includeAds: false,
        });
        state.accountId = campRes.accountId || state.accountId;
        state.accountName = campRes.accountName || state.accountName;
        state.currency = campRes.currency || state.currency;
        state.campaigns = campRes.campaigns || [];
      }

      if (needAdSetCall) {
        executionPlan.push("Fetch live Ad Sets from connected Meta Ads account.");
        const adSetRes = await runToolTracked("get_live_adsets", {
          userId,
          ...(state.accountId ? { accountId: state.accountId } : {}),
          ...(upstreamCampIds ? { campaignIds: upstreamCampIds } : {}),
          ...(upstreamCampNames ? { campaignNames: upstreamCampNames } : {}),
        });
        state.accountId = adSetRes.accountId || state.accountId;
        state.accountName = adSetRes.accountName || state.accountName;
        state.currency = adSetRes.currency || state.currency;
        state.adSets = adSetRes.adSets || [];
      }

      if (needAdsCall) {
        executionPlan.push(
          referencesUpstream && (upstreamCampIds || upstreamAdSetIds)
            ? "Fetch live Ads filtered according to upstream Campaign and Ad Set data."
            : "Fetch live Ads and creative metadata from connected Meta Ads account."
        );
        const adsRes = await runToolTracked("get_live_ad_creatives", {
          userId,
          ...(state.accountId ? { accountId: state.accountId } : {}),
          ...(upstreamCampIds ? { campaignIds: upstreamCampIds } : {}),
          ...(upstreamCampNames ? { campaignNames: upstreamCampNames } : {}),
          ...(upstreamAdSetIds ? { adSetIds: upstreamAdSetIds } : {}),
          ...(upstreamAdSetNames ? { adSetNames: upstreamAdSetNames } : {}),
          includeInsights: Boolean(needInsightsCall),
          timeRange: state.dateResolution.isRange || state.dateResolution.source.startsWith("instruction_")
            ? state.dateResolution.timeRange || undefined
            : undefined,
          datePreset: state.dateResolution.timeRange ? undefined : (state.dateResolution.datePreset || "maximum"),
        });
        state.accountId = adsRes.accountId || state.accountId;
        state.accountName = adsRes.accountName || state.accountName;
        state.currency = adsRes.currency || state.currency;
        state.ads = adsRes.ads || adsRes.creatives || [];
      }

      if (needInsightsCall) {
        const insightLevel =
          state.sheetInspection?.classification?.requiredGranularity ||
          (wantsAds ? "ad" : wantsAdSets ? "adset" : "campaign");

        const useSpecificWindow =
          state.dateResolution.source.startsWith("instruction_") && state.dateResolution.timeRange;

        executionPlan.push(`Fetch live ${insightLevel}-level performance insights and derived metrics from Meta Ads.`);
        const insightsRes = await runToolTracked("fetch_live_meta_ads_mcp", {
          userId,
          ...(state.accountId ? { accountId: state.accountId } : {}),
          toolType: "get_live_campaign_insights",
          level: insightLevel,
          ...(upstreamCampIds ? { campaignIds: upstreamCampIds } : {}),
          timeRange: useSpecificWindow ? state.dateResolution.timeRange : undefined,
          datePreset: useSpecificWindow ? undefined : (state.dateResolution.datePreset || "maximum"),
        });
        state.accountId = insightsRes.accountId || state.accountId;
        state.accountName = insightsRes.accountName || state.accountName;
        state.currency = insightsRes.currency || state.currency;
        state.insights = insightsRes.insights || [];
        state.allCampaignsPerformance = insightsRes.allCampaignsPerformance || [];
      }

      // Build unified structured records for downstream nodes & sheet mapping
      const granularity =
        state.sheetInspection?.classification?.requiredGranularity ||
        (needAdsCall ? "ad" : needAdSetCall ? "adset" : "campaign");

      state.unifiedRecords = DynamicSheetExecutionService.buildUnifiedAdRecords({
        granularity,
        accountId: state.accountId || "",
        accountName: state.accountName || "",
        channel: "Meta Ads",
        currency: state.currency || "INR",
        campaigns: state.campaigns,
        adSets: state.adSets,
        ads: state.ads,
        insights: state.insights,
        includeZeroImpressionEntities: true,
      });
    } else if (isPureDownstreamSheetWrite && state.unifiedRecords.length === 0) {
      // Build unified records from upstream campaigns/adSets/ads/insights if not pre-built
      const granularity = state.sheetInspection?.classification?.requiredGranularity || "campaign";
      state.unifiedRecords = DynamicSheetExecutionService.buildUnifiedAdRecords({
        granularity,
        accountId: state.accountId || "",
        accountName: state.accountName || "",
        channel: "Meta Ads",
        currency: state.currency || "INR",
        campaigns: state.campaigns,
        adSets: state.adSets,
        ads: state.ads,
        insights: state.insights,
        includeZeroImpressionEntities: true,
      });
    }

    // STEP D: Semantic Field Mapping Preview & Verified Row Appending into Google Sheets
    if (state.sheetInspection && state.unifiedRecords.length > 0 && !wantsAppendSheet) {
      executionPlan.push("Semantically map fetched Meta Ads fields to inspected Google Sheet columns.");
      state.previewMapping = DynamicSheetExecutionService.mapRecordsToSheetColumns({
        records: state.unifiedRecords,
        headers: state.sheetInspection.headers || [],
        columnClassification: state.sheetInspection.classification,
        dateResolution: state.dateResolution,
      });
    }

    if (wantsAppendSheet) {
      integrations.add("Google Sheets");
      if (!state.sheetInspection) {
        const inspectRes = await runToolTracked("inspect_sheet_and_map_fields", {
          userId,
          sheetIndex: requestedSheetIndex || undefined,
          userMessage: raw,
        });
        if (!inspectRes?.success) {
          throw new Error(inspectRes?.message || "Failed to inspect target Google Sheet before appending.");
        }
        state.sheetInspection = inspectRes;
      }

      if (state.unifiedRecords.length === 0 && state.googleAdsData?.campaigns?.length > 0) {
        state.unifiedRecords = DynamicSheetExecutionService.buildUnifiedAdRecords({
          granularity: "campaign",
          accountId: state.googleAdsData.customerId || "",
          accountName: state.googleAdsData.accountName || "",
          channel: "Google Ads",
          currency: "INR",
          campaigns: state.googleAdsData.campaigns,
          insights: state.googleAdsData.insights || [],
          includeZeroImpressionEntities: true,
        });
      }

      if (state.unifiedRecords.length === 0) {
        throw new Error(
          "No source records were available to append into the Google Sheet. Ensure the connected ad account or upstream node returned records."
        );
      }

      executionPlan.push(
        `Map ${state.unifiedRecords.length} record(s) to "${state.sheetInspection.sheetName}" -> "${state.sheetInspection.targetTab}" columns using reporting date ${state.dateResolution.formattedDate}, append rows, and verify write.`
      );

      const appendRes = await runToolTracked("append_rows_to_connected_sheet", {
        userId,
        sheetIndex: state.sheetInspection.sheetIndex,
        tabName: state.sheetInspection.targetTab,
        userMessage: raw,
        dateNodeConfig: sharedWorkflowContext?.dateConfig || null,
        timeNodeConfig: sharedWorkflowContext?.timeConfig || null,
        scheduledDate: sharedWorkflowContext?.scheduledDate || null,
        upstreamReportingDate: upstream.reportingDate || null,
        timezone: sharedWorkflowContext?.timezone || "Asia/Kolkata",
        records: state.unifiedRecords,
      });

      if (appendRes?.status === "WAITING_FOR_INPUT") {
        return {
          status: "WAITING_FOR_INPUT",
          clarificationQuestion: appendRes.clarificationQuestion,
          executionPlan,
          integrationsInvolved: Array.from(integrations),
          state,
        };
      }
      if (!appendRes?.success) {
        throw new Error(appendRes?.message || "Google Sheets row append failed.");
      }
      state.appendResult = appendRes;
    }

    // STEP E: Handle explicit account / AI Context / connected sheet listing queries if requested directly
    if (executionPlan.length === 0) {
      if (/\b(connected\s+accounts?|which\s+accounts?|list\s+accounts?)\b/i.test(raw)) {
        integrations.add("Channels");
        executionPlan.push("List connected advertising accounts for the user.");
        const accRes = await runToolTracked("get_user_connected_accounts", { userId });
        state.connectedAccountsResult = accRes;
      } else if (/\b(ai\s+context|business\s+unit|marketing\s+brief)\b/i.test(raw)) {
        integrations.add("AI Context");
        executionPlan.push("Inspect configured AI Context graph.");
        state.aiContextResult = await runToolTracked("get_user_ai_context", { userId });
      } else if (wantsMetaCreation) {
        throw new Error(
          "Live campaign/ad creation requires complete campaign parameters or an active LLM orchestration key. Please verify parameters and credentials."
        );
      } else {
        // Never fabricate a generic WORKSPACE_OVERVIEW response for an unrecognized or underspecified task!
        return {
          status: "WAITING_FOR_INPUT",
          clarificationQuestion: `The instruction "${raw}" does not specify which integration data source (e.g., Meta Ads, Google Ads, or Google Sheets) or operation to execute. Please clarify the target data source and desired action.`,
          executionPlan: ["Request clarification for ambiguous task instruction."],
          integrationsInvolved: [],
          state,
        };
      }
    }

    // Synthesize clear, accurate, factual Markdown output strictly from actual tool results
    const markdown = this.renderDynamicOutput({
      instruction: raw,
      state,
      wantsCampaigns,
      wantsAdSets,
      wantsAds,
      wantsMetricsOrInsights,
      wantsComparison,
      wantsAnalysisAndSuggestions,
      wantsAppendSheet,
      wantsUpdateCell,
      wantsVideoLinks,
      referencesUpstream,
    });

    return {
      status: "SUCCESS",
      finalMarkdown: markdown,
      executionPlan,
      integrationsInvolved: Array.from(integrations),
      state,
    };
  }

  /**
   * Render factual output strictly grounded in executed tool results — zero templates with fake claims.
   */
  static renderDynamicOutput({
    instruction,
    state,
    wantsCampaigns,
    wantsAdSets,
    wantsAds,
    wantsMetricsOrInsights,
    wantsComparison,
    wantsAnalysisAndSuggestions,
    wantsAppendSheet,
    wantsUpdateCell,
    wantsVideoLinks,
    referencesUpstream,
  }) {
    const sections = [];

    // 1. Video Links Extraction Result
    if (wantsVideoLinks && state.videoExtraction) {
      const ve = state.videoExtraction;
      sections.push(
        `### Google Sheet Video Link Inspection\n` +
          `- **Spreadsheet:** Sheet #${ve.sheetIndex} — **${ve.sheetName}** (\`${ve.spreadsheetId}\`)\n` +
          `- **Worksheet Tab:** \`${ve.targetTab}\`\n` +
          `- **Rows Scanned:** ${ve.totalRowsScanned} | **Videos Extracted:** ${ve.totalVideosFound}`
      );
      if (Array.isArray(ve.videos) && ve.videos.length > 0) {
        const rowsMd = ve.videos
          .slice(0, 30)
          .map(
            (v) =>
              `| ${v.rowNumber} | ${v.creativeCode || "—"} | ${v.mediaType || "Video"} | ${v.creativeName || "—"} | ${v.videoUrl} | ${v.validationStatus || "Checked"} |`
          )
          .join("\n");
        sections.push(
          `| Row | Creative Code | Media Type | Creative Name | Video URL | Validation |\n|---|---|---|---|---|---|\n${rowsMd}`
        );
      }
    }

    // 2. Cell Update Result
    if (wantsUpdateCell && state.cellUpdate) {
      sections.push(`### Google Sheet Cell Update\n- ${state.cellUpdate.message}`);
    }

    // 3. Sheet Inspection & Field Discovery Summary
    if (state.sheetInspection && !wantsAppendSheet) {
      const si = state.sheetInspection;
      const cls = si.classification || {};
      sections.push(
        `### Connected Google Sheet Structure\n` +
          `- **Spreadsheet:** Sheet #${si.sheetIndex} — **${si.sheetName}** (\`${si.spreadsheetId}\`)\n` +
          `- **Selected Worksheet Tab:** \`${si.targetTab}\`\n` +
          `- **Detected Headers (${(si.headers || []).length}):** ${(si.headers || []).map((h) => `\`${h}\``).join(", ")}\n` +
          `- **Existing Data Rows:** ${si.existingRowCount ?? 0}\n` +
          `- **Required Ad Data Granularity:** \`${cls.requiredGranularity || "campaign"}\` | **Detected Date Format:** \`${cls.detectedDateFormat || "YYYY-MM-DD"}\``
      );

      if (Array.isArray(cls.columnMappings) && cls.columnMappings.length > 0) {
        const mapRows = cls.columnMappings
          .map(
            (c) =>
              `| ${c.columnLetter} | ${c.headerName} | ${c.canonicalKey ? `\`${c.canonicalKey}\`` : "*(Unmapped / Custom)*"} | ${c.category} |`
          )
          .join("\n");
        sections.push(
          `#### Semantic Field Classification\n| Col | Spreadsheet Header | Mapped Source Field | Category |\n|---|---|---|---|` +
            `\n${mapRows}`
        );
      }
    }

    // 4. Campaigns & Ad Sets Hierarchy Output
    if (state.campaigns.length > 0 && (wantsCampaigns || (!wantsAds && !wantsAppendSheet && !wantsMetricsOrInsights))) {
      const campRows = state.campaigns
        .slice(0, 50)
        .map(
          (c, i) =>
            `| ${i + 1} | ${c.name || c.campaignName} | \`${c.id || c.campaignId}\` | ${c.status || c.effectiveStatus || "UNKNOWN"} | ${c.objective || "—"} |`
        )
        .join("\n");
      sections.push(
        `### Live Meta Ads Campaigns — ${state.accountName || ""} (\`${state.accountId || ""}\`)\n` +
          `**Total Campaigns Fetched:** ${state.campaigns.length}\n\n` +
          `| # | Campaign Name | Campaign ID | Status | Objective |\n|---|---|---|---|---|\n${campRows}`
      );
    }

    if (state.adSets.length > 0 && wantsAdSets && !wantsAppendSheet) {
      const adSetRows = state.adSets
        .slice(0, 60)
        .map(
          (as, i) =>
            `| ${i + 1} | ${as.name} | \`${as.id}\` | ${as.campaignName || "—"} (\`${as.campaignId || "—"}\`) | ${as.status || as.effectiveStatus || "UNKNOWN"} | ${as.optimizationGoal || "—"} |`
        )
        .join("\n");
      sections.push(
        `### Live Meta Ad Sets (${state.adSets.length})\n` +
          `| # | Ad Set Name | Ad Set ID | Parent Campaign | Status | Optimization Goal |\n|---|---|---|---|---|---|\n${adSetRows}`
      );
    }

    // 5. Ads Output (including filtered by upstream Campaign & Ad Set data)
    if (wantsAds && !wantsAppendSheet) {
      if (state.ads.length > 0) {
        const adRows = state.ads
          .slice(0, 60)
          .map(
            (ad, i) =>
              `| ${i + 1} | ${ad.adName || "—"} | \`${ad.adId || "—"}\` | ${ad.adSetName || "—"} (\`${ad.adSetId || "—"}\`) | ${ad.campaignName || "—"} (\`${ad.campaignId || "—"}\`) | ${ad.status || ad.effectiveStatus || "UNKNOWN"} | ${ad.mediaType || "—"} |`
          )
          .join("\n");
        sections.push(
          `### Live Meta Ads${referencesUpstream ? " (Filtered by Previous Node Campaign & Ad Set Data)" : ""} — Total: ${state.ads.length}\n` +
            `| # | Ad Name | Ad ID | Ad Set | Campaign | Status | Type |\n|---|---|---|---|---|---|---|\n${adRows}`
        );
      } else {
        sections.push(
          `### Live Meta Ads\nQueried Meta account \`${state.accountId || ""}\`${referencesUpstream ? " using upstream Campaign & Ad Set filters" : ""}: **0 Ads** matched.`
        );
      }
    }

    // 6. Performance Metrics, Comparisons & Analysis
    if (wantsMetricsOrInsights && !wantsAppendSheet) {
      const perfSource =
        state.insights.length > 0
          ? state.insights
          : state.allCampaignsPerformance.length > 0
          ? state.allCampaignsPerformance
          : state.unifiedRecords;

      const cur = state.currency || "INR";
      const totalSpend = perfSource.reduce((s, r) => s + Number(r.spend || 0), 0);
      const totalImpr = perfSource.reduce((s, r) => s + Number(r.impressions || 0), 0);
      const totalClicks = perfSource.reduce((s, r) => s + Number(r.clicks || 0), 0);
      const totalConv = perfSource.reduce((s, r) => s + Number(r.conversions || 0), 0);
      const avgCtr = totalImpr > 0 ? ((totalClicks / totalImpr) * 100).toFixed(2) : "0.00";
      const avgCpc = totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : "—";
      const avgCpr = totalConv > 0 ? (totalSpend / totalConv).toFixed(2) : "—";

      sections.push(
        `### Performance Summary — ${state.accountName || ""} (\`${state.accountId || ""}\`)\n` +
          `- **Reporting Date / Window:** \`${state.dateResolution?.formattedDate || "All-time"}\` (${state.dateResolution?.source || "resolved"})\n` +
          `- **Total Spend:** ${cur} ${fmtNum(totalSpend)} | **Impressions:** ${fmtNum(totalImpr, 0)} | **Clicks:** ${fmtNum(totalClicks, 0)} | **CTR:** ${avgCtr}% | **CPC:** ${avgCpc} | **Conversions/Results:** ${fmtNum(totalConv, 0)} | **CPR/CPA:** ${avgCpr}`
      );

      if (perfSource.length > 0) {
        const sorted = wantsComparison
          ? [...perfSource].sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0))
          : perfSource;
        const rows = sorted
          .slice(0, 35)
          .map(
            (r) =>
              `| ${r.campaignName || r.adName || "—"} | ${r.status || "—"} | ${fmtNum(r.spend)} | ${fmtNum(r.impressions, 0)} | ${fmtNum(r.clicks, 0)} | ${fmtNum(r.ctr)}% | ${fmtNum(r.cpc)} | ${fmtNum(r.conversions, 0)} | ${fmtNum(r.cpr ?? r.cpa)} | ${fmtNum(r.roas)} |`
          )
          .join("\n");
        sections.push(
          `| Entity | Status | Spend (${cur}) | Impr. | Clicks | CTR | CPC | Results | CPR/CPA | ROAS |\n|---|---|---|---|---|---|---|---|---|---|\n${rows}`
        );
      }

      if (wantsAnalysisAndSuggestions) {
        const activeCount = (state.campaigns || []).filter((c) => (c.status || c.effectiveStatus) === "ACTIVE").length;
        const pausedCount = (state.campaigns || []).filter((c) => (c.status || c.effectiveStatus) === "PAUSED").length;
        const withSpend = perfSource.filter((r) => Number(r.spend || 0) > 0);
        const analysisBullets = [
          `- **Account Delivery State:** ${state.campaigns.length} total campaigns (${activeCount} ACTIVE, ${pausedCount} PAUSED); ${withSpend.length} entity row(s) recorded non-zero spend (${cur} ${fmtNum(totalSpend)}).`,
        ];
        if (withSpend.length === 0) {
          analysisBullets.push(
            `- **Observation:** Zero spend/impressions were recorded in the queried window. Activate paused campaigns/ad sets with approved creatives and daily budgets to begin delivery before evaluating CPA/ROAS.`
          );
        } else {
          const topByCtr = [...withSpend].sort((a, b) => Number(b.ctr || 0) - Number(a.ctr || 0))[0];
          const topBySpend = [...withSpend].sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0))[0];
          if (topBySpend) {
            analysisBullets.push(
              `- **Highest Spend Driver:** "${topBySpend.campaignName}" (${cur} ${fmtNum(topBySpend.spend)}, CTR ${fmtNum(topBySpend.ctr)}%, CPR ${fmtNum(topBySpend.cpr ?? topBySpend.cpa)}).`
            );
          }
          if (topByCtr) {
            analysisBullets.push(
              `- **Strongest Engagement (CTR):** "${topByCtr.campaignName}" (${fmtNum(topByCtr.ctr)}% CTR across ${fmtNum(topByCtr.impressions, 0)} impressions). Reallocate incremental budget toward high-CTR / low-CPR ad sets and pause high-spend zero-conversion ad sets.`
            );
          }
        }
        sections.push(`### Grounded Performance Analysis & Recommendations\n${analysisBullets.join("\n")}`);
      }
    }

    // 7. Preview Mapping (when Node 1 inspects sheet + fetches Meta data for downstream Node 2)
    if (state.previewMapping && !wantsAppendSheet) {
      const pm = state.previewMapping;
      sections.push(
        `### Prepared Data Mapping for Downstream Node / Sheet\n` +
          `- **Records Prepared:** ${pm.recordsMapped} record(s)\n` +
          `- **Resolved Reporting Date:** \`${pm.reportingDateUsed}\` (format: \`${pm.sheetDateFormat}\`)\n` +
          `- **Mapped Columns (${pm.fieldMappings.length}):** ${pm.fieldMappings
            .map((m) => `\`${m.sheetColumn}\` <- \`${m.sourceField}\``)
            .join(", ") || "None"}\n` +
          (pm.unmappedFields.length > 0
            ? `- **Unmapped Custom Columns (${pm.unmappedFields.length}):** ${pm.unmappedFields
                .map((u) => `\`${u.sheetColumn}\``)
                .join(", ")} *(left blank — no matching ad-platform source field)*`
            : `- **Unmapped Columns:** 0 (all spreadsheet columns matched)`)
      );
    }

    // 8. Google Sheet Append & Verification Result
    if (wantsAppendSheet && state.appendResult) {
      const ar = state.appendResult;
      sections.push(
        `### Google Sheet Append & Verification Result\n` +
          `- **Target Spreadsheet:** Sheet #${ar.sheetIndex} — **${ar.sheetName}** (\`${ar.spreadsheetId}\`)\n` +
          `- **Target Worksheet Tab:** \`${ar.targetTab}\`\n` +
          `- **Reporting Date Written:** \`${ar.reportingDateUsed}\` (source: \`${ar.dateResolutionSource}\`, format: \`${ar.sheetDateFormat}\`)\n` +
          `- **Records Processed:** ${ar.recordsProcessed} | **Rows Appended:** ${ar.rowsAppended} | **Updated Range:** \`${ar.updatedRange || "N/A"}\`\n` +
          `- **Write Verification:** ${ar.verified ? "VERIFIED via Google Sheets API read-back" : "Submitted (read-back pending)"}\n` +
          `- **Mapped Fields (${(ar.fieldMappings || []).length}):** ${(ar.fieldMappings || [])
            .map((m) => `\`${m.sheetColumn}\` <- \`${m.sourceField}\``)
            .join(", ")}\n` +
          ((ar.unmappedFields || []).length > 0
            ? `- **Unmapped Columns (${ar.unmappedFields.length}):** ${ar.unmappedFields
                .map((u) => `\`${u.sheetColumn}\``)
                .join(", ")}`
            : "")
      );
    }

    // 9. Google Ads Data Output
    if (state.googleAdsData) {
      const gd = state.googleAdsData;
      sections.push(
        `### Google Ads Performance — ${gd.accountName || ""} (\`${gd.customerId || ""}\`)\n` +
          `- ${gd.message}\n` +
          `- **Spend:** ₹${fmtNum(gd.summary?.totalSpend)} | **Impressions:** ${fmtNum(gd.summary?.totalImpressions, 0)} | **Clicks:** ${fmtNum(gd.summary?.totalClicks, 0)} | **Conversions:** ${fmtNum(gd.summary?.totalConversions, 0)} | **ROAS:** ${fmtNum(gd.summary?.overallRoas)}`
      );
    }

    if (state.connectedAccountsResult) {
      const accs = state.connectedAccountsResult.accounts || [];
      sections.push(
        `### Connected Advertising Accounts (${accs.length})\n` +
          accs.map((a) => `- **${a.channel}:** ${a.accountName} (\`${a.accountId}\`, ${a.currency || "INR"})`).join("\n")
      );
    }

    if (state.aiContextResult) {
      sections.push(`### AI Context Summary\n\`\`\`json\n${JSON.stringify(state.aiContextResult, null, 2).slice(0, 2000)}\n\`\`\``);
    }

    return sections.filter(Boolean).join("\n\n").trim();
  }

  /**
   * Validate that the node actually completed its requested objective using real tool outputs.
   */
  static verifyNodeCompletion({ instruction = "", toolCalls = [], status = "SUCCESS" }) {
    if (status === "WAITING_FOR_INPUT") {
      return {
        verified: false,
        verificationStatus: "WAITING_FOR_INPUT",
        reason: "Execution paused awaiting required user clarification.",
      };
    }

    const failedCalls = toolCalls.filter((t) => t.status === "error" || t.status === "failed");
    if (failedCalls.length > 0) {
      return {
        verified: false,
        verificationStatus: "FAILED",
        reason: `Tool execution failed (${failedCalls.map((f) => `${f.toolName}: ${f.responseSummary}`).join("; ")}).`,
      };
    }

    if (toolCalls.length === 0) {
      return {
        verified: false,
        verificationStatus: "UNVERIFIED_NO_TOOLS",
        reason: "No MCP or API tool calls were executed for this node instruction.",
      };
    }

    const wantsWrite =
      /\b(append|insert\s+(?:rows?|data|records?|into)|add\s+rows?|write\s+(?:data|rows?|records?|into|to)\b|log\s+.*\b(?:into|to)\s+.*sheet|populate\s+.*sheet)\b/i.test(
        instruction
      );
    if (wantsWrite) {
      const writeCall = toolCalls.find((t) =>
        ["append_rows_to_connected_sheet", "update_connected_sheet_cells", "sync_meta_ads_to_sheet"].includes(t.toolName)
      );
      if (!writeCall || writeCall.status !== "success") {
        return {
          verified: false,
          verificationStatus: "WRITE_NOT_EXECUTED",
          reason: "Instruction required writing data to Google Sheets, but no verified sheet write tool succeeded.",
        };
      }
    }

    return {
      verified: true,
      verificationStatus: "VERIFIED",
      reason: `Verified ${toolCalls.length} real tool execution(s) with valid responses.`,
    };
  }

  /**
   * Main entry point for executing a single workflow node instruction end-to-end.
   */
  static async executeNodeTask({
    userId,
    instruction,
    node = {},
    workflowId = null,
    executionId = null,
    sharedWorkflowContext = {},
  }) {
    const startMs = Date.now();
    const originalInstruction = String(instruction || "").trim();

    if (!originalInstruction) {
      throw new Error(`Node "${node?.label || node?.id || "Custom Task"}" has an empty task instruction.`);
    }

    const envelopeContext = await this.loadExecutionEnvelopeContext(userId);
    const upstream = this.collectUpstreamStructuredData(sharedWorkflowContext);

    const trackedToolCalls = [];
    const collectedArtifacts = {
      accountId: upstream.accountId || envelopeContext.selectedAdAccountId || null,
      accountName: upstream.accountName || null,
      currency: upstream.currency || "INR",
      campaigns: [...upstream.campaigns],
      adSets: [...upstream.adSets],
      ads: [...upstream.ads],
      insights: [...upstream.insights],
      unifiedRecords: [...upstream.unifiedRecords],
      sheetInspection: upstream.sheetInspection || null,
      reportingDate: upstream.reportingDate || null,
      fieldMappings: [],
      unmappedFields: [],
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      appendVerification: null,
    };

    const runToolTracked = async (toolName, rawArgs) => {
      const t0 = Date.now();
      const sanitized = sanitizeToolArgs(rawArgs);
      try {
        const result = await executeAgentTool(toolName, rawArgs);
        const durationMs = Date.now() - t0;

        if (result?.status === "WAITING_FOR_INPUT") {
          trackedToolCalls.push({
            toolName,
            toolArgs: sanitized,
            status: "waiting_for_input",
            responseSummary: result.clarificationQuestion || "Waiting for user input.",
            durationMs,
          });
          return result;
        }

        if (result?.error || result?.success === false) {
          const msg = result.error || result.message || `${toolName} returned unsuccessful status.`;
          trackedToolCalls.push({
            toolName,
            toolArgs: sanitized,
            status: "error",
            responseSummary: msg,
            durationMs,
          });
          throw new Error(msg);
        }

        // Capture structured artifacts from real tool outputs
        if (result?.accountId) collectedArtifacts.accountId = result.accountId;
        if (result?.accountName) collectedArtifacts.accountName = result.accountName;
        if (result?.currency) collectedArtifacts.currency = result.currency;
        if (Array.isArray(result?.campaigns)) {
          collectedArtifacts.campaigns = result.campaigns;
          collectedArtifacts.recordsProcessed = Math.max(collectedArtifacts.recordsProcessed, result.campaigns.length);
        }
        if (Array.isArray(result?.adSets)) {
          collectedArtifacts.adSets = result.adSets;
          collectedArtifacts.recordsProcessed = Math.max(collectedArtifacts.recordsProcessed, result.adSets.length);
        }
        if (Array.isArray(result?.ads || result?.creatives)) {
          const list = result.ads || result.creatives;
          collectedArtifacts.ads = list;
          collectedArtifacts.recordsProcessed = Math.max(collectedArtifacts.recordsProcessed, list.length);
        }
        if (Array.isArray(result?.insights)) {
          collectedArtifacts.insights = result.insights;
          collectedArtifacts.recordsProcessed = Math.max(collectedArtifacts.recordsProcessed, result.insights.length);
        }
        if (toolName === "inspect_sheet_and_map_fields" && result?.success) {
          collectedArtifacts.sheetInspection = result;
          collectedArtifacts.fieldMappings = (result.classification?.mappedColumns || []).map((c) => ({
            sheetColumn: c.headerName,
            columnLetter: c.columnLetter,
            sourceField: c.canonicalKey,
            category: c.category,
          }));
          collectedArtifacts.unmappedFields = (result.classification?.unmappedColumns || []).map((c) => ({
            sheetColumn: c.headerName,
            columnLetter: c.columnLetter,
          }));
        }
        if (toolName === "append_rows_to_connected_sheet" && result?.success) {
          collectedArtifacts.recordsProcessed = result.recordsProcessed ?? collectedArtifacts.recordsProcessed;
          collectedArtifacts.recordsInserted += Number(result.rowsAppended || 0);
          collectedArtifacts.fieldMappings = result.fieldMappings || collectedArtifacts.fieldMappings;
          collectedArtifacts.unmappedFields = result.unmappedFields || collectedArtifacts.unmappedFields;
          collectedArtifacts.appendVerification = {
            spreadsheetId: result.spreadsheetId,
            sheetName: result.sheetName,
            targetTab: result.targetTab,
            updatedRange: result.updatedRange,
            rowsAppended: result.rowsAppended,
            verified: result.verified,
            reportingDateUsed: result.reportingDateUsed,
          };
        }
        if (toolName === "update_connected_sheet_cells" && result?.success) {
          collectedArtifacts.recordsUpdated += Number(result.updatedCount || 1);
        }

        trackedToolCalls.push({
          toolName,
          toolArgs: sanitized,
          status: "success",
          responseSummary: summarizeToolResult(toolName, result),
          durationMs,
        });
        return result;
      } catch (err) {
        const alreadyLogged = trackedToolCalls.some(
          (tc) => tc.toolName === toolName && tc.status === "error" && tc.responseSummary === err.message
        );
        if (!alreadyLogged) {
          trackedToolCalls.push({
            toolName,
            toolArgs: sanitized,
            status: "error",
            responseSummary: err.message,
            durationMs: Date.now() - t0,
          });
        }
        throw err;
      }
    };

    // 1. Try live Anthropic multi-turn tool loop first when valid API key is present
    let executionPlan = [];
    let integrationsInvolved = [];
    let finalResponse = "";
    let agentStatus = "SUCCESS";

    const anthropicOutcome = await this.tryExecuteWithAnthropicLoop({
      userId,
      instruction: originalInstruction,
      node,
      workflowId,
      executionId,
      envelopeContext,
      upstream,
      sharedWorkflowContext,
      runToolTracked,
    });

    if (anthropicOutcome) {
      finalResponse = anthropicOutcome.finalMarkdown || "";
      if (finalResponse.startsWith("WAITING_FOR_INPUT:")) {
        agentStatus = "WAITING_FOR_INPUT";
        finalResponse = finalResponse.replace(/^WAITING_FOR_INPUT:\s*/i, "").trim();
      }
      executionPlan = trackedToolCalls.map((tc) => `Executed ${tc.toolName}`);
      integrationsInvolved = Array.from(
        new Set(
          trackedToolCalls.map((tc) =>
            tc.toolName.includes("sheet") ? "Google Sheets" : tc.toolName.includes("google") ? "Google Ads" : "Meta Ads"
          )
        )
      );
      if (collectedArtifacts.unifiedRecords.length === 0 && (collectedArtifacts.campaigns.length > 0 || collectedArtifacts.insights.length > 0)) {
        const gran = collectedArtifacts.sheetInspection?.classification?.requiredGranularity || (collectedArtifacts.ads.length > 0 ? "ad" : collectedArtifacts.adSets.length > 0 ? "adset" : "campaign");
        collectedArtifacts.unifiedRecords = DynamicSheetExecutionService.buildUnifiedAdRecords({
          granularity: gran,
          accountId: collectedArtifacts.accountId || "",
          accountName: collectedArtifacts.accountName || "",
          channel: "Meta Ads",
          currency: collectedArtifacts.currency || "INR",
          campaigns: collectedArtifacts.campaigns,
          adSets: collectedArtifacts.adSets,
          ads: collectedArtifacts.ads,
          insights: collectedArtifacts.insights,
          includeZeroImpressionEntities: true,
        });
      }
    } else {
      // 2. Execute schema-driven dynamic multi-step planner
      const dynamicOutcome = await this.executeDynamicPlan({
        userId,
        instruction: originalInstruction,
        node,
        envelopeContext,
        upstream,
        sharedWorkflowContext,
        runToolTracked,
      });

      executionPlan = dynamicOutcome.executionPlan || [];
      integrationsInvolved = dynamicOutcome.integrationsInvolved || [];

      if (dynamicOutcome.state?.unifiedRecords?.length > 0) {
        collectedArtifacts.unifiedRecords = dynamicOutcome.state.unifiedRecords;
        collectedArtifacts.recordsProcessed = Math.max(
          collectedArtifacts.recordsProcessed,
          dynamicOutcome.state.unifiedRecords.length
        );
      }
      if (dynamicOutcome.state?.dateResolution?.ok) {
        collectedArtifacts.reportingDate = dynamicOutcome.state.dateResolution;
      }
      if (dynamicOutcome.state?.previewMapping) {
        collectedArtifacts.fieldMappings = dynamicOutcome.state.previewMapping.fieldMappings;
        collectedArtifacts.unmappedFields = dynamicOutcome.state.previewMapping.unmappedFields;
      }

      if (dynamicOutcome.status === "WAITING_FOR_INPUT") {
        agentStatus = "WAITING_FOR_INPUT";
        finalResponse = dynamicOutcome.clarificationQuestion;
      } else {
        agentStatus = "SUCCESS";
        finalResponse = dynamicOutcome.finalMarkdown;
      }
    }

    // 3. Strictly verify objective completion before returning SUCCESS
    const validation = this.verifyNodeCompletion({
      instruction: originalInstruction,
      toolCalls: trackedToolCalls,
      status: agentStatus,
    });

    if (agentStatus !== "WAITING_FOR_INPUT" && !validation.verified) {
      throw new Error(validation.reason || "Task completion verification failed.");
    }

    const durationMs = Date.now() - startMs;

    const dataFetchedSummary = [];
    if (collectedArtifacts.campaigns.length > 0) dataFetchedSummary.push(`${collectedArtifacts.campaigns.length} campaigns`);
    if (collectedArtifacts.adSets.length > 0) dataFetchedSummary.push(`${collectedArtifacts.adSets.length} ad sets`);
    if (collectedArtifacts.ads.length > 0) dataFetchedSummary.push(`${collectedArtifacts.ads.length} ads`);
    if (collectedArtifacts.insights.length > 0) dataFetchedSummary.push(`${collectedArtifacts.insights.length} insight rows`);
    if (collectedArtifacts.sheetInspection) {
      dataFetchedSummary.push(
        `Sheet "${collectedArtifacts.sheetInspection.sheetName}" -> "${collectedArtifacts.sheetInspection.targetTab}" (${(collectedArtifacts.sheetInspection.headers || []).length} columns)`
      );
    }

    const executionSummary = {
      understoodObjective: originalInstruction,
      executionPlan,
      integrationsInvolved,
    };

    const dataProcessing = {
      dataFetched: dataFetchedSummary.length > 0 ? dataFetchedSummary.join(", ") : "None",
      reportingDate: collectedArtifacts.reportingDate?.formattedDate || collectedArtifacts.appendVerification?.reportingDateUsed || null,
      reportingDateSource: collectedArtifacts.reportingDate?.source || null,
      fieldMappings: collectedArtifacts.fieldMappings || [],
      unmappedFields: collectedArtifacts.unmappedFields || [],
      recordsProcessed: collectedArtifacts.recordsProcessed || 0,
      recordsInserted: collectedArtifacts.recordsInserted || 0,
      recordsUpdated: collectedArtifacts.recordsUpdated || 0,
    };

    return {
      status: agentStatus, // "SUCCESS" | "WAITING_FOR_INPUT"
      originalInstruction,
      response: finalResponse,
      executionSummary,
      toolCalls: trackedToolCalls,
      dataProcessing,
      structuredData: {
        accountId: collectedArtifacts.accountId,
        accountName: collectedArtifacts.accountName,
        currency: collectedArtifacts.currency,
        campaigns: collectedArtifacts.campaigns,
        adSets: collectedArtifacts.adSets,
        ads: collectedArtifacts.ads,
        insights: collectedArtifacts.insights,
        unifiedRecords: collectedArtifacts.unifiedRecords,
        sheetInspection: collectedArtifacts.sheetInspection,
        reportingDate: collectedArtifacts.reportingDate,
        appendVerification: collectedArtifacts.appendVerification,
      },
      validation,
      durationMs,
    };
  }
}

export default NodeTaskAgentService;
