import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import AiAutomation from "../src/models/aiAutomationModel.js";
import AutomationExecution from "../src/models/automationExecutionModel.js";
import WorkflowExecutionEngine from "../src/services/automation/workflowExecutionEngine.js";

async function runFailureTest() {
  console.log("=== Testing Explicit Node Error and Downstream Skipping ===");
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const testUserId = new mongoose.Types.ObjectId();

  // Create automation with an Action node whose execute will fail
  // We mock ActionExecutor to fail for this test
  const automation = await AiAutomation.create({
    userId: testUserId,
    name: "Lead Qualification Workflow",
    nodes: [
      { id: "n1", type: "trigger", label: "Schedule Trigger", config: { triggerMode: "schedule" } },
      { id: "n2", type: "action", label: "API Sync to CRM", config: { actionType: "throw_test_error" } },
      { id: "n3", type: "generic", label: "Send Slack Alert", text: "Alert sales team" },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
    ],
  });

  // Temporarily patch ActionExecutor to throw for throw_test_error
  const ActionExecutor = (await import("../src/services/automation/actionExecutor.js")).default;
  const originalExecute = ActionExecutor.execute;
  ActionExecutor.execute = async (node, userId, trigger) => {
    if (node.config?.actionType === "throw_test_error") {
      return {
        status: "failed",
        error: "Connection timeout while syncing lead data to CRM endpoint",
        durationMs: 150,
      };
    }
    return originalExecute(node, userId, trigger);
  };

  const { executionId, completionPromise } = await WorkflowExecutionEngine.run({
    userId: testUserId,
    automationId: automation._id,
    triggerType: "webhook",
  });

  await completionPromise;

  const result = await AutomationExecution.findOne({ executionId }).lean();
  console.log(`Execution Status: ${result.status}`);
  console.log(`Error Summary: ${result.errorSummary}`);
  console.log(`Node 1 (Trigger): ${result.nodes[0].status}`);
  console.log(`Node 2 (CRM Sync): ${result.nodes[1].status}, Error:`, result.nodes[1].error);
  console.log(`Node 3 (Slack Alert): ${result.nodes[2].status}`);

  // Restore and clean up
  ActionExecutor.execute = originalExecute;
  await AiAutomation.deleteOne({ _id: automation._id });
  await AutomationExecution.deleteMany({ userId: testUserId });

  if (result.status !== "partially_failed" || result.nodes[2].status !== "skipped") {
    throw new Error("Failure / downstream skipping expectation failed");
  }

  console.log("✔ Explicit node error, downstream skipping, and partial failure verified!");
}

runFailureTest()
  .then(() => {
    mongoose.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failure test error:", err);
    mongoose.disconnect();
    process.exit(1);
  });
