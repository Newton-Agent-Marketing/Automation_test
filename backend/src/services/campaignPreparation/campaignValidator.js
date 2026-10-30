import { FieldMapper, cleanPageId } from "../data/fieldMapper.js";
import { MediaAssetResolver } from "../data/mediaAssetResolver.js";
import { CampaignRouter } from "../data/campaignRouter.js";
import driveService from "../../google/driveService.js";

export class CampaignValidator {
  /**
   * Helper to extract a field value from a row using FieldMapper aliases
   */
  static getFieldValue(rowValues, fieldKey, customDefault = null) {
    if (!rowValues || typeof rowValues !== "object") return customDefault;
    const aliases = FieldMapper.ALIASES[fieldKey] || [fieldKey];
    const keys = Object.keys(rowValues);

    for (const a of aliases) {
      const aNorm = FieldMapper.normalizeHeader(a);
      for (const k of keys) {
        const kNorm = FieldMapper.normalizeHeader(k);
        if (kNorm === aNorm && FieldMapper.isValueValid(rowValues[k])) {
          return rowValues[k];
        }
      }
    }

    // Pattern fallback
    for (const a of aliases) {
      const aNorm = FieldMapper.normalizeHeader(a);
      if (aNorm.length < 3) continue;
      for (const k of keys) {
        const kNorm = FieldMapper.normalizeHeader(k);
        if (kNorm.includes(aNorm) && FieldMapper.isValueValid(rowValues[k])) {
          return rowValues[k];
        }
      }
    }

    return customDefault;
  }

