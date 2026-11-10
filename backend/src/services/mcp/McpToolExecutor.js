/**
 * McpToolExecutor - Dynamic Meta Tool Execution Layer
 *
 * Executes operations against the genuine Meta MCP Server via the MCP protocol.
 * Enforces strict user isolation, JSON schema validation, and tool verification.
 */

import mcpToolRegistry from "./McpToolRegistry.js";
import MetaAccount from "../../models/metaAccount.js";

export class McpToolExecutor {
  /**
   * Validate tool arguments against the discovered tool JSON schema
   * @param {Object} schema - JSON schema from tool definition
   * @param {Object} args - Arguments passed by caller
   */
  static validateArguments(schema, args = {}) {
    if (!schema || typeof schema !== "object") return;

    // Check required fields
    if (Array.isArray(schema.required)) {
      const missing = schema.required.filter((field) => {
        const val = args[field];
        return val === undefined || val === null || val === "";
      });

      if (missing.length > 0) {
        throw new Error(
          `MCP Tool argument validation failed: Missing required field(s): ${missing.join(", ")}`
        );
      }
    }

    // Type checking for declared properties
    if (schema.properties && typeof schema.properties === "object") {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (args[key] === undefined || args[key] === null) continue;

        const val = args[key];
        const expectedType = prop.type;

        if (expectedType === "string" && typeof val !== "string") {
          throw new Error(
            `Invalid argument type for "${key}": expected string, received ${typeof val}`
          );
        }
        if (expectedType === "number" && typeof val !== "number" && isNaN(Number(val))) {
          throw new Error(
            `Invalid argument type for "${key}": expected number, received ${typeof val}`
          );
        }
        if (expectedType === "boolean" && typeof val !== "boolean") {
          throw new Error(
            `Invalid argument type for "${key}": expected boolean, received ${typeof val}`
          );
        }
        if (expectedType === "array" && !Array.isArray(val)) {
          throw new Error(
            `Invalid argument type for "${key}": expected array, received ${typeof val}`
          );
        }
        if (
          expectedType === "object" &&
          (typeof val !== "object" || Array.isArray(val) || val === null)
        ) {
          throw new Error(
            `Invalid argument type for "${key}": expected object, received ${typeof val}`
          );
        }
      }
    }
  }

  /**
   * Parse content from MCP tool response into structured data
   * @param {Object} mcpResult - Result returned by client.callTool()
   */
  static parseMcpResponse(mcpResult) {
    if (!mcpResult) return null;

    let textContent = "";
    const parsedData = [];

    if (Array.isArray(mcpResult.content)) {
      for (const item of mcpResult.content) {
        if (item.type === "text" && item.text) {
          textContent += (textContent ? "\n" : "") + item.text;
          try {
            parsedData.push(JSON.parse(item.text));
          } catch (_) {
            // Text is not JSON; keep as text
          }
        } else if (item.type === "resource") {
          parsedData.push(item.resource);
        }
      }
    }

    let finalData = parsedData.length === 1 ? parsedData[0] : parsedData.length > 1 ? parsedData : null;

    if (!finalData && textContent) {
      try {
        finalData = JSON.parse(textContent);
      } catch (_) {
        finalData = { text: textContent };
      }
    }

    return {
      text: textContent,
      data: finalData || mcpResult,
      isError: Boolean(mcpResult.isError),
    };
  }

  /**
   * Execute a tool on the official Meta MCP Server
   * @param {string} toolName
   * @param {Object} args
   * @param {Object} context
   * @param {string} context.userId
   * @param {string} context.accountId
   * @param {Object} [context.metaAccount]
   * @param {Object} [context.mcpClient] - Optional injected client
   */
  static async executeTool(toolName, args = {}, context = {}) {
    const { userId, accountId } = context;

    if (!userId) {
      throw new Error("McpToolExecutor: userId is required for tool execution");
    }

    const cleanAccountId = String(accountId || "").replace(/^act_/, "").trim();
    if (!cleanAccountId) {
      throw new Error(
        "McpToolExecutor: accountId is required for Meta MCP tool execution to prevent cross-account operations."
      );
    }

    // 1. Identify selected Meta account and verify account isolation
    // STRICT RULE: Never fall back to another account if the requested account is missing or invalid
    let metaAccount = context.metaAccount;
    if (!metaAccount) {
      try {
        metaAccount = await MetaAccount.findOne({
          userId,
          accountId: { $in: [cleanAccountId, `act_${cleanAccountId}`] },
          isActive: true,
        });
      } catch (findErr) {
        if (findErr.name === "CastError") {
          metaAccount = null;
        } else {
          throw findErr;
        }
      }
    }

    if (!metaAccount) {
      throw new Error(
        `McpToolExecutor: Meta account act_${cleanAccountId} was not found or is not active for user ${userId}. Fallback to other accounts is strictly prohibited.`
      );
    }

    // Verify ownership
    if (String(metaAccount.userId) !== String(userId)) {
      throw new Error(
        "McpToolExecutor Security Alert: Cross-user tool execution is strictly prohibited."
      );
    }

    // 2. Retrieve active MCP client connection
    const { MetaMcpClient } = await import("./metaMcpClient.js");
    let client = context.mcpClient;

    if (!client) {
      client = await MetaMcpClient.getOrConnectClient(userId, metaAccount.accountId, {
        mcpServerUrl: metaAccount.mcpServerUrl,
        accessToken: metaAccount.accessToken,
        transportType: metaAccount.mcpTransport || process.env.META_MCP_TRANSPORT || "STREAMABLE_HTTP",
        command: metaAccount.mcpCommand,
        args: metaAccount.mcpArgs,
      });
    }

    if (!client) {
      throw new Error(
        `McpToolExecutor: Active MCP session could not be established for Meta account act_${cleanAccountId}.`
      );
    }

    // 3. Find requested tool in registry for the selected account
    let toolDef = mcpToolRegistry.getTool(userId, metaAccount.accountId, toolName);

    // If not in memory registry, try loading from account model
    if (!toolDef && metaAccount.discoveredTools && metaAccount.discoveredTools.length > 0) {
      mcpToolRegistry.loadFromAccount(metaAccount);
      toolDef = mcpToolRegistry.getTool(userId, metaAccount.accountId, toolName);
    }

    // If not found by exact name, try finding by matching keyword in discovered tools
    if (!toolDef) {
      const keywordMatch = mcpToolRegistry.findToolByKeyword(userId, metaAccount.accountId, toolName);
      if (keywordMatch) {
        toolDef = keywordMatch;
        console.log(`[McpToolExecutor] Resolved requested action "${toolName}" to discovered tool "${toolDef.name}"`);
      }
    }

    // STRICT RULE: Only permit tools discovered and registered for this specific user & account
    if (!toolDef) {
      throw new Error(
        `McpToolExecutor: Tool "${toolName}" is not registered or available on the connected Meta MCP server for account act_${cleanAccountId}.`
      );
    }

    const targetMcpToolName = toolDef.name;

    // 4. Normalize common argument aliases (adId -> ad_id / id, adName -> name)
    const normalizedArgs = {
      ...args,
      ...(cleanAccountId && !args.account_id && !args.ad_account_id ? { account_id: `act_${cleanAccountId}` } : {}),
    };
    if (normalizedArgs.adId) {
      if (!normalizedArgs.ad_id) normalizedArgs.ad_id = normalizedArgs.adId;
      if (!normalizedArgs.id) normalizedArgs.id = normalizedArgs.adId;
    }
    if (normalizedArgs.adSetId) {
      if (!normalizedArgs.adset_id) normalizedArgs.adset_id = normalizedArgs.adSetId;
      if (!normalizedArgs.id && (targetMcpToolName.includes("adset") || targetMcpToolName.includes("ad_set"))) {
        normalizedArgs.id = normalizedArgs.adSetId;
      }
    }
    if (normalizedArgs.campaignId) {
      if (!normalizedArgs.campaign_id) normalizedArgs.campaign_id = normalizedArgs.campaignId;
      if (!normalizedArgs.id && targetMcpToolName.includes("campaign")) {
        normalizedArgs.id = normalizedArgs.campaignId;
      }
    }
    if (normalizedArgs.adName && !normalizedArgs.name) {
      normalizedArgs.name = normalizedArgs.adName;
    }

    // 5. Validate arguments against schema
    if (toolDef.inputSchema) {
      this.validateArguments(toolDef.inputSchema, normalizedArgs);
    }

    // 6. Execute tool via MCP tools/call protocol
    console.log(
      `[McpToolExecutor] Calling tool "${targetMcpToolName}" on MCP server for act_${cleanAccountId}`
    );

    const toolCallArguments = normalizedArgs;

    let mcpResult;
    try {
      mcpResult = await client.callTool({
        name: targetMcpToolName,
        arguments: toolCallArguments,
      });
    } catch (callError) {
      console.error(
        `[McpToolExecutor Error] MCP callTool failed for "${toolName}":`,
        callError.message
      );
      if (
        callError.message?.includes("expired") ||
        callError.message?.includes("OAuthException") ||
        callError.message?.includes("401") ||
        callError.message?.includes("Unauthorized")
      ) {
        throw new Error(
          `Meta MCP Authentication Error (${toolName}): Meta session or access token has expired or is unauthorized. Please reconnect your Meta account.`
        );
      }
      throw new Error(`MCP Tool Execution Error (${toolName}): ${callError.message}`);
    }

    // 6. Capture actual response
    const parsed = this.parseMcpResponse(mcpResult);

    if (parsed.isError) {
      const errorMsg =
        parsed.text ||
        parsed.data?.message ||
        `MCP Server reported error executing tool "${toolName}"`;
      throw new Error(`Meta MCP Tool Error [${toolName}]: ${errorMsg}`);
    }

    // 7. Return structured execution results
    return {
      success: true,
      toolName,
      accountId: `act_${cleanAccountId}`,
      result: parsed.data,
      content: parsed.text,
      raw: mcpResult,
    };
  }
}

export default McpToolExecutor;

