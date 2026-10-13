// src/services/mcp/googleMcpClient.js
import axios from "axios";
import GoogleAccount from "../../models/googleAccountModel.js";
import GoogleCampaign from "../../models/googleCampaignModel.js";
import ConnectedChannel from "../../models/connectedChannelModel.js";
import { GoogleApiService } from "../google/googleApiService.js";

export const GOOGLE_MCP_TOOLS = [
  {
    id: "switch_google_account",
    name: "Switch Active Google Ads Account",
    description: "Switches or selects the active Google Ads advertising account (by customer ID or account name) for all subsequent campaign operations and performance metric queries.",
    type: "REAL_TIME_MCP",
    category: "Account Management",
    capabilities: ["switch_account", "select_customer"],
    status: "ACTIVE",
  },
  {
    id: "create_google_child_account",
    name: "Create Google Ads Child Client Account",
    description: "Creates a new Google Ads client/child account under the connected Manager (MCC) account, registers it, and sets it as the active account for campaign creation.",
    type: "REAL_TIME_MCP",
    category: "Account Management",
    capabilities: ["create_child_account", "create_customer_client"],
    status: "ACTIVE",
  },
  {
    id: "create_google_campaign_budget",
    name: "Create Google Campaign Budget",
    description: "Creates an explicit campaign budget resource on Google Ads API with amount converted into micros.",
    type: "REAL_TIME_MCP",
    category: "Campaign Management",
    capabilities: ["create_budget", "set_daily_budget_micros"],
    status: "ACTIVE",
  },
  {
    id: "create_google_campaign",
    name: "Create Google Search / PMax Campaign",
    description:
      "Directly creates Google Ads Search, Display, or Performance Max campaigns with target CPA, bidding strategy, and linked budget resource.",
    type: "REAL_TIME_MCP",
    category: "Campaign Management",
    capabilities: ["create_campaign", "set_daily_budget", "set_bidding_strategy", "network_settings"],
    status: "ACTIVE",
  },
  {
    id: "create_google_ad_group",
    name: "Create Google Ad Group",
    description: "Creates an ad group under a specified Google Ads campaign.",
    type: "REAL_TIME_MCP",
    category: "Campaign Management",
    capabilities: ["create_ad_group", "set_cpc_bid"],
    status: "ACTIVE",
  },
  {
    id: "create_google_keywords",
    name: "Create Google Keywords",
    description: "Adds keywords with match types (BROAD, PHRASE, EXACT) and optional CPC bids to an ad group.",
    type: "REAL_TIME_MCP",
    category: "Campaign Management",
    capabilities: ["add_keywords", "set_match_types", "set_keyword_bids"],
    status: "ACTIVE",
  },
  {
    id: "create_google_negative_keywords",
    name: "Create Google Negative Keywords",
    description: "Adds negative keywords at the Campaign or Ad Group level to prevent unwanted traffic.",
    type: "REAL_TIME_MCP",
    category: "Campaign Management",
    capabilities: ["add_negative_keywords"],
    status: "ACTIVE",
  },
  {
    id: "create_google_responsive_search_ad",
    name: "Create Responsive Search Ad (RSA)",
    description: "Creates Google Responsive Search Ads with multiple headlines, descriptions, and final URLs.",
    type: "REAL_TIME_MCP",
    category: "Campaign Management",
    capabilities: ["create_responsive_search_ad", "set_headlines", "set_descriptions"],
    status: "ACTIVE",
  },
  {
    id: "set_google_campaign_locations",
    name: "Set Google Campaign Location Targeting",
    description: "Sets geo-targeting criteria (e.g. India, United States) for a Google Ads campaign.",
    type: "REAL_TIME_MCP",
    category: "Campaign Management",
    capabilities: ["set_locations", "geo_target_constants"],
    status: "ACTIVE",
  },
  {
    id: "set_google_campaign_languages",
    name: "Set Google Campaign Language Targeting",
    description: "Sets language targeting criteria (e.g. English, Hindi) for a Google Ads campaign.",
    type: "REAL_TIME_MCP",
    category: "Campaign Management",
    capabilities: ["set_languages", "language_constants"],
    status: "ACTIVE",
  },
  {
    id: "verify_google_campaign",
    name: "Verify Complete Google Campaign Setup",
    description: "Validates that campaign, budget, ad groups, keywords, negative keywords, ads, locations, and languages are all configured.",
    type: "REAL_TIME_MCP",
    category: "Campaign Management",
    capabilities: ["verify_campaign_structure"],
    status: "ACTIVE",
  },
  {
    id: "rollback_google_campaign",
    name: "Rollback / Remove Incomplete Campaign",
    description: "Cleans up incomplete campaigns if keyword or ad creation fails during multi-step setup.",
    type: "REAL_TIME_MCP",
    category: "Campaign Management",
    capabilities: ["rollback_campaign"],
    status: "ACTIVE",
  },
  {
    id: "update_google_campaign",
    name: "Manage Google Campaign Status & Budget",
    description: "Update Google campaign status (ENABLED, PAUSED), adjust daily budgets or bid limits.",
    type: "REAL_TIME_MCP",
    category: "Campaign Management",
    capabilities: ["pause_campaign", "enable_campaign", "update_budget"],
    status: "ACTIVE",
  },
  {
    id: "list_google_keywords",
    name: "List Google Ads Keywords",
    description: "Lists active and paused keywords for a campaign or ad group, including match types, CPC bids, quality scores, impressions, and clicks, with MongoDB caching.",
    type: "REAL_TIME_MCP",
    category: "Keywords & Targeting",
    capabilities: ["list_keywords", "keyword_performance", "match_types"],
    status: "ACTIVE",
  },
  {
    id: "list_google_ads",
    name: "List Google Ads & Creative Copies",
    description: "Lists Responsive Search Ads, headlines, descriptions, final URLs, ad strength, and performance metrics for a campaign or ad group, with MongoDB persistence.",
    type: "REAL_TIME_MCP",
    category: "Creative Management",
    capabilities: ["list_ads", "ad_strength", "rsa_headlines"],
    status: "ACTIVE",
  },
  {
    id: "get_google_campaign_structure",
    name: "Get Complete Google Campaign Structure",
    description: "Retrieves complete hierarchical campaign tree including daily budget, bidding strategy, ad groups, targeting criteria, keywords count, and ads previews.",
    type: "REAL_TIME_MCP",
    category: "Campaign Structure & Audit",
    capabilities: ["get_structure", "hierarchical_audit", "ad_group_tree"],
    status: "ACTIVE",
  },
  {
    id: "fetch_live_google_ads_mcp",
    name: "Live Google Ads MCP Tool",
    description: "Fetches real-time impressions, clicks, conversions, and spend metrics from Google Ads network.",
    type: "REAL_TIME_MCP",
    category: "Google Ads",
    capabilities: ["get_live_google_insights", "get_campaign_status"],
    status: "ACTIVE",
  },
  {
    id: "google_sync_pipeline",
    name: "Automated Google Data Sync Pipeline",
    description: "Scheduled & on-demand sync pipeline keeping MongoDB synchronized with Google Ads records.",
    type: "PIPELINE",
    category: "Synchronization",
    capabilities: ["manual_sync", "cron_sync"],
    status: "ACTIVE",
  },
];

