/**
 * McpToolSelector - Dynamic Tool Selection & Multi-Step Task Planner for Official Meta MCP Server
 *
 * Implements:
 * 1. Semantic intent matching against dynamically discovered tools in McpToolRegistry
 * 2. Parameter extraction and validation against discovered JSON schemas
 * 3. Multi-step task planning with context chaining
 * 4. Detection of missing required fields (prompts user instead of inventing dummy values)
 * 5. Strict rejection of arbitrary keywords or unverified tool execution
 */

import { mcpToolRegistry } from "./McpToolRegistry.js";
import { McpToolExecutor } from "./McpToolExecutor.js";
import MetaAccount from "../../models/metaAccount.js";

export class McpToolSelector {
  /**
   * Intent categories supported by Meta Ads MCP tools
   */
  static INTENT_CATEGORIES = {
    REPORTING: ["insights", "metrics", "performance", "spend", "roas", "ctr", "cpa", "cpc", "impressions", "clicks", "conversions", "cost", "report", "analytics", "stats", "data"],
    CAMPAIGN: ["campaign", "campaigns", "cbo", "budget", "objective", "pause", "resume", "status"],
    ADSET: ["adset", "ad set", "adset_id", "targeting", "audience", "optimization", "delivery", "placement"],
    AD: ["ad", "ads", "creative", "headline", "primary text", "video", "image", "rename", "update ad"],
    CATALOG: ["catalog", "catalogs", "product feed", "products", "inventory"],
    SIGNALS: ["pixel", "dataset", "datasets", "events", "conversions api", "capi"],
    EXPERIMENT: ["ab test", "split test", "conversion lift", "experiment", "study"],
    ACTIVITY: ["activity", "logs", "audit", "history", "changes"],
  };

  /**
   * Action verbs to identify operational goals
   */
  static ACTION_VERBS = {
    READ: ["get", "fetch", "show", "list", "view", "inspect", "check", "read", "find", "search", "retrieve", "pull"],
    CREATE: ["create", "launch", "build", "set up", "setup", "make", "draft", "add", "new"],
    UPDATE: ["update", "change", "modify", "edit", "rename", "adjust", "set", "replace", "switch"],
    PAUSE: ["pause", "stop", "deactivate", "disable", "turn off"],
    RESUME: ["resume", "activate", "enable", "start", "turn on", "unpause"],
    DELETE: ["delete", "remove", "archive"],
  };

  /**
   * Score how well a discovered tool matches a user instruction
   */
  static scoreTool(tool, instructionText, detectedIntents, detectedActions) {
    let score = 0;
    const nameLower = tool.name.toLowerCase();
    const descLower = (tool.description || "").toLowerCase();
    const instLower = instructionText.toLowerCase();

    // 1. Direct name match in instruction
    if (instLower.includes(nameLower) || nameLower.includes(instLower.replace(/\s+/g, "_"))) {
      score += 40;
    }

    // 2. Action verb match
    for (const [action, verbs] of Object.entries(this.ACTION_VERBS)) {
      const isActionDetected = detectedActions.includes(action);
      if (isActionDetected) {
        if (verbs.some((v) => nameLower.includes(v) || descLower.includes(v))) {
          score += 25;
        }
      }
    }

    // 3. Entity category match
    for (const [category, keywords] of Object.entries(this.INTENT_CATEGORIES)) {
      const isCategoryDetected = detectedIntents.includes(category);
      if (isCategoryDetected) {
        const matchesName = keywords.some((kw) => nameLower.includes(kw));
        const matchesDesc = keywords.some((kw) => descLower.includes(kw));
        if (matchesName) score += 30;
        if (matchesDesc) score += 15;
      }
    }

    // 4. Word-level token overlap
    const instWords = instLower.split(/\W+/).filter((w) => w.length > 2);
    for (const word of instWords) {
      if (nameLower.includes(word)) score += 5;
      if (descLower.includes(word)) score += 2;
    }

    return score;
  }

  /**
   * Detect intents and actions from user message
   */
  static analyzeMessage(message) {
    const text = String(message || "").toLowerCase();
    const detectedIntents = [];
    const detectedActions = [];

    for (const [category, keywords] of Object.entries(this.INTENT_CATEGORIES)) {
      if (keywords.some((kw) => text.includes(kw))) {
        detectedIntents.push(category);
      }
    }

    for (const [action, verbs] of Object.entries(this.ACTION_VERBS)) {
      if (verbs.some((v) => new RegExp(`\\b${v}\\b`, "i").test(text))) {
        detectedActions.push(action);
      }
    }

    // Default action to READ if querying performance or listing
    if (detectedActions.length === 0 && (text.includes("how") || text.includes("what") || text.includes("show") || detectedIntents.includes("REPORTING"))) {
      detectedActions.push("READ");
    }

    return { detectedIntents, detectedActions, text };
  }