  /**
   * Validate entire preparation dataset across Campaign, Ad Set, Ad, Media, and Account levels
   */
  static async validate({
    campaignName = "",
    adSetName = "",
    metaAccountId = null,
    accountDoc = null,
    sourceData = {},
    userAnswers = {},
    contextNodeData = {},
    adNamePattern = null,
  } = {}) {
    const { headers = [], rows = [], totalRows = 0, sourceType = "google_sheets", sheetUrl = null } = sourceData;

    const campaignIssues = [];
    const adSetIssues = [];
    const adIssues = [];
    const mediaIssues = [];
    const missingFieldsMap = new Map();

    const firstRowValues = rows[0]?.values || {};

    const detectedAppId = userAnswers.appId || userAnswers.app_id || this.getFieldValue(firstRowValues, "appId");
    const detectedStoreUrl = userAnswers.objectStoreUrl || userAnswers.object_store_url || this.getFieldValue(firstRowValues, "objectStoreUrl");
    const detectedPixelId = userAnswers.pixelId || userAnswers.pixel_id || userAnswers.dataset_id || this.getFieldValue(firstRowValues, "pixelId");
    const detectedLandingUrl = userAnswers.landingPageUrl || userAnswers.landing_page_url || userAnswers.website_url || this.getFieldValue(firstRowValues, "landingPageUrl") || contextNodeData?.productUrl;

    // 1. Detect Campaign Type: WEBSITE vs APP_PROMOTION
    const explicitCampType = userAnswers.campaignType || this.getFieldValue(firstRowValues, "campaignType");
    let explicitObjective = userAnswers.objective || this.getFieldValue(firstRowValues, "objective");

    if (!explicitObjective && contextNodeData?.funnelEvent) {
      const fEvent = String(contextNodeData.funnelEvent).toLowerCase();
      if (fEvent.includes("purchase") || fEvent.includes("sale") || fEvent.includes("ecom")) {
        explicitObjective = "OUTCOME_SALES";
      } else if (fEvent.includes("lead")) {
        explicitObjective = "OUTCOME_LEADS";
      } else if (fEvent.includes("traffic") || fEvent.includes("click")) {
        explicitObjective = "OUTCOME_TRAFFIC";
      } else if (fEvent.includes("app") || fEvent.includes("install")) {
        explicitObjective = "OUTCOME_APP_PROMOTION";
      }
    }

    let isAppPromotion = false;
    if (explicitCampType) {
      const norm = String(explicitCampType).toUpperCase().trim();
      isAppPromotion = norm === "APP_PROMOTION" || norm === "APP" || norm === "MOBILE_APP" || norm === "APP_INSTALLS";
    } else if (explicitObjective) {
      isAppPromotion = String(explicitObjective).toUpperCase().includes("APP");
    } else if (detectedStoreUrl && (CampaignRouter.isAppStoreUrl(detectedStoreUrl) || String(detectedStoreUrl).includes("play.google.com") || String(detectedStoreUrl).includes("apps.apple.com"))) {
      isAppPromotion = true;
    } else if (detectedPixelId || (detectedLandingUrl && !CampaignRouter.isAppStoreUrl(detectedLandingUrl))) {
      // Has website pixel or website landing URL and NO app store URL -> Website campaign
      isAppPromotion = false;
    } else if (detectedAppId && !detectedPixelId) {
      isAppPromotion = true;
    }

    const campaignType = isAppPromotion ? "APP_PROMOTION" : "WEBSITE";

    // 2. CAMPAIGN LEVEL VALIDATION
    const effectiveCampName = (campaignName || userAnswers.campaignName || this.getFieldValue(firstRowValues, "campaignName") || "").trim();
    if (!effectiveCampName || effectiveCampName.length < 2) {
      campaignIssues.push({
        field: "campaign_name",
        message: "Campaign name is missing or too short.",
        blocking: true,
      });
      missingFieldsMap.set("campaign.campaign_name", {
        id: "campaign_name",
        level: "campaign",
        field: "campaign_name",
        label: "Campaign Name",
        description: "Specify the name for your Meta Ads campaign.",
        affectedRows: [],
        currentValue: null,
        options: [],
        resolved: false,
      });
    }

    let objective =
      userAnswers.objective ||
      this.getFieldValue(firstRowValues, "objective") ||
      (isAppPromotion ? "OUTCOME_APP_PROMOTION" : "OUTCOME_SALES");

    const validObjectives = [
      "OUTCOME_SALES",
      "OUTCOME_LEADS",
      "OUTCOME_TRAFFIC",
      "OUTCOME_ENGAGEMENT",
      "OUTCOME_AWARENESS",
      "OUTCOME_APP_PROMOTION",
    ];

    if (!validObjectives.includes(objective)) {
      campaignIssues.push({
        field: "objective",
        message: `Invalid objective "${objective}". Must be one of ${validObjectives.join(", ")}.`,
        blocking: true,
      });
      missingFieldsMap.set("campaign.objective", {
        id: "objective",
        level: "campaign",
        field: "objective",
        label: "Campaign Objective",
        description: "Select the marketing objective for this campaign.",
        affectedRows: [],
        currentValue: objective,
        options: validObjectives,
        resolved: false,
      });
    }

    // Check Budget Configuration (CBO vs ABO)
    const rawCampBudget =
      userAnswers.campaignBudget ||
      userAnswers.budget ||
      userAnswers.dailyBudget ||
      userAnswers.daily_budget ||
      this.getFieldValue(firstRowValues, "campaign_budget") ||
      this.getFieldValue(firstRowValues, "daily_budget") ||
      this.getFieldValue(firstRowValues, "budget");

    const parsedCampBudget = rawCampBudget ? Number(String(rawCampBudget).replace(/[^0-9.]/g, "")) : null;
    const isCBO = Boolean(parsedCampBudget && !isNaN(parsedCampBudget) && parsedCampBudget > 0);

    // Special Ad Categories
    const specialAdCategory = userAnswers.specialAdCategory || firstRowValues.special_ad_category || "NONE";

    // 3. AD SET LEVEL VALIDATION
    const effectiveAdSetName = (adSetName || userAnswers.adSetName || userAnswers.adset_name || this.getFieldValue(firstRowValues, "adSetName") || "").trim();
    if (!effectiveAdSetName || effectiveAdSetName.length < 2) {
      adSetIssues.push({
        field: "adset_name",
        message: "Ad set name is missing or ambiguous.",
        blocking: true,
      });
      missingFieldsMap.set("adset.adset_name", {
        id: "adset_name",
        level: "adset",
        field: "adset_name",
        label: "Ad Set Name",
        description: "Specify the ad set title for this audience and placement setup.",
        affectedRows: [],
        currentValue: null,
        options: [],
        resolved: false,
      });
    }

    // Budget check: If NOT CBO, require Ad Set budget (ABO)
    const rawAdSetBudget =
      userAnswers.adSetBudget ||
      userAnswers.budget ||
      userAnswers.dailyBudget ||
      userAnswers.daily_budget ||
      this.getFieldValue(firstRowValues, "adset_daily_budget") ||
      this.getFieldValue(firstRowValues, "adset_budget") ||
      this.getFieldValue(firstRowValues, "daily_budget");
    const parsedAdSetBudget = rawAdSetBudget ? Number(String(rawAdSetBudget).replace(/[^0-9.]/g, "")) : null;

    if (!isCBO && (!parsedAdSetBudget || isNaN(parsedAdSetBudget) || parsedAdSetBudget <= 0)) {
      adSetIssues.push({
        field: "daily_budget",
        message: "Daily budget is required at either the Campaign level (CBO) or Ad Set level (ABO).",
        blocking: true,
      });
      missingFieldsMap.set("adset.daily_budget", {
        id: "daily_budget",
        level: "adset",
        field: "daily_budget",
        label: "Daily Budget (INR)",
        description: "Specify daily ad spend budget (e.g. ₹500, ₹1000).",
        affectedRows: [],
        currentValue: null,
        options: ["500", "1000", "2000", "5000"],
        resolved: false,
      });
    }

    let appId = null;
    let storeUrl = null;
    let pixelId = null;

    // App Promotion Specific Checks
    if (isAppPromotion) {
      appId = userAnswers.appId || this.getFieldValue(firstRowValues, "appId");
      storeUrl = userAnswers.objectStoreUrl || this.getFieldValue(firstRowValues, "objectStoreUrl");

      let isStoreUrlValid =
        storeUrl &&
        (storeUrl.includes("play.google.com/store/apps") ||
          storeUrl.includes("apps.apple.com") ||
          storeUrl.includes("itunes.apple.com"));

      let isAppIdValid = appId && /^\d{10,20}$/.test(String(appId).trim());

      const token = accountDoc?.accessToken || accountDoc?.oauthToken;
      // Auto-resolve via Meta Graph API if storeUrl is missing/invalid, or appId is missing/invalid, or both
      if ((!isStoreUrlValid || !isAppIdValid) && token) {
        try {
          const { MetaApiService } = await import("../meta/metaApiService.js");
          const appRes = await MetaApiService.verifyAndResolveAppAsset({
            accountId: metaAccountId || accountDoc?.accountId,
            accessToken: token,
            requestedAppId: isAppIdValid ? appId : null,
            requestedStoreUrl: isStoreUrlValid ? storeUrl : null,
            objective: "OUTCOME_APP_PROMOTION",
          });
          if (appRes && appRes.valid) {
            if (appRes.resolvedStoreUrl) {
              storeUrl = appRes.resolvedStoreUrl;
              isStoreUrlValid = true;
            }
            if (appRes.appId) {
              appId = appRes.appId;
              isAppIdValid = true;
            }
          }
        } catch (e) {
          // ignore auto-discovery error
        }
      }

      if (!isAppIdValid) {
        adSetIssues.push({
          field: "app_id",
          message: "Meta App ID (numeric 10-20 digits) is required for App Promotion campaigns.",
          blocking: true,
        });
        missingFieldsMap.set("adset.app_id", {
          id: "app_id",
          level: "adset",
          field: "app_id",
          label: "Meta Application ID",
          description: "Enter your 10-20 digit numeric Meta App ID registered in Meta App Dashboard.",
          affectedRows: [],
          currentValue: appId || null,
          options: [],
          resolved: false,
        });
      }

      if (!isStoreUrlValid) {
        adSetIssues.push({
          field: "object_store_url",
          message: "Valid Google Play Store or Apple App Store URL is required for App Promotion campaigns.",
          blocking: true,
        });
        missingFieldsMap.set("adset.object_store_url", {
          id: "object_store_url",
          level: "adset",
          field: "object_store_url",
          label: "App Store Destination URL",
          description: "Provide the Google Play Store or Apple App Store URL for the app.",
          affectedRows: [],
          currentValue: storeUrl || null,
          options: [],
          resolved: false,
        });
      }
    } else {
      // Website Campaign Specific Checks
      pixelId = userAnswers.pixelId || userAnswers.pixel_id || userAnswers.dataset_id || this.getFieldValue(firstRowValues, "pixelId");
      const requiresPixel = objective === "OUTCOME_SALES" || objective === "OUTCOME_LEADS";
      if (requiresPixel && (!pixelId || !/^\d{10,20}$/.test(String(pixelId).trim()))) {
        adSetIssues.push({
          field: "pixel_id",
          message: "Meta Pixel or Dataset ID is required for conversion optimization.",
          blocking: true,
        });
        missingFieldsMap.set("adset.pixel_id", {
          id: "pixel_id",
          level: "adset",
          field: "pixel_id",
          label: "Meta Pixel / Dataset ID",
          description: "Enter the Meta Pixel ID or Dataset ID for conversion tracking.",
          affectedRows: [],
          currentValue: pixelId || null,
          options: [],
          resolved: false,
        });
      }
    }

    // Performance Goal / Optimization Goal & Billing Event
    const rawOptimizationGoal =
      userAnswers.optimizationGoal ||
      userAnswers.performanceGoal ||
      this.getFieldValue(firstRowValues, "optimizationGoal") ||
      this.getFieldValue(firstRowValues, "optimization_goal") ||
      firstRowValues.performance_goal ||
      firstRowValues["Performance goal"] ||
      firstRowValues["Performance Goal"] ||
      null;

    let isBusinessVerified = false;
    const token = accountDoc?.accessToken || accountDoc?.oauthToken;
    const targetAccId = metaAccountId || contextNodeData?.adAccountId || accountDoc?.accountId;
    if (targetAccId && token && !isAppPromotion) {
      try {
        const { MetaApiService } = await import("../meta/metaApiService.js");
        isBusinessVerified = await MetaApiService.isAccountBusinessVerified(targetAccId, token);
      } catch (_) {}
    }

    let optimizationGoal = isAppPromotion ? "APP_INSTALLS" : (isBusinessVerified ? "VALUE" : "OFFSITE_CONVERSIONS");
    if (rawOptimizationGoal) {
      const g = String(rawOptimizationGoal).trim().toUpperCase();
      if (g.includes("CONVERSION") && !g.includes("VALUE")) {
        optimizationGoal = "OFFSITE_CONVERSIONS";
      } else if (g === "APP_INSTALLS" || g.includes("APP_INSTALL")) {
        optimizationGoal = "APP_INSTALLS";
      } else if (g.includes("CLICK")) {
        optimizationGoal = "LINK_CLICKS";
      } else if (g.includes("LANDING") || g.includes("VIEW")) {
        optimizationGoal = "LANDING_PAGE_VIEWS";
      } else if (g.includes("VALUE")) {
        optimizationGoal = isBusinessVerified ? "VALUE" : "OFFSITE_CONVERSIONS";
      } else {
        optimizationGoal = isAppPromotion ? "APP_INSTALLS" : (isBusinessVerified ? "VALUE" : "OFFSITE_CONVERSIONS");
      }
    }

    const billingEvent =
      userAnswers.billingEvent ||
      this.getFieldValue(firstRowValues, "billing_event") ||
      "IMPRESSIONS";

    // 4. AD LEVEL & MEDIA VALIDATION (Per Row)
    const adLevelRows = [];
    const missingPageRows = [];
    const missingTextRows = [];
    const missingMediaRows = [];
    const missingHeadlineRows = [];
    const missingDestinationRows = [];
    const missingDisplayLinkRows = [];

    const hasDisplayLinkHeader =
      headers.some((h) => /display\s*link|displaylink/i.test(String(h).trim())) ||
      Object.keys(firstRowValues).some((k) => /display\s*link|displaylink/i.test(String(k).trim()));

    console.log("\n📋 [CAMPAIGN PREFLIGHT VALIDATOR ➔ AI CONTEXT NODE FUSION]");
    console.log(`   Ad Account Target  : ${targetAccId || "(None)"} (Source: ${metaAccountId ? "Parameter" : (contextNodeData?.adAccountId ? "AI Context Ad Channel Node" : "Default")})`);
    console.log(`   Objective          : ${objective} (Source: ${isAppPromotion ? "App Promotion" : (contextNodeData?.funnelEvent ? `Funnel Event "${contextNodeData.funnelEvent}"` : "Default Sales")})`);
    console.log(`   Product Landing URL: ${contextNodeData?.productUrl || "(None)"} (From Product Node)`);
    console.log(`   Product Name       : ${contextNodeData?.productName || "(None)"} (From Product Node)`);
    console.log(`   Brief Target Goals : ${contextNodeData?.briefName || "(None)"} (From Marketing Brief Node)\n`);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNo = r.rowNumber || i + 2;
      const vals = r.values || {};

      let evaluatedCustomName = null;
      if (adNamePattern) {
        const { DynamicSheetFilter } = await import("../data/dynamicSheetFilter.js");
        evaluatedCustomName = DynamicSheetFilter.evaluateAdNamePattern(adNamePattern, vals, headers, rowNo);
      }

      let adName = evaluatedCustomName;
      if (!adName) {
        const rawAdName =
          this.getFieldValue(vals, "adName") ||
          `Ad Row #${rowNo}`;

        const rawPujaDate =
          this.getFieldValue(vals, "pujaDate") ||
          vals["Puja Date"] ||
          vals["puja date"] ||
          vals["PUJA DATE"] ||
          vals["Puja_Date"] ||
          vals["puja_date"] ||
          vals["Tithi Date"] ||
          vals["tithi date"] ||
          vals["Tithi"] ||
          vals["tithi"] ||
          vals["Date"] ||
          vals["date"];

        adName = rawAdName;
        if (rawPujaDate && String(rawPujaDate).trim()) {
          const cleanDate = String(rawPujaDate).trim();
          const rawTithi = vals["Puja Tithi"] || vals["puja_tithi"] || vals["Tithi"] || vals["tithi"];
          const prefix = rawTithi && String(rawTithi).trim() && !cleanDate.includes(String(rawTithi).trim())
            ? `${cleanDate} ${String(rawTithi).trim()}`
            : cleanDate;

          if (!rawAdName.startsWith(prefix) && !rawAdName.startsWith(cleanDate)) {
            adName = `${prefix} - ${rawAdName}`;
          }
        }
      }

      const rawPageId =
        userAnswers.pageId ||
        userAnswers.page_id ||
        this.getFieldValue(vals, "pageId") ||
        contextNodeData?.pageId ||
        accountDoc?.pageId;

      const pageId = cleanPageId(rawPageId);

      if (!pageId || !/^\d{5,25}$/.test(pageId)) {
        missingPageRows.push(rowNo);
        adIssues.push({
          rowNumber: rowNo,
          adName,
          field: "page_id",
          message: "Facebook Page ID is missing or invalid.",
          blocking: true,
        });
      }

      const primaryText =
        userAnswers.primaryText ||
        userAnswers.primary_text ||
        this.getFieldValue(vals, "primaryText") ||
        contextNodeData?.briefName ||
        contextNodeData?.productName ||
        (contextNodeData?.metricsList?.length ? `Special Promotion - ${contextNodeData.metricsList.join(", ")}` : "");

      if (!primaryText || String(primaryText).trim().length < 5) {
        missingTextRows.push(rowNo);
        adIssues.push({
          rowNumber: rowNo,
          adName,
          field: "primary_text",
          message: "Primary text / ad copy is missing.",
          blocking: true,
        });
      }

      const headline =
        userAnswers.headline ||
        this.getFieldValue(vals, "headline") ||
        (contextNodeData?.productName ? `${contextNodeData.productName} - Special Offer` : "");

      if (!headline || String(headline).trim().length < 2) {
        missingHeadlineRows.push(rowNo);
        adIssues.push({
          rowNumber: rowNo,
          adName,
          field: "headline",
          message: "Headline is missing.",
          blocking: true,
        });
      }

      let destination = "";
      if (isAppPromotion) {
        const rowStore = this.getFieldValue(vals, "objectStoreUrl");
        const isRowValid = rowStore && (rowStore.includes("play.google.com") || rowStore.includes("apple.com"));
        destination =
          userAnswers.objectStoreUrl ||
          userAnswers.object_store_url ||
          (isRowValid ? rowStore : null) ||
          storeUrl;
      } else {
        destination =
          userAnswers.landingPageUrl ||
          userAnswers.landing_page_url ||
          userAnswers.website_url ||
          this.getFieldValue(vals, "landingPageUrl") ||
          contextNodeData?.productUrl ||
          contextNodeData?.products?.[0]?.url;
      }

      if (!destination || !destination.startsWith("http")) {
        missingDestinationRows.push(rowNo);
        adIssues.push({
          rowNumber: rowNo,
          adName,
          field: isAppPromotion ? "object_store_url" : "landing_page_url",
          message: `${isAppPromotion ? "App Store URL" : "Landing page URL"} is missing or invalid.`,
          blocking: true,
        });
      }

      // Creative Media Inspection
      const creativeTypeRaw =
        this.getFieldValue(vals, "creative_type") ||
        (vals.google_drive_video_url || vals.video_url ? "VIDEO" : "IMAGE");
      const creativeType = String(creativeTypeRaw).toUpperCase().includes("VID") ? "VIDEO" : "IMAGE";

      const driveUrls = MediaAssetResolver.extractRowDriveUrls(vals);
      const directImageUrl = vals.image_url || vals.imageUrl || vals.creative_url || vals.creativeUrl;
      const directVideoUrl = vals.google_drive_video_url || vals.video_url;
      const mediaRef =
        driveUrls[0] ||
        this.getFieldValue(vals, "driveUrl") ||
        directImageUrl ||
        directVideoUrl ||
        null;

      let mediaStatus = "VALID";
      let resolvedDriveAssets = [];

      if (!mediaRef) {
        missingMediaRows.push(rowNo);
        mediaIssues.push({
          rowNumber: rowNo,
          url: "N/A",
          message: "No creative media URL (Google Drive link or direct media URL) specified.",
          blocking: true,
        });
      } else if (typeof mediaRef === "string" && (mediaRef.includes("drive.google.com") || mediaRef.includes("docs.google.com"))) {
        // Test Google Drive accessibility
        const fileId = driveService.extractFileId(mediaRef);
        if (!fileId) {
          mediaIssues.push({
            rowNumber: rowNo,
            url: mediaRef,
            message: "Invalid Google Drive link format.",
            blocking: true,
          });
        } else {
          try {
            let meta = null;
            try {
              meta = await driveService.getFileMetadata(fileId);
            } catch (mErr) {}

            const isFolder = mediaRef.includes("/folders/") || meta?.mimeType === "application/vnd.google-apps.folder";

            if (isFolder) {
              const folderItems = await driveService.listFolderContents(fileId);
              const validMedia = (folderItems || []).filter((item) => item.isImage || item.isVideo);
              if (!validMedia || validMedia.length === 0) {
                mediaIssues.push({
                  rowNumber: rowNo,
                  url: mediaRef,
                  message: "Google Drive folder is empty or contains no supported image/video creative files.",
                  blocking: true,
                });
              } else {
                resolvedDriveAssets = validMedia;
              }
            } else {
              // Single file check: inspect metadata to auto-detect video vs image
              let detectedType = creativeType;
              if (meta?.mimeType?.startsWith("video/") || /\.(mp4|mov|avi|webm|m4v|mkv)$/i.test(meta?.name || "")) {
                detectedType = "VIDEO";
              } else if (meta?.mimeType?.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(meta?.name || "")) {
                detectedType = "IMAGE";
              }
              resolvedDriveAssets = [{ fileId, url: mediaRef, type: detectedType, name: meta?.name }];
            }
          } catch (driveErr) {
            mediaIssues.push({
              rowNumber: rowNo,
              url: mediaRef,
              message: `Inaccessible Google Drive asset: ${driveErr.message}. Please check folder/file sharing permissions.`,
              blocking: true,
            });
          }
        }
      } else {
        // Direct image or video URL check
        const directIsVid = /\.(mp4|mov|avi|webm|m4v|mkv)($|\?)/i.test(mediaRef);
        resolvedDriveAssets = [{ url: mediaRef, type: directIsVid ? "VIDEO" : creativeType }];
      }

      const rowAppId =
        this.getFieldValue(vals, "appId") ||
        vals.app_id ||
        vals.appid ||
        userAnswers.appId ||
        firstRowValues.app_id ||
        null;

      const rowInstagramId =
        this.getFieldValue(vals, "instagramId") ||
        vals.instagram_user_id ||
        vals.instagram_id ||
        userAnswers.instagramId ||
        firstRowValues.instagram_user_id ||
        null;

      const rowDisplayLink = (() => {
        const raw =
          userAnswers?.displayLink ||
          userAnswers?.display_link ||
          this.getFieldValue(vals, "displayLink") ||
          vals.display_link ||
          vals["Display link"] ||
          vals["Display Link"] ||
          vals["display link"] ||
          vals.displayLink ||
          null;
        return raw ? String(raw).trim() : "";
      })();

      if (hasDisplayLinkHeader && !rowDisplayLink && !isAppPromotion) {
        missingDisplayLinkRows.push(rowNo);
        adIssues.push({
          rowNumber: rowNo,
          adName,
          field: "display_link",
          message: "Display Link is missing.",
          blocking: true,
        });
      }

      adLevelRows.push({
        sourceRow: rowNo,
        adName,
        pageId,
        instagramId: rowInstagramId,
        appId: rowAppId,
        pixelId: pixelId || this.getFieldValue(vals, "pixelId") || vals.pixel_id || null,
        creativeType: resolvedDriveAssets[0]?.type || creativeType,
        creative: mediaRef,
        resolvedDriveAssets,
        primaryText,
        headline,
        description: this.getFieldValue(vals, "description") || "",
        destination,
        displayLink: rowDisplayLink,
        urlTags: (() => {
          const raw =
            this.getFieldValue(vals, "urlTags") ||
            vals.url_parameter ||
            vals["URL Parameter"] ||
            vals["URL Parameters"] ||
            vals.url_tags ||
            vals.url_parameters ||
            null;
          return raw ? String(raw).trim().replace(/^\?/, "") : null;
        })(),
        cta: this.getFieldValue(vals, "cta") || (isAppPromotion ? "DOWNLOAD" : "BOOK_NOW"),
        status: adIssues.some((issue) => issue.rowNumber === rowNo) ? "INVALID" : "READY",
      });
    }

