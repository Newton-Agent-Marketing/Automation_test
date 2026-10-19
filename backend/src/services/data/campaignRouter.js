// backend/src/services/data/campaignRouter.js

/**
 * CampaignRouter: Deterministic Routing Engine for Meta Ads Campaigns.
 * Evaluates Excel/Google Sheet data and user prompts to route between:
 * - Website Campaigns (meta-ads-campaign-creator skill)
 * - App Promotion Campaigns (meta-ads-app-campaign skill)
 * - Conflicting or Unknown types requiring clarification.
 */

export const CAMPAIGN_TYPES = {
  WEBSITE: "WEBSITE",
  APP_PROMOTION: "APP_PROMOTION",
  CONFLICTING: "CONFLICTING",
  UNKNOWN: "UNKNOWN",
};

export const SKILL_TARGETS = {
  WEBSITE: "meta-ads-campaign-creator",
  APP_PROMOTION: "meta-ads-app-campaign",
};

// Recognizable Google Play & Apple App Store URL patterns
export const APP_STORE_URL_REGEX = /^https?:\/\/(?:play\.google\.com\/store\/apps\/details|apps\.apple\.com\/(?:[a-z]{2}\/)?app\/|itunes\.apple\.com\/)/i;

// Numeric Meta App Dashboard ID pattern (10 to 20 digits)
export const META_APP_ID_REGEX = /^\d{10,20}$/;

export class CampaignRouter {
  static CAMPAIGN_TYPES = CAMPAIGN_TYPES;
  static SKILL_TARGETS = SKILL_TARGETS;

  /**
   * Determine whether a URL is a valid Google Play Store or Apple App Store destination.
   * Normal website URLs MUST NEVER be treated as app store URLs.
   */
  static isAppStoreUrl(url) {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim();
    return APP_STORE_URL_REGEX.test(trimmed);
  }

  /**
   * Determine whether an ID is a valid numeric Meta App Dashboard Application ID.
   */
  static isMetaAppId(id) {
    if (!id) return false;
    const str = String(id).trim();
    return META_APP_ID_REGEX.test(str);
  }

