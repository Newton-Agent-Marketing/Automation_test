// backend/tests/verify_ai_automation_e2e.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import AiAutomation from "../src/models/aiAutomationModel.js";
import AutomationExecution from "../src/models/automationExecutionModel.js";
import MetaAccount from "../src/models/metaAccount.js";
import WorkflowExecutionEngine from "../src/services/automation/workflowExecutionEngine.js";
import AiAutomationScheduler from "../src/Scheduler/aiAutomationScheduler.js";
import DynamicSheetExecutionService from "../src/services/agent/dynamicSheetExecutionService.js";
import SheetInspectorService from "../src/services/agent/sheetInspectorService.js";
import googleOAuth from "../src/auth/googleOAuth.js";
import AutomationExecutionController from "../src/controller/automationExecutionController.js";

function assertCond(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runAllTests() {
  console.log("=================================================================");
  console.log("  AI AUTOMATION E2E VERIFICATION SUITE (ALL 7 MANDATORY TESTS)  ");
  console.log("=================================================================\n");

  await mongoose.connect(process.env.MONGO_URI);
  const activeMeta =
    (await MetaAccount.findOne({
      accountId: { $in: ["act_1416124059911929", "1416124059911929"] },
      accessToken: { $exists: true, $ne: "" },
    }).lean()) ||
    (await MetaAccount.findOne({ isActive: true, accessToken: { $exists: true, $ne: "" } }).sort({ updatedAt: -1 }).lean());
  assertCond(Boolean(activeMeta), "Expected an active MetaAccount in MongoDB for live E2E verification.");
  console.log(`Using live Meta account: ${activeMeta.accountName} (${activeMeta.accountId}) for user ${activeMeta.userId}`);
  const userId = activeMeta.userId;

  // Snapshot the user's real AiAutomation workspace so we restore it 100% intact in finally{}
  const originalAutomation = await AiAutomation.findOne({ userId }).lean();
  let workspaceDoc = await AiAutomation.findOne({ userId });
  const createdTempWorkspace = !workspaceDoc;
  if (!workspaceDoc) {
    workspaceDoc = await AiAutomation.create({
      userId,
      name: "AI Automation Workspace",
      isActive: false,
      nodes: [],
      edges: [],
    });
  }

    const setTestCanvas = async ({ name, isActive = false, nodes = [], edges = [] }) => {
    return await AiAutomation.findOneAndUpdate(
      { _id: workspaceDoc._id },
      { $set: { name, isActive, nodes, edges } },
      { returnDocument: "after" }
    );
  };

  const createdExecutionIds = [];
  const report = {};

  try {
    // -------------------------------------------------------------------------
    // TEST 1: SEQUENTIAL NODE-BY-NODE EXECUTION
    // -------------------------------------------------------------------------
    console.log("▶ Running Test 1: Sequential Execution (Node 1 Campaigns & Ad Sets -> Node 2 Ads)...");
    const auto1 = await setTestCanvas({
      name: "[E2E Test 1] Sequential Meta Hierarchy Workflow",
      isActive: false,
      nodes: [
        {
          id: "t1_trigger",
          type: "trigger",
          label: "Manual Trigger",
          text: "Start Workflow",
          status: "configured",
          config: { triggerMode: "manual" },
          position: { x: 100, y: 200 },
        },
        {
          id: "t1_node1",
          type: "generic",
          label: "Fetch Campaigns & Ad Sets",
          text: "Fetch all campaigns and Ad Set names from my connected Meta Ads account.",
          status: "configured",
          config: {},
          position: { x: 400, y: 200 },
        },
        {
          id: "t1_node2",
          type: "generic",
          label: "Fetch Matching Ads",
          text: "Fetch Ads according to the previous node's campaign and Ad Set data.",
          status: "configured",
          config: {},
          position: { x: 720, y: 200 },
        },
      ],
      edges: [
        { id: "e_t1_1", source: "t1_trigger", target: "t1_node1" },
        { id: "e_t1_2", source: "t1_node1", target: "t1_node2" },
      ],
    });

    const run1 = await WorkflowExecutionEngine.run({
      automationId: auto1._id,
      userId,
      triggerType: "manual",
      startNodeId: "t1_trigger",
    });
    createdExecutionIds.push(run1.executionId);
    const exec1 = await run1.completionPromise;

    const t1n1 = exec1.nodes.find((n) => n.nodeId === "t1_node1");
    const t1n2 = exec1.nodes.find((n) => n.nodeId === "t1_node2");
    if (exec1.status !== "completed") {
      console.error("Test 1 debug node errors:", exec1.nodes.map((n) => ({ id: n.nodeId, status: n.status, err: n.error })));
    }

    assertCond(exec1.status === "completed", `Test 1 workflow status expected 'completed', got '${exec1.status}' (${exec1.errorSummary || ""})`);
    assertCond(t1n1?.status === "completed", "Test 1 Node 1 must be completed");
    assertCond(t1n2?.status === "completed", "Test 1 Node 2 must be completed");
    assertCond(
      new Date(t1n2.startedAt).getTime() >= new Date(t1n1.completedAt).getTime(),
      `Test 1 sequential violation: Node 2 startedAt (${t1n2.startedAt}) < Node 1 completedAt (${t1n1.completedAt})`
    );
    assertCond((t1n1.structuredData?.campaigns?.length || 0) > 0, "Test 1 Node 1 must fetch real campaigns");
    assertCond(
      t1n2.toolsCalled.some((tc) => tc.toolName === "get_live_ad_creatives" && Array.isArray(tc.toolArgs?.campaignIds)),
      "Test 1 Node 2 must pass upstream campaignIds into get_live_ad_creatives"
    );

    report.test1 = {
      status: "PASS",
      executionId: exec1.executionId,
      node1CompletedAt: t1n1.completedAt,
      node2StartedAt: t1n2.startedAt,
      campaignsFetched: t1n1.structuredData?.campaigns?.length || 0,
      adSetsFetched: t1n1.structuredData?.adSets?.length || 0,
      adsFetchedInNode2: t1n2.structuredData?.ads?.length || 0,
      node1Tools: t1n1.toolsCalled.map((t) => t.toolName),
      node2Tools: t1n2.toolsCalled.map((t) => t.toolName),
    };
    console.log("  ✅ Test 1 PASSED:", JSON.stringify(report.test1));

    // -------------------------------------------------------------------------
    // TEST 2: DYNAMIC SPREADSHEET MAPPING & SECTION 8 TWO-NODE WORKFLOW
    // -------------------------------------------------------------------------
    console.log("▶ Running Test 2: Dynamic Custom Column Mapping + Section 8 Two-Node Workflow...");
    const customHeaders = [
      "Report Day",
      "Meta Camp Title",
      "Camp ID",
      "AdSet Title",
      "Creative / Ad Name",
      "Total Spend (INR)",
      "Impr.",
      "Unique Reach",
      "All Clicks",
      "Results",
      "Cost per Result",
      "CTR (%)",
      "ROAS",
      "Internal Team Owner",
    ];
    const sampleExistingRows = [{ "Report Day": "24/10/2026", "Meta Camp Title": "Sample" }];
    const customSchema = DynamicSheetExecutionService.classifySheetColumns(customHeaders, sampleExistingRows);

    assertCond(customSchema.requiredGranularity === "ad", "Custom headers with Creative / Ad Name must require 'ad' granularity");
    assertCond(customSchema.detectedDateFormat === "DD/MM/YYYY", `Expected DD/MM/YYYY, got ${customSchema.detectedDateFormat}`);
    assertCond(customSchema.mappedColumns.length === 13, `Expected 13 mapped columns, got ${customSchema.mappedColumns.length}`);
    assertCond(
      customSchema.unmappedColumns.length === 1 && customSchema.unmappedColumns[0].headerName === "Internal Team Owner",
      "Expected 'Internal Team Owner' to be reported as unmapped custom column"
    );

    const capturedAppendRequests = [];
    const origGetAuth = googleOAuth.getAuthenticatedClient.bind(googleOAuth);
    const origResolveSheet = SheetInspectorService.resolveAndReadSheet.bind(SheetInspectorService);

    SheetInspectorService.resolveAndReadSheet = async () => ({
      success: true,
      sheetIndex: 1,
      spreadsheetId: "1WsNqpKOvR6HB_r2EOQSlIse0MDlUSpsufTL3B9IePnA",
      sheetName: "Custom Marketing Tracker",
      sheetUrl: "https://docs.google.com/spreadsheets/d/1WsNqpKOvR6HB_r2EOQSlIse0MDlUSpsufTL3B9IePnA/edit",
      targetTab: "Daily Performance",
      availableTabs: ["Daily Performance"],
      selectedTabNames: ["Daily Performance"],
      headers: customHeaders,
      totalRows: 1,
      rows: sampleExistingRows,
    });

    googleOAuth.getAuthenticatedClient = async () => ({
      axiosInstance: {
        post: async (url, payload) => {
          capturedAppendRequests.push({ url, payload });
          return {
            status: 200,
            data: {
              updates: {
                updatedRange: `'Daily Performance'!A2:N${1 + (payload.values?.length || 1)}`,
                updatedRows: payload.values?.length || 0,
                updatedCells: (payload.values?.length || 0) * customHeaders.length,
              },
            },
          };
        },
        get: async () => ({
          status: 200,
          data: {
            valueRanges: [
              {
                range: `'Daily Performance'!A2:N25`,
                values: capturedAppendRequests[capturedAppendRequests.length - 1]?.payload?.values || [],
              },
            ],
          },
        }),
      },
    });

    try {
      const autoSec8 = await setTestCanvas({
        name: "[E2E Test 2 & Section 8] Two-Node Inspect+Fetch -> Map+Append",
        isActive: false,
        nodes: [
          {
            id: "s8_node1",
            type: "generic",
            label: "Inspect Sheet & Fetch Meta Data",
            text: "Go to my connected Meta Ads account. Inspect the connected Google Sheet and identify all its fields. Understand which fields require campaign, Ad Set, Ad and performance data. Fetch the corresponding actual data from my selected Meta Ads account.",
            status: "configured",
            position: { x: 200, y: 200 },
          },
          {
            id: "s8_node2",
            type: "generic",
            label: "Map Fields & Append to Sheet",
            text: "Take the data collected in the previous node, map every value to its corresponding spreadsheet field, use the correct reporting date, and append the data into my connected Google Sheet.",
            status: "configured",
            position: { x: 560, y: 200 },
          },
        ],
        edges: [{ id: "e_s8", source: "s8_node1", target: "s8_node2" }],
      });

      const runSec8 = await WorkflowExecutionEngine.run({
        automationId: autoSec8._id,
        userId,
        triggerType: "manual",
        startNodeId: "s8_node1",
        scheduledDate: "2026-11-01",
        timezone: "Asia/Kolkata",
      });
      createdExecutionIds.push(runSec8.executionId);
      const execSec8 = await runSec8.completionPromise;

      const s8n1 = execSec8.nodes.find((n) => n.nodeId === "s8_node1");
      const s8n2 = execSec8.nodes.find((n) => n.nodeId === "s8_node2");

      assertCond(execSec8.status === "completed", `Section 8 workflow expected completed, got ${execSec8.status} (${execSec8.errorSummary || ""})`);
      assertCond(s8n1?.status === "completed" && s8n2?.status === "completed", "Both Section 8 nodes must complete");
      assertCond(capturedAppendRequests.length === 1, "Expected exactly 1 Google Sheets append API call");
      const appendUrl = capturedAppendRequests[0].url;
      assertCond(
        appendUrl.includes(":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS") &&
          !appendUrl.includes("%3Aappend"),
        `Google Sheets append URL must place ':append' outside encodeURIComponent: ${appendUrl}`
      );
      const firstRowWritten = capturedAppendRequests[0].payload.values[0];
      assertCond(firstRowWritten[0] === "01/11/2026", `Expected DD/MM/YYYY date '01/11/2026' in col 0, got '${firstRowWritten[0]}'`);
      assertCond(firstRowWritten[13] === "", "Unmapped 'Internal Team Owner' column must remain blank ('')");

      report.test2 = {
        status: "PASS",
        executionId: execSec8.executionId,
        granularityDetected: customSchema.requiredGranularity,
        mappedColumnsCount: customSchema.mappedColumns.length,
        unmappedColumns: customSchema.unmappedColumns.map((u) => u.headerName),
        rowsAppended: s8n2.dataProcessing?.recordsInserted || 0,
        dateFormattedAs: firstRowWritten[0],
        appendEndpointVerified: appendUrl,
      };
      console.log("  ✅ Test 2 PASSED:", JSON.stringify(report.test2));

      // -----------------------------------------------------------------------
      // TEST 4: EXPLICIT DATE MAPPING & AMBIGUOUS DATE CLARIFICATION
      // -----------------------------------------------------------------------
      console.log("▶ Running Test 4: Explicit Date Mapping (2026-10-25 -> 25/10/2026) & Ambiguous Date Gate...");
      capturedAppendRequests.length = 0;

      const auto4 = await setTestCanvas({
        name: "[E2E Test 4] Explicit Reporting Date Mapping",
        isActive: false,
        nodes: [
          {
            id: "t4_node1",
            type: "generic",
            label: "Append Specific Date Report",
            text: "Fetch campaign, Ad Set, Ad and performance data from my connected Meta Ads account for 2026-10-25 and append the mapped rows into my connected Google Sheet.",
            status: "configured",
            position: { x: 200, y: 200 },
          },
        ],
        edges: [],
      });

      const run4 = await WorkflowExecutionEngine.run({
        automationId: auto4._id,
        userId,
        triggerType: "manual",
        startNodeId: "t4_node1",
      });
      createdExecutionIds.push(run4.executionId);
      const exec4 = await run4.completionPromise;
      const t4Row0 = capturedAppendRequests[0]?.payload?.values?.[0] || [];

      assertCond(exec4.status === "completed", `Test 4 expected completed, got ${exec4.status}`);
      assertCond(
        t4Row0[0] === "25/10/2026",
        `Test 4 explicit date 2026-10-25 must format to '25/10/2026' (never today's date!), got '${t4Row0[0]}'`
      );

      // Ambiguous slash date ("05/06/2026") triggers WAITING_FOR_INPUT and skips downstream node
      const auto4Amb = await setTestCanvas({
        name: "[E2E Test 4b] Ambiguous Date Clarification Gate",
        isActive: false,
        nodes: [
          {
            id: "t4b_n1",
            type: "generic",
            label: "Ambiguous Date Node",
            text: "Fetch Meta Ads performance for 05/06/2026 and append to Google Sheet.",
            status: "configured",
            position: { x: 200, y: 200 },
          },
          {
            id: "t4b_n2",
            type: "generic",
            label: "Downstream Summary",
            text: "Summarize the appended rows.",
            status: "configured",
            position: { x: 520, y: 200 },
          },
        ],
        edges: [{ id: "e_t4b", source: "t4b_n1", target: "t4b_n2" }],
      });

      const run4b = await WorkflowExecutionEngine.run({
        automationId: auto4Amb._id,
        userId,
        triggerType: "manual",
        startNodeId: "t4b_n1",
      });
      createdExecutionIds.push(run4b.executionId);
      const exec4b = await run4b.completionPromise;
      assertCond(exec4b.status === "waiting_for_input", `Expected waiting_for_input for ambiguous date 05/06/2026, got ${exec4b.status}`);
      assertCond(
        exec4b.nodes.find((n) => n.nodeId === "t4b_n2")?.status === "skipped",
        "Downstream node after WAITING_FOR_INPUT must be marked 'skipped'"
      );

      report.test4 = {
        status: "PASS",
        explicitDateInput: "2026-10-25",
        sheetDateFormatDetected: "DD/MM/YYYY",
        writtenCellDate: t4Row0[0],
        ambiguousDateStatus: exec4b.status,
      };
      console.log("  ✅ Test 4 PASSED:", JSON.stringify(report.test4));
    } finally {
      googleOAuth.getAuthenticatedClient = origGetAuth;
      SheetInspectorService.resolveAndReadSheet = origResolveSheet;
    }

    // -------------------------------------------------------------------------
    // TEST 3: DAILY SCHEDULING AT 12:00 AM (00:00 IST) + DUPLICATE & PAUSE GATES
    // -------------------------------------------------------------------------
    console.log("▶ Running Test 3: Daily 12:00 AM (00:00 Asia/Kolkata) Scheduler, Duplicate Guard & Pause Gate...");
    const otherActiveDocs = await AiAutomation.find({ isActive: true, _id: { $ne: workspaceDoc._id } }).select("_id").lean();
    const otherActiveIds = otherActiveDocs.map((d) => d._id);
    if (otherActiveIds.length > 0) {
      await AiAutomation.updateMany({ _id: { $in: otherActiveIds } }, { $set: { isActive: false } });
    }

    try {
      const auto3 = await setTestCanvas({
        name: "[E2E Test 3] Daily 12:00 AM Scheduled Workflow",
        isActive: true,
        nodes: [
          {
            id: "t3_trigger",
            type: "trigger",
            label: "Schedule Trigger",
            text: "Start Workflow",
            status: "configured",
            config: { triggerMode: "schedule" },
            position: { x: 100, y: 200 },
          },
          {
            id: "t3_date",
            type: "date",
            label: "Every Day",
            status: "configured",
            config: { dateType: "recurring", recurrencePattern: "every_day", timezone: "Asia/Kolkata" },
            position: { x: 250, y: 80 },
          },
          {
            id: "t3_time",
            type: "time",
            label: "12:00 AM IST",
            status: "configured",
            config: { time: "00:00", ampm: "AM", recurrence: "daily", timezone: "Asia/Kolkata" },
            position: { x: 250, y: 320 },
          },
          {
            id: "t3_task1",
            type: "generic",
            label: "Midnight Campaign Check",
            text: "Fetch all campaigns from my connected Meta Ads account.",
            status: "configured",
            position: { x: 460, y: 200 },
          },
          {
            id: "t3_task2",
            type: "generic",
            label: "Midnight Performance Check",
            text: "Compare campaign performance and calculate CTR, CPC, CPM, and CPR for my connected Meta Ads account.",
            status: "configured",
            position: { x: 760, y: 200 },
          },
        ],
        edges: [
          { id: "e_t3_1", source: "t3_trigger", target: "t3_date" },
          { id: "e_t3_2", source: "t3_trigger", target: "t3_time" },
          { id: "e_t3_3", source: "t3_trigger", target: "t3_task1" },
          { id: "e_t3_4", source: "t3_task1", target: "t3_task2" },
        ],
      });

      // 2026-11-02 00:00:05 IST == 2026-11-01T18:30:05.000Z
      const midnightIst = new Date("2026-11-01T18:30:05.000Z");
      const firstTickRuns = await AiAutomationScheduler.checkAndRunDueAutomations(midnightIst);
      const matchedRun = firstTickRuns.find((r) => r.automationId === String(auto3._id));
      assertCond(Boolean(matchedRun), "Expected scheduler to trigger Daily 12:00 AM workflow at 00:00 IST");
      createdExecutionIds.push(matchedRun.executionId);

      const exec3 = await matchedRun.completionPromise;
      assertCond(exec3.status === "completed", `Scheduled 12:00 AM workflow expected completed, got ${exec3.status}`);
      assertCond(exec3.triggerType === "schedule", "Expected triggerType === 'schedule'");
      assertCond(exec3.scheduledDate === "2026-11-02", `Expected scheduledDate '2026-11-02', got '${exec3.scheduledDate}'`);

      // Second tick within same 00:00 IST minute -> MUST NOT duplicate!
      const secondTickSameMinute = new Date("2026-11-01T18:30:45.000Z");
      const duplicateTickRuns = await AiAutomationScheduler.checkAndRunDueAutomations(secondTickSameMinute);
      const dupMatch = duplicateTickRuns.find((r) => r.automationId === String(auto3._id));
      assertCond(!dupMatch, "Duplicate scheduled execution MUST be prevented for the same 12:00 AM occurrence!");

      // Pause/disable workflow -> Next day's 00:00 IST MUST NOT trigger!
      await AiAutomation.updateOne({ _id: auto3._id }, { $set: { isActive: false } });
      const nextMidnightIst = new Date("2026-11-02T18:30:05.000Z");
      const pausedTickRuns = await AiAutomationScheduler.checkAndRunDueAutomations(nextMidnightIst);
      const pausedMatch = pausedTickRuns.find((r) => r.automationId === String(auto3._id));
      assertCond(!pausedMatch, "Paused/disabled workflow (isActive=false) MUST NOT execute at 12:00 AM!");

      report.test3 = {
        status: "PASS",
        executionId: exec3.executionId,
        scheduledOccurrenceKey: exec3.scheduledOccurrenceKey,
        scheduledDateIst: exec3.scheduledDate,
        scheduledTimeIst: matchedRun.scheduledTime,
        duplicateSecondTickRuns: duplicateTickRuns.length,
        pausedWorkflowRuns: pausedTickRuns.length,
      };
      console.log("  ✅ Test 3 PASSED:", JSON.stringify(report.test3));
    } finally {
      if (otherActiveIds.length > 0) {
        await AiAutomation.updateMany({ _id: { $in: otherActiveIds } }, { $set: { isActive: true } });
      }
    }

    // -------------------------------------------------------------------------
    // TEST 5: DIFFERENT USER-DEFINED TASKS (NO TASK-SPECIFIC HARDCODING)
    // -------------------------------------------------------------------------
    console.log("▶ Running Test 5: Diverse User-Defined Tasks (Sheet #2 Video Links + Grounded Analysis)...");
    const auto5 = await setTestCanvas({
      name: "[E2E Test 5] Diverse Multi-Integration Tasks",
      isActive: false,
      nodes: [
        {
          id: "t5_n1",
          type: "generic",
          label: "Extract Sheet #2 Video Links",
          text: "Read the 2nd connected Google Sheet and extract all video links with their Creative Code, Media Type, and validation status.",
          status: "configured",
          position: { x: 180, y: 200 },
        },
        {
          id: "t5_n2",
          type: "generic",
          label: "Analyze Meta Account & Suggest Improvements",
          text: "Analyze campaign performance from my connected Meta Ads account and suggest data-backed improvements.",
          status: "configured",
          position: { x: 540, y: 200 },
        },
      ],
      edges: [{ id: "e_t5", source: "t5_n1", target: "t5_n2" }],
    });

    const run5 = await WorkflowExecutionEngine.run({
      automationId: auto5._id,
      userId,
      triggerType: "manual",
      startNodeId: "t5_n1",
    });
    createdExecutionIds.push(run5.executionId);
    const exec5 = await run5.completionPromise;
    const t5n1 = exec5.nodes.find((n) => n.nodeId === "t5_n1");
    const t5n2 = exec5.nodes.find((n) => n.nodeId === "t5_n2");

    assertCond(exec5.status === "completed", `Test 5 expected completed, got ${exec5.status} (${exec5.errorSummary || ""})`);
    assertCond(t5n1.toolsCalled.some((tc) => tc.toolName === "extract_sheet_video_links"), "Test 5 Node 1 must dynamically select extract_sheet_video_links");
    assertCond(
      t5n2.output?.response?.includes("Grounded Performance Analysis & Recommendations"),
      "Test 5 Node 2 must produce grounded performance analysis"
    );

    report.test5 = {
      status: "PASS",
      executionId: exec5.executionId,
      node1Tools: t5n1.toolsCalled.map((t) => t.toolName),
      node2Tools: t5n2.toolsCalled.map((t) => t.toolName),
    };
    console.log("  ✅ Test 5 PASSED:", JSON.stringify(report.test5));

    // -------------------------------------------------------------------------
    // TEST 6: FAILURE HANDLING (NODE 1 FAILS -> NODE 2 SKIPPED, NEVER EXECUTED)
    // -------------------------------------------------------------------------
    console.log("▶ Running Test 6: Failure Handling (Node 1 Unauthorized Account -> Node 2 SKIPPED)...");
    const auto6 = await setTestCanvas({
      name: "[E2E Test 6] Strict Failure & Downstream Skip Gate",
      isActive: false,
      nodes: [
        {
          id: "t6_n1",
          type: "generic",
          label: "Failing Meta Account Node",
          text: "Fetch all campaigns from Meta Ads account act_999999999999.",
          status: "configured",
          position: { x: 200, y: 200 },
        },
        {
          id: "t6_n2",
          type: "generic",
          label: "Dependent Downstream Node",
          text: "Fetch Ads according to the previous node's campaign data.",
          status: "configured",
          position: { x: 560, y: 200 },
        },
      ],
      edges: [{ id: "e_t6", source: "t6_n1", target: "t6_n2" }],
    });

    const run6 = await WorkflowExecutionEngine.run({
      automationId: auto6._id,
      userId,
      triggerType: "manual",
      startNodeId: "t6_n1",
    });
    createdExecutionIds.push(run6.executionId);
    const exec6 = await run6.completionPromise;
    const t6n1 = exec6.nodes.find((n) => n.nodeId === "t6_n1");
    const t6n2 = exec6.nodes.find((n) => n.nodeId === "t6_n2");

    assertCond(exec6.status === "failed", `Test 6 workflow expected 'failed', got '${exec6.status}'`);
    assertCond(t6n1?.status === "failed", `Test 6 Node 1 expected 'failed', got '${t6n1?.status}'`);
    assertCond(Boolean(t6n1?.error?.message), "Test 6 Node 1 must persist actual API error message");
    assertCond(t6n2?.status === "skipped", `Test 6 Node 2 expected 'skipped' (SKIPPED), got '${t6n2?.status}'`);
    assertCond(t6n2?.startedAt === null, "Test 6 Node 2 must NEVER start execution when Node 1 fails!");

    report.test6 = {
      status: "PASS",
      executionId: exec6.executionId,
      workflowStatus: exec6.status,
      node1Status: t6n1.status,
      node1Error: t6n1.error?.message,
      node2Status: t6n2.status,
      node2StartedAt: t6n2.startedAt,
    };
    console.log("  ✅ Test 6 PASSED:", JSON.stringify(report.test6));

    // -------------------------------------------------------------------------
    // TEST 7: PERSISTENCE & AUTOMATION LOGS CONTROLLER RETRIEVAL
    // -------------------------------------------------------------------------
    console.log("▶ Running Test 7: MongoDB Persistence & 5-Section Automation Logs Retrieval...");
    const mockResPayload = {};
    const mockRes = {
      status(code) {
        mockResPayload.statusCode = code;
        return this;
      },
      json(body) {
        mockResPayload.body = body;
        return this;
      },
    };

    await AutomationExecutionController.getExecutionById(
      { user: { _id: userId }, params: { executionId: exec1.executionId } },
      mockRes
    );

    assertCond(mockResPayload.statusCode === 200 && mockResPayload.body?.success === true, "getExecutionById must return HTTP 200");
    const persistedExec = mockResPayload.body.data;
    const persistedNode = persistedExec.nodes.find((n) => n.nodeId === "t1_node1");

    assertCond(Boolean(persistedNode.originalInstruction), "Section 1 (originalInstruction) must be persisted");
    assertCond(Boolean(persistedNode.executionSummary?.understoodObjective), "Section 2 (executionSummary) must be persisted");
    assertCond(Array.isArray(persistedNode.toolsCalled) && persistedNode.toolsCalled.length > 0, "Section 3 (toolsCalled) must be persisted");
    assertCond(Boolean(persistedNode.dataProcessing), "Section 4 (dataProcessing) must be persisted");
    assertCond(Boolean(persistedNode.output?.response) && Boolean(persistedNode.validation?.verified), "Section 5 (final output & verification) must be persisted");
    assertCond(Boolean(persistedExec.sharedContext?.nodeResults?.t1_node1), "Shared workflow execution context must be persisted");

    report.test7 = {
      status: "PASS",
      executionIdReloaded: persistedExec.executionId,
      persistedSectionsPresent: {
        nodeInstruction: Boolean(persistedNode.originalInstruction),
        executionSummary: Boolean(persistedNode.executionSummary),
        toolCallsCount: persistedNode.toolsCalled.length,
        dataProcessing: Boolean(persistedNode.dataProcessing),
        finalOutputVerified: Boolean(persistedNode.validation?.verified),
        sharedContextSaved: Boolean(persistedExec.sharedContext?.nodeResults?.t1_node1),
      },
    };
    console.log("  ✅ Test 7 PASSED:", JSON.stringify(report.test7));

    console.log("\n=================================================================");
    console.log("  ALL 7 MANDATORY E2E TESTS PASSED WITH REAL EXECUTION DATA!     ");
    console.log("=================================================================");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    // Restore original user workspace 100% intact and clean up temporary test execution documents
    if (createdTempWorkspace) {
      await AiAutomation.deleteOne({ _id: workspaceDoc._id });
    } else if (originalAutomation) {
      await AiAutomation.findOneAndUpdate(
        { _id: workspaceDoc._id },
        {
          $set: {
            name: originalAutomation.name,
            isActive: originalAutomation.isActive,
            nodes: originalAutomation.nodes,
            edges: originalAutomation.edges,
            lastRunAt: originalAutomation.lastRunAt,
            nextRunAt: originalAutomation.nextRunAt,
            executionHistory: originalAutomation.executionHistory,
          },
        }
      );
    }
    if (createdExecutionIds.length > 0) {
      await AutomationExecution.deleteMany({ executionId: { $in: createdExecutionIds } });
    }
    await mongoose.disconnect();
  }
}

runAllTests().catch(async (err) => {
  console.error("\n❌ E2E SUITE FAILED:", err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
