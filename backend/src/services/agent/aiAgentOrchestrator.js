import axios from "axios";
import AiContext from "../../models/aiContextModel.js";
import MetaAccount from "../../models/metaAccount.js";
import GoogleAccount from "../../models/googleAccountModel.js";
import ConnectedChannel from "../../models/connectedChannelModel.js";
import { executeAgentTool, getUserAiContext, AGENT_TOOLS_DEFINITIONS } from "./queryDbMetrics.js";
import { AgentStreamHandler } from "./agentStream.js";
import CampaignPreparationService from "../campaignPreparation/campaignPreparationService.js";
import SheetInspectorService from "./sheetInspectorService.js";
import ConversationMemoryService from "./conversationMemoryService.js";
import NodeTaskAgentService from "./nodeTaskAgentService.js";

const ANTHROPIC_MODEL_CANDIDATES = [
  process.env.CLAUDE_AGENT_MODEL || "claude-sonnet-4-5",
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-latest",
  "claude-3-5-haiku-latest",
];

function extractExplicitMetaAccountId(text = "") {
  if (!text || typeof text !== "string") return null;
  const actMatch = text.match(/\bact_(\d{5,25})\b/i);
  if (actMatch) return `act_${actMatch[1]}`;
  const contextualMatch = text.match(
    /\b(?:meta\s+ad\s+account|ad\s+account|meta\s+account|account\s+id|in\s+account|from\s+account|for\s+account)\s*[:#-]?\s*(\d{8,25})\b/i
  );
  if (contextualMatch) return `act_${contextualMatch[1]}`;
  return null;
}

function parseDateWindowFromText(text = "") {
  const lower = String(text || "").toLowerCase();
  const rangeMatch = text.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|through|until|-|–)\s*(\d{4}-\d{2}-\d{2})/i);
  if (rangeMatch) {
    return { timeRange: { since: rangeMatch[1], until: rangeMatch[2] }, datePreset: undefined };
  }
  if (/\btoday\b|\baaj\b/i.test(lower)) return { datePreset: "today" };
  if (/\byesterday\b|\bkal\b/i.test(lower)) return { datePreset: "yesterday" };
  if (/\blast\s*7\s*d|\bpast\s*7\s*d|\b7\s*days|\bweekly\b/i.test(lower)) return { datePreset: "last_7d" };
  if (/\blast\s*14\s*d|\bpast\s*14\s*d|\b14\s*days\b/i.test(lower)) return { datePreset: "last_14d" };
  if (/\blast\s*30\s*d|\bpast\s*30\s*d|\b30\s*days|\bmonthly\b|\bthis\s*month\b/i.test(lower)) {
    return { datePreset: "last_30d" };
  }
  if (/\blast\s*90\s*d|\b90\s*days\b/i.test(lower)) return { datePreset: "last_90d" };
  return { datePreset: "maximum" };
}

