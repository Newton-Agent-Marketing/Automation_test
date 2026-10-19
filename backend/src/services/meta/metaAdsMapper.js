// src/services/meta/metaAdsMapper.js
import MediaAssetResolver from "../data/mediaAssetResolver.js";
import CampaignRouter from "../data/campaignRouter.js";
import { MetaApiService } from "./metaApiService.js";

export const VALID_META_OBJECTIVES = [
  "OUTCOME_SALES",
  "OUTCOME_LEADS",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_AWARENESS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_APP_PROMOTION",
];

export const VALID_META_CTAS = [
  "SHOP_NOW",
  "LEARN_MORE",
  "SIGN_UP",
  "BOOK_TRAVEL",
  "CONTACT_US",
  "ORDER_NOW",
  "GET_OFFER",
  "SUBSCRIBE",
  "WATCH_MORE",
  "DOWNLOAD",
  "APPLY_NOW",
  "BUY_NOW",
  "INSTALL_APP",
  "USE_APP",
];

export const ALIAS_DICTIONARY = {
  // Campaign Level
  campaign_name: ["campaign_name", "campaignname", "camp_name", "campname", "campaign_title", "camptitle", "campaign_label", "campaign"],
  campaign_type: ["campaign_type", "camptype", "promotion_type", "type"],
  objective: ["objective", "campaign_objective", "funnel_event", "funnel", "goal"],
  buying_type: ["buying_type", "buying_option", "buying_type_enum"],
  special_ad_categories: ["special_ad_categories", "special_ad_category", "special_category", "ad_categories"],
  campaign_daily_budget: ["campaign_daily_budget", "campaign_budget_inr", "campaign_budget", "daily_budget_inr", "daily_budget"],
  campaign_lifetime_budget: ["campaign_lifetime_budget", "lifetime_budget"],
  spend_cap: ["spend_cap", "campaign_spend_cap"],
  campaign_status: ["campaign_status", "status", "action"],
  is_skadnetwork_attribution: ["is_skadnetwork_attribution", "skadnetwork", "skan_attribution", "skan", "is_skadnetwork"],

  // Ad Set Level
  adset_name: ["adset_name", "ad_set_name", "adset", "ad_set", "adgroup", "group_name", "set_name"],
  adset_daily_budget: ["adset_daily_budget", "daily_budget", "budget_inr", "budget", "spend"],
  bid_amount: ["bid_amount", "bid", "cpc_bid"],
  optimization_goal: ["performance_goal", "performance goal", "performancegoal", "optimization_goal", "opt_goal", "optimize_for", "goal"],
  billing_event: ["billing_event", "billing"],
  conversion_location: ["conversion_location", "destination_type", "location_type"],
  target_audience: ["target_audience", "audience", "targeting", "interests", "locations"],
  page_id: ["facebook_page_id", "page_id", "fb_page_id", "promoted_page"],
  pixel_id: ["pixel_id", "meta_pixel_id", "dataset_id"],
  app_id: ["app_id", "appid", "application_id", "applicationid", "fb_app_id", "fbappid", "meta_app_id", "metaappid"],
  object_store_url: ["object_store_url", "app_store_url", "store_url", "play_store_url", "appstore_url", "google_play_url", "apple_store_url", "app_url", "store_link"],
  custom_event_type: ["custom_event_type", "custom_event", "event_type", "in_app_event", "app_event", "in_app_event_type", "event", "conversion_event"],
  schedule_start: ["start_time", "schedule_start", "start_date"],
  schedule_end: ["end_time", "schedule_end", "end_date"],

  // Ad Creative Level
  ad_name: ["ad_name", "adname", "ad_title", "creative_name", "ad_label"],
  creative_code: ["creative_code", "code", "creative_id", "asset_code", "row_id", "sku"],
  headline: ["headline", "ad_headline", "creative_headline", "title", "header", "headline_1"],
  primary_text: ["primary_text", "primarytext", "main_text", "ad_text", "body", "copy", "ad_copy", "text", "caption"],
  description: ["description", "ad_description", "link_description", "desc", "sub_headline"],
  landing_page_url: [
    "landing_page_web_app", "landingpagewebapp", "landing_page_webapp", "landing_page_web_or_app",
    "landing_page_url", "ad_landing_page_url", "landing_page", "landingpage", "destination_url",
    "destination_link", "link_url", "link", "url", "website_url", "website"
  ],
  display_link: ["display_link", "ad_display_link", "display_domain", "show_link"],
  call_to_action: ["call_to_action", "cta", "button_text"],
  google_drive_link: ["google_drive_link", "creative_url", "drive_url", "media_url", "drive_link", "video_url", "video", "media", "smart_chips", "creative"],
  instagram_account_id: ["instagram_account_id", "instagram_id", "ig_account_id", "ig_id"],
  creative_optimization: ["creative_optimization", "degrees_of_freedom_spec", "advantage_plus", "auto_enhancements"],
};

