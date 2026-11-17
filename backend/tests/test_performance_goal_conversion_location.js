import { describe, it } from "node:test";
import assert from "node:assert";
import {
  META_PERFORMANCE_GOAL_MAP,
  getPerformanceGoalByKey,
  findGoalByOptimizationAndLocation,
} from "../src/config/metaPerformanceGoals.config.js";
import { buildAgentContextFromGraph } from "../src/services/agent/contextGraphCompiler.js";

describe("Meta Performance Goal <-> Conversion Location Architecture", () => {
  it("should have all 12 ODAX performance goals correctly configured", () => {
    const keys = Object.keys(META_PERFORMANCE_GOAL_MAP);
    assert.strictEqual(keys.length, 12, "Must contain exactly 12 performance goal keys");

    const expectedKeys = [
      "WEBSITE_CONVERSIONS",
      "WEBSITE_CONVERSION_VALUE",
      "LANDING_PAGE_VIEWS",
      "LINK_CLICKS",
      "APP_INSTALLS",
      "APP_EVENTS",
      "INSTANT_FORM_LEADS",
      "WEBSITE_LEADS",
      "MESSAGING_CONVERSATIONS",
      "THRUPLAY_VIDEO_VIEWS",
      "REACH",
      "IMPRESSIONS",
    ];

    expectedKeys.forEach((key) => {
      assert.ok(META_PERFORMANCE_GOAL_MAP[key], `Missing performance goal key: ${key}`);
      const def = META_PERFORMANCE_GOAL_MAP[key];
      assert.ok(def.label, `${key} must have label`);
      assert.ok(def.optimization_goal, `${key} must have optimization_goal`);
      assert.ok(def.billing_event, `${key} must have billing_event`);
      assert.ok(def.default_conversion_location, `${key} must have default_conversion_location`);
      assert.ok(Array.isArray(def.allowed_conversion_locations), `${key} must have allowed_conversion_locations`);
      assert.ok(def.campaign_objective, `${key} must have campaign_objective`);
      assert.strictEqual(typeof def.requires_pixel_or_event, "boolean", `${key} must have boolean requires_pixel_or_event`);
    });
  });

  it("should compile ad_channel node with WEBSITE_CONVERSIONS into exact Meta adset spec", () => {
    const nodes = [
      {
        id: "channel_1",
        type: "ad_channel",
        data: {
          channelName: "Meta Ads",
          adAccountId: "act_1234567890",
          accountName: "Main Ad Account",
          performance_goal_key: "WEBSITE_CONVERSIONS",
          conversion_location: "WEBSITE",
          custom_event_type: "PURCHASE",
          funnels: [
            {
              stage_type: "BOFU",
              performance_goal_key: "WEBSITE_CONVERSIONS",
              optimization_goal: "OFFSITE_CONVERSIONS",
              billing_event: "IMPRESSIONS",
              conversion_location: "WEBSITE",
              destination_type: "WEBSITE",
              campaign_objective: "OUTCOME_SALES",
              custom_event_type: "PURCHASE",
              requires_pixel_or_event: true,
              promoted_object_type: "PIXEL_EVENT",
            },
          ],
        },
      },
      {
        id: "product_1",
        type: "product",
        data: {
          productName: "Divine Idol",
          web_tracking_pixel_id: "pix_999888777",
          web_landing_page_url: "https://example.com/item",
        },
      },
    ];

    const edges = [{ id: "e1", source: "channel_1", target: "product_1" }];

    const compiled = buildAgentContextFromGraph({ nodes, edges });
    assert.ok(compiled, "Compiled layer must exist");
    assert.strictEqual(compiled.selectedAdChannel.adAccountId, "act_1234567890");
    const primaryFunnel = compiled.activeFunnels[0];
    assert.ok(primaryFunnel, "Primary funnel must exist");
    assert.strictEqual(primaryFunnel.adset_spec.optimization_goal, "OFFSITE_CONVERSIONS");
    assert.strictEqual(primaryFunnel.adset_spec.destination_type, "WEBSITE");
    assert.strictEqual(primaryFunnel.campaign_objective, "OUTCOME_SALES");
    assert.deepStrictEqual(primaryFunnel.adset_spec.promoted_object, {
      pixel_id: "pix_999888777",
      custom_event_type: "PURCHASE",
    });
  });

  it("should compile APP_INSTALLS ad_channel without requiring pixel event", () => {
    const nodes = [
      {
        id: "channel_1",
        type: "ad_channel",
        data: {
          channelName: "Meta Ads",
          adAccountId: "act_1234567890",
          performance_goal_key: "APP_INSTALLS",
          conversion_location: "APP",
          funnels: [
            {
              stage_type: "BOFU",
              performance_goal_key: "APP_INSTALLS",
              optimization_goal: "APP_INSTALLS",
              billing_event: "IMPRESSIONS",
              conversion_location: "APP",
              destination_type: "APP",
              campaign_objective: "OUTCOME_APP_PROMOTION",
              requires_pixel_or_event: false,
              promoted_object_type: "APP_INSTALL",
            },
          ],
        },
      },
      {
        id: "product_1",
        type: "product",
        data: {
          productName: "My Game App",
          mobile_app_id: "fb_app_12345",
          app_store_url: "https://play.google.com/store/apps/details?id=com.game",
        },
      },
    ];

    const edges = [];
    const compiled = buildAgentContextFromGraph({ nodes, edges });
    const primaryFunnel = compiled.activeFunnels[0];
    assert.ok(primaryFunnel, "Primary funnel must exist");
    assert.strictEqual(primaryFunnel.adset_spec.optimization_goal, "APP_INSTALLS");
    assert.strictEqual(primaryFunnel.adset_spec.destination_type, "APP");
    assert.strictEqual(primaryFunnel.campaign_objective, "OUTCOME_APP_PROMOTION");
    assert.deepStrictEqual(primaryFunnel.adset_spec.promoted_object, {
      application_id: "fb_app_12345",
      object_store_url: "https://play.google.com/store/apps/details?id=com.game",
    });
  });

  it("should compile LINK_CLICKS (Traffic) with page_id promoted_object and null pixel event", () => {
    const nodes = [
      {
        id: "channel_1",
        type: "ad_channel",
        data: {
          channelName: "Meta Ads",
          adAccountId: "act_1234567890",
          page_id: "10987654321",
          performance_goal_key: "LINK_CLICKS",
          conversion_location: "WEBSITE",
          funnels: [
            {
              performance_goal_key: "LINK_CLICKS",
              optimization_goal: "LINK_CLICKS",
              billing_event: "IMPRESSIONS",
              conversion_location: "WEBSITE",
              destination_type: "WEBSITE",
              campaign_objective: "OUTCOME_TRAFFIC",
              requires_pixel_or_event: false,
              promoted_object_type: "PAGE_ONLY",
            },
          ],
        },
      },
    ];

    const compiled = buildAgentContextFromGraph({ nodes, edges: [] });
    const primaryFunnel = compiled.activeFunnels[0];
    assert.ok(primaryFunnel, "Primary funnel must exist");
    assert.strictEqual(primaryFunnel.adset_spec.optimization_goal, "LINK_CLICKS");
    assert.strictEqual(primaryFunnel.adset_spec.destination_type, "WEBSITE");
    assert.strictEqual(primaryFunnel.campaign_objective, "OUTCOME_TRAFFIC");
    assert.deepStrictEqual(primaryFunnel.adset_spec.promoted_object, {
      page_id: "10987654321",
    });
  });
});
