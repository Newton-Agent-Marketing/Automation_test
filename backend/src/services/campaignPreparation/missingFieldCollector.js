export class MissingFieldCollector {
  /**
   * Format questions asking the user for missing fields
   */
  static formatQuestionsMarkdown(missingFields = []) {
    if (!missingFields || missingFields.length === 0) return "";

    let md = `### ❓ Missing Information Required\n\n`;
    md += `I checked your source sheet. The following fields need attention before I can prepare your Meta Ads campaign:\n\n`;

    missingFields.forEach((item, idx) => {
      const levelLabel =
        item.level === "campaign"
          ? "Campaign Level"
          : item.level === "adset"
          ? "Ad Set Level"
          : "Ad Level";

      const rowsText =
        item.affectedRows && item.affectedRows.length > 0
          ? `(Affected Rows: ${item.affectedRows.map((r) => `#${r}`).join(", ")})`
          : "";

      md += `${idx + 1}. **${item.label}** [${levelLabel}] ${rowsText}\n`;
      md += `   - **Issue**: ${item.description || "Field is missing or required by Meta API"}\n`;
      if (item.options && item.options.length > 0) {
        md += `   - **Options**: ${item.options.map((o) => `\`${o}\``).join(", ")}\n`;
      }
      md += `\n`;
    });

    md += `> 💬 **How to respond**: You can provide these values directly in chat (e.g. *"Page ID: 1092837465, Objective: OUTCOME_SALES"*).\n`;
    md += `> Once received, I will update your source sheet, read back the saved cells to verify, and regenerate the preview.`;

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

    // 1. Page ID
    const pageIdMatch =
      msg.match(/(?:page\s*id|facebook\s*page|fb\s*page)[\s:=]*([0-9]{5,20})/i) ||
      msg.match(/\b([0-9]{12,18})\b/);
    if (pageIdMatch && (missingFields.some((f) => f.field === "page_id") || msgLower.includes("page"))) {
      answers.pageId = pageIdMatch[1];
    }

    // 1b. Campaign Type / Intent
    if (
      msgLower.includes("website") ||
      msgLower.includes("web campaign") ||
      msgLower.includes("not app") ||
      msgLower.includes("not an app") ||
      msgLower.includes("normal ads") ||
      msgLower.includes("sales campaign")
    ) {
      answers.campaignType = "WEBSITE";
      if (!answers.objective) answers.objective = "OUTCOME_SALES";
    } else if (
      msgLower.includes("app promotion") ||
      msgLower.includes("app install") ||
      msgLower.includes("app campaign")
    ) {
      answers.campaignType = "APP_PROMOTION";
      if (!answers.objective) answers.objective = "OUTCOME_APP_PROMOTION";
    }

    // 2. Meta App ID
    const appIdMatch =
      msg.match(/(?:app\s*id|meta\s*app\s*id|application\s*id)[\s:=]*([0-9]{10,20})/i);
    if (appIdMatch) {
      answers.appId = appIdMatch[1];
    }

    // 3. Campaign Objective
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
      if (msgLower.includes("sales") || msgLower.includes("purchase") || msgLower.includes("ecommerce")) answers.objective = "OUTCOME_SALES";
      else if (msgLower.includes("lead")) answers.objective = "OUTCOME_LEADS";
      else if (msgLower.includes("traffic") || msgLower.includes("clicks")) answers.objective = "OUTCOME_TRAFFIC";
      else if (msgLower.includes("app install") || msgLower.includes("app promotion")) answers.objective = "OUTCOME_APP_PROMOTION";
    }

    // 4. Pixel ID / Dataset ID
    const pixelMatch = msg.match(/(?:pixel|dataset|fb_pixel)[\s:=]*([0-9]{10,20})/i);
    if (pixelMatch) {
      answers.pixelId = pixelMatch[1];
    }

    // 5. Budget
    const budgetMatch =
      msg.match(/(?:budget|spend|cost)[\s:=₹$]*([0-9,]+)/i) ||
      msg.match(/([0-9,]+)\s*(?:inr|rs|usd|\$|₹)/i);
    if (budgetMatch) {
      const parsed = Number(budgetMatch[1].replace(/,/g, ""));
      if (parsed > 0) {
        answers.campaignBudget = parsed;
        answers.adSetBudget = parsed;
      }
    }

    // 6. Object Store URL (App Store or Play Store)
    const storeMatch = msg.match(/https?:\/\/(?:play\.google\.com\/store\/apps|apps\.apple\.com)[^\s"',;]+/i);
    if (storeMatch) {
      answers.objectStoreUrl = storeMatch[0];
    }

    // 7. Landing Page URL
    const urlMatch = msg.match(/https?:\/\/(?!play\.google|apps\.apple|drive\.google)[^\s"',;]+/i);
    if (urlMatch) {
      answers.landingPageUrl = urlMatch[0];
    }

    // 8. Headline & Primary Text
    const headlineMatch = msg.match(/(?:headline)[\s:=]*["'“]?([^"\n\r]{2,80}?)["'”]?$/im) ||
      msg.match(/(?:headline)[\s:=]+([^\n,]+)/i);
    if (headlineMatch) {
      answers.headline = headlineMatch[1].trim();
    }

    const textMatch = msg.match(/(?:primary\s*text|ad\s*copy|copy|caption)[\s:=]*["'“]?([^"\n\r]{5,300}?)["'”]?$/im) ||
      msg.match(/(?:primary\s*text|ad\s*copy|copy|caption)[\s:=]+([^\n]+)/i);
    if (textMatch) {
      answers.primaryText = textMatch[1].trim();
    }

    return answers;
  }
}

function msgUpperIncludes(text, term) {
  return text.toUpperCase().includes(term);
}

export default MissingFieldCollector;
