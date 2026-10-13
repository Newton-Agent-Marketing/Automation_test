// src/services/meta/metaApiService.js
import axios from "axios";
import fs from "fs";
import path from "path";
import MetaAssetResolver from "./metaAssetResolver.js";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v24.0";
const META_GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const META_GRAPH_VIDEO_URL = `https://graph-video.facebook.com/${GRAPH_VERSION}`;
const META_OAUTH_DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

export const COUNTRY_NAME_TO_ISO = {
  india: "IN",
  "united states": "US",
  usa: "US",
  us: "US",
  "united kingdom": "GB",
  uk: "GB",
  canada: "CA",
  australia: "AU",
  "united arab emirates": "AE",
  uae: "AE",
  dubai: "AE",
  germany: "DE",
  france: "FR",
  singapore: "SG",
  italy: "IT",
  spain: "ES",
  brazil: "BR",
  mexico: "MX",
  japan: "JP",
  netherlands: "NL",
  indonesia: "ID",
  malaysia: "MY",
  philippines: "PH",
  pakistan: "PK",
  bangladesh: "BD",
  saudi: "SA",
  "saudi arabia": "SA",
  qatar: "QA",
  kuwait: "KW",
  oman: "OM",
  bahrain: "BH",
  turkey: "TR",
  nigeria: "NG",
  "south africa": "ZA",
  russia: "RU",
  china: "CN",
  "new zealand": "NZ",
  vietnam: "VN",
  thailand: "TH",
  nepal: "NP",
  "sri lanka": "LK",
};

export function normalizeCountryCodes(countries) {
  if (!countries) return ["IN"];
  const list = Array.isArray(countries) ? countries : [countries];
  const valid = [];
  for (const item of list) {
    if (!item || typeof item !== "string") continue;
    const clean = item.trim();
    if (clean.length === 2) {
      valid.push(clean.toUpperCase());
    } else {
      const mapped = COUNTRY_NAME_TO_ISO[clean.toLowerCase()];
      if (mapped) valid.push(mapped);
    }
  }
  return valid.length > 0 ? Array.from(new Set(valid)) : ["IN"];
} 

export class MetaApiService {
  // Helper: Auto-resolve active Meta OAuth Access Token from DB / env
  static async resolveOAuthToken(accountId, userId, passedToken) {
    if (
      passedToken &&
      typeof passedToken === "string" &&
      passedToken.trim() !== "" &&
      passedToken !== "true" &&
      !passedToken.startsWith("ey") &&
      !passedToken.includes(".")
    ) {
      return passedToken.trim();
    }

    try {
      const MetaAccount = (await import("../../models/metaAccount.js")).default;
      const cleanId = accountId ? (String(accountId).startsWith("act_") ? accountId : `act_${accountId}`) : null;
      const rawId = accountId ? String(accountId).replace(/^act_/, "") : null;

      const query = { isActive: true, accessToken: { $exists: true, $ne: "" } };
      if (userId) query.userId = userId;

      if (accountId) {
        query.$or = [{ accountId }, { accountId: cleanId }, { accountId: rawId }];
      }

      let acc = await MetaAccount.findOne(query).sort({ updatedAt: -1 }).lean();
      if (!acc && userId) {
        // If not found by specific accountId under userId, check if user's connected account has access
        const userAcc = await MetaAccount.findOne({ userId, isActive: true, accessToken: { $exists: true, $ne: "" } }).sort({ updatedAt: -1 }).lean();
        if (userAcc?.accessToken && cleanId) {
          try {
            const checkUrl = `${META_GRAPH_URL}/${cleanId}`;
            const checkRes = await axios.get(checkUrl, {
              params: { access_token: userAcc.accessToken, fields: "id,account_id,name" },
              timeout: 5000,
            });
            if (checkRes.data?.id) {
              acc = { ...userAcc, accountId: cleanId };
            }
          } catch (accessErr) {
            console.warn(`[OAuth Token Warning]: Connected user token does not have access to account ${cleanId}:`, accessErr.response?.data?.error?.message || accessErr.message);
          }
        }
      }

      // If accountId was NOT specified, fallback to user's active account
      if (!acc && !accountId && userId) {
        acc = await MetaAccount.findOne({ userId, isActive: true, accessToken: { $exists: true, $ne: "" } }).sort({ updatedAt: -1 }).lean();
      }

      if (acc?.accessToken) {
        const mask = (t) => (t && t.length > 15 ? `${t.slice(0, 10)}...${t.slice(-5)}` : "REDACTED");
        console.log(`🔑 [OAuth Token Auto-Resolved]: Account=${accountId || acc.accountId} | Token=${mask(acc.accessToken)}`);
        return acc.accessToken;
      }
    } catch (err) {
      console.warn("[OAuth Token Auto-Resolve Warning]:", err.message);
    }

    throw new Error("Meta OAuth Access Token is missing or invalid. Please connect your Meta account in Marketing Channels.");
  }

  // Helper: Invalidate user/account upload caches to prevent cross-account cache leakage
  static clearUploadCache(userId = null, accountId = null) {
    if (!userId && !accountId) {
      this.videoUploadCache.clear();
      this.imageUploadCache.clear();
      return;
    }
    const cleanId = accountId ? (String(accountId).startsWith("act_") ? accountId : `act_${accountId}`) : null;
    for (const key of this.videoUploadCache.keys()) {
      if ((userId && key.startsWith(`${userId}___`)) || (cleanId && key.includes(`___${cleanId}___`))) {
        this.videoUploadCache.delete(key);
      }
    }
    for (const key of this.imageUploadCache.keys()) {
      if ((userId && key.startsWith(`${userId}___`)) || (cleanId && key.includes(`___${cleanId}___`))) {
        this.imageUploadCache.delete(key);
      }
    }
  }

  // Helper: Exponential Backoff Retry for Meta API Rate Limit Error [80004] (Too many calls to ad account)
  static async withRateLimitRetry(fn, maxRetries = 5, onRetry = null) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const metaErr = err.response?.data?.error || {};
        const errMsg = (metaErr.message || metaErr.error_user_msg || err.message || "").toLowerCase();
        const errCode = metaErr.code;
        const errSubcode = metaErr.error_subcode;
        const status = err.response?.status;

        const isRateLimit =
          errCode === 80004 ||
          errCode === 17 ||
          errCode === 4 ||
          errCode === 32 ||
          errCode === 613 ||
          errSubcode === 2446079 ||
          errSubcode === 1487390 ||
          status === 429 ||
          errMsg.includes("too many calls") ||
          errMsg.includes("rate limit") ||
          errMsg.includes("throttled") ||
          errMsg.includes("user-level rate limit") ||
          errMsg.includes("account-level rate limit");

        if (isRateLimit && attempt < maxRetries) {
          let backoffMs = attempt === 1 ? 5000 : attempt === 2 ? 15000 : attempt === 3 ? 30000 : attempt === 4 ? 45000 : 60000;

          // Respect standard HTTP Retry-After header if provided by Meta
          const retryAfterHeader = err.response?.headers?.["retry-after"] || err.response?.headers?.["Retry-After"];
          if (retryAfterHeader) {
            const parsedSeconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
              backoffMs = parsedSeconds * 1000;
            }
          } else if (typeof metaErr.estimated_wait_time === "number" && metaErr.estimated_wait_time > 0) {
            backoffMs = metaErr.estimated_wait_time * 1000;
          }

