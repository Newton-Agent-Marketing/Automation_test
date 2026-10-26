import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../src/models/authModel.js";
import AiAutomation from "../src/models/aiAutomationModel.js";
import AutomationExecution from "../src/models/automationExecutionModel.js";
import WorkflowExecutionEngine from "../src/services/automation/workflowExecutionEngine.js";

async function runIntegrationTest() {
  console.log("=== Integration Test: Automation Execution Engine & Persistence ===");

  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");


  // 1. Find or create test user
  let user = await User.findOne();
  if (!user) {
    user = await User.create({
      name: "Test Developer",
      email: "test_dev@example.com",
      password: "hashedpassword123",
      role: "owner",
    });
  }

  // 2. Set up sample automation workflow if none exists
  let automation = await AiAutomation.findOne({ userId: user._id });
  if (!automation) {
    automation = await AiAutomation.create({
      userId: user._id,
      name: "Daily Content Creator",
      nodes: [
        {
          id: "node_trigger_1",
          type: "trigger",
          label: "Schedule Trigger",
          config: { triggerMode: "schedule" },
          position: { x: 200, y: 150 },
        },
        {
          id: "node_task_2",
          type: "generic",
          label: "Fetch Trending Topics",
          text: "Fetch 10 trending marketing topics via HTTP configuration",
          position: { x: 450, y: 150 },
        },
        {
          id: "node_action_3",
          type: "action",
          label: "Send Notification",
          config: { actionType: "send_notification", message: "Daily summary ready for review" },
          position: { x: 700, y: 150 },
        },
      ],
      edges: [
        { id: "e1", source: "node_trigger_1", target: "node_task_2" },
        { id: "e2", source: "node_task_2", target: "node_action_3" },
      ],
    });
  }

  console.log(`Using Automation Workflow: "${automation.name}" with ${automation.nodes.length} nodes`);

  // 3. Execute workflow run
  const { executionId, execution, completionPromise } =
    await WorkflowExecutionEngine.run({
      userId: user._id,
      automationId: automation._id,
      triggerType: "manual",
    });

  console.log(`Execution started. Run ID: ${executionId}, Initial Status: ${execution.status}`);

  await completionPromise;

  // 4. Verify saved execution record
  const savedRecord = await AutomationExecution.findOne({ executionId }).lean();
  if (!savedRecord) {
    throw new Error("Execution record was not saved to DB!");
  }

  console.log(`Execution finished. Final Status: ${savedRecord.status}, Duration: ${savedRecord.durationMs}ms`);
  console.log(`Nodes Executed: ${savedRecord.nodes.length}`);
  savedRecord.nodes.forEach((n, idx) => {
    console.log(`  [Node ${idx + 1}] ${n.nodeName} (${n.nodeType}) -> ${n.status} in ${n.durationMs}ms`);
    console.log(`    Input:`, n.input);
    console.log(`    Output:`, n.output);
  });

  console.log(`Total Logs generated: ${savedRecord.logs.length}`);

  if (savedRecord.status !== "completed") {
    throw new Error(`Expected completed status, got ${savedRecord.status}`);
  }

  console.log("✔ Integration test passed successfully!");
}

runIntegrationTest()
  .then(() => {
    mongoose.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Test failed:", err);
    mongoose.disconnect();
    process.exit(1);
  });
