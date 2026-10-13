import { query } from "@anthropic-ai/claude-agent-sdk";
import ChatMessage from "../../models/chatMessage.js";
import GoogleAccount from "../../models/googleAccountModel.js";
import MetaAccount from "../../models/metaAccount.js";
import { AgentStreamHandler } from "./agentStream.js";
import { ADS_ALLOWED_TOOLS, createAdsMcpServer } from "./claudeAgentTools.js";

const getLastClaudeSessionId = async (conversationId) => {
  const last = await ChatMessage.findOne({
    conversationId,
    claudeSessionId: { $ne: null },
  })
    .sort({ createdAt: -1 })
    .select("claudeSessionId")
    .lean();

  return last?.claudeSessionId || null;
};

import { getUserAiContext } from "./queryDbMetrics.js";

export const loadWorkspaceSkills = async () => {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const skillDirs = [
      path.resolve(process.cwd(), ".agents/skills"),
      path.resolve(process.cwd(), "backend/.agents/skills"),
      path.resolve(process.cwd(), "../.agents/skills"),
    ];

    const skills = [];
    const seen = new Set();

    for (const dir of skillDirs) {
      if (fs.existsSync(dir)) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !seen.has(entry.name)) {
            const skillFile = path.join(dir, entry.name, "SKILL.md");
            if (fs.existsSync(skillFile)) {
              seen.add(entry.name);
              const content = fs.readFileSync(skillFile, "utf8");
              const descMatch = content.match(/description:\s*>?-?\s*([^\n]+(?:\n\s+[^\n]+)*)/i);
              skills.push({
                name: entry.name,
                description: descMatch ? descMatch[1].replace(/\n\s+/g, " ").trim() : "Custom workspace skill",
              });
            }
          }
        }
      }
    }

    if (skills.length === 0) return "None configured.";
    return skills.map((s, i) => `  ${i + 1}. **${s.name}**: ${s.description} (Call "get_skill_details" with skillName: "${s.name}" to view full guidelines)`).join("\n");
  } catch (err) {
    return "Error loading skills";
  }
};

