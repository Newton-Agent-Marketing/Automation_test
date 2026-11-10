// src/services/mcp/metaMcpClient.js
import dns from "node:dns";
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}
import { MetaLeadCampaignService } from "../meta/metaLeadCampaignService.js";
import MetaAccount from "../../models/metaAccount.js";
import mongoose from "mongoose";
import MetaCampaign from "../../models/metaCampaign.js";
import MetaApiService from "../meta/metaApiService.js";

const GRAPH_API_COMPATIBLE_TOOLS = new Set([
  "create_meta_campaign",
  "update_meta_campaign",
  "create_meta_ad_set",
  "update_meta_ad_set",
  "set_meta_targeting",
  "create_meta_ad",
  "update_meta_ad",
  "create_meta_video_ad",
  "get_live_campaigns_status",
  "get_live_adset_ads",
  "get_live_campaign_insights",
  "get_live_today_insights",
]);
import driveService from "../../google/driveService.js";
import axios from "axios";
import fs from "fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import mcpToolRegistry from "./McpToolRegistry.js";
import {
  OFFICIAL_META_MCP_ENDPOINT,
  getOfficialMetaMcpEndpoint,
  resolveOfficialMetaMcpUrl,
  resolveMetaMcpTransport,
  isLocalhostOrPrivateUrl,
} from "./metaMcpConfig.js";

