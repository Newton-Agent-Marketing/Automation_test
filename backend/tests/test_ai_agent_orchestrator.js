// backend/tests/test_ai_agent_orchestrator.js
import assert from "assert";
import { AiAgentOrchestrator } from "../src/services/agent/aiAgentOrchestrator.js";
import { WorkflowExecutionEngine } from "../src/services/automation/workflowExecutionEngine.js";

async function runTests() {
  console.log("🚀 Starting AI Agent Orchestrator & Strict Node Execution Tests...\n");

  // Test 1: Intent Classification
  console.log("Test 1: Intent Classification...");
  {
    const convIntent = AiAgentOrchestrator.classifyIntent("How are you?");
    assert.strictEqual(convIntent.intent, "CONVERSATIONAL");
    assert.strictEqual(convIntent.requiresTools, false);
    console.log("  ✅ Conversational intent classified correctly without tools.");

    const sheetFetchIntent = AiAgentOrchestrator.classifyIntent("Fetch Google Sheet Data");
    assert.strictEqual(sheetFetchIntent.intent, "GOOGLE_SHEET_FETCH");
    assert.strictEqual(sheetFetchIntent.requiresTools, true);
    console.log("  ✅ Google Sheets fetch classified correctly with get_connected_sheet_rows.");

    const sheetWriteIntent = AiAgentOrchestrator.classifyIntent("Save recommendations to Google Sheet");
    assert.strictEqual(sheetWriteIntent.intent, "GOOGLE_SHEET_WRITE");
    assert.strictEqual(sheetWriteIntent.requiresTools, true);
    console.log("  ✅ Google Sheets write classified correctly.");

    const metaMetricsIntent = AiAgentOrchestrator.classifyIntent("Show me my latest Meta Ads campaign performance");
    assert.strictEqual(metaMetricsIntent.intent, "META_ADS_METRICS");
    assert.strictEqual(metaMetricsIntent.requiresTools, true);
    console.log("  ✅ Meta Ads performance query classified correctly.");

    const creationIntent = AiAgentOrchestrator.classifyIntent("Create a campaign with a budget of ₹2,000");
    assert.strictEqual(creationIntent.intent, "CAMPAIGN_CREATION");
    assert.strictEqual(creationIntent.requiresTools, true);
    console.log("  ✅ Campaign creation classified correctly.");
  }

  // Test 2: Strict Execution Gate - Empty Spreadsheet Must Fail and Halt
  console.log("\nTest 2: Strict Verification - Empty Spreadsheet Gate...");
  {
    const emptyTools = [
      {
        toolName: "get_connected_sheet_rows",
        status: "FAILED",
        toolResult: { success: false, rows: [], totalRows: 0, message: "No rows found" },
      },
    ];

    const validation = AiAgentOrchestrator.verifyTaskCompletion({
      intentObj: { intent: "GOOGLE_SHEET_FETCH" },
      instruction: "Fetch Google Sheet Data",
      executedTools: emptyTools,
    });

    assert.strictEqual(validation.verified, false);
    assert.strictEqual(validation.status, "failed");
    assert.ok(
      validation.reason.toLowerCase().includes("rows") ||
      validation.reason.toLowerCase().includes("failed") ||
      validation.reason.toLowerCase().includes("sheet")
    );
    console.log("  ✅ Empty spreadsheet strictly failed validation:", validation.reason);
  }

  // Test 3: Strict Verification - Valid Spreadsheet Data Succeeds
  console.log("\nTest 3: Strict Verification - Valid Spreadsheet Data Passes...");
  {
    const validTools = [
      {
        toolName: "get_connected_sheet_rows",
        status: "SUCCESS",
        toolResult: {
          success: true,
          sheetName: "Campaign Performance Sheet",
          columns: ["campaign_name", "spend", "clicks", "conversions"],
          rows: [
            { campaign_name: "CBO Mix", spend: 5000, clicks: 120, conversions: 10 },
            { campaign_name: "Retargeting", spend: 3000, clicks: 80, conversions: 6 },
          ],
          totalRows: 2,
        },
      },
    ];

    const validation = AiAgentOrchestrator.verifyTaskCompletion({
      intentObj: { intent: "GOOGLE_SHEET_FETCH" },
      instruction: "Fetch Google Sheet Data",
      executedTools: validTools,
    });

    assert.strictEqual(validation.verified, true);
    assert.strictEqual(validation.status, "completed");
    assert.strictEqual(validation.outputData.rowsFetched, 2);
    assert.strictEqual(validation.outputData.fullRows.length, 2);
    console.log("  ✅ Valid spreadsheet passed verification with structured output package.");
  }

  // Test 4: Downstream Data Transfer (Node 1 Output -> Node 2 Input)
  console.log("\nTest 4: Node-to-Node Context & Data Transfer...");
  {
    const node1Output = {
      type: "google_sheet_data",
      spreadsheet: "Campaign Performance",
      sheet: "Sheet1",
      rowsFetched: 2,
      status: "success",
      fullRows: [
        { campaign: "Summer Sale", spend: 10000, conversions: 25 },
        { campaign: "Brand Awareness", spend: 4000, conversions: 2 },
      ],
    };

    const node2Validation = AiAgentOrchestrator.verifyTaskCompletion({
      intentObj: { intent: "DATA_ANALYSIS" },
      instruction: "Analyze Spreadsheet Data",
      executedTools: [],
      previousNodeOutput: node1Output,
    });

    assert.strictEqual(node2Validation.verified, true);
    assert.strictEqual(node2Validation.status, "completed");
    console.log("  ✅ Node 2 accepted authentic structured spreadsheet output from Node 1.");
  }

  // Test 5: Response Synthesis Without Mock Templates
  console.log("\nTest 5: Zero-Hallucination Response Synthesis...");
  {
    const convResponse = AiAgentOrchestrator.synthesizeResponse({
      intentObj: { intent: "CONVERSATIONAL" },
      instruction: "How are you?",
      context: { targetMetaAccountId: "1405197426806546" },
      executedTools: [],
      validation: { verified: true, checks: [] },
    });

    assert.ok(convResponse.includes("Hello! I am your Newton AI Agent"));
    assert.ok(!convResponse.includes("120226923688740247")); // No dummy campaign IDs
    console.log("  ✅ Conversational reply generated cleanly without mock data.");
  }

  // Test 6: Strict Execution Gate Halts Downstream Connected Nodes
  console.log("\nTest 6: Strict Execution Gate Halts Downstream Dependent Nodes...");
  {
    const failedNodeResult = {
      status: "failed",
      validation: {
        verified: false,
        status: "failed",
        reason: "Connected Google Sheet returned 0 rows. Downstream execution blocked to prevent propagating empty state.",
      },
    };

    // Downstream node attempts execution with failed predecessor output
    const downstreamValidation = AiAgentOrchestrator.verifyTaskCompletion({
      intentObj: { intent: "DATA_ANALYSIS" },
      instruction: "Analyze spreadsheet data",
      previousNodeOutput: failedNodeResult,
    });

    assert.strictEqual(downstreamValidation.verified, false);
    assert.strictEqual(downstreamValidation.status, "blocked");
    assert.ok(downstreamValidation.reason.includes("insufficient or failed output"));
    console.log("  ✅ Downstream dependent node was strictly BLOCKED when predecessor failed.");
  }

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