  /**
   * Inspect all rows and headers of an ingested sheet or raw row collection
   * and determine whether it represents an App Promotion or Website campaign.
   */
  static routeSheet({
    headers = [],
    rows = [],
    sheetName = "",
    worksheetName = "",
    userInstruction = "",
  } = {}) {
    const normHeaders = (headers || []).map((h) => String(h || "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
    const rawHeaders = (headers || []).map((h) => String(h || "").trim());

    // 1. Check user prompt / chat instruction for explicit intent
    const cleanPrompt = String(userInstruction || "").toLowerCase();
    const promptWantsApp = /\b(?:app\s*promotion|app\s*install|mobile\s*app|app\s*campaign|app\s*ads?)\b/i.test(cleanPrompt);
    const promptWantsWeb = /\b(?:website\s*campaign|web\s*campaign|ecommerce|sales\s*campaign|website\s*traffic|lead\s*gen)\b/i.test(cleanPrompt);

    // 2. Identify relevant column headers
    const findHeader = (aliasList) => {
      for (const alias of aliasList) {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
        const idx = normHeaders.findIndex((h) => h === cleanAlias || h.includes(cleanAlias));
        if (idx !== -1) return rawHeaders[idx];
      }
      return null;
    };

    const typeHeader = findHeader(["campaign_type", "camptype", "promotion_type", "type"]);
    const objectiveHeader = findHeader(["campaign_objective", "objective", "funnel_event", "goal"]);
    const optGoalHeader = findHeader(["optimization_goal", "opt_goal", "optimize_for"]);
    const appIdHeader = findHeader(["app_id", "application_id", "meta_app_id", "fb_app_id", "appid", "applicationid"]);
    const storeUrlHeader = findHeader(["app_store_url", "object_store_url", "store_url", "play_store_url", "appstore_url", "google_play_url", "store_link"]);
    const pixelIdHeader = findHeader(["pixel_id", "meta_pixel_id", "dataset_id", "fbpixelid", "pixel"]);
    const landingUrlHeader = findHeader(["landing_page_url", "landing_page", "destination_url", "website_url", "url", "link"]);

    // 3. Inspect populated rows across ALL rows (not just the first few)
    let populatedRowCount = 0;
    const collectedAppIds = new Set();
    const collectedStoreUrls = new Set();
    const collectedPixelIds = new Set();
    const collectedWebUrls = new Set();
    const collectedObjectives = new Set();
    const collectedTypes = new Set();
    const collectedOptGoals = new Set();

    (rows || []).forEach((r) => {
      const rowVal = (r && typeof r === "object" && r.values) ? r.values : (r || {});
      const keys = Object.keys(rowVal);
      if (keys.length === 0) return;

      const hasValues = keys.some((k) => !k.startsWith("_") && rowVal[k] !== undefined && rowVal[k] !== null && String(rowVal[k]).trim() !== "");
      if (!hasValues) return;

      populatedRowCount++;

      // Check row values for type
      if (typeHeader && rowVal[typeHeader]) {
        collectedTypes.add(String(rowVal[typeHeader]).trim().toUpperCase());
      }
      // Check row values for objective
      if (objectiveHeader && rowVal[objectiveHeader]) {
        collectedObjectives.add(String(rowVal[objectiveHeader]).trim().toUpperCase());
      }
      // Check row values for optimization goal
      if (optGoalHeader && rowVal[optGoalHeader]) {
        collectedOptGoals.add(String(rowVal[optGoalHeader]).trim().toUpperCase());
      }
      // Check row values for App ID
      if (appIdHeader && rowVal[appIdHeader]) {
        const val = String(rowVal[appIdHeader]).trim();
        if (val) collectedAppIds.add(val);
      }
      // Check row values for App Store URL
      if (storeUrlHeader && rowVal[storeUrlHeader]) {
        const val = String(rowVal[storeUrlHeader]).trim();
        if (val) collectedStoreUrls.add(val);
      }
      // Check row values for Pixel ID
      if (pixelIdHeader && rowVal[pixelIdHeader]) {
        const val = String(rowVal[pixelIdHeader]).trim();
        if (val) collectedPixelIds.add(val);
      }
      // Check landing page URL column: is it an App Store URL or standard website URL?
      if (landingUrlHeader && rowVal[landingUrlHeader]) {
        const val = String(rowVal[landingUrlHeader]).trim();
        if (this.isAppStoreUrl(val)) {
          collectedStoreUrls.add(val);
        } else if (val.startsWith("http://") || val.startsWith("https://")) {
          collectedWebUrls.add(val);
        }
      }

      // Also scan any other columns in this row for App Store URLs or Meta App IDs
      keys.forEach((k) => {
        const val = String(rowVal[k] || "").trim();
        if (this.isAppStoreUrl(val)) {
          collectedStoreUrls.add(val);
        }
      });
    });

    // 4. Evaluate App Promotion indicators
    const hasExplicitAppType = Array.from(collectedTypes).some((t) =>
      t === "APP_PROMOTION" || t === "APP" || t === "MOBILE_APP" || t === "APP_INSTALLS"
    );
    const hasAppObjective = Array.from(collectedObjectives).some((o) =>
      o === "OUTCOME_APP_PROMOTION" || o.includes("APP_INSTALL") || o.includes("APP_PROMOTION")
    );
    const hasAppOptGoal = Array.from(collectedOptGoals).some((g) =>
      g === "APP_INSTALLS" || g.includes("APP_INSTALL")
    );
    const hasValidStoreUrl = Array.from(collectedStoreUrls).some((u) => this.isAppStoreUrl(u));
    const hasValidAppId = Array.from(collectedAppIds).some((id) => this.isMetaAppId(id));

    // 5. Evaluate Website Campaign indicators
    const hasExplicitWebType = Array.from(collectedTypes).some((t) =>
      t === "WEBSITE" || t === "WEB" || t === "CONVERSIONS" || t === "LEADS" || t === "SALES"
    );
    const hasWebObjective = Array.from(collectedObjectives).some((o) =>
      o === "OUTCOME_SALES" || o === "OUTCOME_LEADS" || o === "OUTCOME_TRAFFIC" || o === "OUTCOME_ENGAGEMENT" || o === "OUTCOME_AWARENESS"
    );
    const hasPixel = collectedPixelIds.size > 0;
    const hasWebUrls = collectedWebUrls.size > 0;

    // 6. Detailed Scoring and Conflict Resolution
    let appScore = 0;
    let webScore = 0;
    const appReasons = [];
    const webReasons = [];

    if (hasExplicitAppType) {
      appScore += 5;
      appReasons.push(`Explicit campaign_type column set to "${Array.from(collectedTypes).join(", ")}"`);
    }
    if (hasAppObjective) {
      appScore += 4;
      appReasons.push(`Campaign objective set to "${Array.from(collectedObjectives).join(", ")}"`);
    }
    if (hasAppOptGoal) {
      appScore += 3;
      appReasons.push(`Optimization goal set to "${Array.from(collectedOptGoals).join(", ")}"`);
    }
    if (hasValidStoreUrl) {
      appScore += 4;
      appReasons.push(`App Store destination URL verified (${Array.from(collectedStoreUrls)[0]})`);
    }
    if (hasValidAppId) {
      appScore += 3;
      appReasons.push(`Meta Application ID present (${Array.from(collectedAppIds)[0]})`);
    }
    if (promptWantsApp) {
      appScore += 3;
      appReasons.push("User chat instruction explicitly requested App Promotion campaign");
    }

    if (hasExplicitWebType) {
      webScore += 5;
      webReasons.push(`Explicit campaign_type column set to "${Array.from(collectedTypes).join(", ")}"`);
    }
    if (hasWebObjective) {
      webScore += 4;
      webReasons.push(`Campaign objective set to "${Array.from(collectedObjectives).join(", ")}"`);
    }
    if (hasPixel) {
      webScore += 3;
      webReasons.push(`Website Pixel ID present (${Array.from(collectedPixelIds)[0]})`);
    }
    if (hasWebUrls) {
      webScore += 2;
      webReasons.push(`Standard website destination URL present (${Array.from(collectedWebUrls)[0]})`);
    }
    if (promptWantsWeb) {
      webScore += 3;
      webReasons.push("User chat instruction explicitly requested Website campaign");
    }

    // Check for hard conflicts
    const hasConflictingExplicitType = hasExplicitAppType && hasExplicitWebType;
    const hasConflictingObjectives = hasAppObjective && hasWebObjective;
    const hasConflictingDestinations = hasValidStoreUrl && hasPixel && (promptWantsWeb || hasWebObjective);

    let campaignType = CAMPAIGN_TYPES.UNKNOWN;
    let selectedSkill = null;
    let routingReason = "";
    let confidence = "LOW";

    const hasDirectDestinationConflict =
      collectedWebUrls.size > 0 &&
      hasValidStoreUrl &&
      !hasExplicitAppType &&
      !hasExplicitWebType;

    if (
      hasConflictingExplicitType ||
      hasConflictingObjectives ||
      hasConflictingDestinations ||
      hasDirectDestinationConflict ||
      (appScore >= 4 && webScore >= 4 && Math.abs(appScore - webScore) < 2)
    ) {
      campaignType = CAMPAIGN_TYPES.CONFLICTING;
      confidence = "NONE";
      routingReason = `Conflicting campaign signals detected: Sheet contains both App Promotion indicators (${appReasons.join("; ")}) and Website Campaign indicators (${webReasons.join("; ")}). Clarification required from user before creating campaigns.`;
    } else if (appScore >= 4 && appScore > webScore) {
      campaignType = CAMPAIGN_TYPES.APP_PROMOTION;
      selectedSkill = SKILL_TARGETS.APP_PROMOTION;
      confidence = appScore >= 7 ? "HIGH" : "MEDIUM";
      routingReason = `Routed to App Promotion Campaign (${selectedSkill}): ${appReasons.join("; ")}.`;
    } else if (webScore >= 3 && webScore > appScore) {
      campaignType = CAMPAIGN_TYPES.WEBSITE;
      selectedSkill = SKILL_TARGETS.WEBSITE;
      confidence = webScore >= 6 ? "HIGH" : "MEDIUM";
      routingReason = `Routed to Website Campaign (${selectedSkill}): ${webReasons.join("; ")}.`;
    } else if (hasValidStoreUrl || (hasValidAppId && !hasPixel && !hasWebUrls)) {
      campaignType = CAMPAIGN_TYPES.APP_PROMOTION;
      selectedSkill = SKILL_TARGETS.APP_PROMOTION;
      confidence = "MEDIUM";
      routingReason = `Routed to App Promotion Campaign based on app-specific fields: ${appReasons.join("; ")}.`;
    } else if (hasWebUrls || hasPixel) {
      campaignType = CAMPAIGN_TYPES.WEBSITE;
      selectedSkill = SKILL_TARGETS.WEBSITE;
      confidence = "MEDIUM";
      routingReason = `Routed to Website Campaign based on website destination / pixel: ${webReasons.join("; ")}.`;
    } else {
      campaignType = CAMPAIGN_TYPES.UNKNOWN;
      confidence = "LOW";
      routingReason = "Unable to determine campaign type: Sheet contains neither valid App Promotion identifiers (App ID, App Store URL) nor Website campaign identifiers (Pixel ID, Website landing page URL). Clarification required.";
    }

    return {
      campaignType,
      selectedSkill,
      confidence,
      routingReason,
      requiresClarification: campaignType === CAMPAIGN_TYPES.CONFLICTING || campaignType === CAMPAIGN_TYPES.UNKNOWN,
      sheetSummary: {
        sheetName,
        worksheetName,
        totalHeaders: rawHeaders.length,
        populatedRowCount,
        totalRows: (rows || []).length,
      },
      detectedAppConfig: {
        hasAppSignals: hasValidAppId || hasValidStoreUrl || hasAppObjective,
        hasAppId: hasValidAppId,
        appId: collectedAppIds.values().next().value || null,
        appIds: Array.from(collectedAppIds),
        hasStoreUrl: hasValidStoreUrl,
        objectStoreUrl: collectedStoreUrls.values().next().value || null,
        storeUrls: Array.from(collectedStoreUrls),
        hasAppObjective,
        objectives: Array.from(collectedObjectives),
      },
      detectedWebConfig: {
        hasWebSignals: hasPixel || (collectedWebUrls.size > 0 && !hasValidStoreUrl) || hasWebObjective,
        hasPixel,
        pixelIds: Array.from(collectedPixelIds),
        webUrls: Array.from(collectedWebUrls),
        hasWebObjective,
      },
      signals: {
        appScore,
        webScore,
        appReasons,
        webReasons,
      },
    };
  }
}

export default CampaignRouter;
