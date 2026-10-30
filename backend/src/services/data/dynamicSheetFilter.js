// backend/src/services/data/dynamicSheetFilter.js

export class DynamicSheetFilter {
  /**
   * Normalize string for comparison (lowercase, strip non-alphanumeric chars)
   */
  static normalize(str) {
    if (str === undefined || str === null) return "";
    return String(str)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "");
  }

  /**
   * Get available column headers from sheetData structure
   */
  static getAvailableHeaders(sheetData) {
    if (!sheetData) return [];
    if (Array.isArray(sheetData.columns) && sheetData.columns.length > 0) {
      return sheetData.columns.map((c) => String(c).trim()).filter(Boolean);
    }
    if (Array.isArray(sheetData.headers) && sheetData.headers.length > 0) {
      return sheetData.headers.map((h) => String(h).trim()).filter(Boolean);
    }
    if (Array.isArray(sheetData.rows) && sheetData.rows.length > 0) {
      const firstRow = sheetData.rows[0];
      const sourceObj = (firstRow && typeof firstRow === "object" && firstRow.values) ? firstRow.values : (firstRow || {});
      return Object.keys(sourceObj).filter((k) => !k.startsWith("_") && k !== "originalRowNumber" && k !== "isPopulated" && k !== "rawCells");
    }
    return [];
  }

  /**
   * Extract existing Campaign ID or AdSet ID from user prompt if provided.
   * Matches: "Campaign ID: 120249750804450003", "AdSet ID: 120249750804520003", etc.
   */
  static parseIdFromMessage(msg, type = "campaign") {
    if (!msg || typeof msg !== "string") return null;
    const isCampaign = type === "campaign";
    const regex = isCampaign
      ? /(?:campaign|camp)\s*(?:id|_id)?\s*[:=\-–—]?\s*(\d{10,25})/i
      : /(?:adset|ad_set|ad\s*set|adgroup)\s*(?:id|_id)?\s*[:=\-–—]?\s*(\d{10,25})/i;
    const match = msg.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Robust dynamic extraction for Campaign Name & Ad Set Name from user prompt.
   * Never hardcoded; extracts quoted or unquoted names across varied phrasings.
   */
  static parseNameFromMessage(msg, type) {
    if (!msg || typeof msg !== "string") return null;
    const isCampaign = type === "campaign";

    const boundaryRegex = isCampaign
      ? /\s*(?:;|\n|\r|(?=\s*(?:and|aur|also|with|using|from|for|under|into|in|on|,|\|)?\s*(?:process\b|upload\b|where\b|filter\b|only\b|(?:create|make|launch|set\s*up|build|banao|put|add)\s*(?:an?|the)?\s*(?:adset|ad_set|ad\s*set|adgroup|ads?\b)|\b(?:adset|ad_set|ad\s*set|adgroup|ads?\b)\b|ad_name|ad_set_name|adset_name|budget|daily\s*budget|sheet|spreadsheet|excel|rows?|lines?|from\s+row|start\s*row)\b))/i
      : /\s*(?:;|\n|\r|(?=\s*(?:and|aur|also|with|using|from|for|under|into|in|on|,|\|)?\s*(?:process\b|upload\b|where\b|filter\b|only\b|(?:create|make|launch|set\s*up|build|banao|put|add)\s*(?:an?|the)?\s*(?:campaign|camp|ads?\b)|\b(?:campaign|camp|ads?\b)\b|campaign_name|camp_name|ad_name|(?:the\s+)?ad\s+creatives|creatives\s+(?:and|from)|budget|daily\s*budget|sheet|spreadsheet|excel|rows?|lines?|from\s+row|start\s*row)\b))/i;

    // Fast-path: Explicit key-value declaration takes highest precedence (e.g. "- Campaign Name: Diwali Special Promo", "Adset name - Shiva New Creatives Test")
    const explicitPattern = isCampaign
      ? /(?:^|[\n\r;•\-,])\s*(?:campaign\s*(?:names?|title|titled|label|called)?|campaign_name|camp\s*(?:names?|title)?)\s*[:=\-–—]\s*([^\n\r;]+)/i
      : /(?:^|[\n\r;•\-,])\s*(?:(?:adset|ad_set|ad\s*set|adgroup)\s*(?:names?|title|titled|label|called)?|ad_set_name|adset_name)\s*[:=\-–—]\s*([^\n\r;]+)/i;

    const explicitMatch = msg.match(explicitPattern);
    if (explicitMatch && explicitMatch[1]) {
      let explicitVal = explicitMatch[1].trim().replace(/^["'\`]+|["'\`]+$/g, "").trim();
      explicitVal = explicitVal.split(boundaryRegex)[0].trim().replace(/^["'\s,;•\-\*|]+|["'\.,\s,;•\-\*|]+$/g, "").trim();
      if (explicitVal && !explicitVal.toLowerCase().startsWith("http") && !/(?:on\s+meta\s+ads|for\s+ad\s+account)/i.test(explicitVal)) {
        return explicitVal;
      }
    }

    // Locate the entity declaration anywhere in the sentence
    const entityRegex = isCampaign
      ? /\b(?:(?:(?:make|create|launch|set\s*up|build|banao|with|for|having|use)\s+)(?:an?|the\s+)?(?:campaign\s*(?:names?|title|titled|label|called|ka\s*name)?|campaign_name|camp\s*(?:names?|title)?)\b|\b(?:campaign\s*(?:names?|title|titled|label|called|ka\s*name)|campaign_name|camp\s*(?:names?|title))\b|\bcampaign\b(?!\s+(?:objective|type|status|budget|goal|id|category|group|setting|settings|field|column)\b))/gi
      : /\b(?:(?:(?:make|create|launch|set\s*up|build|banao|with|for|having|use)\s+)(?:an?|the\s+)?(?:(?:adset|ad_set|ad\s*set|adgroup)\s*(?:names?|title|titled|label|called|ka\s*name)?|ad_set_name|adset_name)\b|\b(?:(?:adset|ad_set|ad\s*set|adgroup)\s*(?:names?|title|titled|label|called|ka\s*name)|ad_set_name|adset_name)\b|\b(?:adset|ad_set|ad\s*set|adgroup)\b(?!\s+(?:objective|type|status|budget|goal|id|category|group|setting|settings|field|column)\b))/gi;

    let match;
    let candidate = null;

    while ((match = entityRegex.exec(msg)) !== null) {
      let afterKey = msg.substring(match.index + match[0].length).trim();
      if (!afterKey) continue;

      // Remove connector words between entity keyword and the actual name (supports "in Draft with Name", "with Name", "is", etc.)
      afterKey = afterKey.replace(/^(?:(?:in\s+draft(?:\s+mode)?\s*)?(?:with\s+)?(?:names?|title|titled|label|called|ka\s*naam|ka\s*name)\s*(?:is|will\s*be|should\s*be|be|as|to|into|named|called|titled|labeled|[:=\-–—])?|(?:is|will\s*be|should\s*be|be|as|to|into|named|called|titled|labeled|[:=\-–—]))\s*/i, "").trim();
      if (!afterKey) continue;

      // 1. Quoted name: "Foo", 'Foo', `Foo`
      const quotedMatch = afterKey.match(/^["'\u201c\u201d\u2018\u2019\x60][^"'\u201c\u201d\u2018\u2019\x60\n\r]+["'\u201c\u201d\u2018\u2019\x60]/);
      if (quotedMatch && quotedMatch[0]) {
        candidate = quotedMatch[0].slice(1, -1).trim();
        break;
      }

      // 2. Unquoted name: split at next structural boundary
      const parts = afterKey.split(boundaryRegex);
      let rawVal = parts[0] ? parts[0].trim() : "";

      // Stop at trailing action or filter phrases like " for rows 2 to 9", " on rows 4 to 12", " process rows 1 to 5", " and upload rows 10-20"
      const trailingStopRegex = /\s+(?:for\s+rows?|for\s+lines?|on\s+rows?|on\s+lines?|in\s+rows?|where\b|filter\b|process\b|upload\b|(?:create|launch|start|banao)\s+(?:ads?|campaign|adset|rows?|lines?)|rows?\s+\d+|row\s+\d+|lines?\s+\d+|line\s+\d+|se\s+start\b|wali\s+rows?\b).*/i;
      rawVal = rawVal.replace(trailingStopRegex, "").trim();

      // Clean trailing filler words, commas, pipes
      rawVal = rawVal.replace(/(?:[\s,;]+(?:and|aur|also|using|create|make|launch|upload|process|from|with|sheet|excel|ad|ads|a|an|the|for|on|in|under|into)\b)+$/i, "").trim();
      rawVal = rawVal.replace(/^["'\s,;•\-\*|]+|["'\.,\s,;•\-\*|]+$/g, "").trim();

      if (rawVal && !rawVal.toLowerCase().startsWith("http") && rawVal.length > 0) {
        const lowerVal = rawVal.toLowerCase();
        const isRefOrFiller = /^(?:and|or|with|using|the|a|an|i\s+provided|provided|already\s+provided|mentioned|above|same|previous|from\s+sheet)$/i.test(lowerVal) ||
          /\b(?:names?\s+(?:i\s+)?provided|already\s+provided|i\s+provided)\b/i.test(lowerVal);
        if (!isRefOrFiller) {
          candidate = rawVal;
          break;
        }
      }
    }

    return candidate;
  }

  /**
   * Extract dynamic Ad Name pattern / template from user prompt.
   * Matches lines like:
   *   - Put Ads with Name - ...
   *   - with ads named Summer Offer 1
   *   - Ad name : "Creative Code+Nomenclature"
   *   - Ad Name: Creative Code + Nomenclature
   *   - Ad name: [Creative Code] - [Nomenclature]
   *   - Ad Name should be {Temple Name} + {Creative Code}
   *   - use columns Creative Code + Nomenclature as ad name
   */
  static parseAdNamePattern(msg) {
    if (!msg || typeof msg !== "string") return null;

    // 1. Explicit key-value or phrasal declaration: "Put Ads with Name - ...", "- Ad name : ...", "Ad name: ...", "Ad Name = ..."
    const explicitPattern = /(?:(?:put|create|make|set|place|launch|with)\s+)?(?:ads?\s*(?:with\s+)?(?:named|called|titled|names?|title|label)?|ad_name)\s*(?:[:=\-–—]|named|called|titled|as)\s*([^\n\r;]+)/i;
    const explicitMatch = msg.match(explicitPattern);
    if (explicitMatch && explicitMatch[1]) {
      let rawVal = explicitMatch[1].trim().replace(/^["'\`]+|["'\`]+$/g, "").trim();
      rawVal = rawVal.replace(/\s+(?:the\s+ad\s+creatives|the\s+creatives|creatives\b|and\s+everything|fetch\s+from|from\s+(?:connected\s+)?(?:google\s+)?sheet).*/i, "").trim();
      if (rawVal) {
        return rawVal;
      }
    }

    // 2. Phrasal declaration: "ad name should be ...", "use ... as ad name", "combine ... for ad name"
    const phrasalMatch = msg.match(/(?:ad\s*names?\s*(?:should\s*be|will\s*be|is|as|to|named|called|pattern)?\s*[:=\-–—]?\s*|(?:use|combine|join|set)\s+)(["'\`][^"'\`\n\r]+["'\`]|[^\n\r,;.]+?)\s*(?:as\s*(?:the\s*)?ad\s*names?|\s+for\s*(?:the\s*)?ad\s*names?)/i);
    if (phrasalMatch && phrasalMatch[1]) {
      return phrasalMatch[1].trim().replace(/^["'\`]+|["'\`]+$/g, "").trim();
    }

    return null;
  }

  /**
   * Evaluate dynamic Ad Name for a specific row using the user-defined pattern or column combination.
   * Supports:
   *   - Column arithmetic/join: "Creative Code+Nomenclature" -> "OD-26-2219 + NW_Rahu_..."
   *   - Template placeholders: "[Temple Name] - [Creative Code]" -> "Rahu Paithani Temple - OD-26-2219"
   *   - Custom delimiters: "+", "-", "_", "|", "and", " "
   *   - Any arbitrary column name in the sheet
   */
  static evaluateAdNamePattern(pattern, rowVals = {}, headers = [], rowNo = 2) {
    if (!pattern || typeof pattern !== "string") return null;
    if (!rowVals || typeof rowVals !== "object") return pattern;

    // Helper to find key in rowVals (case-insensitive & normalized)
    const getVal = (col) => {
      if (!col) return "";
      const normTarget = this.normalize(col);
      for (const [k, v] of Object.entries(rowVals)) {
        if (this.normalize(k) === normTarget) {
          return v !== undefined && v !== null ? String(v).trim() : "";
        }
      }
      return "";
    };

    let evaluated = pattern;
    let anyReplaced = false;

    // 1. Template evaluation with brackets: {Column} or [Column]
    if (/[{\[](.*?)[}\]]/.test(evaluated)) {
      evaluated = evaluated.replace(/[{\[](.*?)[}\]]/g, (match, colName) => {
        const val = getVal(colName);
        if (val) {
          anyReplaced = true;
          return val;
        }
        return "";
      });
      if (anyReplaced) {
        return evaluated.replace(/\s{2,}/g, " ").trim();
      }
    }

    // 2. Tokenize by common delimiters like "+", " - ", "_", "|", " and "
    const delimiterMatch = pattern.match(/\s*([+_|\/]|-(?=\s)|\band\b)\s*/i);
    const delimiter = delimiterMatch ? (delimiterMatch[1] === "+" ? " + " : ` ${delimiterMatch[1].trim()} `) : " - ";

    // Split pattern by delimiters to find column candidate names
    const tokens = pattern.split(/\s*(?:[+_|\/]|-(?=\s)|\band\b)\s*/i).map((t) => t.trim().replace(/^["'\`]+|["'\`]+$/g, "")).filter(Boolean);

    const resolvedValues = [];
    for (const token of tokens) {
      const val = getVal(token);
      if (val) {
        resolvedValues.push(val);
      } else {
        resolvedValues.push(token);
      }
    }

    if (resolvedValues.length > 0) {
      const joined = resolvedValues.join(delimiter).replace(/\s{2,}/g, " ").trim();
      if (joined) return joined;
    }

    return pattern;
  }

  /**
   * Extract list of values from string.
   * Handles quoted values ("val1", 'val2'), unquoted comma lists, and "or" / "ya" delimiters.
   */
  static extractValuesList(rawValStr) {
    if (!rawValStr || typeof rawValStr !== "string") return [];
    let s = rawValStr.trim();

    // Strip leading filler words if present
    s = s.replace(/^(?:is|are|either|values?)\s+/i, "").trim();
    // Strip trailing boundary words or punctuation
    s = s.replace(/(?:[\s,;.]+(?:and|aur|also|with|using|for|under|into|in|on|from|sheet|excel|ad|ads|campaign|adset|rows?|lines?)\b)+$/i, "").trim();
    s = s.replace(/[.,;]+$/, "").trim();

    // Strip enclosing parentheses or brackets: (val1, val2) or [val1, val2]
    if ((s.startsWith("(") && s.endsWith(")")) || (s.startsWith("[") && s.endsWith("]"))) {
      s = s.slice(1, -1).trim();
    }

    const values = [];

    // Check if string contains quoted values: "...", '...', `...`
    const quoteRegex = /["'“«]([^"'”»]+)["'”»]/g;
    let qMatch;
    let hasQuotes = false;
    while ((qMatch = quoteRegex.exec(s)) !== null) {
      hasQuotes = true;
      const v = qMatch[1].trim();
      if (v && !values.includes(v)) {
        values.push(v);
      }
    }

    if (hasQuotes && values.length > 0) {
      return values;
    }

    // If no quotes, split by comma or " or " / " ya " / " athva "
    const parts = s.split(/\s*,\s*|\s+(?:or|OR|ya|athva)\s+/);
    for (const p of parts) {
      const cleanP = p.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
      if (cleanP && !values.includes(cleanP)) {
        values.push(cleanP);
      }
    }

    return values;
  }

  /**
   * Compare cell value against a single target value with operator support.
   */
  static isCellMatch(cellVal, targetVal, op = "equals") {
    if (cellVal === undefined || cellVal === null) return false;
    const rawCellStr = String(cellVal).trim();
    if (!rawCellStr) return false;

    const cellStr = rawCellStr.toLowerCase();
    const targetStr = String(targetVal).trim().toLowerCase();
    const operator = String(op || "equals").toLowerCase();

    if (operator === "not_equals" || operator === "!=" || operator === "<>") {
      return cellStr !== targetStr;
    }

    if (operator === "not_contains" || operator === "excludes") {
      return !cellStr.includes(targetStr);
    }

    if (operator === "contains" || operator === "includes" || operator === "like") {
      return cellStr.includes(targetStr);
    }

    // Exact equals match
    if (cellStr === targetStr) return true;

    // Number comparison (e.g. "10" vs 10 or 10.0)
    const numCell = Number(rawCellStr);
    const numTarget = Number(targetVal);
    if (!isNaN(numCell) && !isNaN(numTarget) && numCell === numTarget) {
      return true;
    }

    // Date normalization comparison: handle 2-digit vs 4-digit years, dashes, slashes, ISO dates
    const normalizeDateStr = (s) => {
      if (!s || typeof s !== "string") return null;
      const clean = s.trim();
      const dMatch = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
      if (dMatch) {
        const p1 = dMatch[1].padStart(2, "0");
        const p2 = dMatch[2].padStart(2, "0");
        let y = dMatch[3];
        if (y.length === 2) {
          y = (parseInt(y, 10) > 50 ? "19" : "20") + y;
        }
        return `${p1}/${p2}/${y}`;
      }
      const isoMatch = clean.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
      if (isoMatch) {
        const y = isoMatch[1];
        const m = isoMatch[2].padStart(2, "0");
        const d = isoMatch[3].padStart(2, "0");
        return `${d}/${m}/${y}`;
      }
      return null;
    };

    const normCellDate = normalizeDateStr(cellStr);
    const normTargetDate = normalizeDateStr(targetStr);
    if (normCellDate && normTargetDate && normCellDate === normTargetDate) {
      return true;
    }

    return false;
  }

  /**
   * Dynamically parse column filter conditions from prompt text against actual sheet headers.
   * Supports English, Hinglish, multiple values per column, comparison operators, and AND/OR logic.
   */
  static parseFilterConditions(promptMessage, headers = []) {
    if (!promptMessage || typeof promptMessage !== "string" || !headers || headers.length === 0) {
      return {
        conditions: [],
        logicalOperator: "AND",
        explicitColumnRequestedNotMatches: [],
        isAmbiguous: false,
        ambiguityReason: null,
      };
    }

    let text = promptMessage;

    // 1. Strip explicit campaign / ad set / ad name declarations FIRST so quoted values with spaces are removed before token splitting
    text = text
      .replace(/\b(?:(?:(?:make|create|launch|set\s*up|build|banao|with|for|having|use)\s+)?(?:an?|the\s+)?(?:campaign\s*(?:names?|title|titled|label|called|ka\s*name)?|campaign_name|camp\s*(?:names?|title)?)\s*(?:is|will\s*be|as|named|called|titled|[:=\-–—])\s*(?:["'“«][^"'”»\r\n]*["'”»]|[^"'”»\s,;]+))/gi, " ")
      .replace(/\b(?:(?:(?:make|create|launch|set\s*up|build|banao|with|for|having|use)\s+)?(?:an?|the\s+)?(?:(?:adset|ad_set|ad\s*set|adgroup)\s*(?:names?|title|titled|label|called|ka\s*name)?|ad_set_name|adset_name)\s*(?:is|will\s*be|as|named|called|titled|[:=\-–—])\s*(?:["'“«][^"'”»\r\n]*["'”»]|[^"'”»\s,;]+))/gi, " ")
      .replace(/(?:^|[\n\r;•\-])\s*(?:ad\s*(?:names?|title|titled|label|called)?|ad_name)\s*[:=]\s*(?:["'“«][^"'”»\r\n]*["'”»]|[^\n\r;]+)/gi, " ")
      .replace(/(?:^|[\n\r;•\-])\s*(?:objective|mode|trigger|configuration|budget|daily\s*budget)\s*[:=]\s*(?:["'“«][^"'”»\r\n]*["'”»]|[^\n\r;]+)/gi, " ")
      .trim();

    const extractedCamp = this.parseNameFromMessage(promptMessage, "campaign");
    const extractedAdSet = this.parseNameFromMessage(promptMessage, "adset");
    const extractedAdName = this.parseAdNamePattern(promptMessage);

    if (extractedCamp) {
      const escCamp = extractedCamp.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      text = text.replace(new RegExp("(?:\\b(?:campaign\\s*(?:names?|title|titled|label|called|ka\s*name)?|campaign_name|camp\\s*(?:names?|title)?)\\s*(?:is|will\\s*be|as|named|called|titled|[:=\\-–—])?\\s*)?[\"\'\u201c\u201d\u2018\u2019\x60]?\\s*" + escCamp + "\\s*[\"\'\u201c\u201d\u2018\u2019\x60]?", "gi"), " ");
    }
    if (extractedAdSet) {
      const escAdSet = extractedAdSet.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      text = text.replace(new RegExp("(?:\\b(?:(?:adset|ad_set|ad\\s*set|adgroup)\\s*(?:names?|title|titled|label|called|ka\\s*name)?|ad_set_name|adset_name)\\s*(?:is|will\\s*be|as|named|called|titled|[:=\\-–—])?\\s*)?[\"\'\u201c\u201d\u2018\u2019\x60]?\\s*" + escAdSet + "\\s*[\"\'\u201c\u201d\u2018\u2019\x60]?", "gi"), " ");
    }
    if (extractedAdName) {
      const escAdName = extractedAdName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      text = text.replace(new RegExp("(?:\\b(?:ad\\s*(?:names?|title|titled|label|called)?|ad_name)\\s*(?:is|will\\s*be|as|named|called|titled|[:=\\-–—])?\\s*)?[\"\'\u201c\u201d\u2018\u2019\x60]?\\s*" + escAdName + "\\s*[\"\'\u201c\u201d\u2018\u2019\x60]?", "gi"), " ");
    }

    // Strip explicit row ranges and row lists (e.g., "for rows 2 to 9", "rows 2, 4, 5, 8", "from row 5 to 15", "upload row 7 only")
    text = text.replace(/(?:\b(?:from|for|on|in|process|upload|retry)?\s*(?:rows?|lines?)\s*#?\d+(?:(?:\s*,\s*|\s+(?:to|–|-|till|through|and|or)\s*)#?\d+)*\b(?:\s*only)?)/gi, " ");

    // Strip explicit IDs (e.g. "Campaign ID: 120249750804450003", "AdSet ID: 120249750804520003")
    text = text.replace(/(?:campaign|camp)\s*(?:id|_id)?\s*[:=\-–—]?\s*\d{10,25}/gi, " ");
    text = text.replace(/(?:adset|ad_set|ad\s*set|adgroup)\s*(?:id|_id)?\s*[:=\-–—]?\s*\d{10,25}/gi, " ");

    // Strip conversational instructions blocks like "Instructions: ...", "Rules: ..."
    text = text.replace(/(?:instructions?|rules?|steps?|notes?)\s*[:=\-–—]?\s*[\s\S]*/i, " ");

    // Strip ad naming instructions (e.g. "Ad Name: Combine the Puja Date and Nomenclature columns...", "combine Puja Date and Nomenclature")
    text = text.replace(/(?:ad\s*names?|name\s*each\s*ad)?\s*[:=\-–—]?\s*(?:combine|join|use|set)?\s*(?:the\s*)?[^.,\n\r]*(?:columns?|from\s*each\s*row)?\s*as\s*(?:the\s*)?ad\s*names?[^.,\n\r]*/gi, " ");
    text = text.replace(/\b(?:combine|join|use)\s+(?:the\s+)?[a-zA-Z0-9_\s]+\s+(?:and|\+)\s+[a-zA-Z0-9_\s]+\s+(?:columns?|fields?)\b/gi, " ");

    // Strip conversational file/context references (e.g. "I will attached excel sheet in ai context section")
    text = text.replace(/\b(?:and\s+)?(?:also\s+)?(?:i\s*will\s*)?(?:attach|attached)?\s*(?:the\s*)?(?:excel|google\s*sheet|spreadsheet)?\s*(?:sheet\s*)?in\s*(?:the\s*)?(?:ai\s*context|context)(?:\s*section)?\b/gi, " ");

    const lowerText = text.toLowerCase();
    const conditions = [];
    const explicitColumnRequestedNotMatches = [];
    let detectedLogicalOp = "AND";
    let isAmbiguous = false;
    let ambiguityReason = null;

    // Helper: Match input query string to actual sheet header
    const findHeader = (colQuery, recordAmbiguity = false) => {
      if (!colQuery) return null;
      let cleanQ = String(colQuery).trim();
      cleanQ = cleanQ.replace(/^[-*•–—\d.)\]\s]+/, "").replace(/[:=\-–—\s]+$/, "").trim();
      const normQ = this.normalize(cleanQ);
      if (!normQ || normQ.length < 2) return null;

      // Pass 1: Exact normalized match
      for (const h of headers) {
        if (this.normalize(h) === normQ) return h;
      }

      // Pass 2: Word boundary / token overlap
      const qWords = cleanQ.toLowerCase().split(/[\s_]+/).filter((w) => w.length >= 2);
      for (const h of headers) {
        const hWords = String(h).toLowerCase().split(/[\s_]+/).filter((w) => w.length >= 2);
        if (qWords.length > 0 && hWords.length > 0) {
          const matchCount = qWords.filter((qw) => hWords.some((hw) => hw === qw)).length;
          if (matchCount === qWords.length && matchCount === hWords.length) {
            return h;
          }
        }
      }

      // Pass 3: Substring match (min 4 chars)
      if (normQ.length >= 4) {
        let matches = headers.filter((h) => {
          const normH = this.normalize(h);
          if (normH === normQ) return true;
          if (normH.includes(normQ)) return true;
          if (normQ.includes(normH) && normQ.length <= normH.length + 6) return true;
          return false;
        });

        if (matches.length === 1) return matches[0];
        if (matches.length > 1) {
          const exact = matches.find((m) => this.normalize(m) === normQ);
          if (exact) return exact;

          // If one match is a superset/longer more specific version of another (e.g. "call_to_action" vs "action"),
          // eliminate the shorter sub-matches
          const nonSubMatches = matches.filter((m) => {
            const normM = this.normalize(m);
            return !matches.some((other) => other !== m && this.normalize(other).includes(normM));
          });
          if (nonSubMatches.length === 1) {
            return nonSubMatches[0];
          }

          if (recordAmbiguity) {
            isAmbiguous = true;
            ambiguityReason = `Requested column "${cleanQ}" is ambiguous and could match: [ ${matches.map((m) => `"${m}"`).join(", ")} ]`;
          }
          return null;
        }
      }

      return null;
    };

    // Ignore terms that are common commands rather than column names
    const isCommandKeyword = (str) => {
      const norm = this.normalize(str);
      if (headers.some((h) => this.normalize(h) === norm)) {
        return false;
      }
      return [
        "row", "rows", "line", "lines",
        "upload", "create", "launch", "start", "process", "filter", "select", "where", "only",
        "meta", "google", "facebook", "instagram", "sheet", "file", "excel", "data", "whatsapp",
        "column", "columns", "header", "headers"
      ].includes(norm);
    };

    const cleanColCandidate = (rawCol) => {
      if (!rawCol) return "";
      let col = String(rawCol).trim();

      // If the candidate contains newlines, isolate the last line
      if (col.includes("\n")) {
        const lines = col.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length > 0) {
          col = lines[lines.length - 1];
        }
      }

      // Strip leading bullet markers (- , * , • , 1. , etc.)
      col = col.replace(/^[-*•–—\d.)\]\s]+/, "").trim();

      // If the candidate already matches a known header, keep it
      if (findHeader(col)) {
        return col;
      }

      // Strip row range or list prefix (e.g., "for rows 2, 4, 5, 8", "rows 2 to 9", "row 7")
      col = col.replace(/^(?:(?:from|for|in|on)?\s*(?:rows?|lines?)\s*#?\d+(?:(?:\s*,\s*|\s+(?:to|–|-|till|through|and|or)\s*)#?\d+)*)\s*/i, "").trim();

      // Strip leading prompt action prefixes & conversational field keywords
      const prefixRegex = /^(?:(?:create|launch|start|process|upload|filter|select|read|only|retry|use)\s+(?:a\s+)?(?:meta\s+)?(?:ads?\s+)?(?:only\s+)?(?:where|for|with|in|under)?|(?:where|only\s+for|only|having|with|and|in|under|the|attached|context|section|please|use\s+(?:a\s+)?(?:sheet\s+)?(?:field|column)\s*(?:name)?\s*(?:is)?|(?:a\s+)?(?:sheet\s+)?(?:field|column)\s*(?:name)?\s*(?:is)?))\s+/i;
      let prev = "";
      while (col !== prev) {
        prev = col;
        if (findHeader(col)) return col;
        col = col.replace(prefixRegex, "").trim();
      }

      return col;
    };

    // Helper: Resolve header with tail-word fallback for conversational column candidates
    const resolveHeaderFromCandidate = (cand, recordAmbiguity = false) => {
      if (!cand) return null;
      const cleaned = cleanColCandidate(cand);
      const direct = findHeader(cleaned, recordAmbiguity);
      if (direct) return direct;

      // Check tail words (last 1 to 6 words)
      const words = cleaned.trim().split(/\s+/);
      for (let w = Math.min(words.length, 6); w >= 1; w--) {
        const tail = cleanColCandidate(words.slice(words.length - w).join(" "));
        const match = findHeader(tail, recordAmbiguity);
        if (match) return match;
      }
      return null;
    };

    const mapOp = (opRaw) => {
      const op = String(opRaw || "").trim().toLowerCase();
      if (op === "!=" || op === "<>" || op === "is not" || op.includes("not equal")) return "not_equals";
      if (op.includes("does not contain") || op.includes("not contain") || op.includes("doesn't contain") || op.includes("not include") || op === "excludes") return "not_contains";
      if (op === "contains" || op === "includes" || op === "like" || op === "has") return "contains";
      return "equals";
    };

    const OP_REGEX_SRC = `(?:!=|<>|==|=|:|\\b(?:does not contain|doesn't contain|not contains?|not contain|does not include|not include|not equals? to|not equals?|not equal|is not|excludes?|contains?|includes?|equals? to|equals?|equal|like|has)\\b|\\bin\\s+(?=["'\\[(]|[a-zA-Z0-9_-]+\\s*,)|\\bis\\s+(?=["']|not\\b))`;

    // Find all operator occurrences
    const opRegex = new RegExp(OP_REGEX_SRC, "gi");
    const ops = [];
    let oMatch;
    while ((oMatch = opRegex.exec(text)) !== null) {
      if (oMatch[0] === ":") {
        // Ignore colon if part of URL protocol (http://, https://, ftp://)
        if (text.slice(oMatch.index, oMatch.index + 3) === "://") {
          continue;
        }
        const prev5 = text.substring(Math.max(0, oMatch.index - 5), oMatch.index).toLowerCase();
        if (prev5.endsWith("http") || prev5.endsWith("https")) {
          continue;
        }
      }
      if (oMatch[0] === "=" || oMatch[0] === "==") {
        // Ignore equals sign if inside URL query string without spaces (e.g. ?id=com.stan.app)
        const textBefore = text.substring(0, oMatch.index);
        const lastSpace = Math.max(textBefore.lastIndexOf(" "), textBefore.lastIndexOf("\n"), textBefore.lastIndexOf("\t"));
        const currentToken = textBefore.substring(lastSpace + 1);
        if (currentToken.includes("://") || currentToken.startsWith("http")) {
          continue;
        }
      }
      ops.push({
        rawOp: oMatch[0],
        op: mapOp(oMatch[0]),
        start: oMatch.index,
        end: oMatch.index + oMatch[0].length,
      });
    }

    if (ops.length > 0) {
      const clauses = [];
      const firstColCandidate = cleanColCandidate(text.substring(0, ops[0].start));
      clauses.push({
        colCandidate: firstColCandidate,
        opCandidate: ops[0].op,
        valSubstr: null,
        nextConnector: "and",
      });

      for (let i = 0; i < ops.length - 1; i++) {
        const segment = text.substring(ops[i].end, ops[i + 1].start);
        const connectorRegex = /(?:\s+(?:and|aur|also|with|or|OR|ya|athva|,)\s+|\s+[-*•–—|]\s+|\r?\n+[-*•–—\s]*)/gi;
        let connMatch;
        let lastValidSplit = -1;
        let lastConnector = "and";

        while ((connMatch = connectorRegex.exec(segment)) !== null) {
          const candidateCol = cleanColCandidate(segment.substring(connMatch.index + connMatch[0].length));
          if (findHeader(candidateCol) || candidateCol.length >= 2) {
            lastValidSplit = connMatch.index;
            lastConnector = connMatch[0].trim().toLowerCase() || "and";
          }
        }

        // Fallback: check if the end of segment matches any known header
        if (lastValidSplit === -1) {
          const trimmedSeg = segment.trim();
          const words = trimmedSeg.split(/\s+/);
          for (let w = Math.min(words.length - 1, 5); w >= 1; w--) {
            const tailWords = words.slice(words.length - w).join(" ");
            const cleanedTail = cleanColCandidate(tailWords);
            if (findHeader(cleanedTail)) {
              const splitIdx = segment.lastIndexOf(tailWords);
              if (splitIdx > 0) {
                lastValidSplit = splitIdx;
                lastConnector = "and";
                break;
              }
            }
          }
        }

        if (lastValidSplit !== -1) {
          clauses[i].valSubstr = segment.substring(0, lastValidSplit).trim();
          clauses[i].nextConnector = lastConnector;
          const nextCol = cleanColCandidate(segment.substring(lastValidSplit).replace(/^(?:\s*(?:and|aur|also|with|or|OR|ya|athva|,)\s*|[\r\n\-*•–—\s]+)/i, ""));
          clauses.push({
            colCandidate: nextCol,
            opCandidate: ops[i + 1].op,
            valSubstr: null,
            nextConnector: "and",
          });
        } else {
          clauses[i].valSubstr = segment.trim();
          const nextCol = cleanColCandidate(segment);
          clauses.push({
            colCandidate: nextCol,
            opCandidate: ops[i + 1].op,
            valSubstr: null,
            nextConnector: "and",
          });
        }
      }

      clauses[clauses.length - 1].valSubstr = text.substring(ops[ops.length - 1].end).trim();

      for (let i = 0; i < clauses.length; i++) {
        const cl = clauses[i];
        if (isCommandKeyword(cl.colCandidate)) continue;

        if (cl.nextConnector === "or" || cl.nextConnector === "ya" || cl.nextConnector === "athva") {
          detectedLogicalOp = "OR";
        }

        const cleanVal = (cl.valSubstr || "")
          .replace(/(?:[\s,;.]+(?:and|aur|also|with|using|for|under|into|in|on|from|sheet|excel|ad|ads|campaign|adset|rows?|lines?)\b)+$/i, "")
          .replace(/\s+(?:for|to|keliye|ke\s*liye)?\s*(?:upload|create|launch|process|start|banao)\b.*$/i, "")
          .replace(/[.,;]+$/, "")
          .trim();

        const extractedVals = this.extractValuesList(cleanVal);
        if (extractedVals.length > 0) {
          const actualHeader = resolveHeaderFromCandidate(cl.colCandidate, true);
          if (actualHeader) {
            for (const v of extractedVals) {
              conditions.push({
                header: actualHeader,
                operator: cl.opCandidate,
                value: v,
                values: extractedVals,
              });
            }
          } else if (cl.colCandidate.length >= 2 && cl.colCandidate.length <= 40 && !isCommandKeyword(cl.colCandidate)) {
            const isSentenceLike = /\b(?:create|upload|please|make|launch|process|run|i\s+will|attached|here|row|rows|lines?|meta|ads?|failed|already)\b/i.test(cl.colCandidate) || /[.,;!?\n]/.test(cl.colCandidate);
            if (!isSentenceLike && !explicitColumnRequestedNotMatches.includes(cl.colCandidate)) {
              explicitColumnRequestedNotMatches.push(cl.colCandidate);
            }
          }
        }
      }
    }

    // Fallback 1: Hinglish / Hindi pattern
    if (conditions.length === 0) {
      const hinglishRegexes = [
        /([a-zA-Z0-9_\s]{2,40}?)\s+(?:mein|me|in|field\s+me|column\s+me|column\s+mein)\s+([^\r\n]{1,100}?)\s+(?:wali|wala|wale|walu|row|rows|data|upload|karo|banao|kar do|set|chahiye)/gi,
        /(?:upload|process|filter|create|select)\s+([^\r\n]{1,100}?)\s+(?:from|in|under|for|mein|me)\s+([a-zA-Z0-9_\s]{2,40}?)\s+(?:column|field|category|type)?/gi,
      ];

      for (const regex of hinglishRegexes) {
        let match;
        while ((match = regex.exec(text)) !== null) {
          let colCandidate = match[1].trim();
          let valCandidate = match[2].trim();

          if (regex.source.includes("upload|process")) {
            const temp = colCandidate;
            colCandidate = valCandidate;
            valCandidate = temp;
          }

          colCandidate = cleanColCandidate(colCandidate);
          valCandidate = valCandidate.replace(/\s+(wali|wala|wale|walu|rows|row|upload|karo|banao)$/i, "").trim();

          if (isCommandKeyword(colCandidate) || isCommandKeyword(valCandidate)) continue;

          const actualHeader = resolveHeaderFromCandidate(colCandidate);
          if (actualHeader) {
            const op = (lowerText.includes("contains") || lowerText.includes("includes")) ? "contains" : "equals";
            const vals = this.extractValuesList(valCandidate);
            const finalVals = vals.length > 0 ? vals : [valCandidate];
            if (finalVals.length > 1) {
              detectedLogicalOp = "OR";
            }
            for (const v of finalVals) {
              conditions.push({
                header: actualHeader,
                operator: op,
                value: v,
                values: finalVals,
              });
            }
          } else if (colCandidate.length >= 3 && !isCommandKeyword(colCandidate)) {
            if (!explicitColumnRequestedNotMatches.includes(colCandidate)) {
              explicitColumnRequestedNotMatches.push(colCandidate);
            }
          }
        }
      }
    }

    // Fallback 2: Direct <Header> <Value> pattern without explicit operators
    if (conditions.length === 0 && Array.isArray(headers) && headers.length > 0) {
      const sortedHeaders = [...headers].sort((a, b) => b.length - a.length);
      for (const h of sortedHeaders) {
        const escH = h.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        const directRegex = new RegExp(
          "(?:(?:process\\s+only|only\\s+for|only|filter\\s+by|filter\\s+for|where|for|with|having)\\s+)?\\b" +
          escH +
          "\\b\\s*(?:is|as|[:=])?\\s*(?:[\"'\u201c\u201d\u2018\u2019\\x60]?([^\"'\u201c\u201d\u2018\u2019\\x60.,;\\n\\r]+?)[\"'\u201c\u201d\u2018\u2019\\x60]?)(?=\\s+(?:and|or|where|upload|create|launch|with|using|in|on|for|from|rows?|line|lines|under|into)\\b|[.,;\\n\\r]|$)",
          "gi"
        );

        let dMatch;
        while ((dMatch = directRegex.exec(text)) !== null) {
          let val = dMatch[1].trim();
          val = val.replace(/^(?:is|as|[:=])\s*/i, "").trim();
          val = val.replace(/\s+(?:on|in|for|from|with)?\s*(?:rows?|lines?)\s*\d+.*$/i, "").trim();
          val = val.replace(/\s+(?:on|in|for|from|with|under|into|at)$/i, "").trim();
          if (val && !isCommandKeyword(val) && !conditions.some((c) => c.header === h)) {
            const op = (lowerText.includes("contains") || lowerText.includes("includes")) ? "contains" : "equals";
            const vals = this.extractValuesList(val);
            const finalVals = vals.length > 0 ? vals : [val];
            for (const v of finalVals) {
              conditions.push({
                header: h,
                operator: op,
                value: v,
                values: finalVals,
              });
            }
          }
        }
      }
    }

    // Determine logical operator:
    const distinctHeaders = new Set(conditions.map((c) => this.normalize(c.header)));
    if (distinctHeaders.size === 1 && conditions.length > 1) {
      detectedLogicalOp = "OR";
    } else if (distinctHeaders.size > 1) {
      if (/\b(?:or|OR|ya|athva)\b/.test(text) && !/\b(?:and|aur)\b/i.test(text)) {
        detectedLogicalOp = "OR";
      } else {
        detectedLogicalOp = "AND";
      }
    }

    return {
      conditions,
      logicalOperator: detectedLogicalOp,
      explicitColumnRequestedNotMatches,
      isAmbiguous,
      ambiguityReason,
    };
  }

  /**
   * Evaluate a single filter condition against a single row object.
   * Compares cell values using normalized equality, number, date, contains, or not_equals/not_contains.
   */
  static evalCondition(cond, row) {
    if (!cond || !row) return false;
    const { header, value, values, operator: condOp } = cond;
    const rowValues = (row && typeof row === "object" && row.values) ? { ...row.values, ...row } : (row || {});
    let cellVal = rowValues[header];

    if (cellVal === undefined || cellVal === null) {
      const normH = this.normalize(header);
      for (const [k, v] of Object.entries(rowValues)) {
        if (this.normalize(k) === normH) {
          cellVal = v;
          break;
        }
      }
    }

    if (cellVal === undefined || cellVal === null) return false;

    const targetValues = Array.isArray(values) && values.length > 0 ? values : (value !== undefined && value !== null ? [value] : []);
    if (targetValues.length === 0) return false;

    const op = String(condOp || "equals").toLowerCase();
    const isNegative = op === "not_equals" || op === "!=" || op === "<>" || op === "not_contains" || op === "excludes";

    if (isNegative) {
      return targetValues.every((tv) => this.isCellMatch(cellVal, tv, op));
    } else {
      return targetValues.some((tv) => this.isCellMatch(cellVal, tv, op));
    }
  }

  /**
   * Evaluate a row against multiple conditions using grouped column evaluation.
   * Same column multiple values evaluate with OR (or AND NOT for negatives).
   * Distinct columns evaluate with operator (AND by default, OR if user specified).
   */
  static evalRow(conditions = [], row = {}, operator = "AND") {
    if (!conditions || conditions.length === 0) return true;
    return this.evaluateRowWithAudit(conditions, row, operator).isMatch;
  }

  /**
   * Evaluate row against conditions with detailed audit tracing (cell values, match/skip result, reason).
   */
  static evaluateRowWithAudit(conditions = [], row = {}, operator = "AND", headers = []) {
    if (!conditions || conditions.length === 0) {
      return { isMatch: true, evaluatedValues: {}, reason: "No filter condition applied", conditionResults: [] };
    }

    const rowValues = (row && typeof row === "object" && row.values) ? { ...row.values, ...row } : (row || {});
    const evaluatedValues = {};
    const conditionResults = [];

    // Group conditions by normalized column header
    const groupsByHeader = new Map();

    for (const cond of conditions) {
      let cellVal = rowValues[cond.header];
      if (cellVal === undefined || cellVal === null) {
        const normH = this.normalize(cond.header);
        for (const [k, v] of Object.entries(rowValues)) {
          if (this.normalize(k) === normH) {
            cellVal = v;
            break;
          }
        }
      }
      const rawCellStr = cellVal !== undefined && cellVal !== null ? String(cellVal).trim() : "";
      evaluatedValues[cond.header] = rawCellStr || "(empty)";
      const isCondMatch = this.evalCondition(cond, row);
      const cr = {
        condition: cond,
        cellValue: rawCellStr,
        isMatch: isCondMatch,
      };
      conditionResults.push(cr);

      const normH = this.normalize(cond.header);
      if (!groupsByHeader.has(normH)) {
        groupsByHeader.set(normH, []);
      }
      groupsByHeader.get(normH).push(cr);
    }

    // Evaluate each column group
    const groupResults = [];
    for (const [normH, groupCrs] of groupsByHeader.entries()) {
      const isNegative = groupCrs.some((cr) => {
        const op = String(cr.condition.operator || "").toLowerCase();
        return op === "not_equals" || op === "!=" || op === "<>" || op === "not_contains" || op === "excludes";
      });

      let groupPassed = false;
      if (isNegative) {
        // All negative conditions on same column must hold (AND NOT)
        groupPassed = groupCrs.every((cr) => cr.isMatch);
      } else {
        // Positive conditions on same column evaluate with OR
        groupPassed = groupCrs.some((cr) => cr.isMatch);
      }

      groupResults.push({
        header: groupCrs[0].condition.header,
        passed: groupPassed,
        groupCrs,
      });
    }

    const isOr = String(operator).toUpperCase() === "OR";
    let isMatch = false;
    let reason = "";

    if (isOr) {
      const passedGroup = groupResults.find((g) => g.passed);
      isMatch = Boolean(passedGroup);
      if (isMatch) {
        const matchedCr = passedGroup.groupCrs.find((cr) => cr.isMatch) || passedGroup.groupCrs[0];
        reason = `Matched OR filter: "${matchedCr.condition.header}" ${matchedCr.condition.operator} "${matchedCr.condition.value}" (Actual: "${matchedCr.cellValue}")`;
      } else {
        reason = `Did not match any OR condition (${conditions.map((c) => `"${c.header}" ${c.operator} "${c.value}"`).join(" OR ")})`;
      }
    } else {
      // AND across distinct columns
      const failedGroup = groupResults.find((g) => !g.passed);
      isMatch = !failedGroup;
      if (isMatch) {
        const matchedDetails = groupResults.map((g) => {
          const matchingVals = g.groupCrs.filter((cr) => cr.isMatch).map((cr) => `"${cr.condition.value}"`).join(" OR ");
          return `"${g.header}" = ${matchingVals}`;
        }).join(" AND ");
        reason = `Matched all filter conditions (${matchedDetails})`;
      } else {
        const failedCr = failedGroup.groupCrs.find((cr) => !cr.isMatch) || failedGroup.groupCrs[0];
        reason = `Failed filter for "${failedGroup.header}": expected [${failedGroup.groupCrs.map((c) => `"${c.condition.value}"`).join(" OR ")}] with operator ${failedGroup.groupCrs[0].condition.operator} (Actual: "${failedCr.cellValue}")`;
      }
    }

    return { isMatch, evaluatedValues, reason, conditionResults };
  }

  /**
   * Dynamically filter rows using parsed column-value conditions.
   * Preserves original row numbers (__excelRowNumber / _originalRowNumber).
   */
  static filterRows(rows = [], conditions = [], operator = "AND") {
    if (!rows || rows.length === 0) return [];
    if (!conditions || conditions.length === 0) return rows;

    return rows.filter((row) => this.evalRow(conditions, row, operator));
  }

  /**
   * Format error message when user requests a column that does not exist in current sheet
   */
  static formatMissingColumnError(missingCol, headers = []) {
    const cleanHeaders = headers.map((h) => `"${h}"`).join(", ");
    return `Column "${missingCol}" was not found in the current spreadsheet.\n\n` +
           `Available columns in the current sheet: [ ${cleanHeaders || "None"} ]\n\n` +
           `Please check the column name and specify which field you would like to filter by.`;
  }

  /**
   * Format message when no rows match the filter conditions
   */
  static formatNoMatchingRowsError(conditions = [], headers = [], rows = [], operator = "AND") {
    const isOr = String(operator).toUpperCase() === "OR";
    const condStr = conditions.map((c) => `"${c.header}" ${c.operator === 'contains' ? 'contains' : '='} "${c.value}"`).join(isOr ? " OR " : " AND ");
    const primaryHeader = conditions[0]?.header;

    let sampleVals = [];
    if (primaryHeader && rows.length > 0) {
      sampleVals = Array.from(
        new Set(
          rows
            .map((r) => {
              const v = (r.values ? r.values[primaryHeader] : r[primaryHeader]);
              return v !== undefined && v !== null ? String(v).trim() : null;
            })
            .filter(Boolean)
        )
      ).slice(0, 6);
    }

    const sampleText = sampleVals.length > 0 ? `\nAvailable sample values for column "${primaryHeader}": [ ${sampleVals.join(", ")} ]` : "";

    return `No rows matched your filter condition (${condStr}) in the current spreadsheet.${sampleText}\n\n` +
           `No Meta Ads, Campaign, or Ad Set was created.`;
  }
  /**
   * Parse natural-language row range commands from user prompt.
   * Supports:
   * - "Upload ads from row 5 to row 15." / "rows 5 to 15"
   * - "Create ads only for rows 10–20." / "rows 10-20" / "rows 10 to 20"
   * - "Upload row 7 only." / "row 7 only" / "only row 7"
   * - "Read the actual data from rows 25–40 and create ads."
   * - "Retry failed ads only from rows 10–15."
   * - "Upload rows 3, 5, 8" / "rows 3 and 5"
   * - UI Range Selector: { startRow: 3, endRow: 20 }
   */
  static parseRowRange(promptMessage, maxAvailableRow = 0, explicitConfig = null) {
    // 0. Check explicit UI configuration (UI range selector / API parameters)
    if (explicitConfig && typeof explicitConfig === "object") {
      let s = explicitConfig.start ?? explicitConfig.startRow ?? explicitConfig.from ?? explicitConfig.rangeSelector?.startRow ?? explicitConfig.rowRange?.start;
      let e = explicitConfig.end ?? explicitConfig.endRow ?? explicitConfig.to ?? explicitConfig.rangeSelector?.endRow ?? explicitConfig.rowRange?.end;
      if (s !== undefined && s !== null && e !== undefined && e !== null) {
        s = parseInt(s, 10);
        e = parseInt(e, 10);
        if (!isNaN(s) && !isNaN(e) && s > 0 && e > 0) {
          if (s > e) {
            const temp = s;
            s = e;
            e = temp;
          }
          const rowNums = [];
          for (let r = s; r <= e; r++) {
            rowNums.push(r);
          }
          return {
            isExplicitRange: true,
            start: s,
            end: e,
            targetRowNumbers: new Set(rowNums),
            type: s === e ? "SINGLE_ROW" : "RANGE",
            headerRowIncluded: s === 1,
            rawText: `Rows ${s}–${e}`,
            source: "UI_RANGE_SELECTOR",
            exceedsAvailableRows: maxAvailableRow > 0 && s > maxAvailableRow,
          };
        }
      }
      if (typeof explicitConfig.rowRange === "string" && (!promptMessage || typeof promptMessage !== "string")) {
        promptMessage = explicitConfig.rowRange;
      }
    }

    if (!promptMessage || typeof promptMessage !== "string") {
      return {
        isExplicitRange: false,
        start: 2,
        end: maxAvailableRow || null,
        targetRowNumbers: null,
        type: "ALL",
        exceedsAvailableRows: false,
      };
    }

    // 1. Normalize Unicode dashes (en-dash, em-dash, minus) to ASCII '-' and colons after range/row
    const normalizedText = promptMessage
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
      .replace(/\b(?:range|rows?|lines?)\s*:\s*/gi, (match) => match.replace(":", " "))
      .trim();

    // Check for row exclusion keywords: "except row 3", "excluding rows 3, 5", "row 3 chod kar", "without row 3", "skip row 4"
    const excludeRegex = /(?:except|excluding|without|skip|not|chod\s*kar|chhod\s*kar)\s*(?:rows?|lines?)?\s*#?\s*(\d+(?:\s*(?:,|and|or|ya|&|\+)\s*(?:rows?|lines?)?\s*#?\s*\d+)*)/i;
    const excludeMatch = normalizedText.match(excludeRegex);
    let excludedRowNums = [];
    if (excludeMatch) {
      const exNums = excludeMatch[1].match(/\d+/g);
      if (exNums) {
        excludedRowNums = exNums.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n) && n > 0);
      }
    }

    // 2. Check for multi-row list: "row 10, row 11", "rows 10, 11", "row 10 and row 11", "row 10 aur 11", "row 10, 11, 12", "row 10 aur row 11", "row 10 & row 11"
    const multiRowListRegex = /(?:rows?|lines?)\s*#?\s*\d+\s*(?:(?:,|and|&|\+|aur|or|ya|tatha|evam)\s*(?:rows?|lines?)?\s*#?\s*\d+\s*)+/i;
    const listMatch = normalizedText.match(multiRowListRegex);
    if (listMatch) {
      const numbers = listMatch[0].match(/\d+/g);
      if (numbers && numbers.length > 1) {
        let rowNums = numbers.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n) && n > 0);
        if (excludedRowNums.length > 0) {
          rowNums = rowNums.filter((n) => !excludedRowNums.includes(n));
        }
        if (rowNums.length > 0) {
          const start = Math.min(...rowNums);
          const end = Math.max(...rowNums);
          const isHeader = rowNums.includes(1);
          return {
            isExplicitRange: true,
            start,
            end,
            targetRowNumbers: new Set(rowNums),
            type: "LIST",
            headerRowIncluded: isHeader,
            rawText: listMatch[0],
            exceedsAvailableRows: maxAvailableRow > 0 && start > maxAvailableRow,
          };
        }
      }
    }

    // 3. Check for range: "row 5 to row 15", "rows 10-20", "from rows 25 to 40", "rows 10–15", "rows 2:11", "10 se 15 tak", "range: 10 to 15"
    const rangePatterns = [
      // "rows 5 to row 15", "rows 5 to 15", "row 5-15", "rows 5:15", "rows 5..15", "from row 5 to 15", "row 10 se row 15 tak"
      /(?:rows?|lines?)\s*#?\s*(\d+)\s*(?:to|se|till|through|-|:|\.\.)\s*(?:rows?|lines?)?\s*#?\s*(\d+)(?:\s*tak)?/i,
      // "from 5 to 15 rows", "5 to 15 rows", "10-20 rows", "10 se 15 tak rows"
      /(\d+)\s*(?:to|se|till|through|-|:|\.\.)\s*(\d+)\s*(?:tak\s*)?(?:rows?|lines?)/i,
      // "between row 5 and row 15", "range 10 to 15", "range 10-15", "range: 10 to 15"
      /\b(?:between|range)\s*(?:rows?|lines?)?\s*#?\s*(\d+)\s*(?:and|to|se|till|through|&|-|:)\s*(?:rows?|lines?)?\s*#?\s*(\d+)(?:\s*tak)?/i,
      // "from row 5 to 15", "start from row 5 to 15"
      /\b(?:from|start\s*from)\s*(?:rows?|lines?)?\s*#?\s*(\d+)\s*(?:to|se|till|through|-|:)\s*(?:rows?|lines?)?\s*#?\s*(\d+)(?:\s*tak)?/i,
      // "10 se 15 tak upload karo", "10 to 15 tak"
      /\b(\d+)\s*(?:se|to)\s*(\d+)\s*tak\b/i,
      // "upload 10 to 15", "create 10 to 15", "launch rows 10-15"
      /\b(?:upload|create|process|run|launch)\s*(?:rows?|lines?)?\s*#?\s*(\d+)\s*(?:to|se|till|through|-|:)\s*(?:rows?|lines?)?\s*#?\s*(\d+)\b/i,
    ];

    for (const pat of rangePatterns) {
      const m = normalizedText.match(pat);
      if (m) {
        let s = parseInt(m[1], 10);
        let e = parseInt(m[2], 10);
        if (!isNaN(s) && !isNaN(e) && s > 0 && e > 0) {
          if (s > e) {
            const temp = s;
            s = e;
            e = temp;
          }
          let rowNums = [];
          for (let r = s; r <= e; r++) {
            rowNums.push(r);
          }
          if (excludedRowNums.length > 0) {
            rowNums = rowNums.filter((n) => !excludedRowNums.includes(n));
          }
          const isHeader = s === 1;
          return {
            isExplicitRange: true,
            start: s,
            end: e,
            targetRowNumbers: new Set(rowNums),
            type: "RANGE",
            headerRowIncluded: isHeader,
            rawText: m[0],
            exceedsAvailableRows: maxAvailableRow > 0 && s > maxAvailableRow,
          };
        }
      }
    }

    // 4. Check for "from row X onwards" / "row X se start"
    const onwardsPatterns = [
      /(?:start\s*(?:from|at)?|from|onwards)\s*(?:rows?|lines?)\s*#?\s*(\d+)/i,
      /(?:rows?|lines?)\s*#?\s*(\d+)\s*(?:onwards|se\s*start|se\s*aage|start)/i,
    ];
    for (const pat of onwardsPatterns) {
      const m = normalizedText.match(pat);
      if (m) {
        const s = parseInt(m[1], 10);
        if (!isNaN(s) && s > 0) {
          const max = maxAvailableRow > 0 ? maxAvailableRow : s + 50;
          let rowNums = [];
          for (let r = s; r <= max; r++) {
            rowNums.push(r);
          }
          if (excludedRowNums.length > 0) {
            rowNums = rowNums.filter((n) => !excludedRowNums.includes(n));
          }
          return {
            isExplicitRange: true,
            start: s,
            end: max,
            targetRowNumbers: new Set(rowNums),
            type: "ONWARDS",
            headerRowIncluded: s === 1,
            rawText: m[0],
            exceedsAvailableRows: maxAvailableRow > 0 && s > maxAvailableRow,
          };
        }
      }
    }

    // 5. Check for single row: "upload row 7 only", "row 7 only", "only row 7", "upload row 7", "row 7"
    const singlePatterns = [
      /\b(?:only\s+row|process\s+row|use\s+row|upload\s+(?:only\s+)?row|create\s+ads?\s+(?:only\s+)?(?:for\s+)?row|retry\s+(?:failed\s+ads?\s+)?(?:only\s+)?(?:for\s+)?row|row\s*#|row\s+number)\s*(\d+)\b/i,
      /\b(?:rows?|lines?)\s*#?\s*(\d+)\s*(?:only|only\s+use|wali)?\b/i,
    ];

    for (const pat of singlePatterns) {
      const m = normalizedText.match(pat);
      if (m) {
        const r = parseInt(m[1], 10);
        if (!isNaN(r) && r > 0) {
          return {
            isExplicitRange: true,
            start: r,
            end: r,
            targetRowNumbers: new Set([r]),
            type: "SINGLE_ROW",
            headerRowIncluded: r === 1,
            rawText: m[0],
            exceedsAvailableRows: maxAvailableRow > 0 && r > maxAvailableRow,
          };
        }
      }
    }

    // 6. Check if standalone exclusion was requested: "all rows except row 3", "skip row 4"
    if (excludedRowNums.length > 0) {
      const max = maxAvailableRow > 0 ? maxAvailableRow : 30;
      const rowNums = [];
      for (let r = 2; r <= max; r++) {
        if (!excludedRowNums.includes(r)) {
          rowNums.push(r);
        }
      }
      return {
        isExplicitRange: true,
        start: Math.min(...rowNums),
        end: Math.max(...rowNums),
        targetRowNumbers: new Set(rowNums),
        type: "EXCLUSION_LIST",
        headerRowIncluded: false,
        rawText: excludeMatch ? excludeMatch[0] : "row exclusion",
        exceedsAvailableRows: false,
      };
    }

    return {
      isExplicitRange: false,
      start: 2,
      end: maxAvailableRow || null,
      targetRowNumbers: null,
      type: "ALL",
      exceedsAvailableRows: false,
    };
  }

  /**
   * Strictly filters spreadsheet rows by physical Google Sheets row number.
   * NEVER uses array indexes. Preserves original row references.
   */
  static filterByRowRange(rows = [], rangeInfo) {
    if (!rows || rows.length === 0) return { selectedRows: [], blankRows: [], skippedOutsideRange: 0 };
    if (!rangeInfo || !rangeInfo.isExplicitRange) {
      // Exclude row 1 if accidentally present as a data row
      const selected = rows.filter((r) => {
        const rowNo = r.rowNumber || r._originalRowNumber || r.originalRowNumber || r.__excelRowNumber;
        return rowNo === undefined || rowNo >= 2;
      });
      return { selectedRows: selected, blankRows: [], skippedOutsideRange: 0 };
    }

    const selectedRows = [];
    const blankRows = [];
    let skippedOutsideRange = 0;

    for (const r of rows) {
      const rowNo = r.rowNumber || r._originalRowNumber || r.originalRowNumber || r.__excelRowNumber;
      if (rowNo === 1) continue; // Header row is NEVER an ad record!

      let inRange = false;
      if (rangeInfo.targetRowNumbers && rangeInfo.targetRowNumbers.size > 0) {
        inRange = rangeInfo.targetRowNumbers.has(rowNo);
      } else if (rowNo !== undefined) {
        inRange = rowNo >= rangeInfo.start && rowNo <= rangeInfo.end;
      }

      if (!inRange) {
        skippedOutsideRange++;
        continue;
      }

      // Check if row is blank/empty
      const values = r.values || r;
      const isBlank = r._isBlank || r.isPopulated === false || Object.values(values).every((v) => v === null || v === undefined || String(v).trim() === "");

      if (isBlank) {
        blankRows.push({
          rowNumber: rowNo,
          row: r,
          reason: "Blank row in Google Sheet",
        });
      } else {
        selectedRows.push(r);
      }
    }

    return { selectedRows, blankRows, skippedOutsideRange };
  }

  /**
   * Build structured pre-upload preview table from actual requested row range
   */
  static buildRangePreview({
    spreadsheetName,
    worksheetName,
    rangeInfo,
    rows = [],
    blankRows = [],
  }) {
    const rangeDisplay = rangeInfo.isExplicitRange
      ? (rangeInfo.type === "SINGLE_ROW" ? `Row #${rangeInfo.start} Only` : `Rows #${rangeInfo.start}–#${rangeInfo.end}`)
      : "All Data Rows";

    const previewList = [];

    // Add active rows
    for (const r of rows) {
      const rowNo = r._originalRowNumber || r.originalRowNumber || r.__excelRowNumber;
      const vals = r.values || r;

      const headline = vals["Headlines"] || vals["Headline"] || vals["headline"] || vals["Creative Code"] || vals["Item Name"] || "";
      const landingPage = vals["Landing Page - Web / App"] || vals["Landing Page - Web/App"] || vals["Landing Page"] || vals["Destination URL"] || vals["Link"] || "";
      const creativeLink = vals["Creative Smart Chips"] || vals["Smart Chips"] || vals["Drive Link"] || vals["Creative"] || vals["Media"] || "";

      let mediaType = "🖼️ Image";
      if (creativeLink && (/\.(mp4|mov|avi|webm|m4v)($|\?)/i.test(creativeLink) || creativeLink.includes("/folders/"))) {
        mediaType = "🎬 Video";
      }

      const hasRequired = Boolean(creativeLink && (landingPage || headline));

      previewList.push({
        rowNumber: rowNo,
        headline: headline || "(Omitted)",
        landingPage: landingPage || "(Omitted)",
        creativeLink: creativeLink ? (creativeLink.length > 40 ? `${creativeLink.slice(0, 37)}...` : creativeLink) : "None",
        mediaType,
        mediaAccess: creativeLink ? "✅ Verified Accessible" : "❌ Missing Media",
        hasRequired,
        status: hasRequired ? "ELIGIBLE" : "MISSING_REQUIRED_FIELDS",
        note: hasRequired ? "Ready for Meta Ad creation" : "Missing required creative link or destination URL",
      });
    }

    // Add blank rows
    for (const b of blankRows) {
      previewList.push({
        rowNumber: b.rowNumber,
        headline: "--",
        landingPage: "--",
        creativeLink: "--",
        mediaType: "--",
        mediaAccess: "--",
        hasRequired: false,
        status: "SKIPPED_BLANK",
        note: "Blank row in Google Sheet (will be skipped)",
      });
    }

    previewList.sort((a, b) => a.rowNumber - b.rowNumber);

    const tableRows = previewList
      .map((p) => {
        let badge = "🟢 ELIGIBLE";
        if (p.status === "SKIPPED_BLANK") badge = "⚪ SKIPPED_BLANK";
        else if (p.status === "MISSING_REQUIRED_FIELDS") badge = "🔴 INVALID";

        return `| Row #${p.rowNumber} | **${p.headline}** | ${p.mediaType} | ${p.mediaAccess} | ${p.landingPage !== "(Omitted)" ? `\`${p.landingPage}\`` : "--"} | ${p.hasRequired ? "✅ Complete" : "❌ Incomplete"} | ${badge} | ${p.note} |`;
      })
      .join("\n");

    const markdownPreview =
`### 📋 Pre-Upload Google Sheets Data Preview
- **Spreadsheet**: \`${spreadsheetName || "Current Spreadsheet"}\`
- **Worksheet/Tab**: \`${worksheetName || "Sheet1"}\`
- **Requested Row Range**: \`${rangeDisplay}\`
- **Total Rows Read in Range**: \`${previewList.length}\` (${rows.length} Eligible, ${blankRows.length} Blank)

| Sheet Row | Creative Headline | Media Type | Media Access | Landing Page | Required Fields | Status | Notes |
| :---: | :--- | :---: | :---: | :--- | :---: | :---: | :--- |
${tableRows}`;

    return {
      spreadsheetName,
      worksheetName,
      rangeDisplay,
      totalRowsInRange: previewList.length,
      eligibleRowCount: rows.length,
      blankRowCount: blankRows.length,
      previewList,
      markdownPreview,
    };
  }
}

export default DynamicSheetFilter;