export const buildSystemPrompt = async ({ accountId, userId }) => {
  let googleContextText = "No Google Ads account connected";
  let metaContextText = "No Meta Ads account connected";
  let aiContextText = "No custom AI context workflow configured yet.";
  let skillsText = "None configured.";

  try {
    const [googleAcc, metaAcc, aiCtx, loadedSkills] = await Promise.all([
      userId ? GoogleAccount.findOne({ userId, isActive: true }).lean() : null,
      userId ? MetaAccount.findOne({ userId, isActive: true }).lean() : null,
      userId ? getUserAiContext({ userId }).catch(() => null) : null,
      loadWorkspaceSkills(),
    ]);

    skillsText = loadedSkills;

      if (googleAcc) {
        const rawId = String(googleAcc.accountId || "").replace(/[^0-9]/g, "");
        const formattedId = /^\d{10}$/.test(rawId) ? rawId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : rawId;
        const childList = Array.isArray(googleAcc.accounts) && googleAcc.accounts.length > 0 ? googleAcc.accounts : [];

        if (googleAcc.isManager && childList.length > 0) {
          const childRows = childList.map((c, i) => {
            const cId = String(c.customerId || "").replace(/[^0-9]/g, "");
            const cFormatted = /^\d{10}$/.test(cId) ? cId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : cId;
            return `  ${i + 1}. **"${c.name || "Child Account"}"** — Customer ID: \`${cFormatted}\` (\`${cId}\`) [Status: ${c.status || "ENABLED"}]`;
          }).join("\n");

          const childId = googleAcc.selectedCustomerId || (childList.find((a) => !a.isManager)?.customerId) || rawId;
          const mgrId = googleAcc.managerCustomerId || googleAcc.managerAccountId || rawId;
          const mgrFormatted = /^\d{10}$/.test(String(mgrId)) ? String(mgrId).replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : mgrId;

          googleContextText = `Manager Account (MCC): \`${mgrFormatted}\` (\`${mgrId}\`) - "${googleAcc.accountName}" | Currency: ${googleAcc.currency || "INR"}
Active Child Accounts under Manager (${mgrFormatted}):
${childRows}
Default Selected Child Customer ID: \`${childId}\``;
        } else {
          googleContextText = `Connected Google Ads Account: "${googleAcc.accountName}"
Customer ID: \`${formattedId}\` (\`${rawId}\`)
Account Status: ${googleAcc.accountStatus === 1 || googleAcc.isActive ? "ACTIVE" : "PAUSED"}
Currency: ${googleAcc.currency || "INR"} | TimeZone: ${googleAcc.timezoneName || "Asia/Kolkata"}
Hierarchy: Direct / Single Account (No Manager MCC)`;
        }
      }

      if (metaAcc) {
        metaContextText = `Account ID: ${metaAcc.accountId} | Name: "${metaAcc.accountName}" | Currency: ${metaAcc.currency || "INR"}`;
      }

      if (aiCtx && (aiCtx.hasContext || (aiCtx.rawNodes && aiCtx.rawNodes.length > 0) || (aiCtx.flows && aiCtx.flows.length > 0))) {
        const bus = (aiCtx.businessUnits || []).map((b) => `  - **${b.name || "Business Unit"}**: ${b.description || "Active Unit"}`).join("\n") || "  - None configured";
        
        const channels = (aiCtx.adChannels || []).map((c) => {
          const accStr = c.accountId ? ` [Ad Account ID: \`${c.accountId}\`${c.accountName ? ` - "${c.accountName}"` : ""}]` : " [Account: Auto-detect / Connected]";
          return `  - **${c.channel || c.channelName || "Ad Channel"}**${accStr} | Funnel Event: "${c.funnelEvent || "Purchase"}"${c.funnelDescription ? ` (${c.funnelDescription})` : ""}`;
        }).join("\n") || "  - None configured";

        const prods = (aiCtx.products || []).map((p) => {
          const cat = p.catalog && p.catalog.length > 0
            ? `\n    * Catalog Items (${p.catalog.length}): ${p.catalog.slice(0, 5).map(item => `"${item.name || "Item"}"${item.price ? ` (₹${item.price})` : ""}${item.url ? ` [${item.url}]` : ""}`).join(", ")}`
            : "";
          return `  - **${p.name || p.productName || "Product"}** | Landing Page URL: \`${p.url || p.productUrl || "N/A"}\` | Price: ₹${p.price || p.productPrice || "N/A"} | Platforms: ${(p.platforms || ["Web"]).join(", ")}${cat}`;
        }).join("\n") || "  - None configured";

        const briefs = (aiCtx.marketingBriefs || []).map((b) => {
          return `  - **${b.name || "Marketing Brief"}**: Target KPIs: "${b.kpis || "ROAS / Sales"}" | Tracked Metrics: "${b.metrics || "Conversions"}" | Strategy & Angles: "${b.description || "High converting direct response"}"`;
        }).join("\n") || "  - None configured";

        const dws = (aiCtx.dataWarehouses || []).map((d) => {
          const parts = [];
          if (d.sheetUrl) parts.push(`Sheet URL: "${d.sheetUrl}" [Status: ${d.excelSyncStatus || "READY"}, Rows: ${d.totalRows || 0}]`);
          else if (d.workbookName || d.workbookId) parts.push(`Workbook: "${d.workbookName || d.workbookId}" [Status: ${d.excelSyncStatus || "READY"}]`);
          if (d.googleDriveConnected || d.googleDriveEmail) parts.push(`Google Drive: "${d.googleDriveEmail || "Connected"}"`);
          const purpose = d.dataLevel || d.dataLabels;
          if (purpose) parts.push(`Data Level: "${purpose}"`);
          if (parts.length === 0) parts.push(`${d.name} (${d.platform || "Excel Sheet & Google Drive"})`);
          return `  - ${parts.join(" | ")}`;
        }).join("\n") || "  - None configured";

        const flowList = (aiCtx.flows || []).map((f, i) => {
          const lp = f.campaignLaunchParameters || {};
          return `  - Flow #${f.flowIndex || i + 1} (${f.flowTag || "Workflow"}): ${f.flowSummary}
    * Synthesized Blueprint: Channel: **${lp.channel || "Meta Ads"}** | Account ID: \`${lp.accountId || "Auto"}\` | Target Product: "${lp.productName || "Product"}" (\`${lp.productUrl || "N/A"}\`) | Funnel: "${lp.funnelEvent || "Purchase"}" | Target KPIs: "${lp.kpis || "ROAS"}"`;
        }).join("\n") || "  - Direct Unified Context Canvas";

        aiContextText = `Workflow Name: "${aiCtx.workflowName || "Primary AI Context"}" (${aiCtx.totalFlows || 1} active flow paths, ${aiCtx.totalNodes || 1} total nodes)
1. Business Units:
${bus}
2. Configured Ad Channels:
${channels}
3. Marketing Strategy & Briefs:
${briefs}
4. Configured Products, Landing Pages & Catalogs:
${prods}
5. Warehouse & Media Data Sources:
${dws}
6. Flow Pipelines & Pre-Synthesized Launch Parameters:
${flowList}`;
      }
    } catch (e) {
      console.warn("Error building system prompt context:", e?.message || e);
    }

  return `You are Newton Ads AI, an advanced multi-channel performance marketing intelligence assistant with real-time access to Google Ads, Meta Ads, and the user's structured AI Context Flow hierarchy via live MCP servers and database analytics.

Active Context:
- Active Ad Account Param: ${accountId || "Auto-detected"}
- Google Ads Context:
${googleContextText}
- Meta Ads Context: ${metaContextText}

User's Structured Marketing AI Context & Flow Graph:
${aiContextText}

Capabilities & Exact Execution Guidelines:
1. Google Ads Account Resolution & Seamless Multi-Account Switching:
   - Target the authenticated Google Ads customer account shown in the Google Ads Context above, or whichever specific customer ID/name the user specifies in their prompt (e.g. "3026285598", "Newton Ads Test Account", "Shoe Store", etc.).
   - If the user specifies or asks to create a campaign on a particular account:
     * Call "switch_google_account" or pass that "accountId" directly into the campaign tools.
     * Proceed immediately with the full 9-step campaign creation without stopping.
     * ❌ NEVER ask the user to manually update MongoDB database (e.g., db.connectedAccounts.updateOne) or restart their backend server.
     * ❌ NEVER claim the database update is not applied. Account resolution and database updates happen automatically and instantly in real-time.
   - Do NOT assume or invent arbitrary non-existent customer IDs.

2. Data Accuracy, Zero Hallucination & Error Transparency Rule (CRITICAL):
   - ALWAYS retrieve actual real data from the database or Google Ads MCP for that specific customer account.
   - **If data (impressions, clicks, spend, conversions) exists for that specific account**: Return the exact metrics clearly formatted.
   - **If NO data or 0 spend/impressions is present for that specific account**: Explicitly inform the user that no Google Ads spend or performance data is available for this date range. Never fabricate numbers.
   - **If Google Ads API returns "Permission denied", "The caller does not have permission", "DEVELOPER_TOKEN_NOT_APPROVED", or any API error**:
     * ❌ NEVER return random data.
     * ❌ NEVER return fake or simulated spend/metrics.
     * ✅ Return the ACTUAL Google Ads API error message clearly to the user, explaining the exact reason.

3. Performance & Spend Queries (e.g. "How much did I spend in the last 7 days on Google Ads?"):
   - Call "fetch_live_google_ads_mcp" with datePreset: "last_7d" (or "last_30d", "today", "yesterday") or call "query_database_metrics" with channel: "google" and the target account ID.
   - If the tool reports 0 spend or empty insights, report that clearly.

4. Campaign Creation & Management (CRITICAL MANDATORY TOOL RULE):
   - When the user asks to create a Child Account under their Manager MCC:
     * Call "create_google_child_account" with name (e.g. "Shoe Store Client Account"), currencyCode ("INR"), and timeZone ("Asia/Kolkata").
     * The tool will create the child account, save it to the user's connected accounts, and set it as active.
   - When the user asks to create, launch, or draft an advertising campaign on an account:
     * If an account is specified (e.g. "3026285598"), pass accountId to the tools.
     * Execute the complete dependency chain step-by-step:
       Step 1: create_google_campaign_budget (dailyBudget in currency units, e.g. 500 for ₹500/day, accountId) ➔ get budgetResourceName
       Step 2: create_google_campaign (name, channelType: "SEARCH", budgetResourceName, biddingStrategy: "MANUAL_CPC" or "MAXIMIZE_CONVERSIONS", status: "PAUSED", accountId) ➔ get campaignResourceName & campaignId
       Step 3: create_google_ad_group (campaignResourceName, name: "Ad Group Name", status: "ENABLED", accountId) ➔ get adGroupResourceName
       Step 4: create_google_keywords (adGroupResourceName, keywords: [{ text, matchType: "BROAD"|"PHRASE"|"EXACT", bid }], accountId) ➔ get keyword resources
       Step 5: create_google_negative_keywords (campaignResourceName or adGroupResourceName, keywords: [{ text, matchType: "BROAD" }], accountId) ➔ get negative keyword resources
       Step 6: create_google_responsive_search_ad (adGroupResourceName, headlines: [min 3 headlines], descriptions: [min 2 descriptions], finalUrl, accountId) ➔ get ad resource
       Step 7: set_google_campaign_locations (campaignResourceName, locations: ["India", ...], accountId) ➔ get location targeting resources
       Step 8: set_google_campaign_languages (campaignResourceName, languages: ["English", "Hindi", ...], accountId) ➔ get language targeting resources
       Step 9: verify_google_campaign (campaignResourceName, campaignId, accountId) ➔ confirm all resources exist and report verified structured status
     - For Meta Ads (Full Campaign, Ad Set, Targeting & Ad Creative Setup):
       * If user requests creating Meta ads from an Excel sheet or connected data warehouse:
         1. Call "get_connected_sheet_rows" FIRST to retrieve sheetName, headers/columns, and row values.
         2. Explicitly report the sheet name ("sheetName") and row count to the user.
         3. Read exact row fields: campaign_name, adset_name, ad_name, headline, primary_text, daily_budget, landing_page_url, drive_url, etc.
       * Dynamic Hierarchy Naming Rules (CRITICAL):
         - Extract both Campaign Name and Ad Set Name dynamically from the user's latest chat instruction (e.g. Campaign name: `<name>`, Ad set name: `<name>`).
         - Never hardcode or invent default campaign names or ad set names.
         - Never search the spreadsheet for these names unless the user explicitly requests that they come from the sheet.
         - If either required name is missing or ambiguous, ask the user for clarification rather than creating campaigns with placeholder or default names.
         - Log/track the source of each name as CHAT_INSTRUCTION.
       * Execute the complete dependency chain step-by-step:
         Step 1: create_meta_campaign (name: user-specified campaign name from chat, objective: "OUTCOME_SALES", dailyBudget, status: "PAUSED" or "ACTIVE", accountId) ➔ get campaignId
         Step 2: create_meta_ad_set (campaignId, name: user-specified ad set name from chat, dailyBudget, optimizationGoal: "OFFSITE_CONVERSIONS", status: "PAUSED", targeting: { locations: ["India"], ageMin: 18, ageMax: 65, interests: [...] }, accountId) ➔ get adSetId
         Step 3: create_meta_ad (adSetId, name: ad_name from sheet, headline, primaryText, description, linkUrl, callToAction: "SHOP_NOW", status: "PAUSED", accountId) ➔ get adId
         Step 4: verify_meta_campaign (campaignId, adSetId, adId, accountId) ➔ confirm and report verified complete campaign status
     - NEVER claim "I will create it" or say a campaign/ad was created unless the creation tools executed and returned real Meta API response IDs!
     - Never invent IDs. Always pass the actual resource names/IDs returned from the previous step.

5. Structured Error Handling for Known Google Ads API Limitations (CRITICAL):
   - **Limitation A: Developer Token Access (DEVELOPER_TOKEN_ACCESS / ACTION_NOT_PERMITTED)**:
     * If any creation tool returns errorType "DEVELOPER_TOKEN_ACCESS" or code "ACTION_NOT_PERMITTED":
       - This is an account/developer-token access limitation (Test Access developer token cannot mutate non-test production accounts), NOT a malformed campaign request or broken backend code.
       - Do NOT claim that the backend code is broken.
       - Do NOT automatically switch accounts or use an MCC account. The selected child customer account must remain the target account.
       - Clearly inform the user: "The developer token does not currently have permission to perform mutations on this production account (Test Access mode)."
   - **Limitation B: Conversion Tracking / Target CPA (CONVERSION_TRACKING / CONVERSION_TRACKING_NOT_ENABLED)**:
     * When using "MAXIMIZE_CONVERSIONS" with "targetCpa", if Google Ads returns "CONVERSION_TRACKING_NOT_ENABLED":
       - Do NOT silently remove "targetCpa" without telling the user.
       - Explain the exact reason: Conversion tracking is not enabled/configured for this Google Ads account, which Google requires before applying a Target CPA constraint.
       - Proactively offer alternative supported bidding configurations: "MAXIMIZE_CONVERSIONS" (without Target CPA), "MANUAL_CPC", or "MAXIMIZE_CLICKS".
   - **Step-by-Step Reporting Checklist**:
     * Always display a clear checklist indicating which steps succeeded and the exact step that failed:
       Example:
       Campaign Budget:       ✅ Created (budgetResourceName)
       Campaign:              ❌ Failed (Reason: ACTION_NOT_PERMITTED or CONVERSION_TRACKING_NOT_ENABLED)
       Ad Group:              ⏸️ Pending
       Keywords:              ⏸️ Pending
       Responsive Search Ad:  ⏸️ Pending
       Targeting:             ⏸️ Pending
     * Never say "Campaign Creation Failed (As Expected)". Always explain the exact Google Ads API reason and the action required.

6. Campaign Structure, Keywords & Ads Inspection:
   - To inspect existing keywords for an account or campaign: Call "list_google_keywords" (returns match types, status, CPC bids, quality score, impressions, clicks, spend).
   - To inspect creative copy and Responsive Search Ads: Call "list_google_ads" (returns headlines, descriptions, paths, ad strength, final URLs).
   - To audit or inspect the full campaign hierarchy (budget + ad groups + keywords count + ads preview): Call "get_google_campaign_structure" with campaignId.
   - All keywords, ads, and campaign structures fetched are automatically persisted and synchronized in MongoDB for fast retrieval.

7. Autonomous Campaign, Ad Set & Ad Creative Creation from User's AI Context & SKILL.md Guidelines (CRITICAL MANDATORY INSTRUCTION):
   - Whenever the user asks to create, launch, or setup a campaign, ad set, or ad (in ANY phrasing or language, e.g. "ad create kardo ai context ma jo setup kya us data k use kar ka", "create campaign from flow", "skill.md dekh kar complete ad create karo", "campaign adset ad sab banao"):
     * **MANDATORY SKILL.MD ADHERENCE**: You MUST strictly adhere to the execution runbook in **SKILL.md** (\`meta-ads-campaign-creator\` / workspace skills). Call "get_skill_details" with \`skillName: "meta-ads-campaign-creator"\` if needed, and execute the full multi-level creation chain without skipping any level.
     * **Step 1: Inspect AI Context & Target Account**:
       - Read the user's AI Context from section "User's Structured Marketing AI Context & Flow Graph" above (or call "get_user_ai_context").
       - Resolve the target advertising channel (Meta Ads vs Google Ads) and the specific target Ad Account ID (\`adAccountId\` from the Ad Channel node or connected accounts).
       - Extract Product Name, Landing Page Destination URL (\`productUrl\`), Price, Catalog items, Marketing Brief (KPIs, Strategy, Hooks), and Funnel Event (\`Purchase\`, \`Leads\`, \`Traffic\`).
     * **Step 2: META ADS Multi-Level Creation Hierarchy (According to SKILL.md)**:
       - **Level 1 — Campaign Level**:
         Call \`create_meta_campaign\`:
         * \`name\`: Dynamic campaign name specified by user in chat instruction (source: CHAT_INSTRUCTION)
         * \`objective\`: \`"OUTCOME_SALES"\` (for Purchase / E-commerce), \`"OUTCOME_LEADS"\` (for Leads), \`"OUTCOME_TRAFFIC"\` (for Traffic)
         * \`dailyBudget\`: Extract exact budget from user message or Excel Sheet column (e.g. \`Campaign_campaign_daily_budget_inr\`, \`campaign_daily_budget_inr\`, \`daily_budget_inr\`, \`daily_budget\`, \`budget\`), defaulting to 1000 INR only if unspecified.
         * \`status\`: \`"ACTIVE"\` (or \`"PAUSED"\`)
         * \`accountId\`: target Meta Account ID
       - **Level 2 — Ad Set & Targeting Level**:
         Call \`create_meta_ad_set\`:
         * \`campaignId\`: Returned campaign ID from Level 1
         * \`name\`: Dynamic ad set name specified by user in chat instruction (source: CHAT_INSTRUCTION)
         * \`dailyBudget\`: 500-1000 INR
         * \`optimizationGoal\`: \`"OFFSITE_CONVERSIONS"\`
         * \`billingEvent\`: \`"IMPRESSIONS"\`
         * \`targeting\`: \`{ locations: ["India"], ageMin: 18, ageMax: 65, interests: [] }\`
         * \`accountId\`: target Meta Account ID
       - **Level 3 — Media & Creative Asset Level (SKILL.md Specification)**:
         * If Google Drive video URL is configured in the AI Context Warehouse / Product, call \`create_meta_video_ad\` (which streams and downloads the asset via OAuth and uploads to Meta Graph API).
         * If static image or product URL, proceed to Level 4 with \`create_meta_ad\`.
       - **Level 4 — Ad Creative Level**:
         Call \`create_meta_ad\` (or \`create_meta_video_ad\`):
         * \`adSetId\`: Returned ad set ID from Level 2
         * \`name\`: \`"\${Product Name} - Primary Direct Response Ad 1"\`
         * \`headline\`: Compelling high-converting headline derived from Product Name & Brief (e.g. \`"Flat 40% Off \${Product Name}"\` or \`"Premium \${Product Name} - Limited Stock"\`)
         * \`primaryText\`: Persuasive promotional body copy derived from the Marketing Brief USP and product benefits
         * \`linkUrl\`: Destination landing page URL from Product node (\`productUrl\`)
         * \`callToAction\`: \`"SHOP_NOW"\` (or \`"LEARN_MORE"\`, \`"SIGN_UP"\`)
         * \`status\`: \`"PAUSED"\` (safe draft mode)
         * \`accountId\`: target Meta Account ID
       - **Level 5 — Complete Hierarchy Verification**:
         Call \`verify_meta_campaign\` (\`campaignId\`, \`adSetId\`, \`adId\`, \`accountId\`) to confirm all resources are properly linked and active in Meta Ads and MongoDB.
       - **Output**: Return a comprehensive, clean, verified markdown summary detailing all created entities (Campaign ID, Ad Set ID, Ad ID, Headline, Primary Text, Destination URL, CTA, Budget, Target Account).
     * **Step 3: GOOGLE ADS Multi-Level Creation Hierarchy**:
       - Level 1: Call \`create_google_campaign_budget\` (dailyBudget, accountId) ➔ \`budgetResourceName\`
       - Level 2: Call \`create_google_campaign\` (name, channelType: "SEARCH", budgetResourceName, accountId) ➔ \`campaignResourceName\`, \`campaignId\`
       - Level 3: Call \`create_google_ad_group\` (campaignResourceName, name: "\${Product Name} Search Group", accountId) ➔ \`adGroupResourceName\`, \`adGroupId\`
       - Level 4: Call \`create_google_keywords\` (adGroupResourceName, keywords: high-intent keywords from product and brief, accountId)
       - Level 5: Call \`create_google_responsive_search_ad\` (adGroupResourceName, headlines: min 3 from product, descriptions: min 2 from brief, finalUrl: productUrl, accountId)
       - Level 6: Call \`set_google_campaign_locations\` (locations: ["India"], accountId)
       - Level 7: Call \`verify_google_campaign\` (campaignResourceName, campaignId, accountId)
       - **Output**: Return the verified Google Ads campaign checklist.
     * ❌ NEVER give excuses, vague answers, or ignore SKILL.md and AI Context. Execute the full campaign + ad set + ad chain immediately.

8. Available Workspace Skills & Workflows:
${skillsText}
   - When executing tasks related to an available skill (especially "meta-ads-campaign-creator"), follow its specific runbook and best practices. Use "get_skill_details" to fetch full guidelines if needed.`;
};

