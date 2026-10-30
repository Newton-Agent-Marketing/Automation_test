import MetaInsight from "../../models/metaInsight.js";
import MetaCampaign from "../../models/metaCampaign.js";
import MetaAccount from "../../models/metaAccount.js";
import GoogleInsight from "../../models/googleInsightModel.js";
import GoogleCampaign from "../../models/googleCampaignModel.js";
import GoogleAccount from "../../models/googleAccountModel.js";
import ConnectedChannel from "../../models/connectedChannelModel.js";
import AiContext from "../../models/aiContextModel.js";
import { MetaMcpClient } from "../mcp/metaMcpClient.js";
import { GoogleMcpClient } from "../mcp/googleMcpClient.js";
import { GoogleSyncPipeline } from "../google/googleSyncPipe.js";
import { googleDriveService } from "../google/googleDriveService.js";
import CampaignRouter from "../data/campaignRouter.js";

// 1. LLM Tool Schema (OpenAI / Anthropic standard format)
export const AGENT_TOOLS_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "sync_meta_ads_to_sheet",
      description: "Automated daily reporting sync: queries Meta Ads performance insights for yesterday (Asia/Kolkata), dynamically detects Google Sheet headers, maps fields, prevents duplicate rows, and appends records to the target worksheet tab (e.g. BGMI, Free Fire, GPRC).",
      parameters: {
        type: "object",
        properties: {
          instruction: { type: "string", description: "The reporting instruction or workflow action text" },
          targetTab: { type: "string", description: "The target worksheet tab title (e.g. BGMI, FreeFire, GPRC)" },
          metaAccountId: { type: "string", description: "The connected Meta Ad Account ID" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_ai_context",
      description: "Fetch the user's structured marketing AI Context workflow hierarchy from MongoDB (including Business Units, Ad Channels, Marketing Briefs, Products, Data Warehouses, and their node connections).",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_connected_accounts",
      description: "Lists all connected advertising and marketing accounts across all channels (Meta Ads, Google Ads, Spotify, LinkedIn, TikTok, etc.) for this user with their Account IDs, names, status, and currency.",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "Optional filter by channel e.g. 'meta', 'google', etc." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_database_metrics",
      description: "Use this to get historical performance, past 7/30 days trends, totals, and saved insights from the Database for a specific Ad Account ID or Channel.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Meta or Google Ad Account ID" },
          channel: { type: "string", description: "Optional channel name: 'Meta Ads' or 'Google Ads'" },
          startDate: { type: "string", description: "Format YYYY-MM-DD" },
          endDate: { type: "string", description: "Format YYYY-MM-DD" },
          metric: { type: "string", description: "spend, clicks, roas, purchases, conversions, etc." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_live_meta_ads_mcp",
      description: "Use this to fetch CURRENT, LIVE, REAL-TIME Meta Ads performance insights (spend, impressions, clicks, conversions, conversion value, ROAS) across date ranges, live campaign status, or today's spend directly from Meta Ads.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Meta Account ID e.g. 'act_517557233790148'" },
          toolType: {
            type: "string",
            enum: ["get_live_campaign_insights", "get_live_campaigns_status", "get_live_today_insights"],
            description: "Which live MCP tool to call: 'get_live_campaign_insights' for performance/spend/clicks/conversions/ROAS across date ranges; 'get_live_campaigns_status' for campaigns and ads status; 'get_live_today_insights' for today's spend.",
          },
          datePreset: { type: "string", description: "Preset: 'last_7d', 'last_14d', 'last_30d', 'today'" },
          startDate: { type: "string", description: "Start date YYYY-MM-DD" },
          endDate: { type: "string", description: "End date YYYY-MM-DD" },
          timeRange: {
            type: "object",
            properties: {
              since: { type: "string" },
              until: { type: "string" },
            },
          },
        },
        required: ["accountId", "toolType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_meta_campaign",
      description: "Creates a new advertising campaign on Meta Ads (Facebook & Instagram) with budget, objective, and status.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the campaign" },
          objective: {
            type: "string",
            enum: [
              "OUTCOME_SALES",
              "OUTCOME_LEADS",
              "OUTCOME_TRAFFIC",
              "OUTCOME_ENGAGEMENT",
              "OUTCOME_AWARENESS",
              "OUTCOME_APP_PROMOTION",
            ],
            description: "Marketing objective of the campaign",
          },
          dailyBudget: { type: "number", description: "Daily budget in currency units (e.g. 500, 1000)" },
          lifetimeBudget: { type: "number", description: "Lifetime budget (if not using daily budget)" },
          status: { type: "string", enum: ["ACTIVE", "PAUSED"], description: "Initial status of campaign" },
          accountId: { type: "string", description: "Meta ad account ID (optional, defaults to active account)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_meta_campaign",
      description: "Updates an existing Meta Ads campaign status (PAUSED/ACTIVE), name, or budget.",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string", description: "Meta Campaign ID" },
          status: { type: "string", enum: ["ACTIVE", "PAUSED", "ARCHIVED"] },
          dailyBudget: { type: "number" },
          name: { type: "string" },
        },
        required: ["campaignId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_meta_ad_set",
      description: "Creates an Ad Set under a specified Meta Ads campaign with budget, targeting, and optimization goal.",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string", description: "Meta Campaign ID to attach this Ad Set to" },
          name: { type: "string", description: "Name of the Ad Set" },
          dailyBudget: { type: "number", description: "Daily budget for this ad set in currency units" },
          optimizationGoal: {
            type: "string",
            enum: ["OFFSITE_CONVERSIONS", "LINK_CLICKS", "REACH", "LANDING_PAGE_VIEWS", "LEAD_GENERATION", "IMPRESSIONS", "VALUE"],
            default: "OFFSITE_CONVERSIONS",
          },
          billingEvent: { type: "string", enum: ["IMPRESSIONS", "LINK_CLICKS"], default: "IMPRESSIONS" },
          bidAmount: { type: "number", description: "Optional bid amount" },
          status: { type: "string", enum: ["ACTIVE", "PAUSED"], default: "PAUSED" },
          targeting: {
            type: "object",
            properties: {
              locations: { type: "array", items: { type: "string" } },
              countries: { type: "array", items: { type: "string" } },
              cities: { type: "array", items: { type: "string" } },
              ageMin: { type: "number" },
              ageMax: { type: "number" },
              genders: { type: "array", items: { type: "number" } },
              interests: { type: "array", items: { type: "string" } },
            },
          },
          accountId: { type: "string", description: "Meta Ad Account ID" },
        },
        required: ["campaignId", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_meta_ad_set",
      description: "Updates an existing Meta Ad Set (status, budget, targeting).",
      parameters: {
        type: "object",
        properties: {
          adSetId: { type: "string", description: "Meta Ad Set ID" },
          name: { type: "string" },
          status: { type: "string", enum: ["ACTIVE", "PAUSED", "ARCHIVED"] },
          dailyBudget: { type: "number" },
          targeting: { type: "object" },
          accountId: { type: "string" },
        },
        required: ["adSetId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_meta_targeting",
      description: "Sets audience targeting (locations, age, gender, interests) on a Meta Ad Set.",
      parameters: {
        type: "object",
        properties: {
          adSetId: { type: "string", description: "Meta Ad Set ID" },
          locations: { type: "array", items: { type: "string" }, description: "Target country or region names (e.g. ['India'])" },
          countries: { type: "array", items: { type: "string" } },
          cities: { type: "array", items: { type: "string" } },
          ageMin: { type: "number", default: 18 },
          ageMax: { type: "number", default: 65 },
          genders: { type: "array", items: { type: "number" } },
          interests: { type: "array", items: { type: "string" }, description: "Target interest names (e.g. ['Sneakers', 'Online shopping'])" },
          accountId: { type: "string" },
        },
        required: ["adSetId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_meta_ad",
      description: "Creates an Ad creative and Ad under a Meta Ad Set with headlines, primary text, link, and call to action.",
      parameters: {
        type: "object",
        properties: {
          adSetId: { type: "string", description: "Meta Ad Set ID to place this ad in" },
          name: { type: "string", description: "Ad name" },
          headline: { type: "string", description: "Catchy ad headline (e.g. 'Flat 40% Off Summer Sneakers')" },
          primaryText: { type: "string", description: "Main promotional copy/body text" },
          description: { type: "string", description: "Secondary link description" },
          linkUrl: { type: "string", description: "Destination website URL" },
          callToAction: {
            type: "string",
            enum: ["SHOP_NOW", "LEARN_MORE", "SIGN_UP", "BOOK_TRAVEL", "CONTACT_US", "ORDER_NOW", "GET_OFFER"],
            default: "SHOP_NOW",
          },
          imageUrl: { type: "string", description: "Optional image URL" },
          status: { type: "string", enum: ["ACTIVE", "PAUSED"], default: "PAUSED" },
          accountId: { type: "string" },
        },
        required: ["adSetId", "name", "headline", "primaryText"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "verify_meta_campaign",
      description: "Verifies the complete setup of a Meta Ads campaign (campaign, ad set, targeting, and ads).",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string", description: "Meta Campaign ID" },
          adSetId: { type: "string", description: "Meta Ad Set ID" },
          adId: { type: "string", description: "Meta Ad ID" },
          accountId: { type: "string" },
        },
        required: ["campaignId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_live_google_ads_mcp",
      description: "Fetches live, real-time Google Ads data: impressions, clicks, spend, conversions, CPC, CTR, ROAS, or live campaigns directly from the Google Ads API.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Google ad account ID or child customer ID" },
          toolType: {
            type: "string",
            enum: ["get_live_today_insights", "get_live_campaigns_status", "get_google_insights", "get_google_campaigns"],
            description: "Which Google live tool to execute",
          },
          datePreset: {
            type: "string",
            enum: ["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month"],
            description: "Date range filter preset",
          },
          startDate: { type: "string", description: "YYYY-MM-DD" },
          endDate: { type: "string", description: "YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "switch_google_account",
      description: "Switches or selects the active Google Ads customer account (by customer ID or account name) for all campaign creation and metric queries.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Target Google Ads Customer ID (e.g. '3026285598')" },
          accountName: { type: "string", description: "Target Google Ads Account Name (e.g. 'Newton Ads Test Account')" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_google_campaign_budget",
      description: "Creates a dedicated campaign budget resource on Google Ads API with daily budget converted to micros.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Target Google customer account ID (e.g. '8915468027')" },
          dailyBudget: { type: "number", description: "Daily budget in standard currency units (e.g. 2500 for ₹2,500/day)" },
          name: { type: "string", description: "Optional descriptive budget name" },
          deliveryMethod: { type: "string", enum: ["STANDARD", "ACCELERATED"], default: "STANDARD" },
        },
        required: ["dailyBudget"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_google_campaign",
      description: "Directly creates a real advertising campaign on Google Ads (Search / Performance Max / Display) with target CPA, bidding strategy, and linked budget resource.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Descriptive name for the Google campaign (e.g. 'Summer Shirt Growth')" },
          channelType: {
            type: "string",
            enum: ["SEARCH", "PERFORMANCE_MAX", "DISPLAY", "VIDEO"],
            default: "SEARCH",
            description: "Google advertising channel type",
          },
          dailyBudget: { type: "number", description: "Daily budget in currency units (e.g. 2500)" },
          budgetResourceName: { type: "string", description: "Budget resource name returned from create_google_campaign_budget (e.g. 'customers/8915468027/campaignBudgets/123')" },
          biddingStrategy: {
            type: "string",
            enum: ["MAXIMIZE_CONVERSIONS", "TARGET_CPA", "MAXIMIZE_CLICKS", "MANUAL_CPC", "TARGET_ROAS"],
            default: "MAXIMIZE_CONVERSIONS",
            description: "Campaign bidding strategy",
          },
          targetCpa: { type: "number", description: "Target CPA in currency units (e.g. 500 for ₹500 CPA)" },
          status: { type: "string", enum: ["ENABLED", "PAUSED"], default: "PAUSED", description: "Initial campaign status" },
          accountId: { type: "string", description: "Target Google customer account ID (e.g. '8915468027') or Account Name" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_google_ad_group",
      description: "Creates an ad group under a specified Google Ads campaign.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Target Google customer account ID" },
          campaignResourceName: { type: "string", description: "Campaign resource name returned from create_google_campaign (e.g. 'customers/8915468027/campaigns/123')" },
          campaignId: { type: "string", description: "Campaign ID if campaignResourceName is not provided" },
          name: { type: "string", description: "Ad group name (e.g. 'Summer Shirts')" },
          status: { type: "string", enum: ["ENABLED", "PAUSED"], default: "ENABLED" },
          type: { type: "string", enum: ["SEARCH_STANDARD", "DISPLAY_STANDARD"], default: "SEARCH_STANDARD" },
          cpcBidMicros: { type: "number", description: "Optional default CPC bid in micros" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_google_keywords",
      description: "Adds keywords with match types (BROAD, PHRASE, EXACT) and optional CPC bids to an ad group.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Target Google customer account ID" },
          adGroupResourceName: { type: "string", description: "Ad Group resource name (e.g. 'customers/8915468027/adGroups/123')" },
          adGroupId: { type: "string", description: "Ad Group ID if resource name is not provided" },
          keywords: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string", description: "Keyword text (e.g. 'summer shirts for men')" },
                matchType: { type: "string", enum: ["BROAD", "PHRASE", "EXACT"], default: "BROAD" },
                bid: { type: "number", description: "Optional max CPC bid in currency units (e.g. 50 for ₹50)" },
              },
              required: ["text"],
            },
            description: "List of keywords to create",
          },
        },
        required: ["keywords"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_google_negative_keywords",
      description: "Adds negative keywords at Campaign or Ad Group level to prevent unwanted searches.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Target Google customer account ID" },
          campaignResourceName: { type: "string", description: "Campaign resource name for campaign-level negative keywords" },
          campaignId: { type: "string", description: "Campaign ID" },
          adGroupResourceName: { type: "string", description: "Ad Group resource name for ad group-level negative keywords" },
          adGroupId: { type: "string", description: "Ad Group ID" },
          keywords: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string", description: "Negative keyword text (e.g. 'free', 'wholesale', 'jobs')" },
                matchType: { type: "string", enum: ["BROAD", "PHRASE", "EXACT"], default: "BROAD" },
              },
              required: ["text"],
            },
            description: "List of negative keywords",
          },
        },
        required: ["keywords"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_google_responsive_search_ad",
      description: "Creates a Google Responsive Search Ad (RSA) with multiple headlines (min 3), descriptions (min 2), and final URLs.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Target Google customer account ID" },
          adGroupResourceName: { type: "string", description: "Ad Group resource name (e.g. 'customers/8915468027/adGroups/123')" },
          adGroupId: { type: "string", description: "Ad Group ID" },
          headlines: {
            type: "array",
            items: { type: "string" },
            description: "List of headlines (at least 3 recommended, up to 15, max 30 chars each)",
          },
          descriptions: {
            type: "array",
            items: { type: "string" },
            description: "List of descriptions (at least 2 recommended, up to 4, max 90 chars each)",
          },
          finalUrl: { type: "string", description: "Destination landing page URL (e.g. 'https://zaikai.com/summer-shirts')" },
          finalUrls: { type: "array", items: { type: "string" }, description: "Optional list of destination URLs" },
          status: { type: "string", enum: ["ENABLED", "PAUSED"], default: "ENABLED" },
        },
        required: ["headlines", "descriptions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_google_campaign_locations",
      description: "Sets geographical location targeting (e.g. India, United States) for a Google Ads campaign.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Target Google customer account ID" },
          campaignResourceName: { type: "string", description: "Campaign resource name" },
          campaignId: { type: "string", description: "Campaign ID" },
          locations: {
            type: "array",
            items: { type: "string" },
            description: "List of country or location names (e.g. ['India', 'United States']) or geo target constant IDs",
          },
          negative: { type: "boolean", default: false, description: "Whether to exclude these locations" },
        },
        required: ["locations"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_google_campaign_languages",
      description: "Sets language targeting criteria (e.g. English, Hindi) for a Google Ads campaign.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Target Google customer account ID" },
          campaignResourceName: { type: "string", description: "Campaign resource name" },
          campaignId: { type: "string", description: "Campaign ID" },
          languages: {
            type: "array",
            items: { type: "string" },
            description: "List of languages (e.g. ['English', 'Hindi']) or language constant IDs",
          },
        },
        required: ["languages"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "verify_google_campaign",
      description: "Verifies the complete setup of a Google Ads campaign: checks existence of budget, ad groups, keywords, negative keywords, responsive search ads, locations, languages, and status.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Target Google customer account ID" },
          campaignResourceName: { type: "string", description: "Campaign resource name" },
          campaignId: { type: "string", description: "Campaign ID" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rollback_google_campaign",
      description: "Removes/cleans up an incomplete campaign if keyword, ad, or targeting creation fails.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Target Google customer account ID" },
          campaignResourceName: { type: "string", description: "Campaign resource name to clean up" },
          campaignId: { type: "string", description: "Campaign ID" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_google_campaign",
      description: "Updates an existing Google Ads campaign status (ENABLED/PAUSED), name, or budget on Google Ads.",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string", description: "The ID of the Google campaign to update" },
          status: { type: "string", enum: ["ENABLED", "PAUSED"] },
          dailyBudget: { type: "number" },
          name: { type: "string" },
        },
        required: ["campaignId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_google_keywords",
      description: "Lists existing keywords for a Google Ads campaign or ad group, including match types, CPC bids, quality scores, impressions, and clicks, with MongoDB caching.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Target Google customer account ID" },
          campaignId: { type: "string", description: "Campaign ID to filter keywords" },
          adGroupId: { type: "string", description: "Optional Ad Group ID to filter keywords" },
          status: { type: "string", enum: ["ENABLED", "PAUSED", "ALL"], description: "Status filter" },
          limit: { type: "number", description: "Max number of keywords to return (default 100)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_google_ads",
      description: "Lists existing Responsive Search Ads, creative headlines, descriptions, final URLs, ad strength, and performance metrics with MongoDB persistence.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Target Google customer account ID" },
          campaignId: { type: "string", description: "Campaign ID to filter ads" },
          adGroupId: { type: "string", description: "Optional Ad Group ID to filter ads" },
          limit: { type: "number", description: "Max number of ads to return (default 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_google_campaign_structure",
      description: "Retrieves complete hierarchical campaign tree including daily budget, bidding strategy, ad groups, targeting criteria, keywords count, and ads previews.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Target Google customer account ID" },
          campaignId: { type: "string", description: "Campaign ID" },
        },
        required: ["campaignId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_token_usage_metrics",
      description: "Fetch comprehensive token burn and usage history from the Database. Use this whenever the user asks how many tokens were burned, token usage breakdown, actions performed, cost, or AI consumption statistics.",
      parameters: {
        type: "object",
        properties: {
          conversationId: { type: "string", description: "Optional conversation session ID to filter by" },
          timeframe: {
            type: "string",
            enum: ["all", "current_session", "today", "past_7_days"],
            description: "Timeframe for token aggregation (defaults to all)",
          },
        },
      },
    },
  },
];