    // Aggregate Missing Fields
    if (missingPageRows.length > 0) {
      missingFieldsMap.set("ad.page_id", {
        id: "page_id",
        level: "ad",
        field: "page_id",
        label: "Facebook Page ID",
        description: "Specify the Facebook Page ID to represent your ads.",
        affectedRows: missingPageRows,
        currentValue: null,
        options: [],
        resolved: false,
      });
    }

    if (missingTextRows.length > 0) {
      missingFieldsMap.set("ad.primary_text", {
        id: "primary_text",
        level: "ad",
        field: "primary_text",
        label: "Primary Text (Ad Copy)",
        description: "Provide the promotional body copy for the ads.",
        affectedRows: missingTextRows,
        currentValue: null,
        options: [],
        resolved: false,
      });
    }

    if (missingHeadlineRows.length > 0) {
      missingFieldsMap.set("ad.headline", {
        id: "headline",
        level: "ad",
        field: "headline",
        label: "Ad Headline",
        description: "Provide the headline text for the ads.",
        affectedRows: missingHeadlineRows,
        currentValue: null,
        options: [],
        resolved: false,
      });
    }

    if (missingMediaRows.length > 0) {
      missingFieldsMap.set("ad.creative_url", {
        id: "creative_url",
        level: "ad",
        field: "creative_url",
        label: "Creative Media URL / Drive Link",
        description: "Provide accessible Google Drive links or media URLs for the creatives.",
        affectedRows: missingMediaRows,
        currentValue: null,
        options: [],
        resolved: false,
      });
    }

