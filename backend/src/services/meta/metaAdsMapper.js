// src/services/meta/metaAdsMapper.js
import MediaAssetResolver from "../data/mediaAssetResolver.js";

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
];

export const ALIAS_DICTIONARY = {
  // Campaign Level
  campaign_name: ["campaign_name", "campaignname", "camp_name", "campname", "campaign_title", "camptitle", "campaign_label", "campaign"],
  objective: ["objective", "campaign_objective", "funnel_event", "funnel", "goal"],
  buying_type: ["buying_type", "buying_option", "buying_type_enum"],
  special_ad_categories: ["special_ad_categories", "special_ad_category", "special_category", "ad_categories"],
  campaign_daily_budget: ["campaign_daily_budget", "campaign_budget_inr", "campaign_budget", "daily_budget_inr", "daily_budget"],
  campaign_lifetime_budget: ["campaign_lifetime_budget", "lifetime_budget"],
  spend_cap: ["spend_cap", "campaign_spend_cap"],
  campaign_status: ["campaign_status", "status", "action"],

  // Ad Set Level
  adset_name: ["adset_name", "ad_set_name", "adset", "ad_set", "adgroup", "group_name", "set_name"],
  adset_daily_budget: ["adset_daily_budget", "daily_budget", "budget_inr", "budget", "spend"],
  bid_amount: ["bid_amount", "bid", "cpc_bid"],
  optimization_goal: ["optimization_goal", "opt_goal", "optimize_for"],
  billing_event: ["billing_event", "billing"],
  conversion_location: ["conversion_location", "destination_type", "location_type"],
  target_audience: ["target_audience", "audience", "targeting", "interests", "locations"],
  page_id: ["facebook_page_id", "page_id", "fb_page_id", "promoted_page"],
  pixel_id: ["pixel_id", "meta_pixel_id", "dataset_id"],
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
    const { headers = [], rows = [], spreadsheetName, worksheetName } = ingestionData;
    const ambiguousHeaders = this.detectAmbiguousHeaders(headers);

    const mappedRows = [];
    const validationErrors = [];

    // Map each row
    rows.forEach((r) => {
      const rowVal = r.values || {};
      const originalRowNumber = r.originalRowNumber;

      // Extract Campaign Level
      const campNameMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.campaign_name, ["adset", "ad_name", "budget"]);
      const objMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.objective);
      const campBudgetMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.campaign_daily_budget);
      const statusMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.campaign_status);

      // Extract Ad Set Level
      const adsetNameMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.adset_name, ["campaign"]);
      const adsetBudgetMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.adset_daily_budget, ["campaign"]);
      const targetAudienceMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.target_audience);
      const optGoalMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.optimization_goal);
      const pageIdMatch = this.findFieldValue(rowVal, ALIAS_DICTIONARY.page_id);

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

      // Validate & Normalize Objective
      let rawObj = (objMatch.value || "OUTCOME_SALES").toUpperCase();
      if (!VALID_META_OBJECTIVES.includes(rawObj)) {
        if (rawObj.includes("SALE") || rawObj.includes("CONVERSION") || rawObj.includes("PURCHASE")) rawObj = "OUTCOME_SALES";
        else if (rawObj.includes("LEAD")) rawObj = "OUTCOME_LEADS";
        else if (rawObj.includes("TRAFFIC") || rawObj.includes("CLICK")) rawObj = "OUTCOME_TRAFFIC";
        else if (rawObj.includes("AWARE")) rawObj = "OUTCOME_AWARENESS";
        else if (rawObj.includes("ENGAGE")) rawObj = "OUTCOME_ENGAGEMENT";
        else rawObj = "OUTCOME_SALES";
      }

      // Validate & Normalize CTA
      let rawCta = (ctaMatch.value || "LEARN_MORE").toUpperCase().replace(/\s+/g, "_");
      if (!VALID_META_CTAS.includes(rawCta)) {
        if (rawCta.includes("SHOP")) rawCta = "SHOP_NOW";
        else if (rawCta.includes("SIGN")) rawCta = "SIGN_UP";
        else if (rawCta.includes("BUY")) rawCta = "BUY_NOW";
        else if (rawCta.includes("ORDER")) rawCta = "ORDER_NOW";
        else rawCta = "LEARN_MORE";
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

      if (!landingUrlMatch.value) {
        rowErrors.push({ rowNumber: originalRowNumber, field: "landing_page_url", message: "Landing page URL is missing." });
      } else if (!landingUrlMatch.value.startsWith("http://") && !landingUrlMatch.value.startsWith("https://")) {
        rowErrors.push({ rowNumber: originalRowNumber, field: "landing_page_url", message: "Landing page URL must start with http:// or https://." });
      }

      if (!headlineMatch.value && !primaryTextMatch.value) {
        rowErrors.push({ rowNumber: originalRowNumber, field: "ad_copy", message: "Both Headline and Primary Text are missing." });
      }

      const rowDriveUrls = MediaAssetResolver.extractRowDriveUrls(rowVal);
      const primaryDriveLink = rowDriveUrls.length > 0 ? rowDriveUrls[0] : (driveLinkMatch.value || null);

      const mappedRow = {
        originalRowNumber,
        isValid: rowErrors.length === 0,
        errors: rowErrors,
        campaign: {
          name: campaignName,
          nameSource: campNameMatch.sourceHeader,
          objective: rawObj,
          objectiveSource: objMatch.sourceHeader,
          status: (statusMatch.value || "PAUSED").toUpperCase(),
          statusSource: statusMatch.sourceHeader,
          dailyBudget: parsedBudget,
        },
        adset: {
          name: adsetName,
          nameSource: adsetNameMatch.sourceHeader,
          dailyBudget: parsedBudget,
          budgetSource: adsetBudgetMatch.sourceHeader || campBudgetMatch.sourceHeader,
          targetAudience: targetAudienceMatch.value || "Broad Target",
          targetAudienceSource: targetAudienceMatch.sourceHeader,
          optimizationGoal: optGoalMatch.value || "OFFSITE_CONVERSIONS",
          pageId: pageIdMatch.value || null,
        },
        ad: {
          name: adName,
          nameSource: adNameMatch.sourceHeader,
          creativeCode: creativeCodeMatch.value || `ROW-${originalRowNumber}`,
          creativeCodeSource: creativeCodeMatch.sourceHeader,
          headline: headlineMatch.value || "Special Offer",
          headlineSource: headlineMatch.sourceHeader,
          primaryText: primaryTextMatch.value || headlineMatch.value || "Discover our amazing products today!",
          primaryTextSource: primaryTextMatch.sourceHeader,
          description: descMatch.value || "",
          descriptionSource: descMatch.sourceHeader,
          landingPageUrl: landingUrlMatch.value || "",
          landingPageUrlSource: landingUrlMatch.sourceHeader,
          displayLink: displayLinkMatch.value || "",
          callToAction: rawCta,
          callToActionSource: ctaMatch.sourceHeader,
          googleDriveLink: primaryDriveLink,
          googleDriveLinks: rowDriveUrls,
          googleDriveLinkSource: driveLinkMatch.sourceHeader,
          hasMultipleDriveLinks: rowDriveUrls.length > 1,
          instagramAccountId: igAccountIdMatch.value || null,
          creativeOptimization: creativeOptMatch.value || null,
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
    };
  }
}

export default MetaAdsMapper;
