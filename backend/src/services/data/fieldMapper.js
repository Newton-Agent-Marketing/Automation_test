/**
 * FieldMapper: Deterministic Semantic Field Mapping Layer
 * Maps spreadsheet column headers to Meta Ads fields using explicit aliases.
 * Eliminates value-based guessing, cross-row pollution, and hardcoded fallbacks.
 * Dynamically tracks spreadsheet metadata & unmapped columns for audit.
 */
export class FieldMapper {
  static ALIASES = {
    campaignName: ["campaign_name", "campaignname", "camp_name", "campname", "campaign_title", "camptitle", "campaign_label", "campaign", "camp"],
    adSetName: ["adset_name", "adset", "ad_set", "ad_set_name", "adsetname", "adgroup", "ad_group"],
    adName: ["ad_name", "adname", "ad_title", "ad_label", "creative_name", "creativename", "nomenclature", "nomen"],
    headline: ["headline", "headlines", "ad_headline", "ad_headlines", "adheadline", "creative_headline", "creativeheadline", "headline_1", "headline1", "header", "title", "titles", "ad_title", "adtitle"],
    primaryText: ["primary_text", "primary_texts", "primarytext", "primarytexts", "main_text", "maintext", "ad_text", "adtext", "body_text", "body_texts", "bodytext", "body", "caption", "primary_text_1", "text", "copy", "ad_copy", "adcopy", "primary_copy", "post_text", "message"],
    description: ["ad_description", "ad_descriptions", "addescription", "description", "descriptions", "ad_desc", "addesc", "desc", "descs", "link_description", "linkdescription", "sub_headline", "subheadline", "description_1", "description1"],
    landingPageUrl: [
      "landing_page_web_app", "landingpagewebapp", "landing_page_webapp",
      "landing_page_web_or_app", "landingpageweborapp", "landing_page_app", "landingpageapp",
      "ad_landing_page_url", "landing_page_url", "ad_landing_page", "landing_page", "landingpages", "landingpage",
      "landingpageurl", "destination_url", "destination_urls", "destinationurl", "destination_link", "destinationlink",
      "destination", "dest_url", "desturl", "website_url", "website_urls", "websiteurl", "website_link", "websitelink",
      "website", "target_url", "targeturl", "target_link", "targetlink", "site_url", "siteurl",
      "site_link", "sitelink", "link_url", "linkurl", "final_url", "finalurl", "ad_url", "adurl",
      "ad_link", "adlink", "target_link", "targetlink", "web_url", "weburl", "product_link", "productlink",
      "product_url", "producturl", "page_url", "pageurl", "landing_url", "landingurl", "url", "link"
    ],
    displayLink: ["display_link", "display_links", "displaylink", "display_url", "display_urls", "displayurl", "display_link_url", "displaylinkurl", "show_link", "showlink", "vanity_url", "vanityurl", "display_domain", "displaydomain", "display"],
    driveUrl: [
      "creative_smart_chips", "creative_smart_chip", "smart_chips", "smart_chip", "creativesmartchips", "creativesmartchip",
      "google_drive_link", "googledrivelink", "drive_url", "driveurl", "video_url", "videourl", "drive_link", "drivelink",
      "video_link", "videolink", "creative_url", "creativeurl", "media_url", "mediaurl", "video", "drive", "media", "creative",
      "image", "picture", "photo", "file", "asset", "creative_file", "creativefile", "media_file", "mediafile", "video_file", "videofile", "image_file", "imagefile"
    ],
    pixelId: ["pixel_id", "pixelid", "fb_pixel_id", "fbpixelid", "meta_pixel_id", "metapixelid", "dataset_id", "datasetid", "pixel"],
    appId: ["app_id", "appid", "application_id", "applicationid", "fb_app_id", "fbappid", "meta_app_id", "metaappid"],
    objectStoreUrl: ["object_store_url", "objectstoreurl", "app_store_url", "appstoreurl", "store_url", "storeurl", "play_store_url", "playstoreurl", "google_play_url", "apple_store_url", "app_url", "store_link"],
    campaignType: ["campaign_type", "campaigntype", "camptype", "promotion_type", "promotiontype", "type"],
    isSkadnetworkAttribution: ["is_skadnetwork_attribution", "skadnetwork", "skan_attribution", "skan", "is_skadnetwork"],
    pageId: ["page_id", "pageid", "facebook_page_id", "facebookpageid", "fb_page_id", "fbpageid", "facebook_page", "page_account_id"],
    instagramId: [
      "instagram_user_id", "instagramuserid", "instagram_actor_id", "instagramactorid",
      "instagram_account_id", "instagramaccountid", "ig_id", "igid", "instagram_id",
      "instagramid", "instagram_profile", "ig_user_id"
    ],
    cta: ["call_to_action", "calltoaction", "cta", "button", "action_button", "actionbutton", "button_text", "buttontext", "action"],
    status: ["status", "active", "enabled", "is_active", "isactive", "toggle", "state"],
    optimizationGoal: [
      "performance_goal", "performancegoal", "performance_goals", "performancegoals",
      "performance goal", "performance goals", "optimization_goal", "optimizationgoal",
      "opt_goal", "optgoal", "optimize_for", "optimizefor", "goal"
    ],
    urlTags: [
      "url_parameters", "urlparameters", "url_parameter", "urlparameter",
      "url_tags", "urltags", "url_tag", "urltag",
      "url_params", "urlparams", "url_param", "urlparam",
      "utm_parameters", "utmparameters", "utm_parameter", "utmparameter",
      "utm_params", "utmparams", "utm_param", "utmparam",
      "utm_tags", "utmtags", "utm_tag", "utmtag",
      "tracking_parameters", "trackingparameters", "tracking_parameter", "trackingparameter",
      "tracking_template", "trackingtemplate", "tracking_specs", "trackingspecs",
      "url_tracking", "urltracking", "custom_parameters", "customparameters",
      "tracking_url", "trackingurl", "utm", "tracking"
    ],
  };

