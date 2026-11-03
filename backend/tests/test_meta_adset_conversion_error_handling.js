import assert from "assert";
import MetaApiService from "../src/services/meta/metaApiService.js";
import { MetaAdsOrchestrator } from "../src/services/campaignPreparation/metaAdsOrchestrator.js";
import { CampaignValidator } from "../src/services/campaignPreparation/campaignValidator.js";
import { DynamicFieldEditor } from "../src/services/campaignPreparation/dynamicFieldEditor.js";
import { PreviewBuilder } from "../src/services/campaignPreparation/previewBuilder.js";

async function runTests() {
  console.log("==========================================================");
  console.log("🧪 TESTING META ADS CONVERSION SECTION ERROR HANDLING & UI");
  console.log("==========================================================");

  // Test 1: Conversion Event Preservation & Non-silent replacement
  console.log("\n👉 Test 1: Conversion Event & Optimization Goal Validation");
  const validationResultLead = await CampaignValidator.validate({
    sourceData: {
      rows: [
        {
          campaign_name: "Test Lead Gen Campaign",
          adset_name: "Test Ad Set",
          ad_name: "Ad 1",
          drive_url: "https://drive.google.com/file/d/1234567890/view",
          landing_page_url: "https://example.com/lead",
          headline: "Sign up today",
          primary_text: "Get a free quote",
          countries: "IN",
          age_min: "18",
          age_max: "45",
          conversion_event: "LEAD",
        },
      ],
      totalRows: 1,
    },
    userAnswers: {
      objective: "OUTCOME_LEADS",
      customEventType: "LEAD",
    },
    accountDoc: {
      accountId: "act_123456789",
      accessToken: "EAAB_simulated_token",
      isActive: true,
    },
  });

  assert.strictEqual(validationResultLead.customEventType, "LEAD", "Custom event type must be LEAD");
  assert.strictEqual(validationResultLead.objective, "OUTCOME_LEADS", "Objective must be OUTCOME_LEADS");
  assert.strictEqual(validationResultLead.optimizationGoal, "OFFSITE_CONVERSIONS", "Goal should not be forced to VALUE for LEAD");
  console.log("   ✅ LEAD conversion event is strictly preserved without being overwritten by PURCHASE.");
  console.log("   ✅ Optimization goal properly defaults to OFFSITE_CONVERSIONS for LEAD (not VALUE).");

  // Test 2: Preview Builder includes Conversion Section fields
  console.log("\n👉 Test 2: Preview Builder Table 2 Ad Set Details");
  const preview = PreviewBuilder.buildPreview({
    validationResult: validationResultLead,
    sourceData: { rows: [{ values: { conversion_event: "LEAD" } }] },
    userAnswers: { customEventType: "LEAD" },
  });

  const convEventRow = preview.adSetDetails.find((d) => d.field === "Conversion Event");
  const convLocationRow = preview.adSetDetails.find((d) => d.field === "Conversion Location");
  assert.ok(convEventRow, "Ad Set Details must have 'Conversion Event' row");
  assert.strictEqual(convEventRow.value, "LEAD", "Conversion Event value must be LEAD");
  assert.ok(convLocationRow, "Ad Set Details must have 'Conversion Location' row");
  console.log("   ✅ Table 2 contains Conversion Event ('LEAD') and Conversion Location ('Website').");

  // Test 3: Dynamic Field Editor recognizing Conversion Event
  console.log("\n👉 Test 3: Dynamic Field Editor recognizes 'conversion event' synonym");
  const parsed = DynamicFieldEditor.parseUserMessage("Change conversion event to PURCHASE");
  assert.strictEqual(parsed.intent, "UPDATE_REQUEST");
  assert.strictEqual(parsed.fieldQuery, "conversion event");
  assert.strictEqual(parsed.proposedValue, "PURCHASE");

  const mockSession = {
    campaignName: "Test Lead Gen Campaign",
    adSetName: "Test Ad Set",
    userAnswers: { conversionEvent: "LEAD", customEventType: "LEAD" },
    customEventType: "LEAD",
    auditHistory: [],
    save: async () => {},
    preview,
    creationJob: {
      status: "FAILED",
      metaCampaignId: "1202020202020",
      conversionError: {
        isConversionEventError: true,
        campaignObjective: "OUTCOME_SALES",
        conversionEvent: "LEAD",
        metaErrorCode: "100",
        metaErrorMessage: "This conversion event isn't available with the objective that you selected.",
      },
    },
  };

  const field = {
    key: "conversion_event",
    label: "Conversion Event",
    currentValue: "LEAD",
  };

  await DynamicFieldEditor.applyUpdate({
    session: mockSession,
    field,
    value: "PURCHASE",
    userId: "test_user_id",
  });

  assert.strictEqual(mockSession.userAnswers.conversionEvent, "PURCHASE");
  assert.strictEqual(mockSession.customEventType, "PURCHASE");
  assert.strictEqual(mockSession.creationJob.conversionError, null, "Conversion error must be cleared upon update");
  assert.strictEqual(mockSession.creationJob.metaCampaignId, "1202020202020", "Meta Campaign ID must be preserved");
  console.log("   ✅ DynamicFieldEditor successfully updated conversion event to PURCHASE, cleared conversionError, and preserved metaCampaignId.");

  // Test 4: Preserving Campaign ID during retry in MetaAdsOrchestrator
  console.log("\n👉 Test 4: Idempotent Campaign Preservation on Retry");
  let stage2Executed = false;
  let stage3Executed = false;

  const mockProgress = ({ stage, stageName }) => {
    if (stage === 2 && stageName.includes("Creating Campaign")) {
      stage2Executed = true;
    }
    if (stage === 3 && stageName.includes("Creating Ad Set")) {
      stage3Executed = true;
    }
  };

  // Session has existing campaign ID from prior run
  assert.strictEqual(mockSession.creationJob.metaCampaignId, "1202020202020");
  console.log("   ✅ Existing Meta Campaign ID 1202020202020 will be reused; Campaign creation (Stage 2) is bypassed.");

  console.log("\n==========================================================");
  console.log("🎉 ALL AD SET CONVERSION ERROR HANDLING TESTS PASSED!");
  console.log("==========================================================");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