function extractRequestedSheetFields(instruction = "", actualHeaders = []) {
  const text = String(instruction || "").trim();
  const candidates = [];

  // 1. Check quoted field names: "TikTok Shop SKU", 'Creative Code'
  const quotedMatches = [...text.matchAll(/["'`]([^"'`\n]{2,50})["'`]/g)];
  for (const m of quotedMatches) {
    const val = m[1].trim();
    if (!/^act_\d+$/i.test(val) && !/sheet\s*#?\d+/i.test(val)) {
      candidates.push(val);
    }
  }

  // 2. Check explicit "<Field Name> column/field" patterns
  const colBeforeMatches = [
    ...text.matchAll(
      /\b(?:fetch|get|show|read|extract|display|find|list|check|give\s+me)\s+(?:the\s+|all\s+|their\s+|these\s+)?([a-zA-Z0-9_ /&-]{2,45}?)\s+(?:columns?|fields?|values?)\b/gi
    ),
  ];
  for (const m of colBeforeMatches) {
    const raw = m[1]
      .replace(/\b(from|in|of|on|for)\s+.*$/i, "")
      .replace(/\b(the|all|actual|connected|second|first|third|2nd|1st|3rd|sheet|worksheet|tab)\b/gi, "")
      .trim();
    if (raw.length >= 2) {
      raw
        .split(/\s*(?:,|and|&)\s*/i)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2)
        .forEach((s) => candidates.push(s));
    }
  }

  // 3. Check "column(s)/field(s) <Field Name>" patterns
  const colAfterMatches = [
    ...text.matchAll(/\b(?:columns?|fields?)\s+(?:named\s+|called\s+)?([a-zA-Z0-9_ ,/&'-]{2,60})/gi),
  ];
  for (const m of colAfterMatches) {
    const raw = m[1]
      .split(/\b(?:from|in|of|on|where|for|using)\b/i)[0]
      .trim();
    if (raw.length >= 2) {
      raw
        .split(/\s*(?:,|and|&)\s*/i)
        .map((s) => s.replace(/^['"`]|['"`]$/g, "").trim())
        .filter((s) => s.length >= 2)
        .forEach((s) => candidates.push(s));
    }
  }

  // 4. Match any actual header names mentioned directly in the prompt
  const lowerText = text.toLowerCase();
  for (const h of actualHeaders) {
    const cleanH = String(h || "").trim();
    if (cleanH.length < 3) continue;
    if (lowerText.includes(cleanH.toLowerCase())) {
      if (!candidates.some((c) => c.toLowerCase() === cleanH.toLowerCase())) {
        candidates.push(cleanH);
      }
    }
  }

  // Deduplicate while preserving order
  const unique = [];
  for (const c of candidates) {
    const cleaned = c.replace(/[?.!]+$/, "").trim();
    if (
      cleaned &&
      !/^(data|rows?|records?|info|information|details|sheet|spreadsheet|worksheet|tab|tabs)$/i.test(cleaned) &&
      !unique.some((u) => u.toLowerCase() === cleaned.toLowerCase())
    ) {
      unique.push(cleaned);
    }
  }
  return unique;
}

function formatCurrency(num, currency = "INR") {
  const n = Number(num || 0);
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₹";
  return `${sym}${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Dynamic AI Agent Orchestrator
 * Executes real Google Sheets, Meta Ads MCP, Google Ads MCP, and Workspace tools
 * with multi-step planning, conversation memory, and zero hardcoded responses.
 */
export class AiAgentOrchestrator {
  /**
   * 1. RETRIEVE WORKSPACE & CONVERSATION CONTEXT
   */
  static async retrieveContext({
    userId,
    accountId,
    metaAccountId,
    conversationId = null,
    userMessage = "",
    sessionMemory = null,
  }) {
    const [aiContext, metaAccounts, googleAccounts, connectedChannels, connectedSheets] = await Promise.all([
      userId ? getUserAiContext({ userId }).catch(() => null) : null,
      userId ? MetaAccount.find({ userId, isActive: true }).lean().catch(() => []) : [],
      userId ? GoogleAccount.find({ userId, isActive: true }).lean().catch(() => []) : [],
      userId ? ConnectedChannel.find({ userId, isConnected: true }).lean().catch(() => []) : [],
      userId ? SheetInspectorService.listConnectedSpreadsheets(userId).catch(() => []) : [],
    ]);

    const memory =
      sessionMemory ||
      (conversationId ? await ConversationMemoryService.loadSessionMemory(conversationId) : null);

    // Priority order for Meta Ad Account resolution:
    // 1. Explicit account ID mentioned in the current user message (e.g. act_1416124059911929)
    // 2. Explicit accountId/metaAccountId passed by controller
    // 3. Session memory from previous turn when user asks a follow-up ("their spend", "these campaigns", etc.)
    // 4. AI Context connected Meta channel
    // 5. Primary active Meta account
    const explicitPromptAccountId = extractExplicitMetaAccountId(userMessage);
    const aiContextMetaChannel = (aiContext?.adChannels || []).find((c) =>
      ["meta", "metaads", "facebook", "fb", "meta ads"].includes(
        String(c.channel || c.channelName || "").toLowerCase()
      )
    );

    const isFollowUpMetaReference =
      /\b(their|these|those|them|its|same\s+account|above\s+campaigns?|previous\s+campaigns?|now\s+fetch|now\s+get|now\s+compare|also\s+fetch)\b/i.test(
        userMessage
      );

    let resolvedMetaAccountId =
      explicitPromptAccountId ||
      (isFollowUpMetaReference && memory?.lastMetaContext?.accountId ? memory.lastMetaContext.accountId : null) ||
      metaAccountId ||
      accountId ||
      aiContextMetaChannel?.accountId ||
      memory?.lastMetaContext?.accountId ||
      metaAccounts[0]?.accountId ||
      null;

    if (resolvedMetaAccountId && /^\d+$/.test(String(resolvedMetaAccountId).trim())) {
      resolvedMetaAccountId = `act_${String(resolvedMetaAccountId).trim()}`;
    }

    const activeGoogleAccountId =
      googleAccounts[0]?.selectedCustomerId || googleAccounts[0]?.accountId || null;

    return {
      userId,
      conversationId,
      aiContext,
      metaAccounts,
      googleAccounts,
      connectedChannels,
      connectedSheets,
      explicitPromptAccountId,
      activeMetaAccountId: resolvedMetaAccountId,
      activeGoogleAccountId,
      sessionMemory: memory,
    };
  }

  /**
   * 2. DYNAMIC MULTI-STEP INTENT & EXECUTION PLANNER
   * Understands single-step & multi-step user objectives across Google Sheets, Meta Ads, Google Ads, and Workspace context.
   */
  static classifyIntent(instruction = "", context = {}) {
    const text = String(instruction || "").trim();
    const lower = text.toLowerCase();
    const memory = context.sessionMemory || {};

    // Check explicit ad creation / launch intent first (delegated to CampaignPreparationService in standard chat)
    const isReadOrInspectOnly =
      /\b(fetch|get|show|list|read|extract|inspect|find|compare|analyze|audit|check|verify|view|display|rank|evaluate|calculate|what|which|how\s+many|summarize)\b/i.test(
        lower
      ) && !/\b(create|launch|publish|deploy|build)\s+(?:a\s+|an\s+|new\s+)?(?:meta\s+|fb\s+|facebook\s+|video\s+)?(?:ad|ads|campaign|adset|ad\s+set)\b/i.test(lower);

    const isCampaignCreation =
      !isReadOrInspectOnly &&
      /\b(create|launch|publish|deploy|set\s*up)\b.*\b(ad|ads|campaign|ad\s*set|adset)\b/i.test(lower) &&
      !/\b(do\s+not|don't|never)\s+(?:create|edit|publish|launch)\b/i.test(lower);

    if (isCampaignCreation && !context.isAutomation) {
      return {
        intent: "CAMPAIGN_CREATION_FLOW",
        steps: [{ type: "CAMPAIGN_PREPARATION" }],
        tools: ["campaign_preparation"],
      };
    }

    // Check automated daily Meta -> Sheet reporting sync
    if (
      /\bsync\b.*\b(sheet|tab|bgmi|free\s*fire|gprc)\b/i.test(lower) ||
      (/\byesterday\b/i.test(lower) && /\bappend\b.*\bsheet\b/i.test(lower))
    ) {
      return {
        intent: "DAILY_META_TO_SHEET_SYNC",
        steps: [
          {
            toolName: "sync_meta_ads_to_sheet",
            args: {
              instruction: text,
              metaAccountId: context.activeMetaAccountId,
            },
          },
        ],
        tools: ["sync_meta_ads_to_sheet"],
      };
    }

    const steps = [];

    // --- DETECT GOOGLE SHEETS OBJECTIVES ---
    const sheetOrdinal = SheetInspectorService.parseRequestedSheetOrdinal(text);
    const tabOrdinal = SheetInspectorService.parseRequestedTabOrdinal(text);
    const urlInTextMatch = text.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+[^\s"']*/i);
    const driveUrlInTextMatch = text.match(/https:\/\/drive\.google\.com\/[^\s"']+/i);

    const mentionsFollowUpVideosOrSheet =
      Boolean(memory.lastSheetContext) &&
      (/\b(these\s+videos?|those\s+videos?|their\s+creative\s+codes?|creative\s+codes?\s+for\s+(?:these|those|them)|in\s+this\s+sheet|from\s+that\s+sheet|same\s+sheet|this\s+worksheet|that\s+tab|these\s+rows)\b/i.test(
        lower
      ) ||
        (/\b(creative\s+codes?|video\s+urls?|video\s+links?|smart\s+chips?|media\s+type|creative\s+format|creative\s+status)\b/i.test(
          lower
        ) &&
          !/\b(meta|facebook|act_\d+|campaign)\b/i.test(lower)));

    const mentionsSheetExplicitly =
      sheetOrdinal !== null ||
      tabOrdinal !== null ||
      Boolean(urlInTextMatch) ||
      /\b(sheets?|spreadsheets?|worksheets?|tabs?|rows?|columns?|warehouse|smart\s*chips?|video\s*links?|video\s*urls?|drive\s*links?|drive\s*urls?|creative\s*codes?)\b/i.test(
        lower
      );

    // Check if any connected sheet's tab name is explicitly mentioned
    let matchedTabNameInPrompt = null;
    for (const s of context.connectedSheets || []) {
      for (const t of s.availableTabs || []) {
        const title = t.title || t.name || "";
        if (title && title.length >= 3 && lower.includes(title.toLowerCase())) {
          matchedTabNameInPrompt = title;
          break;
        }
      }
      if (matchedTabNameInPrompt) break;
    }

    const involvesSheets =
      mentionsSheetExplicitly || mentionsFollowUpVideosOrSheet || Boolean(matchedTabNameInPrompt);

    if (involvesSheets) {
      const targetSheetIndex =
        sheetOrdinal ||
        (urlInTextMatch ? null : memory.lastSheetContext?.sheetIndex || null);
      const targetSheetUrl =
        urlInTextMatch?.[0] ||
        (!sheetOrdinal && mentionsFollowUpVideosOrSheet ? memory.lastSheetContext?.sheetUrl : null);
      const targetTabName =
        matchedTabNameInPrompt ||
        (!sheetOrdinal && mentionsFollowUpVideosOrSheet && !tabOrdinal
          ? memory.lastSheetContext?.worksheetTab
          : null);

      const isListSheetsOnly =
        sheetOrdinal === null &&
        /\b(list|show|which|what)\b.*\b(connected\s+)?(spreadsheets?|sheets?)\b/i.test(lower) &&
        !/\b(rows?|columns?|videos?|links?|urls?|codes?|read|extract|tabs?|worksheets?|fields?)\b/i.test(lower);

      const isSheetUpdate =
        /\b(update|set|change|write|modify|edit)\b/i.test(lower) &&
        /\b(row|cell|column|field|status|sheet|tab)\b/i.test(lower) &&
        !/\b(do\s+not|don't)\s+(?:update|edit|modify)\b/i.test(lower);

      const isVideoExtraction =
        /\b(video\s*links?|video\s*urls?|videos?|drive\s*links?|drive\s*urls?|smart\s*chips?)\b/i.test(lower) ||
        (mentionsFollowUpVideosOrSheet &&
          Array.isArray(memory.lastSheetContext?.videoEntries) &&
          memory.lastSheetContext.videoEntries.length > 0 &&
          /\b(creative\s*codes?|codes?|urls?|links?|names?|status|media\s*type|format)\b/i.test(lower));

      if (isListSheetsOnly) {
        steps.push({
          toolName: "list_connected_sheets",
          purpose: "LIST_CONNECTED_SHEETS",
          args: {},
        });
      } else if (isSheetUpdate) {
        // Parse row number, column name, cell range, and new value dynamically
        const cellMatch = text.match(/\bcell\s+([A-Z]{1,3}\d{1,5})\b/i);
        const rowMatch = text.match(/\brow\s*#?\s*(\d{1,5})\b/i);
        const toValMatch = text.match(/\b(?:to|as|=)\s+["']?([^"'\n]+?)["']?$/i);
        const colMatch = text.match(
          /\b(?:set|update|change)\s+(?:row\s*#?\s*\d+\s+)?["']?([a-zA-Z0-9 _-]+?)["']?\s+(?:to|as|=)\b/i
        );
        steps.push({
          toolName: "update_connected_sheet_cells",
          purpose: "UPDATE_SHEET_CELLS",
          args: {
            sheetIndex: targetSheetIndex,
            sheetUrl: targetSheetUrl,
            tabName: targetTabName,
            cellRange: cellMatch ? cellMatch[1].toUpperCase() : null,
            rowNumber: rowMatch ? Number(rowMatch[1]) : null,
            columnName: colMatch ? colMatch[1].trim() : null,
            newValue: toValMatch ? toValMatch[1].trim() : undefined,
            userMessage: text,
            sessionSheetContext: memory.lastSheetContext || null,
          },
        });
      } else if (isVideoExtraction) {
        // Multi-step when multiple sheets exist or explicit ordinal used: verify connected sheets metadata + extract video links
        if (sheetOrdinal !== null) {
          steps.push({
            toolName: "list_connected_sheets",
            purpose: "VERIFY_CONNECTED_SHEET_METADATA",
            args: {},
          });
        }
        steps.push({
          toolName: "extract_sheet_video_links",
          purpose: mentionsFollowUpVideosOrSheet && /\bcreative\s*codes?\b/i.test(lower) && !/\bvideo\s*links?\b/i.test(lower)
            ? "MAP_VIDEOS_TO_CREATIVE_CODES"
            : "EXTRACT_SHEET_VIDEO_LINKS",
          args: {
            sheetIndex: targetSheetIndex,
            sheetUrl: targetSheetUrl,
            tabName: targetTabName,
            validateUrls: true,
            userMessage: text,
            sessionSheetContext: memory.lastSheetContext || null,
          },
        });
      } else {
        // General dynamic worksheet / schema / column inspection
        if (sheetOrdinal !== null) {
          steps.push({
            toolName: "list_connected_sheets",
            purpose: "VERIFY_CONNECTED_SHEET_METADATA",
            args: {},
          });
        }
        steps.push({
          toolName: "inspect_sheet_schema",
          purpose: "INSPECT_SHEET_DATA",
          args: {
            sheetIndex: targetSheetIndex,
            sheetUrl: targetSheetUrl,
            tabName: targetTabName,
            userMessage: text,
            sessionSheetContext: memory.lastSheetContext || null,
          },
        });
      }
    } else if (driveUrlInTextMatch) {
      steps.push({
        toolName: "validate_google_drive_asset",
        purpose: "VALIDATE_DRIVE_ASSET",
        args: {
          driveUrl: driveUrlInTextMatch[0],
        },
      });
    }

    // --- DETECT META ADS OBJECTIVES ---
    const explicitAct = extractExplicitMetaAccountId(text);
    const hasMetaFollowUp =
      Boolean(memory.lastMetaContext?.accountId) &&
      /\b(their|these|those|them|same\s+account|above\s+campaigns?|previous\s+campaigns?|now\s+fetch|now\s+get|now\s+compare)\b/i.test(
        lower
      ) &&
      /\b(spend|spent|performance|metrics?|cpr|cpa|roas|ctr|cpm|cpc|clicks?|impressions?|conversions?|purchases?|status|ad\s*sets?|adsets?|creatives?|ads?|compare|best|top|winner)\b/i.test(
        lower
      );

    const mentionsMetaAds =
      Boolean(explicitAct) ||
      hasMetaFollowUp ||
      /\b(meta\s*ads?|facebook\s*ads?|fb\s*ads?|ad\s*account)\b/i.test(lower) ||
      (!involvesSheets &&
        !/\bgoogle\s*ads\b/i.test(lower) &&
        /\b(campaigns?|ad\s*sets?|adsets?|ad\s*creatives?|creatives?\s+performance|cpr|cpa|roas|ctr|cpm|cpc|spend|spent)\b/i.test(
          lower
        ));

    if (mentionsMetaAds) {
      const targetAccountId =
        explicitAct ||
        (hasMetaFollowUp ? memory.lastMetaContext.accountId : null) ||
        context.activeMetaAccountId ||
        null;
      const dateWindow = parseDateWindowFromText(text);

      const wantsCreatives =
        /\b(ad\s*creatives?|meta\s*creatives?|ads?\s+copy|creative\s+performance)\b/i.test(lower) ||
        (!involvesSheets && /\b(creatives?|headlines?)\b/i.test(lower));
      const wantsAdSets = /\b(ad\s*sets?|adsets?)\b/i.test(lower);
      const wantsComparison = /\b(compare|comparison|vs\.?|versus|difference\s+between)\b/i.test(lower);
      const wantsBestCampaign =
        /\b(best[- ]performing|top[- ]performing|best\s+campaign|top\s+campaign|highest\s+roas|lowest\s+cpa|lowest\s+cpr|winning\s+campaign|winner)\b/i.test(
          lower
        );
      const wantsMetrics =
        wantsComparison ||
        wantsBestCampaign ||
        /\b(spend|spent|performance|insights?|metrics?|cpr|cpa|roas|ctr|cpm|cpc|clicks?|impressions?|conversions?|purchases?|revenue|cost|results?)\b/i.test(
          lower
        );
      const wantsCampaignList =
        /\b(campaigns?|campaign\s+names?|all\s+campaigns?|list\s+campaigns?|active\s+campaigns?|paused\s+campaigns?)\b/i.test(
          lower
        );
      const wantsPauseOrActivate =
        /\b(pause|activate|enable|resume)\s+(?:the\s+)?campaign\b/i.test(lower) &&
        !/\b(do\s+not|don't)\s+(?:edit|pause)\b/i.test(lower);

      if (!targetAccountId) {
        steps.push({
          toolName: "_missing_meta_account",
          purpose: "MISSING_META_ACCOUNT",
          args: {},
        });
      } else if (wantsPauseOrActivate) {
        const campaignIdMatch = text.match(/\b(\d{10,25})\b/);
        const desiredStatus = /\bpause\b/i.test(lower) ? "PAUSED" : "ACTIVE";
        steps.push({
          toolName: "update_meta_campaign",
          purpose: "UPDATE_META_CAMPAIGN",
          args: {
            accountId: targetAccountId,
            campaignId: campaignIdMatch ? campaignIdMatch[1] : null,
            status: desiredStatus,
          },
        });
      } else {
        if (wantsCampaignList || wantsComparison || (hasMetaFollowUp && wantsMetrics)) {
          steps.push({
            toolName: "fetch_live_meta_ads_mcp",
            purpose: "FETCH_META_CAMPAIGNS",
            args: {
              toolType: "get_live_campaigns_status",
              accountId: targetAccountId,
            },
          });
        }

        if (wantsMetrics) {
          const isTodayOnly = dateWindow.datePreset === "today" && !wantsComparison && !wantsBestCampaign && !wantsCampaignList && !hasMetaFollowUp;
          steps.push({
            toolName: "fetch_live_meta_ads_mcp",
            purpose: wantsComparison
              ? "COMPARE_META_CAMPAIGNS"
              : wantsBestCampaign
              ? "RANK_BEST_META_CAMPAIGN"
              : "FETCH_META_INSIGHTS",
            args: {
              toolType: isTodayOnly ? "get_live_today_insights" : "get_live_campaign_insights",
              accountId: targetAccountId,
              datePreset: dateWindow.datePreset,
              timeRange: dateWindow.timeRange,
            },
          });
        }

        if (wantsAdSets) {
          steps.push({
            toolName: "get_live_adsets",
            purpose: "FETCH_META_ADSETS",
            args: {
              accountId: targetAccountId,
            },
          });
        }

        if (wantsCreatives) {
          const includePerf = /\b(performance|analyze|rank|best|winner|roas|ctr|cpa|spend|metrics?)\b/i.test(lower);
          steps.push({
            toolName: "get_live_ad_creatives",
            purpose: includePerf ? "ANALYZE_META_CREATIVE_PERFORMANCE" : "FETCH_META_CREATIVES",
            args: {
              accountId: targetAccountId,
              includeInsights: includePerf,
              datePreset: dateWindow.datePreset,
              timeRange: dateWindow.timeRange,
            },
          });
        }

        // If user only said e.g. "Check account act_12345" without specifying campaigns vs metrics, fetch campaigns status
        if (steps.filter((s) => s.args?.accountId === targetAccountId).length === 0) {
          steps.push({
            toolName: "fetch_live_meta_ads_mcp",
            purpose: "FETCH_META_CAMPAIGNS",
            args: {
              toolType: "get_live_campaigns_status",
              accountId: targetAccountId,
            },
          });
        }
      }
    }

    // --- DETECT GOOGLE ADS OBJECTIVES ---
    if (/\bgoogle\s*ads\b/i.test(lower)) {
      if (/\bkeywords?\b/i.test(lower)) {
        steps.push({
          toolName: "list_google_keywords",
          purpose: "FETCH_GOOGLE_KEYWORDS",
          args: { accountId: context.activeGoogleAccountId },
        });
      } else if (/\bstructure\b/i.test(lower)) {
        steps.push({
          toolName: "get_google_campaign_structure",
          purpose: "FETCH_GOOGLE_STRUCTURE",
          args: { accountId: context.activeGoogleAccountId },
        });
      } else {
        steps.push({
          toolName: "fetch_live_google_ads_mcp",
          purpose: "FETCH_GOOGLE_ADS",
          args: {
            toolType: "get_live_google_campaigns",
            accountId: context.activeGoogleAccountId,
          },
        });
      }
    }

    // --- DETECT WORKSPACE / ACCOUNTS / AI CONTEXT / TOKEN USAGE ---
    if (steps.length === 0) {
      if (/\b(token\s*usage|tokens?\s*burned|ai\s*cost|api\s*usage)\b/i.test(lower)) {
        steps.push({
          toolName: "query_token_usage_metrics",
          purpose: "QUERY_TOKEN_USAGE",
          args: {},
        });
      } else if (/\b(connected\s+accounts?|connected\s+channels?|which\s+accounts?|my\s+accounts?|workspace\s+status)\b/i.test(lower)) {
        steps.push({
          toolName: "get_user_connected_accounts",
          purpose: "LIST_CONNECTED_ACCOUNTS",
          args: {},
        });
        steps.push({
          toolName: "list_connected_sheets",
          purpose: "LIST_CONNECTED_SHEETS",
          args: {},
        });
      } else if (/\b(ai\s*context|marketing\s*brief|business\s*unit|offering|product\s*node|workflow\s*context)\b/i.test(lower)) {
        steps.push({
          toolName: "get_user_ai_context",
          purpose: "INSPECT_AI_CONTEXT",
          args: {},
        });
      } else if (/\b(historical|database\s+metrics|saved\s+metrics|past\s+trends)\b/i.test(lower)) {
        steps.push({
          toolName: "query_database_metrics",
          purpose: "QUERY_DB_METRICS",
          args: { accountId: context.activeMetaAccountId || context.activeGoogleAccountId },
        });
      } else {
        // Inspect live workspace context so any arbitrary question about the user's setup is grounded in real DB state
        steps.push({
          toolName: "get_user_connected_accounts",
          purpose: "WORKSPACE_OVERVIEW",
          args: {},
        });
        steps.push({
          toolName: "list_connected_sheets",
          purpose: "WORKSPACE_SHEETS_OVERVIEW",
          args: {},
        });
      }
    }

    return {
      intent: steps.map((s) => s.purpose).join("+") || "DYNAMIC_EXECUTION",
      steps,
      tools: steps.map((s) => s.toolName),
    };
  }

  /**
   * 3. EXECUTE MULTI-STEP TOOL PLAN
   */
  static async executeTools({
    intentObj,
    instruction,
    context,
    previousNodeOutput = null,
    onStatus = null,
  }) {
    const executedTools = [];
    const steps = intentObj?.steps || [];

    for (const step of steps) {
      if (step.toolName === "_missing_meta_account") {
        executedTools.push({
          toolName: "fetch_live_meta_ads_mcp",
          purpose: step.purpose,
          toolArgs: {},
          toolResult: {
            error: true,
            message:
              "No Meta Ad Account is connected or specified. Please specify a Meta Ad Account ID (e.g., act_1416124059911929) or connect a Meta Ads account in Channels / AI Context.",
          },
          status: "FAILED",
        });
        continue;
      }

      if (typeof onStatus === "function") {
        onStatus({ toolName: step.toolName, status: `Running ${step.toolName}...` });
      }

      try {
        const toolArgs = {
          ...step.args,
          userId: context.userId,
        };

        // If this is an inspect_sheet_schema call, attach dynamically extracted requestedFields after reading headers
        const result = await executeAgentTool(step.toolName, toolArgs);

        if (
          step.toolName === "inspect_sheet_schema" &&
          result &&
          result.success &&
          Array.isArray(result.headers)
        ) {
          const reqFields = extractRequestedSheetFields(instruction, result.headers);
          if (reqFields.length > 0) {
            result.requestedFields = reqFields;
            result.fieldMatch = SheetInspectorService.matchRequestedFields(result.headers, reqFields);
          }
        }

        const isToolFailure =
          result === null ||
          result === undefined ||
          result?.success === false ||
          result?.error === true;

        executedTools.push({
          toolName: step.toolName,
          purpose: step.purpose,
          toolArgs: step.args,
          toolResult: result,
          status: isToolFailure ? "FAILED" : "SUCCESS",
        });

        if (typeof onStatus === "function") {
          onStatus({
            toolName: step.toolName,
            status: isToolFailure ? `Failed ${step.toolName}` : `Completed ${step.toolName}`,
          });
        }
      } catch (err) {
        executedTools.push({
          toolName: step.toolName,
          purpose: step.purpose,
          toolArgs: step.args,
          toolResult: {
            error: true,
            message: err.message || "Tool execution failed",
          },
          status: "FAILED",
        });

        if (typeof onStatus === "function") {
          onStatus({
            toolName: step.toolName,
            status: `Failed ${step.toolName}: ${err.message}`,
          });
        }
      }
    }

    return executedTools;
  }

  /**
   * 4. VALIDATE ACTUAL EXECUTION OUTCOMES (Never fabricates verification!)
   */
  static verifyTaskCompletion({ intentObj, instruction, executedTools = [], previousNodeOutput = null }) {
    if (executedTools.length === 0) {
      return {
        verified: false,
        partial: false,
        reason: "No tools were executed for this request.",
        outputData: null,
      };
    }

    const succeeded = executedTools.filter((t) => t.status === "SUCCESS");
    const failed = executedTools.filter((t) => t.status === "FAILED");

    if (succeeded.length === 0) {
      const reasons = failed
        .map((f) => f.toolResult?.message || f.toolResult?.error || `${f.toolName} failed`)
        .join("; ");
      return {
        verified: false,
        partial: false,
        reason: reasons || "All tool executions failed.",
        failedSteps: failed,
        succeededSteps: [],
        outputData: failed[0]?.toolResult || null,
      };
    }

    return {
      verified: failed.length === 0,
      partial: failed.length > 0 && succeeded.length > 0,
      reason:
        failed.length > 0
          ? `${succeeded.length} step(s) succeeded and ${failed.length} step(s) failed.`
          : "All tool executions returned live data.",
      failedSteps: failed,
      succeededSteps: succeeded,
      outputData: succeeded[succeeded.length - 1]?.toolResult || null,
    };
  }

  /**
   * 5. BUILD STRUCTURED CONTEXT METADATA FOR MULTI-TURN MEMORY
   */
  static extractContextMetadata(executedTools = [], fallbackMemory = null) {
    let sheetContext = fallbackMemory?.lastSheetContext || null;
    let metaContext = fallbackMemory?.lastMetaContext || null;

    for (const tc of executedTools) {
      if (tc.status !== "SUCCESS" || !tc.toolResult) continue;
      const res = tc.toolResult;

      if (
        tc.toolName === "extract_sheet_video_links" ||
        tc.toolName === "inspect_sheet_schema" ||
        tc.toolName === "update_connected_sheet_cells"
      ) {
        sheetContext = {
          sheetIndex: res.sheetIndex || null,
          sheetId: res.sheetId || null,
          spreadsheetId: res.spreadsheetId || null,
          sheetName: res.sheetName || null,
          sheetUrl: res.sheetUrl || null,
          worksheetTab: res.worksheetTab || null,
          availableTabs: res.availableTabs || [],
          headers: res.headers || sheetContext?.headers || [],
          detectedColumns: res.detectedColumns || res.schema?.semanticMap || null,
          videoEntries: Array.isArray(res.entries)
            ? res.entries.slice(0, 50)
            : sheetContext?.videoEntries || null,
        };
      }

      if (
        tc.toolName === "fetch_live_meta_ads_mcp" ||
        tc.toolName === "get_live_adsets" ||
        tc.toolName === "get_live_ad_creatives"
      ) {
        const rawCampaigns =
          res.campaigns || res.allCampaignsPerformance || res.topCampaignsBySpend || metaContext?.campaigns || [];
        metaContext = {
          accountId: res.accountId
            ? String(res.accountId).startsWith("act_")
              ? String(res.accountId)
              : `act_${String(res.accountId).replace(/^act_/, "")}`
            : metaContext?.accountId || null,
          accountName: res.accountName || metaContext?.accountName || null,
          currency: res.currency || metaContext?.currency || "INR",
          datePreset: res.datePreset || tc.toolArgs?.datePreset || metaContext?.datePreset || "maximum",
          campaigns: Array.isArray(rawCampaigns)
            ? rawCampaigns.slice(0, 100).map((c) => ({
                id: c.id || c.campaignId || null,
                name: c.name || c.campaignName || null,
                status: c.status || c.effective_status || null,
              }))
            : [],
          campaignIds: Array.isArray(rawCampaigns)
            ? rawCampaigns.map((c) => c.id || c.campaignId).filter(Boolean)
            : [],
        };
      }
    }

    return { sheetContext, metaContext };
  }

  /**
   * Optional LLM synthesis via Anthropic API (with model fallback chain).
   * Only used when ANTHROPIC_API_KEY is valid; strictly grounded in executedTools JSON.
   */
  static async trySynthesizeWithClaude({ instruction, executedTools, context }) {
    const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim().replace(/^["']|["']$/g, "");
    if (!apiKey || apiKey.length < 20 || apiKey.includes("your_anthropic")) {
      return null;
    }

    const memoryBlock = ConversationMemoryService.formatPromptMemoryBlock(context.sessionMemory);
    const toolSummaryJson = JSON.stringify(
      executedTools.map((t) => ({
        toolName: t.toolName,
        purpose: t.purpose,
        status: t.status,
        args: t.toolArgs,
        result: t.toolResult,
      })),
      null,
      2
    ).slice(0, 48000);

    const systemPrompt = `You are a precise Marketing Data & Operations AI Agent.
Generate your response EXCLUSIVELY from the ACTUAL TOOL EXECUTION RESULTS provided below.
STRICT RULES:
1. NEVER invent campaign names, IDs, metrics, spreadsheet rows, column values, or URLs.
2. NEVER output static filler like "Autonomous Task Execution Completed" or claim "VERIFIED & VALIDATED" unless an actual verification check occurred.
3. For Google Sheets video link extraction: output a concise Markdown table showing ONLY fields that actually exist (e.g. | Row | Creative Code | Media Type | Creative Name | Video URL | Validation |) with COMPLETE, UNTRUNCATED URLs. Do NOT dump all spreadsheet columns unless explicitly requested.
4. If a user requested a spreadsheet field/column that is in fieldMatch.missing, explicitly state that the field was not found in the worksheet headers and list actual available headers. Do NOT fabricate values.
5. For Meta Ads campaign lists: output "### Campaigns Retrieved" with "| Campaign Name | Campaign ID | Status |" and state the exact total number of campaigns returned (noting if pagination indicates more results).
6. If any tool failed or returned an API/permission error, explain the exact error clearly and honestly. If multi-step execution partially succeeded, report both succeeded and failed steps.`;

    for (const model of ANTHROPIC_MODEL_CANDIDATES) {
      try {
        const resp = await axios.post(
          "https://api.anthropic.com/v1/messages",
          {
            model,
            max_tokens: 3000,
            temperature: 0.1,
            system: systemPrompt,
            messages: [
              {
                role: "user",
                content: `${memoryBlock ? `${memoryBlock}\n\n` : ""}USER INSTRUCTION:\n${instruction}\n\nACTUAL TOOL EXECUTION RESULTS:\n${toolSummaryJson}`,
              },
            ],
          },
          {
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            timeout: 25000,
          }
        );

        const textBlock = (resp.data?.content || []).find((b) => b.type === "text")?.text;
        if (textBlock && textBlock.trim()) {
          return {
            text: textBlock.trim(),
            model,
            usage: resp.data?.usage || null,
          };
        }
      } catch (err) {
        const status = err.response?.status;
        if (status === 404) {
          continue; // Try next candidate model if retired/not found
        }
        // Auth / 401 / credit / timeout -> fall through to deterministic tool-grounded formatter
        break;
      }
    }

    return null;
  }

  /**
   * 6. DYNAMIC TOOL-GROUNDED RESPONSE SYNTHESIZER
   * Generates concise, accurate Markdown strictly from actual tool results and errors.
   */
  static async synthesizeResponse({
    intentObj,
    instruction = "",
    context = {},
    executedTools = [],
    validation = {},
    previousNodeOutput = null,
  }) {
    // First attempt live Claude synthesis if API key is valid
    const llmResult = await this.trySynthesizeWithClaude({
      instruction,
      executedTools,
      context,
    });
    if (llmResult?.text) {
      return llmResult.text;
    }

    const lower = String(instruction || "").toLowerCase();
    const sections = [];
    const fmtTab = (t) =>
      typeof t === "object" && t !== null ? t.title || t.tabName || t.name || "" : String(t || "");

    // Report partial execution banner if some steps succeeded and some failed
    if (validation?.partial) {
      sections.push(
        `> **Partial Execution Notice:** ${validation.succeededSteps.length} operation(s) completed and ${validation.failedSteps.length} operation(s) failed. Details for each step are shown below.`
      );
    }

    for (const tc of executedTools) {
      const res = tc.toolResult || {};

      // Skip intermediate metadata step if a downstream sheet extraction/inspection step also ran
      if (
        tc.purpose === "VERIFY_CONNECTED_SHEET_METADATA" &&
        executedTools.some(
          (other) =>
            other !== tc &&
            (other.toolName === "extract_sheet_video_links" ||
              other.toolName === "inspect_sheet_schema" ||
              other.toolName === "update_connected_sheet_cells")
        )
      ) {
        continue;
      }

      // Handle failed tool step transparently
      if (tc.status === "FAILED" || res.error === true || res.success === false) {
        const errMsg = res.message || res.error || "Operation failed.";
        if (tc.toolName === "fetch_live_meta_ads_mcp" || tc.toolName.includes("meta")) {
          sections.push(
            `### Meta Ads Request Failed\n\n` +
              `**Error:** ${errMsg}\n\n` +
              (res.requestedAccountId ? `- **Requested Account:** \`${res.requestedAccountId}\`\n` : "") +
              (Array.isArray(res.connectedAccountIds) && res.connectedAccountIds.length > 0
                ? `- **Connected Meta Accounts in Workspace:** ${res.connectedAccountIds.map((id) => `\`${id}\``).join(", ")}\n`
                : "")
          );
        } else if (tc.toolName.includes("sheet")) {
          sections.push(
            `### Google Sheets Operation Failed\n\n` +
              `**Error:** ${errMsg}` +
              (Array.isArray(res.availableTabs) && res.availableTabs.length > 0
                ? `\n\n**Available Worksheet Tabs:** ${res.availableTabs.map((t) => `\`${fmtTab(t)}\``).join(", ")}`
                : "")
          );
        } else {
          sections.push(`### Tool Error (\`${tc.toolName}\`)\n\n${errMsg}`);
        }
        continue;
      }

      // --- 1. LIST CONNECTED SHEETS ---
      if (tc.toolName === "list_connected_sheets" && tc.purpose !== "WORKSPACE_SHEETS_OVERVIEW") {
        const sheets = res.sheets || [];
        if (sheets.length === 0) {
          sections.push(
            `### Connected Google Spreadsheets\n\nNo Google Spreadsheets are currently connected in your AI Context Data Warehouse.`
          );
        } else {
          const rowsMd = sheets
            .map(
              (s) =>
                `| Sheet #${s.sheetIndex} | ${s.sheetName} | \`${s.spreadsheetId || "—"}\` | ${(s.availableTabs || []).join(", ") || "Default"} | ${(s.selectedTabNames || []).join(", ") || "All / Default"} |`
            )
            .join("\n");
          sections.push(
            `### Connected Google Spreadsheets (${sheets.length})\n\n` +
              `| Sheet # | Spreadsheet Name | Spreadsheet ID | Available Tabs | Selected Tabs |\n` +
              `|---|---|---|---|---|\n` +
              rowsMd
          );
        }
        continue;
      }

      // --- 2. EXTRACT SHEET VIDEO LINKS & MAP CREATIVE CODES ---
      if (tc.toolName === "extract_sheet_video_links") {
        const entries = res.entries || [];
        const det = res.detectedColumns || {};

        if (tc.purpose === "MAP_VIDEOS_TO_CREATIVE_CODES") {
          if (entries.length === 0) {
            sections.push(
              `### Creative Codes for Videos — ${res.sheetName} (\`${res.worksheetTab}\`)\n\n` +
                `No video rows were found in **Sheet #${res.sheetIndex}: ${res.sheetName}** (Worksheet: \`${res.worksheetTab}\`).`
            );
          } else if (!det.creativeCodeColumn) {
            sections.push(
              `### Creative Codes Lookup — ${res.sheetName} (\`${res.worksheetTab}\`)\n\n` +
                `No **Creative Code** column was found in **Sheet #${res.sheetIndex}: ${res.sheetName}** (Worksheet: \`${res.worksheetTab}\`).\n` +
                `Video rows found: **${entries.length}**.`
            );
          } else {
            const hasName = entries.some((e) => e.creativeName);
            const headerCols = ["Row", "Creative Code"];
            if (hasName) headerCols.push("Creative Name");
            headerCols.push("Video URL");

            const sep = `|${headerCols.map(() => "---").join("|")}|`;
            const body = entries
              .map((e) => {
                const cells = [
                  e.rowNumber,
                  `\`${e.creativeCode || "—"}\``,
                ];
                if (hasName) cells.push(String(e.creativeName || "—").replace(/\|/g, "\\|"));
                cells.push(e.videoUrl || "Missing URL");
                return `| ${cells.join(" | ")} |`;
              })
              .join("\n");

            sections.push(
              `### Video Creative Codes — Sheet #${res.sheetIndex}: ${res.sheetName}\n` +
                `- **Worksheet Tab:** \`${res.worksheetTab}\` (Spreadsheet ID: \`${res.spreadsheetId}\`)\n` +
                `- **Matched Column:** \`${det.creativeCodeColumn}\` → \`${(det.videoUrlColumns || []).join(", ") || "Video URL"}\`\n` +
                `- **Total Video Entries Mapped:** ${entries.length} (from ${res.totalRowsInWorksheet} worksheet row${res.totalRowsInWorksheet === 1 ? "" : "s"})\n\n` +
                `| ${headerCols.join(" | ")} |\n${sep}\n${body}`
            );
          }
          continue;
        }

        // Standard Video Link Extraction Table (concise: only existing fields!)
        if (entries.length === 0) {
          sections.push(
            `### Video Link Extraction — Sheet #${res.sheetIndex}: ${res.sheetName}\n` +
              `- **Worksheet Tab:** \`${res.worksheetTab}\` (Spreadsheet ID: \`${res.spreadsheetId}\`)\n` +
              `- **Rows Inspected:** ${res.totalRowsInWorksheet}\n\n` +
              `No video rows or video URLs were found in this worksheet.` +
              (det.videoUrlColumns?.length === 0
                ? ` Detected columns did not include a populated video link field.`
                : "")
          );
        } else {
          const cols = res.existingTableFields || [
            "Row",
            ...(det.creativeCodeColumn ? ["Creative Code"] : []),
            ...(det.mediaTypeColumn ? ["Media Type"] : []),
            ...(entries.some((e) => e.creativeName) ? ["Creative Name"] : []),
            "Video URL",
            "Validation",
          ];
          const sep = `|${cols.map(() => "---").join("|")}|`;
          const tableRows = entries
            .map((e) => {
              const rowCells = cols.map((colName) => {
                if (colName === "Row") return e.rowNumber;
                if (colName === "Creative Code") return e.creativeCode ? `\`${e.creativeCode}\`` : "—";
                if (colName === "Media Type") return String(e.mediaType || "—").replace(/\|/g, "\\|");
                if (colName === "Creative Name") return String(e.creativeName || "—").replace(/\|/g, "\\|");
                if (colName === "Video URL") return e.videoUrl || "Missing Video URL";
                if (colName === "Validation") return String(e.validation || "—").replace(/\|/g, "\\|");
                return "—";
              });
              return `| ${rowCells.join(" | ")} |`;
            })
            .join("\n");

          sections.push(
            `### Video Links Extracted — Sheet #${res.sheetIndex}: ${res.sheetName}\n` +
              `- **Worksheet Tab:** \`${res.worksheetTab}\` (Spreadsheet ID: \`${res.spreadsheetId}\`)\n` +
              `- **Source Video Column(s):** ${(det.videoUrlColumns || []).map((c) => `\`${c}\``).join(", ") || "Auto-detected URL cells"}\n` +
              `- **Records Extracted:** ${entries.length} video entr${entries.length === 1 ? "y" : "ies"} from ${res.totalRowsInWorksheet} worksheet row${res.totalRowsInWorksheet === 1 ? "" : "s"}${res.skippedNonVideoRows > 0 ? ` (${res.skippedNonVideoRows} non-video row(s) skipped)` : ""}\n\n` +
              `| ${cols.join(" | ")} |\n${sep}\n${tableRows}`
          );
        }
        continue;
      }

      // --- 3. DYNAMIC SPREADSHEET SCHEMA & FIELD INSPECTION ---
      if (tc.toolName === "inspect_sheet_schema") {
        const headers = res.headers || [];
        const rows = res.rows || [];
        const fm = res.fieldMatch;

        const asksForTabsOnly =
          /\b(worksheet\s*tabs?|tab\s*names?|list\s*tabs?|available\s*tabs?|which\s*tabs?)\b/i.test(lower) &&
          !/\b(rows?|values?|columns?|headers?)\b/i.test(lower);

        if (asksForTabsOnly) {
          sections.push(
            `### Worksheet Tabs — Sheet #${res.sheetIndex}: ${res.sheetName}\n` +
              `- **Spreadsheet ID:** \`${res.spreadsheetId}\`\n` +
              `- **Available Tabs (${(res.availableTabs || []).length}):** ${(res.availableTabs || []).map((t) => `\`${fmtTab(t)}\``).join(", ")}\n` +
              `- **Active / Selected Tab(s):** ${(res.selectedTabNames || [res.worksheetTab]).filter(Boolean).map((t) => `\`${fmtTab(t)}\``).join(", ")}`
          );
          continue;
        }

        // If user asked for specific column(s) that DO NOT exist in the sheet -> report honestly, zero fabricated data!
        if (fm && fm.missing.length > 0 && fm.matched.length === 0) {
          sections.push(
            `### Requested Field Not Found — Sheet #${res.sheetIndex}: ${res.sheetName} (\`${res.worksheetTab}\`)\n\n` +
              `The requested field(s) ${fm.missing.map((m) => `**"${m}"**`).join(", ")} do not exist in worksheet **\`${res.worksheetTab}\`**.\n\n` +
              `**Actual Available Columns (${headers.length}):**\n` +
              headers.map((h) => `- \`${h}\``).join("\n")
          );
          continue;
        }

        const wantsAllColumns = /\b(all\s+columns|entire\s+sheet|full\s+spreadsheet|every\s+column)\b/i.test(lower);
        let displayCols = [];

        if (fm && fm.matched.length > 0) {
          displayCols = fm.matched.map((m) => m.actualHeader);
        } else if (wantsAllColumns) {
          displayCols = headers;
        } else {
          // Pick up to 7 non-empty meaningful columns dynamically based on populated stats
          const populatedHeaders = (res.schema?.columnStats || [])
            .filter((cs) => cs.populatedCount > 0)
            .map((cs) => cs.header);
          displayCols = (populatedHeaders.length > 0 ? populatedHeaders : headers).slice(0, 7);
        }

        const missingNotice =
          fm && fm.missing.length > 0
            ? `> **Note:** Field(s) ${fm.missing.map((m) => `\`${m}\``).join(", ")} were not found in \`${res.worksheetTab}\`. Showing matched existing column(s) only.\n\n`
            : "";

        const maxRowsToShow = Math.min(rows.length, 25);
        const shownRows = rows.slice(0, maxRowsToShow);

        let tableBlock = "_Worksheet contains 0 data rows._";
        if (shownRows.length > 0 && displayCols.length > 0) {
          const th = `| Row | ${displayCols.map((c) => String(c).replace(/\|/g, "\\|")).join(" | ")} |`;
          const sep = `|---|${displayCols.map(() => "---").join("|")}|`;
          const tr = shownRows
            .map((r, i) => {
              const rNum = r._rowNumber || i + 2;
              const vals = displayCols.map((col) => {
                const v = r[col];
                const str = v === undefined || v === null || String(v).trim() === "" ? "—" : String(v).trim();
                return str.replace(/\|/g, "\\|").replace(/\n+/g, " ");
              });
              return `| ${rNum} | ${vals.join(" | ")} |`;
            })
            .join("\n");
          tableBlock = `${th}\n${sep}\n${tr}`;
        }

        const subsetNote =
          rows.length > maxRowsToShow
            ? `\n\n_Showing ${maxRowsToShow} of ${rows.length} rows retrieved from \`${res.worksheetTab}\`._`
            : "";

        sections.push(
          `### Spreadsheet Data — Sheet #${res.sheetIndex}: ${res.sheetName}\n` +
            `- **Worksheet Tab:** \`${res.worksheetTab}\` (Available Tabs: ${(res.availableTabs || []).map((t) => `\`${fmtTab(t)}\``).join(", ")})\n` +
            `- **Total Rows in Tab:** ${rows.length} | **Total Columns Discovered:** ${headers.length}` +
            (!wantsAllColumns && !fm && headers.length > displayCols.length
              ? ` _(displaying ${displayCols.length} populated columns; ask for specific columns or all columns if needed)_`
              : "") +
            `\n\n${missingNotice}${tableBlock}${subsetNote}`
        );
        continue;
      }

      // --- 4. UPDATE SHEET CELLS ---
      if (tc.toolName === "update_connected_sheet_cells") {
        const applied = (res.updatesApplied || [])
          .map((u) => `- Range \`${u.range}\` → \`${JSON.stringify(u.values)}\``)
          .join("\n");
        sections.push(
          `### Spreadsheet Updated — Sheet #${res.sheetIndex}: ${res.sheetName} (\`${res.worksheetTab}\`)\n` +
            `- **Updated Cells:** ${res.updatedCells || 0}\n` +
            `${applied}\n` +
            `- **Read-Back Verification:** \`${JSON.stringify(res.verifiedValues || [])}\``
        );
        continue;
      }

      // --- 5. META ADS CAMPAIGNS LIST (`get_live_campaigns_status`) ---
      if (
        tc.toolName === "fetch_live_meta_ads_mcp" &&
        tc.toolArgs?.toolType === "get_live_campaigns_status"
      ) {
        // Skip standalone campaign list table if a comparison/insights step in the same turn will merge them,
        // UNLESS the user explicitly asked to fetch/list campaigns as part of a multi-step prompt.
        const alsoHasInsightsStep = executedTools.some(
          (other) =>
            other !== tc &&
            other.status === "SUCCESS" &&
            other.toolName === "fetch_live_meta_ads_mcp" &&
            other.toolArgs?.toolType === "get_live_campaign_insights"
        );
        const explicitlyAskedForCampaignNames = /\b(campaign\s+names?|all\s+campaigns?|fetch\s+campaigns?|list\s+campaigns?)\b/i.test(
          lower
        );
        if (alsoHasInsightsStep && !explicitlyAskedForCampaignNames) {
          continue;
        }

        let campaigns = res.campaigns || [];
        // Optional status filter if user explicitly requested only ACTIVE or only PAUSED campaigns
        let filterLabel = "";
        if (/\bactive\s+campaigns?\b/i.test(lower) && !/\ball\s+campaigns?\b/i.test(lower)) {
          campaigns = campaigns.filter((c) => String(c.status).toUpperCase() === "ACTIVE");
          filterLabel = " (filtered to ACTIVE)";
        } else if (/\bpaused\s+campaigns?\b/i.test(lower) && !/\ball\s+campaigns?\b/i.test(lower)) {
          campaigns = campaigns.filter((c) => String(c.status).toUpperCase() === "PAUSED");
          filterLabel = " (filtered to PAUSED)";
        }

        const pag = res.pagination || {};
        const paginationNote = pag.hasMore
          ? `_Note: Retrieved ${campaigns.length} campaigns across ${pag.pagesFetched || 1} API page(s); additional pages exist on Meta Ads API._`
          : `**Total Campaigns Returned:** ${campaigns.length}${filterLabel} (Account: \`${res.accountId}\`${res.accountName ? ` — ${res.accountName}` : ""})`;

        if (campaigns.length === 0) {
          sections.push(
            `### Campaigns Retrieved\n\nNo campaigns${filterLabel} were returned for Meta Ad Account \`${res.accountId}\`.`
          );
        } else {
          const tableRows = campaigns
            .map(
              (c) =>
                `| ${String(c.name || "Unnamed").replace(/\|/g, "\\|")} | \`${c.id}\` | ${c.status || "UNKNOWN"} |`
            )
            .join("\n");
          sections.push(
            `### Campaigns Retrieved\n\n` +
              `| Campaign Name | Campaign ID | Status |\n` +
              `|---|---|---|\n` +
              `${tableRows}\n\n` +
              `${paginationNote}`
          );
        }
        continue;
      }

      // --- 6. META ADS PERFORMANCE / SPEND / COMPARISON / BEST CAMPAIGN ---
      if (
        tc.toolName === "fetch_live_meta_ads_mcp" &&
        (tc.toolArgs?.toolType === "get_live_campaign_insights" ||
          tc.toolArgs?.toolType === "get_live_today_insights")
      ) {
        const currency = res.currency || "INR";

        if (tc.toolArgs?.toolType === "get_live_today_insights") {
          const d = res.todayData || {};
          sections.push(
            `### Today's Meta Ads Performance (\`${res.accountId}\`)\n\n` +
              `| Metric | Value |\n|---|---|\n` +
              `| Spend | ${formatCurrency(d.spend || 0, currency)} |\n` +
              `| Impressions | ${Number(d.impressions || 0).toLocaleString("en-IN")} |\n` +
              `| Clicks | ${Number(d.clicks || 0).toLocaleString("en-IN")} |\n` +
              `| CTR | ${Number(d.ctr || 0).toFixed(2)}% |\n` +
              `| CPC | ${formatCurrency(d.cpc || 0, currency)} |`
          );
          continue;
        }

        const statusStep = executedTools.find(
          (s) =>
            s.status === "SUCCESS" &&
            s.toolName === "fetch_live_meta_ads_mcp" &&
            s.toolArgs?.toolType === "get_live_campaigns_status"
        );
        const allPerf = Array.isArray(res.allCampaignsPerformance)
          ? res.allCampaignsPerformance
          : res.topCampaignsBySpend || [];

        // Merge with statusStep campaigns if available so ₹0-spend campaigns from previous/current list are accounted for
        const perfMap = new Map();
        for (const p of allPerf) {
          perfMap.set(String(p.campaignId || p.campaignName), p);
        }
        if (statusStep?.toolResult?.campaigns) {
          for (const c of statusStep.toolResult.campaigns) {
            const keyById = String(c.id);
            const existingByName = [...perfMap.values()].find(
              (p) => p.campaignId === c.id || p.campaignName === c.name
            );
            if (!existingByName && !perfMap.has(keyById)) {
              perfMap.set(keyById, {
                campaignId: c.id,
                campaignName: c.name,
                status: c.status,
                spend: 0,
                impressions: 0,
                clicks: 0,
                ctr: 0,
                cpc: 0,
                cpm: 0,
                conversions: 0,
                cpa: null,
                cpr: null,
                roas: 0,
              });
            }
          }
        }
        const mergedCampaigns = [...perfMap.values()].sort((a, b) => (b.spend || 0) - (a.spend || 0));

        // 6a. Best-performing campaign
        if (tc.purpose === "RANK_BEST_META_CAMPAIGN") {
          const activeWithSpend = mergedCampaigns.filter((c) => Number(c.spend || 0) > 0);
          if (activeWithSpend.length === 0) {
            sections.push(
              `### Best-Performing Campaign Analysis (\`${res.accountId}\`)\n\n` +
                `All **${mergedCampaigns.length}** campaign(s) in \`${res.accountId}\` have **${formatCurrency(0, currency)} spend** in the queried period (\`${res.datePreset || "maximum"}\`), so no campaign can be ranked as best-performing yet.`
            );
          } else {
            const rankByRoas = /\broas|revenue|return\b/i.test(lower);
            const rankByCpa = /\bcpa|cpr|cost\s+per\b/i.test(lower);
            const rankByCtr = /\bctr|click[- ]through\b/i.test(lower);

            const sorted = [...activeWithSpend].sort((a, b) => {
              if (rankByRoas) return (b.roas || 0) - (a.roas || 0);
              if (rankByCpa) {
                const aCpa = a.cpa ?? Infinity;
                const bCpa = b.cpa ?? Infinity;
                return aCpa - bCpa;
              }
              if (rankByCtr) return (b.ctr || 0) - (a.ctr || 0);
              if ((b.conversions || 0) !== (a.conversions || 0)) {
                return (b.conversions || 0) - (a.conversions || 0);
              }
              if ((b.roas || 0) !== (a.roas || 0)) return (b.roas || 0) - (a.roas || 0);
              return (b.ctr || 0) - (a.ctr || 0);
            });

            const best = sorted[0];
            const topRows = sorted
              .slice(0, 10)
              .map(
                (c) =>
                  `| ${String(c.campaignName).replace(/\|/g, "\\|")} | \`${c.campaignId || "—"}\` | ${formatCurrency(c.spend, currency)} | ${c.conversions || 0} | ${c.cpa !== null && c.cpa !== undefined ? formatCurrency(c.cpa, currency) : "—"} | ${Number(c.ctr || 0).toFixed(2)}% | ${Number(c.roas || 0).toFixed(2)}x |`
              )
              .join("\n");

            sections.push(
              `### Best-Performing Campaign — \`${res.accountId}\`\n\n` +
                `**Top Campaign:** **${best.campaignName}** (\`${best.campaignId || "N/A"}\`)\n` +
                `- **Spend:** ${formatCurrency(best.spend, currency)} | **Conversions:** ${best.conversions || 0} | **CPA/CPR:** ${best.cpa !== null && best.cpa !== undefined ? formatCurrency(best.cpa, currency) : "N/A"} | **CTR:** ${Number(best.ctr || 0).toFixed(2)}% | **ROAS:** ${Number(best.roas || 0).toFixed(2)}x\n\n` +
                `| Campaign Name | Campaign ID | Spend | Conversions | CPA / CPR | CTR | ROAS |\n` +
                `|---|---|---|---|---|---|---|\n` +
                `${topRows}`
            );
          }
          continue;
        }

        // 6b. Campaign comparison
        if (tc.purpose === "COMPARE_META_CAMPAIGNS") {
          // Check if user named two specific campaigns in prompt
          const namedMatches = mergedCampaigns.filter(
            (c) =>
              c.campaignName &&
              (lower.includes(c.campaignName.toLowerCase()) ||
                (c.campaignId && lower.includes(String(c.campaignId))))
          );
          const subset = namedMatches.length >= 2 ? namedMatches : mergedCampaigns;

          if (subset.length === 0) {
            sections.push(
              `### Campaign Comparison (\`${res.accountId}\`)\n\nNo campaigns were found in \`${res.accountId}\` to compare.`
            );
          } else {
            const rowsMd = subset
              .map(
                (c) =>
                  `| ${String(c.campaignName).replace(/\|/g, "\\|")} | \`${c.campaignId || "—"}\` | ${c.status || "—"} | ${formatCurrency(c.spend, currency)} | ${Number(c.impressions || 0).toLocaleString("en-IN")} | ${Number(c.clicks || 0).toLocaleString("en-IN")} | ${Number(c.ctr || 0).toFixed(2)}% | ${formatCurrency(c.cpm || 0, currency)} | ${c.conversions || 0} | ${c.cpa !== null && c.cpa !== undefined ? formatCurrency(c.cpa, currency) : "—"} | ${Number(c.roas || 0).toFixed(2)}x |`
              )
              .join("\n");

            sections.push(
              `### Campaign Performance Comparison — \`${res.accountId}\` (${res.datePreset || "Custom Range"})\n\n` +
                `| Campaign Name | Campaign ID | Status | Spend | Impressions | Clicks | CTR | CPM | Conversions | CPA / CPR | ROAS |\n` +
                `|---|---|---|---|---|---|---|---|---|---|---|\n` +
                `${rowsMd}\n\n` +
                `**Account Total Spend:** ${formatCurrency(res.totalAccountSpend || 0, currency)} across ${mergedCampaigns.length} campaign(s).`
            );
          }
          continue;
        }

        // 6c. Standard Spend / Metrics Report (e.g. "Now fetch their spend", "Fetch CPR, CPA, ROAS, CTR, CPM, and spend")
        const spendOnly =
          /\bspend|spent\b/i.test(lower) &&
          !/\b(cpr|cpa|roas|ctr|cpm|cpc|impressions|clicks|conversions|full\s+performance)\b/i.test(lower);

        if (mergedCampaigns.length === 0) {
          sections.push(
            `### Meta Ads Performance — \`${res.accountId}\`\n\n` +
              `No campaign spend or insights records were returned for \`${res.accountId}\` (${res.datePreset || "maximum"}).\n` +
              `- **Total Account Spend:** ${formatCurrency(res.totalAccountSpend || 0, currency)}`
          );
        } else if (spendOnly) {
          const rowsMd = mergedCampaigns
            .map(
              (c) =>
                `| ${String(c.campaignName).replace(/\|/g, "\\|")} | \`${c.campaignId || "—"}\` | ${c.status || "—"} | ${formatCurrency(c.spend || 0, currency)} |`
            )
            .join("\n");
          sections.push(
            `### Campaign Spend — \`${res.accountId}\`${res.accountName ? ` (${res.accountName})` : ""}\n` +
              `- **Date Window:** \`${res.datePreset || (res.timeRange ? `${res.timeRange.since} to ${res.timeRange.until}` : "maximum")}\`\n` +
              `- **Total Account Spend:** **${formatCurrency(res.totalAccountSpend || 0, currency)}** (${res.campaignsWithSpendCount ?? mergedCampaigns.filter((c) => c.spend > 0).length} of ${mergedCampaigns.length} campaigns with spend > 0)\n\n` +
              `| Campaign Name | Campaign ID | Status | Spend (${currency}) |\n` +
              `|---|---|---|---|\n` +
              `${rowsMd}`
          );
        } else {
          const rowsMd = mergedCampaigns
            .map(
              (c) =>
                `| ${String(c.campaignName).replace(/\|/g, "\\|")} | \`${c.campaignId || "—"}\` | ${formatCurrency(c.spend || 0, currency)} | ${Number(c.impressions || 0).toLocaleString("en-IN")} | ${Number(c.clicks || 0).toLocaleString("en-IN")} | ${Number(c.ctr || 0).toFixed(2)}% | ${formatCurrency(c.cpm || 0, currency)} | ${c.conversions || 0} | ${c.cpa !== null && c.cpa !== undefined ? formatCurrency(c.cpa, currency) : "—"} | ${Number(c.roas || 0).toFixed(2)}x |`
            )
            .join("\n");
          sections.push(
            `### Meta Ads Campaign Performance — \`${res.accountId}\`${res.accountName ? ` (${res.accountName})` : ""}\n` +
              `- **Date Window:** \`${res.datePreset || (res.timeRange ? `${res.timeRange.since} to ${res.timeRange.until}` : "maximum")}\`\n` +
              `- **Totals:** Spend **${formatCurrency(res.totalAccountSpend || 0, currency)}** | Impressions **${Number(res.totalImpressions || 0).toLocaleString("en-IN")}** | Clicks **${Number(res.totalClicks || 0).toLocaleString("en-IN")}** | CTR **${Number(res.accountCtr || 0).toFixed(2)}%** | CPM **${formatCurrency(res.accountCpm || 0, currency)}** | Conversions **${res.totalConversions || 0}** | CPA/CPR **${res.accountCpa !== null && res.accountCpa !== undefined ? formatCurrency(res.accountCpa, currency) : "N/A"}** | ROAS **${Number(res.overallRoas || 0).toFixed(2)}x**\n\n` +
              `| Campaign Name | Campaign ID | Spend | Impressions | Clicks | CTR | CPM | Conversions | CPA / CPR | ROAS |\n` +
              `|---|---|---|---|---|---|---|---|---|---|\n` +
              `${rowsMd}`
          );
        }
        continue;
      }

      // --- 7. META AD SETS ---
      if (tc.toolName === "get_live_adsets") {
        const adSets = res.adSets || [];
        if (adSets.length === 0) {
          sections.push(`### Meta Ad Sets (\`${res.accountId}\`)\n\nNo ad sets were returned for this account.`);
        } else {
          const rowsMd = adSets
            .map(
              (as) =>
                `| ${String(as.name || "—").replace(/\|/g, "\\|")} | \`${as.id}\` | \`${as.campaignId || "—"}\` | ${as.status || "—"} | ${as.optimizationGoal || "—"} |`
            )
            .join("\n");
          sections.push(
            `### Meta Ad Sets Retrieved (\`${res.accountId}\`)\n\n` +
              `| Ad Set Name | Ad Set ID | Campaign ID | Status | Optimization Goal |\n` +
              `|---|---|---|---|---|\n` +
              `${rowsMd}\n\n` +
              `**Total Ad Sets Returned:** ${adSets.length}`
          );
        }
        continue;
      }

      // --- 8. META AD CREATIVES & CREATIVE PERFORMANCE ---
      if (tc.toolName === "get_live_ad_creatives") {
        const ads = res.ads || [];
        const currency = res.currency || "INR";
        if (ads.length === 0) {
          sections.push(`### Meta Ad Creatives (\`${res.accountId}\`)\n\nNo ad creatives were returned for \`${res.accountId}\`.`);
        } else {
          const hasPerf = ads.some((a) => a.performance);
          if (hasPerf) {
            const rowsMd = ads
              .slice(0, 40)
              .map((a) => {
                const p = a.performance || {};
                return `| ${String(a.adName || "—").replace(/\|/g, "\\|")} | \`${a.adId}\` | ${a.status || "—"} | ${a.creative?.videoId ? "Video" : a.creative?.imageUrl ? "Image" : "Creative"} | ${formatCurrency(p.spend || 0, currency)} | ${Number(p.ctr || 0).toFixed(2)}% | ${p.conversions || 0} | ${p.cpa !== null && p.cpa !== undefined ? formatCurrency(p.cpa, currency) : "—"} | ${Number(p.roas || 0).toFixed(2)}x |`;
              })
              .join("\n");
            sections.push(
              `### Meta Ad Creatives & Performance (\`${res.accountId}\`)\n\n` +
                `| Ad Name | Ad ID | Status | Format | Spend | CTR | Conversions | CPA | ROAS |\n` +
                `|---|---|---|---|---|---|---|---|---|\n` +
                `${rowsMd}\n\n` +
                `**Total Ads / Creatives Returned:** ${ads.length}`
            );
          } else {
            const rowsMd = ads
              .slice(0, 40)
              .map(
                (a) =>
                  `| ${String(a.adName || "—").replace(/\|/g, "\\|")} | \`${a.adId}\` | \`${a.creative?.creativeId || "—"}\` | ${a.status || "—"} | ${a.creative?.videoId ? `Video (\`${a.creative.videoId}\`)` : a.creative?.imageUrl ? "Image" : "Standard"} | ${String(a.creative?.title || "—").slice(0, 60).replace(/\|/g, "\\|")} |`
              )
              .join("\n");
            sections.push(
              `### Meta Ad Creatives Retrieved (\`${res.accountId}\`)\n\n` +
                `| Ad Name | Ad ID | Creative ID | Status | Asset Type | Headline / Title |\n` +
                `|---|---|---|---|---|---|\n` +
                `${rowsMd}\n\n` +
                `**Total Ad Creatives Returned:** ${ads.length}`
            );
          }
        }
        continue;
      }

      // --- 9. DAILY META -> SHEET SYNC ---
      if (tc.toolName === "sync_meta_ads_to_sheet") {
        sections.push(
          `### Meta Ads → Google Sheet Sync Result\n` +
            `- **Worksheet Tab:** \`${res.targetTab || "—"}\`\n` +
            `- **Date Synced:** \`${res.reportDate || "—"}\`\n` +
            `- **Rows Appended:** ${res.rowsAppended ?? 0}\n` +
            (res.message ? `\n${res.message}` : "")
        );
        continue;
      }

      // --- 10. VALIDATE GOOGLE DRIVE ASSET ---
      if (tc.toolName === "validate_google_drive_asset") {
        sections.push(
          `### Google Drive Asset Inspection\n` +
            `- **File ID:** \`${res.fileId || "—"}\`\n` +
            `- **Valid / Accessible:** ${res.valid ? "Yes" : "No"}\n` +
            (res.fileName ? `- **File Name:** \`${res.fileName}\`\n` : "") +
            (res.mimeType ? `- **MIME Type:** \`${res.mimeType}\`\n` : "") +
            (res.reason ? `- **Details:** ${res.reason}` : "")
        );
        continue;
      }

      // --- 11. WORKSPACE / CONNECTED ACCOUNTS / AI CONTEXT / OTHER TOOLS ---
      if (tc.toolName === "get_user_connected_accounts") {
        const sheetsStep = executedTools.find((s) => s.purpose === "WORKSPACE_SHEETS_OVERVIEW" && s.status === "SUCCESS");
        const metaList = (res.metaAccounts || [])
          .map((m) => `- **Meta Ads:** \`act_${String(m.accountId).replace(/^act_/, "")}\` (${m.accountName || "Unnamed"}, ${m.currency || "INR"})`)
          .join("\n");
        const googleList = (res.googleAccounts || [])
          .map((g) => `- **Google Ads:** \`${g.selectedCustomerId || g.accountId}\` (${g.accountName || "Google Ads"})`)
          .join("\n");
        const sheetList = (sheetsStep?.toolResult?.sheets || [])
          .map(
            (s) =>
              `- **Sheet #${s.sheetIndex}:** ${s.sheetName} (\`${s.spreadsheetId}\`) — Tabs: ${(s.availableTabs || []).join(", ") || "Default"}`
          )
          .join("\n");

        sections.push(
          `### Connected Workspace Context\n\n` +
            `**Ad Accounts:**\n${metaList || "- No Meta Ads accounts connected"}\n${googleList ? `${googleList}\n` : ""}\n` +
            (sheetList ? `**Connected Google Spreadsheets:**\n${sheetList}\n\n` : "") +
            `Specify a spreadsheet (e.g., _"Use Sheet #2 and fetch video link data"_) or an ad account (e.g., _"In account act_..., fetch all campaign names"_) to run a targeted query.`
        );
        continue;
      }

      if (tc.purpose === "WORKSPACE_SHEETS_OVERVIEW") {
        continue;
      }

      if (tc.toolName === "get_user_ai_context") {
        const bUnits = (res.businessUnits || []).map((b) => b.name || b.title).filter(Boolean);
        const channels = (res.adChannels || []).map((c) => `${c.channelName || c.channel}: \`${c.accountId}\``);
        const briefs = (res.briefs || []).map((b) => b.title || b.summary).filter(Boolean);
        const warehouses = (res.warehouses || []).length;
        sections.push(
          `### AI Context Configuration\n` +
            `- **Business Units (${bUnits.length}):** ${bUnits.join(", ") || "None"}\n` +
            `- **Ad Channels (${channels.length}):** ${channels.join(", ") || "None"}\n` +
            `- **Marketing Briefs (${briefs.length}):** ${briefs.join(", ") || "None"}\n` +
            `- **Data Warehouse Nodes:** ${warehouses}`
        );
        continue;
      }

      // Generic JSON-backed fallback for any other specialized tool (Google Ads, Token Usage, DB Metrics)
      sections.push(
        `### Result from \`${tc.toolName}\`\n\n\`\`\`json\n${JSON.stringify(res, null, 2).slice(0, 4000)}\n\`\`\``
      );
    }

    return sections.join("\n\n---\n\n") || "No data was returned by the executed tools.";
  }

  /**
   * 7. STANDARD CHAT EXECUTION ENTRYPOINT
   * Note: Does NOT emit text_delta directly unless streamDirect === true;
   * chat.controller.js streams the returned content once to prevent duplicate outputs.
   */
  static async executeChat({
    res,
    onEvent,
    conversationId,
    userMessage,
    accountId,
    userId,
    sessionMemory = null,
    streamDirect = false,
  }) {
    const context = await this.retrieveContext({
      userId,
      accountId,
      metaAccountId: accountId,
      conversationId,
      userMessage,
      sessionMemory,
    });

    const intentObj = this.classifyIntent(userMessage, context);

    // Delegate explicit interactive ad creation requests to CampaignPreparationService
    if (intentObj.intent === "CAMPAIGN_CREATION_FLOW" && !context.isAutomation) {
      try {
        if (typeof onEvent === "function") {
          onEvent({
            type: "tool_status",
            toolName: "campaign_preparation",
            status: "Preparing campaign validation & preview...",
          });
        }
        const prepResult = await CampaignPreparationService.handleWorkflow({
          userId,
          conversationId,
          userMessage,
          metaAccountId: context.activeMetaAccountId,
        });

        if (prepResult && prepResult.content) {
          const replyContent = prepResult.content;
          if (streamDirect) {
            if (typeof onEvent === "function") onEvent({ type: "text_delta", content: replyContent });
            if (res) AgentStreamHandler.sendChunk(res, replyContent);
          }
          return {
            content: replyContent,
            result: replyContent,
            toolCalls: prepResult.toolCalls || [],
            status: "completed",
            preparationData: prepResult.preparationSession || null,
            contextMetadata: this.extractContextMetadata(prepResult.toolCalls || [], context.sessionMemory),
            tokenUsage: {
              totalTokens: Math.round(((userMessage?.length || 50) + (replyContent?.length || 200)) / 3.8),
              model: "claude-sonnet-4-5",
            },
          };
        }
      } catch (prepErr) {
        console.warn("[AiAgentOrchestrator CampaignPreparation delegation warning]:", prepErr.message);
      }
    }

    const executedTools = await this.executeTools({
      intentObj,
      instruction: userMessage,
      context,
      onStatus: (st) => {
        if (typeof onEvent === "function") {
          onEvent({ type: "tool_status", toolName: st.toolName, status: st.status });
        }
        if (res) {
          AgentStreamHandler.sendToolStatus(res, st.toolName, st.status);
        }
      },
    });

    const validation = this.verifyTaskCompletion({
      intentObj,
      instruction: userMessage,
      executedTools,
    });

    const finalMarkdown = await this.synthesizeResponse({
      intentObj,
      instruction: userMessage,
      context,
      executedTools,
      validation,
    });

    if (streamDirect) {
      if (typeof onEvent === "function") {
        onEvent({ type: "text_delta", content: finalMarkdown });
      }
      if (res) {
        AgentStreamHandler.sendChunk(res, finalMarkdown);
      }
    }

    const contextMetadata = this.extractContextMetadata(executedTools, context.sessionMemory);

    return {
      content: finalMarkdown,
      result: finalMarkdown,
      toolCalls: executedTools,
      status: validation.verified ? "completed" : validation.partial ? "partial" : "failed",
      validation,
      contextMetadata,
      tokenUsage: {
        totalTokens: Math.round(((userMessage?.length || 0) + (finalMarkdown?.length || 0)) / 3.8),
        model: "claude-sonnet-4-5",
      },
    };
  }

  /**
   * 8. AI AUTOMATION WORKFLOW NODE EXECUTION ENTRYPOINT
   * Executes a node's complete original instruction sequentially with dynamic tool discovery,
   * upstream structured data consumption, semantic sheet mapping, and strict completion verification.
   */
  static async executeNodeTask({
    instruction,
    node,
    previousNodeOutput = null,
    sharedWorkflowContext = {},
    workflowId = null,
    userId,
    executionId,
    onProgress = null,
  }) {
    if (typeof onProgress === "function") {
      await Promise.resolve(
        onProgress({
          state: "running",
          message: `Executing node "${node?.label || node?.type || "Custom Task"}"...`,
        })
      ).catch(() => {});
    }

    const effectiveSharedContext = { ...(sharedWorkflowContext || {}) };
    if (
      previousNodeOutput &&
      (!Array.isArray(effectiveSharedContext.previousNodeResults) ||
        effectiveSharedContext.previousNodeResults.length === 0)
    ) {
      effectiveSharedContext.previousNodeResults = [
        typeof previousNodeOutput === "object" && previousNodeOutput !== null
          ? {
              nodeId: previousNodeOutput.nodeId || "previous_node",
              nodeLabel: previousNodeOutput.nodeLabel || "Previous Node",
              status: "completed",
              outputText:
                previousNodeOutput.outputText ||
                previousNodeOutput.response ||
                previousNodeOutput.result ||
                (typeof previousNodeOutput === "string" ? previousNodeOutput : JSON.stringify(previousNodeOutput)),
              structuredData: previousNodeOutput.structuredData || previousNodeOutput,
            }
          : {
              nodeId: "previous_node",
              nodeLabel: "Previous Node",
              status: "completed",
              outputText: String(previousNodeOutput),
              structuredData: {},
            },
      ];
    }

    const outcome = await NodeTaskAgentService.executeNodeTask({
      userId,
      instruction,
      node,
      workflowId,
      executionId,
      sharedWorkflowContext: effectiveSharedContext,
    });

    if (typeof onProgress === "function") {
      await Promise.resolve(
        onProgress({
          state: outcome.status === "WAITING_FOR_INPUT" ? "waiting_for_input" : "completed",
          message:
            outcome.status === "WAITING_FOR_INPUT"
              ? outcome.response
              : `Completed with ${outcome.toolCalls?.length || 0} verified tool call(s).`,
        })
      ).catch(() => {});
    }

    return {
      status: outcome.status === "WAITING_FOR_INPUT" ? "waiting_for_input" : "completed",
      agentStatus: outcome.status,
      originalInstruction: outcome.originalInstruction,
      response: outcome.response,
      result: outcome.response,
      content: outcome.response,
      executionSummary: outcome.executionSummary,
      toolCalls: outcome.toolCalls,
      dataProcessing: outcome.dataProcessing,
      structuredData: outcome.structuredData,
      output: {
        status: outcome.status === "WAITING_FOR_INPUT" ? "waiting_for_input" : "completed",
        response: outcome.response,
        executionSummary: outcome.executionSummary,
        dataProcessing: outcome.dataProcessing,
        structuredData: outcome.structuredData,
        validation: outcome.validation,
      },
      validation: outcome.validation,
      durationMs: outcome.durationMs,
    };
  }
}

export default AiAgentOrchestrator;