// Helper to fetch token burn statistics from database
export async function getTokenUsageMetrics({ userId, conversationId, timeframe = "all" }) {
  const queryFilter = {
    role: "assistant",
  };

  if (userId) {
    queryFilter.userId = userId;
  }

  if (timeframe === "current_session" && conversationId) {
    queryFilter.conversationId = conversationId;
  } else if (timeframe === "today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    queryFilter.createdAt = { $gte: today };
  } else if (timeframe === "past_7_days") {
    const past7 = new Date();
    past7.setDate(past7.getDate() - 7);
    queryFilter.createdAt = { $gte: past7 };
  }

  const messages = await (await import("../../models/chatMessage.js")).default
    .find(queryFilter)
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokensBurned = 0;
  let totalCostUsd = 0;
  let totalCostInr = 0;
  let actionCounts = {};
  const recentExchanges = [];

  for (const msg of messages) {
    const tu = msg.tokenUsage || {};
    const input = tu.inputTokens || 0;
    const output = tu.outputTokens || 0;
    const total = tu.totalTokens || (input + output);
    const costU = tu.costUsd || 0;
    const costI = tu.costInr || 0;

    totalInputTokens += input;
    totalOutputTokens += output;
    totalTokensBurned += total;
    totalCostUsd += costU;
    totalCostInr += costI;

    if (Array.isArray(tu.actionsPerformed)) {
      for (const act of tu.actionsPerformed) {
        const actName = act.action || "general_inquiry";
        actionCounts[actName] = (actionCounts[actName] || 0) + 1;
      }
    }

    if (recentExchanges.length < 10) {
      recentExchanges.push({
        id: msg._id,
        conversationId: msg.conversationId,
        date: msg.createdAt,
        totalTokens: total,
        inputTokens: input,
        outputTokens: output,
        costInr: Number(costI.toFixed(4)),
        actions: tu.actionsPerformed?.map(a => a.action) || [],
        model: tu.model || "claude-sonnet-4-5",
      });
    }
  }

  return {
    source: "MONGODB_TOKEN_METRICS",
    totalMessagesAnalyzed: messages.length,
    summary: {
      totalTokensBurned,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      totalCostInr: Number(totalCostInr.toFixed(4)),
      averageTokensPerResponse: messages.length > 0 ? Math.round(totalTokensBurned / messages.length) : 0,
    },
    actionBreakdown: actionCounts,
    recentExchanges,
  };
}