  static METADATA_HEADERS = [
    "puja_tithi", "pujatithi", "tithi", "puja_date", "pujadate", "date", "puja_dt",
    "nomenclature", "nomen", "creative_code", "creativecode", "code", "city", "state",
    "language", "category", "status", "row_number", "rownumber", "id", "cost", "spend",
    "budget", "daily_budget", "dailybudget", "filter", "tag", "utm_source", "utm_medium",
    "utm_campaign", "campaign_budget", "product_name", "productname", "item"
  ];

  static normalizeHeader(h) {
    if (!h || typeof h !== "string") return "";
    // Remove parenthetical annotations like "(Ad Title)", "(Optional)", "(Required)", etc.
    const withoutParens = h.replace(/\([^)]*\)/g, " ");
    const candidate = withoutParens.trim().length > 0 ? withoutParens : h;
    return candidate.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  static isValueValid(val) {
    if (val === undefined || val === null) return false;
    const s = String(val).trim();
    if (!s) return false;
    const lower = s.toLowerCase();
    if (
      lower === "null" ||
      lower === "undefined" ||
      lower === "n/a" ||
      lower === "#n/a" ||
      lower === "#value!" ||
      lower === "none"
    ) {
      return false;
    }
    return true;
  }

  /**
   * Determine whether a column header represents a candidate Landing Page / Destination URL.
   * Strictly excludes display/vanity links, creative media, and tracking parameters.
   */
  static isLandingPageCandidate(header) {
    if (!header || typeof header !== "string") return false;
    const norm = FieldMapper.normalizeHeader(header);
    if (!norm) return false;

    // Strict Negative Exclusions
    if (
      norm.includes("display") ||
      norm.includes("vanity") ||
      norm.includes("caption") ||
      norm.includes("domain") ||
      norm.includes("smartchip") ||
      norm.includes("drive") ||
      norm.includes("video") ||
      norm.includes("image") ||
      norm.includes("photo") ||
      norm.includes("picture") ||
      norm.includes("media") ||
      norm.includes("asset") ||
      norm.includes("file") ||
      norm.includes("thumbnail") ||
      norm.startsWith("utm") ||
      norm.includes("parameter")
    ) {
      return false;
    }

    // 1. Check against registered ALIASES
    const aliases = FieldMapper.ALIASES.landingPageUrl || [];
    for (const a of aliases) {
      if (FieldMapper.normalizeHeader(a) === norm) {
        return true;
      }
    }

    // 2. Semantic stem matching
    if (
      norm.includes("landingpage") ||
      norm.includes("destinationurl") ||
      norm.includes("destinationlink") ||
      norm.includes("websiteurl") ||
      norm.includes("websitelink") ||
      norm.includes("targeturl") ||
      norm.includes("targetlink") ||
      norm.includes("finalurl") ||
      norm.startsWith("landing") ||
      norm.startsWith("destination") ||
      norm.startsWith("desturl")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Determine whether a candidate column header and its value can represent a Campaign Name or Ad Set Name.
   * Strictly disqualifies dates, spends/splits, metrics, statuses, IDs, counts, and non-name descriptors.
   */
  static isEntityNameCandidate(fieldKey, rawHeader, rawValue) {
    if (!rawHeader || typeof rawHeader !== "string") return false;
    const cleanHeader = rawHeader.toLowerCase().trim();

    // Universal disqualifier terms that distinguish dates, metrics, costs, or reports from entity names
    const sharedDisqualifiers = [
      "start", "started", "date", "time", "schedule", "scheduled",
      "budget", "spend", "cost", "cpm", "ctr", "cpc", "roas", "split",
      "count", "total", "sum", "id", "identifier", "status", "type",
      "objective", "url", "link", "page", "result", "verdict", "metric",
      "window", "frequency", "reach", "impression", "click", "aov", "revenue"
    ];

    if (fieldKey === "campaignName") {
      for (const dis of sharedDisqualifiers) {
        if (cleanHeader.includes(dis)) return false;
      }
      // Value checks: Cannot look like a date, status, boolean, or pure number
      if (rawValue !== undefined && rawValue !== null) {
        const valStr = String(rawValue).trim();
        if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(valStr)) return false;
        if (/^\d+\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(valStr)) return false;
        if (/^(?:active|paused|completed|archived|deleted|true|false)$/i.test(valStr)) return false;
        if (/^\d+(?:\.\d+)?$/.test(valStr)) return false;
      }
      return true;
    }

    if (fieldKey === "adSetName") {
      const adSetDisqualifiers = [
        ...sharedDisqualifiers,
        "top", "best", "#", "number", "gate", "off", "alert", "report", "testing"
      ];
      for (const dis of adSetDisqualifiers) {
        if (cleanHeader.includes(dis)) return false;
      }
      // Value checks: Cannot look like a report message, date, status, or number
      if (rawValue !== undefined && rawValue !== null) {
        const valStr = String(rawValue).trim();
        if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(valStr)) return false;
        if (/^\d+\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(valStr)) return false;
        if (/^(?:not\s+in\s+meta|not\s+live|active|paused|completed|archived|deleted|true|false)$/i.test(valStr)) return false;
        if (/^\d+(?:\.\d+)?$/.test(valStr)) return false;
      }
      return true;
    }

    return true;
  }