export class ClaudeAgentService {
  static async streamChat({
    res,
    onEvent,
    conversationId,
    userMessage,
    accountId,
    userId,
  }) {
    const startTime = Date.now();
    const emit = (event) => {
      if (typeof onEvent === "function") onEvent(event);
      if (!res) return;
      if (event.type === "text_delta") {
        AgentStreamHandler.sendChunk(res, event.content || "");
      }
      if (event.type === "tool_status") {
        AgentStreamHandler.sendToolStatus(res, event.toolName, event.status);
      }
    };
    const resumeSessionId = await getLastClaudeSessionId(conversationId);

    const adsServer = createAdsMcpServer({ userId, accountId });
    const toolCalls = [];
    const actionsPerformed = [];
    let streamedText = "";
    let claudeSessionId = resumeSessionId;
    let inTool = false;
    let rawUsage = null;

    const systemPromptText = await buildSystemPrompt({ accountId, userId });
    let rawModel = process.env.CLAUDE_AGENT_MODEL || "claude-3-5-sonnet-20241022";
    const modelName = (rawModel.includes("4-5") || rawModel.includes("sonnet-4"))
      ? "claude-3-5-sonnet-20241022"
      : rawModel;
    const rawApiKey = (process.env.ANTHROPIC_API_KEY || "").trim().replace(/^["']|["']$/g, "");
    const cleanApiKey = rawApiKey;

    if (!cleanApiKey || cleanApiKey.includes("your_anthropic") || cleanApiKey.length < 15) {
      console.warn("[ClaudeAgentService Backend Diagnostic]: ANTHROPIC_API_KEY is omitted, invalid, or placeholder. Bypassing SDK call to trigger clean fallback.");
      throw new Error("Claude SDK Authentication Bypassed: Missing or invalid ANTHROPIC_API_KEY");
    }

    const options = {
      systemPrompt: systemPromptText,
      model: modelName,
      tools: [],
      mcpServers: { ads: adsServer },
      allowedTools: ADS_ALLOWED_TOOLS,
      includePartialMessages: true,
      maxTurns: Number(process.env.CLAUDE_AGENT_MAX_TURNS || 8),
      cwd: process.cwd(),
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: cleanApiKey,
        ANTHROPIC_AUTH_TOKEN: cleanApiKey,
      },
    };

    const isAuthOrBillingError = (text) => {
      if (!text || typeof text !== "string") return false;
      const lower = text.toLowerCase();
      return (
        lower.includes("invalid api key") ||
        lower.includes("fix external api key") ||
        lower.includes("invalid_api_key") ||
        lower.includes("credit balance") ||
        lower.includes("credit is too low") ||
        lower.includes("balance is too low") ||
        lower.includes("invalid_request_error") ||
        lower.includes("failed to authenticate") ||
        lower.includes("plans & billing") ||
        lower.includes("returned an error result") ||
        lower.includes("unauthorized") ||
        (lower.includes("billing") && lower.includes("credit"))
      );
    };

    let pendingStreamBuffer = "";
    let isStreamFlushed = false;

    for await (const message of query({
      prompt: userMessage,
      options,
    })) {
      if (message.type === "system" && message.subtype === "init") {
        claudeSessionId = message.session_id || claudeSessionId;
      }

      if (message.usage) {
        rawUsage = message.usage;
      }

      if (message.type === "stream_event") {
        const event = message.event;

        if (event.type === "message_start" && event.message?.usage) {
          rawUsage = { ...rawUsage, ...event.message.usage };
        }

        if (event.type === "message_delta" && event.usage) {
          rawUsage = { ...rawUsage, ...event.usage };
        }

        if (event.type === "content_block_start") {
          if (event.content_block?.type === "tool_use") {
            inTool = true;
            const rawToolName = event.content_block.name || "";
            const cleanToolName = rawToolName.replace(/^mcp__(?:ads__)?/, "");
            const toolCallId = event.content_block.id;
            
            if (!actionsPerformed.some(a => a.action === cleanToolName)) {
              actionsPerformed.push({
                action: cleanToolName,
                description: `Called ${cleanToolName} via Claude Agent`,
                tokensBurned: 180,
                status: "SUCCESS",
              });
            }

            emit({
              type: "tool_status",
              toolName: cleanToolName,
              status: `Running ${cleanToolName}...`,
            });
          }
        }

        if (event.type === "content_block_delta") {
          if (event.delta?.type === "text_delta" && !inTool) {
            const chunk = event.delta.text || "";

            if (isAuthOrBillingError(chunk) || isAuthOrBillingError(streamedText + chunk)) {
              console.warn(`[ClaudeAgentService Backend Diagnostic]: Raw SDK stream emitted auth/billing error. Suppressing chunk from UI stream.`);
              pendingStreamBuffer = "";
              throw new Error(`Claude Agent SDK Authentication/Billing Error: ${chunk || streamedText}`);
            }

            streamedText += chunk;

            if (!isStreamFlushed) {
              pendingStreamBuffer += chunk;
              if (pendingStreamBuffer.length >= 60 || pendingStreamBuffer.includes("\n")) {
                if (!isAuthOrBillingError(pendingStreamBuffer)) {
                  isStreamFlushed = true;
                  emit({ type: "text_delta", content: pendingStreamBuffer });
                  pendingStreamBuffer = "";
                } else {
                  pendingStreamBuffer = "";
                  throw new Error(`Claude Agent SDK Auth Error in initial buffer.`);
                }
              }
            } else {
              emit({ type: "text_delta", content: chunk });
            }
          }
        }

        if (event.type === "content_block_stop" && inTool) {
          inTool = false;
        }
      }

      if (message.type === "assistant" && Array.isArray(message.message?.content)) {
        for (const block of message.message.content) {
          if (block.type === "tool_use") {
            const cleanName = (block.name || "").replace(/^mcp__(?:ads__)?/, "");
            const existingIdx = toolCalls.findIndex(t => t.id === block.id || (t.toolName === cleanName && !t.id));
            if (existingIdx >= 0) {
              toolCalls[existingIdx].toolArgs = block.input || toolCalls[existingIdx].toolArgs;
            } else {
              toolCalls.push({
                id: block.id,
                toolName: cleanName,
                toolArgs: block.input || {},
                status: "SUCCESS",
              });
            }

            if (!actionsPerformed.some(a => a.action === cleanName)) {
              actionsPerformed.push({
                action: cleanName,
                description: `Executed ${cleanName}`,
                tokensBurned: 220,
                status: "SUCCESS",
              });
            }
          }

          if (block.type === "text" && !streamedText) {
            const blockText = block.text || "";
            if (isAuthOrBillingError(blockText)) {
              throw new Error(`Claude Agent SDK Authentication Error: ${blockText}`);
            }
            streamedText += blockText;
            emit({ type: "text_delta", content: blockText });
          }
        }
      }

      if (message.type === "user" && Array.isArray(message.message?.content)) {
        for (const block of message.message.content) {
          if (block.type === "tool_result") {
            const toolUseId = block.tool_use_id;
            const targetCall = toolCalls.find(t => t.id === toolUseId);
            if (targetCall) {
              try {
                targetCall.toolResult = typeof block.content === "string" ? JSON.parse(block.content) : block.content;
              } catch (e) {
                targetCall.toolResult = block.content;
              }
              if (block.is_error) targetCall.status = "FAILED";
            }
          }
        }
      }

      if (message.type === "result" && message.subtype !== "success") {
        const details =
          (Array.isArray(message.errors) && message.errors.join(", ")) ||
          message.error ||
          "Claude agent returned an error result";
        console.warn("[Claude Agent stream warning]:", details);
        throw new Error(details);
      }
    }

    // Check if streamedText is an API error message
    if (
      streamedText &&
      (streamedText.toLowerCase().includes("credit balance") ||
       streamedText.toLowerCase().includes("credit is too low") ||
       streamedText.toLowerCase().includes("invalid_request_error"))
    ) {
      throw new Error(streamedText);
    }

    if (!isStreamFlushed && pendingStreamBuffer && !streamedText.toLowerCase().includes("credit")) {
      emit({ type: "text_delta", content: pendingStreamBuffer });
      pendingStreamBuffer = "";
    }

    const executionTimeMs = Date.now() - startTime;

    // Calculate token metrics
    let inputTokens = rawUsage?.input_tokens || Math.round((userMessage.length + 1400) / 3.8);
    let outputTokens = rawUsage?.output_tokens || Math.round((streamedText.length + (toolCalls.length * 200)) / 3.8);
    let totalTokens = rawUsage?.total_tokens || (inputTokens + outputTokens);
    let cacheCreation = rawUsage?.cache_creation_input_tokens || 0;
    let cacheRead = rawUsage?.cache_read_input_tokens || 0;

    // Pricing calculation (Claude Sonnet 3.5 / 4.5 standard rates)
    const costUsd = Number(((inputTokens * 0.000003) + (outputTokens * 0.000015) + (cacheRead * 0.0000003)).toFixed(6));
    const costInr = Number((costUsd * 87.0).toFixed(4));

    if (actionsPerformed.length === 0) {
      actionsPerformed.push({
        action: "marketing_strategy_synthesis",
        description: "Generated strategic performance marketing recommendations",
        tokensBurned: outputTokens,
        status: "SUCCESS",
      });
    }

    const tokenUsage = {
      inputTokens,
      outputTokens,
      totalTokens,
      cacheCreationInputTokens: cacheCreation,
      cacheReadInputTokens: cacheRead,
      model: modelName,
      costUsd,
      costInr,
      executionTimeMs,
      actionsPerformed,
    };

    return {
      content: streamedText.trim(),
      toolCalls,
      claudeSessionId,
      tokenUsage,
    };
  }
}