// Helper to fetch user's AI context workflow from database with complete lineage and step-by-step flows
export async function getUserAiContext({ userId }) {
  if (!userId) {
    return {
      source: "DATABASE",
      hasContext: false,
      message: "User ID is required to fetch AI context.",
    };
  }

  globalThis.__aiContextCache = globalThis.__aiContextCache || new Map();
  const userIdStr = String(userId);

  let context = null;
  try {
    const mongoose = (await import("mongoose")).default;
    const isObjId = mongoose.Types.ObjectId.isValid(userId);
    const filter = isObjId
      ? { $or: [{ userId: new mongoose.Types.ObjectId(userId) }, { userId: userIdStr }] }
      : { userId: userIdStr };

    context = await AiContext.findOne(filter).lean();
    if (context && context.nodes?.length > 0) {
      globalThis.__aiContextCache.set(userIdStr, context);
    }
  } catch (dbErr) {
    console.warn("[getUserAiContext DB Query Warning]:", dbErr.message);
    context = globalThis.__aiContextCache.get(userIdStr) || null;
  }

  if (!context) {
    context = globalThis.__aiContextCache.get(userIdStr) || null;
  }

  if (!context || !context.nodes || context.nodes.length === 0) {
    return {
      source: "DATABASE",
      hasContext: false,
      message: "No custom AI context workflow configured yet for this user.",
    };
  }

  const nodes = context.nodes || [];
  const edges = context.edges || [];
  const nodeMap = new Map();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  // Build forward graph (parent -> children) and reverse map (child -> parent)
  const childMap = new Map();
  const parentMap = new Map();

  edges.forEach((edge) => {
    if (!childMap.has(edge.source)) childMap.set(edge.source, []);
    childMap.get(edge.source).push(edge.target);
    parentMap.set(edge.target, edge.source);
  });

  // Find root node(s)
  let rootNodes = nodes.filter((n) => n.isRoot || n.type === "user_input" || !parentMap.has(n.id));
  if (rootNodes.length === 0 && nodes.length > 0) {
    rootNodes = [nodes[0]];
  }

  // Global nodes by type for unified tree fallback
  const allChannels = nodes.filter((n) => n.type === "ad_channel");
  const allBriefs = nodes.filter((n) => n.type === "marketing_brief");
  const allProducts = nodes.filter((n) => n.type === "product");
  const allBusinesses = nodes.filter((n) => n.type === "business_unit");
  const allWarehouses = nodes.filter((n) => n.type === "data_warehouse");

  // Traverse each flow branch from root to leaf
  const flows = [];
  const visitedPaths = new Set();

  function traverseBranch(currentNode, currentPath, stepNum) {
    const parentNodeId = parentMap.get(currentNode.id);
    const parentNode = parentNodeId ? nodeMap.get(parentNodeId) : null;

    const stepInfo = {
      step: stepNum,
      nodeId: currentNode.id,
      type: currentNode.type,
      label: currentNode.label || currentNode.data?.name || currentNode.type,
      subtitle: currentNode.subtitle || "",
      contextTag: currentNode.contextTag || currentNode.data?.contextTag || context.name,
      previousNode: parentNode
        ? {
            id: parentNode.id,
            label: parentNode.label || parentNode.data?.name || parentNode.type,
            type: parentNode.type,
          }
        : null,
      details: {
        name: currentNode.data?.name || currentNode.label,
        description: currentNode.data?.description || "",
        businessUnitName:
          currentNode.data?.businessUnitName ||
          (parentNode?.type === "business_unit" ? (parentNode.label || parentNode.data?.name) : "") ||
          "",
        channelName: currentNode.data?.channelName || currentNode.data?.channel || "",
        channel: currentNode.data?.channel || currentNode.data?.channelName || "",
        adAccountId: currentNode.data?.adAccountId || "",
        accountName: currentNode.data?.accountName || "",
        funnelEvent: currentNode.data?.funnelEvent || "",
        funnelDescription: currentNode.data?.funnelDescription || "",
        timeframeType: currentNode.data?.timeframeType || "month",
        targetMonth: currentNode.data?.targetMonth || "",
        startDate: currentNode.data?.startDate || "",
        endDate: currentNode.data?.endDate || "",
        formattedPeriod: currentNode.data?.formattedPeriod || "",
        metrics: currentNode.data?.metrics || "",
        metricsList: Array.isArray(currentNode.data?.metricsList) ? currentNode.data.metricsList : [],
        productName: currentNode.data?.productName || "",
        productUrl: currentNode.data?.productUrl || "",
        productPrice: currentNode.data?.productPrice || 0,
        productPlatforms: currentNode.data?.productPlatforms || ["Web"],
        products: currentNode.data?.products || [],
        catalogCount: currentNode.data?.catalogCount || currentNode.data?.products?.length || 0,
        warehouseSource: currentNode.data?.warehouseSource || "both",
        sheetUrl: currentNode.data?.sheetUrl || "",
        excelProvider: currentNode.data?.excelProvider || "Google Sheets",
        workbookName: currentNode.data?.workbookName || "",
        worksheetName: currentNode.data?.worksheetName || "",
        excelSyncStatus: currentNode.data?.excelSyncStatus || "NOT_CONNECTED",
        totalRows: currentNode.data?.totalRows || 0,
        totalDataRows: currentNode.data?.totalDataRows || 0,
        sheets: Array.isArray(currentNode.data?.sheets) ? currentNode.data.sheets : [],
        googleDriveConnected: Boolean(currentNode.data?.googleDriveConnected),
        googleDriveEmail: currentNode.data?.googleDriveEmail || "",
        googleDriveFolderId: currentNode.data?.googleDriveFolderId || "",
        dataLevel: currentNode.data?.dataLevel || currentNode.data?.dataLabels || "",
        dataLabels: currentNode.data?.dataLabels || currentNode.data?.dataLevel || "",
        databasePlatform: currentNode.data?.databasePlatform || "Excel Sheet & Google Drive",
        config: currentNode.data?.config || {},
      },
    };

    const newPath = [...currentPath, stepInfo];
    const childrenIds = childMap.get(currentNode.id) || [];

    if (childrenIds.length === 0) {
      // Leaf reached: finalize this flow
      const pathKey = newPath.map((p) => p.nodeId).join("->");
      if (!visitedPaths.has(pathKey)) {
        visitedPaths.add(pathKey);

        const flowSummary = newPath
          .map((p) => `${p.label} [${p.type}]`)
          .join(" ➔ ");

        const channelNode = newPath.find((p) => p.type === "ad_channel") || allChannels[0];
        const briefNode = newPath.find((p) => p.type === "marketing_brief") || allBriefs[0];
        const productNode = newPath.find((p) => p.type === "product") || allProducts[0];
        const businessNode = newPath.find((p) => p.type === "business_unit") || allBusinesses[0];
        const warehouseNode = newPath.find((p) => p.type === "data_warehouse") || allWarehouses[0];

        const channelDetails = channelNode?.details || channelNode?.data || {};
        const briefDetails = briefNode?.details || briefNode?.data || {};
        const productDetails = productNode?.details || productNode?.data || {};
        const businessDetails = businessNode?.details || businessNode?.data || {};
        const warehouseDetails = warehouseNode?.details || warehouseNode?.data || {};

        const buName = channelDetails?.businessUnitName || businessDetails?.name || businessNode?.label || "";
        const campaignParams = {
          name:
            briefDetails?.name && briefDetails?.name !== "Marketing Brief"
              ? briefDetails.name
              : productDetails?.productName
              ? `${productDetails.productName} Growth Campaign`
              : `${buName || "Marketing"} Campaign`,
          businessUnit: buName || "Default Business Unit",
          businessUnitName: buName || "Default Business Unit",
          channel: channelDetails?.channelName || channelDetails?.channel || "Meta Ads",
          channelName: channelDetails?.channelName || channelDetails?.channel || "Meta Ads",
          accountId: channelDetails?.adAccountId || "",
          accountName: channelDetails?.accountName || "",
          funnelEvent: channelDetails?.funnelEvent || "Purchase",
          funnelDescription: channelDetails?.funnelDescription || "",
          targetPeriod: briefDetails?.formattedPeriod || briefDetails?.targetMonth || "",
          timeframeType: briefDetails?.timeframeType || "month",
          targetMonth: briefDetails?.targetMonth || "",
          startDate: briefDetails?.startDate || "",
          briefDescription: briefDetails?.description || briefDetails?.briefDescription || "",
          strategy: briefDetails?.description || briefDetails?.briefDescription || "",
          metrics: briefDetails?.metrics || "",
          metricsList: Array.isArray(briefDetails?.metricsList) ? briefDetails.metricsList : [],
          productName: productDetails?.productName || (productDetails?.products?.[0]?.name) || "",
          productUrl: productDetails?.productUrl || (productDetails?.products?.[0]?.url) || "",
          productPrice: productDetails?.productPrice !== undefined ? productDetails.productPrice : (productDetails?.products?.[0]?.price || ""),
          productPlatforms: productDetails?.productPlatforms || ["Web"],
          products: productDetails?.products || [],
          catalogCount: productDetails?.catalogCount || productDetails?.products?.length || 0,
          dataLevel: warehouseDetails?.dataLevel || warehouseDetails?.dataLabels || "",
          dataLabels: warehouseDetails?.dataLabels || warehouseDetails?.dataLevel || "",
          databasePlatform: warehouseDetails?.databasePlatform || "Excel Sheet & Google Drive",
          warehouseSource: warehouseDetails?.warehouseSource || "both",
          sheetUrl: warehouseDetails?.sheetUrl || "",
          excelProvider: warehouseDetails?.excelProvider || "Google Sheets",
          workbookName: warehouseDetails?.workbookName || "",
          worksheetName: warehouseDetails?.worksheetName || "",
          excelSyncStatus: warehouseDetails?.excelSyncStatus || "NOT_CONNECTED",
          googleDriveConnected: Boolean(warehouseDetails?.googleDriveConnected),
          googleDriveEmail: warehouseDetails?.googleDriveEmail || "",
          googleDriveFolderId: warehouseDetails?.googleDriveFolderId || "",
          sheets: Array.isArray(warehouseDetails?.sheets) ? warehouseDetails.sheets : [],
          sheetRows: warehouseDetails?.sheetRows || [],
          sheetColumns: warehouseDetails?.sheetColumns || [],
          creativeDriveUrl: (() => {
            const rows = warehouseDetails?.sheetRows || [];
            for (const row of rows) {
              if (typeof row === "object" && row !== null) {
                for (const [k, v] of Object.entries(row)) {
                  if (typeof v === "string" && (v.includes("drive.google.com") || v.includes("docs.google.com"))) {
                    return v.trim();
                  }
                }
              }
            }
            return "";
          })(),
          status: "ACTIVE",
        };

        flows.push({
          flowIndex: flows.length + 1,
          flowTag: currentNode.contextTag || currentNode.data?.contextTag || context.name,
          flowSummary,
          totalSteps: newPath.length,
          pathNodeIds: newPath.map((p) => p.nodeId),
          campaignLaunchParameters: campaignParams,
          steps: newPath,
        });
      }
      return;
    }

    for (const childId of childrenIds) {
      const childNode = nodeMap.get(childId);
      if (childNode) {
        traverseBranch(childNode, newPath, stepNum + 1);
      }
    }
  }

  rootNodes.forEach((root) => {
    traverseBranch(root, [], 1);
  });

  const finalFlows = flows.length > 0 ? flows : (context.flows && context.flows.length > 0 ? context.flows : []);

  // Build complete Business Unit hierarchy (Multi-Business Unit & Multi-Channel Lineage)
  const businessUnitsHierarchy = [];
  
  function getDescendants(startId) {
    const reachable = new Set();
    const queue = [startId];
    while (queue.length > 0) {
      const curr = queue.shift();
      const children = childMap.get(curr) || [];
      for (const ch of children) {
        if (!reachable.has(ch)) {
          reachable.add(ch);
          queue.push(ch);
        }
      }
    }
    return reachable;
  }

  allBusinesses.forEach((buNode) => {
    const buId = buNode.id;
    const buName = buNode.label || buNode.data?.name || "Business Unit";
    const reachableIds = getDescendants(buId);

    const isNodeInBu = (node) => {
      if (reachableIds.has(node.id)) return true;
      if (node.data?.businessUnitName && node.data.businessUnitName.toLowerCase() === buName.toLowerCase()) return true;
      if (node.previousNodeId && reachableIds.has(node.previousNodeId)) return true;
      return false;
    };

    const buChannels = allChannels.filter(isNodeInBu);
    const buBriefs = allBriefs.filter(isNodeInBu);
    const buProducts = allProducts.filter(isNodeInBu);
    const buWarehouses = allWarehouses.filter(isNodeInBu);

    businessUnitsHierarchy.push({
      id: buId,
      name: buName,
      description: buNode.data?.description || "",
      channels: buChannels.map((n) => ({
        id: n.id,
        channel: n.data?.channelName || n.data?.channel || n.label,
        channelName: n.data?.channelName || n.data?.channel || n.label,
        accountId: n.data?.adAccountId || "",
        accountName: n.data?.accountName || "",
        funnelEvent: n.data?.funnelEvent || "Purchase",
        funnelDescription: n.data?.funnelDescription || "",
      })),
      briefs: buBriefs.map((n) => ({
        id: n.id,
        name: n.label || n.data?.name,
        targetPeriod: n.data?.formattedPeriod || n.data?.targetMonth || "",
        timeframeType: n.data?.timeframeType || "month",
        metrics: n.data?.metrics || "",
        metricsList: Array.isArray(n.data?.metricsList) ? n.data.metricsList : [],
      })),
      products: buProducts.map((n) => ({
        id: n.id,
        name: n.data?.productName || n.label,
        productName: n.data?.productName || n.label,
        url: n.data?.productUrl || "",
        productUrl: n.data?.productUrl || "",
        price: n.data?.productPrice !== undefined ? n.data.productPrice : 0,
        productPrice: n.data?.productPrice !== undefined ? n.data.productPrice : 0,
        catalog: n.data?.products || [],
        products: n.data?.products || [],
      })),
      warehouses: buWarehouses.map((n) => ({
        id: n.id,
        name: n.label || n.data?.name,
        sheetUrl: n.data?.sheetUrl || "",
        sheets: Array.isArray(n.data?.sheets) ? n.data.sheets : [],
        dataLabels: n.data?.dataLabels || n.data?.dataLevel || "",
      })),
    });
  });

  // If no explicit Business Unit node was added, assemble unified fallback BU
  if (businessUnitsHierarchy.length === 0 && (allChannels.length > 0 || allProducts.length > 0 || allWarehouses.length > 0)) {
    businessUnitsHierarchy.push({
      id: "default_bu",
      name: "Default Business Unit",
      description: "Default workspace business unit",
      channels: allChannels.map((n) => ({
        id: n.id,
        channel: n.data?.channelName || n.data?.channel || n.label,
        channelName: n.data?.channelName || n.data?.channel || n.label,
        accountId: n.data?.adAccountId || "",
        accountName: n.data?.accountName || "",
        funnelEvent: n.data?.funnelEvent || "Purchase",
        funnelDescription: n.data?.funnelDescription || "",
      })),
      briefs: allBriefs.map((n) => ({
        id: n.id,
        name: n.label || n.data?.name,
        metricsList: Array.isArray(n.data?.metricsList) ? n.data.metricsList : [],
      })),
      products: allProducts.map((n) => ({
        id: n.id,
        name: n.data?.productName || n.label,
        productName: n.data?.productName || n.label,
        url: n.data?.productUrl || "",
        productUrl: n.data?.productUrl || "",
        price: n.data?.productPrice !== undefined ? n.data.productPrice : 0,
        catalog: n.data?.products || [],
      })),
      warehouses: allWarehouses.map((n) => ({
        id: n.id,
        name: n.label || n.data?.name,
        sheetUrl: n.data?.sheetUrl || "",
        sheets: Array.isArray(n.data?.sheets) ? n.data.sheets : [],
        dataLabels: n.data?.dataLabels || n.data?.dataLevel || "",
      })),
    });
  }

  return {
    source: "DATABASE",
    hasContext: nodes.length > 0,
    workflowName: context.name,
    totalNodes: nodes.length,
    totalFlows: finalFlows.length,
    flows: finalFlows,
    businessUnitsHierarchy,
    businessUnits: nodes.filter((n) => n.type === "business_unit").map((n) => ({
      id: n.id,
      name: n.label || n.data?.name,
      description: n.data?.description || "",
    })),
    adChannels: nodes.filter((n) => n.type === "ad_channel").map((n) => {
      let buName = n.data?.businessUnitName;
      if (!buName && n.previousNodeId) {
        const pNode = nodes.find((node) => node.id === n.previousNodeId);
        if (pNode && pNode.type === "business_unit") {
          buName = pNode.label || pNode.data?.name;
        }
      }
      if (!buName && n.previousNodeLabel && (n.previousNodeType === "business_unit" || !n.previousNodeType)) {
        buName = n.previousNodeLabel;
      }
      return {
        id: n.id,
        businessUnitName: buName || "Business Unit",
        channel: n.data?.channelName || n.data?.channel || n.label,
        channelName: n.data?.channelName || n.data?.channel || n.label,
        accountId: n.data?.adAccountId || "",
        accountName: n.data?.accountName || "",
        funnelEvent: n.data?.funnelEvent || "Purchase",
        funnelDescription: n.data?.funnelDescription || "",
      };
    }),
    products: nodes.filter((n) => n.type === "product").map((n) => ({
      id: n.id,
      name: n.data?.productName || n.label,
      productName: n.data?.productName || n.label,
      url: n.data?.productUrl || "",
      productUrl: n.data?.productUrl || "",
      price: n.data?.productPrice !== undefined ? n.data.productPrice : 0,
      productPrice: n.data?.productPrice !== undefined ? n.data.productPrice : 0,
      platforms: n.data?.productPlatforms || ["Web"],
      catalogCount: n.data?.catalogCount || n.data?.products?.length || 0,
      catalog: n.data?.products || [],
      products: n.data?.products || [],
    })),
    marketingBriefs: nodes.filter((n) => n.type === "marketing_brief").map((n) => ({
      id: n.id,
      name: n.label || n.data?.name || "Marketing Brief",
      description: n.data?.description || n.data?.briefDescription || "",
      targetPeriod: n.data?.formattedPeriod || n.data?.targetMonth || (n.data?.startDate ? `${n.data.startDate} to ${n.data.endDate}` : ""),
      timeframeType: n.data?.timeframeType || "month",
      targetMonth: n.data?.targetMonth || "",
      startDate: n.data?.startDate || "",
      endDate: n.data?.endDate || "",
      businessUnitName: n.data?.businessUnitName || "",
      metrics: n.data?.metrics || (Array.isArray(n.data?.metricsList) && n.data.metricsList.length > 0 ? n.data.metricsList.map(m => m.metrics).join(" | ") : ""),
      metricsList: Array.isArray(n.data?.metricsList) ? n.data.metricsList : [],
    })),
    dataWarehouses: nodes.filter((n) => n.type === "data_warehouse").map((n) => ({
      id: n.id,
      name: n.label || n.data?.name || "Excel & Google Drive Warehouse",
      platform: n.data?.databasePlatform || "Excel Sheet & Google Drive",
      warehouseSource: n.data?.warehouseSource || "both",
      sheetUrl: n.data?.sheetUrl || "",
      excelProvider: n.data?.excelProvider || "Google Sheets",
      workbookId: n.data?.workbookId || "",
      workbookName: n.data?.workbookName || "",
      worksheetId: n.data?.worksheetId || "",
      worksheetName: n.data?.worksheetName || "",
      excelSyncStatus: n.data?.excelSyncStatus || "NOT_CONNECTED",
      totalRows: n.data?.totalRows || (n.data?.sheetRows || []).length || 0,
      sheetRows: n.data?.sheetRows || [],
      sheetColumns: n.data?.sheetColumns || [],
      googleDriveConnected: Boolean(n.data?.googleDriveConnected),
      googleDriveEmail: n.data?.googleDriveEmail || "",
      googleDriveFolderId: n.data?.googleDriveFolderId || "",
      googleDriveFolderName: n.data?.googleDriveFolderName || "",
      dataLevel: n.data?.dataLevel || n.data?.dataLabels || "",
      dataLabels: n.data?.dataLabels || n.data?.dataLevel || "",
      availableTabs: n.data?.availableTabs || [],
      selectedTabIds: n.data?.selectedTabIds || [],
      selectedTabs: (n.data?.selectedTabsData || []).map((t) => ({
        sheetId: t.sheetId,
        tabName: t.tabName,
        columns: t.columns,
        totalRows: t.totalRows,
        totalDataRows: t.totalDataRows,
        sampleRows: (t.rows || []).slice(0, 5),
      })),
      sheets: (Array.isArray(n.data?.sheets) ? n.data.sheets : []).map((s) => ({
        ...s,
        availableTabs: s.availableTabs || [],
        selectedTabIds: s.selectedTabIds || [],
        selectedTabs: (s.selectedTabsData || []).map((t) => ({
          sheetId: t.sheetId,
          tabName: t.tabName,
          columns: t.columns,
          totalRows: t.totalRows,
          totalDataRows: t.totalDataRows,
          sampleRows: (t.rows || []).slice(0, 5),
        })),
        excludedTabs: (s.availableTabs || [])
          .filter((t) => !(s.selectedTabIds || []).some((id) => String(id) === String(t.sheetId) || String(id).toLowerCase() === String(t.title || "").toLowerCase()))
          .map((t) => t.title),
      })),
      totalSheets: Array.isArray(n.data?.sheets) ? n.data.sheets.length : (n.data?.sheetUrl ? 1 : 0),
    })),
    rawNodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      contextTag: n.contextTag,
      previousNodeId: n.previousNodeId,
      previousNodeLabel: n.previousNodeLabel,
      stepIndex: n.stepIndex,
      data: n.data,
    })),
    rawEdges: edges,
  };
}

