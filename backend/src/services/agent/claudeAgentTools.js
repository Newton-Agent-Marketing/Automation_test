import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import User from "../../models/authModel.js";
import ConnectedChannel from "../../models/connectedChannelModel.js";
import MetaAccount from "../../models/metaAccount.js";
import GoogleAccount from "../../models/googleAccountModel.js";
import { executeAgentTool } from "./queryDbMetrics.js";

const toToolResult = (data) => ({
  content: [
    {
      type: "text",
      text: JSON.stringify(data, null, 2),
    },
  ],
  structuredContent: data,
});

const toToolError = (error) => ({
  content: [
    {
      type: "text",
      text: error.message || "Tool execution failed",
    },
  ],
  isError: true,
});

export const createAdsMcpServer = ({ userId, accountId }) => {
  const getAccountContext = tool(
    "get_account_context",
    "Get workspace context including active ad accounts, selected child advertising account, Manager MCC accounts, and connected channels.",
    {},
    async () => {
      try {
        const [user, channels, metaAccounts, googleAccounts] = await Promise.all([
          User.findById(userId).select("name email").lean(),
          ConnectedChannel.find({ userId, isConnected: true }).lean(),
          MetaAccount.find({ userId, isActive: true }).select("accountId accountName currency syncStatus").lean(),
          GoogleAccount.find({ userId, isActive: true }).select("accountId accountName selectedCustomerId managerCustomerId managerAccountId isManager accounts currency syncStatus").lean(),
        ]);

        const primaryGoogle = googleAccounts[0];
        const selectedGoogleChildId = primaryGoogle?.selectedCustomerId || primaryGoogle?.accountId;

        return toToolResult({
          user: user || null,
          channels: channels || [],
          metaAccounts: metaAccounts || [],
          googleAccounts: googleAccounts || [],
          googleAdsContext: {
            selectedChildCustomerId: selectedGoogleChildId,
            managerCustomerId: primaryGoogle?.managerCustomerId || primaryGoogle?.managerAccountId || null,
            isManager: primaryGoogle?.isManager || false,
            availableAccounts: primaryGoogle?.accounts || [],
          },
          totalConnectedAccounts: (metaAccounts?.length || 0) + (googleAccounts?.length || 0),
          activeAdAccountId: accountId || selectedGoogleChildId || null,
        });
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const getUserConnectedAccounts = tool(
    "get_user_connected_accounts",
    "Lists all connected advertising and marketing accounts across all channels (Meta Ads, Google Ads, Spotify, etc.) for this user.",
    {
      channelId: z.string().optional().describe("Optional channel filter e.g. 'meta', 'google'"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("get_user_connected_accounts", {
          ...args,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const queryDatabaseMetrics = tool(
    "query_database_metrics",
    "Get historical performance, past 7/30 day trends, spend totals, and saved insights from the database for Meta Ads or Google Ads.",
    {
      accountId: z
        .string()
        .optional()
        .describe("Ad account ID (Meta or Google). Defaults to the active account."),
      channel: z
        .string()
        .optional()
        .describe("Channel filter: 'google' / 'Google Ads' or 'meta' / 'Meta Ads'"),
      startDate: z.string().optional().describe("Start date YYYY-MM-DD"),
      endDate: z.string().optional().describe("End date YYYY-MM-DD"),
      metric: z
        .string()
        .optional()
        .describe("spend, clicks, roas, purchases, conversions, etc."),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("query_database_metrics", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const fetchLiveMetaAds = tool(
    "fetch_live_meta_ads_mcp",
    "Fetch CURRENT, LIVE, REAL-TIME Meta Ads data: today's spend or live campaign status. Use for live/today/right now questions on Meta.",
    {
      accountId: z
        .string()
        .optional()
        .describe("Meta ad account ID. Defaults to the active account."),
      toolType: z
        .enum(["get_live_today_insights", "get_live_campaigns_status"])
        .describe("Which live Meta tool to call"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("fetch_live_meta_ads_mcp", {
          toolType: args.toolType,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const fetchLiveGoogleAds = tool(
    "fetch_live_google_ads_mcp",
    "Fetch live, real-time Google Ads data: impressions, clicks, spend, conversions, CPC, CTR, ROAS, or live campaigns status from Google Ads MCP Server. Ideal for queries like 'spend in last 7 days', 'last 30 days performance', or 'today's spend'.",
    {
      accountId: z
        .string()
        .optional()
        .describe("Google ad account ID or child customer ID. Defaults to the active selected Google Ads account."),
      toolType: z
        .enum(["get_live_today_insights", "get_live_campaigns_status", "get_google_insights"])
        .default("get_google_insights")
        .describe("Which live Google tool to call"),
      datePreset: z
        .enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month"])
        .default("last_7d")
        .describe("Date range filter preset (e.g. 'last_7d' for past 7 days spend, 'last_30d', 'today')"),
      startDate: z.string().optional().describe("Start date YYYY-MM-DD (optional custom range)"),
      endDate: z.string().optional().describe("End date YYYY-MM-DD (optional custom range)"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("fetch_live_google_ads_mcp", {
          toolType: args.toolType || "get_google_insights",
          datePreset: args.datePreset || "last_7d",
          startDate: args.startDate,
          endDate: args.endDate,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const createMetaCampaign = tool(
    "create_meta_campaign",
    "Create a new advertising campaign on Meta Ads (Facebook/Instagram). Use when user asks to create or launch a campaign on Meta.",
    {
      name: z.string().describe("Descriptive name for the campaign"),
      objective: z
        .enum([
          "OUTCOME_SALES",
          "OUTCOME_LEADS",
          "OUTCOME_TRAFFIC",
          "OUTCOME_ENGAGEMENT",
          "OUTCOME_AWARENESS",
          "OUTCOME_APP_PROMOTION",
        ])
        .default("OUTCOME_SALES")
        .describe("Campaign marketing objective"),
      dailyBudget: z.number().optional().default(500).describe("Daily budget in currency units"),
      lifetimeBudget: z.number().optional().describe("Lifetime budget (optional)"),
      status: z.enum(["ACTIVE", "PAUSED"]).default("ACTIVE").describe("Initial campaign status"),
      accountId: z.string().optional().describe("Ad Account ID"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("create_meta_campaign", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const createGoogleChildAccount = tool(
    "create_google_child_account",
    "Create a new Google Ads child/client account under the connected Manager (MCC) account. The created account is immediately registered and set as active for creating campaigns.",
    {
      name: z.string().describe("Name for the new child account (e.g. 'Newton Shoe Store Client')"),
      currencyCode: z.string().optional().default("INR").describe("Account currency (e.g. 'INR', 'USD')"),
      timeZone: z.string().optional().default("Asia/Kolkata").describe("Account time zone (e.g. 'Asia/Kolkata')"),
      emailAddress: z.string().optional().describe("Optional admin/user email to invite"),
      managerAccountId: z.string().optional().describe("Optional Manager (MCC) customer ID"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("create_google_child_account", {
          ...args,
          accountId: args.managerAccountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const switchGoogleAccount = tool(
    "switch_google_account",
    "Switch or select the active Google Ads advertising account (by customer ID or account name) for all subsequent campaign creation and metric queries.",
    {
      accountId: z.string().optional().describe("Target Google Ads Customer ID (e.g. '3026285598')"),
      accountName: z.string().optional().describe("Target Google Ads Account Name (e.g. 'Newton Ads Test Account')"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("switch_google_account", {
          ...args,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const createGoogleCampaignBudget = tool(
    "create_google_campaign_budget",
    "Create a dedicated campaign budget resource on Google Ads API with daily budget converted to micros.",
    {
      dailyBudget: z.number().describe("Daily budget in standard currency units (e.g. 2500 for ₹2,500/day)"),
      name: z.string().optional().describe("Optional budget name"),
      deliveryMethod: z.enum(["STANDARD", "ACCELERATED"]).optional().default("STANDARD").describe("Budget delivery method"),
      accountId: z.string().optional().describe("Target Google Ad Account ID (e.g. '8915468027')"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("create_google_campaign_budget", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const createGoogleCampaign = tool(
    "create_google_campaign",
    "Create a new advertising campaign on Google Ads (Search / Performance Max / Display) with target budget, bidding strategy, target CPA, and status.",
    {
      name: z.string().describe("Descriptive name for the Google campaign (e.g. 'Summer Shirt Growth')"),
      channelType: z.enum(["SEARCH", "PERFORMANCE_MAX", "DISPLAY", "VIDEO"]).default("SEARCH").describe("Google campaign advertising channel type"),
      dailyBudget: z.number().optional().default(500).describe("Daily budget in currency units (used if budgetResourceName not provided)"),
      budgetResourceName: z.string().optional().describe("Budget resource name returned from create_google_campaign_budget (e.g. 'customers/8915468027/campaignBudgets/123')"),
      biddingStrategy: z.enum(["MAXIMIZE_CONVERSIONS", "TARGET_CPA", "MAXIMIZE_CLICKS", "MANUAL_CPC", "TARGET_ROAS"]).default("MAXIMIZE_CONVERSIONS").describe("Bidding strategy"),
      targetCpa: z.number().optional().describe("Target CPA in currency units (e.g. 500)"),
      status: z.enum(["ENABLED", "PAUSED"]).default("PAUSED").describe("Initial campaign status"),
      accountId: z.string().optional().describe("Target Google Ad Account ID (e.g. '8915468027') or Account Name"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("create_google_campaign", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const createGoogleAdGroup = tool(
    "create_google_ad_group",
    "Create an ad group under a specified Google Ads campaign.",
    {
      name: z.string().describe("Ad group name (e.g. 'Summer Shirts')"),
      campaignResourceName: z.string().optional().describe("Campaign resource name (e.g. 'customers/8915468027/campaigns/123')"),
      campaignId: z.string().optional().describe("Campaign ID if resource name not provided"),
      status: z.enum(["ENABLED", "PAUSED"]).default("ENABLED").describe("Ad group status"),
      type: z.enum(["SEARCH_STANDARD", "DISPLAY_STANDARD"]).default("SEARCH_STANDARD").describe("Ad group type"),
      cpcBidMicros: z.number().optional().describe("Default CPC bid in micros"),
      accountId: z.string().optional().describe("Target Google Ad Account ID"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("create_google_ad_group", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const createGoogleKeywords = tool(
    "create_google_keywords",
    "Add keywords with match types (BROAD, PHRASE, EXACT) and optional CPC bids to a Google ad group.",
    {
      adGroupResourceName: z.string().optional().describe("Ad Group resource name (e.g. 'customers/8915468027/adGroups/123')"),
      adGroupId: z.string().optional().describe("Ad Group ID"),
      keywords: z.array(
        z.object({
          text: z.string().describe("Keyword text"),
          matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).default("BROAD").describe("Match type"),
          bid: z.number().optional().describe("Max CPC bid in standard currency units (e.g. 40, 50, 60)"),
        })
      ).describe("List of keywords to create"),
      accountId: z.string().optional().describe("Target Google Ad Account ID"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("create_google_keywords", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const createGoogleNegativeKeywords = tool(
    "create_google_negative_keywords",
    "Add negative keywords at Campaign or Ad Group level to prevent unwanted traffic.",
    {
      campaignResourceName: z.string().optional().describe("Campaign resource name for campaign-level negative keywords"),
      campaignId: z.string().optional().describe("Campaign ID"),
      adGroupResourceName: z.string().optional().describe("Ad Group resource name for ad group-level negative keywords"),
      adGroupId: z.string().optional().describe("Ad Group ID"),
      keywords: z.array(
        z.object({
          text: z.string().describe("Negative keyword text (e.g. 'free', 'wholesale', 'jobs')"),
          matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).default("BROAD").describe("Match type"),
        })
      ).describe("List of negative keywords"),
      accountId: z.string().optional().describe("Target Google Ad Account ID"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("create_google_negative_keywords", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const createGoogleResponsiveSearchAd = tool(
    "create_google_responsive_search_ad",
    "Create a Google Responsive Search Ad (RSA) with multiple headlines (min 3), descriptions (min 2), and final URL.",
    {
      adGroupResourceName: z.string().optional().describe("Ad Group resource name (e.g. 'customers/8915468027/adGroups/123')"),
      adGroupId: z.string().optional().describe("Ad Group ID"),
      headlines: z.array(z.string()).min(3).describe("List of headlines (at least 3 required, max 30 chars each)"),
      descriptions: z.array(z.string()).min(2).describe("List of descriptions (at least 2 required, max 90 chars each)"),
      finalUrl: z.string().describe("Destination URL (e.g. 'https://zaikai.com/summer-shirts')"),
      finalUrls: z.array(z.string()).optional().describe("Optional list of destination URLs"),
      path1: z.string().optional().describe("Display URL path 1"),
      path2: z.string().optional().describe("Display URL path 2"),
      status: z.enum(["ENABLED", "PAUSED"]).default("ENABLED").describe("Ad status"),
      accountId: z.string().optional().describe("Target Google Ad Account ID"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("create_google_responsive_search_ad", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const setGoogleCampaignLocations = tool(
    "set_google_campaign_locations",
    "Set geographical location targeting for a Google Ads campaign (e.g. India, United States).",
    {
      campaignResourceName: z.string().optional().describe("Campaign resource name (e.g. 'customers/8915468027/campaigns/123')"),
      campaignId: z.string().optional().describe("Campaign ID"),
      locations: z.array(z.string()).min(1).describe("List of country/location names (e.g. ['India']) or geo target constant IDs"),
      negative: z.boolean().optional().default(false).describe("Whether to exclude these locations"),
      accountId: z.string().optional().describe("Target Google Ad Account ID"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("set_google_campaign_locations", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const setGoogleCampaignLanguages = tool(
    "set_google_campaign_languages",
    "Set language targeting for a Google Ads campaign (e.g. English, Hindi).",
    {
      campaignResourceName: z.string().optional().describe("Campaign resource name (e.g. 'customers/8915468027/campaigns/123')"),
      campaignId: z.string().optional().describe("Campaign ID"),
      languages: z.array(z.string()).min(1).describe("List of language names (e.g. ['English', 'Hindi']) or language constant IDs"),
      accountId: z.string().optional().describe("Target Google Ad Account ID"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("set_google_campaign_languages", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const verifyGoogleCampaign = tool(
    "verify_google_campaign",
    "Verify complete setup of a Google Ads campaign (verifies campaign, budget, ad groups, keywords, negative keywords, ads, locations, and languages).",
    {
      campaignResourceName: z.string().optional().describe("Campaign resource name"),
      campaignId: z.string().optional().describe("Campaign ID"),
      accountId: z.string().optional().describe("Target Google Ad Account ID"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("verify_google_campaign", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const rollbackGoogleCampaign = tool(
    "rollback_google_campaign",
    "Clean up / remove an incomplete Google campaign if child resource creation fails during setup.",
    {
      campaignResourceName: z.string().optional().describe("Campaign resource name to remove"),
      campaignId: z.string().optional().describe("Campaign ID"),
      accountId: z.string().optional().describe("Target Google Ad Account ID"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("rollback_google_campaign", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const updateMetaCampaign = tool(
    "update_meta_campaign",
    "Update an existing Meta Ads campaign status (PAUSED/ACTIVE), name, or budget.",
    {
      campaignId: z.string().describe("The ID of the campaign to update"),
      status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional().describe("New status"),
      dailyBudget: z.number().optional().describe("New daily budget"),
      name: z.string().optional().describe("New campaign name"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("update_meta_campaign", {
          ...args,
          accountId: accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const createMetaAdSet = tool(
    "create_meta_ad_set",
    "Create an Ad Set under a specified Meta Ads campaign with budget, targeting, and optimization goal.",
    {
      campaignId: z.string().describe("Meta Campaign ID to attach this Ad Set to"),
      name: z.string().describe("Name of the Ad Set"),
      dailyBudget: z.number().optional().describe("Optional daily budget for this ad set (omit if campaign budget is set)"),
      optimizationGoal: z
        .enum(["OFFSITE_CONVERSIONS", "APP_INSTALLS", "LINK_CLICKS", "REACH", "LANDING_PAGE_VIEWS", "LEAD_GENERATION", "IMPRESSIONS", "VALUE"])
        .default("OFFSITE_CONVERSIONS")
        .describe("Ad Set optimization goal"),
      billingEvent: z.enum(["IMPRESSIONS", "LINK_CLICKS"]).default("IMPRESSIONS").describe("Billing event"),
      bidAmount: z.number().optional().describe("Optional bid amount"),
      status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED").describe("Initial ad set status"),
      pixelId: z.string().optional().describe("Optional Meta Pixel ID for tracking website conversions"),
      appId: z.string().optional().describe("Optional Meta Application ID for App Events tracking"),
      applicationId: z.string().optional().describe("Optional Meta Application ID (alias for appId)"),
      objectStoreUrl: z.string().optional().describe("Optional App Store URL (Google Play or Apple App Store link)"),
      customEventType: z.string().optional().describe("Optional Custom Event Type for conversion tracking (e.g. PURCHASE, MOBILE_APP_INSTALL)"),
      trackingType: z.enum(["WEBSITE", "APP", "BOTH"]).optional().describe("Tracking mode: WEBSITE, APP, or BOTH"),
      targeting: z
        .object({
          locations: z.array(z.string()).optional().describe("Target countries/regions (e.g. ['India'])"),
          cities: z.array(z.string()).optional().describe("Target cities (e.g. ['Delhi', 'Mumbai'])"),
          ageMin: z.number().optional().default(18).describe("Minimum age"),
          ageMax: z.number().optional().default(65).describe("Maximum age"),
          genders: z.array(z.number()).optional().describe("Genders (1=Male, 2=Female, [1, 2]=All)"),
          interests: z.array(z.string()).optional().describe("Target interest keywords (e.g. ['Sneakers', 'Online shopping'])"),
        })
        .optional()
        .describe("Audience targeting parameters"),
      accountId: z.string().optional().describe("Meta Ad Account ID"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("create_meta_ad_set", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const updateMetaAdSet = tool(
    "update_meta_ad_set",
    "Update an existing Meta Ad Set (status, budget, targeting).",
    {
      adSetId: z.string().describe("Meta Ad Set ID"),
      name: z.string().optional().describe("Ad Set Name"),
      status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional().describe("Status"),
      dailyBudget: z.number().optional().describe("Daily budget"),
      targeting: z
        .object({
          locations: z.array(z.string()).optional(),
          cities: z.array(z.string()).optional(),
          ageMin: z.number().optional(),
          ageMax: z.number().optional(),
          genders: z.array(z.number()).optional(),
          interests: z.array(z.string()).optional(),
        })
        .optional()
        .describe("Targeting parameters"),
      accountId: z.string().optional(),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("update_meta_ad_set", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const setMetaTargeting = tool(
    "set_meta_targeting",
    "Set audience targeting (locations, age, gender, interests) for a Meta Ad Set.",
    {
      adSetId: z.string().describe("Meta Ad Set ID"),
      locations: z.array(z.string()).optional().describe("Target countries/regions (e.g. ['India'])"),
      cities: z.array(z.string()).optional().describe("Target cities (e.g. ['Delhi', 'Mumbai'])"),
      ageMin: z.number().optional().default(18).describe("Minimum age"),
      ageMax: z.number().optional().default(65).describe("Maximum age"),
      genders: z.array(z.number()).optional().describe("Genders (1=Male, 2=Female, [1, 2]=All)"),
      interests: z.array(z.string()).optional().describe("Target interest keywords (e.g. ['Sneakers', 'Online shopping'])"),
      accountId: z.string().optional(),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("set_meta_targeting", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const createMetaAd = tool(
    "create_meta_ad",
    "Create an Ad creative and Ad under a Meta Ad Set with headline, primary text, link, and call to action.",
    {
      adSetId: z.string().describe("Meta Ad Set ID to place this ad in"),
      name: z.string().describe("Ad name"),
      headline: z.string().describe("Catchy ad headline (title)"),
      primaryText: z.string().describe("Main promotional copy/body text"),
      description: z.string().optional().describe("Secondary link description"),
      linkUrl: z.string().describe("Destination website URL"),
      callToAction: z
        .enum(["SHOP_NOW", "LEARN_MORE", "SIGN_UP", "BOOK_TRAVEL", "CONTACT_US", "ORDER_NOW", "GET_OFFER"])
        .default("SHOP_NOW")
        .describe("Call to action button"),
      imageUrl: z.string().optional().describe("Optional image URL"),
      pageId: z.string().optional().describe("Optional Facebook Page ID (auto-resolved from connected pages if omitted)"),
      status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED").describe("Ad status"),
      accountId: z.string().optional(),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("create_meta_ad", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const createMetaVideoAd = tool(
    "create_meta_video_ad",
    "Create a Meta Video Ad by automatically downloading video from Google Drive or using a local/direct video URL, uploading to Meta Ads, and setting up the Video Creative.",
    {
      adSetId: z.string().describe("Meta Ad Set ID to place this video ad in"),
      name: z.string().describe("Video Ad name"),
      headline: z.string().describe("Ad headline (title)"),
      primaryText: z.string().describe("Main promotional copy/caption"),
      description: z.string().optional().describe("Secondary link description"),
      linkUrl: z.string().describe("Destination website URL"),
      driveUrl: z.string().optional().describe("Google Drive video link (e.g. 'https://drive.google.com/file/d/...') to auto-download via OAuth and upload to Meta Ads"),
      videoUrl: z.string().optional().describe("Direct video URL"),
      videoFilePath: z.string().optional().describe("Local video file path from scratch/"),
      videoId: z.string().optional().describe("Pre-uploaded Meta Video ID (if already uploaded)"),
      imageUrl: z.string().optional().describe("Optional video thumbnail or fallback image URL"),
      callToAction: z
        .enum(["SHOP_NOW", "LEARN_MORE", "SIGN_UP", "BOOK_TRAVEL", "CONTACT_US", "ORDER_NOW", "GET_OFFER", "WATCH_MORE"])
        .default("SHOP_NOW")
        .describe("Call to action button"),
      status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED").describe("Ad status"),
      accountId: z.string().optional(),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("create_meta_video_ad", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const verifyMetaCampaign = tool(
    "verify_meta_campaign",
    "Verify the complete setup of a Meta Ads campaign (campaign, ad set, targeting, and ads).",
    {
      campaignId: z.string().describe("Meta Campaign ID"),
      adSetId: z.string().optional().describe("Meta Ad Set ID"),
      adId: z.string().optional().describe("Meta Ad ID"),
      accountId: z.string().optional(),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("verify_meta_campaign", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const updateGoogleCampaign = tool(
    "update_google_campaign",
    "Update an existing Google Ads campaign status (ENABLED/PAUSED), name, or budget.",
    {
      campaignId: z.string().describe("The ID of the Google campaign to update"),
      status: z.enum(["ENABLED", "PAUSED"]).optional().describe("New status"),
      dailyBudget: z.number().optional().describe("New daily budget"),
      name: z.string().optional().describe("New campaign name"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("update_google_campaign", {
          ...args,
          accountId: accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const queryTokenUsageMetrics = tool(
    "query_token_usage_metrics",
    "Fetch exact token burn and usage history from the database. Use this when the user asks how many tokens have been burned, token consumption, actions performed, cost, or AI usage metrics.",
    {
      conversationId: z.string().optional().describe("Optional conversation session ID"),
      timeframe: z.enum(["all", "current_session", "today", "past_7_days"]).default("all").describe("Timeframe filter"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("query_token_usage_metrics", {
          ...args,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const listGoogleKeywords = tool(
    "list_google_keywords",
    "List existing keywords for a Google Ads campaign or ad group, including match types, CPC bids, quality scores, impressions, and clicks, with MongoDB caching.",
    {
      accountId: z.string().optional().describe("Target Google customer account ID"),
      campaignId: z.string().optional().describe("Campaign ID to filter keywords"),
      adGroupId: z.string().optional().describe("Optional Ad Group ID to filter keywords"),
      status: z.enum(["ENABLED", "PAUSED", "ALL"]).optional().describe("Status filter"),
      limit: z.number().optional().describe("Max number of keywords (default 100)"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("list_google_keywords", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const listGoogleAds = tool(
    "list_google_ads",
    "List existing Responsive Search Ads, creative headlines, descriptions, final URLs, ad strength, and performance metrics with MongoDB persistence.",
    {
      accountId: z.string().optional().describe("Target Google customer account ID"),
      campaignId: z.string().optional().describe("Campaign ID to filter ads"),
      adGroupId: z.string().optional().describe("Optional Ad Group ID to filter ads"),
      limit: z.number().optional().describe("Max number of ads (default 50)"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("list_google_ads", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const getGoogleCampaignStructure = tool(
    "get_google_campaign_structure",
    "Retrieve complete hierarchical Google campaign tree including budget, bidding strategy, ad groups, targeting criteria, keywords count, and ads previews.",
    {
      accountId: z.string().optional().describe("Target Google customer account ID"),
      campaignId: z.string().describe("Campaign ID to inspect"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("get_google_campaign_structure", {
          ...args,
          accountId: args.accountId || accountId,
          userId,
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const getUserAiContext = tool(
    "get_user_ai_context",
    "Fetch the user's structured marketing AI Context workflow hierarchy from MongoDB (including Business Units, Ad Channels, Marketing Briefs, Products, Data Warehouses, and their node connections).",
    {},
    async () => {
      try {
        const result = await executeAgentTool("get_user_ai_context", { userId });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const getConnectedSheetRows = tool(
    "get_connected_sheet_rows",
    "Fetch latest real-time campaign configuration rows, columns, and stable row_ids from the user's connected Google Sheet or Excel warehouse document.",
    {},
    async () => {
      try {
        const result = await executeAgentTool("get_connected_sheet_rows", { userId });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const validateGoogleDriveAsset = tool(
    "validate_google_drive_asset",
    "Validate and inspect a Google Drive video or image asset link / file ID before downloading or uploading to Meta Ads.",
    {
      driveUrl: z.string().describe("Google Drive file or folder URL link / file ID (e.g. 'https://drive.google.com/file/d/...')"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("validate_google_drive_asset", { ...args, userId });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const downloadGoogleDriveAsset = tool(
    "download_google_drive_asset",
    "Safely download a video or image creative asset from Google Drive into the local scratch pipeline for upload to Meta Ads Graph API.",
    {
      driveUrl: z.string().describe("Google Drive file URL link or file ID"),
      destinationFilename: z.string().optional().describe("Optional custom destination filename"),
    },
    async (args) => {
      try {
        const result = await executeAgentTool("download_google_drive_asset", { ...args, userId });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const listWorkspaceSkills = tool(
    "list_workspace_skills",
    "Lists all available agent skills discovered from .agents/skills/ across the workspace.",
    {},
    async () => {
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
                    path: skillFile,
                  });
                }
              }
            }
          }
        }

        return toToolResult({ totalSkills: skills.length, skills });
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  const getSkillDetails = tool(
    "get_skill_details",
    "Retrieves the full instructions, guides, or examples for a specific skill from .agents/skills/<skillName>.",
    {
      skillName: z.string().describe("The name of the skill e.g. 'claude-agent-sdk'"),
      subPath: z.string().optional().describe("Optional subfile to read e.g. 'references/sdk-guide.md' or 'examples/agent-runner.js'"),
    },
    async ({ skillName, subPath }) => {
      try {
        const fs = await import("fs");
        const path = await import("path");
        const basePaths = [
          path.resolve(process.cwd(), ".agents/skills", skillName),
          path.resolve(process.cwd(), "backend/.agents/skills", skillName),
          path.resolve(process.cwd(), "../.agents/skills", skillName),
        ];

        let targetDir = basePaths.find((p) => fs.existsSync(p));
        if (!targetDir) {
          throw new Error(`Skill '${skillName}' not found in .agents/skills/`);
        }

        const targetFile = subPath ? path.join(targetDir, subPath) : path.join(targetDir, "SKILL.md");
        if (!fs.existsSync(targetFile)) {
          throw new Error(`File '${subPath || "SKILL.md"}' not found for skill '${skillName}'`);
        }

        const content = fs.readFileSync(targetFile, "utf8");
        return toToolResult({
          skillName,
          file: subPath || "SKILL.md",
          content,
        });
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  return createSdkMcpServer({
    name: "ads",
    version: "1.0.0",
    tools: [
      getAccountContext,
      getUserConnectedAccounts,
      getUserAiContext,
      queryDatabaseMetrics,
      fetchLiveMetaAds,
      fetchLiveGoogleAds,
      createMetaCampaign,
      createMetaAdSet,
      updateMetaAdSet,
      setMetaTargeting,
      createMetaAd,
      createMetaVideoAd,
      verifyMetaCampaign,
      switchGoogleAccount,
      createGoogleChildAccount,
      createGoogleCampaignBudget,
      createGoogleCampaign,
      createGoogleAdGroup,
      createGoogleKeywords,
      createGoogleNegativeKeywords,
      createGoogleResponsiveSearchAd,
      setGoogleCampaignLocations,
      setGoogleCampaignLanguages,
      verifyGoogleCampaign,
      rollbackGoogleCampaign,
      updateMetaCampaign,
      updateGoogleCampaign,
      listGoogleKeywords,
      listGoogleAds,
      getGoogleCampaignStructure,
      queryTokenUsageMetrics,
      getConnectedSheetRows,
      validateGoogleDriveAsset,
      downloadGoogleDriveAsset,
      listWorkspaceSkills,
      getSkillDetails,
    ],
  });
};

export const ADS_ALLOWED_TOOLS = [
  "mcp__ads__get_account_context",
  "mcp__ads__get_user_connected_accounts",
  "mcp__ads__get_user_ai_context",
  "mcp__ads__get_connected_sheet_rows",
  "mcp__ads__validate_google_drive_asset",
  "mcp__ads__download_google_drive_asset",
  "mcp__ads__query_database_metrics",
  "mcp__ads__fetch_live_meta_ads_mcp",
  "mcp__ads__fetch_live_google_ads_mcp",
  "mcp__ads__create_meta_campaign",
  "mcp__ads__create_meta_ad_set",
  "mcp__ads__update_meta_ad_set",
  "mcp__ads__set_meta_targeting",
  "mcp__ads__create_meta_ad",
  "mcp__ads__create_meta_video_ad",
  "mcp__ads__verify_meta_campaign",
  "mcp__ads__switch_google_account",
  "mcp__ads__create_google_child_account",
  "mcp__ads__create_google_campaign_budget",
  "mcp__ads__create_google_campaign",
  "mcp__ads__create_google_ad_group",
  "mcp__ads__create_google_keywords",
  "mcp__ads__create_google_negative_keywords",
  "mcp__ads__create_google_responsive_search_ad",
  "mcp__ads__set_google_campaign_locations",
  "mcp__ads__set_google_campaign_languages",
  "mcp__ads__verify_google_campaign",
  "mcp__ads__rollback_google_campaign",
  "mcp__ads__update_meta_campaign",
  "mcp__ads__update_google_campaign",
  "mcp__ads__list_google_keywords",
  "mcp__ads__list_google_ads",
  "mcp__ads__get_google_campaign_structure",
  "mcp__ads__query_token_usage_metrics",
  "mcp__ads__list_workspace_skills",
  "mcp__ads__get_skill_details",
];
