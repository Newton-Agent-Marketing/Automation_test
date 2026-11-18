/**
 * Context Graph Compiler: buildAgentContextFromGraph
 * 
 * Compiles the user's live Canvas Graph (Nodes & Edges) into a verified, ready-to-execute
 * ACTIVE_AI_CONTEXT_LAYER and metaAdSetExecutionSpec.
 * 
 * STRICT GLOBAL RULE — ZERO DUMMY DATA & 100% EXACT SELECTION FIDELITY:
 * - Whatever Performance Goal and Conversion Location the user selects in the ad_channel
 *   node UI MUST be preserved verbatim and passed into Meta Ads MCP execution calls.
 */

import {
  META_PERFORMANCE_GOAL_MAP,
  getPerformanceGoalByKey,
  getAttributionSpecByKey,
} from "../../config/metaPerformanceGoals.config.js";

/**
 * Builds the complete structured ACTIVE_AI_CONTEXT_LAYER from canvas nodes and edges.
 *
 * @param {Object} params
 * @param {Array} params.nodes - List of graph nodes
 * @param {Array} params.edges - List of graph edges
 * @param {Object} [params.liveCanvasGraph] - Live unpersisted canvas graph from client
 * @param {String} [params.resolvedPageId] - Meta Facebook Page ID for Case D
 * @param {String} [params.userId] - User ID
 * @returns {Object} { activeAiContextLayer, activeFunnels, selectedAdChannel, selectedProduct, selectedWarehouse }
 */
