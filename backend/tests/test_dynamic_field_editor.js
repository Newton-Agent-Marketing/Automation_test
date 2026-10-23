import { DynamicFieldEditor } from "../src/services/campaignPreparation/dynamicFieldEditor.js";

async function runTests() {
  console.log("=== STARTING DYNAMIC FIELD EDITOR TESTS ===");
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // Mock Session & Runtime Data
  const mockSession = {
    campaignName: "Diwali Mahotsav",
    adSetName: "Delhi NCR AdSet",
    campaignType: "WEBSITE",
    objective: "OUTCOME_SALES",
    userAnswers: {
      dailyBudget: 1000,
      campaignBudget: 1000,
    },
    preview: {
      campaignDetails: [
        { field: "Campaign Name", value: "Diwali Mahotsav" },
        { field: "Objective", value: "OUTCOME_SALES" },
        { field: "Campaign Budget", value: 1000 },
      ],
      adSetDetails: [
        { field: "Ad Set Name", value: "Delhi NCR AdSet" },
        { field: "Daily Budget", value: 1000 },
        { field: "Lifetime Budget", value: null },
      ],
      adDetails: [
        {
          sourceRow: 2,
          adName: "Puja Ad 1",
          headline: "Diwali Special Puja",
          primaryText: "Perform divine puja with verified pandits",
          description: "Book today for auspicious blessings",
          destination: "https://example.com/diwali-puja",
          cta: "SHOP_NOW",
          instagramId: "123456789",
        },
      ],
    },
    source: {
      worksheetName: "Sheet1",
    },
    auditHistory: [],
    save: async function () {
      return this;
    },
  };

  const mockSourceData = {
    headers: ["Campaign Name", "Ad Set Name", "Headline", "Primary Text", "Daily Budget", "priest_name", "custom_discount"],
    rows: [
      {
        rowNumber: 2,
        values: {
          "Daily Budget": 1000,
          "Headline": "Diwali Special Puja",
          "priest_name": "Pandit Sharma",
          "custom_discount": "DIWALI20",
        },
      },
    ],
  };

  // Test 1: Dynamic Discovery (No hardcoded field list!)
  console.log("\n--- TEST GROUP 1: Dynamic Field Discovery ---");
  const fields = DynamicFieldEditor.discoverFields({ session: mockSession, sourceData: mockSourceData });
  assert(fields.length > 5, "Discovered dynamic fields count > 5");
  assert(fields.some(f => f.key === "daily_budget"), "Discovered daily_budget");
  assert(fields.some(f => f.key === "lifetime_budget"), "Discovered lifetime_budget");
  assert(fields.some(f => f.key === "priest_name"), "Discovered custom unmapped column priest_name from sheet");
  assert(fields.some(f => f.key === "custom_discount"), "Discovered custom column custom_discount from sheet");

  // Test 2: Immutable Security Restrictions
  console.log("\n--- TEST GROUP 2: Security & Immutability ---");
  assert(DynamicFieldEditor.isImmutable("_id"), "Blocked _id");
  assert(DynamicFieldEditor.isImmutable("metaAccountId"), "Blocked metaAccountId");
  assert(DynamicFieldEditor.isImmutable("appSecret"), "Blocked appSecret");
  assert(DynamicFieldEditor.isImmutable("token"), "Blocked token");
  const secRes = DynamicFieldEditor.resolveField({ userFieldQuery: "metaAccountId", availableFields: fields });
  assert(secRes.status === "IMMUTABLE_SECURITY_RESTRICTION", "resolveField blocks immutable metaAccountId");

  // Test 3: Semantic Matching (Case, Symbols, Hinglish, Synonyms)
  console.log("\n--- TEST GROUP 3: Intelligent Semantic Matching ---");
  // 3a. daily spend limit -> daily_budget
  const match1 = DynamicFieldEditor.resolveField({ userFieldQuery: "daily spend limit", availableFields: fields });
  assert(match1.status === "EXACT_MATCH" && match1.field.key === "daily_budget", "Matches 'daily spend limit' to daily_budget");

  // 3b. ad heading -> headline
  const match2 = DynamicFieldEditor.resolveField({ userFieldQuery: "ad heading", availableFields: fields });
  assert(match2.status === "EXACT_MATCH" && match2.field.key === "headline", "Matches 'ad heading' to headline");

  // 3c. main text -> primary_text
  const match3 = DynamicFieldEditor.resolveField({ userFieldQuery: "main text", availableFields: fields });
  assert(match3.status === "EXACT_MATCH" && match3.field.key === "primary_text", "Matches 'main text' to primary_text");

  // 3d. insta account id -> instagram_user_id / instagramId
  const match4 = DynamicFieldEditor.resolveField({ userFieldQuery: "insta account id", availableFields: fields });
  assert(match4.status === "EXACT_MATCH" && (match4.field.key.includes("instagram")), "Matches 'insta account id' to instagram field");

  // 3e. tracking link -> destination / landing_page_url
  const match5 = DynamicFieldEditor.resolveField({ userFieldQuery: "tracking link", availableFields: fields });
  assert(match5.status === "EXACT_MATCH" && (match5.field.key.includes("destination") || match5.field.key.includes("landing_page")), "Matches 'tracking link' to destination URL");

  // 3f. custom sheet column: priest_name
  const match6 = DynamicFieldEditor.resolveField({ userFieldQuery: "priest_name", availableFields: fields });
  assert(match6.status === "EXACT_MATCH" && match6.field.key === "priest_name", "Matches arbitrary sheet column 'priest_name'");

  // Test 4: Ambiguity Handling
  console.log("\n--- TEST GROUP 4: Ambiguity Resolution ---");
  // Generic "budget" matches both daily_budget and lifetime_budget
  const ambigMatch = DynamicFieldEditor.resolveField({ userFieldQuery: "budget", availableFields: fields });
  assert(ambigMatch.status === "AMBIGUOUS", "Identifies 'budget' as ambiguous between daily_budget & lifetime_budget");
  assert(ambigMatch.candidates.length >= 2, "Returns at least 2 candidate budget fields for user selection");

  // Test 5: Multi-Turn Conversation Workflow
  console.log("\n--- TEST GROUP 5: Multi-Turn Conversation Workflow ---");
  
  // Turn 1: User says "Change the daily budget to 500"
  const turn1 = await DynamicFieldEditor.handleChatEdit({
    session: mockSession,
    userMessage: "Change the daily budget to 500",
    userId: "test-user-id",
  });
  assert(turn1.actionTaken === "AWAITING_CONFIRMATION", "Turn 1 sets actionTaken to AWAITING_CONFIRMATION");
  assert(turn1.content.includes("daily_budget") && turn1.content.includes("1000") && turn1.content.includes("500"), 
    "Turn 1 asks: 'I identified the field daily_budget with the current value 1000. Should I update it to 500?'");
  assert(mockSession.pendingEdit !== null, "Turn 1 stores pendingEdit on session");

  // Turn 2: User says "Yes"
  const turn2 = await DynamicFieldEditor.handleChatEdit({
    session: mockSession,
    userMessage: "Yes",
    userId: "test-user-id",
  });
  assert(turn2.actionTaken === "APPLIED_UPDATE", "Turn 2 confirms and applies update");
  assert(turn2.content.includes("Successfully updated **daily_budget** from **1000** to **500**"),
    "Turn 2 outputs: 'Successfully updated daily_budget from 1000 to 500.'");
  assert(mockSession.pendingEdit === null, "Turn 2 clears pendingEdit");
  assert(mockSession.userAnswers.daily_budget === 500, "daily_budget updated to 500 in userAnswers");

  // Test 6: Separate field and value workflow
  console.log("\n--- TEST GROUP 6: Separate Field & Value Workflow ---");
  // User: "I want to edit a field"
  const turnSep1 = await DynamicFieldEditor.handleChatEdit({
    session: mockSession,
    userMessage: "I want to edit a field",
    userId: "test-user-id",
  });
  assert(turnSep1.actionTaken === "REQUESTED_FIELD_AND_VALUE", "User says 'I want to edit a field' -> asks for field and value");
  assert(turnSep1.content === "Which field do you want to update, and what should its new value be?", "Exact expected prompt");

  // User: "budget, 500"
  const turnSep2 = await DynamicFieldEditor.handleChatEdit({
    session: mockSession,
    userMessage: "budget, 500",
    userId: "test-user-id",
  });
  assert(turnSep2.actionTaken === "AMBIGUITY_PROMPT", "budget, 500 detects ambiguity between daily_budget and lifetime_budget");
  assert(turnSep2.content.includes("daily_budget") && turnSep2.content.includes("lifetime_budget"), "Asks user which budget to update");

  // User: "daily_budget"
  const turnSep3 = await DynamicFieldEditor.handleChatEdit({
    session: mockSession,
    userMessage: "daily_budget",
    userId: "test-user-id",
  });
  assert(turnSep3.actionTaken === "AWAITING_CONFIRMATION", "Clarifying 'daily_budget' moves to confirmation");

  // User: "Yes"
  const turnSep4 = await DynamicFieldEditor.handleChatEdit({
    session: mockSession,
    userMessage: "Yes",
    userId: "test-user-id",
  });
  assert(turnSep4.actionTaken === "APPLIED_UPDATE", "Final confirmation applies update");

  console.log(`\n==========================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==========================================`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error("Test execution error:", err);
  process.exit(1);
});