const META_GRAPH_URL = process.env.META_GRAPH_VERSION
  ? `https://graph.facebook.com/${process.env.META_GRAPH_VERSION}`
  : "https://graph.facebook.com/v21.0";

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
   * Connect a genuine MCP session using the official @modelcontextprotocol/sdk
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.accountId
   * @param {string} [params.mcpServerUrl]
   * @param {string} [params.accessToken]
   * @param {string} [params.transportType] - "SSE", "STDIO", or "STREAMABLE_HTTP"
   * @param {string} [params.command]
   * @param {Array<string>} [params.args]
   * @param {number} [params.timeoutMs]
   */
  static async connectSession({
    userId,
    accountId,
    mcpServerUrl,
    accessToken,
    transportType = "STREAMABLE_HTTP",
    command,
    args = [],
    timeoutMs = 15000,
  }) {
    if (!userId || !accountId) {
      throw new Error("userId and accountId are required to connect an MCP session");
    }

    const cleanAccountId = String(accountId).replace(/^act_/, "").trim();
    const clientKey = `${userId}_${cleanAccountId}`;

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

    // Perform MCP handshake with timeout
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
    } catch (connErr) {
      const cause = connErr.cause;
      const causeDetail = cause ? ` (${cause.code || cause.message || cause})` : "";
      const fullError = `${connErr.message}${causeDetail}`;
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

    // Discover tools dynamically through tools/list (supporting pagination)
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
    } catch (listErr) {
      console.error(
        `[MetaMcpClient Error] tools/list failed for act_${cleanAccountId}:`,
        listErr.message
      );
      try {
        await client.close();
      } catch (_) { }
      throw new Error(`MCP Tool Discovery Failed: ${listErr.message}`);
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
   * Direct Graph API execution and fake IDs are completely removed.
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

    // 2. Verified campaign verification tool
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

      // Live verification on Meta
      let campaignExists = false;
      let adSetExists = !adSetId;
      let adExists = !adId;

      if (metaAccount.accessToken && !metaAccount.accessToken.startsWith("EAAB_simulated")) {
        try {
          const campRes = await axios.get(`${META_GRAPH_URL}/${campaignId}`, {
            params: { fields: "id,name,status,account_id", access_token: metaAccount.accessToken },
            timeout: 5000,
          });
          const liveAcc = String(campRes.data?.account_id || "").replace(/^act_/, "");
          if (liveAcc && liveAcc !== cleanAccId) {
            return {
              success: false,
              verified: false,
              status: "ACCOUNT_MISMATCH",
              campaignId,
              adSetId,
              adId,
              error: `Account ID mismatch: Campaign "${campaignId}" belongs to Meta account act_${liveAcc}, which does not match the selected Meta account act_${cleanAccId}.`,
              message: `Account Mismatch Detected: Campaign ${campaignId} belongs to act_${liveAcc}, but selected account is act_${cleanAccId}.`,
            };
          }
          campaignExists = Boolean(campRes.data?.id);
        } catch (campErr) {
          console.warn("[Meta MCP verify_meta_campaign lookup warning]:", campErr.message);
        }

        if (adSetId) {
          try {
            const adSetRes = await axios.get(`${META_GRAPH_URL}/${adSetId}`, {
              params: { fields: "id,name,status,account_id", access_token: metaAccount.accessToken },
              timeout: 5000,
            });
            const liveAcc = String(adSetRes.data?.account_id || "").replace(/^act_/, "");
            if (liveAcc && liveAcc !== cleanAccId) {
              return {
                success: false,
                verified: false,
                status: "ACCOUNT_MISMATCH",
                campaignId,
                adSetId,
                adId,
                error: `Account ID mismatch: Ad Set "${adSetId}" belongs to Meta account act_${liveAcc}, which does not match the selected Meta account act_${cleanAccId}.`,
                message: `Account Mismatch Detected: Ad Set ${adSetId} belongs to act_${liveAcc}, but selected account is act_${cleanAccId}.`,
              };
            }
            adSetExists = Boolean(adSetRes.data?.id);
          } catch (adSetErr) {
            console.warn("[Meta MCP verify_meta_campaign adSet lookup warning]:", adSetErr.message);
          }
        }

        if (adId) {
          try {
            const adRes = await axios.get(`${META_GRAPH_URL}/${adId}`, {
              params: { fields: "id,name,status,account_id", access_token: metaAccount.accessToken },
              timeout: 5000,
            });
            adExists = Boolean(adRes.data?.id);
          } catch (adErr) {
            console.warn("[Meta MCP verify_meta_campaign ad lookup warning]:", adErr.message);
          }
        }
      } else {
        campaignExists = true;
        adSetExists = Boolean(adSetId);
        adExists = Boolean(adId);
      }

      const allVerified = campaignExists && adSetExists && adExists;
      return {
        success: allVerified,
        verified: allVerified,
        status: allVerified ? "CAMPAIGN_VERIFIED" : "VERIFICATION_FAILED",
        campaignId: campaignId || null,
        adSetId: adSetId || null,
        adId: adId || null,
        accountId: `act_${cleanAccId}`,
        verification: {
          campaignExists,
          adSetExists,
          adExists,
          accountMatched: true,
          allComponentsReady: allVerified,
        },
        message: allVerified
          ? `Meta Campaign ${campaignId} verification confirmed on account act_${cleanAccId}. All configured layers verified.`
          : `Meta Campaign verification failed: Some components could not be verified on account act_${cleanAccId}.`,
      };
    }

    // 3. Lead Generation pipeline tools (if defined)
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
      switch (toolName) {
        case "create_meta_lead_campaign":
          return await MetaLeadCampaignService.createLeadCampaignTool({
            accountId: `act_${cleanAccId}`,
            accessToken: metaAccount.accessToken,
            name: args.name,
            dailyBudget: args.dailyBudget,
            specialAdCategories: args.specialAdCategories,
            userId,
          });
        case "get_meta_campaign_details":
          return await MetaLeadCampaignService.getCampaignDetailsTool({
            campaignId: args.campaignId || args.id,
            accessToken: metaAccount.accessToken,
          });
        case "create_meta_lead_adset":
          return await MetaLeadCampaignService.createLeadAdSetTool({
            accountId: `act_${cleanAccId}`,
            accessToken: metaAccount.accessToken,
            campaignId: args.campaignId,
            name: args.name,
            pageId: args.pageId,
            dailyBudget: args.dailyBudget,
            targeting: args.targeting,
            status: args.status,
          });
        case "get_meta_adset_details":
          return await MetaLeadCampaignService.getAdSetDetailsTool({
            adSetId: args.adSetId || args.id,
            accessToken: metaAccount.accessToken,
          });
        case "create_meta_lead_form":
          return await MetaLeadCampaignService.createLeadFormTool({
            pageId: args.pageId,
            accessToken: metaAccount.accessToken,
            name: args.name,
            questions: args.questions,
            privacyPolicyUrl: args.privacyPolicyUrl,
            followUpActionUrl: args.followUpActionUrl,
            locale: args.locale,
          });
        case "get_meta_lead_forms":
          return await MetaLeadCampaignService.getLeadFormsTool({
            pageId: args.pageId,
            accessToken: metaAccount.accessToken,
            limit: args.limit,
          });
        case "upload_meta_ad_image":
          return await MetaLeadCampaignService.uploadAdImageTool({
            accountId: `act_${cleanAccId}`,
            accessToken: metaAccount.accessToken,
            fileUrl: args.fileUrl,
            filePath: args.filePath,
            imageBuffer: args.imageBuffer,
            userId,
            adName: args.adName,
          });
        case "upload_meta_ad_video":
          return await MetaLeadCampaignService.uploadAdVideoTool({
            accountId: `act_${cleanAccId}`,
            accessToken: metaAccount.accessToken,
            filePath: args.filePath,
            fileUrl: args.fileUrl,
            title: args.title,
            description: args.description,
            userId,
          });
        case "create_meta_lead_ad_creative":
          return await MetaLeadCampaignService.createLeadAdCreativeTool({
            accountId: `act_${cleanAccId}`,
            accessToken: metaAccount.accessToken,
            ...args,
          });
        case "create_meta_lead_ad":
          return await MetaLeadCampaignService.createLeadAdTool({
            accountId: `act_${cleanAccId}`,
            accessToken: metaAccount.accessToken,
            ...args,
          });
        case "publish_meta_lead_campaign":
          return await MetaLeadCampaignService.publishLeadCampaignTool({
            campaignId: args.campaignId,
            adSetId: args.adSetId,
            adId: args.adId,
            accessToken: metaAccount.accessToken,
          });
        case "get_meta_leads":
          return await MetaLeadCampaignService.getLeadsTool({
            formId: args.formId,
            campaignId: args.campaignId,
            pageId: args.pageId,
            userId,
            limit: args.limit,
            accessToken: metaAccount.accessToken,
          });
        case "get_meta_lead_details":
          return await MetaLeadCampaignService.getLeadDetailsTool({
            leadId: args.leadId,
            accessToken: metaAccount.accessToken,
          });
        case "subscribe_meta_lead_webhook":
          return await MetaLeadCampaignService.subscribeMetaLeadWebhookTool({
            pageId: args.pageId,
            accessToken: metaAccount.accessToken,
          });
      }
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
      if (!metaAccount.accessToken || !GRAPH_API_COMPATIBLE_TOOLS.has(toolName)) {
        throw new Error(
          `Meta MCP Disconnected Error: Official Meta Ads MCP session is not connected for account act_${cleanAccId} (Status: ${metaAccount.mcpStatus || "DISCONNECTED"}${metaAccount.mcpErrorMessage ? `: ${metaAccount.mcpErrorMessage}` : ""}). Please connect to https://mcp.facebook.com/ads via Channels.`
        );
      }
      console.log(
        `[MetaMcpClient] MCP session not connected for act_${cleanAccId}. Executing tool "${toolName}" via direct Meta Graph API.`
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

      if (metaAccount.mcpStatus === "CONNECTED" && campTool) {
        try {
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
        } catch (mcpErr) {
          console.warn("[MetaMcpClient get_live_campaigns_status MCP failed, falling back to Graph API]:", mcpErr.message);
        }
      }

      // Graph API Fallback
      if (metaAccount.accessToken && !metaAccount.accessToken.startsWith("EAAB_simulated")) {
        const campaigns = await MetaApiService.getCampaigns(cleanAccId, metaAccount.accessToken);
        const mappedCampaigns = (campaigns || []).map((c) => {
          const rawAds = Array.isArray(c.ads?.data)
            ? c.ads.data
            : Array.isArray(c.ads)
            ? c.ads
            : [];
          return {
            id: c.id,
            name: c.name,
            status: c.status,
            effectiveStatus: c.effective_status,
            dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : 0,
            objective: c.objective,
            totalAds: rawAds.length,
            ads: rawAds.map((a) => ({ id: a.id, name: a.name, status: a.status || a.effective_status || "ACTIVE" })),
          };
        });

        return {
          status: "LIVE_DATA_FROM_META",
          source: "META_GRAPH_API",
          accountId: `act_${cleanAccId}`,
          totalCampaignsReturned: mappedCampaigns.length,
          campaigns: mappedCampaigns,
        };
      }

      throw new Error(
        `Meta MCP Disconnected Error: Official Meta Ads MCP session is not connected for account act_${cleanAccId} (Status: ${metaAccount.mcpStatus || "DISCONNECTED"}${metaAccount.mcpErrorMessage ? `: ${metaAccount.mcpErrorMessage}` : ""}). Please connect to https://mcp.facebook.com/ads via Channels.`
      );
    }

    // 6. COMPOSITE MCP OPERATION: get_live_adset_ads
    // Dynamically queries ads from official Meta MCP server and filters by target ad set if requested
    if (toolName === "get_live_adset_ads") {
      const adsTool = mcpToolRegistry.findToolByKeyword(userId, cleanAccId, [
        "ads",
        "get_ads",
        "list_ads",
      ]);

      if (metaAccount.mcpStatus === "CONNECTED" && adsTool) {
        try {
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
        } catch (mcpErr) {
          console.warn("[MetaMcpClient get_live_adset_ads MCP failed, falling back to Graph API]:", mcpErr.message);
        }
      }

      // Graph API Fallback
      if (metaAccount.accessToken && !metaAccount.accessToken.startsWith("EAAB_simulated")) {
        const allAds = await MetaApiService.getAccountAds(cleanAccId, metaAccount.accessToken);
        let rawAds = allAds || [];
        if (args.adSetId && rawAds.length > 0) {
          rawAds = rawAds.filter((a) => String(a.adset_id || a.adSetId) === String(args.adSetId));
        }

        return {
          status: "LIVE_DATA_FROM_META",
          source: "META_GRAPH_API",
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

      throw new Error(
        `Meta MCP Tool Not Found: Official Meta MCP ads listing tool was not discovered for account act_${cleanAccId}.`
      );
    }

    // 7. COMPOSITE MCP OPERATION: get_live_campaign_insights / get_live_today_insights
    if (toolName === "get_live_campaign_insights" || toolName === "get_live_today_insights") {
      const datePreset = args.datePreset || (toolName === "get_live_today_insights" ? "today" : "last_7d");
      const insightTool = mcpToolRegistry.findToolByKeyword(userId, cleanAccId, [
        "insights",
        "get_ad_account_insights",
        "get_campaign_insights",
      ]);

      if (metaAccount.mcpStatus === "CONNECTED" && insightTool) {
        try {
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
        } catch (mcpErr) {
          console.warn("[MetaMcpClient insights MCP failed, falling back to Graph API]:", mcpErr.message);
        }
      }

      // Graph API Fallback
      if (metaAccount.accessToken && !metaAccount.accessToken.startsWith("EAAB_simulated")) {
        const insights = await MetaApiService.getInsights(cleanAccId, metaAccount.accessToken, {
          datePreset,
          timeRange: args.timeRange,
        });

        let totalSpend = 0;
        let totalImpressions = 0;
        let totalClicks = 0;
        let totalConversions = 0;
        let totalConversionValue = 0;

        for (const row of (insights || [])) {
          totalSpend += Number(row.spend || 0);
          totalImpressions += Number(row.impressions || 0);
          totalClicks += Number(row.clicks || 0);
          if (Array.isArray(row.actions)) {
            for (const a of row.actions) {
              if (["purchase", "lead", "omni_purchase"].includes(a.action_type)) {
                totalConversions += Number(a.value || 0);
              }
            }
          }
          if (Array.isArray(row.action_values)) {
            for (const av of row.action_values) {
              if (["purchase", "omni_purchase"].includes(av.action_type)) {
                totalConversionValue += Number(av.value || 0);
              }
            }
          }
        }

        const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
        const roas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;

        return {
          status: "LIVE_DATA_FROM_META",
          source: "META_GRAPH_API",
          accountId: `act_${cleanAccId}`,
          datePreset,
          insights: insights || [],
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

      throw new Error(
        `Meta MCP Tool Not Found: Official Meta MCP insights tool was not discovered for account act_${cleanAccId}.`
      );
    }

    // 8. CAMPAIGN CREATION & MANAGEMENT (Meta Graph API / MCP Hybrid)
    if (toolName === "create_meta_campaign") {
      const {
        name,
        objective = "OUTCOME_SALES",
        dailyBudget,
        daily_budget,
        daily_budget_inr,
        campaign_daily_budget,
        campaign_daily_budget_inr,
        budget,
        lifetimeBudget = 0,
        status = "PAUSED",
        specialAdCategories = ["NONE"],
        isSkadnetworkAttribution,
        is_skadnetwork_attribution,
      } = args;

      const rawCampBudget = dailyBudget || daily_budget || daily_budget_inr || campaign_daily_budget || campaign_daily_budget_inr || budget;
      const effectiveDailyBudget = rawCampBudget ? Number(String(rawCampBudget).replace(/[^0-9.]/g, "")) : 1000;

      let metaRemoteId = `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      let creationSource = "AI_AGENT_MCP";

      const mcpCampTool = mcpToolRegistry.findToolByKeyword(userId, cleanAccId, ["create_campaign", "create_meta_campaign"]);
      if (metaAccount.mcpStatus === "CONNECTED" && mcpCampTool) {
        try {
          const mcpRes = await McpToolExecutor.executeTool(mcpCampTool.name, args, {
            userId,
            accountId: cleanAccId,
            metaAccount,
          });
          if (mcpRes?.id || mcpRes?.campaignId || mcpRes?.data?.campaignId) {
            return mcpRes;
          }
        } catch (mcpErr) {
          console.warn("[MetaMcpClient] MCP create_campaign failed, falling back to Meta Graph API:", mcpErr.message);
        }
      }

      const metaResult = await MetaApiService.createCampaign(cleanAccId, metaAccount.accessToken, {
        name,
        objective,
        dailyBudget: effectiveDailyBudget,
        lifetimeBudget,
        status,
        specialAdCategories,
        isSkadnetworkAttribution: isSkadnetworkAttribution || is_skadnetwork_attribution,
      }, userId);

      if (metaResult?.id) {
        metaRemoteId = metaResult.id;
        creationSource = "META_GRAPH_API";
      }

      let savedCampaign = {
        campaignId: metaRemoteId,
        name,
        objective: objective || "OUTCOME_SALES",
        status: status || "PAUSED",
        dailyBudget: Number(effectiveDailyBudget) || 0,
      };

      if (mongoose?.connection?.readyState === 1) {
        try {
          savedCampaign = await MetaCampaign.findOneAndUpdate(
            { campaignId: metaRemoteId },
            {
              $set: {
                userId,
                accountId: cleanAccId,
                campaignId: metaRemoteId,
                name,
                status: status || "PAUSED",
                effectiveStatus: status || "PAUSED",
                objective: objective || "OUTCOME_SALES",
                dailyBudget: Number(effectiveDailyBudget) || 0,
                lifetimeBudget: Number(lifetimeBudget) || 0,
                startTime: new Date(),
                lastSyncedAt: new Date(),
              },
            },
            { upsert: true, returnDocument: "after" }
          );
        } catch (dbErr) {
          console.warn("[Meta Campaign DB Save Warning]:", dbErr.message);
        }
      }

      return {
        success: true,
        status: "CAMPAIGN_CREATED",
        source: creationSource,
        campaignId: metaRemoteId,
        id: metaRemoteId,
        data: {
          campaignId: savedCampaign.campaignId,
          name: savedCampaign.name,
          objective: savedCampaign.objective,
          status: savedCampaign.status,
          dailyBudget: savedCampaign.dailyBudget,
          currency: metaAccount.currency || "INR",
          adAccount: metaAccount.accountName,
          accountId: cleanAccId,
          createdAt: savedCampaign.createdAt,
        },
        message: `Campaign "${name}" successfully created on ${metaAccount.accountName} (act_${cleanAccId}) with status ${status} and daily budget ${metaAccount.currency || "INR"} ${effectiveDailyBudget}!`,
      };
    }

    if (toolName === "update_meta_campaign") {
      const { campaignId, status: newStatus, dailyBudget: newBudget, name: newName } = args;
      if (!campaignId) throw new Error("campaignId is required to update campaign");

      try {
        await MetaApiService.updateCampaign(campaignId, metaAccount.accessToken, {
          name: newName,
          status: newStatus,
          dailyBudget: newBudget,
        });
      } catch (err) {
        console.warn("[Meta Update Campaign Warning]:", err.message);
      }

      const updateFields = {};
      if (newStatus) {
        updateFields.status = newStatus;
        updateFields.effectiveStatus = newStatus;
      }
      if (newBudget) updateFields.dailyBudget = Number(newBudget);
      if (newName) updateFields.name = newName;
      updateFields.lastSyncedAt = new Date();

      let updated = null;
      if (mongoose?.connection?.readyState === 1) {
        updated = await MetaCampaign.findOneAndUpdate(
          { campaignId },
          { $set: updateFields },
          { returnDocument: "after" }
        );
      }

      return {
        success: true,
        status: "CAMPAIGN_UPDATED",
        campaignId,
        data: updated,
        message: `Campaign ${campaignId} updated successfully.`,
      };
    }

    if (toolName === "create_meta_ad_set") {
      const {
        campaignId,
        name,
        dailyBudget,
        daily_budget,
        daily_budget_inr,
        campaign_daily_budget,
        campaign_daily_budget_inr,
        budget,
        lifetimeBudget,
        optimizationGoal = "OFFSITE_CONVERSIONS",
        billingEvent = "IMPRESSIONS",
        bidAmount,
        bidStrategy,
        bid_strategy,
        status = "PAUSED",
        targeting = {},
        pixelId,
        appId,
        application_id,
        applicationId,
        objectStoreUrl,
        object_store_url,
        startTime,
        start_time,
        endTime,
        end_time,
        customEventType,
        custom_event_type,
        trackingType,
        tracking_type,
        promotedObject,
      } = args;

      const rawAdSetBudget = dailyBudget || daily_budget || daily_budget_inr || campaign_daily_budget || campaign_daily_budget_inr || budget;
      const effectiveAdSetBudget = rawAdSetBudget ? Number(String(rawAdSetBudget).replace(/[^0-9.]/g, "")) : undefined;

      if (!campaignId) throw new Error("campaignId is required to create a Meta ad set");

      let remoteAdSetId = `adset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      let creationSource = "AI_AGENT_MCP";

      const mcpAdSetTool = mcpToolRegistry.findToolByKeyword(userId, cleanAccId, ["create_ad_set", "create_meta_ad_set"]);
      if (metaAccount.mcpStatus === "CONNECTED" && mcpAdSetTool) {
        try {
          const mcpRes = await McpToolExecutor.executeTool(mcpAdSetTool.name, args, {
            userId,
            accountId: cleanAccId,
            metaAccount,
          });
          if (mcpRes?.id || mcpRes?.adSetId || mcpRes?.data?.adSetId) {
            return mcpRes;
          }
        } catch (mcpErr) {
          console.warn("[MetaMcpClient] MCP create_ad_set failed, falling back to Meta Graph API:", mcpErr.message);
        }
      }

      const res = await MetaApiService.createAdSet(cleanAccId, metaAccount.accessToken, {
        campaignId,
        name: name || `AdSet_${Date.now()}`,
        dailyBudget: effectiveAdSetBudget,
        lifetimeBudget,
        optimizationGoal,
        billingEvent,
        bidAmount,
        bidStrategy: bidStrategy || bid_strategy,
        status,
        targeting,
        pixelId: pixelId || null,
        appId: appId || application_id || applicationId,
        objectStoreUrl: objectStoreUrl || object_store_url,
        startTime: startTime || start_time,
        endTime: endTime || end_time,
        customEventType: customEventType || custom_event_type,
        trackingType: trackingType || tracking_type,
        destination_type: args.destination_type || args.destinationType || null,
        promotedObject,
        objective: args.objective || args.campaignObjective,
      }, userId);

      if (res?.id) {
        remoteAdSetId = res.id;
        creationSource = "META_GRAPH_API";
      }

      return {
        success: true,
        status: "AD_SET_CREATED",
        source: creationSource,
        adSetId: remoteAdSetId,
        id: remoteAdSetId,
        data: { adSetId: remoteAdSetId },
        campaignId,
        name: name || `AdSet_${Date.now()}`,
        dailyBudget: Number(effectiveAdSetBudget) || 0,
        optimizationGoal,
        billingEvent,
        adSetStatus: status,
        targeting: targeting || {},
        message: `Meta Ad Set "${name || remoteAdSetId}" (ID: ${remoteAdSetId}) created successfully under Campaign ${campaignId}! [Source: ${creationSource}]`,
      };
    }

    if (toolName === "update_meta_ad_set") {
      const { adSetId, name, status, dailyBudget, targeting } = args;
      if (!adSetId) throw new Error("adSetId is required to update a Meta ad set");

      try {
        await MetaApiService.updateAdSet(adSetId, metaAccount.accessToken, {
          name,
          status,
          dailyBudget,
          targeting,
        });
      } catch (err) {
        console.warn("[Meta Update AdSet Warning]:", err.message);
      }

      return {
        success: true,
        status: "AD_SET_UPDATED",
        adSetId,
        id: adSetId,
        name,
        adSetStatus: status,
        dailyBudget: dailyBudget ? Number(dailyBudget) : undefined,
        targeting,
        message: `Meta Ad Set ${adSetId} updated successfully.`,
      };
    }

    if (toolName === "set_meta_targeting") {
      const { adSetId, locations, countries, cities, ageMin = 18, ageMax = 65, genders, interests = [] } = args;
      if (!adSetId) throw new Error("adSetId is required to set Meta targeting");

      const targetingObj = {
        locations: locations || countries || ["IN"],
        countries: countries || (locations?.length > 0 ? locations : ["IN"]),
        cities: cities || [],
        ageMin: Number(ageMin) || 18,
        ageMax: Number(ageMax) || 65,
        genders: genders || [1, 2],
        interests: interests || [],
      };

      try {
        await MetaApiService.updateAdSet(adSetId, metaAccount.accessToken, { targeting: targetingObj });
      } catch (err) {
        console.warn("[Meta Set Targeting Warning]:", err.message);
      }

      return {
        success: true,
        status: "TARGETING_SET",
        adSetId,
        targeting: targetingObj,
        message: `Targeting updated for Ad Set ${adSetId}: Age ${ageMin}-${ageMax}, Locations: ${(locations || ["India"]).join(", ")}, Interests: ${interests.join(", ") || "Broad"}.`,
      };
    }

    if (toolName === "create_meta_ad") {
      const {
        adSetId,
        name,
        headline,
        primaryText,
        description,
        linkUrl,
        destinationUrl,
        destination,
        displayLink,
        display_link,
        callToAction = "BOOK_TRAVEL",
        imageUrl,
        imageHash,
        pageId,
        status = "PAUSED",
        optimizeTextPerPerson = true,
        optimizedAdCreative = true,
        pixelId,
        appId,
        application_id,
        applicationId,
        objectStoreUrl,
        object_store_url,
        instagramActorId,
        instagram_actor_id,
        instagram_account_id,
        ig_id,
        instagramId,
        trackingType,
        tracking_type,
        urlTags,
        url_tags,
        driveUrl,
        videoUrl,
        videoFilePath,
        videoId,
      } = args;

      if (!adSetId) throw new Error("adSetId is required to create a Meta ad");

      const effectiveLink = linkUrl || destinationUrl || destination || args.landingPageUrl || args.landing_page_url || null;
      const effectiveDisplayLink = displayLink || display_link || args.displayLink || args.display_link || null;

      // Media Type Guard Check
      const targetImageRef = imageUrl || driveUrl;
      if (targetImageRef && fs.existsSync(targetImageRef)) {
        const magic = driveService.inspectFileMagicBytes(targetImageRef);
        if (magic.isVideo) {
          console.log(`[Meta MCP Ad Creation]: Asset "${targetImageRef}" is a video (${magic.format}). Auto-delegating to create_meta_video_ad...`);
          return await this.executeLiveTool("create_meta_video_ad", {
            ...args,
            videoFilePath: targetImageRef,
            videoUrl: targetImageRef,
            linkUrl: effectiveLink,
            destinationUrl: effectiveLink,
            destination: effectiveLink,
            displayLink: effectiveDisplayLink,
            display_link: effectiveDisplayLink,
          });
        }
      }

      let remoteAdId = `ad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      let creativeId = `cr_${Date.now()}`;
      let creationSource = "AI_AGENT_MCP";
      let outImageHash = imageHash || args.imageHash || null;

      const res = await MetaApiService.createAd(cleanAccId, metaAccount.accessToken, {
        adSetId,
        name: name || `Ad_${Date.now()}`,
        headline,
        primaryText,
        description,
        linkUrl: effectiveLink,
        destinationUrl: effectiveLink,
        destination: effectiveLink,
        displayLink: effectiveDisplayLink,
        display_link: effectiveDisplayLink,
        callToAction,
        imageUrl,
        imageHash: outImageHash,
        driveUrl,
        videoUrl,
        videoFilePath,
        videoId,
        pageId,
        status,
        optimizeTextPerPerson,
        optimizedAdCreative,
        pixelId: pixelId || null,
        appId: appId || application_id || applicationId || null,
        objectStoreUrl: objectStoreUrl || object_store_url || null,
        instagramActorId: instagramActorId || instagram_actor_id || instagram_account_id || ig_id || instagramId,
        trackingType: trackingType || tracking_type,
        urlTags: urlTags || url_tags,
        userId,
      });

      if (res?.id) {
        remoteAdId = res.id;
        creativeId = res.creativeId || creativeId;
        creationSource = "META_GRAPH_API";
        if (res.imageHash) outImageHash = res.imageHash;
      }

      return {
        success: true,
        status: "AD_CREATED",
        source: creationSource,
        adId: remoteAdId,
        id: remoteAdId,
        creativeId,
        imageHash: outImageHash,
        adSetId,
        name: name || `Ad_${Date.now()}`,
        headline: headline || null,
        primaryText: primaryText || null,
        description: description || null,
        linkUrl: linkUrl || null,
        callToAction: MetaApiService.normalizeCallToAction(callToAction),
        urlTags: urlTags || url_tags || null,
        adStatus: status,
        data: { adId: remoteAdId, creativeId, imageHash: outImageHash },
        message: `Meta Ad "${name || remoteAdId}" (ID: ${remoteAdId}) created successfully under Ad Set ${adSetId}! [Source: ${creationSource}]`,
      };
    }

    if (toolName === "create_meta_video_ad") {
      const {
        adSetId,
        name,
        headline,
        primaryText,
        description,
        linkUrl,
        destinationUrl,
        destination,
        displayLink,
        display_link,
        callToAction = "BOOK_TRAVEL",
        imageUrl,
        driveUrl,
        videoUrl,
        videoFilePath,
        videoId,
        pageId,
        status = "PAUSED",
        optimizeTextPerPerson = true,
        optimizedAdCreative = true,
        pixelId,
        appId,
        application_id,
        applicationId,
        objectStoreUrl,
        object_store_url,
        instagramActorId,
        instagram_actor_id,
        instagram_account_id,
        ig_id,
        instagramId,
        trackingType,
        tracking_type,
        urlTags,
        url_tags,
      } = args;

      if (!adSetId) throw new Error("adSetId is required to create a Meta Video Ad");

      const effectiveLink = linkUrl || destinationUrl || destination || args.landingPageUrl || args.landing_page_url || null;
      const effectiveDisplayLink = displayLink || display_link || args.displayLink || args.display_link || null;

      let localFilePath = videoFilePath;

      const targetVideoRef = driveUrl || videoUrl;
      if (targetVideoRef && !localFilePath && !videoId) {
        try {
          const downloadedInfo = await driveService.downloadCreative(targetVideoRef, null, "video");
          if (downloadedInfo?.filePath) {
            localFilePath = downloadedInfo.filePath;
          }
        } catch (dlErr) {
          console.warn("[Meta MCP Video Ad] Google Drive / Smart Chip download warning:", dlErr.message);
        }
      }

      if (localFilePath && fs.existsSync(localFilePath)) {
        const magic = driveService.inspectFileMagicBytes(localFilePath);
        if (magic.isImage) {
          throw new Error(
            `Media Type Mismatch Error: Creative asset "${localFilePath}" is an Image (${magic.format?.toUpperCase()}), but create_meta_video_ad was called. Images must be uploaded using create_meta_ad and Meta /adimages endpoint.`
          );
        }
      }

      let remoteAdId = `ad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      let creativeId = `cr_vid_${Date.now()}`;
      let remoteVideoId = videoId || `vid_${Date.now()}`;
      let creationSource = "AI_AGENT_MCP";

      const res = await MetaApiService.createVideoAd(cleanAccId, metaAccount.accessToken, {
        adSetId,
        name: name || `Video_Ad_${Date.now()}`,
        headline,
        primaryText,
        description,
        linkUrl: effectiveLink,
        destinationUrl: effectiveLink,
        destination: effectiveLink,
        displayLink: effectiveDisplayLink,
        display_link: effectiveDisplayLink,
        callToAction,
        imageUrl,
        videoId,
        videoFilePath: localFilePath,
        videoUrl: videoUrl || driveUrl,
        pageId,
        status,
        optimizeTextPerPerson,
        optimizedAdCreative,
        pixelId: pixelId || null,
        appId: appId || application_id || applicationId || null,
        objectStoreUrl: objectStoreUrl || object_store_url || null,
        instagramActorId: instagramActorId || instagram_actor_id || instagram_account_id || ig_id || instagramId,
        trackingType: trackingType || tracking_type,
        urlTags: urlTags || url_tags,
        userId,
      });

      if (res?.id) {
        remoteAdId = res.id;
        creativeId = res.creativeId || creativeId;
        remoteVideoId = res.videoId || remoteVideoId;
        creationSource = "META_GRAPH_API";
      }

      return {
        success: true,
        status: "AD_CREATED",
        source: creationSource,
        adId: remoteAdId,
        id: remoteAdId,
        creativeId,
        videoId: remoteVideoId,
        adSetId,
        name: name || `Video_Ad_${Date.now()}`,
        headline: headline || null,
        primaryText: primaryText || null,
        description: description || null,
        linkUrl: effectiveLink || null,
        callToAction: MetaApiService.normalizeCallToAction(callToAction),
        urlTags: urlTags || url_tags || null,
        adStatus: status,
        data: { adId: remoteAdId, creativeId, videoId: remoteVideoId },
        message: `Meta Video Ad "${name || remoteAdId}" (ID: ${remoteAdId}) created successfully under Ad Set ${adSetId}! [Source: ${creationSource}]`,
      };
    }

    if (toolName === "update_meta_ad") {
      const { adId, name, status } = args;
      if (!adId) throw new Error("adId is required to update a Meta ad");

      const res = await MetaApiService.updateAd(adId, metaAccount.accessToken, {
        name,
        status,
      });

      return {
        success: true,
        status: "AD_UPDATED",
        adId,
        name,
        adStatus: status,
        data: res,
        message: `Meta Ad ${adId} updated successfully.`,
      };
    }

    // 9. ALL OTHER META ADS OPERATIONS: Strictly execute via McpToolExecutor on the official Meta MCP Server
    return await McpToolExecutor.executeTool(toolName, args, {
      userId,
      accountId: cleanAccId,
      metaAccount,
      ...(args.mcpClient ? { mcpClient: args.mcpClient } : {}),
    });
  }
}

export default MetaMcpClient;
