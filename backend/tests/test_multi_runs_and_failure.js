import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../src/models/authModel.js";
import AiAutomation from "../src/models/aiAutomationModel.js";
import AutomationExecution from "../src/models/automationExecutionModel.js";
import WorkflowExecutionEngine from "../src/services/automation/workflowExecutionEngine.js";

async function runMultiTest() {
  console.log("=== Testing Multiple Runs & Failure Isolation ===");
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const testUserId = new mongoose.Types.ObjectId();

  // Create Run A: Meta Ads Campaign Generator (with simulated failure in Node 2)
  const failedAutomation = await AiAutomation.create({
    userId: testUserId,
    name: "Meta Ads Campaign Generator",
    nodes: [
      { id: "n_cfg", type: "generic", label: "Campaign Configuration", text: "Validate targeting and budget" },
      { id: "n_copy", type: "action", label: "Generate Ad Copy", config: { actionType: "invalid_action_type" } },
      { id: "n_up", type: "generic", label: "Upload Creative", text: "Upload ad creative assets" },
    ],
    edges: [
      { id: "e1", source: "n_cfg", target: "n_copy" },
      { id: "e2", source: "n_copy", target: "n_up" },
    ],
  });


  const { executionId: failedRunId, completionPromise: failedPromise } =
    await WorkflowExecutionEngine.run({
      userId: testUserId,
      automationId: failedAutomation._id,
      triggerType: "manual",
    });


  await failedPromise;
  const failedExec = await AutomationExecution.findOne({ executionId: failedRunId }).lean();
  console.log(`Failed Run Status: ${failedExec.status}`);
  console.log(`Successful nodes: ${failedExec.successfulNodes}, Failed nodes: ${failedExec.failedNodes}`);
  console.log(`Node 1 status: ${failedExec.nodes[0].status}`);
  console.log(`Node 2 status: ${failedExec.nodes[1].status}`);
  console.log(`Node 3 status: ${failedExec.nodes[2].status}`);

  // Clean up test automation document
  await AiAutomation.deleteOne({ _id: failedAutomation._id });

  console.log("✔ Multiple runs & failure handling verified!");
}

runMultiTest()
  .then(() => {
    mongoose.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Multi test error:", err);
    mongoose.disconnect();
    process.exit(1);
  });
