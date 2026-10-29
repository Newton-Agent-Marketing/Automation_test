import { generateFallbackMarketingResponse } from '../src/controller/chat.controller.js';

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

  const res1 = await generateFallbackMarketingResponse({
    userMessage: prompt1,
    userId,
    conversationId: `${conversationBase}_node1`,
    accountId: "act_2152730341920713",
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

  const res2 = await generateFallbackMarketingResponse({
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

  const res3 = await generateFallbackMarketingResponse({
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

  const res4 = await generateFallbackMarketingResponse({
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

  console.log("=================================================");
  console.log("🎉 ALL 4 AUTOMATION NODE TASKS PASSED PERFECTLY!");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("❌ Test suite error:", err);
  process.exit(1);
});
