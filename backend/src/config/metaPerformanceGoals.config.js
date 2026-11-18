/**
 * Shared Meta Performance Goal <-> Conversion Location Map
 * Exact Meta Marketing API v21.0 / ODAX Specifications
 */

export const META_PERFORMANCE_GOAL_MAP = {
  WEBSITE_CONVERSIONS: {
    key: "WEBSITE_CONVERSIONS",
    label: "Maximize number of conversions (Website)",
    optimization_goal: "OFFSITE_CONVERSIONS",
    billing_event: "IMPRESSIONS",
    default_conversion_location: "WEBSITE",
    allowed_conversion_locations: ["WEBSITE", "WEBSITE_AND_APP"],
    campaign_objective: "OUTCOME_SALES",
    requires_pixel_or_event: true,
    default_custom_event_type: "PURCHASE",
    promoted_object_type: "PIXEL_EVENT",
  },
  WEBSITE_CONVERSION_VALUE: {
    key: "WEBSITE_CONVERSION_VALUE",
    label: "Maximize value of conversions (ROAS)",
    optimization_goal: "VALUE",
    billing_event: "IMPRESSIONS",
    default_conversion_location: "WEBSITE",
    allowed_conversion_locations: ["WEBSITE"],
    campaign_objective: "OUTCOME_SALES",
    requires_pixel_or_event: true,
    default_custom_event_type: "PURCHASE",
    promoted_object_type: "PIXEL_EVENT",
  },
  LANDING_PAGE_VIEWS: {
    key: "LANDING_PAGE_VIEWS",
    label: "Maximize number of landing page views",
    optimization_goal: "LANDING_PAGE_VIEWS",
    billing_event: "IMPRESSIONS",
    default_conversion_location: "WEBSITE",
    allowed_conversion_locations: ["WEBSITE"],
    campaign_objective: "OUTCOME_TRAFFIC",
    requires_pixel_or_event: false,
    default_custom_event_type: null,
    promoted_object_type: "PAGE_ONLY",
  },
  LINK_CLICKS: {
    key: "LINK_CLICKS",
    label: "Maximize number of link clicks",
    optimization_goal: "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
    default_conversion_location: "WEBSITE",
    allowed_conversion_locations: ["WEBSITE", "APP", "MESSAGING_APPS"],
    campaign_objective: "OUTCOME_TRAFFIC",
    requires_pixel_or_event: false,
    default_custom_event_type: null,
    promoted_object_type: "PAGE_ONLY",
  },
  APP_INSTALLS: {
    key: "APP_INSTALLS",
    label: "Maximize number of app installs",
    optimization_goal: "APP_INSTALLS",
    billing_event: "IMPRESSIONS",
    default_conversion_location: "APP",
    allowed_conversion_locations: ["APP"],
    campaign_objective: "OUTCOME_APP_PROMOTION",
    requires_pixel_or_event: false,
    default_custom_event_type: null,
    promoted_object_type: "APP_INSTALL",
  },
  APP_EVENTS: {
    key: "APP_EVENTS",
    label: "Maximize number of app events",
    optimization_goal: "OFFSITE_CONVERSIONS",
    billing_event: "IMPRESSIONS",
    default_conversion_location: "APP",
    allowed_conversion_locations: ["APP"],
    campaign_objective: "OUTCOME_APP_PROMOTION",
    requires_pixel_or_event: true,
    default_custom_event_type: "PURCHASE",
    promoted_object_type: "APP_EVENT",
  },
  INSTANT_FORM_LEADS: {
    key: "INSTANT_FORM_LEADS",
    label: "Maximize number of leads (Instant Forms)",
    optimization_goal: "LEAD_GENERATION",
    billing_event: "IMPRESSIONS",
    default_conversion_location: "ON_AD",
    allowed_conversion_locations: ["ON_AD"],
    campaign_objective: "OUTCOME_LEADS",
    requires_pixel_or_event: false,
    default_custom_event_type: null,
    promoted_object_type: "PAGE_ONLY",
  },
  WEBSITE_LEADS: {
    key: "WEBSITE_LEADS",
    label: "Maximize number of conversion leads (Website)",
    optimization_goal: "OFFSITE_CONVERSIONS",
    billing_event: "IMPRESSIONS",
    default_conversion_location: "WEBSITE",
    allowed_conversion_locations: ["WEBSITE"],
    campaign_objective: "OUTCOME_LEADS",
    requires_pixel_or_event: true,
    default_custom_event_type: "LEAD",
    promoted_object_type: "PIXEL_EVENT",
  },
  MESSAGING_CONVERSATIONS: {
    key: "MESSAGING_CONVERSATIONS",
    label: "Maximize number of conversations (WhatsApp / Messenger / IG)",
    optimization_goal: "CONVERSATIONS",
    billing_event: "IMPRESSIONS",
    default_conversion_location: "MESSAGING_APPS",
    allowed_conversion_locations: ["MESSAGING_APPS", "WHATSAPP", "MESSENGER", "INSTAGRAM_DIRECT"],
    campaign_objective: "OUTCOME_ENGAGEMENT",
    requires_pixel_or_event: false,
    default_custom_event_type: null,
    promoted_object_type: "PAGE_ONLY",
  },
  THRUPLAY_VIDEO_VIEWS: {
    key: "THRUPLAY_VIDEO_VIEWS",
    label: "Maximize ThruPlay video views",
    optimization_goal: "THRUPLAY",
    billing_event: "IMPRESSIONS",
    default_conversion_location: "ON_VIDEO",
    allowed_conversion_locations: ["ON_VIDEO"],
    campaign_objective: "OUTCOME_ENGAGEMENT",
    requires_pixel_or_event: false,
    default_custom_event_type: null,
    promoted_object_type: "PAGE_ONLY",
  },
  REACH: {
    key: "REACH",
    label: "Maximize reach of ads",
    optimization_goal: "REACH",
    billing_event: "IMPRESSIONS",
    default_conversion_location: "UNDEFINED",
    allowed_conversion_locations: ["UNDEFINED"],
    campaign_objective: "OUTCOME_AWARENESS",
    requires_pixel_or_event: false,
    default_custom_event_type: null,
    promoted_object_type: "PAGE_ONLY",
  },
  IMPRESSIONS: {
    key: "IMPRESSIONS",
    label: "Maximize number of impressions",
    optimization_goal: "IMPRESSIONS",
    billing_event: "IMPRESSIONS",
    default_conversion_location: "UNDEFINED",
    allowed_conversion_locations: ["UNDEFINED"],
    campaign_objective: "OUTCOME_AWARENESS",
    requires_pixel_or_event: false,
    default_custom_event_type: null,
    promoted_object_type: "PAGE_ONLY",
  },
};

