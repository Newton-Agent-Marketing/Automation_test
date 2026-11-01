// backend/src/services/agent/dynamicSheetExecutionService.js
import sheetsService from "../../google/sheetsService.js";
import { SheetInspectorService } from "./sheetInspectorService.js";

const MONTH_NAME_TO_NUM = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Semantic field definitions used to dynamically understand arbitrary user-created
 * Google Sheet headers without relying on fixed column names or positions.
 */
const SEMANTIC_FIELD_CATALOG = [
  {
    canonicalKey: "reportingDate",
    category: "date",
    description: "Reporting date or period",
    exactAliases: ["date", "reportingdate", "reportdate", "reportday", "reportingday", "day", "dated", "syncdate", "executiondate", "logdate", "metricdate"],
    tokenPatterns: [/\b(report(?:ing)?\s*(?:date|day)|metric\s*date|ad\s*date|campaign\s*date|sync\s*date|log\s*date)\b/i, /^(?:date|day|dated)$/i],
  },
  {
    canonicalKey: "dateStart",
    category: "date",
    description: "Start date of reporting window",
    exactAliases: ["datestart", "startdate", "fromdate", "periodstart"],
    tokenPatterns: [/\b(date\s*start|start\s*date|from\s*date|period\s*start)\b/i],
  },
  {
    canonicalKey: "dateStop",
    category: "date",
    description: "End date of reporting window",
    exactAliases: ["datestop", "enddate", "todate", "periodend"],
    tokenPatterns: [/\b(date\s*stop|end\s*date|to\s*date|period\s*end)\b/i],
  },
  {
    canonicalKey: "accountId",
    category: "account",
    description: "Advertising account ID",
    exactAliases: ["accountid", "adaccountid", "metaaccountid", "customerid"],
    tokenPatterns: [/\b(ad\s*account\s*id|account\s*id|customer\s*id)\b/i],
  },
  {
    canonicalKey: "accountName",
    category: "account",
    description: "Advertising account name",
    exactAliases: ["accountname", "adaccountname", "adaccount", "account"],
    tokenPatterns: [/\b(ad\s*account\s*name|account\s*name)\b/i, /^ad\s*account$/i],
  },
  {
    canonicalKey: "channel",
    category: "account",
    description: "Advertising platform / channel",
    exactAliases: ["channel", "platform", "adplatform", "network", "source"],
    tokenPatterns: [/\b(ad\s*platform|marketing\s*channel)\b/i, /^(?:channel|platform|network)$/i],
  },
  {
    canonicalKey: "campaignId",
    category: "campaign",
    description: "Campaign unique identifier",
    exactAliases: ["campaignid", "campid", "metacampaignid"],
    tokenPatterns: [/\b((?:campaign|camp)\s*id)\b/i],
  },
  {
    canonicalKey: "campaignName",
    category: "campaign",
    description: "Campaign name / title",
    exactAliases: ["campaignname", "campaign", "campaigntitle", "metacampaign", "campname", "camptitle", "metacamptitle", "metacampname"],
    tokenPatterns: [/\b((?:campaign|camp)\s*(?:name|title)|meta\s*(?:campaign|camp)(?:\s*(?:name|title))?)\b/i, /^campaigns?$/i],
  },
  {
    canonicalKey: "objective",
    category: "campaign",
    description: "Campaign objective",
    exactAliases: ["objective", "campaignobjective", "goal", "marketingobjective"],
    tokenPatterns: [/\b(campaign\s*objective|marketing\s*objective)\b/i, /^objective$/i],
  },
  {
    canonicalKey: "adSetId",
    category: "adset",
    description: "Ad Set / Ad Group ID",
    exactAliases: ["adsetid", "adgroupid", "asetid"],
    tokenPatterns: [/\b(ad\s*set\s*id|adset\s*id|ad\s*group\s*id)\b/i],
  },
  {
    canonicalKey: "adSetName",
    category: "adset",
    description: "Ad Set / Ad Group name",
    exactAliases: ["adsetname", "adset", "adsets", "adsettitle", "adgroupname", "adgroup", "adgrouptitle"],
    tokenPatterns: [/\b((?:ad\s*set|adset|ad\s*group)\s*(?:name|title))\b/i, /^(?:ad\s*sets?|adsets?|ad\s*groups?)$/i],
  },
  {
    canonicalKey: "optimizationGoal",
    category: "adset",
    description: "Ad Set optimization goal",
    exactAliases: ["optimizationgoal", "optimisationgoal", "deliveryoptimization"],
    tokenPatterns: [/\b(optimi[sz]ation\s*goal)\b/i],
  },
  {
    canonicalKey: "adId",
    category: "ad",
    description: "Ad ID",
    exactAliases: ["adid", "metaadid"],
    tokenPatterns: [/\b(meta\s*ad\s*id)\b/i, /^ad\s*id$/i],
  },
  {
    canonicalKey: "adName",
    category: "ad",
    description: "Ad name / creative ad title",
    exactAliases: ["adname", "ad", "ads", "adtitle", "metaad", "adcreative", "creativeadname", "creativeadtitle"],
    tokenPatterns: [/\b(ad\s*(?:name|title)|meta\s*ad\s*(?:name|title))\b/i, /^(?:ads?|ad\s*creative)$/i],
  },
  {
    canonicalKey: "creativeId",
    category: "ad",
    description: "Creative ID",
    exactAliases: ["creativeid"],
    tokenPatterns: [/\b(creative\s*id)\b/i],
  },
  {
    canonicalKey: "creativeName",
    category: "ad",
    description: "Creative name",
    exactAliases: ["creativename", "creative"],
    tokenPatterns: [/\b(creative\s*name|^creative$)\b/i],
  },
  {
    canonicalKey: "status",
    category: "entity_meta",
    description: "Delivery / effective status",
    exactAliases: ["status", "deliverystatus", "effectivestatus", "campaignstatus", "adstatus", "adsetstatus", "state"],
    tokenPatterns: [/\b(delivery\s*status|effective\s*status|campaign\s*status|ad\s*set\s*status|ad\s*status|^status$)\b/i],
  },
  {
    canonicalKey: "dailyBudget",
    category: "entity_meta",
    description: "Daily budget",
    exactAliases: ["dailybudget", "budget"],
    tokenPatterns: [/\b(daily\s*budget|^budget$)\b/i],
  },
  {
    canonicalKey: "currency",
    category: "entity_meta",
    description: "Account currency",
    exactAliases: ["currency", "accountcurrency", "curr"],
    tokenPatterns: [/\b(^currency$|account\s*currency)\b/i],
  },
  {
    canonicalKey: "impressions",
    category: "metric",
    description: "Total impressions",
    exactAliases: ["impressions", "impr", "imps", "totalimpressions", "views"],
    tokenPatterns: [/\b(impressions|^impr\.?$|^imps$)\b/i],
  },
  {
    canonicalKey: "reach",
    category: "metric",
    description: "Unique reach",
    exactAliases: ["reach", "uniquereach", "peoplereached"],
    tokenPatterns: [/\b(^reach$|unique\s*reach|people\s*reached)\b/i],
  },
  {
    canonicalKey: "frequency",
    category: "derived_metric",
    description: "Average frequency (Impressions / Reach)",
    exactAliases: ["frequency", "freq", "avgfrequency"],
    tokenPatterns: [/\b(^frequency$|^freq$)\b/i],
  },
  {
    canonicalKey: "clicks",
    category: "metric",
    description: "Total clicks",
    exactAliases: ["clicks", "totalclicks", "allclicks"],
    tokenPatterns: [/\b(^clicks$|total\s*clicks|all\s*clicks)\b/i],
  },
  {
    canonicalKey: "linkClicks",
    category: "metric",
    description: "Link clicks",
    exactAliases: ["linkclicks", "outboundclicks", "inlineclicks"],
    tokenPatterns: [/\b(link\s*clicks|outbound\s*clicks)\b/i],
  },
  {
    canonicalKey: "spend",
    category: "metric",
    description: "Amount spent / ad spend",
    exactAliases: ["spend", "amountspent", "adspend", "totalspend", "cost", "spent", "spendinr", "spendusd"],
    tokenPatterns: [/\b(amount\s*spent|ad\s*spend|total\s*spend|^spend\b|^spent$|^cost$)\b/i],
  },
  {
    canonicalKey: "conversions",
    category: "metric",
    description: "Conversions / results count",
    exactAliases: ["conversions", "results", "totalconversions", "conv", "actions"],
    tokenPatterns: [/\b(^conversions?$|^results?$|total\s*conversions|total\s*results)\b/i],
  },
  {
    canonicalKey: "purchases",
    category: "metric",
    description: "Purchases count",
    exactAliases: ["purchases", "purchase", "orders", "salescount"],
    tokenPatterns: [/\b(^purchases?$|website\s*purchases)\b/i],
  },
  {
    canonicalKey: "leads",
    category: "metric",
    description: "Leads count",
    exactAliases: ["leads", "lead", "totalleads"],
    tokenPatterns: [/\b(^leads?$|total\s*leads)\b/i],
  },
  {
    canonicalKey: "conversionValue",
    category: "metric",
    description: "Conversion / purchase revenue value",
    exactAliases: ["conversionvalue", "purchasevalue", "revenue", "salesvalue", "roasvalue", "totalrevenue"],
    tokenPatterns: [/\b(conversion\s*value|purchase\s*value|^revenue$|total\s*revenue|sales\s*value)\b/i],
  },
  {
    canonicalKey: "cpr",
    category: "derived_metric",
    description: "Cost per Result (Spend / Results)",
    exactAliases: ["cpr", "costperresult", "costperresults"],
    tokenPatterns: [/\b(^cpr$|cost\s*per\s*results?)\b/i],
  },
  {
    canonicalKey: "cpa",
    category: "derived_metric",
    description: "Cost per Acquisition / Conversion (Spend / Conversions)",
    exactAliases: ["cpa", "costperacquisition", "costperaction", "costperconversion", "costperpurchase", "cpl", "costperlead"],
    tokenPatterns: [/\b(^cpa$|^cpl$|cost\s*per\s*(?:acquisition|action|conversion|purchase|lead))\b/i],
  },
  {
    canonicalKey: "ctr",
    category: "derived_metric",
    description: "Click-Through Rate % ((Clicks / Impressions) * 100)",
    exactAliases: ["ctr", "clickthroughrate", "ctrpercent"],
    tokenPatterns: [/\b(^ctr\b|click[\s-]*through[\s-]*rate)\b/i],
  },
  {
    canonicalKey: "cpc",
    category: "derived_metric",
    description: "Cost per Click (Spend / Clicks)",
    exactAliases: ["cpc", "costperclick", "avgcpc"],
    tokenPatterns: [/\b(^cpc\b|avg\.?\s*cpc|cost\s*per\s*click)\b/i],
  },
  {
    canonicalKey: "cpm",
    category: "derived_metric",
    description: "Cost per 1,000 Impressions ((Spend / Impressions) * 1000)",
    exactAliases: ["cpm", "costper1000impressions", "costpermille"],
    tokenPatterns: [/\b(^cpm\b|cost\s*per\s*(?:1,?000|mille))\b/i],
  },
  {
    canonicalKey: "roas",
    category: "derived_metric",
    description: "Return on Ad Spend (Conversion Value / Spend)",
    exactAliases: ["roas", "purchaseroas", "returnonadspend"],
    tokenPatterns: [/\b(^roas\b|purchase\s*roas|return\s*on\s*ad\s*spend)\b/i],
  },
];

