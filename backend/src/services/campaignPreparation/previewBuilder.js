export class PreviewBuilder {
  /**
   * Build complete preview tables and structured JSON object
   */
  static buildPreview({
    validationResult = {},
    sourceData = {},
    userAnswers = {},
    version = 1,
  }) {
    const {
      campaignType = "WEBSITE",
      campaignName = "",
      adSetName = "",
      objective = "OUTCOME_SALES",
      isCBO = false,
      budget = 1000,
      optimizationGoal = "OFFSITE_CONVERSIONS",
      billingEvent = "IMPRESSIONS",
      specialAdCategory = "NONE",
      adLevelRows = [],
    } = validationResult;

    const firstRowValues = sourceData.rows?.[0]?.values || {};

    // Determine field sources
    const getSource = (key, userVal, sheetVal, defaultVal) => {
      if (userVal !== undefined && userVal !== null && String(userVal).trim() !== "") return "User";
      if (sheetVal !== undefined && sheetVal !== null && String(sheetVal).trim() !== "") return "Sheet";
      return "Default";
    };

    // Table 1: Campaign Details
    const campaignDetails = [
      {
        field: "Campaign Name",
        value: campaignName,
        source: getSource("campaignName", userAnswers.campaignName, firstRowValues.campaign_name, campaignName),
      },
      {
        field: "Objective",
        value: objective,
        source: getSource("objective", userAnswers.objective, firstRowValues.campaign_objective || firstRowValues.objective, "OUTCOME_SALES"),
      },
      {
        field: "Campaign Type",
        value: campaignType === "APP_PROMOTION" ? "App Promotion (OUTCOME_APP_PROMOTION)" : "Website / Conversions",
        source: campaignType === "APP_PROMOTION" ? "Sheet / Schema" : "Workflow",
      },
      {
        field: "Buying Type",
        value: "AUCTION",
        source: "Authorized Default",
      },
      {
        field: "Budget Configuration",
        value: isCBO ? `Advantage Campaign Budget (CBO): ₹${Number(budget).toLocaleString("en-IN")} / day` : "Ad Set Level Budgeting (ABO)",
        source: getSource("budget", userAnswers.campaignBudget, firstRowValues.campaign_budget, "Default"),
      },
      {
        field: "Special Ad Categories",
        value: specialAdCategory,
        source: getSource("specialAdCategory", userAnswers.specialAdCategory, firstRowValues.special_ad_category, "Default"),
      },
      {
        field: "Campaign Status",
        value: "PAUSED (Draft Safe Mode)",
        source: "Authorized Default",
      },
    ];

    // Table 2: Ad Set Details
    const audienceTargeting =
      firstRowValues.countries || firstRowValues.country
        ? `Locations: ${firstRowValues.countries || "India"} | Age: ${firstRowValues.age_min || "18"}-${firstRowValues.age_max || "65"} | Gender: ${firstRowValues.gender || "ALL"}`
        : "Locations: India | Age: 18-65 | Gender: ALL";

    const effectiveAppId = firstRowValues.app_id || userAnswers.appId || validationResult.appId || null;
    const effectivePixelId = firstRowValues.pixel_id || userAnswers.pixelId || validationResult.pixelId || null;

    let trackingConversionSettings = "";
    if (campaignType === "APP_PROMOTION") {
      trackingConversionSettings = `App Events (App ID: ${effectiveAppId || "N/A"}) | Store: ${firstRowValues.object_store_url || userAnswers.objectStoreUrl || "N/A"}`;
    } else {
      const parts = [];
      if (effectivePixelId) {
        parts.push(`Website Events (Pixel: ${effectivePixelId})`);
      } else {
        parts.push(`Website Events (Pixel: Standard Web Pixel)`);
      }
      if (effectiveAppId) {
        parts.push(`App Events (App ID: ${effectiveAppId})`);
      }
      trackingConversionSettings = parts.join(" | ");
    }

    const adSetDetails = [
      {
        field: "Ad Set Name",
        value: adSetName,
        source: getSource("adSetName", userAnswers.adSetName, firstRowValues.adset_name, adSetName),
      },
      {
        field: "Campaign Association",
        value: campaignName,
        source: "Workflow",
      },
      {
        field: "Budget Configuration",
        value: !isCBO ? `Ad Set Daily Budget: ₹${Number(budget).toLocaleString("en-IN")} / day` : "Inherited from Campaign (CBO)",
        source: !isCBO ? getSource("budget", userAnswers.adSetBudget, firstRowValues.adset_daily_budget, "Default") : "Campaign CBO",
      },
      {
        field: "Performance Goal",
        value: (() => {
          if (optimizationGoal === "VALUE") return "Maximise value of conversions";
          if (optimizationGoal === "OFFSITE_CONVERSIONS") return "Maximise number of conversions";
          if (optimizationGoal === "APP_INSTALLS") return "Maximise number of app installs";
          if (optimizationGoal === "LINK_CLICKS") return "Maximise number of link clicks";
          if (optimizationGoal === "LANDING_PAGE_VIEWS") return "Maximise number of landing page views";
          return optimizationGoal;
        })(),
        source: getSource("optimizationGoal", userAnswers.optimizationGoal, firstRowValues.performance_goal || firstRowValues["Performance goal"] || firstRowValues.optimization_goal, validationResult?.isBusinessVerified ? "Verified Business Account" : "Default"),
      },
      {
        field: "Billing Event",
        value: billingEvent,
        source: "Authorized Default",
      },
      {
        field: "Audience & Targeting",
        value: audienceTargeting,
        source: getSource("targeting", null, firstRowValues.countries, "Default"),
      },
      {
        field: "Placements",
        value: "Advantage+ Placements (Automatic: Feed, Stories, Reels, Explore)",
        source: "Authorized Default",
      },
      {
        field: "Schedule",
        value: "Starts Immediately Upon Activation (Continuous)",
        source: "Authorized Default",
      },
      {
        field: "Tracking / Conversion Settings",
        value: trackingConversionSettings,
        source: getSource("tracking", userAnswers.pixelId || userAnswers.appId, firstRowValues.pixel_id || firstRowValues.app_id, "Default"),
      },
    ];

    // Table 3: Ad Details
    const adDetails = adLevelRows.map((ad, idx) => {
      const sourceRow = ad.sourceRow || idx + 2;
      return {
        sourceRow,
        adName: ad.adName,
        creativeType: ad.creativeType,
        creative: ad.creative || "Configured media asset",
        primaryText: ad.primaryText || "",
        headline: ad.headline || "",
        description: ad.description || "",
        destination: ad.destination || "",
        displayLink: ad.displayLink || "",
        urlTags: ad.urlTags || null,
        cta: ad.cta || (campaignType === "APP_PROMOTION" ? "DOWNLOAD" : "BOOK_NOW"),
        pageId: ad.pageId || "",
        instagramId: ad.instagramId || "",
        appId: ad.appId || effectiveAppId || "",
        pixelId: ad.pixelId || effectivePixelId || "",
        videoId: ad.videoId || null,
        videoFilePath: ad.videoFilePath || null,
        tracking: (() => {
          const parts = [];
          if (ad.pixelId || effectivePixelId) parts.push("Website Events (Pixel)");
          if (ad.appId || effectiveAppId) parts.push(`App Events (${ad.appId || effectiveAppId})`);
          if (ad.urlTags) parts.push(`UTM: ${ad.urlTags}`);
          return parts.length > 0 ? parts.join(" | ") : "UTM & Attribution Enabled";
        })(),
        status: ad.status === "READY" ? "Valid" : "Pending",
        fieldSources: {
          adName: "Sheet",
          primaryText: ad.primaryText ? "Sheet" : "Default",
          headline: ad.headline ? "Sheet" : "Default",
          destination: ad.destination ? "Sheet" : "Default",
          displayLink: ad.displayLink ? "Sheet" : "Default",
          urlTags: ad.urlTags ? "Sheet" : "Default",
        },
      };
    });

    return {
      version,
      generatedAt: new Date(),
      campaignDetails,
      adSetDetails,
      adDetails,
    };
  }

  /**
   * Format the 3 preview tables into clean GitHub-flavored Markdown
   */
  static renderMarkdownPreview(previewData, options = {}) {
    return this.formatPreviewMarkdown(previewData, options);
  }

  static formatPreviewMarkdown(previewData, { page = 1, pageSize = 5 } = {}) {
    const { campaignDetails, adSetDetails, adDetails, version } = previewData;

    let md = `### 🎯 Complete Campaign Preview (Version ${version})\n\n`;
    md += `All required fields have been validated. Please inspect the final campaign architecture below:\n\n`;

    // Table 1: Campaign Details
    md += `#### 📊 Table 1: Campaign Details\n\n`;
    md += `| Field | Final Value | Source |\n`;
    md += `|---|---|---|\n`;
    campaignDetails.forEach((row) => {
      md += `| **${row.field}** | ${row.value} | \`${row.source}\` |\n`;
    });
    md += `\n`;

    // Table 2: Ad Set Details
    md += `#### ⚙️ Table 2: Ad Set Details\n\n`;
    md += `| Field | Final Value | Source |\n`;
    md += `|---|---|---|\n`;
    adSetDetails.forEach((row) => {
      md += `| **${row.field}** | ${row.value} | \`${row.source}\` |\n`;
    });
    md += `\n`;

    // Table 3: Ad Details (with pagination support for long tables)
    md += `#### 🎨 Table 3: Ad Details (${adDetails.length} Total Creatives)\n\n`;
    md += `| Row | Ad Name | Format | Creative Source | Headline | Destination | Display Link | Status |\n`;
    md += `|---|---|---|---|---|---|---|---|\n`;

    const startIndex = (page - 1) * pageSize;
    const paginatedAds = adDetails.slice(startIndex, startIndex + pageSize);

    paginatedAds.forEach((ad) => {
      const cleanHead = (ad.headline || "").replace(/[\r\n]+/g, " ").slice(0, 24);
      const cleanMedia = typeof ad.creative === "string" && ad.creative.length > 25 ? ad.creative.slice(0, 22) + "..." : ad.creative;
      const cleanDest = typeof ad.destination === "string" && ad.destination.length > 25 ? ad.destination.slice(0, 22) + "..." : ad.destination;
      const cleanDisplay = ad.displayLink ? `\`${ad.displayLink.length > 25 ? ad.displayLink.slice(0, 22) + "..." : ad.displayLink}\`` : "—";

      md += `| #${ad.sourceRow} | **${ad.adName}** | \`${ad.creativeType}\` | \`${cleanMedia}\` | ${cleanHead} | \`${cleanDest}\` | ${cleanDisplay} | ✅ ${ad.status} |\n`;
    });

    if (adDetails.length > pageSize) {
      md += `\n*Showing ${paginatedAds.length} of ${adDetails.length} ads. All ${adDetails.length} will be created upon approval.*\n`;
    }
    md += `\n`;

    // Action Prompts as required by Requirement 8
    md += `---\n\n`;
    md += `### 🚀 Ready for Authorization\n\n`;
    md += `To proceed with Meta Ads creation, please confirm below:\n\n`;
    md += `1. **Approve Campaign & Create Ads**: Reply *"Approve"* or *"Approve Campaign & Create Ads"* to generate a frozen snapshot and launch creation in dependency order.\n`;
    md += `2. **Edit Details**: Reply *"Edit details"* or state any changes (e.g. *"Change budget to ₹5,000"*, *"Update headline of ad 3"*).\n\n`;
    md += `> 🛡️ **Zero Creation Without Approval**: No Meta Marketing API creation calls have been or will be executed until your explicit authorization.`;

    return md;
  }
}

export default PreviewBuilder;