    if (missingDestinationRows.length > 0) {
      missingFieldsMap.set(isAppPromotion ? "ad.object_store_url" : "ad.landing_page_url", {
        id: isAppPromotion ? "object_store_url" : "landing_page_url",
        level: "ad",
        field: isAppPromotion ? "object_store_url" : "landing_page_url",
        label: isAppPromotion ? "App Store Destination URL" : "Landing Page / Website URL",
        description: isAppPromotion
          ? "Provide a valid Google Play Store or Apple App Store URL."
          : "Provide the website destination URL for your ads.",
        affectedRows: missingDestinationRows,
        currentValue: null,
        options: [],
        resolved: false,
      });
    }

    if (missingDisplayLinkRows.length > 0) {
      missingFieldsMap.set("ad.display_link", {
        id: "display_link",
        level: "ad",
        field: "display_link",
        label: "Display Link",
        description: "Provide the display link (vanity URL, e.g. example.com) shown on your ad.",
        affectedRows: missingDisplayLinkRows,
        currentValue: null,
        options: [],
        resolved: false,
      });
    }

    // 5. META ACCOUNT PERMISSIONS
    const hasAccountDoc = Boolean(metaAccountId || accountDoc);
    const accountStatus = hasAccountDoc ? "Valid" : "Action required: Connect Meta Ad Account in Channels";
    if (!hasAccountDoc) {
      campaignIssues.push({
        field: "meta_account",
        message: "No connected Meta Ad Account detected. Please connect Meta Ads in Marketing Channels.",
        blocking: true,
      });
    }

