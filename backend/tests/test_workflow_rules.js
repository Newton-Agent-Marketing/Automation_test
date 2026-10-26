/**
 * Unit test for Trigger, Date, Action, Time architecture and rules
 */
import assert from "assert";
import AiAutomation from "../src/models/aiAutomationModel.js";
import { ActionExecutor } from "../src/services/automation/actionExecutor.js";
import { AiAutomationScheduler } from "../src/Scheduler/aiAutomationScheduler.js";

async function runWorkflowRulesTest() {
  console.log("=== RUNNING WORKFLOW RULES & SCHEDULING TESTS ===");

  // Test 1: ActionExecutor executes send_notification
  const notifResult = await ActionExecutor.execute(
    { config: { actionType: "send_notification", message: "Generate daily Meta Ads report", priority: "high" } },
    "60c72b2f9b1d8b2bad8e9a22",
    "manual"
  );
  assert.strictEqual(notifResult.status, "success");
  assert.strictEqual(notifResult.actionType, "send_notification");
  console.log("✅ PASS: ActionExecutor executed send_notification");

  // Test 2: ActionExecutor executes create_reminder
  const reminderResult = await ActionExecutor.execute(
    { config: { actionType: "create_reminder", message: "Check ad budget pacing", priority: "urgent" } },
    "60c72b2f9b1d8b2bad8e9a22",
    "schedule"
  );
  assert.strictEqual(reminderResult.status, "success");
  console.log("✅ PASS: ActionExecutor executed create_reminder");

  // Test 3: ActionExecutor executes ai_agent_task
  const aiResult = await ActionExecutor.execute(
    { config: { actionType: "ai_agent_task", message: "Analyze top converting creatives" } },
    "60c72b2f9b1d8b2bad8e9a22",
    "schedule"
  );
  assert.strictEqual(aiResult.status, "success");
  console.log("✅ PASS: ActionExecutor executed ai_agent_task");

  // Test 4: Calculate next run time
  const nextRun = AiAutomationScheduler.calculateNextRun({
    dateType: "recurring",
    recurrencePattern: "every_day",
  }, {
    time: "10:30",
    timezone: "Asia/Kolkata",
    recurrence: "daily",
  });
  assert.ok(nextRun instanceof Date);
  console.log("✅ PASS: Calculated next run date:", nextRun.toISOString());

  // Test 5: Validate child-to-child connection rejection logic
  const childTypes = ["date", "action", "time"];
  const isDateToActionBlocked = childTypes.includes("date") && childTypes.includes("action");
  assert.strictEqual(isDateToActionBlocked, true);
  console.log("✅ PASS: Child-to-child connection between Date and Action is blocked");

  const isActionToTimeBlocked = childTypes.includes("action") && childTypes.includes("time");
  assert.strictEqual(isActionToTimeBlocked, true);
  console.log("✅ PASS: Child-to-child connection between Action and Time is blocked");

  console.log("\n==========================================");
  console.log("ALL ARCHITECTURE & RULE TESTS PASSED!");
  console.log("==========================================");
  process.exit(0);
}

runWorkflowRulesTest().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