  /**
   * Register custom aliases dynamically if user config provides extra column mappings.
   */
  static registerAlias(fieldKey, customAliases = []) {
    if (!FieldMapper.ALIASES[fieldKey]) {
      FieldMapper.ALIASES[fieldKey] = [];
    }
    customAliases.forEach((alias) => {
      const norm = FieldMapper.normalizeHeader(alias);
      if (norm && !FieldMapper.ALIASES[fieldKey].includes(norm)) {
        FieldMapper.ALIASES[fieldKey].push(norm);
      }
    });
  }

  /**
   * Map row values to semantic fields based on explicit header aliases and semantic matching.
   * Resolves destination URL dynamically across variations, checks for ambiguity,
   * and tracks metadata and unknown/unmapped columns for audit logging.
   */
  static mapRow(row) {
    if (!row || typeof row !== "object") return {};
    const keys = Object.keys(row);
    const normalizedKeys = new Map();
    const usedHeaders = new Set();
    const usedNormalizedHeaders = new Set();

    // Map normalized key -> original key
    keys.forEach((k) => {
      const norm = FieldMapper.normalizeHeader(k);
      if (norm && !normalizedKeys.has(norm)) {
        normalizedKeys.set(norm, k);
      }
      const rawNorm = k.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      if (rawNorm && !normalizedKeys.has(rawNorm)) {
        normalizedKeys.set(rawNorm, k);
      }
    });

    // General field lookup: prioritizes populated matches over empty matches
    const getFieldValue = (fieldKey) => {
      const aliasList = FieldMapper.ALIASES[fieldKey] || [];
      // Pass 1: Exact alias match with VALID value
      for (const alias of aliasList) {
        const normAlias = FieldMapper.normalizeHeader(alias);
        if (normalizedKeys.has(normAlias)) {
          const rawKey = normalizedKeys.get(normAlias);
          const rawVal = row[rawKey];
          if ((fieldKey === "campaignName" || fieldKey === "adSetName") && !FieldMapper.isEntityNameCandidate(fieldKey, rawKey, rawVal)) {
            continue;
          }
          if (FieldMapper.isValueValid(rawVal)) {
            usedHeaders.add(rawKey);
            usedNormalizedHeaders.add(normAlias);
            return {
              header: rawKey,
              rawValue: rawVal,
              value: String(rawVal).trim(),
              confidence: "EXACT_ALIAS",
              isPopulated: true,
            };
          }
        }
      }

      // Pass 2: Stem / singular-plural / substring match with VALID value (e.g. Headlines <-> headline)
      for (const [normK, rawKey] of normalizedKeys.entries()) {
        if (usedHeaders.has(rawKey) || /^col_\d+$/i.test(rawKey) || rawKey.startsWith("_")) continue;
        const rawVal = row[rawKey];
        if ((fieldKey === "campaignName" || fieldKey === "adSetName") && !FieldMapper.isEntityNameCandidate(fieldKey, rawKey, rawVal)) {
          continue;
        }
        for (const alias of aliasList) {
          const normAlias = FieldMapper.normalizeHeader(alias);
          if (normAlias.length < 3) continue;

          let isStemMatch = false;
          if (fieldKey === "campaignName") {
            isStemMatch =
              normK === `${normAlias}s` ||
              normAlias === `${normK}s` ||
              (normK.includes("name") && (normK.includes("campaign") || normK.includes("camp"))) ||
              (normK.includes("title") && (normK.includes("campaign") || normK.includes("camp")));
          } else if (fieldKey === "adSetName") {
            isStemMatch =
              normK === `${normAlias}s` ||
              normAlias === `${normK}s` ||
              (normK.includes("name") && (normK.includes("adset") || normK.includes("adgroup"))) ||
              (normK.includes("title") && (normK.includes("adset") || normK.includes("adgroup")));
          } else {
            isStemMatch =
              normK === `${normAlias}s` ||
              normAlias === `${normK}s` ||
              normK === `${normAlias}es` ||
              normAlias === `${normK}es` ||
              (normK.length >= 4 && normAlias.length >= 4 && (normK.startsWith(normAlias) || normAlias.startsWith(normK)));
          }

          if (isStemMatch) {
            if (FieldMapper.isValueValid(rawVal)) {
              usedHeaders.add(rawKey);
              usedNormalizedHeaders.add(normK);
              return {
                header: rawKey,
                rawValue: rawVal,
                value: String(rawVal).trim(),
                confidence: "STEM_ALIAS",
                isPopulated: true,
              };
            }
          }
        }
      }

      // Pass 3: Exact alias match with empty/null value (records that header was present)
      for (const alias of aliasList) {
        const normAlias = FieldMapper.normalizeHeader(alias);
        if (normalizedKeys.has(normAlias)) {
          const rawKey = normalizedKeys.get(normAlias);
          if ((fieldKey === "campaignName" || fieldKey === "adSetName") && !FieldMapper.isEntityNameCandidate(fieldKey, rawKey, row[rawKey])) {
            continue;
          }
          usedHeaders.add(rawKey);
          usedNormalizedHeaders.add(normAlias);
          return {
            header: rawKey,
            rawValue: row[rawKey] ?? null,
            value: null,
            confidence: "EXACT_EMPTY",
            isPopulated: false,
          };
        }
      }

      // Pass 4: Stem match with empty/null value
      for (const [normK, rawKey] of normalizedKeys.entries()) {
        if (usedHeaders.has(rawKey) || /^col_\d+$/i.test(rawKey) || rawKey.startsWith("_")) continue;
        if ((fieldKey === "campaignName" || fieldKey === "adSetName") && !FieldMapper.isEntityNameCandidate(fieldKey, rawKey, row[rawKey])) {
          continue;
        }
        for (const alias of aliasList) {
          const normAlias = FieldMapper.normalizeHeader(alias);
          if (normAlias.length < 3) continue;

          let isStemMatch = false;
          if (fieldKey === "campaignName") {
            isStemMatch =
              normK === `${normAlias}s` ||
              normAlias === `${normK}s` ||
              (normK.includes("name") && (normK.includes("campaign") || normK.includes("camp"))) ||
              (normK.includes("title") && (normK.includes("campaign") || normK.includes("camp")));
          } else if (fieldKey === "adSetName") {
            isStemMatch =
              normK === `${normAlias}s` ||
              normAlias === `${normK}s` ||
              (normK.includes("name") && (normK.includes("adset") || normK.includes("adgroup"))) ||
              (normK.includes("title") && (normK.includes("adset") || normK.includes("adgroup")));
          } else {
            isStemMatch =
              normK === `${normAlias}s` ||
              normAlias === `${normK}s` ||
              normK.startsWith(normAlias) ||
              normAlias.startsWith(normK);
          }

          if (isStemMatch) {
            usedHeaders.add(rawKey);
            usedNormalizedHeaders.add(normK);
            return {
              header: rawKey,
              rawValue: row[rawKey] ?? null,
              value: null,
              confidence: "STEM_EMPTY",
              isPopulated: false,
            };
          }
        }
      }

      return { header: null, rawValue: null, value: null, confidence: "NONE", isPopulated: false };
    };

    // Dedicated Landing Page / Destination URL Resolver with Ambiguity Detection
    const landingCandidates = [];
    keys.forEach((k) => {
      if (FieldMapper.isLandingPageCandidate(k)) {
        landingCandidates.push(k);
        usedHeaders.add(k); // Mark as recognized landing page column so it's not categorized as unmapped
        usedNormalizedHeaders.add(FieldMapper.normalizeHeader(k));
      }
    });

    const populatedLandingCandidates = landingCandidates.filter((k) => FieldMapper.isValueValid(row[k]));
    let mappedLandingPage = { header: null, value: null, isAmbiguous: false };

    const normalizeUrlForComparison = (u) => {
      if (!u) return "";
      return String(u).trim().toLowerCase().replace(/\/+$/, "");
    };

    if (populatedLandingCandidates.length === 0) {
      const col = landingCandidates[0] || null;
      const rawVal = col ? row[col] : null;
      const colIdx = col ? keys.indexOf(col) : null;
      mappedLandingPage = {
        header: col,
        columnIndex: colIdx !== -1 ? colIdx : null,
        rawValue: rawVal,
        value: null,
        normalizedValue: null,
        isAmbiguous: false,
      };
    } else if (populatedLandingCandidates.length === 1) {
      const col = populatedLandingCandidates[0];
      const rawVal = row[col];
      const colIdx = keys.indexOf(col);
      mappedLandingPage = {
        header: col,
        columnIndex: colIdx !== -1 ? colIdx : null,
        rawValue: rawVal,
        value: String(rawVal).trim(),
        normalizedValue: normalizeUrlForComparison(rawVal),
        isAmbiguous: false,
      };
    } else {
      // Multiple candidate columns populated: check if they contain identical or conflicting URLs
      const firstNorm = normalizeUrlForComparison(row[populatedLandingCandidates[0]]);
      const allIdentical = populatedLandingCandidates.every(
        (k) => normalizeUrlForComparison(row[k]) === firstNorm
      );

      if (allIdentical) {
        const col = populatedLandingCandidates[0];
        const rawVal = row[col];
        const colIdx = keys.indexOf(col);
        mappedLandingPage = {
          header: col,
          columnIndex: colIdx !== -1 ? colIdx : null,
          rawValue: rawVal,
          value: String(rawVal).trim(),
          normalizedValue: normalizeUrlForComparison(rawVal),
          isAmbiguous: false,
          matchedColumns: populatedLandingCandidates,
        };
      } else {
        const conflictDetails = populatedLandingCandidates
          .map((k) => `"${k}": "${String(row[k]).trim()}"`)
          .join(" vs ");
        mappedLandingPage = {
          header: populatedLandingCandidates.join(" & "),
          columnIndex: keys.indexOf(populatedLandingCandidates[0]),
          rawValue: populatedLandingCandidates.map((k) => `${k}: ${row[k]}`).join(" | "),
          value: null,
          normalizedValue: null,
          isAmbiguous: true,
          conflictingColumns: populatedLandingCandidates.map((k) => ({
            header: k,
            value: String(row[k]).trim(),
          })),
          error: `Ambiguity Error: Conflicting landing page URLs found across candidate columns (${conflictDetails}).`,
        };
      }
    }

    let mappedUrlTags = getFieldValue("urlTags");
    if (!mappedUrlTags.isPopulated) {
      // Dynamic fallback: Check for individual UTM columns in the row (e.g. utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_id)
      const utmKeys = keys.filter((k) => {
        const norm = FieldMapper.normalizeHeader(k);
        return norm.startsWith("utmsource") || norm.startsWith("utmmedium") || norm.startsWith("utmcampaign") || norm.startsWith("utmcontent") || norm.startsWith("utmterm") || norm.startsWith("utmid");
      });
      const populatedUtmKeys = utmKeys.filter((k) => FieldMapper.isValueValid(row[k]));
      if (populatedUtmKeys.length > 0) {
        const parts = populatedUtmKeys.map((k) => {
          usedHeaders.add(k);
          usedNormalizedHeaders.add(FieldMapper.normalizeHeader(k));
          const cleanK = k.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
          const cleanVal = String(row[k]).trim();
          return `${cleanK}=${cleanVal}`;
        });
        const combined = parts.join("&");
        mappedUrlTags = {
          header: populatedUtmKeys.join(", "),
          rawValue: combined,
          value: combined,
          confidence: "INDIVIDUAL_UTM_COLUMNS",
          isPopulated: true,
        };
      }
    }

    // Check for pixelId candidate columns and detect any conflicting values
    const pixelCandidates = [];
    keys.forEach((k) => {
      if (k.startsWith("_") || /^col_\d+$/i.test(k) || k === "rawCells") return;
      const normK = FieldMapper.normalizeHeader(k);
      if (FieldMapper.ALIASES.pixelId.some((a) => FieldMapper.normalizeHeader(a) === normK)) {
        pixelCandidates.push(k);
      }
    });
    const populatedPixelCandidates = pixelCandidates.filter((k) => FieldMapper.isValueValid(row[k]));
    let mappedPixel = getFieldValue("pixelId");
    if (populatedPixelCandidates.length > 1) {
      const distinctVals = new Set(populatedPixelCandidates.map((k) => String(row[k]).trim()));
      if (distinctVals.size > 1) {
        mappedPixel = {
          header: populatedPixelCandidates.join(" & "),
          rawValue: populatedPixelCandidates.map((k) => `${k}: ${row[k]}`).join(" | "),
          value: null,
          isAmbiguous: true,
          conflictingColumns: populatedPixelCandidates.map((k) => ({ header: k, value: String(row[k]).trim() })),
          error: `Ambiguity Error: Conflicting Pixel IDs found across candidate columns (${Array.from(distinctVals).join(" vs ")}).`,
        };
      }
    }

    const mapped = {
      _rawHeaders: keys.filter((k) => !k.startsWith("_") && !/^col_\d+$/i.test(k)),
      _rawValues: { ...row },
      _normalizedMap: Object.fromEntries(normalizedKeys),
      campaignName: getFieldValue("campaignName"),
      adSetName: getFieldValue("adSetName"),
      headline: getFieldValue("headline"),
      primaryText: getFieldValue("primaryText"),
      description: getFieldValue("description"),
      adName: getFieldValue("adName"),
      landingPageUrl: mappedLandingPage,
      displayLink: getFieldValue("displayLink"),
      driveUrl: getFieldValue("driveUrl"),
      pixelId: mappedPixel,
      appId: getFieldValue("appId"),
      pageId: getFieldValue("pageId"),
      instagramId: getFieldValue("instagramId"),
      cta: getFieldValue("cta"),
      status: getFieldValue("status"),
      urlTags: mappedUrlTags,
    };

    // Build set of all known registered alias normalized forms
    const allKnownAliasNorms = new Set();
    Object.values(FieldMapper.ALIASES).forEach((list) => {
      (list || []).forEach((a) => {
        const n = FieldMapper.normalizeHeader(a);
        if (n) allKnownAliasNorms.add(n);
      });
    });

    // Track unmapped/unknown and metadata columns for audit report
    const unmappedColumns = [];
    const metadataColumns = [];

    keys.forEach((k) => {
      // Ignore internal keys, raw cells, and synthetic reader column index keys (e.g. col_0, col_19)
      if (k.startsWith("_") || k === "rawCells" || /^col_\d+$/i.test(k)) {
        return;
      }

      const normK = FieldMapper.normalizeHeader(k);
      // Skip if this header or its normalized variation was already mapped, or matches any known semantic field alias
      if (usedHeaders.has(k) || usedNormalizedHeaders.has(normK) || allKnownAliasNorms.has(normK)) {
        return;
      }

      const val = row[k];
      const isMetadata = FieldMapper.METADATA_HEADERS.some((m) => {
        const normM = FieldMapper.normalizeHeader(m);
        return normM === normK || normK.includes(normM);
      });

      const colInfo = {
        header: k,
        value: FieldMapper.isValueValid(val) ? String(val).trim() : "EMPTY",
      };

      if (isMetadata) {
        metadataColumns.push(colInfo);
      } else {
        unmappedColumns.push(colInfo);
      }
    });

    mapped.unmappedColumns = unmappedColumns;
    mapped.metadataColumns = metadataColumns;
    return mapped;
  }

