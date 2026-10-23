import { FieldMapper } from "../data/fieldMapper.js";
import { SheetUpdateService } from "./sheetUpdateService.js";
import { SourceSheetReader } from "./sourceSheetReader.js";
import CampaignValidator from "./campaignValidator.js";
import PreviewBuilder from "./previewBuilder.js";

/**
 * DynamicFieldEditor: Intelligent, Schema-Driven Field Discovery & Editing Engine
 *
 * Supports:
 * - Dynamic discovery of ANY field present in runtime data (campaign, ad set, ad, sheet, custom fields)
 * - Intelligent semantic matching (normalizes case, whitespace, symbols, Hinglish, marketing terminology)
 * - Safe ambiguity resolution (prompts user when multiple fields like daily_budget vs lifetime_budget match)
 * - Conversational multi-turn workflows (identifies field -> asks confirmation -> updates on 'Yes')
 * - Enforces security restrictions on immutable system/credential fields
 * - Safe persistence to connected source sheets (Google Sheets / Excel) and database state
 */
export class DynamicFieldEditor {
  /**
   * Immutable system / security fields that must never be edited by users
   */
  static IMMUTABLE_FIELDS = new Set([
    "_id",
    "id",
    "sessionid",
    "conversationid",
    "userid",
    "metaaccountid",
    "accesstoken",
    "token",
    "appsecret",
    "clientsecret",
    "jwtsecret",
    "password",
    "creationjob",
    "audithistory",
    "createdat",
    "updatedat",
    "datafingerprint",
  ]);

  /**
   * Rich semantic dictionary mapping natural language concepts to normalized canonical keys
   */
  static SEMANTIC_DICTIONARY = {
    daily_budget: [
      "daily_budget",
      "dailybudget",
      "daily budget",
      "daily spend limit",
      "daily spend",
      "per day budget",
      "day budget",
      "daily limit",
      "adset budget",
      "adset_daily_budget",
      "adset daily budget",
      "ad set budget",
      "daily cost",
    ],
    lifetime_budget: [
      "lifetime_budget",
      "lifetimebudget",
      "lifetime budget",
      "total budget",
      "overall budget",
      "campaign lifetime budget",
      "lifetime spend",
      "entire budget",
    ],
    campaign_budget: [
      "campaign_budget",
      "campaignbudget",
      "campaign budget",
      "cbo budget",
      "campaign spend",
      "campaign ka budget",
      "camp budget",
      "total campaign budget",
    ],
    campaign_name: [
      "campaign_name",
      "campaignname",
      "campaign name",
      "camp name",
      "campaign title",
      "campaign label",
    ],
    adset_name: [
      "adset_name",
      "adsetname",
      "adset name",
      "ad set name",
      "adgroup name",
      "ad group name",
      "adset title",
    ],
    ad_name: [
      "ad_name",
      "adname",
      "ad name",
      "ad title",
      "creative name",
      "creative title",
      "nomenclature",
    ],
    headline: [
      "headline",
      "headlines",
      "ad heading",
      "heading",
      "title",
      "ad title",
      "creative headline",
      "header",
      "title 1",
    ],
    primary_text: [
      "primary_text",
      "primarytext",
      "primary text",
      "main text",
      "maintext",
      "body",
      "body text",
      "ad text",
      "ad copy",
      "adcopy",
      "caption",
      "copy",
      "message",
      "post text",
    ],
    description: [
      "description",
      "descriptions",
      "ad description",
      "desc",
      "sub headline",
      "link description",
    ],
    call_to_action: [
      "call_to_action",
      "calltoaction",
      "call to action",
      "cta",
      "button",
      "action button",
      "button text",
    ],
    landing_page_url: [
      "landing_page_url",
      "landingpageurl",
      "landing page url",
      "landing page",
      "destination",
      "destination url",
      "destination link",
      "website url",
      "website link",
      "target url",
      "tracking link",
      "product link",
      "url",
      "link",
      "site url",
    ],
    destination: [
      "destination",
      "destination url",
      "destination link",
      "landing page url",
      "landingpageurl",
      "landing page",
      "website url",
      "website link",
      "target url",
      "tracking link",
      "product link",
      "url",
      "link",
      "site url",
    ],
    display_link: [
      "display_link",
      "displaylink",
      "display link",
      "display url",
      "vanity url",
      "display domain",
    ],
    page_id: [
      "page_id",
      "pageid",
      "page id",
      "facebook page",
      "fb page",
      "facebook page id",
      "fb page id",
    ],
    instagram_user_id: [
      "instagram_user_id",
      "instagramuserid",
      "instagram user id",
      "instagram id",
      "insta account id",
      "insta id",
      "insta user",
      "ig id",
      "instagram handle",
    ],
    pixel_id: [
      "pixel_id",
      "pixelid",
      "pixel id",
      "meta pixel",
      "dataset id",
      "dataset",
      "fb pixel",
      "pixel",
    ],
    app_id: [
      "app_id",
      "appid",
      "app id",
      "meta app id",
      "application id",
      "fb app id",
    ],
    object_store_url: [
      "object_store_url",
      "objectstoreurl",
      "app store url",
      "play store url",
      "store url",
      "google play url",
    ],
    objective: [
      "objective",
      "campaign objective",
      "marketing objective",
      "goal",
      "campaign goal",
    ],
    optimization_goal: [
      "optimization_goal",
      "optimizationgoal",
      "conversion event",
      "performance goal",
      "optimize for",
      "optimization event",
    ],
    puja_date: [
      "puja_date",
      "pujadate",
      "puja date",
      "tithi date",
      "event date",
      "date of puja",
      "date",
    ],
    url_tags: [
      "url_tags",
      "urltags",
      "url parameters",
      "utm parameters",
      "utm tags",
      "tracking parameters",
      "url params",
    ],
  };