          console.warn(`[Meta Graph API Rate Limit ${errCode || 429} Notice]: Retrying request (attempt ${attempt}/${maxRetries}) after ${backoffMs / 1000}s pause to clear Meta Ad Account quota...`);
          if (typeof onRetry === "function") {
            try { onRetry(attempt, backoffMs); } catch (_) {}
          }
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        throw err;
      }
    }
  }

  // 1. Generate Meta OAuth Authorization URL
  static generateOAuthUrl({
    clientId = process.env.META_APP_ID,
    redirectUri = process.env.META_REDIRECT_URI || `${process.env.FRONTEND_URL || "http://localhost:5173"}/channels`,
    state = "meta_oauth_state",
    scope = "ads_management,ads_read,read_insights,business_management,pages_read_engagement",
  } = {}) {
    if (!clientId || clientId === "your_meta_app_id_here") {
      throw new Error(
        "META_APP_ID is not configured or is using an invalid placeholder in backend/.env. Please configure a valid Facebook App ID from developers.facebook.com to use OAuth, or connect directly using the MCP Server / Access Token method."
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope,
      response_type: "code",
    });
    return `${META_OAUTH_DIALOG_URL}?${params.toString()}`;
  }

  // 2. Exchange Authorization Code for Short-Lived User Access Token
  static async exchangeCodeForToken({
    code,
    redirectUri = process.env.META_REDIRECT_URI || `${process.env.FRONTEND_URL || "http://localhost:5173"}/channels`,
    clientId = process.env.META_APP_ID,
    clientSecret = process.env.META_APP_SECRET || "",
  }) {
    if (!code) throw new Error("Authorization code is required for token exchange");

    // If code is already a Meta access token, return directly
    if (typeof code === "string" && code.startsWith("EAAB")) {
      return {
        access_token: code,
        token_type: "bearer",
        expires_in: 5184000,
      };
    }

    // If client credentials are configured, do the real Graph API exchange
    if (clientId && clientSecret) {
      try {
        const url = `${META_GRAPH_URL}/oauth/access_token`;
        const response = await axios.get(url, {
          params: {
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            code,
          },
        });
        return response.data;
      } catch (err) {
        console.error("[Meta Token Exchange Error]:", err.response?.data || err.message);
        const metaErr = err.response?.data?.error;
        throw new Error(
          `Meta Token Exchange Failed: ${metaErr?.message || err.message}`
        );
      }
    }

    // In dev mode without configured Meta App secret, provide a seamless token exchange
    return {
      access_token: code.startsWith("EAAB") ? code : `EAAB_simulated_${Date.now()}_${code.slice(0, 16)}`,
      token_type: "bearer",
      expires_in: 5184000, // 60 days
    };
  }

  // 3. Exchange for Long-Lived Token (60 Days)
  static async getLongLivedToken({
    accessToken,
    clientId = process.env.META_APP_ID,
    clientSecret = process.env.META_APP_SECRET,
  }) {
    if (!clientId || !clientSecret) return { access_token: accessToken };

    try {
      const url = `${META_GRAPH_URL}/oauth/access_token`;
      const response = await axios.get(url, {
        params: {
          grant_type: "fb_exchange_token",
          client_id: clientId,
          client_secret: clientSecret,
          fb_exchange_token: accessToken,
        },
      });
      return response.data;
    } catch (err) {
      console.warn("[Meta Long-Lived Token Warning]:", err.response?.data || err.message);
      return { access_token: accessToken };
    }
  }

  // 4. Verify Access Token
  static async verifyAccessToken(accessToken) {
    const url = `${META_GRAPH_URL}/me`;
    const response = await axios.get(url, {
      params: {
        access_token: accessToken,
        fields: "id,name,email",
      },
    });
    return response.data;
  }

  // 5. Fetch all Ad Accounts accessible with this Access Token
  static async getUserAdAccounts(accessToken) {
    const url = `${META_GRAPH_URL}/me/adaccounts`;
    const response = await axios.get(url, {
      params: {
        access_token: accessToken,
        fields:
          "id,account_id,name,currency,timezone_name,account_status,spend_cap,amount_spent,business_name",
        limit: 50,
      },
    });
    return response.data.data || [];
  }

  // 6. Single Account Details fetch karna
  static async getAccountDetails(accountId, accessToken) {
    const cleanId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const url = `${META_GRAPH_URL}/${cleanId}`;
    const response = await axios.get(url, {
      params: {
        access_token: accessToken,
        fields:
          "id,account_id,name,currency,timezone_name,account_status,spend_cap,amount_spent,business_name",
      },
    });
    return response.data;
  }

  // 7. Campaigns List fetch karna
  static async getCampaigns(param1, param2) {
    let accountId = param1;
    let accessToken = param2;

    if (param1 && typeof param1 === "object") {
      accountId = param1.accountId || param1.effectiveAccountId || param1.id;
      accessToken = param1.accessToken || param1.effectiveToken || param1.token;
    }

    if (!accessToken || accessToken === true) {
      if (accountId) {
        try {
          const MetaAccount = (await import("../../models/metaAccount.js")).default;
          const cleanId = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;
          const rawId = String(accountId).replace(/^act_/, "");
          const acc = await MetaAccount.findOne({
            $or: [{ accountId }, { accountId: cleanId }, { accountId: rawId }],
            isActive: true,
            accessToken: { $exists: true, $ne: "" },
          });
          if (acc?.accessToken) {
            accessToken = acc.accessToken;
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (!accessToken || typeof accessToken !== "string" || !accessToken.trim()) return [];

    console.log(`🔑 [Meta API Token Resolution]: Target Account=${accountId} | Token=[REDACTED]`);

    const cleanId = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;
    const url = `${META_GRAPH_URL}/${cleanId}/campaigns`;
    const response = await axios.get(url, {
      params: {
        access_token: accessToken,
        fields:
          "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time",
        limit: 100,
      },
    });
    return response.data.data || [];
  }

  // 8. Create Live Campaign on Meta Ads
  static async createCampaign(
    accountId,
    accessToken,
    {
      name,
      objective = "OUTCOME_SALES",
      dailyBudget,
      daily_budget,
      daily_budget_inr,
      campaign_daily_budget,
      campaign_daily_budget_inr,
      budget,
      lifetimeBudget,
      status = "PAUSED",
      specialAdCategories = ["NONE"],
      userId = null,
    } = {},
    callerUserId = null
  ) {
    const effectiveUserId = callerUserId || userId || null;
    accessToken = await this.resolveOAuthToken(accountId, effectiveUserId, accessToken);
    const cleanId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const url = `${META_GRAPH_URL}/${cleanId}/campaigns`;

    const payload = {
      name: this.truncateToMaxBytes(name || `Campaign_${Date.now()}`, 250),
      objective,
      status: status || "PAUSED",
      special_ad_categories: JSON.stringify(specialAdCategories || ["NONE"]),
      access_token: accessToken,
    };

    const rawCampBudget = dailyBudget || daily_budget || daily_budget_inr || campaign_daily_budget || campaign_daily_budget_inr || budget;
    const effectiveDailyBudget = rawCampBudget ? Number(String(rawCampBudget).replace(/[^0-9.]/g, "")) : null;

    if (effectiveDailyBudget && !isNaN(effectiveDailyBudget) && effectiveDailyBudget > 0) {
      // Meta Graph API daily_budget is in minor currency units (cents / paise)
      payload.daily_budget = Math.round(effectiveDailyBudget * 100);
      payload.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
    } else if (lifetimeBudget) {
      payload.lifetime_budget = Math.round(Number(lifetimeBudget) * 100);
      payload.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
    }

    return await this.withRateLimitRetry(async () => {
      try {
        const response = await axios.post(url, null, { params: payload });
        return response.data;
      } catch (error) {
        // If remote Graph API throws error, capture details
        const metaErr = error.response?.data?.error;
        if (metaErr) {
          const errToThrow = new Error(
            `Meta API Error [${metaErr.code || "unknown"}]: ${metaErr.message || metaErr.error_user_msg || error.message}`
          );
          errToThrow.response = error.response;
          throw errToThrow;
        }
        throw error;
      }
    });
  }

  // 9. Update Campaign Status / Budget on Meta Ads
  static async updateCampaign(campaignId, accessToken, { name, status, dailyBudget }) {
    const url = `${META_GRAPH_URL}/${campaignId}`;
    const params = { access_token: accessToken };

    if (name) params.name = name;
    if (status) params.status = status;
    if (dailyBudget) params.daily_budget = Math.round(Number(dailyBudget) * 100);

    try {
      const response = await axios.post(url, null, { params });
      return response.data;
    } catch (error) {
      const metaErr = error.response?.data?.error;
      if (metaErr) {
        throw new Error(`Meta API Update Error: ${metaErr.message || error.message}`);
      }
      throw error;
    }
  }

  // 10. Fetch user's managed Facebook Pages (/me/accounts)
  static async getUserPages(accessToken) {
    if (!accessToken) return [];
    try {
      const url = `${META_GRAPH_URL}/me/accounts`;
      const response = await axios.get(url, {
        params: {
          access_token: accessToken,
          fields: "id,name,category,access_token,tasks",
          limit: 50,
        },
      });
      return response.data?.data || [];
    } catch (err) {
      console.warn("[Meta getUserPages Warning]:", err.response?.data?.error?.message || err.message);
      return [];
    }
  }

  // 10.5. Fetch pages promotable by this Ad Account (/act_<id>/promote_pages)
  static async getPromotePages(accountId, accessToken) {
    if (!accessToken || !accountId) return [];
    try {
      const cleanId = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;
      const url = `${META_GRAPH_URL}/${cleanId}/promote_pages`;
      const response = await axios.get(url, {
        params: {
          access_token: accessToken,
          fields: "id,name",
          limit: 50,
        },
      });
      return response.data?.data || [];
    } catch (err) {
      return [];
    }
  }

  // 11. Auto-resolve a valid Facebook Page ID dynamically from Meta
  static async resolvePageId(accountId, accessToken, requestedPageId) {
    const res = await MetaAssetResolver.verifyAndResolvePageAsset({
      accountId,
      accessToken,
      requestedPageId,
    });
    return res.valid ? res.pageId : null;
  }

  // 11.1. Authoritatively verify and resolve Facebook Page asset with Ads permission
  static async verifyAndResolvePageAsset({ accountId, accessToken, requestedPageId, allowFallbackPage = false }) {
    return MetaAssetResolver.verifyAndResolvePageAsset({
      accountId,
      accessToken,
      requestedPageId,
      allowFallbackPage,
    });
  }

  // 11.5. Auto-resolve & verify a valid Instagram User ID (instagram_user_id)
  static async resolveInstagramUserId(accountId, accessToken, pageId, requestedIgId, source = "Excel Sheet / Request") {
    const isPresent = Boolean(requestedIgId && String(requestedIgId).trim());
    let isVerified = false;
    let verifiedId = null;

    if (isPresent) {
      let clean = String(requestedIgId).trim().replace(/^@/, "");
      if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(clean)) {
        try {
          clean = BigInt(Math.round(Number(clean))).toString();
        } catch (e) {
          clean = Number(clean).toLocaleString("fullwide", { useGrouping: false });
        }
      }
      clean = clean.replace(/\.0+$/, "").replace(/[^0-9]/g, "");

      if (/^\d{5,}$/.test(clean)) {
        try {
          const cleanAccId = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;
          // 1. Check Ad Account linked instagram accounts via Meta Graph API
          const accIgRes = await axios.get(`${META_GRAPH_URL}/${cleanAccId}/instagram_accounts`, {
            params: { access_token: accessToken, fields: "id,username" },
          });
          const accIgs = accIgRes.data?.data || [];
          const matchAccIg = accIgs.find((ig) => String(ig.id) === clean);
          if (matchAccIg) {
            isVerified = true;
            verifiedId = clean;
          }

          // 2. Check Page linked instagram accounts via Meta Graph API if not verified yet
          if (!isVerified && pageId) {
            const pageIgRes = await axios.get(`${META_GRAPH_URL}/${pageId}`, {
              params: { access_token: accessToken, fields: "instagram_business_account,connected_instagram_account" },
            });
            const linkedId = pageIgRes.data?.instagram_business_account?.id || pageIgRes.data?.connected_instagram_account?.id;
            if (linkedId && String(linkedId) === clean) {
              isVerified = true;
              verifiedId = clean;
            }
          }
        } catch (vErr) {
          isVerified = false;
        }
      }
    }

    console.log(`Instagram user ID source: ${source}`);
    console.log(`Instagram user ID present: ${isPresent}`);
    console.log(`Instagram user ID verified: ${isVerified}`);
    console.log(`Page ID: ${pageId || "None"}`);

    if (isVerified && verifiedId) {
      return verifiedId;
    }

    // Unverified or absent -> Omit completely from object_story_spec
    return null;
  }

  // 12. Search Interest IDs on Meta Graph API
  static async searchInterests(query, accessToken) {
    if (!query || !accessToken) return [];
    try {
      const url = `${META_GRAPH_URL}/search`;
      const response = await axios.get(url, {
        params: {
          type: "adinterest",
          q: query,
          access_token: accessToken,
          limit: 3,
        },
      });
      return response.data?.data || [];
    } catch (err) {
      console.warn(`[Meta Interest Search Warning for "${query}"]:`, err.response?.data?.error?.message || err.message);
      return [];
    }
  }

  static accountPixelsCache = new Map();
  static accountAppsCache = new Map();
  static userAccountsCache = new Map();

  // 13. Fetch Pixels on Meta Ad Account
  static async getAccountPixels(accountId, accessToken) {
    if (!accessToken) return [];
    const cleanId = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;
    if (this.accountPixelsCache.has(cleanId)) {
      return this.accountPixelsCache.get(cleanId);
    }
    try {
      const res = await axios.get(`${META_GRAPH_URL}/${cleanId}/adspixels`, {
        params: { access_token: accessToken, fields: "id,name" },
      });
      const data = res.data?.data || [];
      this.accountPixelsCache.set(cleanId, data);
      return data;
    } catch (e) {
      return [];
    }
  }

  // Fetch Connected Apps on Meta Ad Account
  static async getAccountApps(accountId, accessToken) {
    if (!accessToken) return [];
    const cleanId = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;
    if (this.accountAppsCache.has(cleanId)) {
      return this.accountAppsCache.get(cleanId);
    }
    try {
      const res = await axios.get(`${META_GRAPH_URL}/${cleanId}/applications`, {
        params: { access_token: accessToken, fields: "id,name" },
      });
      const data = res.data?.data || [];
      this.accountAppsCache.set(cleanId, data);
      return data;
    } catch (e) {
      return [];
    }
  }

  // 13.5. Dynamically verify and resolve Pixel asset for the selected ad account
  static async verifyAndResolvePixelAsset({ accountId, accessToken, requestedPixelId, objective, allowFallbackPixel = false }) {
    const cleanId = accountId ? (String(accountId).startsWith("act_") ? accountId : `act_${accountId}`) : null;
    const objUpper = String(objective || "").toUpperCase();
    const isPixelRequired = ["OUTCOME_SALES", "SALES", "CONVERSIONS", "OFFSITE_CONVERSIONS"].includes(objUpper);

    // Case A: Pixel ID explicitly supplied
    if (requestedPixelId && String(requestedPixelId).trim()) {
      const cleanPixelId = String(requestedPixelId).trim();

      // 1. Verify if this pixel is associated with the selected account
      if (cleanId) {
        const accountPixels = await this.getAccountPixels(cleanId, accessToken);
        const isAssociated = accountPixels.some((p) => String(p.id) === cleanPixelId);
        if (isAssociated) {
          return {
            valid: true,
            pixelId: cleanPixelId,
            status: "VERIFIED",
            blocked: false,
            source: "SELECTED_ACCOUNT",
            message: `Pixel ${cleanPixelId} is verified and authorized on account ${cleanId}.`,
          };
        }

        // If requested Pixel ID is supplied, never silently substitute it with another pixel unless fallback is explicitly enabled
      }

      // 2. Query other accounts the authenticated user is authorized to access
      try {
        const userAccounts = await this.getUserAdAccounts(accessToken);
        for (const otherAcc of userAccounts) {
          const otherId = String(otherAcc.id || otherAcc.account_id);
          const cleanOtherId = otherId.startsWith("act_") ? otherId : `act_${otherId}`;
          if (cleanOtherId === cleanId) continue;

          const otherPixels = await this.getAccountPixels(cleanOtherId, accessToken);
          const match = otherPixels.find((p) => String(p.id) === cleanPixelId);
          if (match) {
            return {
              valid: false,
              pixelId: cleanPixelId,
              status: "CROSS_ACCOUNT_PERMISSION_REQUIRED",
              blocked: isPixelRequired,
              owningAccount: { id: cleanOtherId, name: otherAcc.name },
              requiredAction: `Pixel ${cleanPixelId} belongs to accessible account ${otherAcc.name || cleanOtherId} (${cleanOtherId}), but is not shared with selected account ${cleanId}. In Meta Business Manager, go to Business Settings -> Data Sources -> Pixels, select Pixel ${cleanPixelId}, click "Connected Assets", and add Ad Account ${cleanId}.`,
              error: `Cross-account asset sharing required: Pixel ${cleanPixelId} belongs to ${otherAcc.name || cleanOtherId} and must be shared with ${cleanId}.`,
            };
          }
        }
      } catch (accErr) {
        const status = accErr.response?.status || "N/A";
        const metaError = accErr.response?.data?.error || accErr.response?.data || accErr.message;
        const endpoint = accErr.config?.url ? accErr.config.url.replace(/access_token=[^&]+/g, "access_token=[REDACTED]") : "Meta Graph API";
        console.warn(`[Meta Pixel Cross-Account Verification Warning]: HTTP ${status} from ${endpoint}:`, typeof metaError === "object" ? JSON.stringify(metaError) : metaError);
      }

      // 3. Fallback pixel if explicitly allowed
      if (allowFallbackPixel && cleanId) {
        const accountPixels = await this.getAccountPixels(cleanId, accessToken);
        if (accountPixels && accountPixels.length === 1) {
          const singlePix = accountPixels[0];
          console.log(`ℹ️ [Meta Pixel Auto-Resolution Notice]: Dynamic fallback selected: Using verified account pixel "${singlePix.id}" (${singlePix.name || "Pixel"}) instead of requested pixel "${cleanPixelId}".`);
          return {
            valid: true,
            pixelId: String(singlePix.id),
            status: "FALLBACK_PIXEL_SELECTED",
            source: "SELECTED_ACCOUNT_FALLBACK",
            blocked: false,
            originalRequestedPixelId: cleanPixelId,
            message: `Fallback Pixel selected: Using verified account pixel "${singlePix.id}" (${singlePix.name || "Pixel"}) instead of requested pixel "${cleanPixelId}".`,
          };
        }
      }

      // If campaign configuration does NOT require a Pixel (e.g. Traffic, Awareness, Engagement)
      if (!isPixelRequired) {
        return {
          valid: true,
          pixelId: null,
          status: "TRACKING_OPTIONAL",
          blocked: false,
          warning: `Pixel ${cleanPixelId} is not accessible or valid on account ${cleanId}, but was safely omitted because tracking is optional for objective ${objUpper || "standard"}.`,
          message: `Tracking pixel is optional for objective ${objUpper || "standard"} and was omitted.`,
        };
      }

      // 4. Query Meta Graph API directly to distinguish Incorrect ID vs Missing Permissions vs External Business
      let directMetaCheck = null;
      if (accessToken) {
        try {
          const directRes = await axios.get(`https://graph.facebook.com/v24.0/${cleanPixelId}`, {
            params: {
              access_token: accessToken,
              fields: "id,name,owner_business,creation_time",
            },
            timeout: 10000,
          });
          directMetaCheck = { success: true, data: directRes.data };
        } catch (directErr) {
          const errCode = directErr.response?.data?.error?.code;
          const errSubcode = directErr.response?.data?.error?.error_subcode;
          const errMsg = directErr.response?.data?.error?.message || directErr.message;
          directMetaCheck = {
            success: false,
            code: errCode,
            subcode: errSubcode,
            message: errMsg,
          };
        }
      }

      // 4A: Object does not exist on Meta Graph API -> INCORRECT_ID
      if (
        directMetaCheck &&
        !directMetaCheck.success &&
        (directMetaCheck.code === 100 && (directMetaCheck.subcode === 33 || /does not exist|cannot be loaded/i.test(directMetaCheck.message)))
      ) {
        return {
          valid: false,
          pixelId: cleanPixelId,
          status: "INVALID_PIXEL_ID",
          blocked: true,
          error: `Incorrect Pixel ID: Pixel ${cleanPixelId} does not exist on Meta Graph API (Meta Error 100/Subcode 33: Object does not exist).`,
          requiredAction: `Pixel ${cleanPixelId} does not exist on Meta. Verify the spreadsheet cell for typos or inadvertent spreadsheet drag/auto-fill series increments (e.g. 909136826822894 vs 909136826822895), and ensure the ID matches an active Pixel in Meta Events Manager.`,
        };
      }

      // 4B: Pixel exists on Meta but authenticated user lacks permissions -> PIXEL_PERMISSION_MISSING
      if (
        directMetaCheck &&
        !directMetaCheck.success &&
        (directMetaCheck.code === 10 || directMetaCheck.code === 200 || /permission/i.test(directMetaCheck.message))
      ) {
        return {
          valid: false,
          pixelId: cleanPixelId,
          status: "PIXEL_PERMISSION_MISSING",
          blocked: true,
          error: `Pixel Permission Missing: Pixel ${cleanPixelId} exists on Meta, but the authenticated user lacks permissions or Business Manager authorization to access it.`,
          requiredAction: `Grant the authenticated Meta user 'Manage Pixel' or 'Advertise' permissions for Pixel ${cleanPixelId} in Meta Business Manager.`,
        };
      }

      // 4C: Pixel exists on Meta in an external business -> PIXEL_NOT_SHARED_WITH_ACCOUNT
      if (directMetaCheck && directMetaCheck.success) {
        const pixData = directMetaCheck.data;
        const bizName = pixData.owner_business?.name || "External Business";
        return {
          valid: false,
          pixelId: cleanPixelId,
          status: "PIXEL_NOT_SHARED_WITH_ACCOUNT",
          blocked: true,
          error: `Pixel Not Connected to Ad Account: Pixel ${cleanPixelId} (${pixData.name || "Pixel"}) exists in Meta Business Manager (${bizName}), but is not added as a Connected Asset to selected ad account ${cleanId}.`,
          requiredAction: `In Meta Business Manager for ${bizName}, go to Business Settings -> Data Sources -> Pixels -> select Pixel ${cleanPixelId} -> click 'Connected Assets' -> add Ad Account ${cleanId}.`,
        };
      }

      // 4D: Default fallback when pixel is inaccessible on accessible authorized accounts
      return {
        valid: false,
        pixelId: cleanPixelId,
        status: "ASSET_UNAVAILABLE",
        blocked: isPixelRequired,
        requiredAction: `Pixel ${cleanPixelId} was not found on selected account ${cleanId} or any accessible accounts for this user. Verify that the Pixel ID is correct and that the user's Meta Business Manager permissions grant access.`,
        error: `Pixel ${cleanPixelId} is inaccessible or does not exist for the authenticated user.`,
      };
    }

    // Case B: Pixel ID not supplied in row/request
    if (!isPixelRequired) {
      return {
        valid: true,
        pixelId: null,
        status: "TRACKING_OPTIONAL",
        blocked: false,
        message: `Tracking pixel is optional for objective ${objUpper || "standard"} and was omitted.`,
      };
    }

    // Case C: Pixel ID is required for objective, but omitted -> Discover on account
    if (!cleanId) {
      return {
        valid: false,
        pixelId: null,
        status: "MISSING_REQUIRED_ASSET",
        blocked: true,
        requiredAction: `A Pixel ID is required for campaign objective ${objUpper}, but no ad account was selected.`,
        error: `Missing required Pixel ID and ad account for objective ${objUpper}.`,
      };
    }

    const accountPixels = await this.getAccountPixels(cleanId, accessToken);
    if (!accountPixels || accountPixels.length === 0) {
      return {
        valid: false,
        pixelId: null,
        status: "MISSING_REQUIRED_ASSET",
        blocked: true,
        requiredAction: `Campaign objective (${objUpper}) requires a conversion tracking Pixel, but no Pixel ID was supplied in the spreadsheet row and selected ad account ${cleanId} has no associated pixels. Please specify a Pixel ID in the spreadsheet row or connect a Pixel in Meta Business Manager.`,
        error: `Missing required conversion Pixel for objective ${objUpper} on account ${cleanId}.`,
      };
    }

    if (accountPixels.length > 1) {
      return {
        valid: false,
        pixelId: null,
        status: "AMBIGUOUS_ASSET",
        clarificationNeeded: true,
        blocked: true,
        availableAssets: accountPixels.map((p) => ({ id: p.id, name: p.name })),
        requiredAction: `Multiple eligible Pixels were found on account ${cleanId} (${accountPixels.map((p) => `${p.name || "Pixel"} [${p.id}]`).join(", ")}). Clarification required: please specify the intended Pixel ID in the spreadsheet row.`,
        error: `Ambiguous Pixel selection: Multiple pixels available on account ${cleanId}.`,
      };
    }

    return {
      valid: true,
      pixelId: accountPixels[0].id,
      status: "DISCOVERED_SINGLE_ACCOUNT_ASSET",
      blocked: false,
      message: `Dynamically resolved verified single pixel ${accountPixels[0].id} (${accountPixels[0].name || "Pixel"}) from account ${cleanId}.`,
    };
  }

  // 13.6. Dynamically verify and resolve App asset for the selected ad account
  static async verifyAndResolveAppAsset({ accountId, accessToken, requestedAppId, objective }) {
    const cleanId = accountId ? (String(accountId).startsWith("act_") ? accountId : `act_${accountId}`) : null;
    const objUpper = String(objective || "").toUpperCase();
    const isAppRequired = ["APP_INSTALLS", "OUTCOME_APP_PROMOTION"].includes(objUpper);

    if (requestedAppId && String(requestedAppId).trim()) {
      const cleanAppId = String(requestedAppId).trim();
      if (cleanId) {
        const accountApps = await this.getAccountApps(cleanId, accessToken);
        const isAssociated = accountApps.some((a) => String(a.id) === cleanAppId);
        if (isAssociated) {
          return {
            valid: true,
            appId: cleanAppId,
            status: "VERIFIED",
            source: "SELECTED_ACCOUNT",
            message: `App ${cleanAppId} is verified and authorized on account ${cleanId}.`,
          };
        }
      }

      // If objective does not require an App ID, cleanly omit without multi-account scanning
      if (!isAppRequired) {
        return {
          valid: true,
          appId: null,
          status: "APP_OMITTED_OPTIONAL",
          blocked: false,
          warning: `App ${cleanAppId} is not linked to selected account ${cleanId}. Because objective ${objUpper || "standard"} does not require an App ID, it was cleanly omitted from the ad set tracking.`,
        };
      }

      try {
        const userAccounts = await this.getUserAdAccounts(accessToken);
        for (const otherAcc of userAccounts) {
          const otherId = String(otherAcc.id || otherAcc.account_id);
          const cleanOtherId = otherId.startsWith("act_") ? otherId : `act_${otherId}`;
          if (cleanOtherId === cleanId) continue;

          const otherApps = await this.getAccountApps(cleanOtherId, accessToken);
          const match = otherApps.find((a) => String(a.id) === cleanAppId);
          if (match) {
            return {
              valid: false,
              appId: cleanAppId,
              status: "CROSS_ACCOUNT_PERMISSION_REQUIRED",
              blocked: true,
              owningAccount: { id: cleanOtherId, name: otherAcc.name },
              requiredAction: `App ${cleanAppId} is associated with authorized account ${otherAcc.name || cleanOtherId} (${cleanOtherId}), but is not linked to selected account ${cleanId}. In Meta Business Manager, link App ${cleanAppId} to Ad Account ${cleanId}.`,
              error: `Cross-account asset sharing required: App ${cleanAppId} belongs to ${otherAcc.name || cleanOtherId} and must be shared with ${cleanId}.`,
            };
          }
        }
      } catch (err) {
        const status = err.response?.status || "N/A";
        const metaError = err.response?.data?.error || err.response?.data || err.message;
        const endpoint = err.config?.url ? err.config.url.replace(/access_token=[^&]+/g, "access_token=[REDACTED]") : "Meta Graph API";
        console.warn(`[Meta App Cross-Account Verification Warning]: HTTP ${status} from ${endpoint}:`, typeof metaError === "object" ? JSON.stringify(metaError) : metaError);
      }

      if (cleanId) {
        try {
          const accountApps = await this.getAccountApps(cleanId, accessToken);
          if (accountApps && accountApps.length === 1) {
            return {
              valid: true,
              appId: accountApps[0].id,
              status: "DYNAMIC_ACCOUNT_ALTERNATIVE_RESOLVED",
              blocked: false,
              message: `Supplied App ${cleanAppId} is unlinked to account ${cleanId}, but account has a single verified active app: ${accountApps[0].id} (${accountApps[0].name || "App"}). Dynamically resolved alternative.`,
            };
          }
        } catch (e) {
          // ignore inspection failure
        }
      }

      if (!isAppRequired) {
        return {
          valid: true,
          appId: null,
          status: "APP_OMITTED_OPTIONAL",
          blocked: false,
          warning: `App ID ${cleanAppId} is not linked to account ${cleanId} and campaign objective ${objUpper || "standard"} does not require an App ID; omitted from ad tracking.`,
        };
      }

      return {
        valid: false,
        appId: cleanAppId,
        status: "ASSET_UNAVAILABLE",
        blocked: isAppRequired,
        requiredAction: `App ${cleanAppId} was not found on selected account ${cleanId} or any accessible accounts for this user. Verify that the App ID is correct in Meta App Dashboard / Business Manager.`,
        error: `App ${cleanAppId} is inaccessible or does not exist for the authenticated user.`,
      };
    }

    if (!isAppRequired) {
      return {
        valid: true,
        appId: null,
        status: "APP_OPTIONAL",
        blocked: false,
        message: `App ID is optional for objective ${objUpper || "standard"} and was omitted.`,
      };
    }

    if (!cleanId) {
      return {
        valid: false,
        appId: null,
        status: "MISSING_REQUIRED_ASSET",
        blocked: true,
        requiredAction: `An App ID is required for objective ${objUpper}, but no ad account was selected.`,
        error: `Missing required App ID and ad account for objective ${objUpper}.`,
      };
    }

    const accountApps = await this.getAccountApps(cleanId, accessToken);
    if (!accountApps || accountApps.length === 0) {
      return {
        valid: false,
        appId: null,
        status: "MISSING_REQUIRED_ASSET",
        blocked: true,
        requiredAction: `Campaign objective (${objUpper}) requires an Application ID, but no App ID was specified in the spreadsheet row and account ${cleanId} has no linked apps.`,
        error: `Missing required App ID for objective ${objUpper} on account ${cleanId}.`,
      };
    }

    if (accountApps.length > 1) {
      return {
        valid: false,
        appId: null,
        status: "AMBIGUOUS_ASSET",
        clarificationNeeded: true,
        blocked: true,
        availableAssets: accountApps.map((a) => ({ id: a.id, name: a.name })),
        requiredAction: `Multiple eligible Apps found on account ${cleanId} (${accountApps.map((a) => `${a.name || "App"} [${a.id}]`).join(", ")}). Specify the desired App ID in the spreadsheet row.`,
        error: `Ambiguous App selection on account ${cleanId}.`,
      };
    }

    return {
      valid: true,
      appId: accountApps[0].id,
      status: "DISCOVERED_SINGLE_ACCOUNT_ASSET",
      blocked: false,
      message: `Dynamically resolved verified single app ${accountApps[0].id} from account ${cleanId}.`,
    };
  }

  // 14. Create Ad Set on Meta Ads
  static async createAdSet(
    accountId,
    accessToken,
    {
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
      status = "PAUSED",
      targeting = {},
      pixelId,
      appId,
      applicationId,
      objectStoreUrl,
      customEventType,
      trackingType,
      tracking_type,
      promotedObject,
    }
  ) {
    // --- 1. LIVE META CAMPAIGN VALIDATION CHECK ---
    const campaignUrl = `${META_GRAPH_URL}/${campaignId}`;
    console.log(`[Meta Campaign Validation Check] campaign_id: ${campaignId}`);
    let liveCampaign = null;
    try {
      const campRes = await this.withRateLimitRetry(async () => {
        return await axios.get(campaignUrl, {
          params: {
            fields: "id,name,status,effective_status,daily_budget,lifetime_budget",
            access_token: accessToken,
          },
        });
      });
      liveCampaign = campRes.data;
    } catch (campErr) {
      const metaErr = campErr.response?.data?.error;
      console.error("[Meta API error] Failed live campaign lookup:", {
        campaign_id: campaignId,
        error: metaErr || campErr.message,
      });
      const metaMsg = metaErr?.message || metaErr?.error_user_msg || campErr.message || "Object not found or access denied";
      const isRateLimitErr =
        metaErr?.code === 80004 ||
        metaErr?.error_subcode === 2446079 ||
        metaMsg.toLowerCase().includes("too many calls") ||
        metaMsg.toLowerCase().includes("rate limit");

      if (isRateLimitErr) {
        throw new Error(
          `Meta API Rate Limit Error [80004]: Ad Account call volume quota reached for campaign ${campaignId}. Meta is temporarily throttling requests for this Ad Account. Please pause 1-2 minutes and try again.`
        );
      }

      throw new Error(
        `Selected campaign (${campaignId}) is invalid, deleted, or inaccessible: ${metaMsg}. Please select an active campaign.`
      );
    }

    const campStatus = String(liveCampaign?.status || "").toUpperCase();
    const effectiveStatus = String(liveCampaign?.effective_status || "").toUpperCase();
    const isArchivedOrDeleted =
      campStatus.includes("ARCHIV") ||
      effectiveStatus.includes("ARCHIV") ||
      campStatus.includes("DELET") ||
      effectiveStatus.includes("DELET");

    console.log("[Meta Campaign Validation Result]:", {
      campaign_id: campaignId,
      campaign_name: liveCampaign?.name,
      campaign_status: campStatus,
      effective_status: effectiveStatus,
      validation_result: isArchivedOrDeleted ? "FAIL_ARCHIVED" : "PASS",
    });

    if (isArchivedOrDeleted) {
      console.error(
        `[Campaign Validation Failed]: campaign_id ${campaignId} is archived. campaign_status: ${campStatus}, effective_status: ${effectiveStatus}`
      );
      throw new Error("Selected campaign is archived. Please select an active campaign.");
    }

    const cleanId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const url = `${META_GRAPH_URL}/${cleanId}/adsets`;

    const normalizedCountries = normalizeCountryCodes(
      targeting.countries || targeting.locations || ["IN"]
    );

    const targetingObj = {
      geo_locations: {
        countries: normalizedCountries,
        ...(targeting.cities?.length > 0 ? { cities: targeting.cities.map((c) => ({ name: c })) } : {}),
      },
      age_min: Math.max(18, Math.min(65, Number(targeting.ageMin || targeting.age_min) || 18)),
      age_max: Math.min(65, Math.max(18, Number(targeting.ageMax || targeting.age_max) || 65)),
    };

    // Only include genders if filtered to a single gender (1=Male, 2=Female). Omit if targeting all.
    if (Array.isArray(targeting.genders) && targeting.genders.length === 1) {
      targetingObj.genders = targeting.genders;
    }

    // Resolve valid interest objects if provided
    if (targeting.interests?.length > 0) {
      const validInterests = [];
      for (const item of targeting.interests) {
        if (typeof item === "object" && item.id) {
          validInterests.push({ id: String(item.id), name: item.name || String(item.id) });
        } else if (typeof item === "string" && item.trim()) {
          const matches = await this.searchInterests(item.trim(), accessToken);
          if (matches.length > 0 && matches[0].id) {
            validInterests.push({ id: String(matches[0].id), name: matches[0].name });
          }
        }
      }
      if (validInterests.length > 0) {
        targetingObj.flexible_spec = [{ interests: validInterests }];
      }
    }

    // Determine tracking mode & promoted object
    const requestedAppId = appId || applicationId || targeting.appId || targeting.applicationId || (promotedObject && typeof promotedObject === "object" ? promotedObject?.application_id : null);
    const requestedStoreUrl = objectStoreUrl || targeting.objectStoreUrl || (promotedObject && typeof promotedObject === "object" ? promotedObject?.object_store_url : null);
    const requestedPixelId = pixelId || targeting.pixelId || (promotedObject && typeof promotedObject === "object" ? promotedObject?.pixel_id : null) || null;
    
    let mode = (trackingType || tracking_type || "").toUpperCase();
    if (!mode) {
      if (optimizationGoal === "APP_INSTALLS" || (requestedAppId && !requestedPixelId)) {
        mode = "APP";
      } else if (requestedPixelId && requestedAppId) {
        mode = "BOTH";
      } else {
        mode = "WEBSITE";
      }
    }

    let effectiveGoal = optimizationGoal;
    let effectivePromotedObject = promotedObject;

    if (mode === "APP" || (requestedAppId && !requestedPixelId && mode !== "WEBSITE")) {
      const appRes = await this.verifyAndResolveAppAsset({
        accountId: cleanId,
        accessToken,
        requestedAppId: requestedAppId || null,
        objective: effectiveGoal,
      });

      if (!appRes.valid && appRes.blocked) {
        throw new Error(`[Meta AdSet Asset Resolution Error]: ${appRes.error} ${appRes.requiredAction || ""}`.trim());
      }

      if (appRes.valid && appRes.appId) {
        effectivePromotedObject = {
          application_id: String(appRes.appId),
          ...(requestedStoreUrl ? { object_store_url: String(requestedStoreUrl) } : {}),
          custom_event_type: customEventType || (promotedObject && typeof promotedObject === "object" ? promotedObject?.custom_event_type : null) || "MOBILE_APP_INSTALL",
        };
        if (effectiveGoal === "OFFSITE_CONVERSIONS") {
          effectiveGoal = "APP_INSTALLS";
        }
      }
    } else if (mode === "WEBSITE" || requestedPixelId) {
      const pixRes = await this.verifyAndResolvePixelAsset({
        accountId: cleanId,
        accessToken,
        requestedPixelId: requestedPixelId || null,
        objective: effectiveGoal,
      });

      if (!pixRes.valid && pixRes.blocked) {
        throw new Error(`[Meta AdSet Asset Resolution Error]: ${pixRes.error} ${pixRes.requiredAction || ""}`.trim());
      }

      if (pixRes.valid && pixRes.pixelId) {
        effectivePromotedObject = {
          pixel_id: String(pixRes.pixelId),
          custom_event_type: customEventType || (promotedObject && typeof promotedObject === "object" ? promotedObject?.custom_event_type : null) || "PURCHASE",
        };
        effectiveGoal = "OFFSITE_CONVERSIONS";
      } else if (effectiveGoal === "OFFSITE_CONVERSIONS" && !effectivePromotedObject) {
        effectiveGoal = "LINK_CLICKS";
      }
    }

    const payload = {
      name: this.truncateToMaxBytes(name || `AdSet_${Date.now()}`, 250),
      campaign_id: campaignId,
      optimization_goal: effectiveGoal,
      billing_event: billingEvent || "IMPRESSIONS",
      status: status || "PAUSED",
      targeting: JSON.stringify(targetingObj),
      access_token: accessToken,
    };

    if (effectivePromotedObject) {
      payload.promoted_object = JSON.stringify(effectivePromotedObject);
    }

    const hasCampaignBudget = Boolean(liveCampaign?.daily_budget || liveCampaign?.lifetime_budget);

    if (!hasCampaignBudget) {
      const rawAdSetBudget = dailyBudget || daily_budget || daily_budget_inr || campaign_daily_budget || campaign_daily_budget_inr || budget;
      const effectiveAdSetBudget = rawAdSetBudget ? Number(String(rawAdSetBudget).replace(/[^0-9.]/g, "")) : null;

      if (effectiveAdSetBudget && !isNaN(effectiveAdSetBudget) && effectiveAdSetBudget > 0) {
        payload.daily_budget = Math.round(effectiveAdSetBudget * 100);
      } else if (lifetimeBudget) {
        payload.lifetime_budget = Math.round(Number(lifetimeBudget) * 100);
      }
    } else {
      console.log(`[Meta AdSet Budget Notice]: Campaign ${campaignId} has Campaign Budget Optimization (CBO) enabled. Skipping daily_budget on Ad Set.`);
    }

    if (bidAmount) {
      payload.bid_amount = Math.round(Number(bidAmount) * 100);
      payload.bid_strategy = bidStrategy || "LOWEST_COST_WITH_BID_CAP";
    } else if (bidStrategy) {
      payload.bid_strategy = bidStrategy;
    } else {
      payload.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
    }

    console.log("[Final Ad Set Payload]:", {
      url,
      payload: { ...payload, access_token: "[REDACTED]" },
    });

    // Requirement 6 & 7: Idempotent pre-check before sending creation request
    if (campaignId && name) {
      try {
        const preExisting = await this.findExistingAdSetInCampaign(
          campaignId,
          name,
          cleanId,
          null,
          accessToken,
          {
            requiredConfig: {
              campaignId,
              optimizationGoal: payload.optimization_goal,
              billingEvent: payload.billing_event,
              pixelId: requestedPixelId,
              appId: requestedAppId,
            },
          }
        );
        if (preExisting && preExisting.id) {
          console.log(`🟢 [Meta AdSet Idempotency]: Found existing matching Ad Set "${name}" (ID: ${preExisting.id}) under Campaign ${campaignId}. Reusing.`);
          return { id: preExisting.id, name: preExisting.name, isReused: true };
        }
      } catch (checkErr) {
        if (
          checkErr.message &&
          (checkErr.message.includes("Rate Limit") ||
            checkErr.message.includes("Permission Error") ||
            checkErr.message.includes("Ambiguity Error"))
        ) {
          throw checkErr;
        }
        console.warn("[Meta AdSet Pre-creation Check Notice]:", checkErr.message);
      }
    }

    return await this.withRateLimitRetry(async () => {
      try {
        const response = await axios.post(url, null, { params: payload });
        return response.data;
      } catch (error) {
        // Requirement 7: If POST timed out, verify if object was actually created on Meta before retrying
        const isTimeout =
          error.code === "ECONNABORTED" ||
          error.code === "ETIMEDOUT" ||
          error.message?.includes("timeout") ||
          error.response?.status === 504;
        if (isTimeout && campaignId && name) {
          console.warn(`[Meta AdSet Timeout Recovery]: POST request timed out for Ad Set "${name}". Verifying if Ad Set was created on Meta before retrying...`);
          try {
            const checkCreated = await this.findExistingAdSetInCampaign(
              campaignId,
              name,
              cleanId,
              null,
              accessToken,
              {
                requiredConfig: {
                  campaignId,
                  optimizationGoal: payload.optimization_goal,
                  billingEvent: payload.billing_event,
                  pixelId: requestedPixelId,
                  appId: requestedAppId,
                },
              }
            );
            if (checkCreated && checkCreated.id) {
              console.log(`🟢 [Meta AdSet Timeout Recovery SUCCESS]: Ad Set "${name}" was created on Meta (ID: ${checkCreated.id}). Reusing without duplicate creation.`);
              return { id: checkCreated.id, name: checkCreated.name, isReused: true };
            }
          } catch (recErr) {
            console.warn("[Meta AdSet Timeout Verification Notice]:", recErr.message);
          }
        }

        const metaErr = error.response?.data?.error;
        const errMsg = (metaErr?.message || metaErr?.error_user_msg || error.message || "").toLowerCase();

        // Auto-retry 1: If Meta requires a bid_amount (e.g. ad account defaults to bid cap strategy)
        if (metaErr && (errMsg.includes("bid amount required") || errMsg.includes("bid_amount"))) {
          try {
            const retryBidPayload = { ...payload };
            retryBidPayload.bid_amount = 100; // ₹1.00 / $1.00 default cap
            retryBidPayload.bid_strategy = "LOWEST_COST_WITH_BID_CAP";
            const retryRes = await axios.post(url, null, { params: retryBidPayload });
            return retryRes.data;
          } catch (bidRetryErr) {
            // continue to next error handler
          }
        }
        
        // Auto-retry 2: Without adset budget if campaign already has Campaign Budget Optimization (CBO) or subcode 1885621
        const isCboConflict = metaErr?.error_subcode === 1885621 || errMsg.includes("campaign budget") || errMsg.includes("ad set budget");
        if (metaErr && (payload.daily_budget || payload.lifetime_budget || isCboConflict)) {
          console.warn("[Meta AdSet CBO Fallback]: Ad Set budget rejected because Campaign has CBO. Retrying without Ad Set budget...");
          try {
            const retryPayload = { ...payload };
            delete retryPayload.daily_budget;
            delete retryPayload.lifetime_budget;
            delete retryPayload.bid_amount;
            delete retryPayload.bid_strategy;
            const retryRes = await axios.post(url, null, { params: retryPayload });
            return retryRes.data;
          } catch (retryErr) {
            const retryMetaErr = retryErr.response?.data?.error;
            if (retryMetaErr) {
              const detailMsg = retryMetaErr.error_user_msg || retryMetaErr.message || "Invalid parameter";
              const errToThrow = new Error(`Meta API AdSet Error [${retryMetaErr.code || "100"}]: ${detailMsg}`);
              errToThrow.response = retryErr.response;
              throw errToThrow;
            }
          }
        }

        console.error("[Meta API error]:", {
          status: error.response?.status,
          data: error.response?.data,
          error: error.response?.data?.error || error.message,
        });

        if (metaErr) {
          const detailMsg = metaErr.error_user_msg || metaErr.message || "Invalid parameter";
          const errToThrow = new Error(
            `Meta API AdSet Error [${metaErr.code || "unknown"}]: ${detailMsg}`
          );
          errToThrow.response = error.response;
          throw errToThrow;
        }
        throw error;
      }
    });
  }

  // 14. Update Ad Set on Meta Ads
  static async updateAdSet(adSetId, accessToken, { name, status, dailyBudget, targeting }) {
    const url = `${META_GRAPH_URL}/${adSetId}`;
    const params = { access_token: accessToken };

    if (name) params.name = name;
    if (status) params.status = status;
    if (dailyBudget) params.daily_budget = Math.round(Number(dailyBudget) * 100);
    if (targeting) {
      const normalizedCountries = normalizeCountryCodes(
        targeting.countries || targeting.locations || ["IN"]
      );
      const targetingObj = {
        geo_locations: {
          countries: normalizedCountries,
          ...(targeting.cities?.length > 0 ? { cities: targeting.cities.map((c) => ({ name: c })) } : {}),
        },
        age_min: Math.max(18, Math.min(65, Number(targeting.ageMin || targeting.age_min) || 18)),
        age_max: Math.min(65, Math.max(18, Number(targeting.ageMax || targeting.age_max) || 65)),
        ...(targeting.genders ? { genders: targeting.genders } : {}),
      };
      if (targeting.interests?.length > 0) {
        const validInterests = [];
        for (const item of targeting.interests) {
          if (typeof item === "object" && item.id) {
            validInterests.push({ id: String(item.id), name: item.name || String(item.id) });
          } else if (typeof item === "string" && item.trim()) {
            const matches = await this.searchInterests(item.trim(), accessToken);
            if (matches.length > 0 && matches[0].id) {
              validInterests.push({ id: String(matches[0].id), name: matches[0].name });
            }
          }
        }
        if (validInterests.length > 0) {
          targetingObj.flexible_spec = [{ interests: validInterests }];
        }
      }
      params.targeting = JSON.stringify(targetingObj);
    }

    try {
      const response = await axios.post(url, null, { params });
      return response.data;
    } catch (error) {
      const metaErr = error.response?.data?.error;
      if (metaErr) {
        throw new Error(`Meta API AdSet Update Error: ${metaErr.message || error.message}`);
      }
      throw error;
    }
  }

  // Normalize Call to Action Enum (BOOK_TRAVEL maps to "Book now" in Meta Ads Manager UI)
  static normalizeCallToAction(cta) {
    if (!cta) return "BOOK_TRAVEL";
    const cleaned = String(cta).trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (cleaned === "BOOK_NOW" || cleaned === "BOOK" || cleaned === "BOOKING" || cleaned === "BOOK_TRAVEL") {
      return "BOOK_TRAVEL";
    }
    if (cleaned === "SHOP_NOW" || cleaned === "SHOP" || cleaned === "BUY_NOW" || cleaned === "BUY") {
      return "SHOP_NOW";
    }
    if (cleaned === "LEARN_MORE" || cleaned === "LEARN") {
      return "LEARN_MORE";
    }
    const validCtas = [
      "BOOK_TRAVEL", "BOOK_NOW", "SHOP_NOW", "LEARN_MORE", "SIGN_UP", "CONTACT_US",
      "APPLY_NOW", "GET_OFFER", "ORDER_NOW", "DOWNLOAD", "WATCH_MORE",
      "SUBSCRIBE", "GET_QUOTE", "LISTEN_NOW", "SEND_WHATSAPP_MESSAGE",
      "SEND_MESSAGE", "INSTALL_APP", "USE_APP"
    ];
    return validCtas.includes(cleaned) ? cleaned : "BOOK_TRAVEL";
  }

  // Helper: Sanitize & Validate Destination Link URL for Meta Ads (Prevents Meta Subcode 2490193 / 2061006)
  static sanitizeLinkUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return "https://facebook.com";
    let clean = rawUrl.trim();
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = `https://${clean}`;
    }
    try {
      const parsed = new URL(clean);
      const host = parsed.hostname.toLowerCase();
      // Detect invalid placeholders like YOUR_PAGE_ID, example.com, etc.
      if (
        !host.includes(".") ||
        host.includes("your_page") ||
        host.includes("yourpage") ||
        host.includes("example") ||
        host.includes("yourwebsite") ||
        host.includes("placeholder") ||
        host.includes("mock") ||
        host.includes("test.com")
      ) {
        return "https://facebook.com";
      }
      return clean;
    } catch (e) {
      return "https://facebook.com";
    }
  }

  // Helper: Safely truncate any string to max UTF-8 bytes without splitting multi-byte characters or emojis
  static truncateToMaxBytes(str, maxBytes = 250) {
    if (!str) return str;
    const s = String(str).trim();
    if (Buffer.byteLength(s, "utf8") <= maxBytes) {
      return s;
    }
    const codePoints = Array.from(s);
    let result = "";
    for (const cp of codePoints) {
      if (Buffer.byteLength(result + cp, "utf8") > maxBytes) {
        break;
      }
      result += cp;
    }
    const trimmed = result.trim();
    const lastSpace = trimmed.lastIndexOf(" ");
    // Snap to natural word/whitespace boundary if within the last 40 bytes to avoid chopped words
    if (lastSpace > 0 && (Buffer.byteLength(trimmed, "utf8") - Buffer.byteLength(trimmed.slice(0, lastSpace), "utf8") < 40)) {
      return trimmed.slice(0, lastSpace).trim();
    }
    return trimmed;
  }

  // Helper: Format & truncate Creative Name ensuring it never exceeds Meta's 255-byte limit
  static formatCreativeName(strName, suffix = "Creative") {
    const s = String(strName || "").trim();
    const sfx = suffix ? ` ${suffix.trim()}` : "";
    const maxBytes = 250; // Meta hard limit is 255 bytes; 250 leaves safe margin

    if (Buffer.byteLength(`${s}${sfx}`, "utf8") <= maxBytes) {
      return `${s}${sfx}`;
    }

    const odMatch = s.match(/(OD-\d+-\d+)/i);
    const odSuffix = odMatch ? `_${odMatch[1]}` : "";
    const tail = `${odSuffix}${sfx}`;
    const tailBytes = Buffer.byteLength(tail, "utf8");
    const allowedBaseBytes = Math.max(0, maxBytes - tailBytes);

    const codePoints = Array.from(s);
    let truncatedBase = "";
    for (const cp of codePoints) {
      if (Buffer.byteLength(truncatedBase + cp, "utf8") > allowedBaseBytes) {
        break;
      }
      truncatedBase += cp;
    }

    return `${truncatedBase.trim()}${tail}`;
  }

  // Helper: Format & truncate Ad Name ensuring it never exceeds Meta's 255-byte limit
  static formatAdName(strName, maxBytes = 250) {
    const s = String(strName || "").trim();
    if (Buffer.byteLength(s, "utf8") <= maxBytes) {
      return s;
    }

    const odMatch = s.match(/(OD-\d+-\d+)/i);
    const odSuffix = odMatch ? `_${odMatch[1]}` : "";
    const tailBytes = Buffer.byteLength(odSuffix, "utf8");
    const allowedBaseBytes = Math.max(0, maxBytes - tailBytes);

    const codePoints = Array.from(s);
    let truncatedBase = "";
    for (const cp of codePoints) {
      if (Buffer.byteLength(truncatedBase + cp, "utf8") > allowedBaseBytes) {
        break;
      }
      truncatedBase += cp;
    }

    return `${truncatedBase.trim()}${odSuffix}`;
  }

  // 15. Create Ad Creative & Ad on Meta Ads
  static async createAd(
    accountId,
    accessToken,
    params = {}
  ) {
    const {
      adSetId,
      name,
      headline,
      primaryText,
      description,
      linkUrl,
      displayLink,
      callToAction = "BOOK_NOW",
      imageUrl,
      videoId,
      videoFilePath,
      videoUrl,
      driveUrl,
      pageId,
      status = "PAUSED",
      text_optimization,
      optimizeTextPerPerson = true,
      optimizedAdCreative = true,
      pixelId,
      appId,
      applicationId,
      customEventType,
      instagramActorId,
      instagram_actor_id,
      instagram_account_id,
      ig_id,
      instagramId,
      trackingType,
      tracking_type,
      urlTags,
    } = params;

    // Auto-delegate to createVideoAd ONLY if video parameters or a video asset file is explicitly provided
    let isVideoParam = Boolean(videoId || videoFilePath || videoUrl);
    const candidateMedia = driveUrl || params.video || params.creativeUrl || params.mediaUrl || params.fileUrl;
    if (!isVideoParam && candidateMedia && typeof candidateMedia === "string") {
      if (fs.existsSync(candidateMedia)) {
        const { default: driveService } = await import("../../google/driveService.js");
        const magic = driveService.inspectFileMagicBytes(candidateMedia);
        if (magic.isVideo) isVideoParam = true;
      } else if (/\.(mp4|mov|avi|webm|m4v|mkv)($|\?)/i.test(candidateMedia)) {
        isVideoParam = true;
      }
    }

    if (isVideoParam && !imageUrl) {
      console.log("[Meta Ad Creation] Video asset detected in createAd, delegating to createVideoAd...");
      return await this.createVideoAd(accountId, accessToken, {
        ...params,
        videoUrl: videoUrl || candidateMedia,
      });
    }

    const cleanId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const pageResolution = await MetaAssetResolver.verifyAndResolvePageAsset({
      accountId: cleanId,
      accessToken,
      requestedPageId: pageId,
    });

    if (!pageResolution.valid || !pageResolution.pageId) {
      const pageErr = new Error(
        pageResolution.error ||
          "A Facebook Page with Ads permission is required to create an Ad Creative on Meta Ads. Please connect an authorized Page in Meta Business Manager."
      );
      pageErr.status = pageResolution.status || "PAGE_PERMISSION_MISSING";
      pageErr.step = "PAGE_VALIDATION";
      throw pageErr;
    }
    const effectivePageId = pageResolution.pageId;

    const requestedIgId = instagramActorId || instagram_actor_id || instagram_account_id || ig_id || instagramId;
    const effectiveInstagramUserId = await this.resolveInstagramUserId(cleanId, accessToken, effectivePageId, requestedIgId);

    const effectiveCta = this.normalizeCallToAction(callToAction);
    const cleanLinkUrl = this.sanitizeLinkUrl(linkUrl);

    let cleanDisplayLink = null;
    if (displayLink && typeof displayLink === "string" && displayLink.trim()) {
      cleanDisplayLink = displayLink.trim().replace(/^https?:\/\//i, "");
    }

    // Resolve Image Hash or Upload local image / Google Drive image asset to Meta /adimages
    let effectiveImageHash = params.imageHash || params.hash || null;
    let effectiveImageUrl = imageUrl || null;

    const targetImg = imageUrl || driveUrl || params.image || params.creativeUrl;
    if (!effectiveImageHash && targetImg) {
      let localPath = null;
      if (typeof targetImg === "string" && fs.existsSync(targetImg)) {
        localPath = targetImg;
      } else if (typeof targetImg === "string" && (targetImg.includes("drive.google.com") || targetImg.includes("docs.google.com") || /^[a-zA-Z0-9_-]{25,60}$/.test(targetImg.trim()))) {
        try {
          const { default: driveService } = await import("../../google/driveService.js");
          const dl = await driveService.downloadFile(targetImg);
          if (dl?.filePath && fs.existsSync(dl.filePath) && dl.isImage) {
            localPath = dl.filePath;
          }
        } catch (dlErr) {
          console.warn("[Meta Image Ad Download Warning]:", dlErr.message);
        }
      }

      if (localPath && fs.existsSync(localPath)) {
        try {
          console.log(`[Meta Image Ad] Uploading local image asset "${localPath}" to Meta /adimages...`);
          const imgUpRes = await this.uploadAdImage(cleanId, accessToken, { filePath: localPath });
          if (imgUpRes?.hash) {
            effectiveImageHash = imgUpRes.hash;
            if (imgUpRes.url) effectiveImageUrl = imgUpRes.url;
            console.log(`[Meta Image Ad Upload Success]: Image Hash = ${effectiveImageHash}`);
          }
        } catch (upErr) {
          console.error("[Meta Image Ad Upload Failure]:", upErr.message);
          throw new Error(`Meta Media Upload Failed for image asset "${path.basename(localPath)}": ${upErr.message}`);
        }
      }
    }

    const sanitizeFieldValue = (val) => {
      if (val === undefined || val === null) return null;
      const s = String(val).trim();
      if (!s) return null;
      const lower = s.toLowerCase();
      if (lower === "null" || lower === "undefined" || lower === "n/a" || lower === "#n/a" || lower === "#value!" || lower === "none") {
        return null;
      }
      return s;
    };

    const cleanHeadline = sanitizeFieldValue(headline);
    const cleanPrimaryText = sanitizeFieldValue(primaryText);
    const cleanDescription = sanitizeFieldValue(description);

    // Step 1: Create Ad Creative
    const creativeUrl = `${META_GRAPH_URL}/${cleanId}/adcreatives`;
    const linkData = {
      link: cleanLinkUrl,
      call_to_action: {
        type: effectiveCta,
        value: {
          link: cleanLinkUrl,
          ...(cleanDisplayLink ? { link_caption: cleanDisplayLink } : {}),
        },
      },
    };

    if (cleanPrimaryText) linkData.message = cleanPrimaryText;
    if (cleanHeadline) {
      const origBytes = Buffer.byteLength(cleanHeadline, "utf8");
      linkData.name = this.truncateToMaxBytes(cleanHeadline, 250);
      if (origBytes > 250) {
        console.log(`[Meta Image Creative Headline Enforced]: Truncated headline from ${origBytes} bytes to ${Buffer.byteLength(linkData.name, "utf8")} bytes to comply with Meta 255-byte limit.`);
      }
    }
    if (cleanDescription) linkData.description = cleanDescription;
    if (effectiveImageHash) {
      linkData.image_hash = effectiveImageHash;
    } else if (effectiveImageUrl) {
      linkData.picture = effectiveImageUrl;
    }
    if (cleanDisplayLink) linkData.caption = this.truncateToMaxBytes(cleanDisplayLink, 250);

    const objectStorySpec = {
      page_id: effectivePageId,
      ...(effectiveInstagramUserId ? { instagram_user_id: effectiveInstagramUserId } : {}),
      link_data: linkData,
    };

    const cleanUrlTags = urlTags ? String(urlTags).trim().replace(/^\?/, "") : null;

    const creativeParams = {
      name: this.formatCreativeName(name, "Creative"),
      object_story_spec: JSON.stringify(objectStorySpec),
      access_token: accessToken,
    };
    if (cleanUrlTags) creativeParams.url_tags = cleanUrlTags;

    const parseBoolean = (val) => {
      if (val === true || val === 1 || val === "1") return true;
      if (val === false || val === 0 || val === "0") return false;
      if (typeof val === "string") {
        const s = val.trim().toLowerCase();
        if (s === "yes" || s === "true" || s === "enabled" || s === "enable" || s === "on") return true;
        if (s === "no" || s === "false" || s === "disabled" || s === "disable" || s === "off") return false;
      }
      return val !== false;
    };

    const effectiveTextOpt = text_optimization !== undefined ? text_optimization : (optimizeTextPerPerson !== undefined ? optimizeTextPerPerson : true);
    const isOptEnabled = parseBoolean(effectiveTextOpt);
    const statusVal = isOptEnabled ? "OPT_IN" : "OPT_OUT";

    const fullCreativeFeaturesSpec = {
      text_optimizations: { enroll_status: statusVal },
      inline_comment: { enroll_status: statusVal },
      video_auto_crop: { enroll_status: statusVal },
      video_uncrop: { enroll_status: statusVal },
      enhance_cta: { enroll_status: statusVal },
      image_touchups: { enroll_status: statusVal },
    };

    creativeParams.degrees_of_freedom_spec = JSON.stringify({
      degrees_of_freedom_type: "USER_ENROLLED",
      creative_features_spec: fullCreativeFeaturesSpec,
    });

    console.log("[Meta Image Creative Page ID Audit]:", {
      pageIdReceivedFromSheet: pageId || "None",
      pageIdPassedToCreativeFunction: pageId || "None",
      finalObjectStorySpecPageId: objectStorySpec.page_id,
    });

    console.log("[Final Creative Payload]:", {
      creativeUrl,
      creativeParams: { ...creativeParams, access_token: "[REDACTED]" },
    });

    let creativeId = null;
    try {
      const creativeRes = await axios.post(creativeUrl, null, { params: creativeParams });
      console.log("[Meta Image Creative API Success Response]:", creativeRes.data);
      creativeId = creativeRes.data?.id;
    } catch (err) {
      console.error("[Meta API error]:", {
        status: err.response?.status,
        data: err.response?.data,
        error: err.response?.data?.error || err.message,
      });
      console.warn("[Meta Image Creative Attempt 1 Warning]:", err.response?.data?.error || err.message);

      const firstErr = err.response?.data?.error;
      const isPermissionErr = firstErr?.code === 10 || firstErr?.error_subcode === 3858749 || (firstErr?.message || "").toLowerCase().includes("permission");

      if (isPermissionErr) {
        throw new Error(
          `Page Permission Error [Meta Error 10 / Subcode 3858749]: Facebook Page ID "${objectStorySpec.page_id}" lacks required Ads permission. ${firstErr?.error_user_msg || firstErr?.message || "Please grant Advertiser or Admin access for this Page."}`
        );
      }

      if (objectStorySpec.instagram_actor_id || objectStorySpec.instagram_user_id) {
        console.warn(`[Meta Creative Retry]: Removing unverified Instagram ID and retrying under requested Page ID "${objectStorySpec.page_id}"...`);
        delete objectStorySpec.instagram_actor_id;
        delete objectStorySpec.instagram_user_id;
        creativeParams.object_story_spec = JSON.stringify(objectStorySpec);
      }
      // Attempt 2: Retry with exact 5 requested core spec keys
      try {
        creativeParams.degrees_of_freedom_spec = JSON.stringify({
          degrees_of_freedom_type: "USER_ENROLLED",
          creative_features_spec: {
            text_optimizations: { enroll_status: statusVal },
            inline_comment: { enroll_status: statusVal },
            video_auto_crop: { enroll_status: statusVal },
            video_uncrop: { enroll_status: statusVal },
            enhance_cta: { enroll_status: statusVal },
          },
        });
        console.log("[Final Creative Payload (Retry 2)]:", {
          creativeUrl,
          creativeParams: { ...creativeParams, access_token: "[REDACTED]" },
        });
        const retryRes2 = await axios.post(creativeUrl, null, { params: creativeParams });
        console.log("[Meta Image Creative Attempt 2 Success Response]:", retryRes2.data);
        creativeId = retryRes2.data?.id;
      } catch (retryErr2) {
        console.warn("[Meta Image Creative Attempt 2 Warning]:", retryErr2.response?.data?.error || retryErr2.message);
        const err2 = retryErr2.response?.data?.error;
        if (err2?.code === 10 || err2?.error_subcode === 3858749 || (err2?.message || "").toLowerCase().includes("permission")) {
          delete objectStorySpec.instagram_actor_id;
          delete objectStorySpec.instagram_user_id;
          creativeParams.object_story_spec = JSON.stringify(objectStorySpec);
        }
        // Attempt 3: Single text_optimizations spec fallback with USER_ENROLLED
        try {
          creativeParams.degrees_of_freedom_spec = JSON.stringify({
            degrees_of_freedom_type: "USER_ENROLLED",
            creative_features_spec: {
              text_optimizations: { enroll_status: statusVal },
            },
          });
          const retryRes3 = await axios.post(creativeUrl, null, { params: creativeParams });
          console.log("[Meta Image Creative Attempt 3 Success Response]:", retryRes3.data);
          creativeId = retryRes3.data?.id;
        } catch (retryErr3) {
          console.warn("[Meta Image Creative Attempt 3 Warning]:", retryErr3.response?.data?.error || retryErr3.message);
          const metaErr = retryErr3.response?.data?.error || retryErr2.response?.data?.error || err.response?.data?.error;
          const msg = metaErr ? `[${metaErr.code}]: ${metaErr.message || metaErr.error_user_msg}` : retryErr3.message;
          throw new Error(`Meta Ad Creative Creation Failed: ${msg}`);
        }
      }
    }

    if (!creativeId) {
      throw new Error("Failed to obtain a valid Creative ID from Meta Graph API.");
    }

    // Immediate Meta GET verification to confirm degrees_of_freedom_spec stored by Meta
    let verifiedTextOptStatus = null;
    try {
      const getCreativeRes = await axios.get(`${META_GRAPH_URL}/${creativeId}`, {
        params: {
          fields: "id,name,degrees_of_freedom_spec",
          access_token: accessToken,
        },
      });
      console.log(`[Meta GET Creative Verification Response]:`, getCreativeRes.data);
      const dofRes = getCreativeRes.data?.degrees_of_freedom_spec;
      verifiedTextOptStatus = dofRes?.creative_features_spec?.text_optimizations?.enroll_status || null;
      console.log(`[Meta Verification Result]: text_optimizations enroll_status = "${verifiedTextOptStatus}"`);
    } catch (getCreativeErr) {
      console.warn(`[Meta GET Creative Verification Warning]:`, getCreativeErr.response?.data?.error || getCreativeErr.message);
    }

    // Step 2: Resolve Pixel / App Tracking Specs dynamically
    const mode = (trackingType || tracking_type || "").toUpperCase();
    let effectivePixelId = pixelId || null;
    if (!effectivePixelId) {
      try {
        const pixRes = await this.verifyAndResolvePixelAsset({
          accountId: cleanId,
          accessToken,
          requestedPixelId: null,
          objective: params.campaignObjective || params.objective,
        });
        if (pixRes.valid && pixRes.pixelId) {
          effectivePixelId = pixRes.pixelId;
        }
      } catch (pixErr) {
        console.warn("[Meta Tracking] Dynamic Pixel verification warning:", pixErr.message);
      }
    }

    let effectiveAppId = appId || applicationId || null;
    if (!effectiveAppId && mode === "APP") {
      try {
        const appRes = await this.verifyAndResolveAppAsset({
          accountId: cleanId,
          accessToken,
          requestedAppId: null,
          objective: params.campaignObjective || params.objective,
        });
        if (appRes.valid && appRes.appId) {
          effectiveAppId = appRes.appId;
        }
      } catch (appErr) {}
    }

    const campaignObjective = String(params.campaignObjective || params.objective || "").toUpperCase();
    const isTrafficObjective = campaignObjective.includes("TRAFFIC") || campaignObjective.includes("CLICK") || campaignObjective.includes("ENGAGEMENT") || campaignObjective.includes("AWARENESS");
    const targetActionType = isTrafficObjective ? ["link_click"] : ["offsite_conversion"];

    const trackingSpecs = [];
    if (effectivePixelId) {
      trackingSpecs.push({
        "action.type": targetActionType,
        fb_pixel: [String(effectivePixelId)],
      });
    } else if (effectiveAppId) {
      trackingSpecs.push({
        "action.type": [typeof customEventType !== "undefined" && customEventType ? "app_custom_event" : "mobile_app_install"],
        application: [String(effectiveAppId)],
      });
    }

    // Step 3: Create Ad
    const formatAdName = (strName) => MetaApiService.formatAdName(strName, 250);

    const adUrl = `${META_GRAPH_URL}/${cleanId}/ads`;
    const payload = {
      name: formatAdName(name),
      adset_id: adSetId,
      status: status || "PAUSED",
      access_token: accessToken,
      creative: JSON.stringify({ creative_id: creativeId }),
    };

    if (urlTags) {
      payload.url_tags = String(urlTags).trim().replace(/^\?/, "");
    }

    if (trackingSpecs.length > 0) {
      payload.tracking_specs = JSON.stringify(trackingSpecs);
    }
    if (effectivePixelId) {
      payload.pixel_id = String(effectivePixelId);
    }

    return await this.withRateLimitRetry(async () => {
      try {
        const response = await axios.post(adUrl, null, { params: payload });
        return { ...response.data, creativeId, pageId: effectivePageId, pixelId: effectivePixelId, urlTags: cleanUrlTags };
      } catch (error) {
        const initialMetaErr = error.response?.data?.error;
        const errMsg = (initialMetaErr?.message || initialMetaErr?.error_user_msg || error.message || "").toLowerCase();
        const isTrackingSpecErr = initialMetaErr?.error_subcode === 1634034 || errMsg.includes("action type") || errMsg.includes("tracking") || errMsg.includes("action spec");

        if (payload.tracking_specs) {
          try {
            console.warn("[Meta Ad Tracking Specs Notice]: Action spec invalid for campaign objective. Retrying ad creation without optional tracking_specs...");
            const retryPayload = { ...payload };
            delete retryPayload.tracking_specs;
            const retryRes = await axios.post(adUrl, null, { params: retryPayload });
            return { ...retryRes.data, creativeId, pageId: effectivePageId };
          } catch (retryErr) {
            console.error("[DEBUG Meta Ad Retry Error Details]:", retryErr.response?.data);
          }
        }

        if (!isTrackingSpecErr) {
          console.error("[DEBUG Meta Ad Creation Error Details]:", {
            status: error.response?.status,
            data: error.response?.data,
            errorObj: initialMetaErr,
            payload,
          });
        }

        if (initialMetaErr) {
          const errToThrow = new Error(
            `Meta API Ad Creation Error [${initialMetaErr.code || "unknown"}]: ${initialMetaErr.message || initialMetaErr.error_user_msg || error.message}`
          );
          errToThrow.response = error.response;
          throw errToThrow;
        }
        throw error;
      }
    });
  }

  // 16. Performance Insights (Spend, Clicks, ROAS) fetch karna
  static async getInsights(accountId, accessToken, { datePreset = "last_30d" } = {}) {
    const cleanId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const url = `${META_GRAPH_URL}/${cleanId}/insights`;
    const response = await axios.get(url, {
      params: {
        access_token: accessToken,
        level: "campaign",
        time_increment: 1,
        date_preset: datePreset,
        fields:
          "campaign_id,campaign_name,date_start,spend,impressions,clicks,reach,frequency,cpc,cpm,ctr,actions,action_values",
        limit: 500,
      },
    });
    return response.data.data || [];
  }

  // Helper: Chunked Resumable Video Upload for Meta Graph API (Bypasses HTTP 413 Payload Too Large limits)
  static async uploadVideoChunked(accountId, accessToken, filePath, { title, description } = {}) {
    const cleanId = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;
    const url = `${META_GRAPH_VIDEO_URL}/${cleanId}/advideos`;

    // Ensure title is strictly under Meta's 255 character limit (sliced to 200 max)
    const cleanTitle = title && typeof title === "string" ? title.trim().slice(0, 200) : "Campaign Video Creative";
    const cleanDesc = description && typeof description === "string" ? description.trim().slice(0, 500) : "";

    const stats = await fs.promises.stat(filePath);
    const fileSize = stats.size;

    if (filePath && fs.existsSync(filePath)) {
      const { default: driveService } = await import("../../google/driveService.js");
      const magic = driveService.inspectFileMagicBytes(filePath);
      if (magic.isImage) {
        throw new Error(
          `Media Type Mismatch Error: Target file "${filePath}" is an Image asset (${magic.format?.toUpperCase()}), and cannot be uploaded to Meta /advideos endpoint.`
        );
      }
    }

    if (accessToken && accessToken.startsWith("EAAB_simulated")) {
      const simVidId = `sim_vid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      return { id: simVidId, video_id: simVidId, success: true };
    }
    let startRes;
    try {
      startRes = await axios.post(url, null, {
        params: {
          upload_phase: "start",
          file_size: fileSize,
          access_token: accessToken,
        },
      });
    } catch (err) {
      const metaErr = err.response?.data?.error;
      throw new Error(`Meta Resumable Video Start Error: ${metaErr?.message || err.message}`);
    }

    const videoId = startRes.data?.video_id || startRes.data?.id;
    const sessionId = startRes.data?.upload_session_id;

    if (!sessionId) {
      // If start response returned a direct video id without session, return it
      if (videoId) return { id: videoId, ...startRes.data };
      throw new Error("Meta Resumable Video Start did not return an upload_session_id");
    }

    const CHUNK_SIZE = 24 * 1024 * 1024; // 24MB chunks for fast parallel uploads
    let startOffset = parseInt(startRes.data.start_offset || "0", 10);
    let endOffset = parseInt(startRes.data.end_offset || String(Math.min(fileSize, startOffset + CHUNK_SIZE)), 10);

    const fileHandle = await fs.promises.open(filePath, "r");

    try {
      // Phase 2: Transfer Chunks
      while (startOffset < fileSize) {
        const chunkSize = Math.min(endOffset - startOffset, fileSize - startOffset);
        if (chunkSize <= 0) break;

        const chunkBuffer = Buffer.alloc(chunkSize);
        await fileHandle.read(chunkBuffer, 0, chunkSize, startOffset);

        const formData = new FormData();
        formData.append("upload_phase", "transfer");
        formData.append("upload_session_id", sessionId);
        formData.append("start_offset", String(startOffset));
        formData.append("video_file_chunk", new File([chunkBuffer], path.basename(filePath), { type: "video/mp4" }));
        formData.append("access_token", accessToken);

        const transferRes = await axios.post(url, formData, {
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 300000,
        });

        startOffset = parseInt(transferRes.data.start_offset ?? (startOffset + chunkSize), 10);
        endOffset = parseInt(transferRes.data.end_offset ?? Math.min(fileSize, startOffset + CHUNK_SIZE), 10);
      }
    } finally {
      await fileHandle.close();
    }

    // Phase 3: Finish Phase
    try {
      const finishRes = await axios.post(url, null, {
        params: {
          upload_phase: "finish",
          upload_session_id: sessionId,
          title: cleanTitle,
          description: cleanDesc,
          access_token: accessToken,
        },
      });
      return { id: videoId, success: finishRes.data?.success ?? true, ...finishRes.data };
    } catch (err) {
      const metaErr = err.response?.data?.error;
      throw new Error(`Meta Resumable Video Finish Error: ${metaErr?.message || err.message}`);
    }
  }

  static videoUploadCache = new Map();
  static imageUploadCache = new Map();

  // 17. Upload Video to Meta Ad Account (/act_<id>/advideos)
  static async uploadVideo(accountId, accessToken, { filePath, fileUrl, title, description, userId = null } = {}) {
    accessToken = await this.resolveOAuthToken(accountId, userId, accessToken);
    const cleanId = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;
    const url = `${META_GRAPH_VIDEO_URL}/${cleanId}/advideos`;

    const cleanTitle = title && typeof title === "string" ? title.trim().slice(0, 200) : "Campaign Video Creative";
    const cleanDesc = description && typeof description === "string" ? description.trim().slice(0, 500) : "";

    const userScope = userId || "default";
    const cacheKey = `${userScope}___${cleanId}___${filePath || fileUrl}`;
    if (this.videoUploadCache.has(cacheKey)) {
      const cached = this.videoUploadCache.get(cacheKey);
      console.log(`⚡ [Meta Video Upload Cache Hit]: Reusing uploaded video ID ${cached.id} for "${filePath || fileUrl}"`);
      return { id: cached.id, video_id: cached.id, ...cached };
    }

    // Intercept Google Drive URLs or Smart Chip filenames: Download binary video file via Google Drive OAuth before uploading to Meta
    if (fileUrl && (!filePath || !fs.existsSync(filePath))) {
      try {
        const { default: driveService } = await import("../../google/driveService.js");
        const dlInfo = await driveService.downloadCreative(fileUrl);
        if (dlInfo?.filePath && fs.existsSync(dlInfo.filePath)) {
          filePath = dlInfo.filePath;
        }
      } catch (dlErr) {
        console.warn("[Meta Video Upload] Auto-downloading Google Drive / Smart Chip video warning:", dlErr.message);
      }
    }

    if (filePath && fs.existsSync(filePath)) {
      const { default: driveService } = await import("../../google/driveService.js");
      const magic = driveService.inspectFileMagicBytes(filePath);
      if (magic.isImage) {
        throw new Error(
          `Media Type Mismatch Error: Target file "${filePath}" is an Image asset (${magic.format?.toUpperCase()}), and cannot be uploaded to Meta /advideos endpoint.`
        );
      }
    }

    if (accessToken && accessToken.startsWith("EAAB_simulated")) {
      const simVidId = `sim_vid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      return { id: simVidId, video_id: simVidId, success: true };
    }

    if (fileUrl && !filePath) {
      if (!fileUrl.startsWith("http://") && !fileUrl.startsWith("https://")) {
        throw new Error(`Unable to resolve Google Drive video asset for Smart Chip filename "${fileUrl}". Please ensure your Google Drive account is connected or provide a valid Google Drive share link.`);
      }
      try {
        const response = await axios.post(url, null, {
          params: {
            file_url: fileUrl,
            title: cleanTitle,
            description: cleanDesc,
            access_token: accessToken,
          },
        });
        return response.data;
      } catch (err) {
        console.warn("[Meta Video Upload] Meta file_url upload failed, attempting local stream download fallback:", err.message);
        try {
          const scratchDir = process.env.SCRATCH_DIR || "./scratch";
          if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
          const localTmpPath = path.join(scratchDir, `video_${Date.now()}.mp4`);
          const writer = fs.createWriteStream(localTmpPath);
          const dlRes = await axios.get(fileUrl, {
            responseType: "stream",
            timeout: 120000,
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          });
          dlRes.data.pipe(writer);
          await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
          });
          if (fs.existsSync(localTmpPath) && fs.statSync(localTmpPath).size > 0) {
            filePath = localTmpPath;
          }
        } catch (dlWebErr) {
          const metaErr = err.response?.data?.error;
          throw new Error(`Meta Video Upload Error: ${metaErr?.message || err.message}`);
        }
      }
    }

    if (filePath && fs.existsSync(filePath)) {
      const stats = await fs.promises.stat(filePath);
      // For video files larger than 15MB, use chunked resumable upload to avoid HTTP 413 Payload Too Large
      if (stats.size >= 15 * 1024 * 1024) {
        return await this.uploadVideoChunked(cleanId, accessToken, filePath, { title: cleanTitle, description: cleanDesc });
      }

      try {
        const fileBuffer = await fs.promises.readFile(filePath);
        const formData = new FormData();
        formData.append("source", new File([fileBuffer], path.basename(filePath), { type: "video/mp4" }));
        if (cleanTitle) formData.append("title", cleanTitle);
        if (cleanDesc) formData.append("description", cleanDesc);
        formData.append("access_token", accessToken);

        const response = await axios.post(url, formData, {
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 300000,
        });
        const vidId = response.data?.id || response.data?.video_id;
        if (vidId) this.videoUploadCache.set(cacheKey, { id: vidId, video_id: vidId });
        return response.data;
      } catch (err) {
        // If single upload hits 413 or payload limits, fallback seamlessly to chunked upload
        if (err.response?.status === 413 || err.message?.includes("413")) {
          console.warn("[Meta Video Upload] Direct upload returned 413 Payload Too Large. Retrying with chunked resumable upload...");
          const chunkRes = await this.uploadVideoChunked(cleanId, accessToken, filePath, { title: cleanTitle, description: cleanDesc });
          const vidId = chunkRes?.id || chunkRes?.video_id;
          if (vidId) this.videoUploadCache.set(cacheKey, { id: vidId, video_id: vidId });
          return chunkRes;
        }
        const metaErr = err.response?.data?.error;
        throw new Error(`Meta Video File Upload Error: ${metaErr?.message || err.message}`);
      }
    }

    throw new Error("filePath or fileUrl is required to upload a video to Meta Ads");
  }

  // Helper: Poll Meta Graph API until uploaded video is processed and ready
  static async waitForVideoReady(videoId, accessToken, maxWaitSeconds = 15) {
    if (!videoId || !accessToken) return true;
    const startTime = Date.now();
    const pollIntervalMs = 600;

    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
      try {
        const res = await axios.get(`${META_GRAPH_URL}/${videoId}`, {
          params: {
            fields: "status",
            access_token: accessToken,
          },
          timeout: 5000,
        });

        const status = res.data?.status;
        const videoStatus = (status?.video_status || status || "").toString().toLowerCase();

        if (videoStatus === "ready" || videoStatus === "ready_to_use" || videoStatus === "published") {
          return true;
        }
        if (videoStatus === "error") {
          console.warn(`[Meta Video Status] Video ${videoId} processing error on Meta:`, status?.errors);
          return false;
        }
      } catch (err) {
        // Transient check error
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    return true;
  }

  // Helper: Upload Ad Image to Meta Ad Account (/act_<id>/adimages) -> returns { hash, url }
  static async uploadAdImage(accountId, accessToken, { filePath, fileUrl, imageBuffer, userId = null } = {}) {
    accessToken = await this.resolveOAuthToken(accountId, userId, accessToken);
    const cleanId = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;
    const url = `${META_GRAPH_URL}/${cleanId}/adimages`;

    const userScope = userId || "default";
    const cacheKey = `${userScope}___${cleanId}___${filePath || fileUrl || (imageBuffer ? imageBuffer.length : "")}`;
    if (this.imageUploadCache.has(cacheKey)) {
      const cached = this.imageUploadCache.get(cacheKey);
      console.log(`⚡ [Meta Image Upload Cache Hit]: Reusing image hash ${cached.hash}`);
      return cached;
    }

    let buffer = imageBuffer;
    let fileName = "thumbnail.png";

    if (!buffer && filePath && fs.existsSync(filePath)) {
      const { default: driveService } = await import("../../google/driveService.js");
      const magic = driveService.inspectFileMagicBytes(filePath);
      if (magic.isVideo) {
        throw new Error(
          `Media Type Mismatch Error: Target file "${filePath}" is a Video asset (${magic.format?.toUpperCase()}), and cannot be uploaded to Meta /adimages endpoint.`
        );
      }
      buffer = await fs.promises.readFile(filePath);
      fileName = path.basename(filePath);
    }

    if (!buffer && fileUrl && (fileUrl.startsWith("http://") || fileUrl.startsWith("https://"))) {
      try {
        const dlRes = await axios.get(fileUrl, { responseType: "arraybuffer", timeout: 30000 });
        buffer = Buffer.from(dlRes.data);
      } catch (dlErr) {
        console.warn("[Meta Image Upload] Downloading image from URL warning:", dlErr.message);
      }
    }

    if (!buffer) {
      throw new Error("filePath, fileUrl, or imageBuffer is required to upload an ad image to Meta.");
    }

    if (accessToken && accessToken.startsWith("EAAB_simulated")) {
      const simHash = `sim_hash_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const simRes = { hash: simHash, url: `https://simulated.meta.com/images/${simHash}.png` };
      this.imageUploadCache.set(cacheKey, simRes);
      return simRes;
    }

    try {
      const FormDataPkg = (await import("form-data")).default;
      const form = new FormDataPkg();

      if (filePath && fs.existsSync(filePath)) {
        form.append("filename", fs.createReadStream(filePath));
      } else if (buffer) {
        form.append("filename", buffer, { filename: fileName || "image.png" });
      }
      form.append("access_token", accessToken);

      const response = await axios.post(url, form, {
        headers: form.getHeaders(),
        timeout: 60000,
      });

      const imagesObj = response.data?.images;
      if (imagesObj && typeof imagesObj === "object") {
        const firstKey = Object.keys(imagesObj)[0];
        const imgData = imagesObj[firstKey];
        if (imgData?.hash) {
          const res = { hash: imgData.hash, url: imgData.url };
          this.imageUploadCache.set(cacheKey, res);
          return res;
        }
      }
      throw new Error("Meta image upload response did not return an image hash.");
    } catch (err) {
      console.error("[DEBUG Meta uploadAdImage Error]:", err.response?.data);
      const metaErr = err.response?.data?.error;
      throw new Error(`Meta Image Upload Error: ${metaErr?.message || err.message}`);
    }
  }

  // Helper: Extract a video thumbnail image frame locally
  static async extractVideoThumbnail(videoFilePath) {
    if (!videoFilePath || !fs.existsSync(videoFilePath)) return null;
    const scratchDir = process.env.SCRATCH_DIR || "./scratch";
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    const baseName = path.basename(videoFilePath);
    const expectedThumbPath = path.join(scratchDir, `${baseName}.png`);
    if (fs.existsSync(expectedThumbPath) && fs.statSync(expectedThumbPath).size > 0) {
      return expectedThumbPath;
    }

    try {
      const { execSync } = await import("child_process");
      execSync(`qlmanage -t -s 1200 -o "${scratchDir}" "${videoFilePath}"`, { stdio: "pipe", timeout: 8000 });
      if (fs.existsSync(expectedThumbPath) && fs.statSync(expectedThumbPath).size > 0) {
        return expectedThumbPath;
      }
      const files = fs.readdirSync(scratchDir);
      const match = files.find((f) => f.startsWith(baseName) && f.endsWith(".png"));
      if (match) {
        return path.join(scratchDir, match);
      }
    } catch (err) {
      console.warn("[Meta Video Thumbnail Extraction Warning]:", err.message);
    }
    return null;
  }

  // 18. Create Video Ad Creative & Video Ad on Meta Ads
  static async createVideoAd(
    accountId,
    accessToken,
    params = {}
  ) {
    const {
      adSetId,
      name,
      headline,
      primaryText,
      description,
      linkUrl,
      displayLink,
      callToAction = "BOOK_NOW",
      imageUrl,
      videoId,
      videoFilePath,
      videoUrl,
      driveUrl,
      pageId,
      status = "PAUSED",
      text_optimization,
      optimizeTextPerPerson = true,
      optimizedAdCreative = true,
      pixelId,
      appId,
      applicationId,
      instagramActorId,
      instagram_actor_id,
      instagram_account_id,
      ig_id,
      instagramId,
      trackingType,
      tracking_type,
      urlTags,
    } = params;
    const cleanId = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;
    const pageResolution = await MetaAssetResolver.verifyAndResolvePageAsset({
      accountId: cleanId,
      accessToken,
      requestedPageId: pageId,
    });

    if (!pageResolution.valid || !pageResolution.pageId) {
      const pageErr = new Error(
        pageResolution.error ||
          "A Facebook Page with Ads permission is required to create a Video Ad Creative on Meta Ads. Please connect an authorized Page in Meta Business Manager."
      );
      pageErr.status = pageResolution.status || "PAGE_PERMISSION_MISSING";
      pageErr.step = "PAGE_VALIDATION";
      throw pageErr;
    }
    const effectivePageId = pageResolution.pageId;

    const requestedIgId = instagramActorId || instagram_actor_id || instagram_account_id || ig_id || instagramId;
    const effectiveInstagramUserId = await this.resolveInstagramUserId(cleanId, accessToken, effectivePageId, requestedIgId);

    let effectiveVideoId = videoId;
    let localVideoPath = videoFilePath;

    if (!effectiveVideoId && (localVideoPath || videoUrl || driveUrl)) {
      const uploadRes = await this.uploadVideo(cleanId, accessToken, {
        filePath: localVideoPath,
        fileUrl: videoUrl || driveUrl,
        title: name,
        description: primaryText,
      });
      effectiveVideoId = uploadRes?.id || uploadRes?.video_id;
    }

    if (!effectiveVideoId) {
      throw new Error("A valid Meta video_id, videoFilePath, or videoUrl is required to create a video ad.");
    }

    // Wait for Meta video transcoding to reach 'ready' status to avoid transient HTTP 500 errors
    if (accessToken && !accessToken.startsWith("EAAB_simulated")) {
      await this.waitForVideoReady(effectiveVideoId, accessToken, 30);
    }

    const effectiveCta = this.normalizeCallToAction(callToAction);
    const cleanLinkUrl = this.sanitizeLinkUrl(linkUrl);

    let cleanDisplayLink = null;
    if (displayLink && typeof displayLink === "string" && displayLink.trim()) {
      cleanDisplayLink = displayLink.trim().replace(/^https?:\/\//i, "");
    }

    const sanitizeFieldValue = (val) => {
      if (val === undefined || val === null) return null;
      const s = String(val).trim();
      if (!s) return null;
      const lower = s.toLowerCase();
      if (lower === "null" || lower === "undefined" || lower === "n/a" || lower === "#n/a" || lower === "#value!" || lower === "none") {
        return null;
      }
      return s;
    };

    const cleanHeadline = sanitizeFieldValue(headline);
    const cleanPrimaryText = sanitizeFieldValue(primaryText);
    const cleanDescription = sanitizeFieldValue(description);

    // Resolve thumbnail for video creative (Requirement: Must include image_url OR image_hash in video_data)
    let effectiveImageUrl = null;
    let effectiveImageHash = null;

    if (imageUrl && typeof imageUrl === "string" && imageUrl.trim()) {
      const trimmedUrl = imageUrl.trim();
      const isVideoLink = /\.(mp4|mov|avi|mkv|webm)($|\?)/i.test(trimmedUrl) || trimmedUrl === videoUrl || trimmedUrl === driveUrl;
      if ((trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) && !isVideoLink) {
        effectiveImageUrl = trimmedUrl;
      }
    }

    // If no valid image URL from Sheet, generate/extract thumbnail from local video file & upload to Meta /adimages
    if (!effectiveImageUrl && !effectiveImageHash) {
      if ((!localVideoPath || !fs.existsSync(localVideoPath)) && (videoUrl || driveUrl)) {
        try {
          const targetUrl = videoUrl || driveUrl;
          if (targetUrl.includes("drive.google.com") || targetUrl.includes("docs.google.com")) {
            const { default: driveService } = await import("../../google/driveService.js");
            const dlInfo = await driveService.downloadCreative(targetUrl);
            if (dlInfo?.filePath && fs.existsSync(dlInfo.filePath)) {
              localVideoPath = dlInfo.filePath;
            }
          } else if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
            const scratchDir = process.env.SCRATCH_DIR || "./scratch";
            if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
            const tmpVideoFile = path.join(scratchDir, `vid_thumb_${Date.now()}.mp4`);
            const writer = fs.createWriteStream(tmpVideoFile);
            const dlRes = await axios.get(targetUrl, { responseType: "stream", timeout: 60000 });
            dlRes.data.pipe(writer);
            await new Promise((resolve, reject) => {
              writer.on("finish", resolve);
              writer.on("error", reject);
            });
            if (fs.existsSync(tmpVideoFile) && fs.statSync(tmpVideoFile).size > 0) {
              localVideoPath = tmpVideoFile;
            }
          }
        } catch (dlVidErr) {
          console.warn("[Meta Video Creative] Downloading video for thumbnail warning:", dlVidErr.message);
        }
      }

      let thumbnailPath = null;
      if (localVideoPath && fs.existsSync(localVideoPath)) {
        thumbnailPath = await this.extractVideoThumbnail(localVideoPath);
      }

      if (thumbnailPath && fs.existsSync(thumbnailPath)) {
        try {
          const imgUploadRes = await this.uploadAdImage(cleanId, accessToken, { filePath: thumbnailPath });
          if (imgUploadRes?.hash) {
            effectiveImageHash = imgUploadRes.hash;
          }
        } catch (imgUpErr) {
          console.warn("[Meta Video Creative] Uploading thumbnail to Meta /adimages warning:", imgUpErr.message);
        }
      }
    }

    if (!effectiveImageHash && !effectiveImageUrl) {
      console.log("[Meta Video Creative]: No explicit thumbnail image_hash or image_url provided; Meta will render thumbnail from video_id natively.");
    }

    // Step 1: Create Video Ad Creative
    const creativeUrl = `${META_GRAPH_URL}/${cleanId}/adcreatives`;
    const videoDataPayload = {
      video_id: effectiveVideoId,
      ...(effectiveImageHash
        ? { image_hash: effectiveImageHash }
        : effectiveImageUrl
        ? { image_url: effectiveImageUrl }
        : {}),
      call_to_action: {
        type: effectiveCta,
        value: {
          link: cleanLinkUrl,
          ...(cleanDisplayLink ? { link_caption: this.truncateToMaxBytes(cleanDisplayLink, 250) } : {}),
        },
      },
    };

    if (cleanPrimaryText) videoDataPayload.message = cleanPrimaryText;
    if (cleanHeadline) {
      const origBytes = Buffer.byteLength(cleanHeadline, "utf8");
      videoDataPayload.title = this.truncateToMaxBytes(cleanHeadline, 250);
      if (origBytes > 250) {
        console.log(`[Meta Video Creative Headline Enforced]: Truncated headline from ${origBytes} bytes to ${Buffer.byteLength(videoDataPayload.title, "utf8")} bytes to comply with Meta 255-byte limit.`);
      }
    }
    if (cleanDescription) videoDataPayload.link_description = cleanDescription;

    const objectStorySpec = {
      page_id: effectivePageId,
      ...(effectiveInstagramUserId ? { instagram_user_id: effectiveInstagramUserId } : {}),
      video_data: videoDataPayload,
    };

    console.log("[Meta Video Creative Payload Audit]:", JSON.stringify({
      page_id: objectStorySpec.page_id,
      instagram_actor_id: effectiveInstagramUserId || null,
      video_data: {
        video_id: videoDataPayload.video_id,
        has_image_hash: Boolean(videoDataPayload.image_hash),
        image_hash: videoDataPayload.image_hash || null,
        has_image_url: Boolean(videoDataPayload.image_url),
        image_url: videoDataPayload.image_url || null,
        call_to_action: videoDataPayload.call_to_action,
      }
    }, null, 2));

    const cleanUrlTags = urlTags ? String(urlTags).trim().replace(/^\?/, "") : null;

    const creativeParams = {
      name: this.formatCreativeName(name, "Video Creative"),
      object_story_spec: JSON.stringify(objectStorySpec),
      access_token: accessToken,
    };
    if (cleanUrlTags) creativeParams.url_tags = cleanUrlTags;

    const parseBoolean = (val) => {
      if (val === true || val === 1 || val === "1") return true;
      if (val === false || val === 0 || val === "0") return false;
      if (typeof val === "string") {
        const s = val.trim().toLowerCase();
        if (s === "yes" || s === "true" || s === "enabled" || s === "enable" || s === "on") return true;
        if (s === "no" || s === "false" || s === "disabled" || s === "disable" || s === "off") return false;
      }
      return val !== false;
    };

    const effectiveTextOpt = text_optimization !== undefined ? text_optimization : (optimizeTextPerPerson !== undefined ? optimizeTextPerPerson : true);
    const isOptEnabled = parseBoolean(effectiveTextOpt);
    const statusVal = isOptEnabled ? "OPT_IN" : "OPT_OUT";

    const fullCreativeFeaturesSpec = {
      text_optimizations: { enroll_status: statusVal },
      inline_comment: { enroll_status: statusVal },
      video_auto_crop: { enroll_status: statusVal },
      video_uncrop: { enroll_status: statusVal },
      enhance_cta: { enroll_status: statusVal },
      image_touchups: { enroll_status: statusVal },
    };

    creativeParams.degrees_of_freedom_spec = JSON.stringify({
      degrees_of_freedom_type: "USER_ENROLLED",
      creative_features_spec: fullCreativeFeaturesSpec,
    });

    console.log("[Meta Video Creative Page ID Audit]:", {
      pageIdReceivedFromSheet: pageId || "None",
      pageIdPassedToCreativeFunction: pageId || "None",
      finalObjectStorySpecPageId: objectStorySpec.page_id,
    });

    console.log("[Final Creative Payload]:", {
      creativeUrl,
      creativeParams: { ...creativeParams, access_token: "[REDACTED]" },
    });

    let creativeId = null;
    try {
      const creativeRes = await axios.post(creativeUrl, null, { params: creativeParams });
      console.log("[Meta Video Creative API Success Response]:", creativeRes.data);
      creativeId = creativeRes.data?.id;
    } catch (err) {
      if (accessToken && accessToken.startsWith("EAAB_simulated") && !err.response) {
        creativeId = `sim_cr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      } else {
      console.error("[Meta API error]:", {
        status: err.response?.status,
        data: err.response?.data,
        error: err.response?.data?.error || err.message,
      });
      console.warn("[Meta Video Creative Attempt 1 Warning]:", err.response?.data?.error || err.message);

      const firstErr = err.response?.data?.error;
      const isPermissionErr = firstErr?.code === 10 || firstErr?.error_subcode === 3858749 || (firstErr?.message || "").toLowerCase().includes("permission");

      if (isPermissionErr && !objectStorySpec.instagram_actor_id && !objectStorySpec.instagram_user_id) {
        throw new Error(
          `Page Permission Error [Code ${firstErr?.code || 10} / Subcode ${firstErr?.error_subcode || 3858749}]: Facebook Page ID "${objectStorySpec.page_id}" lacks required Ads permission. ${firstErr?.error_user_msg || firstErr?.message || "Please grant Advertiser or Admin access for this Page."}`
        );
      }

      if (objectStorySpec.instagram_actor_id || objectStorySpec.instagram_user_id) {
        console.warn(`[Meta Video Creative Retry]: Removing unverified Instagram ID and retrying under requested Page ID "${objectStorySpec.page_id}"...`);
        delete objectStorySpec.instagram_actor_id;
        delete objectStorySpec.instagram_user_id;
        creativeParams.object_story_spec = JSON.stringify(objectStorySpec);
      }
      // Attempt 2: Retry with exact 5 requested core spec keys
      try {
        creativeParams.degrees_of_freedom_spec = JSON.stringify({
          degrees_of_freedom_type: "USER_ENROLLED",
          creative_features_spec: {
            text_optimizations: { enroll_status: statusVal },
            inline_comment: { enroll_status: statusVal },
            video_auto_crop: { enroll_status: statusVal },
            video_uncrop: { enroll_status: statusVal },
            enhance_cta: { enroll_status: statusVal },
          },
        });
        const retryRes2 = await axios.post(creativeUrl, null, { params: creativeParams });
        console.log("[Meta Video Creative Attempt 2 Success Response]:", retryRes2.data);
        creativeId = retryRes2.data?.id;
      } catch (retryErr2) {
        console.warn("[Meta Video Creative Attempt 2 Warning]:", retryErr2.response?.data?.error || retryErr2.message);
        const err2 = retryErr2.response?.data?.error;
        if (err2?.code === 10 || err2?.error_subcode === 3858749 || (err2?.message || "").toLowerCase().includes("permission")) {
          delete objectStorySpec.instagram_actor_id;
          delete objectStorySpec.instagram_user_id;
          creativeParams.object_story_spec = JSON.stringify(objectStorySpec);
        }
        // Attempt 3: Pure text_optimizations fallback with USER_ENROLLED
        try {
          creativeParams.degrees_of_freedom_spec = JSON.stringify({
            degrees_of_freedom_type: "USER_ENROLLED",
            creative_features_spec: {
              text_optimizations: { enroll_status: statusVal },
            },
          });
          const retryRes3 = await axios.post(creativeUrl, null, { params: creativeParams });
          console.log("[Meta Video Creative Attempt 3 Success Response]:", retryRes3.data);
          creativeId = retryRes3.data?.id;
        } catch (retryErr3) {
          console.warn("[Meta Video Creative Attempt 3 Warning]:", retryErr3.response?.data?.error || retryErr3.message);
          const metaErr = retryErr3.response?.data?.error || retryErr2.response?.data?.error || err.response?.data?.error;
          const msg = metaErr ? `[${metaErr.code}]: ${metaErr.message || metaErr.error_user_msg}` : retryErr3.message;
          throw new Error(`Meta Video Ad Creative Creation Failed: ${msg}`);
        }
      }
    }
  }

    if (!creativeId) {
      throw new Error("Failed to obtain a valid Video Creative ID from Meta Graph API.");
    }

    // Immediate Meta GET verification to confirm degrees_of_freedom_spec stored by Meta
    let verifiedTextOptStatus = null;
    if (accessToken && !accessToken.startsWith("EAAB_simulated")) {
      try {
        const getCreativeRes = await axios.get(`${META_GRAPH_URL}/${creativeId}`, {
          params: {
            fields: "id,name,degrees_of_freedom_spec",
            access_token: accessToken,
          },
        });
        console.log(`[Meta GET Video Creative Verification Response]:`, getCreativeRes.data);
        const dofRes = getCreativeRes.data?.degrees_of_freedom_spec;
        verifiedTextOptStatus = dofRes?.creative_features_spec?.text_optimizations?.enroll_status || null;
        console.log(`[Meta Verification Result]: video text_optimizations enroll_status = "${verifiedTextOptStatus}"`);
      } catch (getCreativeErr) {
        console.warn(`[Meta GET Video Creative Verification Warning]:`, getCreativeErr.response?.data?.error || getCreativeErr.message);
      }
    }

    // Step 2: Resolve Pixel / App Tracking Specs dynamically
    const mode = (trackingType || tracking_type || "").toUpperCase();
    let effectivePixelId = pixelId || null;
    if (!effectivePixelId) {
      try {
        const pixRes = await this.verifyAndResolvePixelAsset({
          accountId: cleanId,
          accessToken,
          requestedPixelId: null,
          objective: params.campaignObjective || params.objective,
        });
        if (pixRes.valid && pixRes.pixelId) {
          effectivePixelId = pixRes.pixelId;
        }
      } catch (pixErr) {
        console.warn("[Meta Video Tracking] Dynamic Pixel verification warning:", pixErr.message);
      }
    }

    let effectiveAppId = appId || applicationId || null;
    if (!effectiveAppId && mode === "APP") {
      try {
        const appRes = await this.verifyAndResolveAppAsset({
          accountId: cleanId,
          accessToken,
          requestedAppId: null,
          objective: params.campaignObjective || params.objective,
        });
        if (appRes.valid && appRes.appId) {
          effectiveAppId = appRes.appId;
        }
      } catch (appErr) {}
    }

    const campaignObjective = String(params.campaignObjective || params.objective || "").toUpperCase();
    const isTrafficObjective = campaignObjective.includes("TRAFFIC") || campaignObjective.includes("CLICK") || campaignObjective.includes("ENGAGEMENT") || campaignObjective.includes("AWARENESS");
    const targetActionType = isTrafficObjective ? ["link_click"] : ["offsite_conversion"];

    const trackingSpecs = [];
    if (effectivePixelId) {
      trackingSpecs.push({
        "action.type": targetActionType,
        fb_pixel: [String(effectivePixelId)],
      });
    } else if (effectiveAppId) {
      trackingSpecs.push({
        "action.type": [typeof customEventType !== "undefined" && customEventType ? "app_custom_event" : "mobile_app_install"],
        application: [String(effectiveAppId)],
      });
    }

    // Step 3: Create Ad
    const formatAdName = (strName) => MetaApiService.formatAdName(strName, 250);

    const adUrl = `${META_GRAPH_URL}/${cleanId}/ads`;
    const payload = {
      name: formatAdName(name),
      adset_id: adSetId,
      status: status || "PAUSED",
      access_token: accessToken,
      creative: JSON.stringify({ creative_id: creativeId }),
    };

    if (urlTags) {
      payload.url_tags = String(urlTags).trim().replace(/^\?/, "");
    }

    if (trackingSpecs.length > 0) {
      payload.tracking_specs = JSON.stringify(trackingSpecs);
    }
    if (effectivePixelId) {
      payload.pixel_id = String(effectivePixelId);
    }

    if (accessToken && accessToken.startsWith("EAAB_simulated")) {
      const simAdId = `sim_ad_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      return { id: simAdId, adId: simAdId, creativeId, videoId: effectiveVideoId, pageId: effectivePageId, pixelId: effectivePixelId, adSetId, success: true };
    }

    return await this.withRateLimitRetry(async () => {
      try {
        const response = await axios.post(adUrl, null, { params: payload });
        return { ...response.data, creativeId, videoId: effectiveVideoId, pageId: effectivePageId, pixelId: effectivePixelId, urlTags: cleanUrlTags };
      } catch (error) {
        const initialMetaErr = error.response?.data?.error;
        const errMsg = (initialMetaErr?.message || initialMetaErr?.error_user_msg || error.message || "").toLowerCase();
        const isTrackingSpecErr = initialMetaErr?.error_subcode === 1634034 || errMsg.includes("action type") || errMsg.includes("tracking") || errMsg.includes("action spec");

        if (payload.tracking_specs) {
          try {
            console.warn("[Meta Video Ad Tracking Specs Notice]: Action spec invalid for campaign objective. Retrying ad creation without optional tracking_specs...");
            const retryPayload = { ...payload };
            delete retryPayload.tracking_specs;
            const retryRes = await axios.post(adUrl, null, { params: retryPayload });
            return { ...retryRes.data, creativeId, videoId: effectiveVideoId, pageId: effectivePageId };
          } catch (retryErr) {
            console.error("[DEBUG Meta Video Ad Retry Error Details]:", retryErr.response?.data);
          }
        }

        if (!isTrackingSpecErr) {
          console.error("[DEBUG Meta Video Ad Creation Error Details]:", {
            status: error.response?.status,
            data: error.response?.data,
            errorObj: initialMetaErr,
            payload,
          });
        }

        if (initialMetaErr) {
          const errToThrow = new Error(
            `Meta API Video Ad Creation Error [${initialMetaErr.code || "unknown"}]: ${initialMetaErr.message || initialMetaErr.error_user_msg || error.message}`
          );
          errToThrow.response = error.response;
          throw errToThrow;
        }
        throw error;
      }
    });
  }

  // Helper: Query existing campaign by exact name on Meta Ad Account
  static async findExistingCampaignByName(campaignName, accountId, userId, passedToken) {
    try {
      if (!campaignName || !accountId) return null;
      const cleanCampName = String(campaignName).trim();
      if (!cleanCampName) return null;

      const accessToken = await this.resolveOAuthToken(accountId, userId, passedToken);
      if (!accessToken) return null;

      const cleanAccountId = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;
      const rawAccountId = String(accountId).replace(/^act_/, "");

      // If user supplied an explicit numeric Campaign ID as the name
      if (/^\d{10,}$/.test(cleanCampName)) {
        try {
          const directRes = await axios.get(`${META_GRAPH_URL}/${cleanCampName}`, {
            params: {
              fields: "id,name,status,effective_status,objective,daily_budget,account_id",
              access_token: accessToken,
            },
          });
          const c = directRes.data;
          if (c && c.id) {
            // Verify account ownership
            const cAcc = String(c.account_id || "").replace(/^act_/, "");
            if (cAcc && cAcc !== rawAccountId) {
              throw new Error(`Security Error: Campaign ID ${cleanCampName} belongs to account ${cAcc}, not intended account ${rawAccountId}.`);
            }
            return {
              id: c.id,
              name: c.name,
              objective: c.objective,
              status: c.status,
              effectiveStatus: c.effective_status,
              dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : undefined,
              isReusedPrevious: true,
            };
          }
        } catch (dErr) {
          if (dErr.message && dErr.message.includes("Security Error")) throw dErr;
          // If not found by direct ID, continue to list search
        }
      }

      const url = `${META_GRAPH_URL}/${cleanAccountId}/campaigns`;
      const response = await axios.get(url, {
        params: {
          fields: "id,name,status,effective_status,objective,daily_budget,account_id",
          access_token: accessToken,
          limit: 250,
        },
      });

      const campaigns = response.data?.data || [];
      const targetLower = cleanCampName.toLowerCase();

      // Filter non-archived matching campaigns
      const matches = campaigns.filter((c) => {
        const cName = String(c.name || "").trim().toLowerCase();
        const s = String(c.status || "").toUpperCase();
        const es = String(c.effective_status || "").toUpperCase();
        const isArchived = s.includes("ARCHIV") || s.includes("DELET") || es.includes("ARCHIV") || es.includes("DELET");
        return !isArchived && cName === targetLower;
      });

      if (matches.length > 1) {
        const idsList = matches.map((m) => m.id).join(", ");
        throw new Error(
          `Ambiguity Error: Multiple active/paused campaigns found with name "${cleanCampName}" on Meta Ad Account ${cleanAccountId} (IDs: ${idsList}). Please specify an unambiguous campaign name or explicit Campaign ID.`
        );
      }

      if (matches.length === 1) {
        const match = matches[0];
        console.log(`🟢 [Meta Campaign Lookup] Reusing existing live Meta Campaign "${match.name}" (ID: ${match.id}) under Account ${cleanAccountId}.`);
        return {
          id: match.id,
          name: match.name,
          objective: match.objective,
          status: match.status,
          effectiveStatus: match.effective_status,
          dailyBudget: match.daily_budget ? Number(match.daily_budget) / 100 : undefined,
          isReusedPrevious: true,
        };
      }

      return null;
    } catch (err) {
      if (err.message && (err.message.includes("Ambiguity Error") || err.message.includes("Security Error"))) {
        throw err;
      }
      const metaErr = err.response?.data?.error;
      const status = err.response?.status;
      const errMsg = metaErr?.message || err.message || "";
      const isRateLimit = metaErr?.code === 80004 || metaErr?.code === 17 || metaErr?.code === 613 || status === 429 || errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("too many calls");
      const isAuthOrPerm = metaErr?.code === 190 || metaErr?.code === 10 || metaErr?.code === 200 || status === 401 || status === 403 || errMsg.toLowerCase().includes("permission") || errMsg.toLowerCase().includes("access token");
      const isServerError = status >= 500 || err.code === "ECONNABORTED" || err.code === "ETIMEDOUT";

      if (isRateLimit) {
        throw new Error(`Meta API Rate Limit Error [${metaErr?.code || 429}]: Unable to verify existing campaigns for account ${cleanAccountId}. ${errMsg}`);
      }
      if (isAuthOrPerm) {
        throw new Error(`Meta API Permission Error [${metaErr?.code || status}]: Unable to verify existing campaigns for account ${cleanAccountId}. ${errMsg}`);
      }
      if (isServerError) {
        throw new Error(`Meta API Server/Network Error: Unable to verify existing campaigns for account ${cleanAccountId}. ${errMsg}`);
      }
      console.warn(`[Meta Campaign Lookup Notice]: Could not query campaigns for account:`, metaErr?.message || err.message);
      return null;
    }
  }

  // Helper: Verify if an existing Ad Set configuration is compatible with row requirements
  static isAdSetConfigCompatible(adSet, requiredConfig = {}) {
    if (!adSet || !requiredConfig) return true;

    // Check campaign ID match
    const adSetCampId = adSet.campaign_id || adSet.campaignId;
    if (requiredConfig.campaignId && adSetCampId && String(adSetCampId) !== String(requiredConfig.campaignId)) {
      return false;
    }

    // Check optimization goal (case-insensitive)
    const existingGoal = adSet.optimization_goal || adSet.optimizationGoal;
    const reqGoal = requiredConfig.optimizationGoal || requiredConfig.optimization_goal;
    if (reqGoal && existingGoal) {
      if (String(existingGoal).toUpperCase().trim() !== String(reqGoal).toUpperCase().trim()) {
        return false;
      }
    }

    // Check billing event if specified
    const existingBilling = adSet.billing_event || adSet.billingEvent;
    const reqBilling = requiredConfig.billingEvent || requiredConfig.billing_event;
    if (reqBilling && existingBilling) {
      if (String(existingBilling).toUpperCase().trim() !== String(reqBilling).toUpperCase().trim()) {
        return false;
      }
    }

    // Check pixel / app in promoted_object if specified
    const adSetPromoted = adSet.promoted_object || adSet.promotedObject;
    if (requiredConfig.pixelId && adSetPromoted) {
      try {
        const promoObj = typeof adSetPromoted === "string" ? JSON.parse(adSetPromoted) : adSetPromoted;
        if (promoObj?.pixel_id && String(promoObj.pixel_id) !== String(requiredConfig.pixelId)) {
          return false;
        }
      } catch (e) {}
    }
    if (requiredConfig.appId && adSetPromoted) {
      try {
        const promoObj = typeof adSetPromoted === "string" ? JSON.parse(adSetPromoted) : adSetPromoted;
        if (promoObj?.application_id && String(promoObj.application_id) !== String(requiredConfig.appId)) {
          return false;
        }
      } catch (e) {}
    }

    return true;
  }

  // Helper: Query existing ad set by saved ID, exact name, or compatible configuration under resolved Campaign ID on Meta
  static async findExistingAdSetInCampaign(campaignId, adSetName, accountId, userId, passedToken, options = {}) {
    try {
      if (!campaignId) return null;
      const cleanCampId = String(campaignId).trim();
      const cleanAdSetName = adSetName ? String(adSetName).trim() : "";

      const accessToken = await this.resolveOAuthToken(accountId, userId, passedToken);
      if (!accessToken) return null;

      // 1. Direct saved Meta Ad Set ID or explicit numeric ID check
      const targetAdSetId = (options && options.savedAdSetId)
        ? String(options.savedAdSetId).trim()
        : (/^\d{10,}$/.test(cleanAdSetName) ? cleanAdSetName : null);

      if (targetAdSetId) {
        try {
          const directRes = await axios.get(`${META_GRAPH_URL}/${targetAdSetId}`, {
            params: {
              fields: "id,name,status,effective_status,campaign_id,optimization_goal,targeting,promoted_object,daily_budget,billing_event,bid_strategy",
              access_token: accessToken,
            },
          });
          const a = directRes.data;
          if (a && a.id) {
            if (String(a.campaign_id || "") !== cleanCampId) {
              throw new Error(`Security Error: Ad Set ID ${targetAdSetId} belongs to Campaign ${a.campaign_id}, not intended Campaign ${cleanCampId}.`);
            }
            const s = String(a.status || "").toUpperCase();
            const es = String(a.effective_status || "").toUpperCase();
            const isArchived = s.includes("ARCHIV") || s.includes("DELET") || es.includes("ARCHIV") || es.includes("DELET");
            if (!isArchived) {
              if (this.isAdSetConfigCompatible(a, options?.requiredConfig)) {
                return {
                  id: a.id,
                  name: a.name,
                  campaignId: cleanCampId,
                  status: a.status,
                  effectiveStatus: a.effective_status,
                  optimizationGoal: a.optimization_goal,
                  targeting: a.targeting,
                  promotedObject: a.promoted_object,
                  billingEvent: a.billing_event,
                  dailyBudget: a.daily_budget ? Number(a.daily_budget) / 100 : undefined,
                  isReusedPrevious: true,
                };
              } else {
                console.log(`[Meta Ad Set Lookup]: Saved Ad Set ${targetAdSetId} exists but its configuration is incompatible with row requirements.`);
              }
            }
          }
        } catch (dErr) {
          if (dErr.message && (dErr.message.includes("Security Error") || dErr.message.includes("Ambiguity Error"))) throw dErr;
          // If direct lookup fails, continue to campaign adsets list
        }
      }

      const url = `${META_GRAPH_URL}/${cleanCampId}/adsets`;
      const response = await axios.get(url, {
        params: {
          fields: "id,name,status,effective_status,campaign_id,optimization_goal,targeting,promoted_object,daily_budget,billing_event,bid_strategy",
          access_token: accessToken,
          limit: 250,
        },
      });

      const adsets = response.data?.data || [];
      const nonArchived = adsets.filter((a) => {
        const s = String(a.status || "").toUpperCase();
        const es = String(a.effective_status || "").toUpperCase();
        return !s.includes("ARCHIV") && !s.includes("DELET") && !es.includes("ARCHIV") && !es.includes("DELET");
      });

      // Pass A: If cleanAdSetName is provided and not numeric ID, filter by name
      let candidateAdSets = [];
      const isNameSearch = cleanAdSetName && !/^\d{10,}$/.test(cleanAdSetName);
      if (isNameSearch) {
        const targetLower = cleanAdSetName.toLowerCase();
        candidateAdSets = nonArchived.filter((a) => {
          const aName = String(a.name || "").trim().toLowerCase();
          return aName === targetLower;
        });
      } else {
        candidateAdSets = nonArchived;
      }

      // Pass B: Filter candidates by configuration compatibility (Requirement 9)
      const compatibleMatches = candidateAdSets.filter((a) => this.isAdSetConfigCompatible(a, options?.requiredConfig));

      if (compatibleMatches.length > 1 && isNameSearch) {
        const idsList = compatibleMatches.map((m) => m.id).join(", ");
        throw new Error(
          `Ambiguity Error: Multiple active/paused ad sets found with name "${cleanAdSetName}" under Campaign ${cleanCampId} (IDs: ${idsList}). Please specify an unambiguous ad set name or explicit Ad Set ID.`
        );
      }

      if (compatibleMatches.length === 1) {
        const match = compatibleMatches[0];
        console.log(`🟢 [Meta Ad Set Lookup] Reusing existing live Meta Ad Set "${match.name}" (ID: ${match.id}) under Campaign ${cleanCampId}.`);
        return {
          id: match.id,
          name: match.name,
          campaignId: cleanCampId,
          status: match.status,
          effectiveStatus: match.effective_status,
          optimizationGoal: match.optimization_goal,
          targeting: match.targeting,
          promotedObject: match.promoted_object,
          billingEvent: match.billing_event,
          dailyBudget: match.daily_budget ? Number(match.daily_budget) / 100 : undefined,
          isReusedPrevious: true,
        };
      }

      return null;
    } catch (err) {
      if (err.message && (err.message.includes("Ambiguity Error") || err.message.includes("Security Error"))) {
        throw err;
      }
      const metaErr = err.response?.data?.error;
      const status = err.response?.status;
      const errMsg = metaErr?.message || err.message || "";
      const isRateLimit = metaErr?.code === 80004 || metaErr?.code === 17 || metaErr?.code === 613 || status === 429 || errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("too many calls");
      const isAuthOrPerm = metaErr?.code === 190 || metaErr?.code === 10 || metaErr?.code === 200 || status === 401 || status === 403 || errMsg.toLowerCase().includes("permission") || errMsg.toLowerCase().includes("access token");
      const isServerError = status >= 500 || err.code === "ECONNABORTED" || err.code === "ETIMEDOUT";

      if (isRateLimit) {
        throw new Error(`Meta API Rate Limit Error [${metaErr?.code || 429}]: Unable to verify existing Ad Sets for campaign ${campaignId}. ${errMsg}`);
      }
      if (isAuthOrPerm) {
        throw new Error(`Meta API Permission Error [${metaErr?.code || status}]: Unable to verify existing Ad Sets for campaign ${campaignId}. ${errMsg}`);
      }
      if (isServerError) {
        throw new Error(`Meta API Server/Network Error: Unable to verify existing Ad Sets for campaign ${campaignId}. ${errMsg}`);
      }
      console.warn(`[Meta Ad Set Lookup Notice]: Could not query ad sets for campaign ${campaignId}:`, metaErr?.message || err.message);
      return null;
    }
  }

  // Helper: Query existing ads in an Ad Set to prevent duplicate ad creation
  static async findExistingAdInAdSet(adSetId, adName, accountId, userId, passedToken, creativeCode = null) {
    try {
      if (!adSetId || (!adName && !creativeCode)) return null;
      const cleanAdSetId = String(adSetId).trim();
      if (!/^\d+$/.test(cleanAdSetId)) return null;

      const accessToken = await this.resolveOAuthToken(accountId, userId, passedToken);
      if (!accessToken) return null;

      const url = `${META_GRAPH_URL}/${cleanAdSetId}/ads`;
      const response = await axios.get(url, {
        params: {
          fields: "id,name,status,effective_status",
          access_token: accessToken,
          limit: 100,
        },
      });

      const ads = response.data?.data || [];
      const targetNameClean = adName ? String(adName).trim().toLowerCase() : null;
      const codeClean = creativeCode ? String(creativeCode).trim().toLowerCase() : null;
      const match = ads.find((a) => {
        const aName = String(a.name || "").trim().toLowerCase();
        if (targetNameClean && aName === targetNameClean) return true;
        if (codeClean && aName.includes(codeClean)) return true;
        return false;
      });
      if (match) {
        return {
          id: match.id,
          name: match.name,
          status: match.status || match.effective_status,
        };
      }
      return null;
    } catch (err) {
      console.warn(
        "[Meta Duplicate Check Notice]: Could not query existing ads for adset:",
        err.response?.data?.error?.message || err.message
      );
      return null;
    }
  }

  // 11. Check if an error indicates token revocation or expiration
  static isTokenRevokedOrExpired(error) {
    const errObj = error?.response?.data?.error || error;
    const code = errObj?.code;
    const subcode = errObj?.error_subcode;
    const message = (errObj?.message || error?.message || "").toLowerCase();

    if (
      code === 190 || // Invalid OAuth 2.0 Access Token
      code === 102 || // Session expired
      subcode === 458 || // App not installed
      subcode === 460 || // Password changed
      subcode === 463 || // Expired
      subcode === 467 || // Invalid access token
      message.includes("session has expired") ||
      message.includes("access token has expired") ||
      message.includes("error validating access token")
    ) {
      return true;
    }
    return false;
  }
}

export default MetaApiService;