export class MetaAdsMapper {
  /**
   * Find field value using controlled alias dictionary
   */
  static findFieldValue(rowValues = {}, aliasKeys = [], excludeKeys = []) {
    const keys = Object.keys(rowValues || {});

    // Pass 1: Exact match on keys (case-insensitive & clean)
    for (const alias of aliasKeys) {
      const aliasClean = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const k of keys) {
        const kClean = k.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (kClean === aliasClean) {
          const val = rowValues[k];
          if (val !== undefined && val !== null && String(val).trim() !== "") {
            return { value: String(val).trim(), sourceHeader: k };
          }
        }
      }
    }

    // Pass 2: Substring match with exclusion check
    for (const alias of aliasKeys) {
      const aliasClean = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (aliasClean.length < 3) continue;

      for (const k of keys) {
        const kClean = k.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!kClean.includes(aliasClean)) continue;

        if (excludeKeys.some((ex) => kClean.includes(ex.toLowerCase()))) {
          continue;
        }

        const val = rowValues[k];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          return { value: String(val).trim(), sourceHeader: k };
        }
      }
    }

    return { value: null, sourceHeader: null };
  }

  /**
   * Check for ambiguous headers across columns
   */
  static detectAmbiguousHeaders(headers = []) {
    const ambiguous = [];
    headers.forEach((h) => {
      const hClean = h.toLowerCase().trim();
      if (hClean === "name" || hClean === "title" || hClean === "budget") {
        ambiguous.push({
          header: h,
          possibleMappings: hClean === "budget"
            ? ["campaign_daily_budget", "adset_daily_budget"]
            : ["campaign_name", "adset_name", "ad_name"],
        });
      }
    });
    return ambiguous;
  }

  /**
   * Map rows from normalized ingestion object into Meta Ads hierarchy & validate
   */
  static mapAndValidate(ingestionData) {
    let headers = [];
    let rows = [];
    let spreadsheetName = "";
    let worksheetName = "";

    if (Array.isArray(ingestionData)) {
      rows = ingestionData;
    } else if (ingestionData && typeof ingestionData === "object") {
      headers = ingestionData.headers || [];
      rows = ingestionData.rows || [];
      spreadsheetName = ingestionData.spreadsheetName || "";
      worksheetName = ingestionData.worksheetName || "";
    }

    if (headers.length === 0 && rows.length > 0) {
      const firstRowObj = rows[0]?.values || rows[0] || {};
      headers = Object.keys(firstRowObj);
    }

    const ambiguousHeaders = this.detectAmbiguousHeaders(headers);

    const mappedRows = [];
    const validationErrors = [];

    // Map each row
    rows.forEach((r, idx) => {
      const rowVal = r.values || r || {};
      const originalRowNumber = r.originalRowNumber || (idx + 1);

      // Extract Campaign Level
      const campNameMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.campaign_name, ["adset", "ad_name", "budget"]);
      const campTypeMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.campaign_type);
      const objMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.objective);
      const campBudgetMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.campaign_daily_budget);
      const statusMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.campaign_status);
      const skanMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.is_skadnetwork_attribution);

      // Extract Ad Set Level
      const adsetNameMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.adset_name, ["campaign"]);
      const adsetBudgetMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.adset_daily_budget, ["campaign"]);
      const targetAudienceMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.target_audience);
      const optGoalMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.optimization_goal);
      const pageIdMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.page_id);
      const pixelIdMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.pixel_id);
      const appIdMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.app_id);
      const storeUrlMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.object_store_url);
      const customEventMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.custom_event_type);

      // Extract Ad Level
      const adNameMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.ad_name, ["campaign", "adset"]);
      const creativeCodeMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.creative_code);
      const headlineMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.headline);
      const primaryTextMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.primary_text);
      const descMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.description);
      const landingUrlMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.landing_page_url);
      const displayLinkMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.display_link);
      const ctaMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.call_to_action);
      const driveLinkMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.google_drive_link);
      const igAccountIdMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.instagram_account_id);
      const creativeOptMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.creative_optimization);

      // Determine Campaign Type for this row
      const rawCampType = (campTypeMatch.value || "").toUpperCase();
      let rawObjUpper = (objMatch.value || "").toUpperCase();
      const isAppIndicated =
        rawCampType === "APP_PROMOTION" ||
        rawCampType === "APP" ||
        rawCampType === "MOBILE_APP" ||
        rawCampType === "APP_INSTALLS" ||
        rawObjUpper.includes("APP") ||
        Boolean(storeUrlMatch.value) ||
        (Boolean(appIdMatch.value) && !pixelIdMatch.value);

      const rowCampaignType = isAppIndicated ? "APP_PROMOTION" : "WEBSITE";

      // Validate & Normalize Objective
      let rawObj = rawObjUpper || (rowCampaignType === "APP_PROMOTION" ? "OUTCOME_APP_PROMOTION" : "OUTCOME_SALES");
      if (!VALID_META_OBJECTIVES.includes(rawObj)) {
        if (rawObj.includes("APP")) rawObj = "OUTCOME_APP_PROMOTION";
        else if (rawObj.includes("SALE") || rawObj.includes("CONVERSION") || rawObj.includes("PURCHASE")) rawObj = "OUTCOME_SALES";
        else if (rawObj.includes("LEAD")) rawObj = "OUTCOME_LEADS";
        else if (rawObj.includes("TRAFFIC") || rawObj.includes("CLICK")) rawObj = "OUTCOME_TRAFFIC";
        else if (rawObj.includes("AWARE")) rawObj = "OUTCOME_AWARENESS";
        else if (rawObj.includes("ENGAGE")) rawObj = "OUTCOME_ENGAGEMENT";
        else rawObj = rowCampaignType === "APP_PROMOTION" ? "OUTCOME_APP_PROMOTION" : "OUTCOME_SALES";
      }

      // Validate & Normalize CTA
      let rawCta = (ctaMatch.value || (rowCampaignType === "APP_PROMOTION" ? "DOWNLOAD" : "LEARN_MORE")).toUpperCase().replace(/\s+/g, "_");
      if (!VALID_META_CTAS.includes(rawCta)) {
        if (rawCta.includes("DOWN") || rawCta.includes("INSTALL")) rawCta = "DOWNLOAD";
        else if (rawCta.includes("BOOK")) rawCta = "BOOK_TRAVEL";
        else if (rawCta.includes("SHOP")) rawCta = "SHOP_NOW";
        else if (rawCta.includes("SIGN")) rawCta = "SIGN_UP";
        else if (rawCta.includes("BUY")) rawCta = "BUY_NOW";
        else if (rawCta.includes("ORDER")) rawCta = "ORDER_NOW";
        else rawCta = rowCampaignType === "APP_PROMOTION" ? "DOWNLOAD" : "LEARN_MORE";
      }

      // Validate Daily Budget
      let parsedBudget = 0;
      const budgetStr = adsetBudgetMatch.value || campBudgetMatch.value;
      if (budgetStr) {
        parsedBudget = Number(String(budgetStr).replace(/[^0-9.]/g, ""));
      }
      if (isNaN(parsedBudget) || parsedBudget <= 0) {
        parsedBudget = 500; // default benchmark
      }

      const rowErrors = [];
      const campaignName = campNameMatch.value || `Meta Campaign ${worksheetName || ""}`;
      const adsetName = adsetNameMatch.value || `${campaignName} - Ad Set`;
      const adName = adNameMatch.value || `Ad - Row ${originalRowNumber}`;

      // Destination URL validation
      const destinationUrl = landingUrlMatch.value || storeUrlMatch.value;
      if (!destinationUrl) {
        rowErrors.push({ rowNumber: originalRowNumber, field: "landing_page_url", message: "Landing page URL or App Store URL is missing." });
      } else if (!destinationUrl.startsWith("http://") && !destinationUrl.startsWith("https://")) {
        rowErrors.push({ rowNumber: originalRowNumber, field: "landing_page_url", message: "Destination URL must start with http:// or https://." });
      }

      // App Campaign specific validations
      if (rowCampaignType === "APP_PROMOTION") {
        if (!appIdMatch.value) {
          rowErrors.push({ rowNumber: originalRowNumber, field: "app_id", message: "Meta Application ID (app_id) is required for App Promotion campaigns." });
        } else if (!CampaignRouter.isMetaAppId(appIdMatch.value)) {
          rowErrors.push({ rowNumber: originalRowNumber, field: "app_id", message: `Invalid Meta Application ID "${appIdMatch.value}". Must be a numeric Meta App Dashboard ID, not a package name or store URL.` });
        }

        const effectiveStoreUrl = storeUrlMatch.value || (destinationUrl && CampaignRouter.isAppStoreUrl(destinationUrl) ? destinationUrl : null);
        if (!effectiveStoreUrl) {
          rowErrors.push({ rowNumber: originalRowNumber, field: "object_store_url", message: "Valid Google Play Store or Apple App Store URL (object_store_url) is required for App Promotion campaigns." });
        } else if (!CampaignRouter.isAppStoreUrl(effectiveStoreUrl)) {
          rowErrors.push({ rowNumber: originalRowNumber, field: "object_store_url", message: `Invalid App Store URL "${effectiveStoreUrl}". Must be a valid Google Play Store (play.google.com) or Apple App Store (apps.apple.com) link.` });
        }
      }

      if (!headlineMatch.value && !primaryTextMatch.value) {
        rowErrors.push({ rowNumber: originalRowNumber, field: "ad_copy", message: "Both Headline and Primary Text are missing." });
      }

      const rowDriveUrls = MediaAssetResolver.extractRowDriveUrls(rowVal);
      const primaryDriveLink = rowDriveUrls.length > 0 ? rowDriveUrls[0] : (driveLinkMatch.value || null);

      const isSkan = skanMatch.value ? ["true", "1", "yes", "enabled"].includes(String(skanMatch.value).toLowerCase()) : false;

      const mappedRow = {
        originalRowNumber,
        isValid: rowErrors.length === 0,
        errors: rowErrors,
        campaignType: rowCampaignType,
        campaign: {
          name: campaignName,
          nameSource: campNameMatch.sourceHeader,
          objective: rawObj,
          objectiveSource: objMatch.sourceHeader,
          status: (statusMatch.value || "PAUSED").toUpperCase(),
          statusSource: statusMatch.sourceHeader,
          dailyBudget: parsedBudget,
          campaignType: rowCampaignType,
          isSkadnetworkAttribution: isSkan,
        },
        adset: (() => {
          const rawCustomEvent = customEventMatch.value || null;
          const normalizedCustomEvent = MetaApiService.normalizeAppCustomEventType(rawCustomEvent);

          return {
            name: adsetName,
            nameSource: adsetNameMatch.sourceHeader,
            dailyBudget: parsedBudget,
            budgetSource: adsetBudgetMatch.sourceHeader || campBudgetMatch.sourceHeader,
            targetAudience: targetAudienceMatch.value || "Broad Target",
            targetAudienceSource: targetAudienceMatch.sourceHeader,
            optimizationGoal: optGoalMatch.value || (rowCampaignType === "APP_PROMOTION" ? (normalizedCustomEvent ? "OFFSITE_CONVERSIONS" : "APP_INSTALLS") : "OFFSITE_CONVERSIONS"),
            pageId: pageIdMatch.value || null,
            pixelId: pixelIdMatch.value || null,
            appId: appIdMatch.value || null,
            objectStoreUrl: storeUrlMatch.value || (destinationUrl && CampaignRouter.isAppStoreUrl(destinationUrl) ? destinationUrl : null),
            customEventType: normalizedCustomEvent || null,
          };
        })(),
        ad: {
          name: adName,
          nameSource: adNameMatch.sourceHeader,
          creativeCode: creativeCodeMatch.value || `ROW-${originalRowNumber}`,
          creativeCodeSource: creativeCodeMatch.sourceHeader,
          headline: headlineMatch.value || (rowCampaignType === "APP_PROMOTION" ? "Download Now" : "Special Offer"),
          headlineSource: headlineMatch.sourceHeader,
          primaryText: primaryTextMatch.value || headlineMatch.value || "Discover our amazing app today!",
          primaryTextSource: primaryTextMatch.sourceHeader,
          description: descMatch.value || "",
          descriptionSource: descMatch.sourceHeader,
          landingPageUrl: destinationUrl || "",
          landingPage: destinationUrl || "",
          landingPageUrlSource: landingUrlMatch.sourceHeader || storeUrlMatch.sourceHeader,
          displayLink: displayLinkMatch.value || "",
          callToAction: rawCta,
          callToActionSource: ctaMatch.sourceHeader,
          googleDriveLink: primaryDriveLink,
          googleDriveLinks: rowDriveUrls,
          googleDriveLinkSource: driveLinkMatch.sourceHeader,
          hasMultipleDriveLinks: rowDriveUrls.length > 1,
          instagramAccountId: igAccountIdMatch.value || null,
          creativeOptimization: creativeOptMatch.value || null,
          appId: appIdMatch.value || null,
          objectStoreUrl: storeUrlMatch.value || (destinationUrl && CampaignRouter.isAppStoreUrl(destinationUrl) ? destinationUrl : null),
        },
        rawValues: rowVal,
      };

      mappedRows.push(mappedRow);
      if (rowErrors.length > 0) {
        validationErrors.push(...rowErrors);
      }
    });

    // Group rows by Campaign and AdSet hierarchy (prevent duplicate entity creation)
    const campaignGroups = new Map();

    mappedRows.forEach((r) => {
      const cKey = r.campaign.name.toLowerCase().trim();
      if (!campaignGroups.has(cKey)) {
        campaignGroups.set(cKey, {
          campaign: r.campaign,
          adsets: new Map(),
        });
      }

      const campObj = campaignGroups.get(cKey);
      const asKey = r.adset.name.toLowerCase().trim();
      if (!campObj.adsets.has(asKey)) {
        campObj.adsets.set(asKey, {
          adset: r.adset,
          ads: [],
        });
      }

      const adsetObj = campObj.adsets.get(asKey);
      adsetObj.ads.push({
        ad: r.ad,
        originalRowNumber: r.originalRowNumber,
        isValid: r.isValid,
        errors: r.errors,
      });
    });

    // Convert map to array structure for UI/preview
    const groupedCampaigns = Array.from(campaignGroups.values()).map((cg) => ({
      campaign: cg.campaign,
      adsets: Array.from(cg.adsets.values()).map((ag) => ({
        adset: ag.adset,
        ads: ag.ads,
      })),
    }));

    const readyRowsCount = mappedRows.filter((r) => r.isValid).length;
    const correctionRequiredRowsCount = mappedRows.filter((r) => !r.isValid).length;

    const routing = CampaignRouter.routeSheet({
      headers,
      rows,
      sheetName: spreadsheetName,
      worksheetName,
    });

    return {
      spreadsheetName,
      worksheetName,
      totalRows: mappedRows.length,
      readyRowsCount,
      correctionRequiredRowsCount,
      ambiguousHeaders,
      mappedRows,
      groupedCampaigns,
      validationErrors,
      routing,
      campaignType: routing.campaignType,
      selectedSkill: routing.selectedSkill,
    };
  }
}

export default MetaAdsMapper;