  /**
   * Dynamically select tools and formulate an execution plan for a user request
   * @param {string} userInstruction
   * @param {Object} context
   * @param {string} context.userId
   * @param {string} context.accountId
   * @param {Object} [context.metaAccount]
   * @param {Object} [context.previousResults]
   */
  static async planExecution(userInstruction, context = {}) {
    const { userId, accountId } = context;
    if (!userId || !accountId) {
      throw new Error("McpToolSelector: userId and accountId are required for tool selection.");
    }

    const cleanAccountId = String(accountId).replace(/^act_/, "").trim();

    // 1. Load active tools discovered from official Meta MCP server
    let tools = mcpToolRegistry.getTools(userId, cleanAccountId);
    let metaAccount = context.metaAccount;

    if ((!tools || tools.length === 0) && !metaAccount) {
      metaAccount = await MetaAccount.findOne({
        userId,
        accountId: { $in: [cleanAccountId, `act_${cleanAccountId}`] },
        isActive: true,
      }).lean();
    }

    if ((!tools || tools.length === 0) && metaAccount?.discoveredTools?.length > 0) {
      mcpToolRegistry.loadFromAccount(metaAccount);
      tools = mcpToolRegistry.getTools(userId, cleanAccountId);
    }

    if (!tools || tools.length === 0) {
      return {
        success: false,
        canExecute: false,
        error: "NO_DISCOVERED_MCP_TOOLS",
        message: `No active tools discovered on the official Meta MCP server for account act_${cleanAccountId}. Please establish an official MCP connection in Channels.`,
        steps: [],
      };
    }

    // 2. Analyze user instruction
    const { detectedIntents, detectedActions, text } = this.analyzeMessage(userInstruction);

    // 3. Score and rank discovered tools
    const scoredTools = tools
      .map((tool) => ({
        tool,
        score: this.scoreTool(tool, text, detectedIntents, detectedActions),
      }))
      .filter((st) => st.score > 15)
      .sort((a, b) => b.score - a.score);

    if (scoredTools.length === 0) {
      return {
        success: false,
        canExecute: false,
        error: "NO_MATCHING_MCP_TOOL",
        message: `None of the ${tools.length} discovered official Meta MCP tools match the requested operation: "${userInstruction}".`,
        availableTools: tools.map((t) => t.name),
        steps: [],
      };
    }

    const primaryTool = scoredTools[0].tool;

    // 4. Extract arguments matching schema
    const { args, missingRequired } = this.extractArguments(
      primaryTool.inputSchema,
      userInstruction,
      cleanAccountId,
      context.previousResults
    );

    // 5. If required arguments are missing and cannot be inferred, ask the user
    if (missingRequired.length > 0) {
      return {
        success: false,
        canExecute: false,
        needsUserInput: true,
        selectedTool: primaryTool.name,
        missingFields: missingRequired,
        message: `To execute "${primaryTool.name}", please provide the following required parameters: ${missingRequired.join(", ")}.`,
        steps: [],
      };
    }

    // 6. Return verified execution plan
    return {
      success: true,
      canExecute: true,
      selectedTool: primaryTool.name,
      toolDefinition: primaryTool,
      confidenceScore: scoredTools[0].score,
      steps: [
        {
          toolName: primaryTool.name,
          description: primaryTool.description,
          arguments: args,
          inputSchema: primaryTool.inputSchema,
        },
      ],
    };
  }

