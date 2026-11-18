import { describe, it } from "node:test";
import assert from "node:assert";
import {
  MetaBauCampaignService,
  normalizeAdAccountId,
  extractMetaGraphError,
} from "../src/services/meta/metaBauCampaignService.js";

describe("Meta BAU Campaign Creation Service (Meta Graph API v27.0)", () => {
  describe("Ad Account ID Normalization", () => {
    it("should correctly normalize account IDs to act_<ID>", () => {
      assert.strictEqual(normalizeAdAccountId("1234567890"), "act_1234567890");
      assert.strictEqual(normalizeAdAccountId("act_1234567890"), "act_1234567890");
      assert.strictEqual(normalizeAdAccountId("  act_998877  "), "act_998877");
      assert.strictEqual(normalizeAdAccountId("invalid_account"), null);
      assert.strictEqual(normalizeAdAccountId(""), null);
      assert.strictEqual(normalizeAdAccountId(null), null);
    });
  });

  describe("Pre-Flight Validation", () => {
    const validBase = {
      ad_account_id: "act_1416124059911929",
      page_id: "10987654321",
      targeting: { geo_locations: { countries: ["IN"] } },
      daily_budget: 100000,
      headline: "Special Festival Puja Offer",
      primary_text: "Book your auspicious puja online with verified pandits.",
      landing_page_url: "https://utsav.example.com/puja",
    };

    it("should pass when all required parameters are valid", () => {
      const res = MetaBauCampaignService.validatePreFlight(validBase);
      assert.strictEqual(res.normalizedAccountId, "act_1416124059911929");
      assert.strictEqual(res.cleanedPageId, "10987654321");
    });

    it("should throw if ad_account_id is missing or invalid", () => {
      assert.throws(() => {
        MetaBauCampaignService.validatePreFlight({ ...validBase, ad_account_id: "not_an_account" });
      }, /Invalid or missing "ad_account_id"/);
    });

    it("should throw if page_id is missing", () => {
      assert.throws(() => {
        MetaBauCampaignService.validatePreFlight({ ...validBase, page_id: "" });
      }, /Missing required "page_id"/);
    });

    it("should throw if targeting.geo_locations is empty", () => {
      assert.throws(() => {
        MetaBauCampaignService.validatePreFlight({ ...validBase, targeting: { geo_locations: { countries: [] } } });
      }, /targeting.geo_locations" must be non-empty/);
    });

    it("should throw if budget is zero or negative", () => {
      assert.throws(() => {
        MetaBauCampaignService.validatePreFlight({ ...validBase, daily_budget: 0, campaign_daily_budget: 0 });
      }, /Either "daily_budget" .* or "campaign_daily_budget"/);
    });

    it("should pass if campaign_daily_budget is provided for CBO instead of daily_budget", () => {
      const res = MetaBauCampaignService.validatePreFlight({
        ...validBase,
        daily_budget: 0,
        campaign_daily_budget: 200000,
      });
      assert.ok(res.normalizedAccountId);
    });
  });

  describe("Sequential Execution (Simulated Mode)", () => {
    const testPayload = {
      ad_account_id: "1416124059911929",
      page_id: "10987654321",
      access_token: "EAAB_simulated_token_for_testing",
      campaign_name: "NWTN | Utsav | BAU Special Campaign",
      objective: "OUTCOME_SALES",
      adset_name: "NWTN | Utsav | Direct Retargeting AdSet",
      optimization_goal: "OFFSITE_CONVERSIONS",
      daily_budget: 100000,
      targeting: { geo_locations: { countries: ["IN"] }, age_min: 25, age_max: 60 },
      ad_name: "NWTN | Puja Offer Ad",
      media_type: "image",
      image_hash: "hash_test_12345",
      headline: "Perform Puja from Home",
      primary_text: "Experience sacred Vedic rituals at home with authentic offerings.",
      landing_page_url: "https://utsav.example.com",
    };

    it("should execute Level 1 -> Level 2 -> Level 3 sequentially with status PAUSED (Single Ad)", async () => {
      const result = await MetaBauCampaignService.createBauCampaign(testPayload);

      assert.strictEqual(result.success, true);
      assert.ok(result.campaign_id, "Must return campaign_id");
      assert.ok(result.adset_id, "Must return adset_id");
      assert.strictEqual(result.creative_ids.length, 1);
      assert.strictEqual(result.ad_ids.length, 1);
      assert.strictEqual(result.status, "PAUSED");
      assert.strictEqual(result.details.ad_account_id, "act_1416124059911929");
      assert.strictEqual(result.details.page_id, "10987654321");
    });

    it("should support A/B testing with separate_ads mode (creating V1 and V2 ads)", async () => {
      const abPayload = {
        ...testPayload,
        alt_headline: "Get Blessed by Vedic Purohits Online",
        ab_mode: "separate_ads",
      };

      const result = await MetaBauCampaignService.createBauCampaign(abPayload);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.creative_ids.length, 2, "Must create 2 creatives for V1 and V2");
      assert.strictEqual(result.ad_ids.length, 2, "Must create 2 ads under the same ad set");
      assert.strictEqual(result.details.ab_mode, "separate_ads");
      assert.strictEqual(result.details.ad_names[0], "NWTN | Puja Offer Ad - V1");
      assert.strictEqual(result.details.ad_names[1], "NWTN | Puja Offer Ad - V2");
    });

    it("should support A/B testing with multi_text mode (Degrees of Freedom)", async () => {
      const dofPayload = {
        ...testPayload,
        alt_headline: "Get Blessed by Vedic Purohits Online",
        ab_mode: "multi_text",
      };

      const result = await MetaBauCampaignService.createBauCampaign(dofPayload);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.creative_ids.length, 1, "Must create 1 dynamic creative");
      assert.strictEqual(result.ad_ids.length, 1, "Must create 1 ad");
      assert.strictEqual(result.details.ab_mode, "multi_text");
    });

    it("should support video media type with video_id and thumbnail_hash", async () => {
      const videoPayload = {
        ...testPayload,
        media_type: "video",
        video_id: "vid_987654321",
        thumbnail_hash: "thumb_hash_123",
      };

      const result = await MetaBauCampaignService.createBauCampaign(videoPayload);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.details.media_type, "video");
      assert.strictEqual(result.details.uploaded_media.video_id, "vid_987654321");
      assert.strictEqual(result.details.uploaded_media.thumbnail_hash, "thumb_hash_123");
    });
  });

  describe("Error Handling & Partial Failure State", () => {
    it("should extract Graph API error details and preserve created IDs", () => {
      const mockGraphError = {
        response: {
          data: {
            error: {
              message: "(#100) Invalid optimization_goal",
              code: 100,
              error_subcode: 1885002,
              error_user_title: "Unsupported Goal",
              error_user_msg: "Please select another goal for this objective.",
              fbtrace_id: "E7xY90abc",
            },
          },
        },
      };

      const mockCreatedState = {
        campaign_id: "cmp_created_already_12345",
        adset_id: null,
        creative_ids: [],
        ad_ids: [],
        uploaded_media: { image_hash: "img_hash_1" },
      };

      const extracted = extractMetaGraphError(mockGraphError, "CREATE_AD_SET", mockCreatedState);

      assert.strictEqual(extracted.success, false);
      assert.strictEqual(extracted.failed_step, "CREATE_AD_SET");
      assert.strictEqual(extracted.error.code, 100);
      assert.strictEqual(extracted.error.error_subcode, 1885002);
      assert.strictEqual(extracted.error.error_user_title, "Unsupported Goal");
      assert.strictEqual(extracted.error.error_user_msg, "Please select another goal for this objective.");
      assert.strictEqual(extracted.error.fbtrace_id, "E7xY90abc");
      assert.strictEqual(extracted.partial_state.campaign_id, "cmp_created_already_12345");
      assert.strictEqual(extracted.partial_state.uploaded_media.image_hash, "img_hash_1");
    });
  });
});
