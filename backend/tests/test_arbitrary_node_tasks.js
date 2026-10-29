import assert from "assert";
import mongoose from "mongoose";
mongoose.set("bufferCommands", false);

import { generateFallbackMarketingResponse } from "../src/controller/chat.controller.js";

async function testArbitraryTasks() {
  console.log("🧪 Testing Universal Arbitrary Task Execution in AI Automation Nodes...\n");

  const sampleUpstreamTable = `
| Campaign Name | Campaign ID | Status | Spend | Impressions | Clicks | Conv. | Value |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **NW Utsav Tithis** | \`120249895686840003\` | ACTIVE | ₹15,000 | 65,000 | 1,430 | 45 | ₹48,000 |
| **NWTN Utsav 4:4 Portal** | \`120249883155120003\` | ACTIVE | ₹5,000 | 21,000 | 462 | 14 | ₹16,500 |
`;

  // Test 1: Task E - Ad Creative & Copywriting Task
  console.log("1. Testing Task E: Ad Creative / Copywriting Task");
  const resE = await generateFallbackMarketingResponse({
    userMessage: "Generate 3 high-converting ad copy angles and creative hooks for act_517557233790148\n\n[Context from previous step]:\n" + sampleUpstreamTable,
    conversationId: "automation_test_exec_creative_node",
    metaAccountId: "517557233790148",
  });
  const textE = typeof resE === "object" ? resE.content : resE;
  assert(textE.includes("High-Converting Ad Creatives & Copy Variations"), "Should return Task E ad copy response");
  assert(!textE.includes("Total Ads Found in Account: 555"), "Must NOT return static 555 ads table");
  assert(!textE.includes("AI Context Workflow & Connection Flow"), "Must NOT return context flow diagram");
  console.log("  ✅ [PASS] Task E returned bespoke ad copy variations\n");

  // Test 2: Task F - Budget Scaling Task
  console.log("2. Testing Task F: Budget Allocation & Scaling Strategy");
  const resF = await generateFallbackMarketingResponse({
    userMessage: "Analyze budget allocation and recommend scaling strategy for act_517557233790148",
    conversationId: "automation_test_exec_budget_node",
    metaAccountId: "517557233790148",
  });
  const textF = typeof resF === "object" ? resF.content : resF;
  assert(textF.includes("Budget Allocation & Scaling Strategy"), "Should return Task F budget strategy response");
  assert(!textF.includes("Total Ads Found in Account: 555"), "Must NOT return static 555 ads table");
  console.log("  ✅ [PASS] Task F returned budget scaling framework\n");

  // Test 3: Task G - Audience & Targeting Task
  console.log("3. Testing Task G: Audience & Targeting Strategy");
  const resG = await generateFallbackMarketingResponse({
    userMessage: "Audit audience targeting and propose lookalike and broad funnel for act_517557233790148",
    conversationId: "automation_test_exec_audience_node",
    metaAccountId: "517557233790148",
  });
  const textG = typeof resG === "object" ? resG.content : resG;
  assert(textG.includes("Full-Funnel Audience & Targeting Architecture"), "Should return Task G audience response");
  assert(!textG.includes("Total Ads Found in Account: 555"), "Must NOT return static 555 ads table");
  console.log("  ✅ [PASS] Task G returned audience architecture\n");

  // Test 4: Task H - Account Diagnostic & Audit Task
  console.log("4. Testing Task H: Account Diagnostic & Audit");
  const resH = await generateFallbackMarketingResponse({
    userMessage: "Audit all paused campaigns and check why CPA is high on act_517557233790148",
    conversationId: "automation_test_exec_audit_node",
    metaAccountId: "517557233790148",
  });
  const textH = typeof resH === "object" ? resH.content : resH;
  assert(textH.includes("Account Diagnostic & Performance Audit"), "Should return Task H diagnostic response");
  assert(!textH.includes("Total Ads Found in Account: 555"), "Must NOT return static 555 ads table");
  console.log("  ✅ [PASS] Task H returned diagnostic audit\n");

  // Test 5: Task J - Universal Arbitrary Prompt (ANY random marketing task!)
  console.log("5. Testing Task J: Universal Dynamic Synthesis for Arbitrary Instruction");
  const arbitraryPrompt = "Give me a custom synthesis of why festive campaigns convert better during early mornings on act_517557233790148 and provide actionable steps";
  const resJ = await generateFallbackMarketingResponse({
    userMessage: arbitraryPrompt + "\n\n[Context from previous step]:\n" + sampleUpstreamTable,
    conversationId: "automation_test_exec_arbitrary_node",
    metaAccountId: "517557233790148",
  });
  const textJ = typeof resJ === "object" ? resJ.content : resJ;
  assert(textJ.includes("AI Automation Task Execution:"), "Should return Task J universal execution");
  assert(textJ.includes("517557233790148"), "Must target account 517557233790148");
  assert(textJ.includes("Specific Findings & Direct Answer to Task Instruction"), "Must have dedicated analytical findings");
  assert(!textJ.includes("Total Ads Found in Account: 555"), "Must NEVER return static 555 ads table");
  assert(!textJ.includes("AI Context Workflow & Connection Flow"), "Must NEVER return context flow diagram");
  console.log("  ✅ [PASS] Task J executed arbitrary instruction dynamically without defaulting to mock tables!\n");

  console.log("🎉 ALL ARBITRARY AUTOMATION NODE TASKS VERIFIED SUCCESSFULLY!");
}

testArbitraryTasks()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  });