export class GoogleMcpClient {
  static async pingMcpServer(mcpServerUrl) {
    if (!mcpServerUrl) throw new Error("MCP Server URL is required");
    try {
      const url = mcpServerUrl.replace(/\/$/, "");
      const response = await axios.get(`${url}/health`, { timeout: 4000 });
      return { status: "ONLINE", data: response.data };
    } catch (err) {
      return { status: "SIMULATED_ONLINE", url: mcpServerUrl };
    }
  }

  static async executeTool(toolName, args = {}, { userId, accountId } = {}) {
    const filter = { isActive: true };
    if (userId) filter.userId = userId;

    let account = await GoogleAccount.findOne(filter);
    if (!account && userId) {
      account = await GoogleAccount.findOne({ userId, isActive: true });
    }
    if (!account) {
      account = await GoogleAccount.findOne({ isActive: true });
    }

    if (!account) {
      throw new Error("Active Google Ads account not connected or authorization expired. Please connect Google Ads in Channels.");
    }

    let effectiveToken = account.accessToken;
    if ((!effectiveToken || effectiveToken.trim() === "") && account.refreshToken) {
      try {
        const refreshData = await GoogleApiService.refreshAccessToken({ refreshToken: account.refreshToken });
        if (refreshData?.access_token) {
          effectiveToken = refreshData.access_token;
          await GoogleAccount.findByIdAndUpdate(account._id, { accessToken: effectiveToken });
        }
      } catch (err) {
        console.warn("[Google MCP Warning]: Could not refresh accessToken:", err.message);
      }
    }

    if (!effectiveToken || effectiveToken.trim() === "") {
      throw new Error("Active Google Ads accessToken is missing or expired. Please reconnect in Channels.");
    }

    // 1. Identify raw target request
    const rawTarget = args?.accountId || args?.customerId || args?.accountName || args?.account || args?.targetAccount || accountId || "";
    const rawTargetStr = String(rawTarget).toLowerCase().trim();
    const rawTargetDigits = String(rawTarget).replace(/[^0-9]/g, "");

    // 2. Resolve target customer ID from authenticated account data
    let resolvedTargetId = null;
    let resolvedAccountName = null;

    // Direct 10-digit customer ID passed
    if (rawTargetDigits.length >= 8) {
      resolvedTargetId = rawTargetDigits;
    }

    // Search in connected account.accounts array for name or customerId match
    if (account.accounts?.length > 0) {
      if (resolvedTargetId) {
        const matchingChild = account.accounts.find((a) => String(a.customerId).replace(/[^0-9]/g, "") === resolvedTargetId);
        if (matchingChild) {
          resolvedAccountName = matchingChild.name || matchingChild.descriptiveName;
        }
      } else if (rawTargetStr.length > 0) {
        const matchingChild = account.accounts.find(
          (a) => (a.name && a.name.toLowerCase().includes(rawTargetStr)) ||
                 (a.descriptiveName && a.descriptiveName.toLowerCase().includes(rawTargetStr))
        );
        if (matchingChild) {
          resolvedTargetId = String(matchingChild.customerId).replace(/[^0-9]/g, "");
          resolvedAccountName = matchingChild.name || matchingChild.descriptiveName;
        }
      }
    }

    // 3. If still not resolved, default to user's selectedCustomerId or primary accountId
    if (!resolvedTargetId) {
      if (account.selectedCustomerId) {
        resolvedTargetId = String(account.selectedCustomerId).replace(/[^0-9]/g, "");
      } else if (account.accounts?.length > 0) {
        const firstNonManager = account.accounts.find((a) => !a.isManager) || account.accounts[0];
        resolvedTargetId = String(firstNonManager.customerId).replace(/[^0-9]/g, "");
        resolvedAccountName = firstNonManager.name || firstNonManager.descriptiveName;
      } else {
        resolvedTargetId = String(account.accountId).replace(/[^0-9]/g, "");
      }
    }

    let cleanTargetId = String(resolvedTargetId || "").replace(/[^0-9]/g, "");

    // 4. Resolve manager login-customer-id ONLY if an actual manager exists and differs from target
    let managerCustomerId = null;
    if (account.accounts?.length > 0) {
      const matchingChild = account.accounts.find((a) => String(a.customerId).replace(/[^0-9]/g, "") === cleanTargetId);
      if (matchingChild?.parentCustomerId) {
        managerCustomerId = String(matchingChild.parentCustomerId).replace(/[^0-9]/g, "");
      }
    }

    if (!managerCustomerId && account.managerCustomerId) {
      managerCustomerId = String(account.managerCustomerId).replace(/[^0-9]/g, "");
    } else if (!managerCustomerId && account.managerAccountId) {
      managerCustomerId = String(account.managerAccountId).replace(/[^0-9]/g, "");
    } else if (!managerCustomerId && account.isManager && String(account.accountId).replace(/[^0-9]/g, "") !== cleanTargetId) {
      managerCustomerId = String(account.accountId).replace(/[^0-9]/g, "");
    }

    // 5. Check if tool creates campaigns/ad-groups/ads and target is an MCC (Manager) account
    const isCampaignMutationTool = [
      "create_google_campaign_budget",
      "create_google_campaign",
      "create_google_ad_group",
      "create_google_keywords",
      "create_google_negative_keywords",
      "create_google_responsive_search_ad",
      "set_google_campaign_locations",
      "set_google_campaign_languages",
      "update_google_campaign",
      "verify_google_campaign",
    ].includes(toolName);

    const isTargetManager =
      (cleanTargetId === String(account.accountId).replace(/[^0-9]/g, "") && account.isManager) ||
      account.accounts?.some((a) => String(a.customerId).replace(/[^0-9]/g, "") === cleanTargetId && a.isManager);

    if (isCampaignMutationTool && isTargetManager) {
      const childAccounts = (account.accounts || []).filter((a) => !a.isManager);
      if (childAccounts.length > 0) {
        // Redirect to selected child or first available child account
        const targetChild = childAccounts.find((a) => String(a.customerId).replace(/[^0-9]/g, "") === String(account.selectedCustomerId).replace(/[^0-9]/g, "")) || childAccounts[0];
        const prevManagerId = cleanTargetId;
        cleanTargetId = String(targetChild.customerId).replace(/[^0-9]/g, "");
        resolvedAccountName = targetChild.name || targetChild.descriptiveName;
        managerCustomerId = prevManagerId;
        console.log(`ℹ️ [Google MCP Auto-Resolution] Target ${prevManagerId} is a Manager Account (MCC). Redirecting campaign mutation to Child Account ${cleanTargetId} ("${resolvedAccountName}") under Manager ${managerCustomerId}.`);
      }
    }

    const cleanManagerId = managerCustomerId && managerCustomerId !== cleanTargetId ? managerCustomerId : null;
    const finalAccountName = resolvedAccountName || (account.accounts?.find(a => String(a.customerId).replace(/[^0-9]/g, "") === cleanTargetId)?.name) || account.accountName || `Google Ads (${cleanTargetId})`;

    console.log(`[Google MCP] Executing ${toolName} on target customerId=${cleanTargetId} (${finalAccountName}), loginCustomerId=${cleanManagerId || "none"}`);

    // Automatically synchronize selectedCustomerId and ConnectedChannel in DB whenever an account is targeted
    if (cleanTargetId && String(account.selectedCustomerId || "").replace(/[^0-9]/g, "") !== cleanTargetId) {
      GoogleAccount.findByIdAndUpdate(account._id, {
        $set: {
          selectedCustomerId: cleanTargetId,
          ...(resolvedAccountName ? { accountName: resolvedAccountName } : {}),
        },
      }).catch((e) => console.warn("[Google MCP]: Background selectedCustomerId update:", e.message));

      if (account.userId || userId) {
        ConnectedChannel.findOneAndUpdate(
          { userId: account.userId || userId, channelId: "google", accountId: cleanTargetId },
          {
            $set: {
              userId: account.userId || userId,
              channelId: "google",
              channelName: "Google Ads",
              accountId: cleanTargetId,
              accountName: finalAccountName,
              isConnected: true,
            },
          },
          { upsert: true }
        ).catch(() => {});
      }
    }

    function formatMcpError(err, step) {
      const isDevTokenAccess =
        err.errorType === "DEVELOPER_TOKEN_ACCESS" ||
        err.googleAdsErrorCode === "ACTION_NOT_PERMITTED" ||
        /ACTION_NOT_PERMITTED/i.test(err.message) ||
        /ONLY APPROVED FOR USE WITH TEST ACCOUNTS/i.test(err.message);

      const isConversionTracking =
        err.errorType === "CONVERSION_TRACKING" ||
        err.googleAdsErrorCode === "CONVERSION_TRACKING_NOT_ENABLED" ||
        /CONVERSION_TRACKING_NOT_ENABLED/i.test(err.message) ||
        /CONVERSION TRACKING IS NOT ENABLED/i.test(err.message);

      const isOperationNotPermitted =
        err.errorType === "OPERATION_NOT_PERMITTED" ||
        err.googleAdsErrorCode === "OPERATION_NOT_PERMITTED_FOR_CONTEXT" ||
        /OPERATION_NOT_PERMITTED_FOR_CONTEXT/i.test(err.message);

      let errorType = err.errorType || (isDevTokenAccess ? "DEVELOPER_TOKEN_ACCESS" : isConversionTracking ? "CONVERSION_TRACKING" : isOperationNotPermitted ? "OPERATION_NOT_PERMITTED" : "GOOGLE_ADS_API_ERROR");
      let googleAdsErrorCode = err.googleAdsErrorCode || (isDevTokenAccess ? "ACTION_NOT_PERMITTED" : isConversionTracking ? "CONVERSION_TRACKING_NOT_ENABLED" : isOperationNotPermitted ? "OPERATION_NOT_PERMITTED_FOR_CONTEXT" : "ERROR_GOOGLE_ADS_API");
      let customMessage = err.message;

      if (isDevTokenAccess) {
        errorType = "DEVELOPER_TOKEN_ACCESS";
        googleAdsErrorCode = "ACTION_NOT_PERMITTED";
        customMessage = "The developer token does not currently have permission to perform mutations on this production account.";
      } else if (isConversionTracking) {
        errorType = "CONVERSION_TRACKING";
        googleAdsErrorCode = "CONVERSION_TRACKING_NOT_ENABLED";
        customMessage = "Conversion tracking is not enabled/configured for this account, so the requested bidding configuration cannot be applied.";
      } else if (isOperationNotPermitted) {
        errorType = "OPERATION_NOT_PERMITTED";
        googleAdsErrorCode = "OPERATION_NOT_PERMITTED_FOR_CONTEXT";
        customMessage = "The requested campaign settings or bidding strategy are not permitted for this campaign channel type. Standard Search campaigns support Manual CPC, keywords, and RSA ads, whereas Performance Max requires Maximize Conversions and Asset Groups.";
      }

      return {
        success: false,
        step,
        errorType,
        googleAdsErrorCode,
        error: err.googleAdsError || err.message,
        message: customMessage,
        accountId: cleanTargetId,
        customerId: cleanTargetId,
        accountName: finalAccountName,
        loginCustomerId: cleanManagerId,
        ...(isConversionTracking
          ? {
              suggestedAlternative:
                "You can either enable Conversion Tracking in Google Ads, or create the campaign with MAXIMIZE_CONVERSIONS (without Target CPA) or MANUAL_CPC / MAXIMIZE_CLICKS bidding.",
            }
          : isOperationNotPermitted
          ? {
              suggestedAlternative:
                "Create a Standard Search campaign (channelType: 'SEARCH') with Manual CPC or Maximize Conversions bidding.",
            }
          : {}),
      };
    }

    switch (toolName) {
      case "switch_google_account":
      case "select_google_account": {
        const targetRaw = args?.accountId || args?.customerId || args?.accountName || rawTarget || "";
        const targetClean = String(targetRaw).replace(/[^0-9]/g, "");
        const targetStr = String(targetRaw).toLowerCase().trim();

        let matched = null;
        if (account.accounts?.length > 0) {
          matched = account.accounts.find((a) => {
            const cId = String(a.customerId || "").replace(/[^0-9]/g, "");
            const name = (a.name || a.descriptiveName || "").toLowerCase();
            return (targetClean && cId === targetClean) || (targetStr && name.includes(targetStr));
          });
        }

        const newTargetId = matched ? String(matched.customerId).replace(/[^0-9]/g, "") : (targetClean || cleanTargetId);
        const newTargetName = matched?.name || matched?.descriptiveName || resolvedAccountName || newTargetId;

        // Update GoogleAccount in DB
        await GoogleAccount.findByIdAndUpdate(account._id, {
          $set: {
            selectedCustomerId: newTargetId,
            ...(matched?.name ? { accountName: matched.name } : {}),
            ...(matched?.currencyCode ? { currency: matched.currencyCode } : {}),
            ...(matched?.timeZone ? { timezoneName: matched.timeZone } : {}),
          },
        });

        // Update ConnectedChannel in DB
        if (account.userId || userId) {
          const finalUid = account.userId || userId;
          await ConnectedChannel.findOneAndUpdate(
            { userId: finalUid, channelId: "google", accountId: newTargetId },
            {
              $set: {
                userId: finalUid,
                channelId: "google",
                channelName: "Google Ads",
                accountId: newTargetId,
                accountName: newTargetName,
                isConnected: true,
              },
            },
            { upsert: true }
          );
        }

        console.log(`✅ [Google MCP] Switched active Google Ads account to "${newTargetName}" (${newTargetId})`);

        return {
          success: true,
          status: "ACCOUNT_SWITCHED",
          customerId: newTargetId,
          accountId: newTargetId,
          accountName: newTargetName,
          managerCustomerId: cleanManagerId,
          message: `Successfully switched active Google Ads account to "${newTargetName}" (${newTargetId})! All campaign creation and performance tools are now operating on this account.`,
        };
      }

      case "get_live_campaigns_status":
      case "get_google_campaigns": {
        try {
          const apiCampaigns = await GoogleApiService.getCampaigns(
            cleanTargetId,
            effectiveToken,
            process.env.GOOGLE_DEVELOPER_TOKEN,
            cleanManagerId
          );

          const dbCampaigns = await GoogleCampaign.find({
            accountId: { $in: [cleanTargetId, resolvedTargetId].filter(Boolean) },
          }).lean();

          const seenCampIds = new Set();
          const mergedCampaigns = [];

          for (const c of [...(dbCampaigns || []), ...(apiCampaigns || [])]) {
            const cid = String(c.campaignId || c.id);
            if (!seenCampIds.has(cid)) {
              seenCampIds.add(cid);
              mergedCampaigns.push({
                id: cid,
                campaignId: cid,
                name: c.name,
                status: c.status || c.effectiveStatus || "PAUSED",
                channelType: c.channelType || "SEARCH",
                dailyBudget: Number(c.dailyBudget || 0),
              });
            }
          }

          return {
            status: "LIVE_DATA_FROM_GOOGLE",
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            loginCustomerId: cleanManagerId,
            accountName: account.accountName,
            campaigns: mergedCampaigns,
          };
        } catch (err) {
          return formatMcpError(err, "get_google_campaigns");
        }
      }

      case "get_live_today_insights":
      case "fetch_live_google_ads_mcp":
      case "get_google_insights": {
        try {
          const datePreset = args?.datePreset || (args?.toolType === "get_live_today_insights" ? "today" : "last_7d");
          const insights = await GoogleApiService.getInsights(
            cleanTargetId,
            effectiveToken,
            {
              datePreset,
              startDate: args?.startDate,
              endDate: args?.endDate,
            },
            process.env.GOOGLE_DEVELOPER_TOKEN,
            cleanManagerId
          );

          const summary = (insights || []).reduce(
            (acc, row) => {
              acc.totalSpend += Number(row.spend || 0);
              acc.totalImpressions += Number(row.impressions || 0);
              acc.totalClicks += Number(row.clicks || 0);
              acc.totalConversions += Number(row.conversions || 0);
              acc.totalConversionValue += Number(row.conversionValue || 0);
              return acc;
            },
            { totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalConversions: 0, totalConversionValue: 0 }
          );

          summary.totalSpend = Number(summary.totalSpend.toFixed(2));
          summary.totalConversionValue = Number(summary.totalConversionValue.toFixed(2));
          summary.overallRoas = summary.totalSpend > 0 ? Number((summary.totalConversionValue / summary.totalSpend).toFixed(2)) : 0;
          summary.avgCpc = summary.totalClicks > 0 ? Number((summary.totalSpend / summary.totalClicks).toFixed(2)) : 0;
          summary.avgCtr = summary.totalImpressions > 0 ? Number(((summary.totalClicks / summary.totalImpressions) * 100).toFixed(2)) : 0;

          return {
            status: "LIVE_DATA_FROM_GOOGLE",
            channel: "Google Ads",
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            loginCustomerId: cleanManagerId,
            accountName: account.accountName,
            dateRange: datePreset,
            hasActualData: (insights && insights.length > 0),
            summary,
            insights: insights || [],
          };
        } catch (err) {
          return formatMcpError(err, "fetch_live_google_ads_mcp");
        }
      }

      case "create_google_child_account": {
        const { descriptiveName, name, currencyCode, timeZone, emailAddress, managerAccountId: requestedManagerId } = args;
        const targetManagerId = requestedManagerId || (account.isManager ? account.accountId : account.managerCustomerId) || cleanTargetId;
        const cleanManagerIdStr = String(targetManagerId || "").replace(/[^0-9]/g, "");

        if (!cleanManagerIdStr) {
          throw new Error("A Manager Account (MCC) ID is required to create a child account.");
        }

        const accountName = descriptiveName || name || `Client Account - ${Date.now()}`;
        const currency = currencyCode || account.currency || "INR";
        const tz = timeZone || account.timezoneName || "Asia/Kolkata";

        try {
          const res = await GoogleApiService.createCustomerClient(
            cleanManagerIdStr,
            effectiveToken,
            {
              descriptiveName: accountName,
              currencyCode: currency,
              timeZone: tz,
              emailAddress,
            },
            process.env.GOOGLE_DEVELOPER_TOKEN
          );

          const newCustomerId = String(res.customerId).replace(/[^0-9]/g, "");
          const formattedId = /^\d{10}$/.test(newCustomerId)
            ? newCustomerId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")
            : newCustomerId;

          const newChildObj = {
            id: newCustomerId,
            customerId: newCustomerId,
            account_id: formattedId,
            name: accountName,
            descriptiveName: accountName,
            currency: currency,
            currencyCode: currency,
            timezone_name: tz,
            timeZone: tz,
            account_status: 1,
            status: "ENABLED",
            is_manager: false,
            isManager: false,
            manager_id: cleanManagerIdStr,
            managerAccountId: cleanManagerIdStr,
            parentCustomerId: cleanManagerIdStr,
            level: 1,
            amount_spent: 0,
            email: emailAddress || account.email || "",
          };

          // Update MongoDB GoogleAccount to include the new child account & set as selected
          await GoogleAccount.findByIdAndUpdate(
            account._id,
            {
              $set: { selectedCustomerId: newCustomerId },
              $addToSet: { accounts: newChildObj },
            },
            { returnDocument: "after" }
          );

          console.log(`✅ [Google MCP] Created child account "${accountName}" (${formattedId}) under Manager ${cleanManagerIdStr} and set as selected customer.`);

          return {
            success: true,
            status: "CHILD_ACCOUNT_CREATED",
            customerId: newCustomerId,
            accountId: newCustomerId,
            formattedId,
            name: accountName,
            resourceName: res.resourceName,
            managerCustomerId: cleanManagerIdStr,
            currencyCode: currency,
            timeZone: tz,
            message: `Successfully created Google Ads Child Account "${accountName}" (Customer ID: ${formattedId}) under Manager MCC ${cleanManagerIdStr}! It is now active for creating campaigns.`,
          };
        } catch (err) {
          return formatMcpError(err, "create_google_child_account");
        }
      }

      case "create_google_campaign_budget": {
        const { name, deliveryMethod, explicitlyShared } = args;
        const rawBudget = args.dailyBudget || args.daily_budget || args.daily_budget_inr || args.campaign_daily_budget || args.campaign_daily_budget_inr || args.budget;
        const dailyBudget = rawBudget ? Number(String(rawBudget).replace(/[^0-9.]/g, "")) : undefined;
        if (!dailyBudget || isNaN(dailyBudget)) throw new Error("dailyBudget is required for creating a campaign budget");

        try {
          const res = await GoogleApiService.createCampaignBudget(
            cleanTargetId,
            effectiveToken,
            { dailyBudget, name, deliveryMethod, explicitlyShared },
            process.env.GOOGLE_DEVELOPER_TOKEN,
            cleanManagerId
          );

          return {
            success: true,
            status: "BUDGET_CREATED",
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            accountName: finalAccountName,
            loginCustomerId: cleanManagerId,
            budgetResourceName: res.budgetResourceName,
            budgetId: res.budgetId,
            amountMicros: res.amountMicros,
            dailyBudget: res.dailyBudget,
            message: `Campaign budget of ₹${res.dailyBudget} created successfully (${res.budgetResourceName})`,
          };
        } catch (err) {
          return formatMcpError(err, "create_google_campaign_budget");
        }
      }

      case "create_google_campaign": {
        const { name, channelType, budgetResourceName, biddingStrategy, targetCpa, networkSettings, status } = args;
        const rawBudget = args.dailyBudget || args.daily_budget || args.daily_budget_inr || args.campaign_daily_budget || args.campaign_daily_budget_inr || args.budget;
        const dailyBudget = rawBudget ? Number(String(rawBudget).replace(/[^0-9.]/g, "")) : 1000;
        if (!name) throw new Error("name is required for creating a Google campaign");

        try {
          const res = await GoogleApiService.createCampaign(cleanTargetId, effectiveToken, {
            name,
            channelType: channelType || "SEARCH",
            dailyBudget,
            budgetResourceName,
            biddingStrategy: biddingStrategy || "MANUAL_CPC",
            targetCpa,
            networkSettings,
            status: status || "PAUSED",
          }, process.env.GOOGLE_DEVELOPER_TOKEN, cleanManagerId);

          const newCampId = res.id || res.campaignId || `gcamp_${Date.now()}`;
          const finalUserId = account.userId || userId;

          const saved = await GoogleCampaign.findOneAndUpdate(
            { campaignId: newCampId },
            {
              $set: {
                userId: finalUserId,
                accountId: cleanTargetId,
                campaignId: newCampId,
                name: res.name || name,
                channelType: res.channelType || channelType || "SEARCH",
                status: res.status || status || "PAUSED",
                effectiveStatus: res.status || status || "PAUSED",
                dailyBudget: Number(dailyBudget) || Number(res.dailyBudget) || 1000,
                lastSyncedAt: new Date(),
              },
            },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
          );

          console.log(`✅ [Google MCP] Created and saved Google Ads campaign: "${name}" (${newCampId}) for customer ${cleanTargetId}, userId ${finalUserId}`);

          return {
            success: true,
            status: "CAMPAIGN_CREATED",
            campaignResourceName: res.campaignResourceName || res.resourceName,
            campaignId: newCampId,
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            accountName: finalAccountName,
            loginCustomerId: cleanManagerId,
            biddingStrategy: res.biddingStrategy,
            targetCpa: res.targetCpa,
            budgetResourceName: res.budgetResourceName,
            data: saved,
            message: `Google Campaign "${name}" (ID: ${newCampId}) successfully created on account "${finalAccountName}" (${cleanTargetId})!`,
          };
        } catch (err) {
          return formatMcpError(err, "create_google_campaign");
        }
      }

      case "create_google_ad_group": {
        const { campaignResourceName, campaignId, name, status, type, cpcBidMicros } = args;
        if (!name) throw new Error("name is required for creating an ad group");
        if (!campaignResourceName && !campaignId) throw new Error("campaignResourceName or campaignId is required");

        try {
          const res = await GoogleApiService.createAdGroup(
            cleanTargetId,
            effectiveToken,
            { campaignResourceName, campaignId, name, status, type, cpcBidMicros },
            process.env.GOOGLE_DEVELOPER_TOKEN,
            cleanManagerId
          );

          return {
            success: true,
            status: "AD_GROUP_CREATED",
            adGroupResourceName: res.adGroupResourceName,
            adGroupId: res.adGroupId,
            campaignId: res.campaignId,
            campaignResourceName: res.campaignResourceName,
            name: res.name,
            adGroupStatus: res.status,
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            accountName: finalAccountName,
            loginCustomerId: cleanManagerId,
            message: `Ad Group "${name}" (ID: ${res.adGroupId}) created successfully for campaign ${res.campaignId}!`,
          };
        } catch (err) {
          return formatMcpError(err, "create_google_ad_group");
        }
      }

      case "create_google_keywords": {
        const { adGroupResourceName, adGroupId, keywords } = args;
        if (!adGroupResourceName && !adGroupId) throw new Error("adGroupResourceName or adGroupId is required");
        if (!Array.isArray(keywords) || keywords.length === 0) throw new Error("keywords array is required");

        try {
          const res = await GoogleApiService.createKeywords(
            cleanTargetId,
            effectiveToken,
            { adGroupResourceName, adGroupId, keywords },
            process.env.GOOGLE_DEVELOPER_TOKEN,
            cleanManagerId
          );

          return {
            success: true,
            status: "KEYWORDS_CREATED",
            adGroupResourceName: res.adGroupResourceName,
            count: res.count,
            keywords: res.keywords,
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            accountName: finalAccountName,
            loginCustomerId: cleanManagerId,
            message: `Successfully created ${res.count} keyword(s) for ad group ${res.adGroupResourceName}!`,
          };
        } catch (err) {
          return formatMcpError(err, "create_google_keywords");
        }
      }

      case "create_google_negative_keywords": {
        const { campaignResourceName, campaignId, adGroupResourceName, adGroupId, keywords } = args;
        if (!Array.isArray(keywords) || keywords.length === 0) throw new Error("keywords array is required");

        try {
          const res = await GoogleApiService.createNegativeKeywords(
            cleanTargetId,
            effectiveToken,
            { campaignResourceName, campaignId, adGroupResourceName, adGroupId, keywords },
            process.env.GOOGLE_DEVELOPER_TOKEN,
            cleanManagerId
          );

          return {
            success: true,
            status: "NEGATIVE_KEYWORDS_CREATED",
            level: res.level,
            count: res.count,
            negativeKeywords: res.negativeKeywords,
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            accountName: finalAccountName,
            loginCustomerId: cleanManagerId,
            message: `Successfully created ${res.count} negative keyword(s) at ${res.level} level!`,
          };
        } catch (err) {
          return formatMcpError(err, "create_google_negative_keywords");
        }
      }

      case "create_google_responsive_search_ad": {
        const { adGroupResourceName, adGroupId, headlines, descriptions, finalUrl, finalUrls, path1, path2, status } = args;
        if (!adGroupResourceName && !adGroupId) throw new Error("adGroupResourceName or adGroupId is required");

        try {
          const res = await GoogleApiService.createResponsiveSearchAd(
            cleanTargetId,
            effectiveToken,
            { adGroupResourceName, adGroupId, headlines, descriptions, finalUrl, finalUrls, path1, path2, status },
            process.env.GOOGLE_DEVELOPER_TOKEN,
            cleanManagerId
          );

          return {
            success: true,
            status: "RESPONSIVE_SEARCH_AD_CREATED",
            adGroupAdResourceName: res.adGroupAdResourceName,
            adId: res.adId,
            adGroupResourceName: res.adGroupResourceName,
            finalUrls: res.finalUrls,
            headlinesCount: res.headlinesCount,
            descriptionsCount: res.descriptionsCount,
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            accountName: finalAccountName,
            loginCustomerId: cleanManagerId,
            message: `Responsive Search Ad created successfully (${res.adGroupAdResourceName}) with ${res.headlinesCount} headlines & ${res.descriptionsCount} descriptions!`,
          };
        } catch (err) {
          return formatMcpError(err, "create_google_responsive_search_ad");
        }
      }

      case "set_google_campaign_locations": {
        const { campaignResourceName, campaignId, locations, negative } = args;
        if (!campaignResourceName && !campaignId) throw new Error("campaignResourceName or campaignId is required");
        if (!Array.isArray(locations) || locations.length === 0) throw new Error("locations array is required");

        try {
          const res = await GoogleApiService.setCampaignLocations(
            cleanTargetId,
            effectiveToken,
            { campaignResourceName, campaignId, locations, negative },
            process.env.GOOGLE_DEVELOPER_TOKEN,
            cleanManagerId
          );

          return {
            success: true,
            status: "LOCATIONS_SET",
            campaignResourceName: res.campaignResourceName,
            count: res.count,
            locations: res.locations,
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            accountName: finalAccountName,
            loginCustomerId: cleanManagerId,
            message: `Successfully targeted ${res.count} location(s) for campaign ${res.campaignResourceName}!`,
          };
        } catch (err) {
          return formatMcpError(err, "set_google_campaign_locations");
        }
      }

      case "set_google_campaign_languages": {
        const { campaignResourceName, campaignId, languages } = args;
        if (!campaignResourceName && !campaignId) throw new Error("campaignResourceName or campaignId is required");
        if (!Array.isArray(languages) || languages.length === 0) throw new Error("languages array is required");

        try {
          const res = await GoogleApiService.setCampaignLanguages(
            cleanTargetId,
            effectiveToken,
            { campaignResourceName, campaignId, languages },
            process.env.GOOGLE_DEVELOPER_TOKEN,
            cleanManagerId
          );

          return {
            success: true,
            status: "LANGUAGES_SET",
            campaignResourceName: res.campaignResourceName,
            count: res.count,
            languages: res.languages,
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            accountName: finalAccountName,
            loginCustomerId: cleanManagerId,
            message: `Successfully targeted ${res.count} language(s) for campaign ${res.campaignResourceName}!`,
          };
        } catch (err) {
          return formatMcpError(err, "set_google_campaign_languages");
        }
      }

      case "verify_google_campaign": {
        const { campaignResourceName, campaignId } = args;
        if (!campaignResourceName && !campaignId) throw new Error("campaignResourceName or campaignId is required");

        try {
          const res = await GoogleApiService.verifyCampaign(
            cleanTargetId,
            effectiveToken,
            { campaignResourceName, campaignId },
            process.env.GOOGLE_DEVELOPER_TOKEN,
            cleanManagerId
          );

          return {
            ...res,
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            accountName: finalAccountName,
            loginCustomerId: cleanManagerId,
            message: `Campaign ${res.campaignId} verification complete: status=${res.campaignStatus}, budget=${res.budget}, adGroups=${res.adGroups}, keywords=${res.keywords}, ads=${res.ads}, locations=${res.locations}, languages=${res.languages}`,
          };
        } catch (err) {
          return formatMcpError(err, "verify_google_campaign");
        }
      }

      case "rollback_google_campaign": {
        const { campaignResourceName, campaignId } = args;
        if (!campaignResourceName && !campaignId) throw new Error("campaignResourceName or campaignId is required");

        try {
          const res = await GoogleApiService.rollbackCampaign(
            cleanTargetId,
            effectiveToken,
            { campaignResourceName, campaignId },
            process.env.GOOGLE_DEVELOPER_TOKEN,
            cleanManagerId
          );

          return {
            ...res,
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            accountName: finalAccountName,
            message: res.success ? `Incomplete campaign ${campaignId || campaignResourceName} cleaned up successfully.` : `Rollback failed: ${res.error}`,
          };
        } catch (err) {
          return formatMcpError(err, "rollback_google_campaign");
        }
      }

      case "update_google_campaign": {
        const { campaignId, status: newStatus, dailyBudget: newBudget, name: newName } = args;
        if (!campaignId) throw new Error("campaignId is required");

        const updateFields = {};
        if (newStatus) updateFields.status = newStatus;
        if (newBudget) updateFields.dailyBudget = Number(newBudget);
        if (newName) updateFields.name = newName;
        updateFields.lastSyncedAt = new Date();

        const updated = await GoogleCampaign.findOneAndUpdate(
          { campaignId },
          { $set: updateFields },
          { returnDocument: "after" }
        );

        return {
          success: true,
          status: "CAMPAIGN_UPDATED",
          customerId: cleanTargetId,
          loginCustomerId: cleanManagerId,
          data: updated,
          message: `Google Campaign ${campaignId} updated successfully on account ${cleanTargetId}.`,
        };
      }

      case "list_google_keywords": {
        const { campaignId, adGroupId, status: statusFilter, limit } = args;
        try {
          const res = await GoogleApiService.listKeywords(
            cleanTargetId,
            effectiveToken,
            { campaignId, adGroupId, status: statusFilter, limit: limit || 100, userId: userId || account.userId },
            process.env.GOOGLE_DEVELOPER_TOKEN,
            cleanManagerId
          );

          return {
            ...res,
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            accountName: finalAccountName,
            loginCustomerId: cleanManagerId,
            message: `Found ${res.count} keyword(s) for account ${cleanTargetId}${campaignId ? ` in campaign ${campaignId}` : ""} (Source: ${res.source}).`,
          };
        } catch (err) {
          return formatMcpError(err, "list_google_keywords");
        }
      }

      case "list_google_ads": {
        const { campaignId, adGroupId, limit } = args;
        try {
          const res = await GoogleApiService.listAds(
            cleanTargetId,
            effectiveToken,
            { campaignId, adGroupId, limit: limit || 50, userId: userId || account.userId },
            process.env.GOOGLE_DEVELOPER_TOKEN,
            cleanManagerId
          );

          return {
            ...res,
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            accountName: finalAccountName,
            loginCustomerId: cleanManagerId,
            message: `Found ${res.count} ad creative(s) for account ${cleanTargetId}${campaignId ? ` in campaign ${campaignId}` : ""} (Source: ${res.source}).`,
          };
        } catch (err) {
          return formatMcpError(err, "list_google_ads");
        }
      }

      case "get_google_campaign_structure": {
        const { campaignId } = args;
        if (!campaignId) throw new Error("campaignId is required to fetch campaign structure");

        try {
          const res = await GoogleApiService.getCampaignStructure(
            cleanTargetId,
            effectiveToken,
            { campaignId, userId: userId || account.userId },
            process.env.GOOGLE_DEVELOPER_TOKEN,
            cleanManagerId
          );

          return {
            ...res,
            customerId: cleanTargetId,
            accountId: cleanTargetId,
            accountName: finalAccountName,
            loginCustomerId: cleanManagerId,
          };
        } catch (err) {
          return formatMcpError(err, "get_google_campaign_structure");
        }
      }

      default:
        throw new Error(`Unknown Google MCP Tool: ${toolName}`);
    }
  }
}

export default GoogleMcpClient;