  /**
   * Build diagnostic field-level report for dry-run tracking and audit logging.
   * Dynamically evaluates Website URL requirement based on campaign objective.
   */
  static getDiagnostics(mappedFields, rowNumber, context = {}) {
    const objective = String(context.objective || "OUTCOME_SALES").toUpperCase();
    const isWebsiteRequired = ["OUTCOME_TRAFFIC", "OUTCOME_SALES", "TRAFFIC", "SALES", "CONVERSIONS"].includes(objective);
    const isPixelRequired = ["OUTCOME_SALES", "SALES", "CONVERSIONS", "OFFSITE_CONVERSIONS"].includes(objective);
    const isAppRequired = ["APP_INSTALLS", "OUTCOME_APP_PROMOTION"].includes(objective);

    const diagnostics = [];
    const fields = [
      { key: "headline", name: "Headline", optional: true },
      { key: "primaryText", name: "Primary Text", optional: true },
      { key: "description", name: "Description", optional: true },
      { key: "landingPageUrl", name: "Website URL", optional: !isWebsiteRequired },
      { key: "displayLink", name: "Display Link", optional: true },
      { key: "driveUrl", name: "Creative Asset", optional: false },
      { key: "pixelId", name: "Pixel ID", optional: !isPixelRequired },
      { key: "appId", name: "App ID", optional: !isAppRequired },
      { key: "urlTags", name: "URL Parameters", optional: true },
    ];

    fields.forEach((f) => {
      const fieldData = mappedFields[f.key] || { header: null, value: null };
      const sourceCol = fieldData.header || "N/A";
      let sourceVal = fieldData.value !== null ? `"${String(fieldData.value).replace(/[\r\n]+/g, " ").slice(0, 100)}"` : "EMPTY";

      let status = "INCLUDED";
      let reason = "Mapped from spreadsheet row";

      if (fieldData.isAmbiguous) {
        status = "BLOCKED";
        sourceVal = "AMBIGUOUS_CONFLICT";
        reason = fieldData.error || `Ambiguity Error: Conflicting landing page URLs detected`;
      } else if (fieldData.value === null) {
        if (f.optional) {
          status = "OMITTED";
          reason = `Optional field empty for objective (${objective}), omitted from Meta payload`;
        } else {
          status = "BLOCKED";
          reason = `Required field missing for objective (${objective}), ad submission will be blocked`;
        }
      }

      diagnostics.push({
        rowNumber,
        field: f.name,
        sourceColumn: sourceCol,
        sourceValue: sourceVal,
        status,
        reason,
      });
    });

    if (mappedFields.metadataColumns && mappedFields.metadataColumns.length > 0) {
      mappedFields.metadataColumns.forEach((m) => {
        diagnostics.push({
          rowNumber,
          field: `Spreadsheet Metadata (${m.header})`,
          sourceColumn: m.header,
          sourceValue: `"${m.value}"`,
          status: "SPREADSHEET_METADATA",
          reason: "Preserved in spreadsheet metadata audit, omitted from Meta API payload",
        });
      });
    }

    if (mappedFields.unmappedColumns && mappedFields.unmappedColumns.length > 0) {
      mappedFields.unmappedColumns.forEach((u) => {
        diagnostics.push({
          rowNumber,
          field: `Unknown Column (${u.header})`,
          sourceColumn: u.header,
          sourceValue: `"${u.value}"`,
          status: "UNMAPPED_AUDIT",
          reason: "Preserved in audit log, omitted from Meta API payload",
        });
      });
    }

    return diagnostics;
  }

