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

    // 1. Identify selected Meta account and verify account isolation
    let metaAccount = context.metaAccount;
    if (!metaAccount) {
      metaAccount = await MetaAccount.findOne({
        userId,
        accountId: { $in: [cleanAccountId, `act_${cleanAccountId}`] },
        isActive: true,
      });

      if (!metaAccount) {
        // Fallback to active account for user
        metaAccount = await MetaAccount.findOne({ userId, isActive: true });
      }
    }

    if (!metaAccount) {
      throw new Error(
        `McpToolExecutor: No active Meta account found for user ${userId} with account ID ${cleanAccountId || "(default)"}`
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
        transportType: metaAccount.mcpTransport || "SSE",
        command: metaAccount.mcpCommand,
        args: metaAccount.mcpArgs,
      });
    }

    if (!client) {
      throw new Error(
        `McpToolExecutor: Active MCP session could not be established for Meta account act_${cleanAccountId}.`
      );
    }

    // 3. Find requested tool in registry
    let toolDef = mcpToolRegistry.getTool(userId, metaAccount.accountId, toolName);

    // If not in memory registry, try loading from account model or fetching tools
    if (!toolDef && metaAccount.discoveredTools && metaAccount.discoveredTools.length > 0) {
      mcpToolRegistry.loadFromAccount(metaAccount);
      toolDef = mcpToolRegistry.getTool(userId, metaAccount.accountId, toolName);
    }

    // 4. Validate arguments against schema
    if (toolDef?.inputSchema) {
      this.validateArguments(toolDef.inputSchema, args);
    }

    // 5. Execute tool via MCP tools/call protocol
    console.log(
      `[McpToolExecutor] Calling tool "${toolName}" on MCP server for act_${cleanAccountId}`
    );

    let mcpResult;
    try {
      mcpResult = await client.callTool({
        name: toolName,
        arguments: args,
      });
    } catch (callError) {
      console.error(
        `[McpToolExecutor Error] MCP callTool failed for "${toolName}":`,
        callError.message
      );
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
