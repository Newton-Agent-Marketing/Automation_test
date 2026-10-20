import MetaAccount from "../models/metaAccount.js";
import GoogleAccount from "../models/googleAccountModel.js";
import GoogleCampaign from "../models/googleCampaignModel.js";
import GoogleInsight from "../models/googleInsightModel.js";
import User from "../models/authModel.js";
import ConnectedChannel from "../models/connectedChannelModel.js";
import { MetaApiService } from "../services/meta/metaApiService.js";
import { MetaSyncPipeline } from "../services/meta/metaSyncPipe.js";
import { MetaMcpClient } from "../services/mcp/metaMcpClient.js";
import { GoogleApiService } from "../services/google/googleApiService.js";
import { GoogleSyncPipeline } from "../services/google/googleSyncPipe.js";
import { GoogleMcpClient, GOOGLE_MCP_TOOLS } from "../services/mcp/googleMcpClient.js";

// Catalog of tools enabled when Meta Ads channel is connected
const META_MCP_TOOLS = [
  {
    id: "create_meta_campaign",
    name: "Create Meta Ad Campaign",
    description:
      "Directly launch or draft advertising campaigns on Meta Ads (Facebook & Instagram) with budgets, objectives, and targeting.",
    type: "REAL_TIME_MCP",
    category: "Campaign Management",
    capabilities: ["create_campaign", "set_daily_budget", "set_objective"],
    status: "ACTIVE",
  },
  {
    id: "update_meta_campaign",
    name: "Manage Campaign Status & Budget",
    description: "Update campaign status (ACTIVE, PAUSED), adjust daily budgets, or rename active ad sets.",
    type: "REAL_TIME_MCP",
    category: "Campaign Management",
    capabilities: ["pause_campaign", "resume_campaign", "update_budget"],
    status: "ACTIVE",
  },
  {
    id: "fetch_live_meta_ads_mcp",
    name: "Live Meta Ads MCP Tool",
    description:
      "Fetches real-time today insights (spend, clicks, ROAS) and active campaign statuses directly from Meta without DB delay.",
    type: "REAL_TIME_MCP",
    category: "Meta Ads",
    capabilities: ["get_live_today_insights", "get_live_campaigns_status"],
    status: "ACTIVE",
  },
  {
    id: "query_database_metrics",
    name: "Historical Ads Metrics Query",
    description:
      "Deep queries over 7-day/30-day historical campaign metrics, purchases, CTR, and aggregated spend trends.",
    type: "DATABASE_MCP",
    category: "Analytics",
    capabilities: ["daily_trends", "campaign_breakdowns", "roas_analysis"],
    status: "ACTIVE",
  },
  {
    id: "meta_sync_pipeline",
    name: "Automated Data Sync Pipeline",
    description:
      "Scheduled & on-demand sync engine keeping MongoDB in sync with latest Meta Graph API records.",
    type: "PIPELINE",
    category: "Synchronization",
    capabilities: ["manual_sync", "cron_sync"],
    status: "ACTIVE",
  },
  {
    id: "claude_agent_strategy",
    name: "Newton Ads Claude Agent",
    description:
      "Autonomous Claude-powered marketing specialist providing creative suggestions, ad hooks, budget scaling, and audience insights.",
    type: "AI_AGENT",
    category: "AI Optimization",
    capabilities: ["ad_copy_generation", "performance_diagnostics", "targeting_advisor", "create_campaigns"],
    status: "ACTIVE",
  },
];

export function ensureGoogleAccountHierarchy(googleAcc) {
  if (!googleAcc) return googleAcc;

  const currentAccounts = Array.isArray(googleAcc.accounts) ? [...googleAcc.accounts] : [];
  const rawAccountId = String(googleAcc.accountId || "").replace(/[^0-9]/g, "");

  if (googleAcc.isManager) {
    if (!googleAcc.managerCustomerId && rawAccountId) googleAcc.managerCustomerId = rawAccountId;
    if (!googleAcc.managerAccountId && rawAccountId) googleAcc.managerAccountId = rawAccountId;
    if (!googleAcc.selectedCustomerId || googleAcc.selectedCustomerId === rawAccountId) {
      const firstChild = currentAccounts.find((a) => !a.isManager && a.customerId);
      if (firstChild) {
        googleAcc.selectedCustomerId = firstChild.customerId;
      }
    }
  }

  googleAcc.accounts = currentAccounts;
  return googleAcc;
}