  /**
   * Build comprehensive dynamic mapping report with confidence, raw values, and status
   */
  static getDynamicMappingReport(mappedFields, rowNumber, context = {}) {
    const objective = String(context.objective || "OUTCOME_SALES").toUpperCase();
    const isWebsiteRequired = ["OUTCOME_TRAFFIC", "OUTCOME_SALES", "TRAFFIC", "SALES", "CONVERSIONS"].includes(objective);
    const isPixelRequired = ["OUTCOME_SALES", "SALES", "CONVERSIONS", "OFFSITE_CONVERSIONS"].includes(objective);
    const isAppRequired = ["APP_INSTALLS", "OUTCOME_APP_PROMOTION"].includes(objective);

    const report = [];
    const fields = [
      { key: "campaignName", label: "Campaign Name", required: false },
      { key: "adSetName", label: "Ad Set Name", required: false },
      { key: "adName", label: "Ad Name", required: false },
      { key: "headline", label: "Headline", required: false },
      { key: "primaryText", label: "Primary Text", required: false },
      { key: "description", label: "Description", required: false },
      { key: "landingPageUrl", label: "Destination URL", required: isWebsiteRequired },
      { key: "displayLink", label: "Display Link", required: false },
      { key: "driveUrl", label: "Creative Media", required: true },
      { key: "pixelId", label: "Pixel ID", required: isPixelRequired },
      { key: "appId", label: "App ID", required: isAppRequired },
      { key: "urlTags", label: "URL Parameters", required: false },
    ];

    fields.forEach((f) => {
      const fieldData = mappedFields[f.key] || { header: null, rawValue: null, value: null, confidence: "NONE" };
      const isPresent = Boolean(fieldData.value);
      let status = isPresent ? "MAPPED" : (f.required ? "MISSING_REQUIRED" : "OMITTED_OPTIONAL");
      let action = isPresent ? "Include in Meta API payload" : (f.required ? "Blocks ad creation" : "Omitted from payload (permitted)");

      if (fieldData.isAmbiguous) {
        status = "AMBIGUOUS";
        action = "Blocks ad creation due to column conflict";
      }

      report.push({
        rowNumber,
        fieldKey: f.key,
        fieldLabel: f.label,
        resolvedField: f.label,
        sourceHeader: fieldData.header || "(Header Not Found)",
        rawValue: fieldData.rawValue !== undefined && fieldData.rawValue !== null ? String(fieldData.rawValue).replace(/[\r\n]+/g, " ").trim() : "",
        mappedValue: fieldData.value !== undefined && fieldData.value !== null ? String(fieldData.value).replace(/[\r\n]+/g, " ").trim() : null,
        confidence: fieldData.confidence || "NONE",
        isRequired: f.required,
        status,
        action,
      });
    });

    return report;
  }
}

export default FieldMapper;