  /**
   * Extract arguments for a tool schema from prompt and context
   */
  static extractArguments(schema, prompt, accountId, previousResults = null) {
    const args = {};
    const missingRequired = [];
    const text = String(prompt || "");

    const properties = schema?.properties || {};
    const required = Array.isArray(schema?.required) ? schema.required : [];

    // Always inject account ID if accepted
    if (properties.account_id || properties.ad_account_id) {
      const propKey = properties.account_id ? "account_id" : "ad_account_id";
      args[propKey] = `act_${accountId}`;
    }

    for (const [key, propDef] of Object.entries(properties)) {
      if (args[key] !== undefined) continue;

      const pType = propDef.type || "string";

      // 1. Check ID from previous step results if available
      if (key.endsWith("_id") || key === "id") {
        if (previousResults && previousResults[key]) {
          args[key] = previousResults[key];
          continue;
        }
        if (previousResults && previousResults.id) {
          args[key] = previousResults.id;
          continue;
        }

        // Try extracting numeric ID (10-25 digits) from prompt
        const idMatch = text.match(/\b\d{10,25}\b/);
        if (idMatch) {
          args[key] = idMatch[0];
          continue;
        }
      }

      // 2. Status
      if (key === "status" && propDef.enum) {
        if (/\b(pause|paused)\b/i.test(text)) args[key] = "PAUSED";
        else if (/\b(active|activate|resume|live)\b/i.test(text)) args[key] = "ACTIVE";
        else if (/\b(archived|archive|delete)\b/i.test(text)) args[key] = "ARCHIVED";
        else if (propDef.default) args[key] = propDef.default;
        continue;
      }

      // 3. Name parameter
      if (key === "name" || key === "campaign_name" || key === "ad_name") {
        const nameMatch = text.match(/(?:named?|called?|title|name\s*is|name\s*:)\s*["']?([^,\n\r"]+?)(?=\s+with\b|\s+having\b|\s+budget\b|[,\n\r"]|$)/i);
        if (nameMatch) {
          args[key] = nameMatch[1].trim();
          continue;
        }
      }

      // 4. Budget parameter
      if (key.includes("budget") && pType === "number") {
        const budgetMatch = text.match(/(?:budget|daily\s*budget|spend\s*limit)\s*(?:is|of|:)?\s*(?:₹|\$|inr|usd)?\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
        if (budgetMatch) {
          args[key] = Number(budgetMatch[1].replace(/,/g, ""));
          continue;
        }
      }

      // 5. Objective parameter
      if (key === "objective") {
        if (/\b(leads?|lead\s*generation)\b/i.test(text)) args[key] = "OUTCOME_LEADS";
        else if (/\b(sales?|purchase|conversion|e-?commerce)\b/i.test(text)) args[key] = "OUTCOME_SALES";
        else if (/\b(traffic|clicks?|visits?)\b/i.test(text)) args[key] = "OUTCOME_TRAFFIC";
        else if (/\b(awareness|reach|brand)\b/i.test(text)) args[key] = "OUTCOME_AWARENESS";
        else if (/\b(engagement|messages?)\b/i.test(text)) args[key] = "OUTCOME_ENGAGEMENT";
        else if (/\b(app\s*promotion|app\s*installs?)\b/i.test(text)) args[key] = "OUTCOME_APP_PROMOTION";
        continue;
      }

      // 6. Date Preset
      if (key === "date_preset" || key === "datePreset") {
        if (/\b(today)\b/i.test(text)) args[key] = "today";
        else if (/\b(yesterday)\b/i.test(text)) args[key] = "yesterday";
        else if (/\b(last\s*30\s*days?|30d)\b/i.test(text)) args[key] = "last_30d";
        else if (/\b(maximum|all\s*time|lifetime)\b/i.test(text)) args[key] = "maximum";
        else args[key] = "last_7d"; // standard marketing reporting window
        continue;
      }
    }

    // Check required fields
    for (const reqKey of required) {
      if (args[reqKey] === undefined || args[reqKey] === null || args[reqKey] === "") {
        missingRequired.push(reqKey);
      }
    }

    return { args, missingRequired };
  }

  /**
   * Execute an official MCP plan end-to-end
   */
  static async executePlan(plan, context = {}) {
    if (!plan || !plan.canExecute || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      throw new Error(plan?.message || "Invalid or empty execution plan.");
    }

    const results = [];
    let previousStepResult = null;

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const prevId = previousStepResult?.id || previousStepResult?.campaign_id || previousStepResult?.adset_id || previousStepResult?.ad_id;
      const stepArgs = {
        ...step.arguments,
        ...(prevId && !step.arguments.campaign_id ? { campaign_id: prevId } : {}),
        ...(prevId && !step.arguments.id ? { id: prevId } : {}),
      };

      console.log(`[McpToolSelector] Executing step ${i + 1}/${plan.steps.length}: "${step.toolName}"`);

      const executionResult = await McpToolExecutor.executeTool(
        step.toolName,
        stepArgs,
        context
      );

      results.push({
        step: i + 1,
        toolName: step.toolName,
        result: executionResult,
      });

      previousStepResult = executionResult.data || executionResult.result || executionResult;
    }

    return {
      success: true,
      executedSteps: results.length,
      finalResult: results[results.length - 1]?.result?.data || results[results.length - 1]?.result,
      allResults: results,
    };
  }
}

export default McpToolSelector;