function normalizeHeaderKey(raw = "") {
  return String(raw || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // strip parenthetical currency/units like "(INR)" or "(%)"
    .replace(/[^a-z0-9]/g, "");
}

function cleanHeaderText(raw = "") {
  return String(raw || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[_/|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDatePartsInTimezone(dateObj = new Date(), timezone = "Asia/Kolkata") {
  let tz = timezone || "Asia/Kolkata";
  try {
    Intl.DateTimeFormat("en-CA", { timeZone: tz });
  } catch (_) {
    tz = "UTC";
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(dateObj);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    isoDate: `${map.year}-${map.month}-${map.day}`,
    timezone: tz,
  };
}

function shiftIsoDate(isoDate, deltaDays) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isValidCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function toIsoDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export class DynamicSheetExecutionService {
  /**
   * Detect the date format convention used by an existing spreadsheet column
   * by inspecting non-empty sample values in that column.
   */
  static detectSheetDateFormat(rows = [], dateHeaders = []) {
    if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(dateHeaders) || dateHeaders.length === 0) {
      return "YYYY-MM-DD";
    }

    const samples = [];
    for (const row of rows) {
      for (const h of dateHeaders) {
        const val = String(row?.[h] ?? "").trim();
        if (val) samples.push(val);
      }
      if (samples.length >= 15) break;
    }

    for (const s of samples) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return "YYYY-MM-DD";
      if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return "YYYY/MM/DD";
      if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/.test(s)) return "DD MMM YYYY";
      if (/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/.test(s)) return "MMM DD, YYYY";
    }

    // Distinguish DD/MM/YYYY vs MM/DD/YYYY and DD-MM-YYYY vs MM-DD-YYYY
    const slashSamples = samples.filter((s) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s));
    if (slashSamples.length > 0) {
      for (const s of slashSamples) {
        const [a, b] = s.split("/").map(Number);
        if (a > 12 && b <= 12) return "DD/MM/YYYY";
        if (b > 12 && a <= 12) return "MM/DD/YYYY";
      }
      return "DD/MM/YYYY";
    }

    const dashSamples = samples.filter((s) => /^\d{1,2}-\d{1,2}-\d{4}$/.test(s));
    if (dashSamples.length > 0) {
      for (const s of dashSamples) {
        const [a, b] = s.split("-").map(Number);
        if (a > 12 && b <= 12) return "DD-MM-YYYY";
        if (b > 12 && a <= 12) return "MM-DD-YYYY";
      }
      return "DD-MM-YYYY";
    }

    return "YYYY-MM-DD";
  }

  /**
   * Format an ISO YYYY-MM-DD string into the target spreadsheet's expected date format.
   */
  static formatDateForSheet(isoDate, formatPattern = "YYYY-MM-DD") {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate).trim())) {
      return String(isoDate || "");
    }
    const [yyyy, mm, dd] = String(isoDate).trim().split("-");
    const monthIdx = Number(mm) - 1;
    const shortMonth = SHORT_MONTHS[monthIdx] || mm;

    switch (formatPattern) {
      case "YYYY/MM/DD":
        return `${yyyy}/${mm}/${dd}`;
      case "DD/MM/YYYY":
        return `${dd}/${mm}/${yyyy}`;
      case "MM/DD/YYYY":
        return `${mm}/${dd}/${yyyy}`;
      case "DD-MM-YYYY":
        return `${dd}-${mm}-${yyyy}`;
      case "MM-DD-YYYY":
        return `${mm}-${dd}-${yyyy}`;
      case "DD MMM YYYY":
        return `${Number(dd)} ${shortMonth} ${yyyy}`;
      case "MMM DD, YYYY":
        return `${shortMonth} ${Number(dd)}, ${yyyy}`;
      case "YYYY-MM-DD":
      default:
        return `${yyyy}-${mm}-${dd}`;
    }
  }

  /**
   * Parse explicit dates or date ranges written inside a task instruction.
   * Never silently substitutes today's date when another date is requested.
   */
  static parseExplicitInstructionDate(instruction = "", nowParts) {
    const text = String(instruction || "");
    if (!text.trim()) return null;

    // 1. Explicit ISO range: "from 2026-10-01 to 2026-10-25" or "between 2026-10-01 and 2026-10-25"
    const isoRangeMatch = text.match(
      /\b(?:from|between)\s+(\d{4}-\d{1,2}-\d{1,2})\s+(?:to|and|through|-)\s+(\d{4}-\d{1,2}-\d{1,2})\b/i
    );
    if (isoRangeMatch) {
      const [y1, m1, d1] = isoRangeMatch[1].split("-").map(Number);
      const [y2, m2, d2] = isoRangeMatch[2].split("-").map(Number);
      if (!isValidCalendarDate(y1, m1, d1) || !isValidCalendarDate(y2, m2, d2)) {
        return {
          invalid: true,
          reason: `The date range "${isoRangeMatch[0]}" contains an invalid calendar date.`,
        };
      }
      const since = toIsoDate(y1, m1, d1);
      const until = toIsoDate(y2, m2, d2);
      return {
        source: "instruction_explicit_range",
        reportingDateIso: until,
        timeRange: { since, until },
        datePreset: null,
        isRange: true,
      };
    }

    // 2. Single ISO date: YYYY-MM-DD (e.g. 2026-10-25)
    const isoMatches = [...text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)];
    if (isoMatches.length > 0) {
      const distinctIso = [];
      for (const m of isoMatches) {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        if (!isValidCalendarDate(y, mo, d)) {
          return {
            invalid: true,
            reason: `The date "${m[0]}" in the instruction is not a valid calendar date.`,
          };
        }
        const iso = toIsoDate(y, mo, d);
        if (!distinctIso.includes(iso)) distinctIso.push(iso);
      }

      if (distinctIso.length === 2 && /\b(to|and|through|between|range)\b/i.test(text)) {
        const sorted = [...distinctIso].sort();
        return {
          source: "instruction_explicit_range",
          reportingDateIso: sorted[1],
          timeRange: { since: sorted[0], until: sorted[1] },
          datePreset: null,
          isRange: true,
        };
      }

      if (distinctIso.length > 1 && !/\b(compare|vs|versus)\b/i.test(text)) {
        return {
          ambiguous: true,
          reason: `Multiple conflicting dates (${distinctIso.join(", ")}) were mentioned without specifying whether they form a range or which reporting date to write.`,
        };
      }

      return {
        source: "instruction_explicit_date",
        reportingDateIso: distinctIso[0],
        timeRange: { since: distinctIso[0], until: distinctIso[0] },
        datePreset: null,
        isRange: false,
      };
    }

    // 3. Natural language date: "25 Oct 2026", "25 October 2026", "Oct 25, 2026", "October 25 2026"
    const dmyTextMatch = text.match(
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[,\s]+(\d{4})\b/i
    );
    if (dmyTextMatch) {
      const day = Number(dmyTextMatch[1]);
      const month = MONTH_NAME_TO_NUM[dmyTextMatch[2].toLowerCase()];
      const year = Number(dmyTextMatch[3]);
      if (!isValidCalendarDate(year, month, day)) {
        return { invalid: true, reason: `Invalid date "${dmyTextMatch[0]}" in task instruction.` };
      }
      const iso = toIsoDate(year, month, day);
      return {
        source: "instruction_explicit_date",
        reportingDateIso: iso,
        timeRange: { since: iso, until: iso },
        datePreset: null,
        isRange: false,
      };
    }

    const mdyTextMatch = text.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i
    );
    if (mdyTextMatch) {
      const month = MONTH_NAME_TO_NUM[mdyTextMatch[1].toLowerCase()];
      const day = Number(mdyTextMatch[2]);
      const year = Number(mdyTextMatch[3]);
      if (!isValidCalendarDate(year, month, day)) {
        return { invalid: true, reason: `Invalid date "${mdyTextMatch[0]}" in task instruction.` };
      }
      const iso = toIsoDate(year, month, day);
      return {
        source: "instruction_explicit_date",
        reportingDateIso: iso,
        timeRange: { since: iso, until: iso },
        datePreset: null,
        isRange: false,
      };
    }

    // 4. Slash or dash date DD/MM/YYYY or DD-MM-YYYY (e.g., 25/10/2026)
    const numericDateMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
    if (numericDateMatch) {
      const p1 = Number(numericDateMatch[1]);
      const p2 = Number(numericDateMatch[2]);
      const year = Number(numericDateMatch[3]);
      if (p1 <= 12 && p2 <= 12 && p1 !== p2) {
        return {
          ambiguous: true,
          reason: `The date "${numericDateMatch[0]}" is ambiguous between DD/MM/YYYY and MM/DD/YYYY. Please specify in YYYY-MM-DD format (e.g. ${year}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}).`,
        };
      }
      const day = p1 > 12 ? p1 : p2 > 12 ? p1 : p1;
      const month = p1 > 12 ? p2 : p2 > 12 ? p1 : p2;
      const effDay = p2 > 12 ? p2 : day;
      const effMonth = p2 > 12 ? p1 : month;
      if (!isValidCalendarDate(year, effMonth, effDay)) {
        return { invalid: true, reason: `Invalid date "${numericDateMatch[0]}" in task instruction.` };
      }
      const iso = toIsoDate(year, effMonth, effDay);
      return {
        source: "instruction_explicit_date",
        reportingDateIso: iso,
        timeRange: { since: iso, until: iso },
        datePreset: null,
        isRange: false,
      };
    }

    // 5. Relative explicit phrases in instruction
    if (/\byesterday(?:'s)?\b/i.test(text)) {
      const yIso = shiftIsoDate(nowParts.isoDate, -1);
      return {
        source: "instruction_yesterday",
        reportingDateIso: yIso,
        timeRange: { since: yIso, until: yIso },
        datePreset: "yesterday",
        isRange: false,
      };
    }

    if (/\btoday(?:'s)?\b/i.test(text)) {
      return {
        source: "instruction_today",
        reportingDateIso: nowParts.isoDate,
        timeRange: { since: nowParts.isoDate, until: nowParts.isoDate },
        datePreset: "today",
        isRange: false,
      };
    }

    const lastNDaysMatch = text.match(/\b(?:last|past)\s+(\d{1,3})\s+days?\b/i);
    if (lastNDaysMatch) {
      const nDays = Math.max(1, Number(lastNDaysMatch[1]));
      const until = nowParts.isoDate;
      const since = shiftIsoDate(until, -(nDays - 1));
      const presetMap = { 7: "last_7d", 14: "last_14d", 28: "last_28d", 30: "last_30d", 90: "last_90d" };
      return {
        source: `instruction_last_${nDays}_days`,
        reportingDateIso: until,
        timeRange: { since, until },
        datePreset: presetMap[nDays] || null,
        isRange: true,
      };
    }

    if (/\bthis\s+month\b/i.test(text)) {
      const since = `${String(nowParts.year).padStart(4, "0")}-${String(nowParts.month).padStart(2, "0")}-01`;
      return {
        source: "instruction_this_month",
        reportingDateIso: nowParts.isoDate,
        timeRange: { since, until: nowParts.isoDate },
        datePreset: "this_month",
        isRange: true,
      };
    }

    if (/\blast\s+month\b/i.test(text)) {
      const prevMonthYear = nowParts.month === 1 ? nowParts.year - 1 : nowParts.year;
      const prevMonth = nowParts.month === 1 ? 12 : nowParts.month - 1;
      const lastDay = new Date(Date.UTC(prevMonthYear, prevMonth, 0)).getUTCDate();
      const since = toIsoDate(prevMonthYear, prevMonth, 1);
      const until = toIsoDate(prevMonthYear, prevMonth, lastDay);
      return {
        source: "instruction_last_month",
        reportingDateIso: until,
        timeRange: { since, until },
        datePreset: "last_month",
        isRange: true,
      };
    }

    if (/\b(lifetime|all[\s-]*time|maximum)\b/i.test(text)) {
      return {
        source: "instruction_maximum",
        reportingDateIso: nowParts.isoDate,
        timeRange: null,
        datePreset: "maximum",
        isRange: true,
      };
    }

    // Detect explicitly unresolvable date references when user asks for "the specified date" without giving one
    if (/\b(specified\s+date|custom\s+date\s+not\s+set|unknown\s+date)\b/i.test(text)) {
      return {
        ambiguous: true,
        reason: "The instruction refers to a specific custom date, but no date was provided in the instruction or workflow Date node.",
      };
    }

    return null;
  }

  /**
   * Resolve the reporting date & query window strictly following Section 7 rules:
   * 1. Explicit date in task instruction
   * 2. Upstream node reportingDate (if previous node resolved an explicit/scheduled date and current node says "use the correct reporting date")
   * 3. Configured Date node in workflow
   * 4. Scheduled execution date in configured workflow timezone (for daily scheduled runs)
   * 5. Today's date in configured workflow timezone
   */
  static resolveReportingDate({
    instruction = "",
    dateNodeConfig = null,
    timeNodeConfig = null,
    scheduledDate = null,
    upstreamReportingDate = null,
    timezone = null,
    existingSheetRows = [],
    dateHeaders = [],
    now = new Date(),
  } = {}) {
    const effectiveTimezone =
      timezone ||
      timeNodeConfig?.timezone ||
      dateNodeConfig?.timezone ||
      "Asia/Kolkata";

    const nowParts = getDatePartsInTimezone(now, effectiveTimezone);
    const sheetDateFormat = this.detectSheetDateFormat(existingSheetRows, dateHeaders);

    // Priority 1: Explicit date or range in the current node's task instruction
    const explicit = this.parseExplicitInstructionDate(instruction, nowParts);
    if (explicit?.invalid || explicit?.ambiguous) {
      return {
        ok: false,
        status: "WAITING_FOR_INPUT",
        clarificationQuestion: `${explicit.reason} Please specify the exact reporting date (YYYY-MM-DD) or configure a Date node.`,
        timezone: nowParts.timezone,
        sheetDateFormat,
      };
    }

    if (explicit) {
      return {
        ok: true,
        source: explicit.source,
        reportingDateIso: explicit.reportingDateIso,
        formattedDate: this.formatDateForSheet(explicit.reportingDateIso, sheetDateFormat),
        sheetDateFormat,
        timeRange: explicit.timeRange,
        datePreset: explicit.datePreset,
        isRange: explicit.isRange,
        timezone: nowParts.timezone,
      };
    }

    // Priority 2: Upstream node resolved an explicit or scheduled reporting date
    if (upstreamReportingDate?.reportingDateIso && /^\d{4}-\d{2}-\d{2}$/.test(upstreamReportingDate.reportingDateIso)) {
      const iso = upstreamReportingDate.reportingDateIso;
      return {
        ok: true,
        source: `upstream_${upstreamReportingDate.source || "node"}`,
        reportingDateIso: iso,
        formattedDate: this.formatDateForSheet(iso, sheetDateFormat),
        sheetDateFormat,
        timeRange: upstreamReportingDate.timeRange || { since: iso, until: iso },
        datePreset: upstreamReportingDate.datePreset || null,
        isRange: Boolean(upstreamReportingDate.isRange),
        timezone: nowParts.timezone,
      };
    }

    // Priority 3: Scheduled execution date (e.g., daily 12:00 AM scheduled run in workflow timezone)
    if (scheduledDate && /^\d{4}-\d{2}-\d{2}$/.test(String(scheduledDate).trim())) {
      const iso = String(scheduledDate).trim();
      return {
        ok: true,
        source: "scheduled_execution_date",
        reportingDateIso: iso,
        formattedDate: this.formatDateForSheet(iso, sheetDateFormat),
        sheetDateFormat,
        timeRange: null,
        datePreset: "maximum",
        isRange: false,
        timezone: nowParts.timezone,
      };
    }

    // Priority 4: Configured Date node in the workflow
    const dateMode = dateNodeConfig?.dateType || dateNodeConfig?.dateMode || null;
    const isRecurringDaily =
      dateMode === "recurring" ||
      String(timeNodeConfig?.recurrence || "").toLowerCase() === "daily";

    if (dateNodeConfig?.specificDate && dateMode === "specific" && !isRecurringDaily) {
      const parts = String(dateNodeConfig.specificDate).trim().split("-").map(Number);
      if (parts.length === 3 && isValidCalendarDate(parts[0], parts[1], parts[2])) {
        const iso = toIsoDate(parts[0], parts[1], parts[2]);
        return {
          ok: true,
          source: "workflow_date_node",
          reportingDateIso: iso,
          formattedDate: this.formatDateForSheet(iso, sheetDateFormat),
          sheetDateFormat,
          timeRange: { since: iso, until: iso },
          datePreset: null,
          isRange: false,
          timezone: nowParts.timezone,
        };
      }
    }

    // Priority 5: Today's date in the configured workflow timezone
    return {
      ok: true,
      source: "workflow_timezone_today",
      reportingDateIso: nowParts.isoDate,
      formattedDate: this.formatDateForSheet(nowParts.isoDate, sheetDateFormat),
      sheetDateFormat,
      timeRange: null,
      datePreset: "maximum",
      isRange: false,
      timezone: nowParts.timezone,
    };
  }

  /**
   * Dynamically classify every header of a spreadsheet using semantic matching.
   * Works with any custom column names and column order.
   */
  static classifySheetColumns(headers = [], existingRows = []) {
    const columnMappings = [];
    const mappedColumns = [];
    const unmappedColumns = [];
    const dateHeaders = [];

    for (let index = 0; index < headers.length; index++) {
      const rawHeader = String(headers[index] || "").trim();
      if (!rawHeader) continue;

      const norm = normalizeHeaderKey(rawHeader);
      const cleaned = cleanHeaderText(rawHeader);
      let matchedDef = null;
      let confidence = 0;

      // Pass 1: Exact normalized alias match
      for (const def of SEMANTIC_FIELD_CATALOG) {
        if (def.exactAliases.includes(norm)) {
          matchedDef = def;
          confidence = 1.0;
          break;
        }
      }

      // Pass 2: Semantic regex / token match on cleaned header
      if (!matchedDef) {
        for (const def of SEMANTIC_FIELD_CATALOG) {
          if (def.tokenPatterns.some((rx) => rx.test(cleaned))) {
            matchedDef = def;
            confidence = 0.9;
            break;
          }
        }
      }

      if (matchedDef) {
        if (matchedDef.category === "date") {
          dateHeaders.push(rawHeader);
        }
        const entry = {
          columnIndex: index,
          columnLetter: sheetsService.colIndexToA1(index),
          headerName: rawHeader,
          canonicalKey: matchedDef.canonicalKey,
          category: matchedDef.category,
          description: matchedDef.description,
          confidence,
          mappable: true,
        };
        columnMappings.push(entry);
        mappedColumns.push(entry);
      } else {
        const entry = {
          columnIndex: index,
          columnLetter: sheetsService.colIndexToA1(index),
          headerName: rawHeader,
          canonicalKey: null,
          category: "custom_unmapped",
          description: "Custom column without direct ad-platform semantic equivalent",
          confidence: 0,
          mappable: false,
        };
        columnMappings.push(entry);
        unmappedColumns.push(entry);
      }
    }

    const canonicalSet = new Set(mappedColumns.map((c) => c.canonicalKey));
    const hasAdColumns = canonicalSet.has("adId") || canonicalSet.has("adName") || canonicalSet.has("creativeId") || canonicalSet.has("creativeName");
    const hasAdSetColumns = canonicalSet.has("adSetId") || canonicalSet.has("adSetName") || canonicalSet.has("optimizationGoal");
    const hasCampaignColumns = canonicalSet.has("campaignId") || canonicalSet.has("campaignName") || canonicalSet.has("objective");
    const hasMetricColumns = mappedColumns.some((c) => c.category === "metric" || c.category === "derived_metric");

    const requiredGranularity = hasAdColumns ? "ad" : hasAdSetColumns ? "adset" : "campaign";
    const detectedDateFormat = this.detectSheetDateFormat(existingRows, dateHeaders);

    return {
      totalColumns: headers.length,
      headers,
      columnMappings,
      mappedColumns,
      unmappedColumns,
      dateHeaders,
      detectedDateFormat,
      requiredGranularity,
      requirements: {
        needsCampaigns: hasCampaignColumns || hasAdSetColumns || hasAdColumns || hasMetricColumns,
        needsAdSets: hasAdSetColumns || hasAdColumns,
        needsAds: hasAdColumns,
        needsPerformanceInsights: hasMetricColumns,
      },
    };
  }

  /**
   * Build unified, real entity + performance records at the required granularity ("campaign" | "adset" | "ad")
   * from live Meta Ads / Google Ads tool results without inventing any numbers.
   */
  static buildUnifiedAdRecords({
    granularity = "campaign",
    accountId = "",
    accountName = "",
    channel = "Meta Ads",
    currency = "INR",
    campaigns = [],
    adSets = [],
    ads = [],
    insights = [],
    includeZeroImpressionEntities = true,
  } = {}) {
    const campById = new Map();
    for (const c of campaigns || []) {
      const id = String(c.id || c.campaignId || "");
      if (id) campById.set(id, c);
    }

    const adSetById = new Map();
    for (const as of adSets || []) {
      const id = String(as.id || as.adSetId || "");
      if (id) adSetById.set(id, as);
    }

    const adById = new Map();
    for (const ad of ads || []) {
      const id = String(ad.adId || ad.id || "");
      if (id) adById.set(id, ad);
    }

    const normalizeNumbers = (raw = {}) => {
      const spend = raw.spend !== undefined && raw.spend !== null ? Number(raw.spend) : 0;
      const impressions = raw.impressions !== undefined && raw.impressions !== null ? Number(raw.impressions) : 0;
      const reach = raw.reach !== undefined && raw.reach !== null ? Number(raw.reach) : 0;
      const clicks = raw.clicks !== undefined && raw.clicks !== null ? Number(raw.clicks) : 0;
      const linkClicks =
        raw.linkClicks !== undefined && raw.linkClicks !== null
          ? Number(raw.linkClicks)
          : raw.inline_link_clicks !== undefined
          ? Number(raw.inline_link_clicks)
          : clicks;
      const conversions =
        raw.conversions !== undefined && raw.conversions !== null ? Number(raw.conversions) : 0;
      const purchases =
        raw.purchases !== undefined && raw.purchases !== null ? Number(raw.purchases) : 0;
      const leads = raw.leads !== undefined && raw.leads !== null ? Number(raw.leads) : 0;
      const results = conversions > 0 ? conversions : purchases > 0 ? purchases : leads;
      const conversionValue =
        raw.conversionValue !== undefined && raw.conversionValue !== null
          ? Number(raw.conversionValue)
          : 0;

      // Derived metrics strictly calculated from actual numbers when denominator > 0
      const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
      const cpc = clicks > 0 ? Number((spend / clicks).toFixed(2)) : null;
      const cpm = impressions > 0 ? Number(((spend / impressions) * 1000).toFixed(2)) : null;
      const cpr = results > 0 ? Number((spend / results).toFixed(2)) : null;
      const cpa = results > 0 ? Number((spend / results).toFixed(2)) : null;
      const roas =
        spend > 0 && conversionValue > 0
          ? Number((conversionValue / spend).toFixed(2))
          : raw.roas !== undefined && raw.roas !== null
          ? Number(raw.roas)
          : null;
      const frequency = reach > 0 ? Number((impressions / reach).toFixed(2)) : null;

      return {
        spend: Number(spend.toFixed(2)),
        impressions,
        reach,
        frequency,
        clicks,
        linkClicks,
        conversions: results,
        purchases,
        leads,
        conversionValue: Number(conversionValue.toFixed(2)),
        ctr,
        cpc,
        cpm,
        cpr,
        cpa,
        roas,
      };
    };

    const records = [];
    const seenEntityIds = new Set();

    // First process actual insight rows if present
    for (const row of insights || []) {
      const cId = String(row.campaignId || row.campaign_id || "");
      const asId = String(row.adSetId || row.adset_id || "");
      const aId = String(row.adId || row.ad_id || "");
      const camp = campById.get(cId) || {};
      const adSet = adSetById.get(asId) || {};
      const ad = adById.get(aId) || {};

      const entityKey =
        granularity === "ad" ? aId || `${cId}:${asId}:${row.adName || ""}` :
        granularity === "adset" ? asId || `${cId}:${row.adSetName || ""}` :
        cId || row.campaignName || "";
      if (entityKey) seenEntityIds.add(entityKey);

      const metrics = normalizeNumbers(row);
      records.push({
        accountId: accountId || row.accountId || "",
        accountName: accountName || row.accountName || "",
        channel,
        currency: row.currency || currency || "INR",
        campaignId: cId,
        campaignName: row.campaignName || row.campaign_name || camp.name || "",
        objective: row.objective || camp.objective || "",
        adSetId: asId,
        adSetName: row.adSetName || row.adset_name || adSet.name || "",
        optimizationGoal: adSet.optimizationGoal || adSet.optimization_goal || "",
        adId: aId,
        adName: row.adName || row.ad_name || ad.adName || ad.name || "",
        creativeId: ad.creativeId || "",
        creativeName: ad.creativeName || "",
        status:
          (granularity === "ad" && (ad.status || ad.effectiveStatus)) ||
          (granularity === "adset" && (adSet.status || adSet.effectiveStatus)) ||
          row.status ||
          camp.status ||
          camp.effectiveStatus ||
          "UNKNOWN",
        dailyBudget:
          (granularity === "adset" ? adSet.dailyBudget : camp.dailyBudget) ?? "",
        dateStart: row.dateStart || row.date_start || null,
        dateStop: row.dateStop || row.date_stop || null,
        ...metrics,
      });
    }

    // Include entities from live hierarchy when insights had 0 rows for active/paused entities
    if (includeZeroImpressionEntities) {
      if (granularity === "ad" && ads.length > 0) {
        for (const ad of ads) {
          const aId = String(ad.adId || ad.id || "");
          if (aId && seenEntityIds.has(aId)) continue;
          const cId = String(ad.campaignId || ad.campaign_id || "");
          const asId = String(ad.adSetId || ad.adset_id || "");
          const camp = campById.get(cId) || {};
          const adSet = adSetById.get(asId) || {};
          const metrics = normalizeNumbers(ad.performance || {});
          records.push({
            accountId,
            accountName,
            channel,
            currency,
            campaignId: cId,
            campaignName: ad.campaignName || camp.name || "",
            objective: camp.objective || "",
            adSetId: asId,
            adSetName: ad.adSetName || adSet.name || "",
            optimizationGoal: adSet.optimizationGoal || "",
            adId: aId,
            adName: ad.adName || ad.name || "",
            creativeId: ad.creativeId || "",
            creativeName: ad.creativeName || "",
            status: ad.status || ad.effectiveStatus || "UNKNOWN",
            dailyBudget: adSet.dailyBudget || camp.dailyBudget || "",
            dateStart: null,
            dateStop: null,
            ...metrics,
          });
        }
      } else if (granularity === "adset" && adSets.length > 0) {
        for (const as of adSets) {
          const asId = String(as.id || as.adSetId || "");
          if (asId && seenEntityIds.has(asId)) continue;
          const cId = String(as.campaignId || as.campaign_id || "");
          const camp = campById.get(cId) || {};
          const metrics = normalizeNumbers({});
          records.push({
            accountId,
            accountName,
            channel,
            currency,
            campaignId: cId,
            campaignName: as.campaignName || camp.name || "",
            objective: camp.objective || "",
            adSetId: asId,
            adSetName: as.name || as.adSetName || "",
            optimizationGoal: as.optimizationGoal || "",
            adId: "",
            adName: "",
            creativeId: "",
            creativeName: "",
            status: as.status || as.effectiveStatus || "UNKNOWN",
            dailyBudget: as.dailyBudget || camp.dailyBudget || "",
            dateStart: null,
            dateStop: null,
            ...metrics,
          });
        }
      } else if (campaigns.length > 0) {
        for (const c of campaigns) {
          const cId = String(c.id || c.campaignId || "");
          if (cId && seenEntityIds.has(cId)) continue;
          const metrics = normalizeNumbers(c);
          records.push({
            accountId,
            accountName,
            channel,
            currency,
            campaignId: cId,
            campaignName: c.name || c.campaignName || "",
            objective: c.objective || "",
            adSetId: "",
            adSetName: "",
            optimizationGoal: "",
            adId: "",
            adName: "",
            creativeId: "",
            creativeName: "",
            status: c.status || c.effectiveStatus || "UNKNOWN",
            dailyBudget: c.dailyBudget ?? "",
            dateStart: null,
            dateStop: null,
            ...metrics,
          });
        }
      }
    }

    return records;
  }

  /**
   * Map structured source records onto the exact spreadsheet header order.
   * Never guesses values for unmapped columns; reports both mapped and unmapped fields clearly.
   */
  static mapRecordsToSheetColumns({
    records = [],
    headers = [],
    columnClassification = null,
    dateResolution = null,
  } = {}) {
    const schema = columnClassification || this.classifySheetColumns(headers, []);
    const formattedReportingDate = dateResolution?.formattedDate || dateResolution?.reportingDateIso || "";
    const formattedStartDate = dateResolution?.timeRange?.since
      ? this.formatDateForSheet(dateResolution.timeRange.since, schema.detectedDateFormat)
      : formattedReportingDate;
    const formattedStopDate = dateResolution?.timeRange?.until
      ? this.formatDateForSheet(dateResolution.timeRange.until, schema.detectedDateFormat)
      : formattedReportingDate;

    const rowObjects = [];
    const rowArrays = [];

    for (const rec of records) {
      const rowObj = {};
      const rowArr = [];

      for (const col of schema.columnMappings) {
        let cellValue = "";

        if (!col.mappable || !col.canonicalKey) {
          // Check if record already carries an exact header key (e.g., from custom upstream mapping)
          if (rec[col.headerName] !== undefined && rec[col.headerName] !== null) {
            cellValue = rec[col.headerName];
          } else {
            cellValue = "";
          }
        } else {
          switch (col.canonicalKey) {
            case "reportingDate":
              cellValue = formattedReportingDate;
              break;
            case "dateStart":
              cellValue = rec.dateStart
                ? this.formatDateForSheet(rec.dateStart, schema.detectedDateFormat)
                : formattedStartDate;
              break;
            case "dateStop":
              cellValue = rec.dateStop
                ? this.formatDateForSheet(rec.dateStop, schema.detectedDateFormat)
                : formattedStopDate;
              break;
            default: {
              const rawVal = rec[col.canonicalKey];
              cellValue = rawVal === null || rawVal === undefined ? "" : rawVal;
              break;
            }
          }
        }

        rowObj[col.headerName] = cellValue;
        rowArr.push(cellValue);
      }

      rowObjects.push(rowObj);
      rowArrays.push(rowArr);
    }

    return {
      headers: schema.headers,
      rowObjects,
      rowArrays,
      recordsMapped: rowArrays.length,
      reportingDateUsed: formattedReportingDate,
      reportingDateIso: dateResolution?.reportingDateIso || null,
      sheetDateFormat: schema.detectedDateFormat,
      fieldMappings: schema.mappedColumns.map((c) => ({
        sheetColumn: c.headerName,
        columnLetter: c.columnLetter,
        sourceField: c.canonicalKey,
        category: c.category,
      })),
      unmappedFields: schema.unmappedColumns.map((c) => ({
        sheetColumn: c.headerName,
        columnLetter: c.columnLetter,
        reason: "No matching source field in connected ad account data; cell left blank.",
      })),
    };
  }

  /**
   * Append mapped rows into the connected Google Sheet and verify write completion.
   */
  static async appendMappedRowsToSheet({
    userId,
    sheetIndex = null,
    sheetUrl = null,
    tabName = null,
    userMessage = "",
    rowArrays = [],
    resolvedSheet = null,
  } = {}) {
    const sheetContext =
      resolvedSheet ||
      (await SheetInspectorService.resolveAndReadSheet({
        userId,
        sheetIndex,
        sheetUrl,
        tabName,
        userMessage,
      }));

    if (!sheetContext?.success) {
      throw new Error(sheetContext?.message || "Could not resolve connected Google Sheet for appending.");
    }

    if (!Array.isArray(rowArrays) || rowArrays.length === 0) {
      return {
        success: true,
        spreadsheetId: sheetContext.spreadsheetId,
        sheetName: sheetContext.sheetName,
        targetTab: sheetContext.targetTab,
        rowsAppended: 0,
        verified: true,
        message: "No records to append.",
      };
    }

    const writeResult = await sheetsService.appendRowsToWorksheet({
      spreadsheetIdOrUrl: sheetContext.spreadsheetId || sheetContext.sheetUrl,
      sheetTitle: sheetContext.targetTab,
      values: rowArrays,
      verifyWrite: true,
    });

    if (!writeResult?.success) {
      throw new Error(`Google Sheets append failed on tab "${sheetContext.targetTab}".`);
    }

    return {
      success: true,
      spreadsheetId: sheetContext.spreadsheetId,
      sheetIndex: sheetContext.sheetIndex,
      sheetName: sheetContext.sheetName,
      targetTab: sheetContext.targetTab,
      updatedRange: writeResult.updatedRange || null,
      rowsAppended: writeResult.updatedRows || rowArrays.length,
      updatedCells: writeResult.updatedCells || 0,
      verified: Boolean(writeResult.verified),
      verifiedRowsCount: writeResult.verifiedRowsCount ?? rowArrays.length,
    };
  }
}

export default DynamicSheetExecutionService;

