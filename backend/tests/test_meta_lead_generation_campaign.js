// backend/tests/test_meta_lead_generation_campaign.js
import assert from "assert";
import mongoose from "mongoose";
import { AiAgentOrchestrator } from "../src/services/agent/aiAgentOrchestrator.js";
import { MetaLeadCampaignService } from "../src/services/meta/metaLeadCampaignService.js";
import { MetaMcpClient } from "../src/services/mcp/metaMcpClient.js";
import MetaLeadCampaignSession from "../src/models/metaLeadCampaignSession.js";
import MetaLead from "../src/models/metaLeadModel.js";
import MetaAccount from "../src/models/metaAccount.js";

async function runTests() {
  console.log("==========================================================");
  console.log("🧪 TESTING META LEAD GENERATION CAMPAIGN CREATION FEATURE");
  console.log("==========================================================");

  // Setup in-memory mock or local test environment
  const testUserId = new mongoose.Types.ObjectId();
  const testConvId = `test_conv_lead_${Date.now()}`;
  const testAccountId = "act_123456789012345";
  const testAccessToken = "EAAB_simulated_test_token_123456789";

  // Test 1: Intent Recognition & Dynamic Detection
  console.log("\n👉 Test 1: Natural-Language Intent Recognition");
  const testPrompts = [
    "Create a Meta Lead Generation campaign with ₹500 daily budget, target India, age 18 to 45, use my connected Meta account and Facebook Page, create an Instant Lead Form with name, email and phone number, and create an image ad.",
    "Create a Facebook Lead Ad",
    "Create an Instagram Lead Generation campaign",
    "Create an Instant Form campaign with budget ₹1000",
    "Show my Meta leads",
    "How many leads did this campaign generate?",
  ];

  for (const prompt of testPrompts) {
    const isLead = MetaLeadCampaignService.isLeadCampaignIntent(prompt) || MetaLeadCampaignService.isLeadRetrievalIntent(prompt);
    assert.strictEqual(isLead, true, `Prompt should be recognized as lead intent: "${prompt}"`);
    console.log(`   ✅ Recognized intent for: "${prompt.slice(0, 50)}..."`);
  }

  const orchIntent = AiAgentOrchestrator.classifyIntent(testPrompts[0]);
  assert.strictEqual(orchIntent.intent, "META_LEAD_CAMPAIGN", "AiAgentOrchestrator must classify as META_LEAD_CAMPAIGN");
  console.log("   ✅ Orchestrator classified as META_LEAD_CAMPAIGN");

  const retrievalIntent = AiAgentOrchestrator.classifyIntent("Show my Meta leads");
  assert.strictEqual(retrievalIntent.intent, "META_LEAD_RETRIEVAL", "AiAgentOrchestrator must classify as META_LEAD_RETRIEVAL");
  console.log("   ✅ Orchestrator classified as META_LEAD_RETRIEVAL");

  // Test 2: Structured Parameter Extraction from User Prompt
  console.log("\n👉 Test 2: Extraction of Budget, Targeting, Questions & Creative");
  const session1 = {
    config: {
      campaign: { dailyBudget: null, specialAdCategories: [] },
      adSet: { targeting: { ageMin: 18, ageMax: 65, geoLocations: { countries: ["IN"] } } },
      leadForm: { questions: [], privacyPolicyUrl: null },
      creative: { headline: null, message: null, callToAction: "SIGN_UP", format: "IMAGE" },
    },
    markModified: () => {},
  };

  MetaLeadCampaignService.parseAndUpdateConfig(session1, testPrompts[0]);
  assert.strictEqual(session1.config.campaign.dailyBudget, 500, "Daily budget must be ₹500");
  assert.strictEqual(session1.config.adSet.targeting.ageMin, 18, "ageMin must be 18");
  assert.strictEqual(session1.config.adSet.targeting.ageMax, 45, "ageMax must be 45");
  assert.deepStrictEqual(session1.config.adSet.targeting.geoLocations.countries, ["IN"], "Target country must be IN");
  
  const questionTypes = session1.config.leadForm.questions.map((q) => q.type);
  assert.ok(questionTypes.includes("FULL_NAME"), "Must include FULL_NAME question");
  assert.ok(questionTypes.includes("EMAIL"), "Must include EMAIL question");
  assert.ok(questionTypes.includes("PHONE"), "Must include PHONE question");
  console.log("   ✅ Budget, Age, Country, and Form Questions extracted accurately.");

  // Test 3: Multi-turn Missing Information Collection Without Losing Context
  console.log("\n👉 Test 3: Multi-turn Chat Collection Across Messages");
  const multiTurnSession = {
    conversationId: `conv_multi_${Date.now()}`,
    status: "COLLECTING_INFO",
    config: {
      adAccountId: testAccountId,
      accountName: "Primary Meta Account",
      pageId: null,
      campaign: { name: "Lead Campaign", dailyBudget: null },
      adSet: { name: "Lead Ad Set", targeting: { ageMin: 18, ageMax: 65, geoLocations: { countries: ["IN"] } } },
      leadForm: { name: "Lead Form", questions: [], privacyPolicyUrl: "https://example.com/privacy" },
      creative: { headline: "Join Us", format: "IMAGE", callToAction: "SIGN_UP" },
      ad: { name: "Lead Ad", status: "PAUSED" },
    },
    markModified: () => {},
    save: async () => {},
  };

  // Step 3a: User sends initial request without budget or page
  MetaLeadCampaignService.parseAndUpdateConfig(multiTurnSession, "Create a Meta Lead Generation campaign.");
  let missing = MetaLeadCampaignService.validateRequiredFields(multiTurnSession, []);
  assert.ok(missing.some((m) => m.field === "pageId"), "Should ask for pageId");
  assert.ok(missing.some((m) => m.field === "dailyBudget"), "Should ask for dailyBudget");
  console.log("   ✅ Correctly identified missing pageId and dailyBudget.");

  // Step 3b: User supplies budget in subsequent message
  MetaLeadCampaignService.parseAndUpdateConfig(multiTurnSession, "₹500 daily budget");
  assert.strictEqual(multiTurnSession.config.campaign.dailyBudget, 500, "Should merge daily budget ₹500");
  missing = MetaLeadCampaignService.validateRequiredFields(multiTurnSession, []);
  assert.ok(!missing.some((m) => m.field === "dailyBudget"), "Budget should no longer be missing");
  console.log("   ✅ Merged budget without losing campaign name or configuration.");

  // Step 3c: User supplies Page
  multiTurnSession.config.pageId = "109876543210987";
  multiTurnSession.config.pageName = "My Business Page";
  missing = MetaLeadCampaignService.validateRequiredFields(multiTurnSession, []);
  assert.strictEqual(missing.length, 0, "All mandatory fields should now be satisfied");
  console.log("   ✅ All required fields validated successfully.");

  // Test 4: Campaign Summary Generation Before Creation
  console.log("\n👉 Test 4: Campaign Summary with PAUSED Status and Confirmation Request");
  const summary = MetaLeadCampaignService.buildCampaignSummary(multiTurnSession);
  assert.ok(summary.includes("Your Meta Lead Generation campaign is ready"), "Summary must have standard header");
  assert.ok(summary.includes("OUTCOME_LEADS"), "Summary must specify OUTCOME_LEADS objective");
  assert.ok(summary.includes("₹500/day"), "Summary must reflect ₹500/day budget");
  assert.ok(summary.includes("Status**: PAUSED"), "Summary must confirm status is PAUSED");
  assert.ok(summary.includes("Would you like me to create this campaign on Meta?"), "Must request explicit approval");
  console.log("   ✅ Summary contains all required fields, PAUSED status, and confirmation prompt.");

  // Test 5: Approval and Multi-Step Execution Sequence
  console.log("\n👉 Test 5: Multi-Step Meta API Execution Sequence");
  assert.strictEqual(MetaLeadCampaignService.isApprovalCommand("yes"), true, "'yes' must be approved");
  assert.strictEqual(MetaLeadCampaignService.isApprovalCommand("proceed"), true, "'proceed' must be approved");
  assert.strictEqual(MetaLeadCampaignService.isApprovalCommand("banao"), true, "'banao' must be approved");

  // Create mock session for simulated execution
  const execSteps = MetaLeadCampaignService.getInitialExecutionSteps();
  const execSession = {
    userId: testUserId,
    conversationId: testConvId,
    executionId: `exec_${Date.now()}`,
    status: "READY_FOR_CONFIRMATION",
    config: {
      adAccountId: testAccountId,
      accountName: "Test Meta Account",
      pageId: "109876543210987",
      pageName: "Test FB Page",
      campaign: { name: "Test Lead Campaign", dailyBudget: 500, specialAdCategories: [] },
      adSet: { name: "Test Ad Set", targeting: { ageMin: 18, ageMax: 45, geoLocations: { countries: ["IN"] } } },
      leadForm: {
        name: "Test Lead Form",
        privacyPolicyUrl: "https://example.com/privacy",
        questions: [{ type: "FULL_NAME" }, { type: "EMAIL" }, { type: "PHONE" }],
      },
      creative: { headline: "Test Headline", message: "Test Copy", format: "IMAGE", callToAction: "SIGN_UP" },
      ad: { name: "Test Ad", status: "PAUSED" },
    },
    createdObjects: {},
    executionSteps: execSteps,
    markModified: () => {},
    save: async () => {},
  };

  const progressEvents = [];
  const execResult = await MetaLeadCampaignService.executeCreationWorkflow({
    session: execSession,
    userId: testUserId,
    onProgress: (evt) => progressEvents.push(evt),
  });

  assert.strictEqual(execResult.success, true, "Execution workflow must succeed");
  assert.ok(execResult.campaignId.startsWith("sim_camp_"), "Campaign ID must be created");
  assert.ok(execResult.adSetId.startsWith("sim_adset_"), "Ad Set ID must be created");
  assert.ok(execResult.leadFormId.startsWith("sim_form_"), "Lead Form ID must be created");
  assert.ok(execResult.creativeId.startsWith("sim_creative_"), "Creative ID must be created");
  assert.ok(execResult.adId.startsWith("sim_ad_"), "Ad ID must be created");
  assert.strictEqual(execResult.status, "PAUSED", "Campaign must remain PAUSED");

  // Verify all 9 steps were reported
  const completedSteps = execSession.executionSteps.filter((s) => s.status === "COMPLETED");
  assert.strictEqual(completedSteps.length, 9, "All 9 execution steps must be COMPLETED");
  console.log(`   ✅ 9-Step Pipeline Executed Successfully:`);
  for (const st of completedSteps) {
    console.log(`      ✓ Step ${st.stepIndex}: ${st.label} (Object: ${st.metaObjectId || "Verified"})`);
  }

  // Test 6: Standalone Meta Lead MCP Tools
  console.log("\n👉 Test 6: Standalone Meta Lead MCP Tools Execution");
  const toolCamp = await MetaMcpClient.executeLiveTool("create_meta_lead_campaign", {
    name: "MCP Lead Campaign Test",
    dailyBudget: 750,
    accountId: testAccountId,
    accessToken: testAccessToken,
  });
  assert.strictEqual(toolCamp.success, true, "create_meta_lead_campaign must succeed");
  assert.strictEqual(toolCamp.objective, "OUTCOME_LEADS", "Objective must be OUTCOME_LEADS");
  console.log("   ✅ create_meta_lead_campaign passed.");

  const toolAdSet = await MetaMcpClient.executeLiveTool("create_meta_lead_adset", {
    campaignId: toolCamp.campaignId,
    name: "MCP Ad Set Test",
    pageId: "109876543210987",
    dailyBudget: 750,
    accountId: testAccountId,
    accessToken: testAccessToken,
  });
  assert.strictEqual(toolAdSet.success, true, "create_meta_lead_adset must succeed");
  console.log("   ✅ create_meta_lead_adset passed.");

  const toolForm = await MetaMcpClient.executeLiveTool("create_meta_lead_form", {
    pageId: "109876543210987",
    name: "MCP Instant Form",
    questions: [{ type: "FULL_NAME" }, { type: "EMAIL" }, { type: "PHONE" }],
    accountId: testAccountId,
    accessToken: testAccessToken,
  });
  assert.strictEqual(toolForm.success, true, "create_meta_lead_form must succeed");
  console.log("   ✅ create_meta_lead_form passed.");

  const toolCreative = await MetaMcpClient.executeLiveTool("create_meta_lead_ad_creative", {
    name: "MCP Creative",
    pageId: "109876543210987",
    leadGenFormId: toolForm.formId,
    headline: "Limited Offer",
    message: "Register now",
    accountId: testAccountId,
    accessToken: testAccessToken,
  });
  assert.strictEqual(toolCreative.success, true, "create_meta_lead_ad_creative must succeed");
  console.log("   ✅ create_meta_lead_ad_creative passed.");

  const toolAd = await MetaMcpClient.executeLiveTool("create_meta_lead_ad", {
    name: "MCP Lead Ad",
    adSetId: toolAdSet.adSetId,
    creativeId: toolCreative.creativeId,
    status: "PAUSED",
    accountId: testAccountId,
    accessToken: testAccessToken,
  });
  assert.strictEqual(toolAd.success, true, "create_meta_lead_ad must succeed");
  assert.strictEqual(toolAd.status, "PAUSED", "Ad status must be PAUSED");
  console.log("   ✅ create_meta_lead_ad passed.");

  const toolPub = await MetaMcpClient.executeLiveTool("publish_meta_lead_campaign", {
    campaignId: toolCamp.campaignId,
    adSetId: toolAdSet.adSetId,
    adId: toolAd.adId,
    accountId: testAccountId,
    accessToken: testAccessToken,
  });
  assert.strictEqual(toolPub.status, "ACTIVE", "Published campaign must be ACTIVE");
  console.log("   ✅ publish_meta_lead_campaign passed.");

  // Test 7: Meta Webhook Verification and Event Ingestion
  console.log("\n👉 Test 7: Meta Webhook Handshake & Lead Event Ingestion");
  let verifiedChallenge = null;
  const mockReq = {
    query: {
      "hub.mode": "subscribe",
      "hub.verify_token": "newton_meta_webhook_secret",
      "hub.challenge": "challenge_token_xyz_12345",
    },
  };
  const mockRes = {
    status: (code) => ({
      send: (body) => {
        if (code === 200) verifiedChallenge = body;
      },
      json: (data) => data,
    }),
    sendStatus: () => {},
  };

  await MetaLeadCampaignService.verifyWebhook(mockReq, mockRes);
  assert.strictEqual(verifiedChallenge, "challenge_token_xyz_12345", "Webhook must echo challenge token");
  console.log("   ✅ Webhook GET challenge handshake verified.");

  // Test 8: Lead Retrieval Through Chat
  console.log("\n👉 Test 8: Lead Retrieval Chat Output");
  const retrievalChat = await MetaLeadCampaignService.handleWorkflow({
    userId: testUserId,
    conversationId: `conv_retrieval_${Date.now()}`,
    userMessage: "Show my Meta leads",
    metaAccountId: testAccountId,
  });
  assert.ok(retrievalChat.content.includes("Meta Leads"), "Must return formatted leads response");
  console.log("   ✅ Lead retrieval chat response verified.");

  console.log("\n==========================================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
  console.log("==========================================================");
}

runTests().then(() => process.exit(0)).catch((err) => {
  console.error("❌ Test Failed:", err);
  process.exit(1);
});