export class ChannelController {
  // 1. Get Channel Status & Overview
  static async getChannelStatus(req, res) {
    try {
      const userId = req.user._id;

      let [metaAccounts, googleAccounts, otherConnected] = await Promise.all([
        MetaAccount.find({ userId, isActive: true }).lean(),
        GoogleAccount.find({ userId, isActive: true }).lean(),
        ConnectedChannel.find({ userId, isConnected: true }).lean(),
      ]);

      googleAccounts = googleAccounts.map((g) => ensureGoogleAccountHierarchy(g));

      if (googleAccounts.length > 0) {
        const masterAcc = googleAccounts.find((g) => g.isManager) || googleAccounts[0];
        const enriched = ensureGoogleAccountHierarchy(masterAcc);
        if (enriched?.accounts && enriched.accounts.length > 0) {
          for (const child of enriched.accounts) {
            const cId = child.customerId;
            const exists = googleAccounts.some((g) => g.accountId === cId);
            if (!exists && masterAcc.accessToken) {
              const isMgr = Boolean(child.isManager);
              const parentMgr = isMgr ? null : (child.parentCustomerId || masterAcc.managerCustomerId || masterAcc.accountId || null);
              await GoogleAccount.findOneAndUpdate(
                { userId, accountId: cId },
                {
                  $set: {
                    userId,
                    accountId: cId,
                    accountName: child.name,
                    managerCustomerId: parentMgr,
                    managerAccountId: parentMgr,
                    selectedCustomerId: isMgr ? (masterAcc.selectedCustomerId || cId) : cId,
                    googleEmail: masterAcc.googleEmail || "",
                    isManager: isMgr,
                    accounts: enriched.accounts,
                    accessToken: masterAcc.accessToken,
                    refreshToken: masterAcc.refreshToken,
                    developerToken: masterAcc.developerToken || process.env.GOOGLE_DEVELOPER_TOKEN || "",
                    currency: child.currencyCode || "INR",
                    timezoneName: child.timeZone || "Asia/Kolkata",
                    accountStatus: child.status === "Setup in progress" ? 2 : 1,
                    mcpServerUrl: masterAcc.mcpServerUrl || "",
                    authType: masterAcc.authType || "OAUTH",
                    isActive: masterAcc.isActive,
                    isConnected: masterAcc.isConnected,
                    syncStatus: "IDLE",
                  },
                },
                { upsert: true, setDefaultsOnInsert: true }
              ).catch(() => {});
            }
          }
          googleAccounts = await GoogleAccount.find({ userId, isActive: true }).lean();
        }
      }

      // Dynamically resolve active Meta account using user's saved preferences
      const userDoc = await User.findById(userId).select("dashboardSettings").lean();
      const userSelectedAccId = userDoc?.dashboardSettings?.accountId || null;

      let activeMetaAccount = null;
      if (userSelectedAccId && metaAccounts.length > 0) {
        const cleanPrefId = userSelectedAccId.startsWith("act_") ? userSelectedAccId : `act_${userSelectedAccId}`;
        const rawPrefId = userSelectedAccId.replace(/^act_/, "");
        activeMetaAccount = metaAccounts.find(
          (a) => a.accountId === userSelectedAccId || a.accountId === cleanPrefId || a.accountId === rawPrefId
        ) || null;
      }
      if (!activeMetaAccount) {
        activeMetaAccount = metaAccounts[0] || null;
      }

      const isMetaConnected = Boolean(
        metaAccounts.length > 0 &&
        metaAccounts.some((a) => a.accountId && a.accessToken && a.accessToken.trim() !== "")
      );

      const activeGoogleAccount = googleAccounts[0] || null;
      const isGoogleConnected = Boolean(
        googleAccounts.length > 0 &&
        googleAccounts.some((a) => a.accountId && a.accessToken && a.accessToken.trim() !== "")
      );

      const connectedMap = {};
      otherConnected.forEach((item) => {
        const isItemConnected = Boolean(
          item.isConnected &&
            item.accountId &&
            item.accessToken &&
            item.accessToken.trim() !== ""
        );
        if (isItemConnected) {
          connectedMap[item.channelId] = {
            channelId: item.channelId,
            channelName: item.channelName,
            accountId: item.accountId,
            accountName: item.accountName,
            isConnected: true,
            connectedAt: item.updatedAt,
          };
        }
      });

      const rawList = [
        ...metaAccounts.map((a) => ({
          id: "meta",
          channelId: "meta",
          name: "Meta Ads",
          icon: "meta",
          accountName: a.accountName || "Meta Ads Account",
          accountId: a.accountId || "",
          currency: a.currency || "INR",
          syncStatus: a.syncStatus || "IDLE",
          lastSyncedAt: a.lastSyncedAt,
          mcpServerUrl: a.mcpServerUrl || "",
          authType: a.authType || "TOKEN",
        })),
        ...googleAccounts.flatMap((a) => {
          if (a.accounts && a.accounts.length > 0) {
            return a.accounts.map((child) => ({
              id: "google",
              channelId: "google",
              name: "Google Ads",
              icon: "google",
              accountName: child.name || `${a.accountName} - ${child.customerId}`,
              accountId: child.customerId,
              currency: child.currencyCode || a.currency || "INR",
              isManager: child.isManager,
              managerAccountId: child.parentCustomerId,
              parentCustomerId: child.parentCustomerId,
              level: child.level,
              syncStatus: a.syncStatus || "IDLE",
              lastSyncedAt: a.lastSyncedAt,
              mcpServerUrl: a.mcpServerUrl || "",
              authType: a.authType || "TOKEN",
            }));
          }
          return [{
            id: "google",
            channelId: "google",
            name: "Google Ads",
            icon: "google",
            accountName: a.accountName || "Google Ads Account",
            accountId: a.accountId || "",
            currency: a.currency || "INR",
            isManager: a.isManager || false,
            managerAccountId: a.managerCustomerId || a.managerAccountId || null,
            level: 0,
            syncStatus: a.syncStatus || "IDLE",
            lastSyncedAt: a.lastSyncedAt,
            mcpServerUrl: a.mcpServerUrl || "",
            authType: a.authType || "TOKEN",
          }];
        }),
        ...otherConnected
          .filter((ch) => ch.channelId !== "meta" && ch.channelId !== "google")
          .map((ch) => ({
            id: ch.channelId,
            channelId: ch.channelId,
            name: ch.channelName,
            icon: ch.channelId,
            accountName: ch.accountName || `${ch.channelName} Account`,
            accountId: ch.accountId || "",
          })),
      ];

      const seenKeys = new Set();
      const deduplicatedConnectedList = [];
      for (const item of rawList) {
        const key = `${item.channelId}_${item.accountId}`;
        if (item.accountId && !seenKeys.has(key)) {
          seenKeys.add(key);
          deduplicatedConnectedList.push(item);
        }
      }

      const seenPlatformKeys = new Set();
      const connectedPlatforms = [];
      for (const item of deduplicatedConnectedList) {
        const pKey = item.channelId || item.id;
        if (pKey && !seenPlatformKeys.has(pKey)) {
          seenPlatformKeys.add(pKey);
          connectedPlatforms.push({
            id: pKey,
            channelId: pKey,
            name: pKey === "meta" ? "Meta Ads" : pKey === "google" ? "Google Ads" : item.name,
            icon: pKey,
          });
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          selectedChannel: isMetaConnected ? "Meta Ads" : isGoogleConnected ? "Google Ads" : null,
          connectedMap,
          connectedPlatforms,
          connectedList: deduplicatedConnectedList,
          channels: {
            metaAds: {
              id: "meta_ads",
              name: "Meta Ads (Facebook & Instagram)",
              isConnected: isMetaConnected,
              connectedAccountsCount: metaAccounts.length,
              accounts: metaAccounts.map((a) => ({
                accountId: a.accountId,
                accountName: a.accountName,
                currency: a.currency,
                timezoneName: a.timezoneName,
                spendCap: a.spendCap,
                amountSpent: a.amountSpent,
                syncStatus: a.syncStatus,
                lastSyncedAt: a.lastSyncedAt,
                mcpServerUrl: a.mcpServerUrl,
                authType: a.authType,
                isActive: a.isActive,
                isConnected: a.isConnected,
              })),
              mcpServerUrl: activeMetaAccount?.mcpServerUrl || "",
              authType: activeMetaAccount?.authType || "TOKEN",
              activeAccount: activeMetaAccount
                ? {
                    accountId: activeMetaAccount.accountId,
                    accountName: activeMetaAccount.accountName,
                    currency: activeMetaAccount.currency,
                    timezoneName: activeMetaAccount.timezoneName,
                    spendCap: activeMetaAccount.spendCap,
                    amountSpent: activeMetaAccount.amountSpent,
                    syncStatus: activeMetaAccount.syncStatus,
                    lastSyncedAt: activeMetaAccount.lastSyncedAt,
                    mcpServerUrl: activeMetaAccount.mcpServerUrl,
                  }
                : null,
              availableTools: isMetaConnected ? META_MCP_TOOLS : [],
            },
            googleAds: {
              id: "google_ads",
              name: "Google Ads",
              isConnected: isGoogleConnected,
              connectedAccountsCount: googleAccounts.length,
              managerCustomerId: activeGoogleAccount?.managerCustomerId || activeGoogleAccount?.managerAccountId || null,
              selectedCustomerId: activeGoogleAccount?.selectedCustomerId || (activeGoogleAccount?.accounts?.find(a => !a.isManager)?.customerId) || activeGoogleAccount?.accountId || null,
              hierarchyAccounts: activeGoogleAccount?.accounts || [],
              accounts: (activeGoogleAccount?.accounts && activeGoogleAccount.accounts.length > 0)
                ? activeGoogleAccount.accounts.map((a) => ({
                    accountId: a.customerId,
                    customerId: a.customerId,
                    accountName: a.name,
                    currency: a.currencyCode,
                    timezoneName: a.timeZone,
                    status: a.status,
                    isManager: a.isManager,
                    managerAccountId: a.parentCustomerId,
                    parentCustomerId: a.parentCustomerId,
                    level: a.level,
                    isActive: isGoogleConnected,
                    isConnected: isGoogleConnected,
                  }))
                : googleAccounts.map((a) => ({
                    accountId: a.accountId,
                    customerId: a.accountId,
                    accountName: a.accountName,
                    currency: a.currency,
                    timezoneName: a.timezoneName,
                    spendCap: a.spendCap,
                    amountSpent: a.amountSpent,
                    syncStatus: a.syncStatus,
                    lastSyncedAt: a.lastSyncedAt,
                    mcpServerUrl: a.mcpServerUrl,
                    authType: a.authType,
                    isManager: a.isManager || false,
                    managerAccountId: a.managerCustomerId || a.managerAccountId || null,
                    isActive: a.isActive,
                    isConnected: a.isConnected,
                  })),
              mcpServerUrl: activeGoogleAccount?.mcpServerUrl || "",
              authType: activeGoogleAccount?.authType || "TOKEN",
              activeAccount: (() => {
                if (!activeGoogleAccount) return null;
                const effectiveChildId =
                  activeGoogleAccount.selectedCustomerId ||
                  activeGoogleAccount.accounts?.find((a) => !a.isManager)?.customerId ||
                  activeGoogleAccount.accountId;

                const childAccObj = activeGoogleAccount.accounts?.find(
                  (a) => a.customerId === effectiveChildId
                );

                return {
                  accountId: effectiveChildId,
                  customerId: effectiveChildId,
                  accountName: childAccObj?.name || activeGoogleAccount.accountName,
                  currency: childAccObj?.currencyCode || activeGoogleAccount.currency,
                  timezoneName: childAccObj?.timeZone || activeGoogleAccount.timezoneName,
                  spendCap: activeGoogleAccount.spendCap,
                  amountSpent: activeGoogleAccount.amountSpent,
                  syncStatus: activeGoogleAccount.syncStatus,
                  lastSyncedAt: activeGoogleAccount.lastSyncedAt,
                  mcpServerUrl: activeGoogleAccount.mcpServerUrl,
                  isManager: childAccObj ? Boolean(childAccObj.isManager) : false,
                  managerCustomerId: activeGoogleAccount.managerCustomerId || activeGoogleAccount.managerAccountId || null,
                  selectedCustomerId: effectiveChildId,
                };
              })(),
              availableTools: isGoogleConnected ? GOOGLE_MCP_TOOLS : [],
            },
            spotify: {
              id: "spotify",
              name: "Spotify Ads",
              isConnected: Boolean(connectedMap["spotify"]),
              accountName: connectedMap["spotify"]?.accountName || null,
              accounts: otherConnected.filter((ch) => ch.channelId === "spotify"),
            },
            linkedin: {
              id: "linkedin",
              name: "LinkedIn Ads",
              isConnected: Boolean(connectedMap["linkedin"]),
              accountName: connectedMap["linkedin"]?.accountName || null,
              accounts: otherConnected.filter((ch) => ch.channelId === "linkedin"),
            },
            twitter: {
              id: "twitter",
              name: "Twitter/X Ads",
              isConnected: Boolean(connectedMap["twitter"]),
              accountName: connectedMap["twitter"]?.accountName || null,
              accounts: otherConnected.filter((ch) => ch.channelId === "twitter"),
            },
            tiktok: {
              id: "tiktok",
              name: "TikTok Ads",
              isConnected: Boolean(connectedMap["tiktok"]),
              accountName: connectedMap["tiktok"]?.accountName || null,
              accounts: otherConnected.filter((ch) => ch.channelId === "tiktok"),
            },
            snapchat: {
              id: "snapchat",
              name: "Snapchat Ads",
              isConnected: Boolean(connectedMap["snapchat"]),
              accountName: connectedMap["snapchat"]?.accountName || null,
              accounts: otherConnected.filter((ch) => ch.channelId === "snapchat"),
            },
          },
        },
      });
    } catch (error) {
      console.error("[Get Channel Status Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch channel connection status",
        error: error.message,
      });
    }
  }

  // 2. Generate Meta OAuth Authorization URL
  static async getMetaOAuthUrl(req, res) {
    try {
      const {mcpServerUrl, redirectUri } = req.query;
      // console.log(redirectUri)
      const userId = req.user?._id;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "Channel id is required",
        });
      }

      const stateObj = {
        userId: req.user._id.toString(),
        timestamp: Date.now(),
        mcpServerUrl: mcpServerUrl || "https://facebook.com",
      };
      const state = Buffer.from(JSON.stringify(stateObj)).toString("base64");

      const scopes = [
        "ads_management",
        "ads_read",
        "business_management",
      ];

      if (!process.env.META_APP_ID || process.env.META_APP_ID === "undefined" || process.env.META_APP_ID.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "META_APP_ID is not configured in backend/.env. Please add your Meta/Facebook App ID from developers.facebook.com to backend/.env (META_APP_ID=your_app_id).",
        });
      }

      const targetRedirect = `${(redirectUri || process.env.META_REDIRECT_URI || "https://automation-test-97z6.onrender.com/oauth/callback").trim()}`;

      const graphVersion = process.env.META_GRAPH_VERSION || "v24.0";
      const oauthUrl = `https://www.facebook.com/${graphVersion}/dialog/oauth?` +
        `client_id=${process.env.META_APP_ID.trim()}` +
        `&redirect_uri=${encodeURIComponent(targetRedirect)}` +
        `&state=${state}` +
        `&scope=${scopes.join(",")}` +
        `&response_type=code` +
        `&extras=${encodeURIComponent(JSON.stringify({ setup: { asset_types: ["AD_ACCOUNT"] } }))}`;
      console.log("\n==========================================");
      console.log("[Backend Meta OAuth 1] Generating OAuth Dialog URL");
      console.log("-> App ID:", process.env.META_APP_ID);
      console.log("-> Target Redirect URI:", targetRedirect);
      console.log("-> State Payload:", stateObj);
      console.log("-> Full OAuth URL:", oauthUrl);
      console.log("==========================================\n");

      return res.status(200).json({
        success: true,
        data: {
          oauthUrl,
          state,
          requiresAuth: true,
        },
      });
    } catch (error) {
      console.error("[Get Meta OAuth URL Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to generate Meta OAuth URL",
        error: error.message,
      });
    }
  }

  // 3. Handle Meta OAuth Callback & Exchange Code for Access Token (Step 8-12)
  static async handleMetaOAuthCallback(req, res) {
    try {
      const code = req.body?.code || req.query?.code;
      const state = req.body?.state || req.query?.state;
      const redirectUri = req.body?.redirectUri || process.env.META_REDIRECT_URI;
      let userId = req.user?._id;
      let mcpServerUrl = req.body?.mcpServerUrl;

      console.log("\n==========================================");
      console.log("[Backend Meta OAuth 3] Callback Received");
      console.log("-> Code:", code ? `${code.slice(0, 15)}...` : "MISSING");
      console.log("-> State:", state);
      console.log("-> Redirect URI:", redirectUri);
      console.log("-> User ID:", userId);
      console.log("==========================================\n");

      if (!code) {
        return res.status(400).json({
          success: false,
          message: "Authentication Error: Authorization code is missing",
        });
      }

      // Extract userId and mcpServerUrl from state if available
      if (state) {
        try {
          const parsed = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
          if (!userId && parsed.userId) userId = parsed.userId;
          if (!mcpServerUrl && parsed.mcpServerUrl) mcpServerUrl = parsed.mcpServerUrl;
        } catch (stateErr) {
          console.warn("[State Parse Warning]:", stateErr.message);
        }
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID could not be identified from session or state",
        });
      }

      console.log("[Backend Meta OAuth 4] Exchanging Code for Token with Meta Graph API...");
      // Exchange authorization code for access token
      const tokenData = await MetaApiService.exchangeCodeForToken({
        clientId: process.env.META_APP_ID,
        redirectUri: redirectUri,
        clientSecret: process.env.META_APP_SECRET,
        code: code,
      });

      const accessToken = tokenData.access_token;
      if (!accessToken) {
        throw new Error("Failed to obtain access token from Meta authorization code");
      }

      console.log("[Backend Meta OAuth 5] Token Received successfully! Fetching Long-Lived Token & User Profile...");
      // Fetch long-lived token
      const longLived = await MetaApiService.getLongLivedToken({ accessToken });
      const finalToken = longLived?.access_token || accessToken;

      console.log("\n==========================================");
      console.log("🔑 [Meta OAuth Access Token Debug Log]");
      console.log("-> Short-Lived Token Received : [REDACTED]");
      console.log("-> Long-Lived Token in Use     : [REDACTED]");
      console.log("-> Token Length              :", finalToken ? finalToken.length : 0);
      console.log("==========================================\n");

      // Verify token and fetch profile
      let profile = { id: `meta_usr_${Date.now()}`, name: "Meta User" };
      try {
        profile = await MetaApiService.verifyAccessToken(finalToken);
        console.log("-> Verified Meta User Profile:", profile.name, `(${profile.id})`);
      } catch (err) {
        console.warn("[Meta Profile Fetch Warning]:", err.message);
      }

      console.log("[Backend Meta OAuth 6] Querying Meta Graph API /me/adaccounts for real ad accounts...");
      // Fetch ad accounts from Meta Graph API
      let rawAccounts = [];
      try {
        rawAccounts = await MetaApiService.getUserAdAccounts(finalToken);
        console.log(`-> Fetched ${rawAccounts.length} real Meta Ad Account(s) from Facebook Graph API.`);
      } catch (err) {
        console.warn("[Meta Ad Accounts Fetch Warning]:", err.message);
      }

      // Cache temporary accounts for selection if needed
      global.tempMetaOauthCache = global.tempMetaOauthCache || {};
      global.tempMetaOauthCache[userId] = {
        accessToken: finalToken,
        mcpServerUrl: mcpServerUrl || "",
        adAccounts: rawAccounts,
      };

      const defaultFallbackAccount = {
        id: `act_${profile.id || Date.now()}`,
        name: `${profile.name || "Meta"}'s Ad Account`,
        currency: "USD",
      };
      const accountsToSave = rawAccounts.length > 0 ? rawAccounts : [defaultFallbackAccount];
      const savedAccounts = [];

      for (const raw of accountsToSave) {
        const rawId = raw.id || raw.account_id || `act_${Date.now()}`;
        const cleanId = rawId.startsWith("act_") ? rawId : `act_${rawId}`;
        const cleanName = raw.name || `${profile.name || "Meta"}'s Ad Account`;
        const currency = raw.currency || "USD";
        const timezoneName = raw.timezone_name || "UTC";
        const spendCap = Number(raw.spend_cap || 0);
        const amountSpent = Number(raw.amount_spent || 0);
        const isConnected = Boolean(cleanId && finalToken && finalToken.trim() !== "");

        const account = await MetaAccount.findOneAndUpdate(
          { userId, accountId: cleanId },
          {
            $set: {
              userId,
              accountId: cleanId,
              accountName: cleanName,
              accessToken: finalToken,
              currency,
              timezoneName,
              accountStatus: raw.account_status || 1,
              spendCap,
              amountSpent,
              businessName: raw.business_name || null,
              mcpServerUrl: mcpServerUrl || "",
              authType: "OAUTH",
              isActive: isConnected,
              isConnected: isConnected,
              syncStatus: "IDLE",
            },
          },
          { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
        );

        if (account) {
          savedAccounts.push(account);
        }

        try {
          await ConnectedChannel.findOneAndUpdate(
            { userId, channelId: "meta", accountId: cleanId },
            {
              $set: {
                userId,
                channelId: "meta",
                channelName: "Meta Ads",
                accountId: cleanId,
                accountName: cleanName,
                accessToken: finalToken,
                currency,
                isConnected: isConnected,
                config: { mcpServerUrl, authType: "OAUTH" },
              },
            },
            { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
          );

          if (account?._id) {
            await User.findByIdAndUpdate(userId, { $addToSet: { metaAccounts: account._id } }).catch(() => {});
          }
        } catch (linkErr) {
          console.warn("[Link Channel Warning]:", linkErr.message);
        }

        // Trigger initial background sync for each account
        MetaSyncPipeline.syncAccount(cleanId).catch((syncErr) => {
          console.warn(`[Initial Sync Background Warning for ${cleanId}]:`, syncErr.message);
        });
      }

      const primarySaved = savedAccounts[0] || accountsToSave[0] || {};

      return res.status(200).json({
        success: true,
        message: `Successfully connected ${savedAccounts.length || accountsToSave.length} Meta Ads account(s) via OAuth & MCP Server!`,
        data: {
          account: {
            accountId: primarySaved.accountId || primarySaved.id,
            accountName: primarySaved.accountName || primarySaved.name,
            currency: primarySaved.currency || "USD",
            timezoneName: primarySaved.timezoneName || "UTC",
            isActive: true,
            mcpServerUrl: primarySaved.mcpServerUrl || mcpServerUrl || "",
          },
          channel: "Meta Ads",
          connectedCount: savedAccounts.length || accountsToSave.length,
          enabledTools: META_MCP_TOOLS,
          availableAccounts: rawAccounts,
        },
      });
    } catch (error) {
      console.error("[Meta OAuth Callback Error]:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to complete Meta OAuth authorization",
        error: error.message,
      });
    }
  }

  // 4. Connect to Meta Ads MCP Server URL (Step 1-3 & 12)
  static async connectMcpServer(req, res) {
    try {
      const userId = req.user._id;
      const { mcpServerUrl, accountName, accountId } = req.body;

      if (!mcpServerUrl) {
        return res.status(400).json({
          success: false,
          message: "MCP Server URL is required",
        });
      }

      // Ping/validate MCP Server URL
      const mcpHealth = await MetaMcpClient.pingMcpServer(mcpServerUrl);

      // Check if user already has an active Meta account in DB
      let existingAccount = await MetaAccount.findOne({ userId, isActive: true });

      const cleanAccountId = accountId
        ? accountId.startsWith("act_")
          ? accountId
          : `act_${accountId}`
        : existingAccount?.accountId || `act_mcp_${Date.now().toString().slice(-6)}`;

      const cleanAccountName =
        accountName || existingAccount?.accountName || "Meta Ads MCP Primary Account";

      const effectiveToken =
        existingAccount?.accessToken || `mcp_active_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const isConnected = Boolean(cleanAccountId && effectiveToken && effectiveToken.trim() !== "");

      // Upsert MetaAccount with MCP Server configuration
      const updatedAccount = await MetaAccount.findOneAndUpdate(
        { userId, isActive: true },
        {
          $set: {
            userId,
            accountId: cleanAccountId,
            accountName: cleanAccountName,
            accessToken: effectiveToken,
            currency: existingAccount?.currency || "INR",
            timezoneName: existingAccount?.timezoneName || "Asia/Kolkata",
            accountStatus: existingAccount?.accountStatus || 1,
            spendCap: existingAccount?.spendCap || 50000,
            amountSpent: existingAccount?.amountSpent || 0,
            businessName: existingAccount?.businessName || "MCP Connected Enterprise",
            mcpServerUrl,
            authType: "MCP_SERVER",
            isActive: isConnected,
            isConnected: isConnected,
            syncStatus: "IDLE",
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );

      // Connect channel model
      await Promise.all([
        User.findByIdAndUpdate(userId, { $addToSet: { metaAccounts: updatedAccount._id } }),
        ConnectedChannel.findOneAndUpdate(
          { userId, channelId: "meta" },
          {
            $set: {
              userId,
              channelId: "meta",
              channelName: "Meta Ads",
              accountId: updatedAccount.accountId,
              accountName: updatedAccount.accountName,
              accessToken: effectiveToken,
              currency: updatedAccount.currency || "INR",
              isConnected: isConnected,
              config: { mcpServerUrl, authType: "MCP_SERVER" },
            },
          },
          { upsert: true, returnDocument: "after" }
        ),
      ]);

      return res.status(200).json({
        success: true,
        requiresAuth: false,
        message: `Successfully connected to Meta Ads MCP Server (${mcpServerUrl}) and activated all tools!`,
        data: {
          mcpServerUrl,
          mcpHealth,
          account: updatedAccount,
          channel: "Meta Ads",
          enabledTools: META_MCP_TOOLS,
        },
      });
    } catch (error) {
      console.error("[Connect MCP Server Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to connect to Meta MCP server",
        error: error.message,
      });
    }
  }

  // 5. Fetch all Meta Ad Accounts accessible with provided Token
  static async fetchMetaAdAccounts(req, res) {
    try {
      const { accessToken } = req.body;

      if (!accessToken) {
        return res.status(400).json({
          success: false,
          message: "Meta Access Token is required",
        });
      }

      const profile = await MetaApiService.verifyAccessToken(accessToken);
      const rawAccounts = await MetaApiService.getUserAdAccounts(accessToken);

      const accounts = rawAccounts.map((acc) => ({
        id: acc.id,
        accountId: acc.account_id || acc.id.replace("act_", ""),
        fullAccountId: acc.id.startsWith("act_") ? acc.id : `act_${acc.id}`,
        name: acc.name,
        currency: acc.currency,
        timezoneName: acc.timezone_name,
        accountStatus: acc.account_status,
        businessName: acc.business_name || null,
        amountSpent: acc.amount_spent ? Number(acc.amount_spent) / 100 : 0,
      }));

      return res.status(200).json({
        success: true,
        message: `Found ${accounts.length} ad accounts for ${profile.name || "user"}`,
        profile: {
          id: profile.id,
          name: profile.name,
        },
        data: accounts,
      });
    } catch (error) {
      console.error("[Fetch Meta Ad Accounts Error]:", error);
      return res.status(400).json({
        success: false,
        message:
          error.response?.data?.error?.message ||
          error.message ||
          "Failed to verify Meta Access Token or fetch Ad Accounts",
      });
    }
  }

  // 6. Connect & Save Meta Ad Account directly
  static async connectMetaAccount(req, res) {
    try {
      const userId = req.user._id;
      const { accountId, accessToken, accountName, currency, timezoneName, mcpServerUrl } = req.body;

      if (!accountId || !accessToken) {
        return res.status(400).json({
          success: false,
          message: "Both accountId and accessToken are required",
        });
      }

      const cleanId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

      let metaDetails = null;
      try {
        metaDetails = await MetaApiService.getAccountDetails(cleanId, accessToken);
      } catch (err) {
        console.warn("[Meta Connect Warning] Could not fetch remote details, saving provided details.");
      }

      const finalAccountName =
        metaDetails?.name || accountName || `Meta Account (${cleanId})`;
      const finalCurrency = metaDetails?.currency || currency || "INR";
      const finalTimezone = metaDetails?.timezone_name || timezoneName || "Asia/Kolkata";
      const isConnected = Boolean(cleanId && accessToken && accessToken.trim() !== "");

      const account = await MetaAccount.findOneAndUpdate(
        { accountId: cleanId },
        {
          $set: {
            userId,
            accountId: cleanId,
            accountName: finalAccountName,
            accessToken,
            currency: finalCurrency,
            timezoneName: finalTimezone,
            accountStatus: metaDetails?.account_status || 1,
            spendCap: metaDetails?.spend_cap ? Number(metaDetails.spend_cap) / 100 : 0,
            amountSpent: metaDetails?.amount_spent ? Number(metaDetails.amount_spent) / 100 : 0,
            businessName: metaDetails?.business_name || null,
            mcpServerUrl: mcpServerUrl || "",
            authType: mcpServerUrl ? "MCP_SERVER" : "TOKEN",
            isActive: isConnected,
            isConnected: isConnected,
            syncStatus: "IDLE",
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );

      await Promise.all([
        User.findByIdAndUpdate(userId, { $addToSet: { metaAccounts: account._id } }),
        ConnectedChannel.findOneAndUpdate(
          { userId, channelId: "meta" },
          {
            $set: {
              userId,
              channelId: "meta",
              channelName: "Meta Ads",
              accountId: cleanId,
              accountName: finalAccountName,
              accessToken,
              currency: finalCurrency,
              isConnected: isConnected,
              config: { mcpServerUrl },
            },
          },
          { upsert: true, returnDocument: "after" }
        ),
      ]);

      MetaSyncPipeline.syncAccount(cleanId).catch((syncErr) => {
        console.error(`[Initial Sync Background Error for ${cleanId}]:`, syncErr.message);
      });

      return res.status(200).json({
        success: true,
        message: `Meta Ads account (${cleanId}) connected successfully!`,
        data: {
          account: {
            accountId: account.accountId,
            accountName: account.accountName,
            currency: account.currency,
            timezoneName: account.timezoneName,
            isActive: account.isActive,
            isConnected: account.isConnected,
            mcpServerUrl: account.mcpServerUrl,
          },
          channel: "Meta Ads",
          enabledTools: META_MCP_TOOLS,
        },
      });
    } catch (error) {
      console.error("[Connect Meta Account Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to connect Meta Ads account",
        error: error.message,
      });
    }
  }

  // 7. Connect Any Generic Marketing Channel
  static async connectGenericChannel(req, res) {
    try {
      const userId = req.user._id;
      const { channelId, channelName, accountId, accountName, apiKey, accessToken, currency, config } = req.body;

      if (!channelId || !channelName) {
        return res.status(400).json({
          success: false,
          message: "channelId and channelName are required",
        });
      }

      if (channelId !== "meta" && channelId !== "google") {
        return res.status(400).json({
          success: false,
          message: `${channelName || channelId} integration is coming soon. Currently only Meta Ads and Google Ads connections are active.`,
        });
      }

      const token = accessToken || apiKey || "";
      const isConnected = Boolean(
        accountId &&
          accountId.trim() !== "" &&
          token &&
          token.trim() !== ""
      );

      const connected = await ConnectedChannel.findOneAndUpdate(
        { userId, channelId },
        {
          $set: {
            userId,
            channelId,
            channelName,
            accountId: accountId || `${channelId}-acc-${Date.now()}`,
            accountName: accountName || `${channelName} Account`,
            apiKey: apiKey || "",
            accessToken: token,
            currency: currency || "INR",
            isConnected: isConnected,
            config: config || {},
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );

      return res.status(200).json({
        success: true,
        message: `${channelName} connected successfully!`,
        data: connected,
      });
    } catch (error) {
      console.error("[Connect Generic Channel Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to connect channel",
        error: error.message,
      });
    }
  }

  // 8. Disconnect Generic Marketing Channel
  static async disconnectGenericChannel(req, res) {
    try {
      const userId = req.user._id;
      const { channelId, accountId } = req.body;

      if (!channelId) {
        return res.status(400).json({
          success: false,
          message: "channelId is required",
        });
      }

      const filter = { userId, channelId };
      if (accountId) filter.accountId = accountId;

      await ConnectedChannel.deleteMany(filter);

      return res.status(200).json({
        success: true,
        message: `Channel account disconnected successfully`,
      });
    } catch (error) {
      console.error("[Disconnect Generic Channel Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to disconnect channel",
        error: error.message,
      });
    }
  }

  // 9. Disconnect Meta Ads Account / Channel
  static async disconnectMetaAccount(req, res) {
    try {
      const userId = req.user._id;
      const { accountId } = req.body;

      if (accountId) {
        const cleanId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
        const updated = await MetaAccount.updateMany(
          { userId, accountId: cleanId },
          { $set: { isActive: false, isConnected: false, accessToken: "" } }
        );
        await ConnectedChannel.deleteMany({ userId, channelId: "meta", accountId: cleanId });

        return res.status(200).json({
          success: true,
          message: `Meta Ads account (${cleanId}) disconnected successfully`,
          modifiedCount: updated.modifiedCount,
        });
      }

      const updated = await MetaAccount.updateMany(
        { userId },
        { $set: { isActive: false, isConnected: false, accessToken: "" } }
      );
      await ConnectedChannel.deleteMany({ userId, channelId: "meta" });

      return res.status(200).json({
        success: true,
        message: "All Meta Ads accounts disconnected successfully",
        modifiedCount: updated.modifiedCount,
      });
    } catch (error) {
      console.error("[Disconnect Meta Account Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to disconnect Meta Ads account",
        error: error.message,
      });
    }
  }

  // 9b. Get All Connected Accounts for user (filtered by channel if requested)
  static async getConnectedAccounts(req, res) {
    try {
      const userId = req.user._id;
      const { channelId } = req.query;

      let metaList = [];
      let googleList = [];
      let otherList = [];

      if (!channelId || channelId === "meta" || channelId === "meta_ads" || channelId.toLowerCase().includes("meta")) {
        metaList = await MetaAccount.find({ userId, isActive: true }).lean();
      }
      if (!channelId || channelId === "google" || channelId === "google_ads" || channelId.toLowerCase().includes("google")) {
        googleList = await GoogleAccount.find({ userId, isActive: true }).lean();
      }
      if (!channelId || (channelId !== "meta" && channelId !== "google")) {
        const query = { userId, isConnected: true };
        if (channelId) query.channelId = channelId;
        otherList = await ConnectedChannel.find(query).lean();
      }

      const accounts = [
        ...metaList.map((a) => ({
          channelId: "meta",
          channelName: "Meta Ads",
          accountId: a.accountId,
          accountName: a.accountName,
          currency: a.currency,
          timezoneName: a.timezoneName,
          spendCap: a.spendCap,
          amountSpent: a.amountSpent,
          syncStatus: a.syncStatus,
          lastSyncedAt: a.lastSyncedAt,
          authType: a.authType,
          isActive: a.isActive,
          isConnected: a.isConnected,
        })),
        ...googleList.flatMap((a) => {
          const list = [];
          if (Array.isArray(a.accounts) && a.accounts.length > 0) {
            a.accounts.forEach((child) => {
              list.push({
                channelId: "google",
                channelName: "Google Ads",
                accountId: child.customerId,
                accountName: child.name || `${a.accountName} (${child.customerId})`,
                currency: child.currencyCode || a.currency || "INR",
                timezoneName: child.timeZone || a.timezoneName || "Asia/Kolkata",
                isManager: Boolean(child.isManager),
                managerAccountId: child.parentCustomerId || a.managerCustomerId || a.managerAccountId || null,
                parentCustomerId: child.parentCustomerId || null,
                level: child.level || 0,
                syncStatus: a.syncStatus || "IDLE",
                lastSyncedAt: a.lastSyncedAt,
                authType: a.authType || "TOKEN",
                isActive: a.isActive,
                isConnected: a.isConnected,
              });
            });
          }
          if (a.accountId && !list.some((item) => item.accountId === a.accountId)) {
            list.push({
              channelId: "google",
              channelName: "Google Ads",
              accountId: a.accountId,
              accountName: a.accountName || "Google Ads Account",
              currency: a.currency || "INR",
              timezoneName: a.timezoneName || "Asia/Kolkata",
              spendCap: a.spendCap,
              amountSpent: a.amountSpent,
              syncStatus: a.syncStatus || "IDLE",
              lastSyncedAt: a.lastSyncedAt,
              authType: a.authType || "TOKEN",
              isManager: a.isManager || false,
              managerAccountId: a.managerCustomerId || a.managerAccountId || null,
              isActive: a.isActive,
              isConnected: a.isConnected,
            });
          }
          return list;
        }),
        ...otherList.map((a) => ({
          channelId: a.channelId,
          channelName: a.channelName,
          accountId: a.accountId,
          accountName: a.accountName,
          currency: a.currency || "INR",
          authType: "GENERIC",
          isActive: a.isConnected,
          isConnected: a.isConnected,
        })),
      ];

      const seen = new Set();
      const deduplicatedAccounts = [];
      for (const acc of accounts) {
        const key = `${acc.channelId}_${acc.accountId}`;
        if (acc.accountId && !seen.has(key)) {
          seen.add(key);
          deduplicatedAccounts.push(acc);
        }
      }

      return res.status(200).json({
        success: true,
        data: deduplicatedAccounts,
      });
    } catch (error) {
      console.error("[Get Connected Accounts Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch connected accounts",
        error: error.message,
      });
    }
  }

  // 10. Get List of Available MCP Tools for connected channel
  static async getChannelTools(req, res) {
    try {
      const userId = req.user._id;
      const activeAccount = await MetaAccount.findOne({ userId, isActive: true });

      if (!activeAccount) {
        return res.status(200).json({
          success: true,
          isConnected: false,
          message: "No ad channel currently connected. Connect Meta Ads to unlock tools.",
          tools: [],
        });
      }

      return res.status(200).json({
        success: true,
        isConnected: true,
        channel: "Meta Ads",
        activeAccount: {
          accountId: activeAccount.accountId,
          accountName: activeAccount.accountName,
          mcpServerUrl: activeAccount.mcpServerUrl,
        },
        tools: META_MCP_TOOLS,
      });
    } catch (error) {
      console.error("[Get Channel Tools Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch tools",
        error: error.message,
      });
    }
  }

  // 11. Manual Sync Trigger
  static async triggerAccountSync(req, res) {
    try {
      const userId = req.user?._id;
      let accountId = req.body?.accountId || req.query?.accountId;
      const paramId = req.params?.id;

      console.log(paramId)

      if (!accountId && paramId && paramId !== "meta" && paramId !== "google") {
        accountId = paramId;
      }

      // Sync specific account if requested
      if (accountId && accountId !== "meta" && accountId !== "google") {
        const cleanMetaId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
        const isMeta = await MetaAccount.findOne({ userId, accountId: cleanMetaId, isActive: true });
        if (isMeta) {
          const result = await MetaSyncPipeline.syncAccount(cleanMetaId);
          return res.status(200).json({
            success: true,
            message: `Sync completed successfully for Meta account ${cleanMetaId}`,
            data: result,
          });
        }

        const cleanGId = String(accountId).replace(/[^0-9]/g, "");
        const isGoogle = await GoogleAccount.findOne({
          userId,
          isActive: true,
          $or: [
            { accountId },
            { accountId: cleanGId },
            { selectedCustomerId: accountId },
            { selectedCustomerId: cleanGId },
            { "accounts.customerId": accountId },
            { "accounts.customerId": cleanGId },
          ],
        });
        if (isGoogle) {
          const result = await GoogleSyncPipeline.syncAccount(cleanGId || accountId);
          return res.status(200).json({
            success: true,
            message: `Sync completed successfully for Google account ${accountId}`,
            data: result,
          });
        }
      }

      // Sync all Google accounts
      if (paramId === "google" || accountId === "google") {
        const syncRes = await GoogleSyncPipeline.syncAllAccounts(userId);
        return res.status(200).json({
          success: true,
          message: `Sync completed for Google account hierarchy`,
          data: syncRes,
        });
      }
      // Default: Sync Meta accounts
      const metaAccs = await MetaAccount.find({ userId, isActive: true });
      if (metaAccs && metaAccs.length > 0) {
        const results = [];
        for (const metaAcc of metaAccs) {
          try {
            const resObj = await MetaSyncPipeline.syncAccount(metaAcc.accountId);
            results.push({ accountId: metaAcc.accountId, ...resObj });
          } catch (err) {
            results.push({ accountId: metaAcc.accountId, error: err.message });
          }
        }
        return res.status(200).json({
          success: true,
          message: `Sync completed for ${metaAccs.length} Meta account(s)`,
          data: results,
        });
      }

      return res.status(200).json({
        success: true,
        message: "No active ad accounts found to sync",
        data: [],
      });
    } catch (error) {
      console.error("[Manual Sync Error]:", error);
      return res.status(200).json({
        success: false,
        message: `Sync notice: ${error.message}`,
        error: error.message,
      });
    }
  }

  // 12. Generate Google OAuth Authorization URL
  static async getGoogleOAuthUrl(req, res) {
    try {
      const { mcpServerUrl, redirectUri } = req.query;
      const userId = req.user?._id;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      const stateObj = {
        userId: userId.toString(),
        timestamp: Date.now(),
        mcpServerUrl: mcpServerUrl || "",
        channel: "google",
      };
      const state = Buffer.from(JSON.stringify(stateObj)).toString("base64");
      const targetRedirect =
        redirectUri || process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || "http://localhost:5173"}/channels`;

      const oauthUrl = GoogleApiService.generateOAuthUrl({
        redirectUri: targetRedirect,
        state,
      });

      return res.status(200).json({
        success: true,
        data: {
          oauthUrl,
          state,
          requiresAuth: true,
        },
      });
    } catch (error) {
      console.error("[Get Google OAuth URL Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to generate Google OAuth URL",
        error: error.message,
      });
    }
  }

  // 13. Handle Google OAuth Callback & Exchange Code for Access Token
  static async handleGoogleOAuthCallback(req, res) {
    console.log("\n==================== [Google OAuth Callback Started] ====================");
    try {
      const code = req.body?.code || req.query?.code;
      const state = req.body?.state || req.query?.state;
      const redirectUri = req.body?.redirectUri || process.env.GOOGLE_REDIRECT_URI;
      let userId = req.user?._id;
      let mcpServerUrl = req.body?.mcpServerUrl;

      console.log(`[Google OAuth Debug] Code received: ${code ? `${code.slice(0, 16)}... (length: ${code.length})` : "MISSING"}`);
      console.log(`[Google OAuth Debug] State received: ${state || "NONE"}`);
      console.log(`[Google OAuth Debug] Redirect URI: ${redirectUri}`);

      if (!code) {
        console.error("❌ [Google OAuth Debug] Authorization code is missing!");
        return res.status(400).json({
          success: false,
          message: "Authentication Error: Authorization code is missing",
        });
      }

      if (state) {
        try {
          const parsed = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
          if (!userId && parsed.userId) userId = parsed.userId;
          if (!mcpServerUrl && parsed.mcpServerUrl) mcpServerUrl = parsed.mcpServerUrl;
          console.log(`[Google OAuth Debug] Parsed State: userId=${userId}, mcpServerUrl=${mcpServerUrl}`);
        } catch (stateErr) {
          console.warn("[Google State Parse Warning]:", stateErr.message);
        }
      }

      if (!userId) {
        console.error("❌ [Google OAuth Debug] User ID could not be identified!");
        return res.status(400).json({
          success: false,
          message: "User ID could not be identified",
        });
      }

      console.log(`[Google OAuth Debug] Exchanging code for Tokens with Google Api Service...`);
      const tokenData = await GoogleApiService.exchangeCodeForToken({
        code,
        redirectUri,
      });

      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token || "";

      console.log("-------------------------------------------------------------------------");
      console.log(`🔑 [Google OAuth Debug] REAL ACCESS TOKEN: ${accessToken ? `${accessToken.slice(0, 20)}... (Length: ${accessToken.length})` : "NOT FOUND"}`);
      console.log(`🔑 [Google OAuth Debug] REFRESH TOKEN: ${refreshToken ? `${refreshToken.slice(0, 15)}...` : "NONE (Retaining existing or not returned)"}`);

      let profile = { name: "Google Ads Account" };
      try {
        profile = await GoogleApiService.verifyAccessToken(accessToken);
        console.log(`👤 [Google OAuth Debug] User Profile: Name="${profile.name}", Email="${profile.email}", Sub="${profile.sub}"`);
      } catch (err) {
        console.warn("[Google Profile Fetch]:", err.message);
      }

      let rawAccounts = [];
      try {
        console.log(`[Google OAuth Debug] Fetching Google Ads accounts & hierarchy using access token...`);
        rawAccounts = await GoogleApiService.getUserAdAccounts(
          accessToken,
          process.env.GOOGLE_DEVELOPER_TOKEN
        );
        console.log(`📋 [Google OAuth Debug] Accounts Discovered (${rawAccounts.length}):`, rawAccounts.map(a => `${a.name} (${a.id})`));
      } catch (err) {
        console.warn("[Google Ad Accounts Fetch]:", err.message);
      }

      if (!rawAccounts || rawAccounts.length === 0) {
        const userSub = profile?.sub || (profile?.email ? profile.email.replace(/[^a-zA-Z0-9]/g, "_") : "google_user");
        const singleId = `google_act_${Date.now().toString().slice(-6)}`;
        rawAccounts = [
          {
            id: singleId,
            customerId: singleId,
            account_id: singleId,
            name: `${profile.name || "Google"}'s Ads Account`,
            is_manager: false,
            isManager: false,
            currencyCode: "INR",
            timeZone: "Asia/Kolkata",
            status: "ENABLED",
          },
        ];
      }

      // Build structured accounts hierarchy
      let formattedAccounts = rawAccounts.map((a) => {
        const cleanCId = String(a.customerId || a.id || a.account_id).replace(/[^0-9]/g, "");
        const cleanParentId = a.parentCustomerId || a.manager_id || a.managerAccountId
          ? String(a.parentCustomerId || a.manager_id || a.managerAccountId).replace(/[^0-9]/g, "")
          : null;

        return {
          customerId: cleanCId,
          name: a.name || `Google Ads Account (${cleanCId})`,
          isManager: Boolean(a.is_manager || a.isManager),
          currencyCode: a.currencyCode || a.currency || "INR",
          timeZone: a.timeZone || a.timezone_name || "Asia/Kolkata",
          status: a.status || (a.account_status === 1 ? "ENABLED" : "PAUSED"),
          parentCustomerId: cleanParentId,
          level: typeof a.level === "number" ? a.level : (a.is_manager ? 0 : 1),
        };
      });

      const tempHolder = ensureGoogleAccountHierarchy({
        accountId: rawAccounts[0]?.id || formattedAccounts[0]?.customerId || null,
        accounts: formattedAccounts,
      });
      formattedAccounts = tempHolder.accounts || formattedAccounts;

      const managerAccount = formattedAccounts.find((a) => a.isManager);
      const managerCustomerId = managerAccount ? managerAccount.customerId : null;

      // Select child advertising account (level > 0 or isManager === false)
      const childAccount = formattedAccounts.find((a) => !a.isManager && a.status !== "Setup in progress") || formattedAccounts.find((a) => !a.isManager) || formattedAccounts[0];
      const selectedCustomerId = childAccount ? childAccount.customerId : formattedAccounts[0].customerId;

      // Retain existing refresh token if Google did not return a new one this time
      let effectiveRefreshToken = refreshToken;
      if (!effectiveRefreshToken || effectiveRefreshToken.trim() === "") {
        const existingAcc = await GoogleAccount.findOne({ userId, isActive: true });
        if (existingAcc?.refreshToken) {
          effectiveRefreshToken = existingAcc.refreshToken;
        }
      }

      const masterAccountId = managerCustomerId || selectedCustomerId;

      console.log(`💾 [Google OAuth Debug] Saving Master Connection -> Manager: ${managerCustomerId || "None"}, Selected Child: ${selectedCustomerId}, Total Accounts: ${formattedAccounts.length}`);

      // Preserve all valid child account IDs in database
      const allValidAccountIds = formattedAccounts.map((a) => a.customerId).filter(Boolean);

      await Promise.all([
        GoogleInsight.deleteMany({ userId, accountId: { $nin: allValidAccountIds } }).catch(() => {}),
        GoogleCampaign.deleteMany({ userId, accountId: { $nin: allValidAccountIds } }).catch(() => {}),
      ]);

      const savedAccountsList = [];
      for (const acc of formattedAccounts) {
        const cId = acc.customerId;
        const isMgr = Boolean(acc.isManager);
        const parentMgr = isMgr ? null : (acc.parentCustomerId || managerCustomerId);

        const saved = await GoogleAccount.findOneAndUpdate(
          { userId, accountId: cId },
          {
            $set: {
              userId,
              accountId: cId,
              accountName: acc.name || `Google Ads (${cId})`,
              managerCustomerId: parentMgr,
              managerAccountId: parentMgr,
              selectedCustomerId: isMgr ? (selectedCustomerId || cId) : cId,
              googleEmail: profile?.email || "",
              isManager: isMgr,
              accounts: formattedAccounts,
              accessToken,
              ...(effectiveRefreshToken ? { refreshToken: effectiveRefreshToken } : {}),
              developerToken: process.env.GOOGLE_DEVELOPER_TOKEN || "",
              currency: acc.currencyCode || "INR",
              timezoneName: acc.timeZone || "Asia/Kolkata",
              accountStatus: acc.status === "Setup in progress" ? 2 : 1,
              mcpServerUrl: mcpServerUrl || "",
              authType: "OAUTH",
              isActive: true,
              isConnected: true,
              syncStatus: "IDLE",
            },
          },
          { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
        );
        if (saved) savedAccountsList.push(saved);

        // Also ensure each account is registered in ConnectedChannel
        try {
          await ConnectedChannel.findOneAndUpdate(
            { userId, channelId: "google", accountId: cId },
            {
              $set: {
                userId,
                channelId: "google",
                channelName: "Google Ads",
                accountId: cId,
                accountName: acc.name || `Google Ads (${cId})`,
                accessToken,
                currency: acc.currencyCode || "INR",
                isConnected: true,
                config: {
                  mcpServerUrl,
                  authType: "OAUTH",
                  managerCustomerId: parentMgr,
                  isManager: isMgr,
                  selectedCustomerId: cId,
                },
              },
            },
            { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
          );
        } catch (ccErr) {
          console.warn("[ConnectedChannel Update Warning]:", ccErr.message);
        }
      }

      // Trigger initial background sync for all discovered child accounts
      GoogleSyncPipeline.syncAllAccounts(userId).catch((syncErr) => {
        console.warn("[Google Initial Sync All Background Warning]:", syncErr.message);
      });

      console.log(`🎉 [Google OAuth Callback Completed] Successfully linked ${formattedAccounts.length} account(s) for user ${userId}`);
      console.log("=========================================================================\n");

      // Return clean response without exposing refresh token or secrets
      return res.status(200).json({
        success: true,
        message: `Successfully connected ${formattedAccounts.length} Google Ads account(s)! Active advertising account: ${selectedCustomerId}`,
        data: {
          managerCustomerId,
          selectedCustomerId,
          activeAccount: {
            accountId: selectedCustomerId,
            customerId: selectedCustomerId,
            accountName: childAccount?.name || savedAccount.accountName,
            currency: childAccount?.currencyCode || "INR",
            timezoneName: childAccount?.timeZone || "Asia/Kolkata",
            isManager: false,
            managerCustomerId,
            isActive: true,
            isConnected: true,
          },
          accounts: formattedAccounts,
          channel: "Google Ads",
          connectedCount: formattedAccounts.length,
          enabledTools: GOOGLE_MCP_TOOLS,
        },
      });
    } catch (error) {
      console.error("❌ [Google OAuth Callback Error]:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to complete Google OAuth authorization",
        error: error.message,
      });
    }
  }

  // 13b. Select / Switch Active Google Ads Advertising Customer Account
  static async selectGoogleAccount(req, res) {
    try {
      const userId = req.user?._id;
      const { customerId } = req.body;

      if (!customerId) {
        return res.status(400).json({
          success: false,
          message: "customerId is required to select a Google Ads account",
        });
      }

      const cleanCustomerId = String(customerId).replace(/[^0-9]/g, "");

      const googleAcc = await GoogleAccount.findOne({
        userId,
        isActive: true,
      });

      if (!googleAcc) {
        return res.status(404).json({
          success: false,
          message: "No active Google Ads connection found for this user",
        });
      }

      // Validate that the requested customerId belongs to the user's hierarchy
      const matchingAccount = googleAcc.accounts?.find(
        (a) => a.customerId === cleanCustomerId || a.customerId === customerId
      );

      const isValid = matchingAccount || googleAcc.accountId === cleanCustomerId;
      if (!isValid) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: The selected customer ID does not belong to your connected Google Ads hierarchy",
        });
      }

      googleAcc.selectedCustomerId = cleanCustomerId;
      if (matchingAccount) {
        googleAcc.accountName = matchingAccount.name;
        googleAcc.currency = matchingAccount.currencyCode || googleAcc.currency;
        googleAcc.timezoneName = matchingAccount.timeZone || googleAcc.timezoneName;
      }
      await googleAcc.save();

      await ConnectedChannel.findOneAndUpdate(
        { userId, channelId: "google" },
        {
          $set: {
            accountId: cleanCustomerId,
            accountName: matchingAccount?.name || googleAcc.accountName,
            currency: matchingAccount?.currencyCode || googleAcc.currency,
            isConnected: true,
          },
        },
        { upsert: true }
      );

      console.log(`✅ [Google Account Selection] Switched active customerId to: ${cleanCustomerId}`);

      GoogleSyncPipeline.syncAccount(cleanCustomerId).catch((err) => {
        console.warn(`[Sync Warning after selecting ${cleanCustomerId}]:`, err.message);
      });

      return res.status(200).json({
        success: true,
        message: `Successfully selected Google Ads advertising account: ${matchingAccount?.name || cleanCustomerId}`,
        data: {
          managerCustomerId: googleAcc.managerCustomerId || googleAcc.managerAccountId,
          selectedCustomerId: cleanCustomerId,
          accountName: googleAcc.accountName,
          currency: googleAcc.currency,
          timezoneName: googleAcc.timezoneName,
          accounts: googleAcc.accounts || [],
        },
      });
    } catch (error) {
      console.error("[Select Google Account Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to select Google Ads account",
        error: error.message,
      });
    }
  }

  // 13d. Select / Switch Active Meta Ad Account
  static async selectMetaAccount(req, res) {
    try {
      const userId = req.user?._id;
      const { accountId } = req.body;

      if (!accountId) {
        return res.status(400).json({
          success: false,
          message: "accountId is required to select a Meta Ad Account",
        });
      }

      const cleanId = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;
      const rawId = String(accountId).replace(/^act_/, "");

      const metaAcc = await MetaAccount.findOne({
        userId,
        isActive: true,
        $or: [{ accountId }, { accountId: cleanId }, { accountId: rawId }],
      });

      if (!metaAcc) {
        return res.status(404).json({
          success: false,
          message: `Ad Account "${accountId}" does not belong to your connected Meta accounts`,
        });
      }

      // Persist user dashboard preference
      await User.findByIdAndUpdate(userId, {
        $set: { "dashboardSettings.accountId": metaAcc.accountId },
      });

      // Update active ConnectedChannel state
      await ConnectedChannel.findOneAndUpdate(
        { userId, channelId: "meta" },
        {
          $set: {
            accountId: metaAcc.accountId,
            accountName: metaAcc.accountName,
            currency: metaAcc.currency,
            isConnected: true,
          },
        },
        { upsert: true }
      );

      console.log(`✅ [Meta Account Selection] Switched active Meta Ad Account to: ${metaAcc.accountId} (${metaAcc.accountName})`);

      return res.status(200).json({
        success: true,
        message: `Successfully selected Meta Ad Account: ${metaAcc.accountName} (${metaAcc.accountId})`,
        data: {
          accountId: metaAcc.accountId,
          accountName: metaAcc.accountName,
          currency: metaAcc.currency,
          timezoneName: metaAcc.timezoneName,
        },
      });
    } catch (error) {
      console.error("[Select Meta Account Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to select Meta Ad Account",
        error: error.message,
      });
    }
  }

  // 13c. Get Discovered Google Ads Accounts & Selection State
  static async getGoogleAccounts(req, res) {
    try {
      const userId = req.user?._id;
      let googleAcc = await GoogleAccount.findOne({ userId, isActive: true }).lean();

      if (!googleAcc) {
        return res.status(200).json({
          success: true,
          data: {
            managerCustomerId: null,
            selectedCustomerId: null,
            accounts: [],
          },
        });
      }

      googleAcc = ensureGoogleAccountHierarchy(googleAcc);

      const managerCustomerId = googleAcc.managerCustomerId || googleAcc.managerAccountId || (googleAcc.isManager ? googleAcc.accountId : null);
      const selectedCustomerId = googleAcc.selectedCustomerId || (googleAcc.accounts?.find((a) => !a.isManager)?.customerId) || googleAcc.accountId;

      return res.status(200).json({
        success: true,
        data: {
          managerCustomerId,
          selectedCustomerId,
          accounts: googleAcc.accounts || [
            {
              customerId: googleAcc.accountId,
              name: googleAcc.accountName,
              isManager: googleAcc.isManager,
              currencyCode: googleAcc.currency,
              timeZone: googleAcc.timezoneName,
              status: "ENABLED",
              parentCustomerId: managerCustomerId,
            },
          ],
        },
      });
    } catch (error) {
      console.error("[Get Google Accounts Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch Google Ads accounts",
        error: error.message,
      });
    }
  }

  // 13d. Get Google Ads Specific Connection Status
  static async getGoogleStatus(req, res) {
    try {
      const userId = req.user?._id;
      let googleAcc = await GoogleAccount.findOne({ userId, isActive: true }).lean();
      if (googleAcc) googleAcc = ensureGoogleAccountHierarchy(googleAcc);

      const isConnected = Boolean(googleAcc && googleAcc.accessToken && googleAcc.accessToken.trim() !== "");
      const managerCustomerId = googleAcc?.managerCustomerId || googleAcc?.managerAccountId || null;
      const selectedCustomerId = googleAcc?.selectedCustomerId || (googleAcc?.accounts?.find((a) => !a.isManager)?.customerId) || googleAcc?.accountId || null;

      return res.status(200).json({
        success: true,
        data: {
          isConnected,
          managerCustomerId,
          selectedCustomerId,
          activeAccount: googleAcc
            ? {
                accountId: selectedCustomerId,
                customerId: selectedCustomerId,
                accountName: googleAcc.accountName,
                currency: googleAcc.currency,
                timezoneName: googleAcc.timezoneName,
                isManager: false,
                managerCustomerId,
                syncStatus: googleAcc.syncStatus,
                lastSyncedAt: googleAcc.lastSyncedAt,
              }
            : null,
          accounts: googleAcc?.accounts || [],
          enabledTools: isConnected ? GOOGLE_MCP_TOOLS : [],
        },
      });
    } catch (error) {
      console.error("[Get Google Status Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch Google Ads status",
        error: error.message,
      });
    }
  }

  // 14. Connect to Google Ads MCP Server URL
  static async connectGoogleMcpServer(req, res) {
    try {
      const userId = req.user._id;
      const { mcpServerUrl, accountName, accountId, accessToken,refreshToken } = req.body;

      if (!mcpServerUrl) {
        return res.status(400).json({
          success: false,
          message: "MCP Server URL is required",
        });
      }

      const mcpHealth = await GoogleMcpClient.pingMcpServer(mcpServerUrl);
      let existingAccount = await GoogleAccount.findOne({ userId, isActive: true, accessToken: true });

      const cleanAccountId = accountId || existingAccount?.accountId || `act_google_${Date.now().toString().slice(-6)}`;
      const cleanAccountName = accountName || existingAccount?.accountName || "Google Ads MCP Primary Account";
      const effectiveToken =
        existingAccount?.accessToken || `mcp_google_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const isConnected = Boolean(cleanAccountId && effectiveToken && effectiveToken.trim() !== "");

      const updatedAccount = await GoogleAccount.findOneAndUpdate(
        { userId, isActive: true },
        {
          $set: {
            userId,
            accountId: cleanAccountId,
            accountName: cleanAccountName,
            accessToken: effectiveToken,
            currency: existingAccount?.currency || "INR",
            timezoneName: existingAccount?.timezoneName || "Asia/Kolkata",
            accountStatus: existingAccount?.accountStatus || 1,
            mcpServerUrl,
            authType: "MCP_SERVER",
            isActive: isConnected,
            isConnected: isConnected,
            syncStatus: "IDLE",
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );

      await ConnectedChannel.findOneAndUpdate(
        { userId, channelId: "google" },
        {
          $set: {
            userId,
            channelId: "google",
            channelName: "Google Ads",
            accountId: updatedAccount.accountId,
            accountName: updatedAccount.accountName,
            accessToken: effectiveToken,
            currency: updatedAccount.currency || "INR",
            isConnected: isConnected,
            config: { mcpServerUrl, authType: "MCP_SERVER" },
          },
        },
        { upsert: true, returnDocument: "after" }
      );

      return res.status(200).json({
        success: true,
        requiresAuth: false,
        message: `Successfully connected to Google Ads MCP Server (${mcpServerUrl}) and activated tools!`,
        data: {
          mcpServerUrl,
          mcpHealth,
          account: updatedAccount,
          channel: "Google Ads",
          enabledTools: GOOGLE_MCP_TOOLS,
        },
      });
    } catch (error) {
      console.error("[Connect Google MCP Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to connect to Google MCP server",
        error: error.message,
      });
    }
  }

  // 15. Fetch Google Ad Accounts
  static async fetchGoogleAdAccounts(req, res) {
    try {
      const { accessToken, developerToken } = req.body;
      if (!accessToken) {
        return res.status(400).json({
          success: false,
          message: "Google Access Token is required",
        });
      }

      const profile = await GoogleApiService.verifyAccessToken(accessToken);
      const rawAccounts = await GoogleApiService.getUserAdAccounts(accessToken, developerToken);

      return res.status(200).json({
        success: true,
        message: `Found ${rawAccounts.length} ad accounts for ${profile.name || "user"}`,
        profile,
        data: rawAccounts,
      });
    } catch (error) {
      console.error("[Fetch Google Accounts Error]:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch Google Ad Accounts",
      });
    }
  }

  // 16. Connect & Save Google Ad Account directly
  static async connectGoogleAccount(req, res) {
    try {
      const userId = req.user._id;
      const { accountId, accessToken, accountName, currency, timezoneName, mcpServerUrl, developerToken, isManager, managerAccountId } = req.body;

      if (!accountId) {
        return res.status(400).json({
          success: false,
          message: "accountId is required",
        });
      }

      const cleanId = String(accountId).replace(/[^0-9]/g, "");
      const formattedId = /^\d{10}$/.test(cleanId) ? cleanId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : accountId;
      const finalAccountName = accountName || `Google Ads Account (${formattedId})`;
      const finalCurrency = currency || "INR";
      const finalTimezone = timezoneName || "Asia/Kolkata";

      let existingAcc = await GoogleAccount.findOne({ userId, isActive: true });
      const effectiveToken = accessToken || existingAcc?.accessToken || "";
      const isConnected = Boolean(effectiveToken && effectiveToken.trim() !== "");

      const newAccountObj = {
        customerId: cleanId,
        name: finalAccountName,
        isManager: Boolean(isManager),
        currencyCode: finalCurrency,
        timeZone: finalTimezone,
        status: "ENABLED",
        parentCustomerId: managerAccountId ? String(managerAccountId).replace(/[^0-9]/g, "") : null,
        level: isManager ? 0 : 1,
      };

      let existingAccountsList = existingAcc?.accounts || [];
      const foundIdx = existingAccountsList.findIndex(a => a.customerId === cleanId);
      if (foundIdx >= 0) {
        existingAccountsList[foundIdx] = newAccountObj;
      } else {
        existingAccountsList.push(newAccountObj);
      }

      const masterAccountId = cleanId;

      await GoogleAccount.deleteMany({ userId, accountId: { $ne: masterAccountId } }).catch(() => {});

      const account = await GoogleAccount.findOneAndUpdate(
        { userId, accountId: masterAccountId },
        {
          $set: {
            userId,
            accountId: masterAccountId,
            accountName: finalAccountName,
            accessToken: effectiveToken,
            developerToken: developerToken || existingAcc?.developerToken || process.env.GOOGLE_DEVELOPER_TOKEN || "",
            currency: finalCurrency,
            timezoneName: finalTimezone,
            accountStatus: 1,
            selectedCustomerId: cleanId,
            isManager: Boolean(isManager),
            managerAccountId: managerAccountId || null,
            managerCustomerId: managerAccountId || null,
            accounts: existingAccountsList,
            mcpServerUrl: mcpServerUrl || existingAcc?.mcpServerUrl || "",
            authType: mcpServerUrl ? "MCP_SERVER" : (existingAcc?.authType || "TOKEN"),
            isActive: isConnected,
            isConnected: isConnected,
            syncStatus: "IDLE",
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );

      await ConnectedChannel.findOneAndUpdate(
        { userId, channelId: "google" },
        {
          $set: {
            userId,
            channelId: "google",
            channelName: "Google Ads",
            accountId: cleanId,
            accountName: finalAccountName,
            accessToken: effectiveToken,
            currency: finalCurrency,
            isConnected: isConnected,
            config: { mcpServerUrl },
          },
        },
        { upsert: true, returnDocument: "after" }
      );

      GoogleSyncPipeline.syncAccount(cleanId).catch((syncErr) => {
        console.warn(`[Google Initial Sync Background Warning for ${cleanId}]:`, syncErr.message);
      });

      return res.status(200).json({
        success: true,
        message: `Google Ads account (${formattedId}) connected successfully!`,
        data: {
          account: {
            accountId: account.accountId,
            accountName: account.accountName,
            currency: account.currency,
            timezoneName: account.timezoneName,
            isActive: account.isActive,
            isConnected: account.isConnected,
            mcpServerUrl: account.mcpServerUrl,
          },
          accounts: existingAccountsList,
          channel: "Google Ads",
          enabledTools: GOOGLE_MCP_TOOLS,
        },
      });
    } catch (error) {
      console.error("[Connect Google Account Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to connect Google Ads account",
        error: error.message,
      });
    }
  }

  // 17. Disconnect Google Ads Account / Channel
  static async disconnectGoogleAccount(req, res) {
    try {
      const userId = req.user._id;
      const { accountId } = req.body;

      if (accountId) {
        const cleanId = String(accountId).replace(/[^0-9]/g, "");
        const googleAcc = await GoogleAccount.findOne({ userId, isActive: true });
        if (googleAcc && googleAcc.accounts && googleAcc.accounts.length > 1) {
          googleAcc.accounts = googleAcc.accounts.filter(a => a.customerId !== cleanId && a.customerId !== accountId);
          if (googleAcc.selectedCustomerId === cleanId || googleAcc.selectedCustomerId === accountId || googleAcc.accountId === cleanId) {
            const nextAcc = googleAcc.accounts.find(a => !a.isManager) || googleAcc.accounts[0];
            if (nextAcc) {
              googleAcc.selectedCustomerId = nextAcc.customerId;
              googleAcc.accountId = nextAcc.customerId;
              googleAcc.accountName = nextAcc.name;
            }
          }
          await googleAcc.save();
          return res.status(200).json({
            success: true,
            message: `Google Ads account (${accountId}) removed successfully`,
          });
        }

        const updated = await GoogleAccount.updateMany(
          { userId },
          { $set: { isActive: false, isConnected: false, accessToken: "" } }
        );
        await ConnectedChannel.deleteMany({ userId, channelId: "google" });

        return res.status(200).json({
          success: true,
          message: `Google Ads account (${accountId}) disconnected successfully`,
          modifiedCount: updated.modifiedCount,
        });
      }

      const updated = await GoogleAccount.updateMany(
        { userId },
        { $set: { isActive: false, isConnected: false, accessToken: "" } }
      );
      await ConnectedChannel.deleteMany({ userId, channelId: "google" });

      return res.status(200).json({
        success: true,
        message: "All Google Ads accounts disconnected successfully",
        modifiedCount: updated.modifiedCount,
      });
    } catch (error) {
      console.error("[Disconnect Google Account Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to disconnect Google Ads account",
        error: error.message,
      });
    }
  }
}

export default ChannelController;
