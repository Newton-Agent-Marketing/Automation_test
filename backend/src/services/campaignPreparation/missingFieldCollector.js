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
    md += `> 💬 **Example response**: *"Pixel ID is 123456789, Page ID is 987654321 and Display Link is example.com"*\n`;
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
    const headlineMatch =
      msg.match(/(?:ad\s*headline|headline)\s*(?:is|:|=|-|\s)\s*["'“]?([^"\n,;]+?)["'”]?$/im) ||
      msg.match(/(?:ad\s*headline|headline)[\s:=]+([^\n,]+)/i);
    if (headlineMatch) {
      answers.headline = headlineMatch[1].trim();
    }

    // 12. Primary Text / Ad Copy
    const textMatch =
      msg.match(/(?:primary\s*text|ad\s*copy|copy|caption)\s*(?:is|:|=|-|\s)\s*["'“]?([^"\n;]+?)["'”]?$/im) ||
      msg.match(/(?:primary\s*text|ad\s*copy|copy|caption)[\s:=]+([^\n]+)/i);
    if (textMatch) {
      answers.primaryText = textMatch[1].trim();
      answers.primary_text = textMatch[1].trim();
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
        const fKey = fieldItem.field;
        const fLabel = fieldItem.label;

        // If already resolved above, skip
        if (answers[fKey] || answers[fKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase())]) {
          continue;
        }

        // Try regex with label: e.g. "Facebook Page ID is ..." or "Display Link is ..."
        const labelClean = (fLabel || "").replace(/[^a-zA-Z0-9\s]/g, "").trim();
        if (labelClean.length >= 3) {
          const labelRegex = new RegExp(`(?:${labelClean})\\s*(?:is|:|=|-|\\s)\\s*([^\\n,;]+)`, "i");
          const lMatch = msg.match(labelRegex);
          if (lMatch) {
            const val = lMatch[1].trim().replace(/^['"]|['"]$/g, "");
            answers[fKey] = val;
            answers[fKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = val;
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