export const META_CONVERSION_EVENTS = [
  "PURCHASE",
  "ADD_TO_CART",
  "INITIATED_CHECKOUT",
  "LEAD",
  "COMPLETE_REGISTRATION",
  "VIEW_CONTENT",
  "SEARCH",
  "SUBSCRIBE",
  "CONTACT",
];

export const CONVERSION_LOCATION_OPTIONS = [
  "WEBSITE",
  "APP",
  "ON_AD",
  "MESSAGING_APPS",
  "ON_VIDEO",
  "UNDEFINED",
  "WEBSITE_AND_APP",
  "WHATSAPP",
  "MESSENGER",
  "INSTAGRAM_DIRECT",
];

export const CONVERSION_LOCATION_LABELS = {
  WEBSITE: "Website",
  WEBSITE_AND_APP: "Website and App",
  APP: "App",
  ON_AD: "Instant Forms (On Ad)",
  MESSAGING_APPS: "Messaging Apps",
  WHATSAPP: "WhatsApp",
  MESSENGER: "Messenger",
  INSTAGRAM_DIRECT: "Instagram Direct",
  ON_VIDEO: "On Video",
  UNDEFINED: "None (Awareness/Reach)",
};

export const META_ATTRIBUTION_SETTINGS = [
  {
    key: "7_DAY_CLICK_1_DAY_VIEW",
    label: "7-day click or 1-day view (Default & Recommended)",
    description: "Attribution within 7 days of clicking or 1 day of viewing",
    spec: [
      { event_type: "CLICK_THROUGH", window_days: 7 },
      { event_type: "VIEW_THROUGH", window_days: 1 },
    ],
  },
  {
    key: "7_DAY_CLICK",
    label: "7-day click",
    description: "Attribution within 7 days of clicking only",
    spec: [{ event_type: "CLICK_THROUGH", window_days: 7 }],
  },
  {
    key: "1_DAY_CLICK",
    label: "1-day click",
    description: "Attribution within 1 day of clicking only",
    spec: [{ event_type: "CLICK_THROUGH", window_days: 1 }],
  },
  {
    key: "1_DAY_CLICK_1_DAY_VIEW",
    label: "1-day click or 1-day view",
    description: "Attribution within 1 day of clicking or 1 day of viewing",
    spec: [
      { event_type: "CLICK_THROUGH", window_days: 1 },
      { event_type: "VIEW_THROUGH", window_days: 1 },
    ],
  },
];

export function getAttributionSpecByKey(key) {
  if (!key) return META_ATTRIBUTION_SETTINGS[0].spec;
  const cleanKey = String(key).trim().toUpperCase();
  const found = META_ATTRIBUTION_SETTINGS.find((a) => a.key === cleanKey);
  return found ? found.spec : META_ATTRIBUTION_SETTINGS[0].spec;
}

export function getPerformanceGoalByKey(key) {
  if (!key) return META_PERFORMANCE_GOAL_MAP.WEBSITE_CONVERSIONS;
  return META_PERFORMANCE_GOAL_MAP[key] || META_PERFORMANCE_GOAL_MAP.WEBSITE_CONVERSIONS;
}

export function findGoalByOptimizationAndLocation(optGoal, location) {
  const normOpt = String(optGoal || "").toUpperCase();
  const normLoc = String(location || "").toUpperCase();

  const entries = Object.values(META_PERFORMANCE_GOAL_MAP);
  const exact = entries.find(
    (e) =>
      e.optimization_goal === normOpt &&
      (e.default_conversion_location === normLoc || e.allowed_conversion_locations.includes(normLoc))
  );
  if (exact) return exact;

  const optOnly = entries.find((e) => e.optimization_goal === normOpt);
  return optOnly || META_PERFORMANCE_GOAL_MAP.WEBSITE_CONVERSIONS;
}

export default META_PERFORMANCE_GOAL_MAP;