    const blockingCount =
      campaignIssues.filter((i) => i.blocking).length +
      adSetIssues.filter((i) => i.blocking).length +
      adIssues.filter((i) => i.blocking).length +
      mediaIssues.filter((i) => i.blocking).length;

    const warningCount =
      campaignIssues.filter((i) => !i.blocking).length +
      adSetIssues.filter((i) => !i.blocking).length +
      adIssues.filter((i) => !i.blocking).length +
      mediaIssues.filter((i) => !i.blocking).length;

    // 6. BUILD SUMMARY TABLE
    const summaryTable = [
      {
        item: "Campaign name",
        result: effectiveCampName ? "Valid" : "Missing fields",
        status: effectiveCampName ? "valid" : "error",
      },
      {
        item: "Ad set name",
        result: effectiveAdSetName ? "Valid" : "Missing fields",
        status: effectiveAdSetName ? "valid" : "error",
      },
      {
        item: "Source sheet",
        result: sourceData.spreadsheetName ? `Connected (${sourceData.spreadsheetName})` : "Connected",
        status: "valid",
      },
      {
        item: "Total rows inspected",
        result: `${totalRows || rows.length} rows`,
        status: "valid",
      },
      {
        item: "Eligible ad rows",
        result: `${rows.length} rows`,
        status: rows.length > 0 ? "valid" : "warning",
      },
      {
        item: "Campaign fields",
        result: campaignIssues.length === 0 ? "Valid" : `Missing fields (${campaignIssues.length})`,
        status: campaignIssues.length === 0 ? "valid" : "error",
      },
      {
        item: "Ad set fields",
        result: adSetIssues.length === 0 ? "Valid" : `Missing fields (${adSetIssues.length})`,
        status: adSetIssues.length === 0 ? "valid" : "error",
      },
      {
        item: "Ad fields",
        result: adIssues.length === 0 ? "Valid" : `Missing fields (${adIssues.length})`,
        status: adIssues.length === 0 ? "valid" : "error",
      },
      {
        item: "Creative media",
        result: mediaIssues.length === 0 ? "Valid" : `Failed access / Missing (${mediaIssues.length})`,
        status: mediaIssues.length === 0 ? "valid" : "error",
      },
      {
        item: "Tracking configuration",
        result:
          isAppPromotion || (firstRowValues.pixel_id || userAnswers.pixelId)
            ? "Valid"
            : "Missing fields (Pixel/Dataset ID required)",
        status:
          isAppPromotion || (firstRowValues.pixel_id || userAnswers.pixelId) ? "valid" : "error",
      },
      {
        item: "Meta account permissions",
        result: accountStatus,
        status: hasAccountDoc ? "valid" : "action_required",
      },
    ];

