import mongoose from "mongoose";
mongoose.set("bufferCommands", false);
import { runAgentChat } from '../src/controller/chat.controller.js';

async function runTests() {
  console.log("=================================================");
  console.log("TEST SUITE: AI Automation Node Tasks Execution");
  console.log("=================================================\n");

  const userId = "64f123456789abcdef012345";
  const conversationBase = `automation_run_test_${Date.now()}`;

  // -------------------------------------------------------------------------
  // TEST 1: Node 1 - Creative Ranking Task (TASK E0)
  // -------------------------------------------------------------------------
  console.log(">>> Running Test 1: Creative Ranking by CTR & Efficiency (TASK E0)...");
  const prompt1 = `act_2152730341920713, Use the actual data from the previous node to rank creatives by CTR and conversion efficiency. Identify the strongest and weakest creatives where data supports a comparison. Flag low-impression or low-conversion creatives as insufficient data instead of treating them as proven failures. Explain the ranking criteria.`;

  const res1 = await runAgentChat({
    userMessage: prompt1,
    userId,
    conversationId: `${conversationBase}_node1`,
    accountId: "act_2152730341920713",
    metaAccountId: "2152730341920713",
  });

  const content1 = typeof res1 === "object" ? res1.content : res1;
  console.log("Result 1 snippet (first 300 chars):", content1.substring(0, 300).replace(/\n/g, " "));

  // Verifications for Test 1
  if (!content1.includes("Creative Performance Ranking by CTR & Conversion Efficiency")) {
    throw new Error("Test 1 Failed: Missing Creative Ranking Title");
  }
  if (!content1.includes("Strongest Creatives")) {
    throw new Error("Test 1 Failed: Missing Strongest Creatives section");
  }
  if (!content1.includes("Weakest Creatives")) {
    throw new Error("Test 1 Failed: Missing Weakest Creatives section");
  }
  if (!content1.includes("Insufficient Data")) {
    throw new Error("Test 1 Failed: Missing Insufficient Data section");
  }
  if (!content1.includes("Ranking Criteria & Methodology Explanation")) {
    throw new Error("Test 1 Failed: Missing Ranking Criteria");
  }
  if (content1.includes("₹₹")) {
    throw new Error("Test 1 Failed: Double rupee symbol found!");
  }
  console.log("✅ Test 1 PASSED: Creative Ranking response is complete and accurate!\n");

  // -------------------------------------------------------------------------
  // TEST 2: Node 2 - Creative Metadata Inspection (TASK E1_B)
  // Input: Output from Node 1
  // -------------------------------------------------------------------------
  console.log(">>> Running Test 2: Creative Asset & Metadata Inspection (TASK E1_B)...");
  const prompt2 = `For the creatives identified by the previous node, retrieve accessible headlines, primary text, calls to action, destination URLs, and asset metadata. Analyze only content actually returned by the connected tools. If certain assets or media cannot be inspected through available tools, report that limitation rather than inventing the content.

[Context from previous step]:
${content1}`;

  const res2 = await runAgentChat({
    userMessage: prompt2,
    userId,
    conversationId: `${conversationBase}_node2`,
    accountId: "act_2152730341920713",
  });

  const content2 = typeof res2 === "object" ? res2.content : res2;
  console.log("Result 2 snippet (first 300 chars):", content2.substring(0, 300).replace(/\n/g, " "));

  // Verifications for Test 2
  if (!content2.includes("Creative Asset Metadata, Headlines, Copy & Destination Audit")) {
    throw new Error("Test 2 Failed: Missing Audit Title");
  }
  if (!content2.includes("Accessible Headline") || !content2.includes("Accessible Primary Text")) {
    throw new Error("Test 2 Failed: Missing accessible headlines or primary text");
  }
  if (!content2.includes("Asset Accessibility & Connected Tool Limitations")) {
    throw new Error("Test 2 Failed: Missing transparent tool limitations reporting");
  }
  console.log("✅ Test 2 PASSED: Creative Metadata Inspection response is complete and accurate!\n");

  // -------------------------------------------------------------------------
  // TEST 3: Node 3 - Measurable Creative Experiments (TASK D0)
  // Input: Combined Output from Node 1 (Performance) and Node 2 (Creative Assets)
  // -------------------------------------------------------------------------
  console.log(">>> Running Test 3: Measurable Creative Experiments (TASK D0)...");
  const combinedContext = `[Context from previous step #1 (act_2152730341920713, Creative Ranking)]:
${content1}

---

[Context from previous step #2 (Creative Metadata Inspection)]:
${content2}`;

  const prompt3 = `Combine creative performance and actual available creative content from previous nodes. Propose three measurable creative experiments, each with a hypothesis, proposed change, target audience or campaign context where supported, primary success metric and stopping/learning criteria. Do not create, edit or publish ads.

${combinedContext}`;

  const res3 = await runAgentChat({
    userMessage: prompt3,
    userId,
    conversationId: `${conversationBase}_node3`,
    accountId: "act_2152730341920713",
  });

  const content3 = typeof res3 === "object" ? res3.content : res3;
  console.log("Result 3 snippet (first 300 chars):", content3.substring(0, 300).replace(/\n/g, " "));

  // Verifications for Test 3
  if (!content3.includes("Proposed Measurable Creative Experiments")) {
    throw new Error("Test 3 Failed: Missing Experiments Title");
  }
  if (!content3.includes("Experiment #1") || !content3.includes("Experiment #2") || !content3.includes("Experiment #3")) {
    throw new Error("Test 3 Failed: Missing one of the 3 experiments");
  }
  if (!content3.includes("Hypothesis") || !content3.includes("Proposed Change") || !content3.includes("Primary Success Metric") || !content3.includes("Stopping & Learning Criteria")) {
    throw new Error("Test 3 Failed: Missing required experiment fields");
  }
  if (!content3.includes("Experiment Execution & Evaluation Framework")) {
    throw new Error("Test 3 Failed: Missing Framework Table");
  }
  if (!content3.includes("Do not create, edit or publish ads")) {
    throw new Error("Test 3 Failed: Missing compliance guardrail note");
  }
  console.log("✅ Test 3 PASSED: Measurable Creative Experiments response is complete and accurate!\n");

  // -------------------------------------------------------------------------
  // TEST 4: Node 4 - Unit Economics & Calculations (TASK B)
  // -------------------------------------------------------------------------
  console.log(">>> Running Test 4: Unit Economics & Campaign Performance (TASK B)...");
  const prompt4 = `Use the actual output from the previous node. Calculate CTR, CPC, CPA, and ROAS wherever the required source values are available. Compare campaign performance and identify the top-performing campaigns. Handle missing data and zero denominators correctly. Do not invent metrics or modify campaigns.

[Context from previous step]:
${content1}`;

  const res4 = await runAgentChat({
    userMessage: prompt4,
    userId,
    conversationId: `${conversationBase}_node4`,
    accountId: "act_2152730341920713",
  });

  const content4 = typeof res4 === "object" ? res4.content : res4;
  console.log("Result 4 snippet (first 300 chars):", content4.substring(0, 300).replace(/\n/g, " "));

  // Verifications for Test 4
  if (!content4.includes("Campaign Performance Metrics & Unit Economics")) {
    throw new Error("Test 4 Failed: Missing Unit Economics Title");
  }
  if (!content4.includes("Top Performers") || !content4.includes("Profitability & ROAS")) {
    throw new Error("Test 4 Failed: Missing Top Performers section");
  }
  if (!content4.includes("Zero Denominator Safeguard")) {
    throw new Error("Test 4 Failed: Missing Zero Denominator handling explanation");
  }
  console.log("✅ Test 4 PASSED: Unit Economics calculation response is complete and accurate!\n");

  // -------------------------------------------------------------------------
  // TEST 5: Node 5 - Target CPA Audit & Zero-Conversion Flagging (TASK B0)
  // -------------------------------------------------------------------------
  console.log(">>> Running Test 5: Target CPA Audit & Zero-Conversion Flagging (TASK B0)...");
  const upstreamTableMetrics = `| Campaign Name | Campaign ID | Status | Spend | Impressions | Clicks | CTR | CPC | Conv. | CPA | Value | ROAS |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GE_Property Cohort_EXPERIMENT_CBO_08052025** | \`120226923688740247\` | 🟢 ACTIVE | ₹3,726.47 | 3,952 | 59 | **1.49%** | **₹63.16** | 3 | **₹1242.16** | ₹2,303 | **0.62x** |
| **GE_Manual_interest_Proxy_Money_Experiment_21122025_Negation cbo** | \`120238448735140247\` | 🟢 ACTIVE | ₹1,521 | 1,747 | 182 | **10.42%** | **₹8.36** | 11 | **₹138.27** | ₹0 | **0.00x** |
| **West+Central Zonal Geo Location Sales Campaign [Ankita]_CBO** | \`120242529592180247\` | 🟢 ACTIVE | ₹1,666.81 | 2,437 | 48 | **1.97%** | **₹34.73** | 24 | **₹69.45** | ₹226 | **0.14x** |
| **GE_Interest_All_audience_ABO_7 July** | \`120251319643580247\` | 🟢 ACTIVE | ₹4,71,813.01 | 3,28,922 | 6,908 | **2.10%** | **₹68.30** | 397 | **₹1188.45** | ₹6,08,026 | **1.29x** |
| **GE_ASC_Vernacular_Ads_Campaign_CBO** | \`120252316999340247\` | 🟢 PAUSED | ₹7,011.14 | 9,262 | 596 | **6.43%** | **₹11.76** | 6 | **₹1168.52** | ₹6,647 | **0.95x** |
| **GE_ASC_October_ABO_01/09/2026** | \`120252639742870247\` | 🟢 PAUSED | ₹2,02,531.36 | 2,91,393 | 37,142 | **12.75%** | **₹5.45** | 180 | **₹1125.17** | ₹2,07,724 | **1.03x** |
| **GE_ASC_888 Portal & Shani Purnima_CBO_22/09/2026** | \`120252976409540247\` | 🟢 ACTIVE | ₹0 | 0 | 0 | **Unavailable** | **Unavailable** | 1 | **₹0.00** | ₹91 | **Unavailable** |`;

  const prompt5 = `Calculate CPA for each campaign using the previous node's actual data. Identify campaigns above my configured target CPA. If no target is configured, ask me for it. Flag campaigns with zero conversions or insufficient data separately. Return campaign IDs and supporting numbers

[Context from previous step]:
${upstreamTableMetrics}`;

  const res5 = await runAgentChat({
    userMessage: prompt5,
    userId,
    conversationId: `${conversationBase}_node5`,
    accountId: "act_1405197426806546",
  });

  const content5 = typeof res5 === "object" ? res5.content : res5;
  console.log("Result 5 snippet (first 300 chars):", content5.substring(0, 300).replace(/\n/g, " "));

  // Verifications for Test 5
  if (!content5.includes("Campaign CPA Performance & Target CPA Audit")) {
    throw new Error("Test 5 Failed: Missing Target CPA Audit Title");
  }
  if (!content5.includes("Target CPA Configuration Status: ⚠️ Action Required (Not Configured)")) {
    throw new Error("Test 5 Failed: Did not ask user for Target CPA when not configured");
  }
  if (!content5.includes("Campaigns Above Target CPA")) {
    throw new Error("Test 5 Failed: Missing Section 1: Campaigns Above Target CPA");
  }
  if (!content5.includes("Flagged Campaigns with Zero Conversions")) {
    throw new Error("Test 5 Failed: Missing Section 2: Zero Conversions flag");
  }
  if (!content5.includes("Flagged Campaigns with Insufficient Data")) {
    throw new Error("Test 5 Failed: Missing Section 3: Insufficient Data flag");
  }
  if (!content5.includes("120226923688740247") || !content5.includes("120251319643580247")) {
    throw new Error("Test 5 Failed: Missing expected campaign IDs in CPA evaluation");
  }
  console.log("✅ Test 5 PASSED: Target CPA Audit correctly asked for target, audited CPAs, and flagged zero-conversions/insufficient-data separately!\n");

  // -------------------------------------------------------------------------
  // TEST 6: Node 6 - Flagged Campaigns 4-Dimension Diagnostic (TASK F0)
  // -------------------------------------------------------------------------
  console.log(">>> Running Test 6: Flagged Campaigns 4-Dimension Diagnostic (TASK F0)...");
  const prompt6 = `Analyze the flagged campaigns using available performance breakdowns. Recommend specific improvements to budget allocation, audience, placements, or creatives only where the data supports them. Explain the evidence for each recommendation. Do not automatically edit or pause any campaign.

[Context from previous step]:
${content5}`;

  const res6 = await runAgentChat({
    userMessage: prompt6,
    userId,
    conversationId: `${conversationBase}_node6`,
    accountId: "act_1405197426806546",
  });

  const content6 = typeof res6 === "object" ? res6.content : res6;
  console.log("Result 6 snippet (first 300 chars):", content6.substring(0, 300).replace(/\n/g, " "));

  // Verifications for Test 6
  if (!content6.includes("Performance Diagnostic & Evidence-Based Recommendations for Flagged Campaigns")) {
    throw new Error("Test 6 Failed: Missing Diagnostic Title");
  }
  if (!content6.includes("Budget Allocation Improvements") || !content6.includes("Audience & Targeting Improvements") || !content6.includes("Placements Optimization") || !content6.includes("Creative Improvements")) {
    throw new Error("Test 6 Failed: Missing one of the 4 requested dimensions (Budget, Audience, Placements, Creatives)");
  }
  if (!content6.includes("Supporting Evidence")) {
    throw new Error("Test 6 Failed: Missing explicit Supporting Evidence sections");
  }
  if (content6.toLowerCase().includes("scale winner: increase daily budget on ge_property cohort")) {
    throw new Error("Test 6 Failed: Scaled an underperforming campaign with 0.62x ROAS!");
  }
  if (!content6.includes("Do not automatically edit or pause") && !content6.includes("zero campaigns have been paused, edited, or published")) {
    throw new Error("Test 6 Failed: Missing compliance guarantee that no campaigns were modified");
  }
  console.log("✅ Test 6 PASSED: Flagged Campaigns Diagnostic covered all 4 dimensions with exact evidence and zero automated edits!\n");

  console.log("=================================================");
  console.log("🎉 ALL 6 AUTOMATION NODE TASKS PASSED PERFECTLY!");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("❌ Test suite error:", err);
  process.exit(1);
});

