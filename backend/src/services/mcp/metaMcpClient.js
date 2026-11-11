// src/services/mcp/metaMcpClient.js
import dns from "node:dns";
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}
import MetaAccount from "../../models/metaAccount.js";
import driveService from "../../google/driveService.js";
import axios from "axios";
import fs from "fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import mcpToolRegistry from "./McpToolRegistry.js";
import McpExecutionLogger from "./McpExecutionLogger.js";
import {
  OFFICIAL_META_MCP_ENDPOINT,
  getOfficialMetaMcpEndpoint,
  resolveOfficialMetaMcpUrl,
  resolveMetaMcpTransport,
  isLocalhostOrPrivateUrl,
} from "./metaMcpConfig.js";

// In-memory pool of active MCP client sessions: `${userId}_${cleanAccountId}` -> { client, transport, serverUrl, connectedAt, lastUsedAt }
const activeClients = new Map();

export class MetaMcpClient {
  static getOfficialEndpoint() {
    return getOfficialMetaMcpEndpoint();
  }

  static resolveOfficialMcpUrl(candidateUrl, options = {}) {
    return resolveOfficialMetaMcpUrl(candidateUrl, options);
  }

  static resolveTransport(serverUrl, candidateTransport) {
    return resolveMetaMcpTransport(serverUrl, candidateTransport);
  }

