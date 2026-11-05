const FIELD_DEFINITIONS = [
  { key: "primary_text", aliases: ["primary text", "ad copy", "caption", "copy"], output: ["primaryText", "primary_text"] },
  { key: "headline", aliases: ["ad headline", "headline"], output: ["headline"] },
  { key: "daily_budget", aliases: ["daily budget", "campaign budget", "ad set budget", "budget"], output: ["daily_budget", "campaignBudget", "adSetBudget", "budget"], type: "number" },
  { key: "pixel_id", aliases: ["facebook pixel id", "pixel id", "pixel", "dataset id", "dataset", "fb_pixel"], output: ["pixelId", "pixel_id", "dataset_id"] },
  { key: "page_id", aliases: ["facebook page id", "fb page id", "page id"], output: ["pageId", "page_id"] },
  { key: "display_link", aliases: ["display link", "display url", "display_link", "vanity url"], output: ["displayLink", "display_link"] },
  { key: "instagram_account_id", aliases: ["instagram account id", "instagram id", "ig account id"], output: ["instagramId", "instagram_id", "instagram_account_id"] },
  { key: "app_id", aliases: ["meta app id", "application id", "app id", "appid"], output: ["appId", "app_id"] },
  { key: "object_store_url", aliases: ["app store url", "play store url", "store url", "object store url"], output: ["objectStoreUrl", "object_store_url"] },
  { key: "landing_page_url", aliases: ["landing page url", "website url", "destination url", "landing page"], output: ["landingPageUrl", "landing_page_url", "website_url"] },
  { key: "conversion_event", aliases: ["conversion event", "custom event type", "event type"], output: ["conversionEvent", "conversion_event", "customEventType"] },
  { key: "url_tags", aliases: ["tracking parameters", "url parameters", "url tags", "utm parameters"], output: ["urlTags", "url_tags"] },
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toCamelCase(value) {
  return value.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function normalizeKey(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function cleanValue(value) {
  return String(value || "")
    .trim()
    .replace(/^[\s"'“”]+/, "")
    .replace(/[\s"'“”]+$/, "")
    .trim();
}
export class MissingFieldCollector {
  /**
   * Format questions asking the user for missing fields
   */
  static formatQuestionsMarkdown(missingFields = []) {
    if (!missingFields || missingFields.length === 0) return "";

    let md = `### ❓ Missing Information Required\n\n`;
    md += `I found the campaign data in your connected Google Sheet, but some required fields are missing before I can continue creating your ad:\n\n`;

    missingFields.forEach((item, idx) => {
      const levelLabel =
        item.level === "campaign"
          ? "Campaign Level"
          : item.level === "adset"
            ? "Ad Set Level"
            : "Ad Level";

      const rowsText =
        item.affectedRows && item.affectedRows.length > 0
          ? ` *(Affected Rows: ${item.affectedRows.map((r) => `#${r}`).join(", ")})*`
          : "";

      md += `${idx + 1}. **${item.label}** [${levelLabel}]${rowsText}\n`;
      md += `   - **Requirement**: ${item.description || "Required by Meta Ads API for publication"}\n`;
      if (item.options && item.options.length > 0) {
        md += `   - **Options**: ${item.options.map((o) => `\`${o}\``).join(", ")}\n`;
      }
      md += `\n`;
    });

    md += `Please provide these values here in the chat so I can continue creating your ad.\n\n`;
    md += `> 💬 **Example response**: *"Primary Text: This is our best offer, get 50% discount, Headline: Get Started Today, Daily Budget: 500"*\n`;
    md += `> Once received, I will automatically merge these values with your Google Sheet data and proceed with ad creation.`;

    return md;
  }

  /**
   * Parse user responses to missing fields from natural language chat messages
   */
  static parseAnswersFromMessage(userMessage = "", missingFields = []) {
    if (!userMessage || typeof userMessage !== "string") return {};
    const answers = {};
    const msg = userMessage.trim();
    const msgLower = msg.toLowerCase();




    // 1. Pixel ID / Dataset ID
    const pixelMatch =
      msg.match(/(?:pixel\s*id|pixel|dataset\s*id|dataset|fb_pixel)\s*(?:is|:|=|-|\s)\s*([0-9]{5,22})/i) ||
      msg.match(/(?:pixel\s*id|pixel|dataset\s*id|dataset)\s*['"]?([0-9]{5,22})['"]?/i);
    if (pixelMatch) {
      const pId = pixelMatch[1].trim();
      answers.pixelId = pId;
      answers.pixel_id = pId;
      answers.dataset_id = pId;
    }

    // 2. Facebook Page ID
    const pageIdMatch =
      msg.match(/(?:facebook\s*page\s*id|fb\s*page\s*id|page\s*id|facebook\s*page|fb\s*page|page)\s*(?:is|:|=|-|\s)\s*([0-9]{5,22})/i) ||
      msg.match(/(?:facebook\s*page|fb\s*page|page\s*id)\s*['"]?([0-9]{5,22})['"]?/i);
    if (pageIdMatch) {
      const pgId = pageIdMatch[1].trim();
      answers.pageId = pgId;
      answers.page_id = pgId;
    }

    // 3. Display Link
    const displayLinkMatch =
      msg.match(/(?:display\s*link|display_link|display\s*url|displayurl|vanity\s*url)\s*(?:is|:|=|-|\s)\s*([^\s,;]+)/i) ||
      msg.match(/(?:display\s*link|display_link)[\s:=]+([^\s,;]+)/i);
    if (displayLinkMatch) {
      let dl = displayLinkMatch[1].trim().replace(/[.,;'"<>]+$/, "");
      answers.displayLink = dl;
      answers.display_link = dl;
    }

    // 4. Instagram Account ID
    const igMatch =
      msg.match(/(?:instagram\s*(?:account)?\s*id|ig\s*(?:account)?\s*id|instagram_id)\s*(?:is|:|=|-|\s)\s*([0-9]{5,22})/i);
    if (igMatch) {
      const igId = igMatch[1].trim();
      answers.instagramId = igId;
      answers.instagram_id = igId;
      answers.instagram_account_id = igId;
    }

    // 5. Meta App ID
    const appIdMatch =
      msg.match(/(?:meta\s*app\s*id|application\s*id|app\s*id|appid)\s*(?:is|:|=|-|\s)\s*([0-9]{5,22})/i);
    if (appIdMatch) {
      const aId = appIdMatch[1].trim();
      answers.appId = aId;
      answers.app_id = aId;
    }

    // 6. Object Store URL (App Store or Play Store)
    const storeMatch =
      msg.match(/(?:store\s*url|app\s*store\s*url|play\s*store\s*url|object_store_url)\s*(?:is|:|=|-|\s)\s*([^\s"',;]+)/i) ||
      msg.match(/https?:\/\/(?:play\.google\.com\/store\/apps|apps\.apple\.com)[^\s"',;]+/i);
    if (storeMatch) {
      const sUrl = (storeMatch[1] || storeMatch[0]).trim();
      answers.objectStoreUrl = sUrl;
      answers.object_store_url = sUrl;
    }

    // 7. Landing Page URL / Website URL
    const urlMatch =
      msg.match(/(?:website\s*url|website|landing\s*page\s*url|landing\s*page|landing_page_url|destination\s*url|destination|link\s*url)\s*(?:is|:|=|-|\s)\s*(https?:\/\/[^\s"',;]+)/i) ||
      msg.match(/https?:\/\/(?!play\.google|apps\.apple|drive\.google|docs\.google)[^\s"',;]+/i);
    if (urlMatch) {
      const u = (urlMatch[1] || urlMatch[0]).trim();
      answers.landingPageUrl = u;
      answers.landing_page_url = u;
      answers.website_url = u;
    }

    // 8. Campaign Type / Intent
    if (
      msgLower.includes("website") ||
      msgLower.includes("web campaign") ||
      msgLower.includes("not app") ||
      msgLower.includes("not an app") ||
      msgLower.includes("normal ads") ||
      msgLower.includes("sales campaign")
    ) {
      answers.campaignType = "WEBSITE";
      if (!answers.objective) {
        answers.objective = "OUTCOME_SALES";
      }
    } else if (
      msgLower.includes("app promotion") ||
      msgLower.includes("app install") ||
      msgLower.includes("app campaign")
    ) {
      answers.campaignType = "APP_PROMOTION";
      if (!answers.objective) {
        answers.objective = "OUTCOME_APP_PROMOTION";
      }
    }

    // 9. Campaign Objective
    const objectives = [
      "OUTCOME_SALES",
      "OUTCOME_LEADS",
      "OUTCOME_TRAFFIC",
      "OUTCOME_ENGAGEMENT",
      "OUTCOME_AWARENESS",
      "OUTCOME_APP_PROMOTION",
    ];
    for (const obj of objectives) {
      if (msgUpperIncludes(msg, obj)) {
        answers.objective = obj;
        break;
      }
    }
    if (!answers.objective) {
      if (msgLower.includes("sales") || msgLower.includes("purchase") || msgLower.includes("ecommerce")) {
        answers.objective = "OUTCOME_SALES";
      } else if (msgLower.includes("lead")) {
        answers.objective = "OUTCOME_LEADS";
      } else if (msgLower.includes("traffic") || msgLower.includes("clicks")) {
        answers.objective = "OUTCOME_TRAFFIC";
      } else if (msgLower.includes("app install") || msgLower.includes("app promotion")) {
        answers.objective = "OUTCOME_APP_PROMOTION";
      }
    }

    // 10. Budget
    const budgetMatch =
      msg.match(/(?:daily\s*budget|campaign\s*budget|budget|spend|cost)\s*(?:is|:|=|-|\s)[₹$Rs.\s]*([0-9,]+)/i) ||
      msg.match(/([0-9,]+)\s*(?:inr|rs|usd|\$|₹)/i);
    if (budgetMatch) {
      const parsed = Number(budgetMatch[1].replace(/,/g, ""));
      if (parsed > 0) {
        answers.campaignBudget = parsed;
        answers.adSetBudget = parsed;
        answers.budget = parsed;
        answers.daily_budget = parsed;
      }
    }

    // 11. Headline
    const headlineMatch = msg.match(
      /(?:ad\s*headline|headline)\s*(?:is|:|=|-)\s*["'“]?(.+?)(?=\s*(?:,\s*)?(?:primary\s*text|ad\s*copy|copy|caption|daily\s*budget|budget|pixel\s*id|page\s*id|app\s*id|store\s*url)\s*(?:is|:|=|-)|$)/i
    );

    if (headlineMatch) {
      answers.headline = cleanValue(headlineMatch[1]);
    }

    // 12. Primary Text / Ad Copy
    const textMatch = msg.match(
      /(?:primary\s*text|ad\s*copy|copy|caption)\s*(?:is|:|=|-)\s*["'“]?(.+?)(?=\s*(?:,\s*)?(?:headline|ad\s*headline|daily\s*budget|campaign\s*budget|budget|pixel\s*id|page\s*id|app\s*id|store\s*url|conversion\s*event)\s*(?:is|:|=|-)|$)/i
    );

    if (textMatch) {
      const primaryText = cleanValue(textMatch[1]);
      answers.primaryText = primaryText;
      answers.primary_text = primaryText;
    }

    // 13. Conversion Event / Custom Event Type
    const eventMatch =
      msg.match(/(?:conversion\s*event|custom\s*event\s*type|event\s*type|conversion_event)\s*(?:is|:|=|-|\s)\s*([a-zA-Z0-9_]+)/i);
    if (eventMatch) {
      const ev = eventMatch[1].trim().toUpperCase();
      answers.conversionEvent = ev;
      answers.conversion_event = ev;
      answers.customEventType = ev;
    }

    // 14. Tracking Parameters / URL Tags
    const trackingMatch =
      msg.match(/(?:tracking\s*parameters?|tracking|url\s*tags?|url_tags?|utm\s*parameters?)\s*(?:is|:|=|-|\s)\s*([^\n,;]+)/i);
    if (trackingMatch) {
      const t = trackingMatch[1].trim();
      answers.urlTags = t;
      answers.url_tags = t;
    }


    // 15. Dynamic Field Match against provided missingFields
    if (Array.isArray(missingFields) && missingFields.length > 0) {
      for (const fieldItem of missingFields) {
        const fKey = fieldItem.field || fieldItem.key;
        const fLabel = fieldItem.label || fKey;

        if (!fKey || !fLabel) continue;

        const normalizedKey = normalizeKey(fKey);
        const camelKey = toCamelCase(normalizedKey);

        if (answers[fKey] !== undefined || answers[camelKey] !== undefined) {
          continue;
        }

        const labelClean = String(fLabel).trim();

        if (labelClean.length < 3) continue;

        const labelRegex = new RegExp(
          `(?:${escapeRegex(labelClean)})\\s*(?:is|:|=)\\s*(.+?)(?=\\s*(?:,\\s*)?(?:${missingFields
            .map((f) => escapeRegex(f.label || f.field || f.key || ""))
            .filter(Boolean)
            .join("|")})\\s*(?:is|:|=)|$)`,
          "i"
        );

        const match = msg.match(labelRegex);

        if (match) {
          const value = cleanValue(match[1]);

          if (value) {
            answers[fKey] = value;
            answers[camelKey] = value;
          }
        }
      }

      // 16. Standalone single-value fallback:
      // If exactly 1 missing field is pending and user replied with just the single value
      const remainingUnresolved = missingFields.filter(
        (f) => !answers[f.field] && !answers[f.field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())]
      );

      if (remainingUnresolved.length === 1 && Object.keys(answers).length === 0) {
        const onlyField = remainingUnresolved[0];
        const fieldKey = onlyField.field;

        // Check if message is a numeric ID
        const numOnly = msg.match(/^\s*([0-9]{5,22})\s*$/);
        if (numOnly && (fieldKey.includes("id") || fieldKey.includes("page") || fieldKey.includes("pixel") || fieldKey.includes("app"))) {
          answers[fieldKey] = numOnly[1];
          answers[fieldKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = numOnly[1];
        }

        // Check if message is a URL or domain
        const urlOnly = msg.match(/^\s*(https?:\/\/[^\s]+)\s*$/i);
        if (urlOnly && (fieldKey.includes("url") || fieldKey.includes("destination") || fieldKey.includes("store"))) {
          answers[fieldKey] = urlOnly[1];
          answers[fieldKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = urlOnly[1];
        }

        const domainOnly = msg.match(/^\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)\s*$/i);
        if (domainOnly && (fieldKey.includes("display_link") || fieldKey.includes("displayLink") || fieldKey.includes("domain"))) {
          answers.displayLink = domainOnly[1];
          answers.display_link = domainOnly[1];
        }
      }
    }

    return answers;
  }

  /**
   * Quick check whether a message contains answers to missing fields
   */
  static hasFieldAnswers(userMessage = "", missingFields = []) {
    const answers = this.parseAnswersFromMessage(userMessage, missingFields);
    return Object.keys(answers).length > 0;
  }
}

function msgUpperIncludes(text, term) {
  return text.toUpperCase().includes(term);
}

export default MissingFieldCollector;