/**
 * Intelligent AI Context Resolution Helper:
 * Dynamically resolves:
 * 1. Target Business Unit (from prompt or hierarchy)
 * 2. Target Ad Channel (Meta Ads vs Google Ads based on intent and requested channel)
 * 3. Target Product & landing page URL
 * 4. Target Sheet from Data Warehouse (matched by sheet name, product name, or dataLabels)
 */
export function resolveAiContextSelection({ aiCtx, userMessage = "", requestedChannel = null }) {
  if (!aiCtx || !aiCtx.hasContext) {
    return {
      hasSelection: false,
      businessUnit: null,
      channel: null,
      product: null,
      brief: null,
      warehouse: null,
      selectedSheet: null,
      availableBusinessUnits: [],
      availableChannels: [],
      availableProducts: [],
      availableSheets: [],
    };
  }

  const msgLower = (userMessage || "").toLowerCase();
  const buList = aiCtx.businessUnitsHierarchy || [];

  // 1. MATCH BUSINESS UNIT
  let matchedBu = null;
  if (buList.length === 1) {
    matchedBu = buList[0];
  } else if (buList.length > 1) {
    // 1a. Try matching BU name in message
    matchedBu = buList.find((bu) => {
      const buName = (bu.name || "").toLowerCase().trim();
      return buName && msgLower.includes(buName);
    });

    // 1b. If still not matched, check if any product inside a BU is mentioned in message
    if (!matchedBu) {
      matchedBu = buList.find((bu) =>
        (bu.products || []).some((p) => {
          const pName = (p.productName || p.name || "").toLowerCase().trim();
          if (pName && msgLower.includes(pName)) return true;
          const words = pName.split(/[\s_-]+/).filter((w) => w.length >= 3 && !["item", "product", "premium"].includes(w));
          return words.some((w) => msgLower.includes(w));
        })
      );
    }

    // 1c. If still not matched, check if any sheet inside a BU's warehouse is mentioned
    if (!matchedBu) {
      matchedBu = buList.find((bu) =>
        (bu.warehouses || []).some((w) =>
          (w.sheets || []).some((s) => {
            const sName = (s.sheetName || s.workbookName || s.name || "").toLowerCase().trim();
            const sLabel = (s.dataLabels || "").toLowerCase().trim();
            if ((sName && msgLower.includes(sName)) || (sLabel && msgLower.includes(sLabel))) return true;
            const words = sName.split(/[\s_-]+/).filter((w) => w.length >= 3 && !["sheet", "sheets", "data", "table"].includes(w));
            return words.some((w) => msgLower.includes(w));
          })
        )
      );
    }

    // 1d. Fallback to first BU if not explicitly mentioned
    if (!matchedBu) {
      matchedBu = buList[0];
    }
  }

  // Fallback to global arrays if matched BU has empty lists
  const availableChannels = matchedBu?.channels?.length > 0 ? matchedBu.channels : (aiCtx.adChannels || []);
  const availableProducts = matchedBu?.products?.length > 0 ? matchedBu.products : (aiCtx.products || []);
  const availableBriefs = matchedBu?.briefs?.length > 0 ? matchedBu.briefs : (aiCtx.marketingBriefs || []);
  const availableWarehouses = matchedBu?.warehouses?.length > 0 ? matchedBu.warehouses : (aiCtx.dataWarehouses || []);

  // 2. MATCH AD CHANNEL (Meta Ads vs Google Ads)
  let matchedChannel = null;
  const wantsMeta =
    (requestedChannel && requestedChannel.toLowerCase().includes("meta")) ||
    msgLower.includes("meta") ||
    msgLower.includes("facebook") ||
    msgLower.includes("fb") ||
    msgLower.includes("instagram") ||
    msgLower.includes("insta") ||
    msgLower.includes("reels");

  const wantsGoogle =
    (requestedChannel && requestedChannel.toLowerCase().includes("google")) ||
    msgLower.includes("google") ||
    msgLower.includes("adwords") ||
    msgLower.includes("search") ||
    msgLower.includes("pmax") ||
    msgLower.includes("rsa") ||
    msgLower.includes("youtube");

  if (wantsGoogle && !wantsMeta) {
    matchedChannel = availableChannels.find((c) => (c.channel || c.channelName || "").toLowerCase().includes("google"));
  } else if (wantsMeta && !wantsGoogle) {
    matchedChannel = availableChannels.find((c) => {
      const ch = (c.channel || c.channelName || "").toLowerCase();
      return ch.includes("meta") || ch.includes("facebook") || ch.includes("instagram");
    });
  }

  // If still not matched, check if caller provided requestedChannel
  if (!matchedChannel && requestedChannel) {
    matchedChannel = availableChannels.find((c) =>
      (c.channel || c.channelName || "").toLowerCase().includes(requestedChannel.toLowerCase())
    );
  }

  // If still not matched:
  if (!matchedChannel) {
    if (availableChannels.length === 1) {
      matchedChannel = availableChannels[0];
    } else if (availableChannels.length > 1) {
      // Default to Meta channel for social/creative workflows, or first channel
      const metaChan = availableChannels.find((c) => {
        const ch = (c.channel || c.channelName || "").toLowerCase();
        return ch.includes("meta") || ch.includes("facebook") || ch.includes("instagram");
      });
      matchedChannel = metaChan || availableChannels[0];
    }
  }

  // 3. MATCH PRODUCT
  let matchedProduct = null;
  if (availableProducts.length === 1) {
    matchedProduct = availableProducts[0];
  } else if (availableProducts.length > 1) {
    // 3a. Exact match
    matchedProduct = availableProducts.find((p) => {
      const pName = (p.productName || p.name || "").toLowerCase().trim();
      return pName && msgLower.includes(pName);
    });

    // 3b. Keyword match (e.g. "hoodie", "tshirt", "shoes")
    if (!matchedProduct) {
      matchedProduct = availableProducts.find((p) => {
        const pName = (p.productName || p.name || "").toLowerCase().trim();
        const words = pName.split(/[\s_-]+/).filter((w) => w.length >= 3 && !["item", "product", "premium"].includes(w));
        return words.some((w) => msgLower.includes(w));
      });
    }

    if (!matchedProduct) {
      matchedProduct = availableProducts[0];
    }
  }

  // 4. MATCH MARKETING BRIEF
  const matchedBrief = availableBriefs.length > 0 ? availableBriefs[0] : null;

  // 5. MATCH DATA WAREHOUSE & SPECIFIC SHEET
  const matchedWarehouse = availableWarehouses.length > 0 ? availableWarehouses[0] : null;
  const allSheets = matchedWarehouse?.sheets || [];
  let matchedSheet = null;

  if (allSheets.length === 1) {
    matchedSheet = allSheets[0];
  } else if (allSheets.length > 1) {
    // 5a. Match by sheet name in message (exact or keyword)
    matchedSheet = allSheets.find((s) => {
      const sName = (s.sheetName || s.workbookName || s.name || "").toLowerCase().trim();
      if (!sName) return false;
      if (msgLower.includes(sName)) return true;
      const words = sName.split(/[\s_-]+/).filter((w) => w.length >= 3 && !["sheet", "sheets", "data", "table"].includes(w));
      return words.some((w) => msgLower.includes(w));
    });

    // 5b. Match by matched product name
    if (!matchedSheet && matchedProduct) {
      const pName = (matchedProduct.productName || matchedProduct.name || "").toLowerCase().trim();
      const pWords = pName.split(/[\s_-]+/).filter((w) => w.length >= 3 && !["item", "product", "premium"].includes(w));
      matchedSheet = allSheets.find((s) => {
        const sName = (s.sheetName || s.workbookName || s.name || "").toLowerCase().trim();
        const sLabel = (s.dataLabels || "").toLowerCase().trim();
        return (pName && (sName.includes(pName) || sLabel.includes(pName))) ||
          pWords.some((w) => sName.includes(w) || sLabel.includes(w));
      });
    }

    // 5c. Match by dataLabels in message (e.g. "retargeting", "cold", "video")
    if (!matchedSheet) {
      matchedSheet = allSheets.find((s) => {
        const sLabel = (s.dataLabels || "").toLowerCase().trim();
        return sLabel && msgLower.includes(sLabel);
      });
    }

    // 5d. Fallback to first sheet
    if (!matchedSheet) {
      matchedSheet = allSheets[0];
    }
  }

  return {
    hasSelection: Boolean(matchedBu || matchedChannel || matchedProduct || matchedWarehouse),
    businessUnit: matchedBu,
    channel: matchedChannel,
    product: matchedProduct,
    brief: matchedBrief,
    warehouse: matchedWarehouse,
    selectedSheet: matchedSheet,
    availableBusinessUnits: buList,
    availableChannels,
    availableProducts,
    availableSheets: allSheets,
  };
}

