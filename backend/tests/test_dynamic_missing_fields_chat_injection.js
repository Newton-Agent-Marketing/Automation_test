import assert from "assert";
import { MissingFieldCollector } from "../src/services/campaignPreparation/missingFieldCollector.js";
import { CampaignValidator } from "../src/services/campaignPreparation/campaignValidator.js";
import { PreviewBuilder } from "../src/services/campaignPreparation/previewBuilder.js";

async function runTests() {
  console.log("================================================================================");
  console.log("🧪 TESTING: DYNAMIC MISSING FIELD DETECTION & CHAT-BASED DATA INJECTION");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // TEST 1: Parsing user response with "is", commas, and multiple fields
  // ---------------------------------------------------------------------------
  console.log("Test 1: Natural language parsing of missing fields with 'is'...");
  const userMsg1 = "Pixel ID is 123456789, Page ID is 987654321 and Display Link is example.com";
  const missingFields1 = [
    { id: "pixel_id", field: "pixel_id", label: "Pixel ID" },
    { id: "page_id", field: "page_id", label: "Facebook Page ID" },
    { id: "display_link", field: "display_link", label: "Display Link" },
  ];

  const parsed1 = MissingFieldCollector.parseAnswersFromMessage(userMsg1, missingFields1);

  assert.strictEqual(parsed1.pixel_id, "123456789", "Should extract pixel_id correctly");
  assert.strictEqual(parsed1.pixelId, "123456789", "Should extract pixelId camelCase alias");
  assert.strictEqual(parsed1.page_id, "987654321", "Should extract page_id correctly");
  assert.strictEqual(parsed1.pageId, "987654321", "Should extract pageId camelCase alias");
  assert.strictEqual(parsed1.display_link, "example.com", "Should extract display_link correctly");
  assert.strictEqual(parsed1.displayLink, "example.com", "Should extract displayLink camelCase alias");
  console.log("✅ Test 1 Passed: Successfully parsed natural language with 'is' into normalized fields!\n");

  // ---------------------------------------------------------------------------
  // TEST 2: Formatting Missing Fields Questions in Markdown
  // ---------------------------------------------------------------------------
  console.log("Test 2: Formatting clear questions in chat...");
  const md = MissingFieldCollector.formatQuestionsMarkdown(missingFields1);
  assert(md.includes("Missing Information Required"), "Markdown should have missing info header");
  assert(md.includes("Pixel ID"), "Markdown should list Pixel ID");
  assert(md.includes("Facebook Page ID"), "Markdown should list Facebook Page ID");
  assert(md.includes("Display Link"), "Markdown should list Display Link");
  assert(md.includes("Please provide these values here in the chat"), "Should ask user to provide values in chat");
  console.log("✅ Test 2 Passed: Markdown questions properly formatted!\n");

  // ---------------------------------------------------------------------------
  // TEST 3: Multi-turn chat persistence & merging
  // ---------------------------------------------------------------------------
  console.log("Test 3: Multi-turn chat response accumulation...");
  // Turn 1: User provides only Pixel ID
  const turn1Msg = "Pixel ID is 123456789";
  const turn1Parsed = MissingFieldCollector.parseAnswersFromMessage(turn1Msg, missingFields1);

  let accumulatedSessionAnswers = { ...turn1Parsed };
  assert.strictEqual(accumulatedSessionAnswers.pixel_id, "123456789");
  assert.strictEqual(accumulatedSessionAnswers.page_id, undefined);

  // Turn 2: User provides Page ID and Display Link
  const turn2Msg = "Facebook Page ID is 987654321 and display_link: shop.example.com";
  const turn2Parsed = MissingFieldCollector.parseAnswersFromMessage(turn2Msg, missingFields1);

  accumulatedSessionAnswers = {
    ...accumulatedSessionAnswers,
    ...turn2Parsed,
  };

  assert.strictEqual(accumulatedSessionAnswers.pixel_id, "123456789", "Turn 1 pixel_id MUST persist");
  assert.strictEqual(accumulatedSessionAnswers.page_id, "987654321", "Turn 2 page_id MUST be merged");
  assert.strictEqual(accumulatedSessionAnswers.display_link, "shop.example.com", "Turn 2 display_link MUST be merged");
  console.log("✅ Test 3 Passed: Multi-turn responses accumulate without data loss!\n");

  // ---------------------------------------------------------------------------
  // TEST 4: Standalone single-value response fallback
  // ---------------------------------------------------------------------------
  console.log("Test 4: Standalone single-value response fallback...");
  const singleMissing = [{ id: "pixel_id", field: "pixel_id", label: "Pixel ID" }];
  const singleMsg = "98765012345";
  const singleParsed = MissingFieldCollector.parseAnswersFromMessage(singleMsg, singleMissing);

  assert.strictEqual(singleParsed.pixel_id, "98765012345", "Standalone number should map to single pending ID field");
  console.log("✅ Test 4 Passed: Standalone single-value response correctly inferred!\n");

  // ---------------------------------------------------------------------------
  // TEST 5: Dynamic Validation of Missing Sheet Fields
  // ---------------------------------------------------------------------------
  console.log("Test 5: CampaignValidator detects missing fields from Google Sheet...");
  const mockSheetData = {
    sourceType: "google_sheets",
    spreadsheetName: "Summer Campaigns",
    headers: ["Campaign Name", "Daily Budget", "Headline", "Primary Text", "Website URL", "Display Link", "Creative URL"],
    rows: [
      {
        rowNumber: 2,
        values: {
          "Campaign Name": "Summer Sale",
          "Daily Budget": "500",
          "Headline": "50% Off Summer Deals",
          "Primary Text": "Shop our top-selling summer apparel now!",
          "Website URL": "https://example.com/summer",
          "Display Link": "", // Missing in sheet
          "Creative URL": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e.jpg",
          // Pixel ID and Page ID are not present in sheet at all!
        },
      },
    ],
    totalRows: 1,
  };

  // Run validation with NO chat answers yet
  const valResult1 = await CampaignValidator.validate({
    campaignName: "Summer Sale",
    adSetName: "Summer Sale AdSet",
    metaAccountId: "act_1122334455",
    accountDoc: { accountId: "act_1122334455", isActive: true },
    sourceData: mockSheetData,
    userAnswers: {},
  });

  assert.strictEqual(valResult1.isValid, false, "Validation should fail due to missing fields");
  const missingFieldKeys = valResult1.missingFields.map((f) => f.field);
  console.log("   Detected missing fields:", missingFieldKeys);
  assert(missingFieldKeys.includes("pixel_id"), "Should detect missing pixel_id");
  assert(missingFieldKeys.includes("page_id"), "Should detect missing page_id");
  assert(missingFieldKeys.includes("display_link"), "Should detect missing display_link");
  console.log("✅ Test 5 Passed: Dynamic missing field detection accurately identified all missing fields!\n");

  // ---------------------------------------------------------------------------
  // TEST 6: Validation passes after injecting chat-provided values
  // ---------------------------------------------------------------------------
  console.log("Test 6: CampaignValidator re-validates and passes with chat-injected values...");
  const chatInjected = {
    pixel_id: "1234567890",
    pixelId: "1234567890",
    page_id: "98765432109",
    pageId: "98765432109",
    display_link: "example.com",
    displayLink: "example.com",
  };

  const valResult2 = await CampaignValidator.validate({
    campaignName: "Summer Sale",
    adSetName: "Summer Sale AdSet",
    metaAccountId: "act_1122334455",
    accountDoc: { accountId: "act_1122334455", isActive: true },
    sourceData: mockSheetData,
    userAnswers: chatInjected,
  });

  console.log("   Revalidation blocking issues:", valResult2.blockingCount);
  assert.strictEqual(valResult2.isValid, true, "Validation MUST pass once chat values are merged");
  assert.strictEqual(valResult2.missingFields.length, 0, "No missing fields should remain");
  console.log("✅ Test 6 Passed: Validation succeeded with chat-injected values!\n");

  // ---------------------------------------------------------------------------
  // TEST 7: PreviewBuilder merges chat values with sheet values (Chat Priority)
  // ---------------------------------------------------------------------------
  console.log("Test 7: PreviewBuilder applies chat-provided values over empty sheet values...");
  const preview = PreviewBuilder.buildPreview({
    validationResult: valResult2,
    sourceData: mockSheetData,
    userAnswers: chatInjected,
    version: 1,
  });

  const ad0 = preview.adDetails[0];
  assert.strictEqual(ad0.displayLink, "example.com", "Ad preview displayLink must match chat injected value");
  assert.strictEqual(ad0.pageId, "98765432109", "Ad preview pageId must match chat injected value");
  assert.strictEqual(ad0.pixelId, "1234567890", "Ad preview pixelId must match chat injected value");
  assert.strictEqual(ad0.headline, "50% Off Summer Deals", "Ad preview headline must retain sheet value");
  console.log("✅ Test 7 Passed: PreviewBuilder correctly merged chat and sheet data with highest priority to chat!\n");

  console.log("================================================================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