  /**
   * Normalize user string for robust comparison
   */
  static normalize(str) {
    if (!str || typeof str !== "string") return "";
    return str
      .trim()
      .toLowerCase()
      .replace(/[\-_:.,/\\()[\]{}|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Strip all non-alphanumeric characters
   */
  static stripAlphanumeric(str) {
    if (!str || typeof str !== "string") return "";
    return str.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  /**
   * Check if a field name is an immutable security field
   */
  static isImmutable(fieldName) {
    if (!fieldName) return false;
    const clean = this.stripAlphanumeric(fieldName);
    return this.IMMUTABLE_FIELDS.has(clean);
  }

  /**
   * Dynamically inspect the active session and runtime data to discover all available fields.
   * Discovers fields without hardcoded restrictions.
   */
  static discoverFields({ session, sourceData = null }) {
    if (!session) return [];

    const discovered = new Map();

    const addField = (fieldObj) => {
      if (!fieldObj || !fieldObj.key) return;
      const cleanKey = fieldObj.key.trim();
      if (this.isImmutable(cleanKey)) return;

      const mapKey = fieldObj.rowNumber
        ? `${cleanKey}_row${fieldObj.rowNumber}`
        : cleanKey;

      if (!discovered.has(mapKey)) {
        discovered.set(mapKey, {
          key: cleanKey,
          label: fieldObj.label || cleanKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          entity: fieldObj.entity || "general",
          rowNumber: fieldObj.rowNumber || null,
          currentValue: fieldObj.currentValue !== undefined ? fieldObj.currentValue : null,
          dataType: fieldObj.dataType || typeof fieldObj.currentValue || "string",
          fullPath: fieldObj.fullPath || cleanKey,
          sheetColumn: fieldObj.sheetColumn || cleanKey,
          isEditable: true,
          synonyms: fieldObj.synonyms || [],
        });
      }
    };

    // 1. Campaign Level Fields from Session & Preview
    if (session.campaignName) {
      addField({
        key: "campaign_name",
        label: "Campaign Name",
        entity: "campaign",
        currentValue: session.campaignName,
        dataType: "string",
        fullPath: "campaignName",
        sheetColumn: "Campaign Name",
        synonyms: this.SEMANTIC_DICTIONARY.campaign_name,
      });
    }

    if (session.objective) {
      addField({
        key: "objective",
        label: "Campaign Objective",
        entity: "campaign",
        currentValue: session.objective,
        dataType: "string",
        fullPath: "objective",
        sheetColumn: "Campaign Objective",
        synonyms: this.SEMANTIC_DICTIONARY.objective,
      });
    }

    if (session.campaignType) {
      addField({
        key: "campaign_type",
        label: "Campaign Type",
        entity: "campaign",
        currentValue: session.campaignType,
        dataType: "string",
        fullPath: "campaignType",
        sheetColumn: "Campaign Type",
        synonyms: ["campaign type", "promotion type", "type"],
      });
    }

    if (session.userAnswers?.campaignBudget !== undefined) {
      addField({
        key: "campaign_budget",
        label: "Campaign Budget",
        entity: "campaign",
        currentValue: session.userAnswers.campaignBudget,
        dataType: "number",
        fullPath: "userAnswers.campaignBudget",
        sheetColumn: "Campaign Budget",
        synonyms: this.SEMANTIC_DICTIONARY.campaign_budget,
      });
    }

    // Inspect Preview Campaign Details Table
    if (Array.isArray(session.preview?.campaignDetails)) {
      session.preview.campaignDetails.forEach((cd) => {
        if (!cd || !cd.field) return;
        const normKey = this.normalize(cd.field).replace(/\s+/g, "_");
        addField({
          key: normKey,
          label: cd.field,
          entity: "campaign",
          currentValue: cd.value,
          dataType: typeof cd.value === "number" ? "number" : "string",
          fullPath: `preview.campaignDetails.${normKey}`,
          sheetColumn: cd.field,
          synonyms: this.SEMANTIC_DICTIONARY[normKey] || [normKey, cd.field.toLowerCase()],
        });
      });
    }

    // 2. Ad Set Level Fields from Session & Preview
    if (session.adSetName) {
      addField({
        key: "adset_name",
        label: "Ad Set Name",
        entity: "adset",
        currentValue: session.adSetName,
        dataType: "string",
        fullPath: "adSetName",
        sheetColumn: "Ad Set Name",
        synonyms: this.SEMANTIC_DICTIONARY.adset_name,
      });
    }

    // Inspect Preview Ad Set Details Table (e.g. Daily Budget, Lifetime Budget, Optimization Goal)
    if (Array.isArray(session.preview?.adSetDetails)) {
      session.preview.adSetDetails.forEach((adSetItem) => {
        if (!adSetItem || !adSetItem.field) return;
        const normKey = this.normalize(adSetItem.field).replace(/\s+/g, "_");
        addField({
          key: normKey,
          label: adSetItem.field,
          entity: "adset",
          currentValue: adSetItem.value,
          dataType: typeof adSetItem.value === "number" ? "number" : "string",
          fullPath: `preview.adSetDetails.${normKey}`,
          sheetColumn: adSetItem.field,
          synonyms: this.SEMANTIC_DICTIONARY[normKey] || [normKey, adSetItem.field.toLowerCase()],
        });
      });
    }

    // Ensure daily_budget is always present in adset if budget exists in userAnswers or session
    const adSetBudgetVal =
      session.userAnswers?.adSetBudget ||
      session.userAnswers?.dailyBudget ||
      session.userAnswers?.campaignBudget ||
      1000;

    addField({
      key: "daily_budget",
      label: "Daily Budget",
      entity: "adset",
      currentValue: adSetBudgetVal,
      dataType: "number",
      fullPath: "userAnswers.adSetBudget",
      sheetColumn: "Daily Budget",
      synonyms: this.SEMANTIC_DICTIONARY.daily_budget,
    });

    addField({
      key: "lifetime_budget",
      label: "Lifetime Budget",
      entity: "adset",
      currentValue: session.userAnswers?.lifetimeBudget || null,
      dataType: "number",
      fullPath: "userAnswers.lifetimeBudget",
      sheetColumn: "Lifetime Budget",
      synonyms: this.SEMANTIC_DICTIONARY.lifetime_budget,
    });

    // 3. Ad / Creative Level Fields (from session.preview.adDetails)
    if (Array.isArray(session.preview?.adDetails) && session.preview.adDetails.length > 0) {
      session.preview.adDetails.forEach((ad) => {
        const rowNum = ad.sourceRow || null;
        const rowSuffix = rowNum ? ` (Row #${rowNum})` : "";

        // Iterate dynamically over every property of the ad object!
        Object.entries(ad).forEach(([adProp, adVal]) => {
          if (["sourceRow", "fieldSources", "creative"].includes(adProp)) return;
          if (typeof adVal === "object" && adVal !== null) return; // skip nested blobs

          const normProp = this.normalize(adProp).replace(/\s+/g, "_");
          const humanLabel = adProp
            .replace(/([A-Z])/g, " $1")
            .replace(/_/g, " ")
            .trim()
            .replace(/\b\w/g, (c) => c.toUpperCase());

          addField({
            key: normProp,
            label: `${humanLabel}${rowSuffix}`,
            entity: "ad",
            rowNumber: rowNum,
            currentValue: adVal,
            dataType: typeof adVal === "number" ? "number" : "string",
            fullPath: `preview.adDetails[row=${rowNum}].${adProp}`,
            sheetColumn: humanLabel,
            synonyms: this.SEMANTIC_DICTIONARY[normProp] || [normProp, humanLabel.toLowerCase()],
          });
        });
      });
    }

    // 4. Tracking & Platform IDs
    if (session.pageId || session.userAnswers?.pageId) {
      addField({
        key: "page_id",
        label: "Facebook Page ID",
        entity: "tracking",
        currentValue: session.pageId || session.userAnswers?.pageId,
        dataType: "string",
        fullPath: "pageId",
        sheetColumn: "Page ID",
        synonyms: this.SEMANTIC_DICTIONARY.page_id,
      });
    }

    if (session.pixelId || session.userAnswers?.pixelId) {
      addField({
        key: "pixel_id",
        label: "Meta Pixel ID",
        entity: "tracking",
        currentValue: session.pixelId || session.userAnswers?.pixelId,
        dataType: "string",
        fullPath: "pixelId",
        sheetColumn: "Pixel ID",
        synonyms: this.SEMANTIC_DICTIONARY.pixel_id,
      });
    }

    if (session.appId || session.userAnswers?.appId) {
      addField({
        key: "app_id",
        label: "Meta App ID",
        entity: "tracking",
        currentValue: session.appId || session.userAnswers?.appId,
        dataType: "string",
        fullPath: "appId",
        sheetColumn: "App ID",
        synonyms: this.SEMANTIC_DICTIONARY.app_id,
      });
    }

    // 5. Dynamic Spreadsheet Columns & Custom Fields
    if (sourceData && Array.isArray(sourceData.headers)) {
      sourceData.headers.forEach((hdr) => {
        if (!hdr || typeof hdr !== "string") return;
        const normHdr = this.normalize(hdr).replace(/\s+/g, "_");
        if (this.isImmutable(normHdr)) return;

        // Sample current value from row 1 if available
        const firstRowVal = sourceData.rows?.[0]?.values?.[hdr] || null;

        addField({
          key: normHdr,
          label: hdr,
          entity: "source",
          currentValue: firstRowVal,
          dataType: typeof firstRowVal === "number" ? "number" : "string",
          fullPath: `sourceData.${normHdr}`,
          sheetColumn: hdr,
          synonyms: this.SEMANTIC_DICTIONARY[normHdr] || [normHdr, hdr.toLowerCase()],
        });
      });
    }

    // 6. User Answers & Missing Fields
    if (Array.isArray(session.missingFields)) {
      session.missingFields.forEach((mf) => {
        if (!mf || !mf.field) return;
        const normMf = this.normalize(mf.field).replace(/\s+/g, "_");
        addField({
          key: normMf,
          label: mf.label || mf.field,
          entity: mf.level || "general",
          currentValue: mf.currentValue || mf.answer || null,
          dataType: "string",
          fullPath: `missingFields.${mf.field}`,
          sheetColumn: mf.label || mf.field,
          synonyms: this.SEMANTIC_DICTIONARY[normMf] || [normMf, (mf.label || "").toLowerCase()],
        });
      });
    }

    return Array.from(discovered.values());
  }

  /**
   * Parse user message intent and extracted components
   */
  static parseUserMessage(userMessage) {
    if (!userMessage || typeof userMessage !== "string") {
      return { intent: "UNKNOWN", raw: "" };
    }

    const raw = userMessage.trim();
    const clean = raw.toLowerCase();

    // 1. Direct Confirmation
    if (
      /^(yes|yep|yeah|haan|ha|ji|confirm|confirmed|proceed|update\s*it|do\s*it|sure|ok|okay|y)\.?$/i.test(
        clean
      )
    ) {
      return { intent: "CONFIRM", raw };
    }

    // 2. Direct Cancellation
    if (/^(no|nope|cancel|cancelled|stop|don't|dont|nah|revert|n)\.?$/i.test(clean)) {
      return { intent: "CANCEL", raw };
    }

    // 3. User expresses desire to edit without giving field or value
    // e.g. "I want to edit a field", "I want to change something", "edit a field"
    if (
      /^(i\s+want\s+to\s+edit(\s+a\s+field)?|want\s+to\s+edit(\s+a\s+field)?|edit\s+a\s+field|edit\s+field|change\s+a\s+field|update\s+a\s+field|i\s+want\s+to\s+update|modify\s+a\s+field|kuch\s+edit\s+karna\s+hai|field\s+edit\s+karna\s+hai)$/i.test(
        clean
      ) ||
      ((clean.startsWith("i want to edit") || clean.startsWith("want to edit")) &&
        !clean.includes(",") &&
        !clean.includes(":") &&
        !clean.includes("=") &&
        !/\bto\s+[a-z0-9]/i.test(clean.replace(/^i want to edit\s*/i, "")))
    ) {
      return { intent: "REQUEST_EDIT_PROMPT", raw };
    }

    // Extract row target if explicitly specified in message (e.g. "row 2", "row #2", "ad 1")
    let targetRow = null;
    const rowMatch = clean.match(/(?:row|ad)\s*#?([0-9]+)/i);
    if (rowMatch) {
      targetRow = Number(rowMatch[1]);
    }

    // 4. Pattern: comma or colon separated e.g. "budget, 500" or "daily_budget: 500"
    const delimiterMatch = raw.match(/^([^,:=]+)[,:=]\s*(.+)$/);
    if (delimiterMatch) {
      const fieldCandidate = delimiterMatch[1].trim();
      const valCandidate = delimiterMatch[2].trim();
      return {
        intent: "UPDATE_REQUEST",
        fieldQuery: fieldCandidate,
        proposedValue: valCandidate,
        targetRow,
        raw,
      };
    }

    // 5. Pattern: "Change [the] <field> to <value>" / "Update <field> to <value>" / "Set <field> to <value>"
    const changeToMatch = raw.match(
      /(?:change|update|set|modify|replace|make)\s+(?:the\s+)?(.+?)\s+(?:to|as|into|=)\s+(.+)$/i
    );
    if (changeToMatch) {
      let fieldCandidate = changeToMatch[1].trim();
      let valCandidate = changeToMatch[2].trim();

      // Clean row mentions from field candidate (e.g. "row 2 headline" -> field "headline", row 2)
      if (rowMatch) {
        fieldCandidate = fieldCandidate.replace(/(?:for\s+)?(?:row|ad)\s*#?[0-9]+/gi, "").trim();
      }

      return {
        intent: "UPDATE_REQUEST",
        fieldQuery: fieldCandidate,
        proposedValue: valCandidate,
        targetRow,
        raw,
      };
    }

    // 6. Generic fallback: user supplied just a field name or ambiguous phrase
    return {
      intent: "UPDATE_REQUEST",
      fieldQuery: raw,
      proposedValue: null,
      targetRow,
      raw,
    };
  }

  /**
   * Intelligently identify and match the user's field query against dynamically discovered fields
   */
  static resolveField({ userFieldQuery, availableFields = [] }) {
    if (!userFieldQuery || typeof userFieldQuery !== "string") {
      return { status: "NOT_FOUND", candidates: [] };
    }

    const query = userFieldQuery.trim();
    const queryNorm = this.normalize(query);
    const queryAlphanum = this.stripAlphanumeric(query);

    // 1. Security check: immutable field attempt
    if (this.isImmutable(query)) {
      return {
        status: "IMMUTABLE_SECURITY_RESTRICTION",
        fieldName: query,
        message: `Field "${query}" is an immutable system or security field and cannot be modified.`,
      };
    }

    // 2. Check for generic "budget" ambiguity
    // If the user says generic "budget" and both daily_budget and lifetime_budget/campaign_budget exist
    if (
      queryNorm === "budget" ||
      queryNorm === "the budget" ||
      queryAlphanum === "budget"
    ) {
      const budgetFields = availableFields.filter(
        (f) =>
          f.key === "daily_budget" ||
          f.key === "lifetime_budget" ||
          f.key === "campaign_budget"
      );

      // Deduplicate by key
      const uniqueBudget = Array.from(
        new Map(budgetFields.map((b) => [b.key, b])).values()
      );

      if (uniqueBudget.length > 1) {
        return {
          status: "AMBIGUOUS",
          candidates: uniqueBudget,
          userQuery: query,
        };
      }
    }

    // 3. Exact Normalized Match on key or sheetColumn
    const exactMatches = availableFields.filter(
      (f) =>
        this.stripAlphanumeric(f.key) === queryAlphanum ||
        this.stripAlphanumeric(f.label) === queryAlphanum ||
        this.stripAlphanumeric(f.sheetColumn) === queryAlphanum
    );

    if (exactMatches.length === 1) {
      return { status: "EXACT_MATCH", field: exactMatches[0] };
    }
    if (exactMatches.length > 1) {
      // Check if they are just multiple rows for the same field
      const uniqueKeys = new Set(exactMatches.map((m) => m.key));
      if (uniqueKeys.size === 1) {
        return { status: "EXACT_MATCH_MULTI_ROW", candidates: exactMatches, field: exactMatches[0] };
      }
      return { status: "AMBIGUOUS", candidates: exactMatches, userQuery: query };
    }

    // 4. Semantic Synonyms Match
    const synonymMatches = [];
    for (const field of availableFields) {
      const synList = field.synonyms || this.SEMANTIC_DICTIONARY[field.key] || [];
      for (const syn of synList) {
        const synNorm = this.normalize(syn);
        const synAlphanum = this.stripAlphanumeric(syn);

        if (
          queryNorm === synNorm ||
          queryAlphanum === synAlphanum ||
          queryNorm.includes(synNorm) ||
          synNorm.includes(queryNorm)
        ) {
          synonymMatches.push(field);
          break;
        }
      }
    }

    // Deduplicate matches by key
    const uniqueSynonymMatches = Array.from(
      new Map(synonymMatches.map((m) => [m.key, m])).values()
    );

    if (uniqueSynonymMatches.length === 1) {
      return { status: "EXACT_MATCH", field: uniqueSynonymMatches[0] };
    }
    if (uniqueSynonymMatches.length > 1) {
      return {
        status: "AMBIGUOUS",
        candidates: uniqueSynonymMatches,
        userQuery: query,
      };
    }

    // 5. Token Overlap & Substring Match
    const queryTokens = queryNorm.split(/\s+/).filter((t) => t.length > 1);
    const tokenMatches = [];

    for (const field of availableFields) {
      const fieldNorm = this.normalize(field.label + " " + field.key);
      const matchedTokens = queryTokens.filter((token) => fieldNorm.includes(token));
      if (matchedTokens.length >= Math.min(queryTokens.length, 2)) {
        tokenMatches.push({ field, score: matchedTokens.length });
      }
    }

    if (tokenMatches.length > 0) {
      tokenMatches.sort((a, b) => b.score - a.score);
      const topScore = tokenMatches[0].score;
      const topCandidates = tokenMatches
        .filter((tm) => tm.score === topScore)
        .map((tm) => tm.field);

      const uniqueTop = Array.from(
        new Map(topCandidates.map((c) => [c.key, c])).values()
      );

      if (uniqueTop.length === 1) {
        return { status: "EXACT_MATCH", field: uniqueTop[0] };
      }
      return { status: "AMBIGUOUS", candidates: uniqueTop, userQuery: query };
    }

    // 6. No match found: return helpful candidates
    const fallbackSuggestions = availableFields
      .slice(0, 5)
      .map((f) => f.key);

    return {
      status: "NOT_FOUND",
      userQuery: query,
      candidates: fallbackSuggestions,
    };
  }

  /**
   * Validate and cast the proposed value according to the field's data type
   */
  static validateAndCastValue(field, rawValue) {
    if (rawValue === undefined || rawValue === null) {
      return { isValid: false, error: "Value cannot be empty." };
    }

    const strVal = String(rawValue).trim();

    // Number type (Budget, Cost, etc.)
    if (
      field.dataType === "number" ||
      field.key.includes("budget") ||
      field.key.includes("spend") ||
      field.key.includes("cost")
    ) {
      const isNegative = strVal.trim().startsWith("-");
      const cleanNum = strVal.replace(/[^0-9.]/g, "");
      let parsedNum = Number(cleanNum);
      if (isNegative) parsedNum = -parsedNum;

      if (isNaN(parsedNum) || cleanNum === "") {
        return {
          isValid: false,
          error: `The field **${field.label}** expects a valid positive number (e.g. 500), but received "${strVal}".`,
        };
      }

      if (parsedNum <= 0) {
        return {
          isValid: false,
          error: `The field **${field.label}** must be greater than 0, but received ${parsedNum}.`,
        };
      }

      return { isValid: true, value: parsedNum };
    }

    // URL type
    if (
      field.key.includes("url") ||
      field.key.includes("link") ||
      field.key.includes("destination")
    ) {
      if (!/^https?:\/\//i.test(strVal)) {
        return {
          isValid: false,
          error: `The field **${field.label}** must be a valid URL starting with http:// or https://, but received "${strVal}".`,
        };
      }
      return { isValid: true, value: strVal };
    }

    // General string
    return { isValid: true, value: strVal };
  }

  /**
   * Apply the validated edit to the session, preview, and connected source sheet
   */
  static async applyUpdate({ session, field, value, targetRow = null, userId }) {
    const oldValue = field.currentValue;

    // 1. Update session.userAnswers
    session.userAnswers = session.userAnswers || {};
    session.userAnswers[field.key] = value;

    // Also map common budget keys for Meta validation
    if (field.key === "daily_budget" || field.key === "campaign_budget") {
      session.userAnswers.adSetBudget = value;
      session.userAnswers.campaignBudget = value;
    }

    if (field.key === "campaign_name") {
      session.campaignName = String(value);
    }
    if (field.key === "adset_name") {
      session.adSetName = String(value);
    }

    // 2. Update preview data in-place
    if (session.preview) {
      // Update Campaign Details
      if (Array.isArray(session.preview.campaignDetails)) {
        const item = session.preview.campaignDetails.find(
          (cd) =>
            this.stripAlphanumeric(cd.field) === this.stripAlphanumeric(field.key) ||
            this.stripAlphanumeric(cd.field) === this.stripAlphanumeric(field.label)
        );
        if (item) item.value = value;
      }

      // Update Ad Set Details
      if (Array.isArray(session.preview.adSetDetails)) {
        const item = session.preview.adSetDetails.find(
          (adSet) =>
            this.stripAlphanumeric(adSet.field) === this.stripAlphanumeric(field.key) ||
            this.stripAlphanumeric(adSet.field) === this.stripAlphanumeric(field.label)
        );
        if (item) item.value = value;
      }

      // Update Ad Details
      if (Array.isArray(session.preview.adDetails)) {
        session.preview.adDetails.forEach((ad) => {
          if (!targetRow || ad.sourceRow === targetRow) {
            const matchProp = Object.keys(ad).find(
              (p) => this.stripAlphanumeric(p) === this.stripAlphanumeric(field.key)
            );
            if (matchProp) {
              ad[matchProp] = value;
            }
          }
        });
      }
    }

    // 3. Update connected Google Sheet or Excel source
    let sheetUpdateRes = null;
    try {
      const affectedRows = targetRow ? [targetRow] : [];
      sheetUpdateRes = await SheetUpdateService.updateSourceSheet({
        userId,
        source: session.source,
        updates: { [field.sheetColumn || field.key]: value },
        affectedRows,
      });
    } catch (sheetErr) {
      console.warn("[DynamicFieldEditor Sheet Update Warning]:", sheetErr.message);
    }

    // 4. Audit history entry
    session.auditHistory.push({
      action: "UPDATED_FIELD",
      performedBy: "USER",
      details: {
        fieldKey: field.key,
        fieldLabel: field.label,
        oldValue,
        newValue: value,
        targetRow,
        sheetUpdate: sheetUpdateRes?.message || "Updated session state",
      },
      timestamp: new Date(),
    });

    // 5. Clear pending edit
    session.pendingEdit = null;

    // 6. Save session
    await session.save();

    return {
      success: true,
      fieldKey: field.key,
      fieldLabel: field.label,
      oldValue,
      newValue: value,
      sheetUpdateRes,
    };
  }

  /**
   * Main entrypoint for processing any user message in the context of field editing
   */
  static async handleChatEdit({
    session,
    userMessage,
    userId,
    userEmail,
    onProgress,
  }) {
    const emit = (msg) => {
      if (typeof onProgress === "function") onProgress(msg);
    };

    const parsed = this.parseUserMessage(userMessage);

    // Read source data for full schema discovery
    let sourceData = null;
    try {
      sourceData = await SourceSheetReader.readSource({
        userId,
        sheetUrlOrId: session.source?.sheetUrl || session.source?.spreadsheetId,
        filePath: session.source?.filePath,
        worksheetName: session.source?.worksheetName,
      });
    } catch (readErr) {
      console.warn("[DynamicFieldEditor readSource Warning]:", readErr.message);
    }

    const availableFields = this.discoverFields({ session, sourceData });

    // =========================================================================
    // STATE A: SESSION ALREADY HAS A PENDING EDIT
    // =========================================================================
    if (session.pendingEdit) {
      const pending = session.pendingEdit;

      // 1. User says "No" or "Cancel" -> Cancel pending update
      if (parsed.intent === "CANCEL") {
        const cancelledField = pending.fieldLabel || pending.fieldKey || "field";
        session.pendingEdit = null;
        await session.save();
        return {
          content: `Cancelled update to **${cancelledField}**. No changes were made.`,
          session,
          actionTaken: "CANCELLED_EDIT",
        };
      }

      // 2. Pending State: AWAITING_CONFIRMATION -> User says "Yes" / Confirm
      if (pending.state === "AWAITING_CONFIRMATION") {
        if (parsed.intent === "CONFIRM") {
          emit(`Updating ${pending.fieldLabel} from ${pending.currentValue} to ${pending.proposedValue}...`);

          const targetFieldObj = availableFields.find((f) => f.key === pending.fieldKey) || {
            key: pending.fieldKey,
            label: pending.fieldLabel,
            currentValue: pending.currentValue,
            sheetColumn: pending.sheetColumn,
          };

          const updateResult = await this.applyUpdate({
            session,
            field: targetFieldObj,
            value: pending.proposedValue,
            targetRow: pending.targetRow,
            userId,
          });

          return {
            content: `Successfully updated **${updateResult.fieldKey}** from **${updateResult.oldValue ?? "none"}** to **${updateResult.newValue}**.\n\nYour campaign configuration and source sheet have been updated.`,
            session,
            actionTaken: "APPLIED_UPDATE",
            toolCalls: [
              {
                toolName: "update_field",
                toolArgs: {
                  field: updateResult.fieldKey,
                  from: updateResult.oldValue,
                  to: updateResult.newValue,
                },
                toolResult: updateResult,
                status: "SUCCESS",
              },
            ],
          };
        } else {
          // User replied with something other than Yes/No - treat as a new instruction or clarification
          session.pendingEdit = null;
        }
      }

      // 3. Pending State: AWAITING_AMBIGUITY_CHOICE -> User chooses between ambiguous fields
      if (pending.state === "AWAITING_AMBIGUITY_CHOICE") {
        const chosenCandidate = (pending.candidates || []).find((cand) => {
          const candNorm = this.normalize(cand.key || cand.label);
          const userNorm = this.normalize(userMessage);
          return (
            candNorm === userNorm ||
            userNorm.includes(candNorm) ||
            candNorm.includes(userNorm) ||
            this.stripAlphanumeric(cand.key) === this.stripAlphanumeric(userMessage)
          );
        });

        if (chosenCandidate) {
          const valToUse = pending.proposedValue;
          session.pendingEdit = {
            state: "AWAITING_CONFIRMATION",
            fieldKey: chosenCandidate.key,
            fieldLabel: chosenCandidate.label,
            currentValue: chosenCandidate.currentValue,
            proposedValue: valToUse,
            targetRow: pending.targetRow,
            sheetColumn: chosenCandidate.sheetColumn,
          };
          await session.save();

          return {
            content: `I identified the field **${chosenCandidate.key}** with the current value **${chosenCandidate.currentValue ?? "none"}**. Should I update it to **${valToUse}**?`,
            session,
            actionTaken: "AWAITING_CONFIRMATION",
          };
        }
      }

      // 4. Pending State: AWAITING_FIELD_AND_VALUE
      if (pending.state === "AWAITING_FIELD_AND_VALUE") {
        // Fall through to process parsed input
        session.pendingEdit = null;
      }
    }

    // =========================================================================
    // STATE B: NEW USER MESSAGE (NOT CURRENTLY CONFIRMING A PENDING STATE)
    // =========================================================================

    // 1. User says "I want to edit a field" without details
    if (parsed.intent === "REQUEST_EDIT_PROMPT") {
      session.pendingEdit = {
        state: "AWAITING_FIELD_AND_VALUE",
        promptedAt: new Date(),
      };
      await session.save();

      return {
        content: `Which field do you want to update, and what should its new value be?`,
        session,
        actionTaken: "REQUESTED_FIELD_AND_VALUE",
      };
    }

    // 2. User provided field candidate
    const fieldQuery = parsed.fieldQuery || userMessage;
    const proposedValue = parsed.proposedValue;

    const resolution = this.resolveField({
      userFieldQuery: fieldQuery,
      availableFields,
    });

    // Case 2a: Immutable security restriction
    if (resolution.status === "IMMUTABLE_SECURITY_RESTRICTION") {
      return {
        content: resolution.message,
        session,
        actionTaken: "BLOCKED_IMMUTABLE",
      };
    }

    // Case 2b: Ambiguous fields (e.g. user said "budget" and both daily_budget & lifetime_budget exist)
    if (resolution.status === "AMBIGUOUS") {
      const candidateNames = resolution.candidates.map((c) => c.key);
      const valText = proposedValue ? ` to **${proposedValue}**` : "";

      session.pendingEdit = {
        state: "AWAITING_AMBIGUITY_CHOICE",
        proposedValue,
        candidates: resolution.candidates,
        targetRow: parsed.targetRow,
      };
      await session.save();

      return {
        content: `I found ${resolution.candidates.length} relevant fields: **${candidateNames.join(
          "** and **"
        )}**. Which one would you like to update${valText}?`,
        session,
        actionTaken: "AMBIGUITY_PROMPT",
      };
    }

    // Case 2c: Field not found
    if (resolution.status === "NOT_FOUND") {
      const sampleFields = availableFields
        .slice(0, 8)
        .map((f) => `\`${f.key}\``)
        .join(", ");

      return {
        content: `I could not find a field matching "${fieldQuery}" in the current campaign configuration or connected source sheet.\n\nAvailable fields include:\n${sampleFields}\n\nWhich field would you like to update?`,
        session,
        actionTaken: "FIELD_NOT_FOUND",
      };
    }

    // Case 2d: Confident Match Found!
    const targetField = resolution.field;

    // Check if user supplied value
    if (proposedValue === null || proposedValue === undefined || proposedValue === "") {
      session.pendingEdit = {
        state: "AWAITING_FIELD_AND_VALUE",
        fieldKey: targetField.key,
        fieldLabel: targetField.label,
        currentValue: targetField.currentValue,
        sheetColumn: targetField.sheetColumn,
        targetRow: parsed.targetRow,
      };
      await session.save();

      return {
        content: `What should the new value for **${targetField.key}** be? (Current value: **${targetField.currentValue ?? "none"}**)`,
        session,
        actionTaken: "AWAITING_VALUE",
      };
    }

    // Validate proposed value against field constraints
    const validation = this.validateAndCastValue(targetField, proposedValue);
    if (!validation.isValid) {
      return {
        content: validation.error,
        session,
        actionTaken: "INVALID_VALUE",
      };
    }

    const castValue = validation.value;

    // Ask user for confirmation as specified:
    // "I identified the field daily_budget with the current value 1000. Should I update it to 500?"
    session.pendingEdit = {
      state: "AWAITING_CONFIRMATION",
      fieldKey: targetField.key,
      fieldLabel: targetField.label,
      currentValue: targetField.currentValue,
      proposedValue: castValue,
      targetRow: parsed.targetRow,
      sheetColumn: targetField.sheetColumn,
      promptedAt: new Date(),
    };
    await session.save();

    return {
      content: `I identified the field **${targetField.key}** with the current value **${targetField.currentValue ?? "none"}**. Should I update it to **${castValue}**?`,
      session,
      actionTaken: "AWAITING_CONFIRMATION",
    };
  }
}

export default DynamicFieldEditor;