// 2. Tool Execution Router
export async function executeAgentTool(toolName, args) {
  if (toolName === "sync_meta_ads_to_sheet") {
    const { default: MetaAdsSheetSyncService } = await import("../automation/metaAdsSheetSyncService.js");
    return await MetaAdsSheetSyncService.syncMetaAdsToSheet({
      userId: args.userId,
      instruction: args.instruction || args.userMessage || "",
      node: args.node || {},
      context: args.context || {},
      executionId: args.executionId || null,
      onProgress: args.onProgress || null,
    });
  }

  if (toolName === "get_user_ai_context") {
    return await getUserAiContext({ userId: args.userId });
  }

  if (toolName === "get_connected_sheet_rows") {
    const userId = args.userId;
    const context = await AiContext.findOne({ userId }).lean();

    // 1. Gather all connected sheets from all warehouse nodes (supporting multi-sheet array 'sheets' and single sheet)
    const allSheets = [];
    const warehouseNodes = (context?.nodes || []).filter((n) => n.type === "data_warehouse");

    for (const w of warehouseNodes) {
      if (Array.isArray(w.data?.sheets) && w.data.sheets.length > 0) {
        w.data.sheets.forEach((s) => {
          if (s && (s.sheetUrl || (Array.isArray(s.sheetRows) && s.sheetRows.length > 0))) {
            allSheets.push({
              sheetIndex: allSheets.length + 1,
              sheetId: s.id || `sheet_${allSheets.length + 1}`,
              warehouseNodeId: w.id,
              sheetName: s.workbookName || s.sheetName || `Sheet #${allSheets.length + 1}`,
              sheetUrl: (s.sheetUrl || "").trim(),
              excelProvider: s.excelProvider || (s.sheetUrl ? "Google Sheets" : "Excel File Upload"),
              rows: Array.isArray(s.sheetRows) ? s.sheetRows : [],
              columns: Array.isArray(s.sheetColumns) ? s.sheetColumns : Array.isArray(s.columns) ? s.columns : [],
              availableTabs: Array.isArray(s.availableTabs) ? s.availableTabs : [],
              selectedTabIds: Array.isArray(s.selectedTabIds) ? s.selectedTabIds : [],
              selectedTabsData: Array.isArray(s.selectedTabsData) ? s.selectedTabsData : [],
              dataLabels: s.dataLabels || s.dataLevel || "",
            });
          }
        });
      } else if (w.data?.sheetUrl || (Array.isArray(w.data?.sheetRows) && w.data.sheetRows.length > 0)) {
        allSheets.push({
          sheetIndex: allSheets.length + 1,
          sheetId: w.id,
          warehouseNodeId: w.id,
          sheetName: w.data.workbookName || w.data.sheetName || w.data.title || `Sheet #${allSheets.length + 1}`,
          sheetUrl: (w.data.sheetUrl || "").trim(),
          excelProvider: w.data.excelProvider || (w.data.sheetUrl ? "Google Sheets" : "Excel File Upload"),
          rows: Array.isArray(w.data.sheetRows) ? w.data.sheetRows : [],
          columns: Array.isArray(w.data.sheetColumns) ? w.data.sheetColumns : Array.isArray(w.data.columns) ? w.data.columns : [],
          availableTabs: Array.isArray(w.data.availableTabs) ? w.data.availableTabs : [],
          selectedTabIds: Array.isArray(w.data.selectedTabIds) ? w.data.selectedTabIds : [],
          selectedTabsData: Array.isArray(w.data.selectedTabsData) ? w.data.selectedTabsData : [],
          dataLabels: w.data.dataLabels || w.data.dataLevel || "",
        });
      }
    }

    if (allSheets.length === 0) {
      return {
        success: false,
        message: "No connected Google Sheet or Excel file found in AI Context. Please upload an Excel file or connect a Google Sheet in the AI Context Warehouse node.",
        rows: [],
        totalRows: 0,
      };
    }

    // 2. Select the target sheet based on sheetUrl, sheetIndex, or user instruction
    let selectedSheet = null;

    if (args.sheetUrl) {
      selectedSheet = allSheets.find((s) => s.sheetUrl === args.sheetUrl);
    }

    if (!selectedSheet && args.sheetIndex && args.sheetIndex <= allSheets.length) {
      selectedSheet = allSheets[args.sheetIndex - 1];
    }

    if (!selectedSheet && (args.userMessage || args.userInstruction)) {
      const msg = `${args.userMessage || ""} ${args.userInstruction || ""}`.toLowerCase();
      const isSecond = /\b(second|2nd|sheet\s*#?\s*2|sheet2|two\s*sheet|2\s*sheet|dusra|dusri|doosra|doosri)\b/i.test(msg) &&
                       !/\b(first|1st|sheet\s*#?\s*1|sheet1)\b/i.test(msg);
      const isThird = /\b(third|3rd|sheet\s*#?\s*3|sheet3|three\s*sheet|3\s*sheet|teesra|teesri)\b/i.test(msg);
      const isFirst = /\b(first|1st|sheet\s*#?\s*1|sheet1|one\s*sheet|1\s*sheet|pehla|pehli)\b/i.test(msg);

      if (isSecond && allSheets.length >= 2) {
        selectedSheet = allSheets[1];
      } else if (isThird && allSheets.length >= 3) {
        selectedSheet = allSheets[2];
      } else if (isFirst) {
        selectedSheet = allSheets[0];
      } else {
        const sheetNumMatch = msg.match(/\bsheet\s*#?\s*([0-9]+)\b/i) || msg.match(/\b([0-9]+)(?:st|nd|rd|th)\s*sheet\b/i);
        if (sheetNumMatch) {
          const num = parseInt(sheetNumMatch[1], 10);
          if (num >= 1 && num <= allSheets.length) {
            selectedSheet = allSheets[num - 1];
          }
        }
      }
    }

    if (!selectedSheet) {
      selectedSheet = allSheets[0];
    }

    let rows = selectedSheet.rows || [];
    let columns = selectedSheet.columns || (rows.length > 0 ? Object.keys(rows[0] || {}) : []);
    const sheetUrl = selectedSheet.sheetUrl;

    const availableTabs = Array.isArray(selectedSheet.availableTabs) ? selectedSheet.availableTabs : [];
    const selectedTabIds = Array.isArray(selectedSheet.selectedTabIds) ? selectedSheet.selectedTabIds : [];
    let selectedTabsData = Array.isArray(selectedSheet.selectedTabsData) && selectedSheet.selectedTabsData.length > 0
      ? selectedSheet.selectedTabsData
      : [];

    // Live Auto-Sync for Google Sheets URLs
    if (sheetUrl && (sheetUrl.startsWith("http://") || sheetUrl.startsWith("https://"))) {
      try {
        const { default: sheetsService } = await import("../../google/sheetsService.js");

        if (selectedTabsData.length > 0) {
          // Live auto-sync ONLY the user's selected tabs (preserve tab isolation)
          const refreshedTabs = await sheetsService.fetchMultipleWorksheetsData({
            spreadsheetIdOrUrl: sheetUrl,
            selectedTabs: selectedTabsData.map((t) => ({ sheetId: t.sheetId, title: t.tabName })),
          });

          if (refreshedTabs && refreshedTabs.length > 0) {
            selectedTabsData = refreshedTabs;
            const combinedRows = [];
            refreshedTabs.forEach((tab) => {
              (tab.rows || []).forEach((r) => {
                combinedRows.push({
                  ...(r.values || r),
                  _worksheetTab: tab.tabName,
                  _worksheetId: tab.sheetId,
                });
              });
            });
            rows = combinedRows;
            columns = Array.from(new Set(refreshedTabs.flatMap((t) => t.columns || [])));
          }
        } else {
          // Standard single-sheet read fallback
          const readResult = await sheetsService.readSpreadsheet({ spreadsheetIdOrUrl: sheetUrl });
          if (readResult && readResult.rows && readResult.rows.length > 0) {
            rows = readResult.rows;
            columns = readResult.headers || Object.keys(rows[0] || {});
          }
        }
      } catch (err) {
        console.warn("[get_connected_sheet_rows Live Auto-Sync Warning]:", err.message);
      }
    }

    // Check if the user specifically requested a single tab (by tab name or by intent)
    let requestedTabName = args.tabName || args.worksheetName || args.sheetTitle || null;
    if (!requestedTabName && (args.userMessage || args.userInstruction)) {
      const msg = `${args.userMessage || ""} ${args.userInstruction || ""}`;
      for (const tab of availableTabs) {
        if (tab.title && new RegExp(`\\b${tab.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(msg)) {
          requestedTabName = tab.title;
          break;
        }
      }
    }

    // Tab Selection Enforcement Gate:
    // If user specified or mentioned a tab that is EXCLUDED (not selected), block access to it!
    if (requestedTabName && selectedTabsData.length > 0) {
      const matchedSelectedTab = selectedTabsData.find(
        (t) => t.tabName.toLowerCase() === requestedTabName.toLowerCase() || String(t.sheetId) === String(requestedTabName)
      );

      if (!matchedSelectedTab) {
        return {
          success: false,
          message: `Access denied to worksheet tab "${requestedTabName}". This tab is NOT selected in AI Context. Only the selected tabs [${selectedTabsData.map((t) => t.tabName).join(", ")}] are accessible to the AI Agent.`,
          availableTabs: availableTabs.map((t) => t.title),
          selectedTabs: selectedTabsData.map((t) => t.tabName),
          rows: [],
          totalRows: 0,
        };
      }

      // User requested a valid selected tab: return only that tab's data
      rows = matchedSelectedTab.rows || [];
      columns = matchedSelectedTab.columns || (rows.length > 0 ? Object.keys(rows[0] || {}) : []);
    } else if (selectedTabsData.length > 0) {
      // Multiple tabs selected, no specific single tab requested:
      // Return combined rows strictly from selected tabs only
      const combined = [];
      selectedTabsData.forEach((tab) => {
        (tab.rows || []).forEach((r) => {
          combined.push({
            ...(r.values || r),
            _worksheetTab: tab.tabName,
            _worksheetId: tab.sheetId,
          });
        });
      });
      rows = combined;
      columns = Array.from(new Set(selectedTabsData.flatMap((t) => t.columns || [])));
    }

    const sheetName =
      selectedSheet.sheetName ||
      selectedSheet.workbookName ||
      selectedSheet.title ||
      (sheetUrl ? sheetUrl.split("/").pop().split("?")[0] : `Sheet #${selectedSheet.sheetIndex || 1}`);

    const routing = CampaignRouter.routeSheet({
      headers: columns,
      rows,
      sheetName,
      userInstruction: args.userMessage || args.userInstruction || "",
    });

    return {
      success: true,
      sheetIndex: selectedSheet.sheetIndex || 1,
      sheetId: selectedSheet.sheetId,
      sheetUrl,
      sheetName,
      provider: selectedSheet.excelProvider || (sheetUrl ? "Google Sheets" : "Excel File Upload"),
      totalRows: rows.length,
      columns,
      rows,
      selectedTabs: selectedTabsData.map((t) => ({
        tabName: t.tabName,
        sheetId: t.sheetId,
        columns: t.columns,
        totalRows: t.totalRows,
      })),
      selectedTabNames: selectedTabsData.map((t) => t.tabName),
      lastSyncedAt: selectedSheet.lastSyncedAt || null,
      campaignType: routing.campaignType,
      selectedSkill: routing.selectedSkill,
      confidence: routing.confidence,
      routingReason: routing.routingReason,
      detectedAppConfig: routing.detectedAppConfig,
      detectedWebConfig: routing.detectedWebConfig,
    };
  }

  if (toolName === "route_campaign_sheet") {
    const { headers = [], rows = [], sheetName = "", userInstruction = "" } = args;
    return CampaignRouter.routeSheet({ headers, rows, sheetName, userInstruction });
  }

  if (toolName === "validate_google_drive_asset") {
    const driveUrl = args.driveUrl || args.fileId || args.url;
    return await googleDriveService.validateDriveLink(driveUrl);
  }

  if (toolName === "download_google_drive_asset") {
    const driveUrl = args.driveUrl || args.fileId || args.url;
    const destName = args.destinationFilename;
    return await googleDriveService.downloadCreative(driveUrl, destName);
  }

  if (toolName === "get_user_connected_accounts") {
    const userId = args.userId;
    const channelId = args.channelId;

    let metaAccounts = [];
    let googleAccounts = [];
    let otherAccounts = [];

    if (!channelId || channelId === "meta" || channelId === "meta_ads" || channelId.toLowerCase().includes("meta")) {
      metaAccounts = await MetaAccount.find({ ...(userId ? { userId } : {}), isActive: true }).lean();
    }
    if (!channelId || channelId === "google" || channelId === "google_ads" || channelId.toLowerCase().includes("google")) {
      googleAccounts = await GoogleAccount.find({ ...(userId ? { userId } : {}), isActive: true }).lean();
    }
    if (!channelId || (channelId !== "meta" && channelId !== "google")) {
      const q = { isConnected: true };
      if (userId) q.userId = userId;
      if (channelId) q.channelId = channelId;
      otherAccounts = await ConnectedChannel.find(q).lean();
    }

    const accounts = [
      ...metaAccounts.map((a) => ({
        channel: "Meta Ads",
        channelId: "meta",
        accountId: a.accountId,
        accountName: a.accountName,
        currency: a.currency,
        timezone: a.timezoneName,
        syncStatus: a.syncStatus,
      })),
      ...googleAccounts.flatMap((a) => {
        const childList = Array.isArray(a.accounts) && a.accounts.length > 0 ? a.accounts : [];

        if (childList.length > 0) {
          return childList.map((child) => ({
            channel: "Google Ads",
            channelId: "google",
            accountId: child.customerId,
            accountName: child.name || `${a.accountName} - ${child.customerId}`,
            isManager: Boolean(child.isManager),
            managerAccountId: child.parentCustomerId || a.managerCustomerId || (a.isManager ? a.accountId : null),
            parentCustomerId: child.parentCustomerId || a.managerCustomerId || (a.isManager ? a.accountId : null),
            currency: child.currencyCode || a.currency || "INR",
            timezone: child.timeZone || a.timezoneName || "Asia/Kolkata",
            status: child.status || "ENABLED",
          }));
        }

        return [
          {
            channel: "Google Ads",
            channelId: "google",
            accountId: a.accountId,
            accountName: `${a.accountName}${a.isManager ? " (Manager MCC)" : ""}`,
            isManager: Boolean(a.isManager),
            managerAccountId: a.managerCustomerId || null,
            parentCustomerId: null,
            currency: a.currency || "INR",
            timezone: a.timezoneName || "Asia/Kolkata",
            status: "ENABLED",
            syncStatus: a.syncStatus || "IDLE",
          },
        ];
      }),
      ...otherAccounts.map((a) => ({
        channel: a.channelName,
        channelId: a.channelId,
        accountId: a.accountId,
        accountName: a.accountName,
        currency: a.currency || "INR",
      })),
    ];

    return {
      source: "DATABASE",
      totalConnectedAccounts: accounts.length,
      accounts,
    };
  }

  if (toolName === "query_database_metrics") {
    let isGoogle = args.channel && (args.channel.toLowerCase().includes("google") || args.channel === "google");

    let gAcc = null;
    if (args.userId) {
      gAcc = await GoogleAccount.findOne({ userId: args.userId, isActive: true }).lean();
    }
    if (!gAcc) {
      gAcc = await GoogleAccount.findOne({ isActive: true }).lean();
    }

    // If accountId is provided, check if it matches a Google account or child customer
    if (args.accountId && gAcc) {
      const cleanAcc = String(args.accountId).replace(/[^0-9]/g, "");
      const reqLower = String(args.accountId).toLowerCase();
      if (
        (cleanAcc && String(gAcc.accountId).replace(/[^0-9]/g, "") === cleanAcc) ||
        (cleanAcc && String(gAcc.selectedCustomerId).replace(/[^0-9]/g, "") === cleanAcc) ||
        gAcc.accounts?.some((a) => String(a.customerId).replace(/[^0-9]/g, "") === cleanAcc || (a.name && a.name.toLowerCase().includes(reqLower)))
      ) {
        isGoogle = true;
      }
    }

    let filter = {};
    if (args.userId) filter.userId = args.userId;

    if (isGoogle) {
      let targetAccountId = args.accountId;
      let targetAccountName = "Google Ads Account";

      // Match child account by name or id if present in gAcc.accounts
      if (gAcc) {
        const reqStr = String(args.accountId || "").toLowerCase().trim();
        const cleanReq = reqStr.replace(/[^0-9]/g, "");

        let matched = gAcc.accounts?.find((acc) => {
          const cId = String(acc.customerId).replace(/[^0-9]/g, "");
          const nameL = (acc.name || "").toLowerCase();
          return (cleanReq && cId === cleanReq) || (reqStr && nameL.includes(reqStr));
        });

        if (matched) {
          targetAccountId = matched.customerId;
          targetAccountName = matched.name;
        } else if (!targetAccountId) {
          targetAccountId = gAcc.selectedCustomerId || (gAcc.accounts?.find((a) => !a.isManager)?.customerId) || gAcc.accountId;
          targetAccountName = gAcc.accountName;
        }
      }

      let cleanTargetId = targetAccountId ? String(targetAccountId).replace(/[^0-9]/g, "") : null;
      if (cleanTargetId) {
        filter.$or = [{ accountId: targetAccountId }, { accountId: cleanTargetId }];
      }

      if (args.startDate && args.endDate) {
        filter.date = { $gte: args.startDate, $lte: args.endDate };
      }

      let insights = await GoogleInsight.find(filter).sort({ date: -1 }).limit(30).lean();
      let campaigns = await GoogleCampaign.find(cleanTargetId ? { accountId: { $in: [targetAccountId, cleanTargetId] } } : (args.userId ? { userId: args.userId } : {})).lean();

      // If no records in DB yet, attempt live sync via GoogleSyncPipeline
      if (insights.length === 0 && cleanTargetId) {
        await GoogleSyncPipeline.syncAccount(cleanTargetId).catch(() => {});
        insights = await GoogleInsight.find(filter).sort({ date: -1 }).limit(30).lean();
        campaigns = await GoogleCampaign.find(cleanTargetId ? { accountId: { $in: [targetAccountId, cleanTargetId] } } : (args.userId ? { userId: args.userId } : {})).lean();
      }

      const totals = insights.reduce(
        (acc, item) => {
          acc.totalSpend += Number(item.spend || 0);
          acc.totalImpressions += Number(item.impressions || 0);
          acc.totalClicks += Number(item.clicks || 0);
          acc.totalConversions += Number(item.conversions || 0);
          acc.totalConversionValue += Number(item.conversionValue || 0);
          return acc;
        },
        { totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalConversions: 0, totalConversionValue: 0 }
      );

      const hasActualData = insights.length > 0 && totals.totalImpressions > 0;

      return {
        source: "DATABASE",
        channel: "Google Ads",
        customerId: targetAccountId,
        accountName: targetAccountName,
        managerId: gAcc?.managerCustomerId || (gAcc?.isManager ? gAcc.accountId : null),
        timeframe: { startDate: args.startDate || "past_period", endDate: args.endDate || "today" },
        hasActualData,
        summary: {
          totalSpend: Number(totals.totalSpend.toFixed(2)),
          totalImpressions: totals.totalImpressions,
          totalClicks: totals.totalClicks,
          totalConversions: totals.totalConversions,
          totalConversionValue: Number(totals.totalConversionValue.toFixed(2)),
          overallRoas: totals.totalSpend > 0 ? Number((totals.totalConversionValue / totals.totalSpend).toFixed(2)) : 0,
          avgCtr: totals.totalImpressions > 0 ? Number(((totals.totalClicks / totals.totalImpressions) * 100).toFixed(2)) : 0,
          avgCpc: totals.totalClicks > 0 ? Number((totals.totalSpend / totals.totalClicks).toFixed(2)) : 0,
        },
        totalRecords: insights.length,
        insights,
        campaigns,
        message: hasActualData
          ? `Found active metrics for ${targetAccountName} (${targetAccountId})`
          : `No ads or performance data recorded for ${targetAccountName} (${targetAccountId}). Total spend: ₹0.`,
      };
    } else {
      let cleanMetaId = null;
      if (args.accountId) {
        const cleanId = args.accountId.trim();
        const noHyphen = cleanId.replace(/^act_/, "");
        cleanMetaId = cleanId;
        filter.$or = [{ accountId: cleanId }, { accountId: noHyphen }, { accountId: `act_${noHyphen}` }];
      }

      if (args.startDate && args.endDate) {
        filter.date = { $gte: args.startDate, $lte: args.endDate };
      }

      let insights = await MetaInsight.find(filter).sort({ date: -1 }).limit(30).lean();
      let campaigns = await MetaCampaign.find(cleanMetaId ? { accountId: filter.$or ? { $in: [cleanMetaId, cleanMetaId.replace(/^act_/, ""), `act_${cleanMetaId.replace(/^act_/, "")}`] } : cleanMetaId } : (args.userId ? { userId: args.userId } : {})).lean();

      const totals = insights.reduce(
        (acc, item) => {
          acc.totalSpend += Number(item.spend || 0);
          acc.totalImpressions += Number(item.impressions || 0);
          acc.totalClicks += Number(item.clicks || 0);
          acc.totalPurchases += Number(item.purchases || item.conversions || 0);
          acc.totalRevenue += Number(item.purchaseValue || item.conversionValue || 0);
          return acc;
        },
        { totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalPurchases: 0, totalRevenue: 0 }
      );

      return {
        source: "DATABASE",
        channel: "Meta Ads",
        timeframe: { startDate: args.startDate || "past_period", endDate: args.endDate || "today" },
        summary: {
          totalSpend: Number(totals.totalSpend.toFixed(2)),
          totalImpressions: totals.totalImpressions,
          totalClicks: totals.totalClicks,
          totalPurchases: totals.totalPurchases,
          totalRevenue: Number(totals.totalRevenue.toFixed(2)),
          overallRoas: totals.totalSpend > 0 ? Number((totals.totalRevenue / totals.totalSpend).toFixed(2)) : 0,
          avgCtr: totals.totalImpressions > 0 ? Number(((totals.totalClicks / totals.totalImpressions) * 100).toFixed(2)) : 0,
        },
        totalRecords: insights.length,
        insights,
        campaigns,
      };
    }
  }

  if (toolName === "query_token_usage_metrics") {
    return await getTokenUsageMetrics({
      userId: args.userId,
      conversationId: args.conversationId,
      timeframe: args.timeframe || "all",
    });
  }

  if (toolName === "fetch_live_meta_ads_mcp") {
    return await MetaMcpClient.executeLiveTool(args.toolType, args);
  }

  if (toolName === "fetch_live_google_ads_mcp") {
    return await GoogleMcpClient.executeTool(args.toolType || "get_google_insights", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "create_meta_campaign") {
    return await MetaMcpClient.executeLiveTool("create_meta_campaign", args);
  }

  if (toolName === "update_meta_campaign") {
    return await MetaMcpClient.executeLiveTool("update_meta_campaign", args);
  }

  if (toolName === "create_meta_ad_set") {
    return await MetaMcpClient.executeLiveTool("create_meta_ad_set", args);
  }

  if (toolName === "update_meta_ad_set") {
    return await MetaMcpClient.executeLiveTool("update_meta_ad_set", args);
  }

  if (toolName === "set_meta_targeting") {
    return await MetaMcpClient.executeLiveTool("set_meta_targeting", args);
  }

  if (toolName === "create_meta_ad") {
    return await MetaMcpClient.executeLiveTool("create_meta_ad", args);
  }

  if (toolName === "create_meta_video_ad") {
    return await MetaMcpClient.executeLiveTool("create_meta_video_ad", args);
  }

  if (toolName === "verify_meta_campaign") {
    return await MetaMcpClient.executeLiveTool("verify_meta_campaign", args);
  }

  if (toolName === "create_google_child_account") {
    return await GoogleMcpClient.executeTool("create_google_child_account", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "switch_google_account") {
    return await GoogleMcpClient.executeTool("switch_google_account", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "create_google_campaign_budget") {
    return await GoogleMcpClient.executeTool("create_google_campaign_budget", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "create_google_campaign") {
    return await GoogleMcpClient.executeTool("create_google_campaign", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "create_google_ad_group") {
    return await GoogleMcpClient.executeTool("create_google_ad_group", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "create_google_keywords") {
    return await GoogleMcpClient.executeTool("create_google_keywords", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "create_google_negative_keywords") {
    return await GoogleMcpClient.executeTool("create_google_negative_keywords", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "create_google_responsive_search_ad") {
    return await GoogleMcpClient.executeTool("create_google_responsive_search_ad", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "set_google_campaign_locations") {
    return await GoogleMcpClient.executeTool("set_google_campaign_locations", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "set_google_campaign_languages") {
    return await GoogleMcpClient.executeTool("set_google_campaign_languages", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "verify_google_campaign") {
    return await GoogleMcpClient.executeTool("verify_google_campaign", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "rollback_google_campaign") {
    return await GoogleMcpClient.executeTool("rollback_google_campaign", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "update_meta_campaign") {
    return await MetaMcpClient.executeLiveTool("update_meta_campaign", args);
  }

  if (toolName === "update_google_campaign") {
    return await GoogleMcpClient.executeTool("update_google_campaign", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "list_google_keywords") {
    return await GoogleMcpClient.executeTool("list_google_keywords", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "list_google_ads") {
    return await GoogleMcpClient.executeTool("list_google_ads", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  if (toolName === "get_google_campaign_structure") {
    return await GoogleMcpClient.executeTool("get_google_campaign_structure", args, {
      userId: args.userId,
      accountId: args.accountId,
    });
  }

  throw new Error(`Tool ${toolName} not supported`);
}