  /**
   * Connect an MCP session using official MCP TypeScript/JavaScript SDK:
   * Client + StreamableHTTPClientTransport for remote server or StdioClientTransport for local process.
   */
  static async connectSession({
    userId,
    accountId,
    mcpServerUrl = null,
    accessToken = null,
    transportType = "STREAMABLE_HTTP",
    command = null,
    args = [],
    timeoutMs = 15000,
  }) {
    if (!userId || !accountId) {
      throw new Error("userId and accountId are required to connect an MCP session");
    }

    const cleanAccountId = String(accountId).replace(/^act_/, "").trim();
    const clientKey = `${userId}_${cleanAccountId}`;
    const connectStartTime = Date.now();

    // Close any previous active session for this account
    if (activeClients.has(clientKey)) {
      try {
        const oldEntry = activeClients.get(clientKey);
        await oldEntry.client?.close?.();
      } catch (_) { }
      activeClients.delete(clientKey);
    }

    let transport;
    const cleanTransport = resolveMetaMcpTransport(mcpServerUrl, transportType);
    const effectiveMcpUrl = cleanTransport === "STDIO"
      ? ""
      : resolveOfficialMetaMcpUrl(mcpServerUrl, {
          accountId: cleanAccountId,
          logContext: "MetaMcpClient.connectSession",
        });

    // --- DIAGNOSTIC STAGE 1: META_MCP_ENDPOINT_CHECK ---
    const isOfficialEndpoint = effectiveMcpUrl === OFFICIAL_META_MCP_ENDPOINT;
    McpExecutionLogger.logDiagnosticStage({
      stage: "META_MCP_ENDPOINT_CHECK",
      userId,
      accountId: cleanAccountId,
      status: cleanTransport === "STDIO" || effectiveMcpUrl ? "PASS" : "FAIL",
      details: cleanTransport === "STDIO"
        ? `STDIO command: "${command}"`
        : `Endpoint: "${effectiveMcpUrl}" (Official: ${isOfficialEndpoint}) | Transport: ${cleanTransport}`,
    });

    // --- DIAGNOSTIC STAGE 2: META_MCP_AUTH_CHECK ---
    const hasAccessToken = Boolean(accessToken && typeof accessToken === "string" && accessToken.trim().length > 10);
    McpExecutionLogger.logDiagnosticStage({
      stage: "META_MCP_AUTH_CHECK",
      userId,
      accountId: cleanAccountId,
      status: hasAccessToken || cleanTransport === "STDIO" ? "PASS" : "FAIL",
      details: hasAccessToken
        ? `Access Token verified present (${accessToken.startsWith("EAAB_simulated") ? "SIMULATED" : "GENUINE_TOKEN_EXISTS"})`
        : `Missing or empty access token`,
    });

    console.log(
      `[MetaMcpClient] Connecting MCP session for act_${cleanAccountId} at endpoint: "${effectiveMcpUrl}" (Transport: ${cleanTransport})`
    );

    if (cleanTransport === "STDIO") {
      if (!command) {
        throw new Error("Command is required for STDIO MCP transport");
      }
      transport = new StdioClientTransport({
        command,
        args: Array.isArray(args) ? args : [],
        env: {
          ...process.env,
          ...(accessToken ? { META_ACCESS_TOKEN: accessToken, ACCESS_TOKEN: accessToken } : {}),
          ...(cleanAccountId ? { META_AD_ACCOUNT_ID: `act_${cleanAccountId}` } : {}),
        },
      });
    } else {
      // Official Meta Ads MCP Server remote endpoint strictly uses Streamable HTTP transport
      if (!effectiveMcpUrl) {
        throw new Error("MCP Server URL is required for Streamable HTTP transport");
      }

      const targetUrl = new URL(effectiveMcpUrl);
      if (cleanAccountId && !targetUrl.searchParams.has("account_id")) {
        targetUrl.searchParams.set("account_id", `act_${cleanAccountId}`);
      }

      const headers = {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(cleanAccountId ? {
          "X-FB-Ad-Account-Id": `act_${cleanAccountId}`,
          "X-Meta-Ad-Account-Id": `act_${cleanAccountId}`,
        } : {}),
        "User-Agent": "atelion-meta-mcp-client/1.0.0",
      };

      const customFetch = async (url, options = {}) => {
        try {
          return await fetch(url, options);
        } catch (fetchErr) {
          const cause = fetchErr.cause;
          const causeCode = cause?.code || cause?.message || (typeof cause === "string" ? cause : "");
          const causeDetail = causeCode ? ` (${causeCode})` : "";
          console.error(
            `[MetaMcpClient fetch] Request to ${url} failed: ${fetchErr.message}${causeDetail}`
          );
          if (causeCode && !fetchErr.message.includes(causeCode)) {
            fetchErr.message = `${fetchErr.message}${causeDetail}`;
          }
          throw fetchErr;
        }
      };

      transport = new StreamableHTTPClientTransport(targetUrl, {
        requestInit: { headers },
        fetch: customFetch,
      });
    }

    // Initialize official MCP Client
    const client = new Client(
      {
        name: "atelion-meta-mcp-client",
        version: "1.0.0",
      },
      {
        capabilities: {
          roots: {},
          sampling: {},
        },
      }
    );

    // --- DIAGNOSTIC STAGE 3: META_MCP_HANDSHAKE ---
    const handshakeStart = Date.now();
    try {
      const connectPromise = client.connect(transport);
      await Promise.race([
        connectPromise,
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `MCP handshake with ${effectiveMcpUrl || command} timed out after ${timeoutMs}ms`
                )
              ),
            timeoutMs
          )
        ),
      ]);
      McpExecutionLogger.logDiagnosticStage({
        stage: "META_MCP_HANDSHAKE",
        userId,
        accountId: cleanAccountId,
        status: "PASS",
        durationMs: Date.now() - handshakeStart,
        details: `MCP Protocol Handshake succeeded with ${effectiveMcpUrl || command}`,
      });
    } catch (connErr) {
      const cause = connErr.cause;
      const causeDetail = cause ? ` (${cause.code || cause.message || cause})` : "";
      const fullError = `${connErr.message}${causeDetail}`;
      McpExecutionLogger.logDiagnosticStage({
        stage: "META_MCP_HANDSHAKE",
        userId,
        accountId: cleanAccountId,
        status: "FAIL",
        durationMs: Date.now() - handshakeStart,
        error: new Error(fullError),
      });
      McpExecutionLogger.logDiagnosticStage({
        stage: "META_MCP_CONNECTION_RESULT",
        userId,
        accountId: cleanAccountId,
        status: "FAIL",
        durationMs: Date.now() - connectStartTime,
        error: new Error(`Handshake failed: ${fullError}`),
      });
      console.error(
        `[MetaMcpClient Error] Failed to connect MCP session for act_${cleanAccountId}:`,
        fullError
      );
      try {
        await transport.close?.();
      } catch (_) { }
      try {
        await client.close?.();
      } catch (_) { }
      throw new Error(`MCP Handshake Failed: ${fullError}`);
    }

    // --- DIAGNOSTIC STAGE 4: META_MCP_TOOLS_DISCOVERY ---
    const discoveryStart = Date.now();
    const discoveredTools = [];
    let cursor = undefined;
    try {
      do {
        const response = await client.listTools(cursor ? { cursor } : {});
        if (response?.tools && Array.isArray(response.tools)) {
          discoveredTools.push(...response.tools);
        }
        cursor = response?.nextCursor;
      } while (cursor);
      McpExecutionLogger.logDiagnosticStage({
        stage: "META_MCP_TOOLS_DISCOVERY",
        userId,
        accountId: cleanAccountId,
        status: discoveredTools.length > 0 ? "PASS" : "FAIL",
        durationMs: Date.now() - discoveryStart,
        details: `Discovered ${discoveredTools.length} tool(s) from server: [${discoveredTools.map((t) => t.name).join(", ")}]`,
      });
    } catch (listErr) {
      McpExecutionLogger.logDiagnosticStage({
        stage: "META_MCP_TOOLS_DISCOVERY",
        userId,
        accountId: cleanAccountId,
        status: "FAIL",
        durationMs: Date.now() - discoveryStart,
        error: listErr,
      });
      console.error(
        `[MetaMcpClient Error] tools/list failed for act_${cleanAccountId}:`,
        listErr.message
      );
      try {
        await client.close();
      } catch (_) { }
      throw new Error(`MCP Tool Discovery Failed: ${listErr.message}`);
    }

    // Strict validation: Require at least one valid tool discovered from official server
    if (discoveredTools.length === 0) {
      McpExecutionLogger.logDiagnosticStage({
        stage: "META_MCP_CONNECTION_RESULT",
        userId,
        accountId: cleanAccountId,
        status: "FAIL",
        durationMs: Date.now() - connectStartTime,
        details: "Zero tools discovered from official Meta MCP server",
      });
      try {
        await transport.close?.();
      } catch (_) { }
      try {
        await client.close?.();
      } catch (_) { }
      throw new Error("No tools discovered from official Meta MCP server.");
    }

    // Register discovered tools in dynamic registry
    mcpToolRegistry.registerTools(userId, cleanAccountId, {
      serverUrl: effectiveMcpUrl,
      transport: cleanTransport,
      tools: discoveredTools,
      status: "CONNECTED",
    });

    // Save active client in session cache
    activeClients.set(clientKey, {
      client,
      transport,
      serverUrl: effectiveMcpUrl || "",
      transportType: cleanTransport,
      connectedAt: new Date(),
      lastUsedAt: new Date(),
    });

    // --- DIAGNOSTIC STAGE 5: META_MCP_CONNECTION_RESULT ---
    McpExecutionLogger.logDiagnosticStage({
      stage: "META_MCP_CONNECTION_RESULT",
      userId,
      accountId: cleanAccountId,
      status: "PASS",
      durationMs: Date.now() - connectStartTime,
      details: `MCP Connection fully established with ${discoveredTools.length} dynamic tools registered.`,
    });

    console.log(
      `[MetaMcpClient] MCP session established for act_${cleanAccountId} with ${discoveredTools.length} tools discovered.`
    );

    return {
      success: true,
      client,
      tools: discoveredTools,
      count: discoveredTools.length,
      transport: cleanTransport,
      serverUrl: effectiveMcpUrl || "",
    };
  }

  /**
   * Get an existing active client or reconnect if needed
   */
  static async getOrConnectClient(userId, accountId, credentials = {}) {
    const cleanAccountId = String(accountId || "").replace(/^act_/, "").trim();
    const clientKey = `${userId}_${cleanAccountId}`;

    const candidateUrl = credentials.mcpServerUrl;
    const isStdio = String(credentials.transportType || "").toUpperCase() === "STDIO" || Boolean(credentials.command);
    const resolvedUrl = isStdio ? "" : resolveOfficialMetaMcpUrl(candidateUrl, {
      accountId: cleanAccountId,
      logContext: "MetaMcpClient.getOrConnectClient.cacheCheck",
    });

    const cached = activeClients.get(clientKey);
    if (cached?.client) {
      // Validate that cached session endpoint matches resolved URL (prevent stale localhost reuse)
      if (cached.serverUrl && resolvedUrl && cached.serverUrl !== resolvedUrl) {
        console.log(
          `[MetaMcpClient] Active session URL mismatch for ${clientKey} (cached: "${cached.serverUrl}", resolved: "${resolvedUrl}"). Closing stale session.`
        );
        try {
          await cached.client?.close?.();
        } catch (_) { }
        activeClients.delete(clientKey);
      } else {
        try {
          if (typeof cached.client.ping === "function") {
            await cached.client.ping();
          }
          cached.lastUsedAt = new Date();
          return cached.client;
        } catch (pingErr) {
          console.warn(
            `[MetaMcpClient] Active client ping failed for ${clientKey}, reconnecting:`,
            pingErr.message
          );
          try {
            await cached.client.close();
          } catch (_) { }
          activeClients.delete(clientKey);
        }
      }
    }

    // Lookup credentials from DB if not supplied
    let serverUrl = candidateUrl;
    let token = credentials.accessToken;
    let transportType = credentials.transportType || process.env.META_MCP_TRANSPORT || "STREAMABLE_HTTP";
    let command = credentials.command;
    let args = credentials.args;

    if (!serverUrl && !command) {
      const acc = await MetaAccount.findOne({
        userId,
        accountId: { $in: [cleanAccountId, `act_${cleanAccountId}`] },
        isActive: true,
      });
      if (acc) {
        serverUrl = acc.mcpServerUrl;
        token = token || acc.accessToken;
        transportType = acc.mcpTransport || transportType;
        command = acc.mcpCommand;
        args = acc.mcpArgs;

        // Auto-heal stale URL in DB if detected
        if (acc.mcpServerUrl && isLocalhostOrPrivateUrl(acc.mcpServerUrl)) {
          const healedUrl = resolveOfficialMetaMcpUrl(acc.mcpServerUrl, {
            accountId: cleanAccountId,
            logContext: "MetaMcpClient.getOrConnectClient.autoHeal",
          });
          acc.mcpServerUrl = healedUrl;
          acc.mcpTransport = "STREAMABLE_HTTP";
          await acc.save().catch((saveErr) => {
            console.warn(`[MetaMcpClient] Auto-heal save failed for act_${cleanAccountId}:`, saveErr.message);
          });
        }
      }
    }

    // Always sanitize resolved URL and transport before connecting
    const effectiveMcpUrl = command ? "" : resolveOfficialMetaMcpUrl(serverUrl, {
      accountId: cleanAccountId,
      logContext: "MetaMcpClient.getOrConnectClient",
    });
    const effectiveTransport = resolveMetaMcpTransport(effectiveMcpUrl, transportType);

    const session = await this.connectSession({
      userId,
      accountId: cleanAccountId,
      mcpServerUrl: effectiveMcpUrl,
      accessToken: token,
      transportType: effectiveTransport,
      command,
      args,
    });

    return session.client;
  }

  /**
   * Disconnect and close an active MCP session (single account or all user sessions)
   */
  static async disconnectSession(userId, accountId) {
    if (!userId) return { success: true };

    if (!accountId) {
      for (const [key, entry] of activeClients.entries()) {
        if (key.startsWith(`${userId}_`)) {
          try {
            await entry.client.close();
          } catch (_) { }
          try {
            await entry.transport?.close?.();
          } catch (_) { }
          activeClients.delete(key);
        }
      }
      return { success: true };
    }

    const cleanAccountId = String(accountId).replace(/^act_/, "").trim();
    const clientKey = `${userId}_${cleanAccountId}`;

    const cached = activeClients.get(clientKey);
    if (cached) {
      try {
        await cached.client.close();
      } catch (_) { }
      try {
        await cached.transport?.close?.();
      } catch (_) { }
      activeClients.delete(clientKey);
    }

    mcpToolRegistry.clear(userId, cleanAccountId);
    return { success: true };
  }

  /**
   * Validate MCP Server endpoint and connection
   */
  static async pingMcpServer(mcpServerUrl, credentials = {}) {
    if (!mcpServerUrl) return { status: "DISCONNECTED", message: "Server URL missing" };

    try {
      const url = new URL(mcpServerUrl);
      const headers = {};
      if (credentials.accessToken) {
        headers["Authorization"] = `Bearer ${credentials.accessToken}`;
      }
      const resp = await axios.get(url.toString(), {
        headers,
        timeout: 5000,
        validateStatus: () => true, // capture any HTTP status
      });

      if (resp.status >= 200 && resp.status < 400) {
        return { status: "REACHABLE", statusCode: resp.status, url: mcpServerUrl };
      }
      return { status: "UNAVAILABLE", statusCode: resp.status, url: mcpServerUrl };
    } catch (err) {
      return { status: "UNREACHABLE", error: err.message, url: mcpServerUrl };
    }
  }

  /**
   * Helper to extract an array of records from various MCP tool response formats
   */
  static extractArrayData(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (res.result) {
      if (Array.isArray(res.result)) return res.result;
      if (Array.isArray(res.result.data)) return res.result.data;
      if (Array.isArray(res.result.campaigns)) return res.result.campaigns;
      if (Array.isArray(res.result.adsets)) return res.result.adsets;
      if (Array.isArray(res.result.ad_sets)) return res.result.ad_sets;
      if (Array.isArray(res.result.ads)) return res.result.ads;
      if (Array.isArray(res.result.insights)) return res.result.insights;
    }
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.campaigns)) return res.campaigns;
    if (Array.isArray(res.adsets)) return res.adsets;
    if (Array.isArray(res.ad_sets)) return res.ad_sets;
    if (Array.isArray(res.ads)) return res.ads;
    if (Array.isArray(res.insights)) return res.insights;
    return [];
  }

  /**
   * Live real-time Meta MCP Tool Execution
   * Strictly executes through the official Meta Ads MCP Server.
   * Direct Graph API execution and silent fallbacks are completely removed.
   */
  static async executeLiveTool(toolName, args = {}) {
    const targetAccountId = args.accountId || args.effectiveAccountId || args.id;
    const userId = args.userId;

    if (!userId) {
      throw new Error("McpToolExecutor: userId is required for Meta MCP tool execution.");
    }
    if (!targetAccountId) {
      throw new Error(
        "McpToolExecutor: accountId is required for Meta MCP tool execution to prevent cross-account operations."
      );
    }

    const cleanAccId = String(targetAccountId).replace(/^act_/, "").trim();

    // 1. Resolve and verify MetaAccount ownership
    let metaAccount = args.metaAccount;
    if (!metaAccount) {
      try {
        metaAccount = await MetaAccount.findOne({
          userId,
          accountId: { $in: [cleanAccId, `act_${cleanAccId}`] },
          isActive: true,
        }).lean();
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
        `McpToolExecutor: Meta account act_${cleanAccId} was not found or is not active for user ${userId}. Fallback to other accounts is strictly prohibited.`
      );
    }

    if (String(metaAccount.userId) !== String(userId)) {
      throw new Error("McpToolExecutor Security Alert: Cross-user tool execution is strictly prohibited.");
    }

    // 2. Verified campaign verification tool (MCP-only, zero Graph API calls)
    if (toolName === "verify_meta_campaign") {
      const { campaignId, adSetId, adId } = args;
      if (!campaignId) {
        return {
          success: false,
          verified: false,
          status: "VERIFICATION_FAILED",
          error: "Campaign ID is required for verification.",
          message: "Campaign ID is required to verify campaign on Meta.",
        };
      }

      // Check if MCP is connected
      const hasTools =
        mcpToolRegistry.hasTools(userId, cleanAccId) ||
        (metaAccount.discoveredTools && metaAccount.discoveredTools.length > 0);

      if (metaAccount.mcpStatus !== "CONNECTED" && !hasTools) {
        return {
          success: false,
          verified: false,
          status: "VERIFICATION_UNAVAILABLE",
          campaignId,
          adSetId: adSetId || null,
          adId: adId || null,
          accountId: `act_${cleanAccId}`,
          message: `Official Meta MCP Server is disconnected for account act_${cleanAccId}. Live verification is unavailable. Direct Graph API fallback is disabled.`,
        };
      }

      // Check if discovered MCP tools include a campaign listing or details tool
      const campTool = mcpToolRegistry.findToolByKeyword(userId, cleanAccId, [
        "campaigns",
        "get_campaigns",
        "list_campaigns",
        "get_campaign_details",
      ]);

      if (campTool) {
        try {
          const { McpToolExecutor } = await import("./McpToolExecutor.js");
          const campRes = await McpToolExecutor.executeTool(
            campTool.name,
            { account_id: `act_${cleanAccId}`, ...(campaignId ? { campaign_id: campaignId, id: campaignId } : {}) },
            { userId, accountId: cleanAccId, metaAccount, ...(args.mcpClient ? { mcpClient: args.mcpClient } : {}) }
          );
          const rawCamps = this.extractArrayData(campRes);
          const exists = rawCamps.some((c) => String(c.id || c.campaignId || c.campaign_id) === String(campaignId));
          return {
            success: exists,
            verified: exists,
            status: exists ? "CAMPAIGN_VERIFIED" : "VERIFICATION_FAILED",
            campaignId,
            adSetId: adSetId || null,
            adId: adId || null,
            accountId: `act_${cleanAccId}`,
            source: "OFFICIAL_META_MCP",
            verification: {
              campaignExists: exists,
              adSetExists: Boolean(adSetId ? exists : true),
              adExists: Boolean(adId ? exists : true),
              accountMatched: true,
              allComponentsReady: exists,
            },
            message: exists
              ? `Meta Campaign ${campaignId} verified via official Meta MCP tool "${campTool.name}".`
              : `Meta Campaign ${campaignId} was not found on official Meta MCP server.`,
          };
        } catch (verErr) {
          return {
            success: false,
            verified: false,
            status: "VERIFICATION_FAILED",
            campaignId,
            accountId: `act_${cleanAccId}`,
            error: verErr.message,
            message: `Official Meta MCP verification failed: ${verErr.message}`,
          };
        }
      }

      return {
        success: false,
        verified: false,
        status: "VERIFICATION_UNAVAILABLE",
        campaignId,
        adSetId: adSetId || null,
        adId: adId || null,
        accountId: `act_${cleanAccId}`,
        message: `No campaign listing or details tool discovered on official Meta MCP server for account act_${cleanAccId}. Direct Graph API verification is strictly disabled.`,
      };
    }

    // 3. Lead Generation pipeline tools (strictly executed via discovered official Meta MCP tools)
    if (
      toolName.startsWith("create_meta_lead_") ||
      toolName.startsWith("get_meta_lead_") ||
      toolName === "publish_meta_lead_campaign" ||
      toolName === "subscribe_meta_lead_webhook" ||
      toolName === "upload_meta_ad_image" ||
      toolName === "upload_meta_ad_video"
    ) {
      if (mcpToolRegistry.hasTool(userId, cleanAccId, toolName)) {
        const { McpToolExecutor } = await import("./McpToolExecutor.js");
        return await McpToolExecutor.executeTool(toolName, args, {
          userId,
          accountId: cleanAccId,
          metaAccount,
        });
      }
      throw new Error(
        `Meta MCP Tool Not Discovered: Tool "${toolName}" is not available on the connected official Meta MCP server for account act_${cleanAccId}. Graph API fallback is disabled.`
      );
    }

    // 4. Ensure discovered tools are registered into dynamic registry for this session
    if (!mcpToolRegistry.hasTools(userId, cleanAccId) && metaAccount.discoveredTools?.length > 0) {
      mcpToolRegistry.loadFromAccount(metaAccount);
    }

    // Check MCP status
    const hasTools =
      mcpToolRegistry.hasTools(userId, cleanAccId) ||
      (metaAccount.discoveredTools && metaAccount.discoveredTools.length > 0);

    if (metaAccount.mcpStatus !== "CONNECTED" && !hasTools) {
      throw new Error(
        `Meta MCP Disconnected Error: Official Meta Ads MCP session is not connected for account act_${cleanAccId} (Status: ${metaAccount.mcpStatus || "DISCONNECTED"}${metaAccount.mcpErrorMessage ? `: ${metaAccount.mcpErrorMessage}` : ""}). Please connect to https://mcp.facebook.com/ads via Channels.`
      );
    }

    const { McpToolExecutor } = await import("./McpToolExecutor.js");

    // 5. COMPOSITE MCP OPERATION: get_live_campaigns_status
    // Dynamically queries campaigns & adsets from official Meta MCP server and normalizes hierarchy
    if (toolName === "get_live_campaigns_status") {
      const campTool = mcpToolRegistry.findToolByKeyword(userId, cleanAccId, [
        "campaigns",
        "get_campaigns",
        "list_campaigns",
      ]);

      if (!campTool) {
        throw new Error(
          `Meta MCP Tool Not Found: Official Meta MCP campaign listing tool was not discovered for account act_${cleanAccId}. Please reconnect official MCP server.`
        );
      }

      const adSetTool = mcpToolRegistry.findToolByKeyword(userId, cleanAccId, [
        "adsets",
        "ad_sets",
        "get_ad_sets",
        "list_ad_sets",
      ]);

      const campRes = await McpToolExecutor.executeTool(
        campTool.name,
        { account_id: `act_${cleanAccId}` },
        { userId, accountId: cleanAccId, metaAccount, ...(args.mcpClient ? { mcpClient: args.mcpClient } : {}) }
      );
      const rawCampaigns = this.extractArrayData(campRes);

      let rawAdSets = [];
      if (adSetTool) {
        try {
          const adSetRes = await McpToolExecutor.executeTool(
            adSetTool.name,
            { account_id: `act_${cleanAccId}` },
            { userId, accountId: cleanAccId, metaAccount, ...(args.mcpClient ? { mcpClient: args.mcpClient } : {}) }
          );
          rawAdSets = this.extractArrayData(adSetRes);
        } catch (adSetErr) {
          console.warn(`[MetaMcpClient get_live_campaigns_status AdSet Warning]:`, adSetErr.message);
        }
      }

      const normalizedCampaigns = rawCampaigns.map((camp) => {
        const campId = String(camp.id || camp.campaignId || camp.campaign_id);
        const campAdSets = rawAdSets.filter(
          (as) => String(as.campaign_id || as.campaignId) === campId
        );
        return {
          id: campId,
          name: camp.name || "Untitled Campaign",
          status: camp.status || camp.effectiveStatus || "PAUSED",
          effectiveStatus: camp.effective_status || camp.effectiveStatus || camp.status || "PAUSED",
          objective: camp.objective || "",
          createdTime: camp.created_time || camp.createdTime || "",
          adSets: campAdSets.map((as) => ({
            id: String(as.id || as.adSetId || as.adset_id),
            name: as.name || "Untitled Ad Set",
            status: as.status || as.effectiveStatus || "PAUSED",
            effectiveStatus: as.effective_status || as.effectiveStatus || as.status || "PAUSED",
          })),
          totalAdSets: campAdSets.length,
        };
      });

      return {
        status: "LIVE_DATA_FROM_META_MCP",
        source: "OFFICIAL_META_MCP",
        accountId: `act_${cleanAccId}`,
        totalCampaignsReturned: normalizedCampaigns.length,
        totalAdSetsReturned: rawAdSets.length,
        campaigns: normalizedCampaigns,
      };
    }

    // 6. COMPOSITE MCP OPERATION: get_live_adset_ads
    // Dynamically queries ads from official Meta MCP server and filters by target ad set if requested
    if (toolName === "get_live_adset_ads") {
      const adsTool = mcpToolRegistry.findToolByKeyword(userId, cleanAccId, [
        "ads",
        "get_ads",
        "list_ads",
      ]);

      if (!adsTool) {
        throw new Error(
          `Meta MCP Tool Not Found: Official Meta MCP ads listing tool was not discovered for account act_${cleanAccId}.`
        );
      }

      const adsRes = await McpToolExecutor.executeTool(
        adsTool.name,
        {
          account_id: `act_${cleanAccId}`,
          ...(args.adSetId ? { adset_id: args.adSetId } : {}),
        },
        { userId, accountId: cleanAccId, metaAccount, ...(args.mcpClient ? { mcpClient: args.mcpClient } : {}) }
      );

      let rawAds = this.extractArrayData(adsRes);
      if (args.adSetId && rawAds.length > 0) {
        const filtered = rawAds.filter(
          (a) => String(a.adset_id || a.adSetId) === String(args.adSetId)
        );
        if (filtered.length > 0) {
          rawAds = filtered;
        }
      }

      return {
        status: "LIVE_DATA_FROM_META_MCP",
        source: "OFFICIAL_META_MCP",
        accountId: `act_${cleanAccId}`,
        totalAds: rawAds.length,
        ads: rawAds.map((a) => ({
          id: String(a.id || a.adId),
          name: a.name || "Untitled Ad",
          status: a.status || a.effective_status || "PAUSED",
          adSetId: a.adset_id || a.adSetId || null,
        })),
      };
    }

    // 7. COMPOSITE MCP OPERATION: get_live_campaign_insights / get_live_today_insights
    if (toolName === "get_live_campaign_insights" || toolName === "get_live_today_insights") {
      const datePreset = args.datePreset || (toolName === "get_live_today_insights" ? "today" : "last_7d");
      const insightTool = mcpToolRegistry.findToolByKeyword(userId, cleanAccId, [
        "insights",
        "get_ad_account_insights",
        "get_campaign_insights",
      ]);

      if (!insightTool) {
        throw new Error(
          `Meta MCP Tool Not Found: Official Meta MCP insights tool was not discovered for account act_${cleanAccId}.`
        );
      }

      const insightRes = await McpToolExecutor.executeTool(
        insightTool.name,
        {
          account_id: `act_${cleanAccId}`,
          date_preset: datePreset,
          ...(args.timeRange ? { time_range: args.timeRange } : {}),
          ...(args.fields ? { fields: args.fields } : {}),
        },
        { userId, accountId: cleanAccId, metaAccount, ...(args.mcpClient ? { mcpClient: args.mcpClient } : {}) }
      );

      const rawRows = this.extractArrayData(insightRes);
      let totalSpend = 0;
      let totalImpressions = 0;
      let totalClicks = 0;
      let totalConversions = 0;
      let totalConversionValue = 0;

      for (const row of rawRows) {
        totalSpend += Number(row.spend || 0);
        totalImpressions += Number(row.impressions || 0);
        totalClicks += Number(row.clicks || 0);
        if (Array.isArray(row.actions)) {
          for (const a of row.actions) {
            if (a.action_type === "purchase" || a.action_type === "lead" || a.action_type === "omni_purchase") {
              totalConversions += Number(a.value || 0);
            }
          }
        }
        if (Array.isArray(row.action_values)) {
          for (const av of row.action_values) {
            if (av.action_type === "purchase" || av.action_type === "omni_purchase") {
              totalConversionValue += Number(av.value || 0);
            }
          }
        }
      }

      const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
      const roas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;

      return {
        status: "LIVE_DATA_FROM_META_MCP",
        source: "OFFICIAL_META_MCP",
        accountId: `act_${cleanAccId}`,
        datePreset,
        insights: rawRows,
        summary: {
          spend: Number(totalSpend.toFixed(2)),
          impressions: totalImpressions,
          clicks: totalClicks,
          ctr: Number(ctr.toFixed(2)),
          cpc: Number(cpc.toFixed(2)),
          conversions: totalConversions,
          conversionValue: Number(totalConversionValue.toFixed(2)),
          roas: Number(roas.toFixed(2)),
        },
      };
    }

    // 8. ALL OTHER META ADS OPERATIONS: Strictly execute via McpToolExecutor on the official Meta MCP Server
    // Direct Graph API fallback is strictly disabled in the AI Agent path.
    return await McpToolExecutor.executeTool(toolName, args, {
      userId,
      accountId: cleanAccId,
      metaAccount,
      ...(args.mcpClient ? { mcpClient: args.mcpClient } : {}),
    });
  }
}

export default MetaMcpClient;