    const missingFields = Array.from(missingFieldsMap.values());

    return {
      isValid: blockingCount === 0,
      blockingCount,
      warningCount,
      campaignType,
      campaignName: effectiveCampName,
      adSetName: effectiveAdSetName,
      objective,
      isCBO,
      budget: parsedCampBudget || parsedAdSetBudget || 1000,
      optimizationGoal,
      isBusinessVerified,
      billingEvent,
      specialAdCategory,
      summaryTable,
      campaignIssues,
      adSetIssues,
      adIssues,
      mediaIssues,
      missingFields,
      adLevelRows,
      appId: appId || userAnswers.appId || this.getFieldValue(firstRowValues, "appId") || firstRowValues.app_id || null,
      objectStoreUrl: isAppPromotion ? storeUrl : null,
      pixelId: pixelId || (!isAppPromotion ? (firstRowValues.pixel_id || userAnswers.pixelId) : null),
    };
  }

  /**
   * Format the validation report into readable Markdown as specified in Requirement 4
   */
  static formatReportMarkdown(validationResult) {
    const { summaryTable, campaignIssues, adSetIssues, adIssues, mediaIssues, blockingCount } =
      validationResult;

    let md = `### 📋 Campaign Preparation Report\n\n`;
    md += `| Validation Item | Result |\n`;
    md += `|---|---|\n`;

    summaryTable.forEach((row) => {
      md += `| ${row.item} | ${row.result} |\n`;
    });

    if (blockingCount > 0) {
      md += `\n> ⚠️ **Attention Needed**: Found **${blockingCount} blocking issues** that must be resolved before campaign creation can be authorized.\n\n`;

      if (campaignIssues.length > 0) {
        md += `#### 🔴 Campaign Level Issues\n`;
        campaignIssues.forEach((iss) => {
          md += `- **${iss.field}**: ${iss.message}\n`;
        });
        md += `\n`;
      }

      if (adSetIssues.length > 0) {
        md += `#### 🔴 Ad Set Level Issues\n`;
        adSetIssues.forEach((iss) => {
          md += `- **${iss.field}**: ${iss.message}\n`;
        });
        md += `\n`;
      }

      if (adIssues.length > 0) {
        md += `#### 🔴 Ad Level Issues\n`;
        // Group by field
        const byField = {};
        adIssues.forEach((iss) => {
          if (!byField[iss.field]) byField[iss.field] = [];
          byField[iss.field].push(iss.rowNumber);
        });
        Object.entries(byField).forEach(([field, rows]) => {
          md += `- **${field}**: Missing or invalid for Row(s) ${rows.map((r) => `#${r}`).join(", ")}\n`;
        });
        md += `\n`;
      }

      if (mediaIssues.length > 0) {
        md += `#### 🔴 Creative Media Issues\n`;
        mediaIssues.forEach((iss) => {
          md += `- **Row #${iss.rowNumber}**: ${iss.message} (Reference: \`${iss.url}\`)\n`;
        });
        md += `\n`;
      }
    } else {
      // User requested to remove the green validation alert block; status is conveyed by top execution header
    }

    return md;
  }
}

export default CampaignValidator;
