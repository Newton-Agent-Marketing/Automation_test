/**
 * McpToolRegistry - Dynamic Tool Registry for Official Meta MCP Server
 *
 * Maintains dynamically discovered tools, descriptions, and input JSON schemas
 * partitioned strictly by user and Meta account.
 */

class McpToolRegistry {
  constructor() {
    // Key: `${userId}_${cleanAccountId}` -> { serverUrl, transport, tools: Map<toolName, toolDef>, discoveredAt, status }
    this.registries = new Map();
  }

  _getKey(userId, accountId) {
    const cleanAccountId = String(accountId || "").replace(/^act_/, "").trim();
    return `${String(userId || "")}_${cleanAccountId}`;
  }

  /**
   * Register or update discovered tools for an account
   * @param {string} userId
   * @param {string} accountId
   * @param {Object} details
   * @param {string} details.serverUrl
   * @param {string} [details.transport]
   * @param {Array<Object>} details.tools - Array of { name, description, inputSchema }
   * @param {string} [details.status]
   */
  registerTools(userId, accountId, { serverUrl, transport = "SSE", tools = [], status = "CONNECTED" }) {
    if (!userId || !accountId) {
      throw new Error("userId and accountId are required to register MCP tools");
    }

    const key = this._getKey(userId, accountId);
    const toolMap = new Map();

    const sanitizedTools = (tools || []).map((t) => {
      const toolDef = {
        name: String(t.name || "").trim(),
        description: String(t.description || ""),
        inputSchema: t.inputSchema || t.schema || { type: "object", properties: {} },
        discoveredAt: new Date(),
      };
      if (toolDef.name) {
        toolMap.set(toolDef.name, toolDef);
      }
      return toolDef;
    });

    this.registries.set(key, {
      userId: String(userId),
      accountId: String(accountId).replace(/^act_/, "").trim(),
      serverUrl: serverUrl || "",
      transport,
      tools: toolMap,
      toolList: sanitizedTools,
      discoveredAt: new Date(),
      status,
    });

    return sanitizedTools;
  }

  /**
   * Get all discovered tools for an account
   * @param {string} userId
   * @param {string} accountId
   * @returns {Array<Object>} Array of tool definitions
   */
  getTools(userId, accountId) {
    const key = this._getKey(userId, accountId);
    const entry = this.registries.get(key);
    if (!entry) return [];
    return entry.toolList || Array.from(entry.tools.values());
  }

  /**
   * Get a specific tool definition by name
   * @param {string} userId
   * @param {string} accountId
   * @param {string} toolName
   * @returns {Object|null}
   */
  getTool(userId, accountId, toolName) {
    const key = this._getKey(userId, accountId);
    const entry = this.registries.get(key);
    if (!entry || !entry.tools) return null;
    return entry.tools.get(toolName) || null;
  }

  /**
   * Check if a tool exists for an account
   * @param {string} userId
   * @param {string} accountId
   * @param {string} toolName
   * @returns {boolean}
   */
  hasTool(userId, accountId, toolName) {
    const key = this._getKey(userId, accountId);
    const entry = this.registries.get(key);
    return Boolean(entry && entry.tools && entry.tools.has(toolName));
  }

  /**
   * Check if any tools exist for an account
   * @param {string} userId
   * @param {string} accountId
   * @returns {boolean}
   */
  hasTools(userId, accountId) {
    return this.getTools(userId, accountId).length > 0;
  }

  /**
   * Find a tool matching a semantic operation or keyword (e.g. "insights", "campaigns", "ads", "budget")
   * @param {string} userId
   * @param {string} accountId
   * @param {string|Array<string>} keywords
   * @returns {Object|null}
   */
  findToolByKeyword(userId, accountId, keywords) {
    const tools = this.getTools(userId, accountId);
    if (!tools || tools.length === 0) return null;
    const rawKwList = Array.isArray(keywords) ? keywords : [keywords];
    const kwList = [];
    for (const k of rawKwList) {
      if (!k) continue;
      const clean = String(k).toLowerCase().trim();
      kwList.push(clean);
      const withoutMeta = clean.replace(/_?meta_?/, "_").replace(/^_+|_+$/g, "");
      if (withoutMeta && withoutMeta !== clean) {
        kwList.push(withoutMeta);
      }
    }
    for (const kw of kwList) {
      const match = tools.find(
        (t) =>
          t.name.toLowerCase() === kw ||
          t.name.toLowerCase().includes(kw) ||
          (t.description && t.description.toLowerCase().includes(kw))
      );
      if (match) return match;
    }
    return null;
  }

  /**
   * Get registry entry details (status, discoveredAt, serverUrl, tool count)
   */
  getRegistryDetails(userId, accountId) {
    const key = this._getKey(userId, accountId);
    const entry = this.registries.get(key);
    if (!entry) return null;
    return {
      userId: entry.userId,
      accountId: entry.accountId,
      serverUrl: entry.serverUrl,
      transport: entry.transport,
      discoveredAt: entry.discoveredAt,
      status: entry.status,
      toolCount: entry.tools.size,
      tools: entry.toolList,
    };
  }

  /**
   * Load discovered tools from a database MetaAccount record
   * @param {Object} metaAccount
   */
  loadFromAccount(metaAccount) {
    if (!metaAccount || !metaAccount.userId || !metaAccount.accountId) return;
    if (!metaAccount.discoveredTools || metaAccount.discoveredTools.length === 0) return;

    this.registerTools(metaAccount.userId, metaAccount.accountId, {
      serverUrl: metaAccount.mcpServerUrl,
      transport: metaAccount.mcpTransport || "SSE",
      tools: metaAccount.discoveredTools,
      status: metaAccount.mcpStatus || "CONNECTED",
    });
  }

  /**
   * Clear registry for an account
   */
  clear(userId, accountId) {
    const key = this._getKey(userId, accountId);
    this.registries.delete(key);
  }
}

export const mcpToolRegistry = new McpToolRegistry();
export default mcpToolRegistry;