export function buildAgentContextFromGraph({
  nodes = [],
  edges = [],
  liveCanvasGraph = null,
  resolvedPageId = null,
  userId = null,
} = {}) {
  // Use liveCanvasGraph if provided and populated
  let effectiveNodes = Array.isArray(liveCanvasGraph?.nodes) && liveCanvasGraph.nodes.length > 0
    ? liveCanvasGraph.nodes
    : (Array.isArray(nodes) ? nodes : []);
  let effectiveEdges = Array.isArray(liveCanvasGraph?.edges) && liveCanvasGraph.edges.length > 0
    ? liveCanvasGraph.edges
    : (Array.isArray(edges) ? edges : []);

  if (effectiveNodes.length === 0) {
    return {
      activeAiContextLayer: null,
      activeFunnels: [],
      selectedAdChannel: null,
      selectedProduct: null,
      selectedWarehouse: null,
    };
  }

  // Find all node types
  const channelNodes = effectiveNodes.filter((n) => n.type === "ad_channel");
  const productNodes = effectiveNodes.filter((n) => n.type === "product");
  const briefNodes = effectiveNodes.filter((n) => n.type === "marketing_brief");
  const warehouseNodes = effectiveNodes.filter((n) => n.type === "data_warehouse");
  const businessNodes = effectiveNodes.filter((n) => n.type === "business_unit");

  // Select primary nodes
  const primaryChannel = channelNodes.find((c) => {
    const cName = String(c.data?.channelName || c.data?.channel || c.label || "").toLowerCase();
    return cName.includes("meta") || cName.includes("facebook") || cName.includes("instagram");
  }) || channelNodes[0] || null;

  const primaryProduct = productNodes[0] || null;
  const primaryBrief = briefNodes[0] || null;
  const primaryWarehouse = warehouseNodes[0] || null;
  const primaryBusiness = businessNodes[0] || null;

  // Extract Product Node tracking parameters (Web Pixel vs Mobile App)
  const productData = primaryProduct?.data || {};
  const webTrackingPixelId =
    productData.web_tracking_pixel_id ||
    productData.pixel_id ||
    productData.pixelId ||
    primaryChannel?.data?.pixelId ||
    primaryChannel?.data?.pixel_id ||
    null;

  const mobileAppId =
    productData.mobile_app_id ||
    productData.application_id ||
    productData.appId ||
    primaryChannel?.data?.appId ||
    primaryChannel?.data?.application_id ||
    null;

  const appStoreUrl =
    productData.app_store_url ||
    productData.object_store_url ||
    primaryChannel?.data?.objectStoreUrl ||
    primaryChannel?.data?.object_store_url ||
    null;

  const mobileDeepLinkUrl =
    productData.mobile_deep_link_url ||
    appStoreUrl ||
    null;

  const webLandingPageUrl =
    productData.web_landing_page_url ||
    productData.productUrl ||
    primaryProduct?.details?.productUrl ||
    productData.url ||
    null;

  // Extract Page ID for Case D (PAGE_ONLY)
  const effectivePageId =
    resolvedPageId ||
    primaryChannel?.data?.page_id ||
    primaryChannel?.data?.pageId ||
    null;

  // Extract Funnel Stages from primaryChannel
  let rawFunnels = Array.isArray(primaryChannel?.data?.funnels) && primaryChannel.data.funnels.length > 0
    ? primaryChannel.data.funnels
    : [];

  // Fallback to legacy single-goal if no funnels array present
  if (rawFunnels.length === 0 && primaryChannel) {
    let legacyGoalKey = primaryChannel.data?.performance_goal_key;
    if (!legacyGoalKey) {
      const rawText = String(
        primaryChannel.data?.optimization_goal ||
        primaryChannel.data?.performance_goal_label ||
        primaryChannel.data?.funnelEvent ||
        ""
      ).toUpperCase();
      if (rawText.includes("VALUE") || rawText.includes("ROAS")) {
        legacyGoalKey = "WEBSITE_CONVERSION_VALUE";
      } else if (rawText.includes("LANDING") || rawText.includes("VIEW")) {
        legacyGoalKey = "LANDING_PAGE_VIEWS";
      } else if (rawText.includes("CLICK") || rawText.includes("TRAFFIC")) {
        legacyGoalKey = "LINK_CLICKS";
      } else if (rawText.includes("INSTALL") || rawText.includes("APP")) {
        legacyGoalKey = "APP_INSTALLS";
      } else if (rawText.includes("FORM") || (rawText.includes("LEAD") && !rawText.includes("WEBSITE"))) {
        legacyGoalKey = "INSTANT_FORM_LEADS";
      } else if (rawText.includes("MESSAGE") || rawText.includes("CONVERSATION")) {
        legacyGoalKey = "MESSAGING_CONVERSATIONS";
      } else if (rawText.includes("THRUPLAY") || rawText.includes("VIDEO")) {
        legacyGoalKey = "THRUPLAY_VIDEO_VIEWS";
      } else if (rawText.includes("REACH")) {
        legacyGoalKey = "REACH";
      } else if (rawText.includes("IMPRESSION")) {
        legacyGoalKey = "IMPRESSIONS";
      } else if (rawText.includes("LEAD")) {
        legacyGoalKey = "WEBSITE_LEADS";
      } else {
        legacyGoalKey = "WEBSITE_CONVERSIONS";
      }
    }

    const fallbackGoal = getPerformanceGoalByKey(legacyGoalKey);
    rawFunnels = [
      {
        id: "stage_default_1",
        stage_name: primaryChannel.data?.funnelEvent ? `Funnel (${primaryChannel.data.funnelEvent})` : "Primary Direct Response Funnel",
        stage_type: "BOFU",
        performance_goal_key: fallbackGoal.key,
        performance_goal_label: fallbackGoal.label,
        optimization_goal: primaryChannel.data?.optimization_goal || fallbackGoal.optimization_goal,
        billing_event: primaryChannel.data?.billing_event || fallbackGoal.billing_event,
        conversion_location: primaryChannel.data?.conversion_location || fallbackGoal.default_conversion_location,
        destination_type: primaryChannel.data?.destination_type || primaryChannel.data?.conversion_location || fallbackGoal.default_conversion_location,
        campaign_objective: primaryChannel.data?.campaign_objective || fallbackGoal.campaign_objective,
        custom_event_type: primaryChannel.data?.custom_event_type || primaryChannel.data?.pixel_event || fallbackGoal.default_custom_event_type || (fallbackGoal.requires_pixel_or_event ? "PURCHASE" : null),
        pixel_event: primaryChannel.data?.pixel_event || primaryChannel.data?.custom_event_type || fallbackGoal.default_custom_event_type || (fallbackGoal.requires_pixel_or_event ? "PURCHASE" : null),
        attribution_setting: primaryChannel.data?.attribution_setting || primaryChannel.data?.funnels?.[0]?.attribution_setting || "7_DAY_CLICK_1_DAY_VIEW",
      },
    ];
  }

  // Compile activeFunnels[] with exact Meta Ads MCP specs
  const activeFunnels = rawFunnels.map((stage, idx) => {
    let goalKey = stage.performance_goal_key;
    if (!goalKey) {
      const rawText = String(stage.optimization_goal || stage.performance_goal_label || stage.stage_name || "").toUpperCase();
      if (rawText.includes("VALUE") || rawText.includes("ROAS")) {
        goalKey = "WEBSITE_CONVERSION_VALUE";
      } else if (rawText.includes("LANDING") || rawText.includes("VIEW")) {
        goalKey = "LANDING_PAGE_VIEWS";
      } else if (rawText.includes("CLICK") || rawText.includes("TRAFFIC")) {
        goalKey = "LINK_CLICKS";
      } else if (rawText.includes("INSTALL") || rawText.includes("APP")) {
        goalKey = "APP_INSTALLS";
      } else if (rawText.includes("FORM") || (rawText.includes("LEAD") && !rawText.includes("WEBSITE"))) {
        goalKey = "INSTANT_FORM_LEADS";
      } else if (rawText.includes("MESSAGE") || rawText.includes("CONVERSATION")) {
        goalKey = "MESSAGING_CONVERSATIONS";
      } else if (rawText.includes("THRUPLAY") || rawText.includes("VIDEO")) {
        goalKey = "THRUPLAY_VIDEO_VIEWS";
      } else if (rawText.includes("REACH")) {
        goalKey = "REACH";
      } else if (rawText.includes("IMPRESSION")) {
        goalKey = "IMPRESSIONS";
      } else if (rawText.includes("LEAD")) {
        goalKey = "WEBSITE_LEADS";
      } else {
        goalKey = "WEBSITE_CONVERSIONS";
      }
    }
    const goalDef = getPerformanceGoalByKey(goalKey);

    // 1. Resolve Campaign & Ad Set Parameters Directly from the Node
    const campaign_objective = stage.campaign_objective || goalDef.campaign_objective;
    const optimization_goal = stage.optimization_goal || goalDef.optimization_goal;
    const billing_event = stage.billing_event || goalDef.billing_event || "IMPRESSIONS";
    
    // destination_type: stage.conversion_location !== "UNDEFINED" ? stage.conversion_location : undefined
    const convLocation = stage.conversion_location || stage.destination_type || goalDef.default_conversion_location;
    const destination_type = (convLocation && convLocation !== "UNDEFINED") ? convLocation : undefined;

    // 2. Dynamically Construct the Exact Meta API promoted_object
    const promotedType = goalDef.promoted_object_type;
    let promoted_object = undefined;

    if ((convLocation === "WEBSITE" || convLocation === "WEBSITE_AND_APP") && promotedType === "PIXEL_EVENT") {
      // Case A: WEBSITE with PIXEL_EVENT
      const eventType = stage.custom_event_type || stage.pixel_event || goalDef.default_custom_event_type || "PURCHASE";
      if (webTrackingPixelId) {
        promoted_object = {
          pixel_id: String(webTrackingPixelId).trim(),
          custom_event_type: String(eventType).toUpperCase().trim(),
        };
      }
    } else if (convLocation === "APP" && promotedType === "APP_INSTALL") {
      // Case B: APP with APP_INSTALL
      if (mobileAppId) {
        promoted_object = {
          application_id: String(mobileAppId).trim(),
          ...(appStoreUrl ? { object_store_url: String(appStoreUrl).trim() } : {}),
        };
      }
    } else if (convLocation === "APP" && promotedType === "APP_EVENT") {
      // Case C: APP with APP_EVENT
      const eventType = stage.custom_event_type || stage.pixel_event || "PURCHASE";
      if (mobileAppId) {
        promoted_object = {
          application_id: String(mobileAppId).trim(),
          ...(appStoreUrl ? { object_store_url: String(appStoreUrl).trim() } : {}),
          custom_event_type: String(eventType).toUpperCase().trim(),
        };
      }
    } else if (convLocation === "ON_AD" || convLocation === "MESSAGING_APPS" || promotedType === "PAGE_ONLY") {
      // Case D: ON_AD or MESSAGING_APPS or PAGE_ONLY
      if (effectivePageId) {
        promoted_object = {
          page_id: String(effectivePageId).trim(),
        };
      }
    }

    // Resolve landing destination URL
    const landing_destination_url = convLocation === "APP"
      ? (mobileDeepLinkUrl || appStoreUrl || webLandingPageUrl || "")
      : (webLandingPageUrl || "");

    const attribution_setting = stage.attribution_setting || primaryChannel?.data?.attribution_setting || "7_DAY_CLICK_1_DAY_VIEW";
    const attribution_spec = getAttributionSpecByKey(attribution_setting);

    return {
      stage_name: stage.stage_name || `Stage #${idx + 1} (${stage.stage_type || "BOFU"})`,
      stage_type: stage.stage_type || "BOFU",
      performance_goal_key: goalKey,
      performance_goal_label: stage.performance_goal_label || goalDef.label,
      campaign_objective,
      attribution_setting,
      attribution_spec,
      adset_spec: {
        optimization_goal,
        billing_event,
        destination_type,
        attribution_setting,
        attribution_spec,
        ...(promoted_object ? { promoted_object } : {}),
      },
      landing_destination_url,
    };
  });

  const selectedAdChannel = primaryChannel ? {
    id: primaryChannel.id,
    channel: primaryChannel.data?.channelName || primaryChannel.data?.channel || "Meta Ads",
    adAccountId: primaryChannel.data?.adAccountId || "",
    accountName: primaryChannel.data?.accountName || "",
    activeFunnels,
  } : null;

  const selectedProduct = primaryProduct ? {
    id: primaryProduct.id,
    name: primaryProduct.data?.productName || primaryProduct.label || "Product Catalog",
    productUrl: webLandingPageUrl || "",
    web_landing_page_url: webLandingPageUrl || "",
    web_tracking_pixel_id: webTrackingPixelId || null,
    mobile_app_id: mobileAppId || null,
    app_store_url: appStoreUrl || null,
    mobile_deep_link_url: mobileDeepLinkUrl || null,
    platforms: primaryProduct.data?.productPlatforms || ["Web"],
    catalogCount: primaryProduct.data?.catalogCount || primaryProduct.data?.products?.length || 0,
  } : null;

  const selectedWarehouse = primaryWarehouse ? {
    id: primaryWarehouse.id,
    sheetUrl: primaryWarehouse.data?.sheetUrl || "",
    worksheetName: primaryWarehouse.data?.worksheetName || primaryWarehouse.data?.targetTab || "",
    dataLabels: primaryWarehouse.data?.dataLabels || "",
    sheetsCount: Array.isArray(primaryWarehouse.data?.sheets) ? primaryWarehouse.data.sheets.length : (primaryWarehouse.data?.sheetUrl ? 1 : 0),
  } : null;

  const activeAiContextLayer = {
    selectedAdChannel,
    selectedProduct,
    selectedWarehouse,
  };

  return {
    activeAiContextLayer,
    activeFunnels,
    selectedAdChannel,
    selectedProduct,
    selectedWarehouse,
  };
}

export default buildAgentContextFromGraph;
