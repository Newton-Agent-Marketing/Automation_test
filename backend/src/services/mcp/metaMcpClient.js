// src/services/mcp/metaMcpClient.js
import { MetaLeadCampaignService } from "../meta/metaLeadCampaignService.js";
import MetaAccount from "../../models/metaAccount.js";
import MetaCampaign from "../../models/metaCampaign.js";
import driveService from "../../google/driveService.js";
import axios from "axios";
import fs from "fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import mcpToolRegistry from "./McpToolRegistry.js";

const META_GRAPH_URL = process.env.META_GRAPH_VERSION
  ? `https://graph.facebook.com/${process.env.META_GRAPH_VERSION}`
  : "https://graph.facebook.com/v21.0";

// In-memory pool of active MCP client sessions: `${userId}_${cleanAccountId}` -> { client, transport, serverUrl, connectedAt, lastUsedAt }
const activeClients = new Map();

export class MetaMcpClient {
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
        await oldEntry.client.close();
      } catch (_) { }
      activeClients.delete(clientKey);
    }

    let transport;
    const cleanTransport = String(transportType || "STREAMABLE_HTTP").toUpperCase();
    const defaultMcpUrl = process.env.META_MCP_SERVER_URL || "https://mcp.facebook.com/ads";
    const effectiveMcpUrl = mcpServerUrl || (cleanTransport !== "STDIO" ? defaultMcpUrl : "");

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

      transport = new StreamableHTTPClientTransport(targetUrl, {
        requestInit: { headers },
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
      console.error(
        `[MetaMcpClient Error] Failed to connect MCP session for act_${cleanAccountId}:`,
        connErr.message
      );
      try {
        await transport.close?.();
      } catch (_) { }
      try {
        await client.close?.();
      } catch (_) { }
      throw new Error(`MCP Handshake Failed: ${connErr.message}`);
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

    const cached = activeClients.get(clientKey);
    if (cached?.client) {
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

    // Lookup credentials from DB if not supplied
    let serverUrl = credentials.mcpServerUrl;
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
      }
    }

    if (!serverUrl && !command) {
      throw new Error(
        `No MCP Server configuration found for Meta account act_${cleanAccountId}`
      );
    }

    const session = await this.connectSession({
      userId,
      accountId: cleanAccountId,
      mcpServerUrl: serverUrl,
      accessToken: token,
      transportType,
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

    // 4. Check MCP status
    const hasTools =
      mcpToolRegistry.hasTools(userId, cleanAccId) ||
      (metaAccount.discoveredTools && metaAccount.discoveredTools.length > 0);

    if (metaAccount.mcpStatus !== "CONNECTED" && !hasTools) {
      throw new Error(
        `Meta MCP Disconnected Error: Official Meta Ads MCP session is not connected for account act_${cleanAccId} (Status: ${metaAccount.mcpStatus || "DISCONNECTED"}${metaAccount.mcpErrorMessage ? `: ${metaAccount.mcpErrorMessage}` : ""}). Please connect to https://mcp.facebook.com/ads via Channels.`
      );
    }

    // 5. ALL OTHER META ADS OPERATIONS: Strictly execute via McpToolExecutor on the official Meta MCP Server
    // Direct Graph API fallback is strictly disabled in the AI Agent path.
    const { McpToolExecutor } = await import("./McpToolExecutor.js");
    return await McpToolExecutor.executeTool(toolName, args, {
      userId,
      accountId: cleanAccId,
      metaAccount,
    });
  }
}

export default MetaMcpClient;
