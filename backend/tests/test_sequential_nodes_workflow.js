import mongoose from "mongoose";
mongoose.set("bufferCommands", false);
import { WorkflowExecutionEngine } from "../src/services/automation/workflowExecutionEngine.js";

async function testSequential() {
  console.log("=== Testing 2-Node Sequential AI Automation Execution ===");

  const node1 = {
    id: "node_1_cpa",
    label: "Calculate CPA & Target Audit",
    text: "Calculate CPA for each campaign using the previous node's actual data. Identify campaigns above my configured target CPA. If no target is configured, ask me for it. Flag campaigns with zero conversions or insufficient data separately. Return campaign IDs and supporting numbers",
  };

  const initialInputData = `| Campaign Name | Campaign ID | Status | Spend | Impressions | Clicks | Conversions | Value |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| GE_Property Cohort_EXPERIMENT_CBO | 120226923688740247 | ACTIVE | ₹3,726.47 | 3,952 | 59 | 3 | ₹2,303 |
| GE_Manual_interest_Proxy_Money | 120238448735140247 | ACTIVE | ₹1,521.00 | 1,747 | 182 | 11 | ₹0 |
| West+Central Zonal Geo Location | 120242529592180247 | ACTIVE | ₹1,666.81 | 2,437 | 48 | 24 | ₹226 |
| GE_Interest_All_audience_ABO | 120251319643580247 | ACTIVE | ₹471,831.10 | 328,923 | 6,909 | 397 | ₹608,026 |`;

  console.log("-> Executing Node 1 with AI Agent...");
  const res1 = await WorkflowExecutionEngine.executeWithAiAgent({
    instruction: node1.text,
    node: node1,
    previousNodeOutput: initialInputData,
    userId: "64f123456789abcdef012345",
    executionId: "test_seq_run",
  });

  console.log("Node 1 Status:", res1.status);
  console.log("Node 1 Result Length:", res1.result.length);
  console.log("Node 1 Snippet:", res1.result.substring(0, 300).replace(/\n/g, " "));

  if (!res1.result || res1.result.length < 50) {
    throw new Error("Node 1 failed to return full response!");
  }

  console.log("\n-> Executing Node 2 with AI Agent passing Node 1 Output as context...");
  const node2 = {
    id: "node_2_diagnostic",
    label: "Diagnose Flagged Campaigns",
    text: "Analyze the flagged campaigns using available performance breakdowns. Recommend specific improvements to budget allocation, audience, placements, or creatives only where the data supports them. Explain the evidence for each recommendation. Do not automatically edit or pause any campaign.",
  };

  const res2 = await WorkflowExecutionEngine.executeWithAiAgent({
    instruction: node2.text,
    node: node2,
    previousNodeOutput: res1.result,
    userId: "64f123456789abcdef012345",
    executionId: "test_seq_run",
  });

  console.log("Node 2 Status:", res2.status);
  console.log("Node 2 Result Length:", res2.result.length);
  console.log("Node 2 Snippet:", res2.result.substring(0, 300).replace(/\n/g, " "));

  if (!res2.result || res2.result.length < 50) {
    throw new Error("Node 2 failed to return full response!");
  }

  console.log("\n🎉 SEQUENTIAL TEST PASSED! Node 1 completed with full response, passed data to Node 2, and Node 2 completed with full response!");
}

testSequential().catch((err) => {
  console.error("Test Error:", err);
  process.exit(1);
});
