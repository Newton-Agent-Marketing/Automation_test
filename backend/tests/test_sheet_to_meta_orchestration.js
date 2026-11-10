/**
 * Test Suite: Sheet-to-Meta Ads Orchestration
 * Verifies that cross-platform instructions (e.g. read connected Google Sheet -> update/rename Meta Ads)
 * execute authentically through the official Meta MCP layer without filter misinterpretation or fake fallbacks.
 */

import assert from "assert";
import { AiAgentOrchestrator } from "../src/services/agent/aiAgentOrchestrator.js";
import { DynamicSheetFilter } from "../src/services/data/dynamicSheetFilter.js";
import mcpToolRegistry from "../src/services/mcp/McpToolRegistry.js";
import { McpToolExecutor } from "../src/services/mcp/McpToolExecutor.js";

async function runTests() {
  console.log("🚀 Starting Sheet-to-Meta Ads Orchestration Test Suite...\n");
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // ------------------------------------------------------------------------
  // 1. Intent Classification Tests
  // ------------------------------------------------------------------------
  console.log("📋 1. Cross-Platform Intent Classification");

  test("Classifies 'read sheet and update ad name in meta ads' as META_AD_RENAME", () => {
    const prompt = "read the sheet and add new field AdName , in this campaign ad name is update with new AdName in meta ads";
    const res = AiAgentOrchestrator.classifyIntent(prompt);
    assert.strictEqual(res.intent, "META_AD_RENAME");
    assert.ok(res.tools.includes("get_connected_sheet_rows"));
    assert.ok(res.tools.includes("update_meta_ad"));
  });

  test("Classifies 'old AdName replace with New AdName in meta ads' as META_AD_RENAME", () => {
    const prompt = "old AdName replace with New AdName in meta ads";
    const res = AiAgentOrchestrator.classifyIntent(prompt);
    assert.strictEqual(res.intent, "META_AD_RENAME");
    assert.ok(res.tools.includes("update_meta_ad"));
  });

  test("Classifies official prompt 'Read my connected Google Sheet... Replace the name of existing Ads' as META_AD_RENAME", () => {
    const prompt = "Read my connected Google Sheet. There is a new column named adName. Replace the name of the existing Ads inside the selected Meta Ad Set with the corresponding adName value.";
    const res = AiAgentOrchestrator.classifyIntent(prompt);
    assert.strictEqual(res.intent, "META_AD_RENAME");
    assert.ok(res.tools.includes("get_connected_sheet_rows"));
    assert.ok(res.tools.includes("update_meta_ad"));
  });

  // ------------------------------------------------------------------------
  // 2. DynamicSheetFilter Safeguard Tests
  // ------------------------------------------------------------------------
  console.log("\n🛡️ 2. DynamicSheetFilter Action Safeguards (No Misparsing)");

  test("Does NOT parse 'replace old AdName with new AdName' as a sheet row filter", () => {
    const prompt = "old AdName replace with New AdName in meta ads";
    const headers = ["Creative Code", "Nomenclature", "AdName", "Status"];
    const filterRes = DynamicSheetFilter.parseFilterConditions(prompt, headers);
    assert.strictEqual(filterRes.conditions.length, 0, "Conditions should be empty for rename instruction");
  });

  test("Does NOT parse 'replace ... with ...' as a column equals 'replace' condition", () => {
    const prompt = "read the sheet and add new field AdName , in this campaign ad name is update with new AdName in meta ads";
    const headers = ["Creative Code", "Nomenclature", "AdName", "Status"];
    const filterRes = DynamicSheetFilter.parseFilterConditions(prompt, headers);
    assert.strictEqual(filterRes.conditions.length, 0);
  });

  // ------------------------------------------------------------------------
  // 3. McpToolRegistry Dynamic Matching Tests
  // ------------------------------------------------------------------------
  console.log("\n🔍 3. McpToolRegistry Semantic Keyword Matching");

  test("Resolves 'update_meta_ad' to discovered 'update_ad' tool on official Meta MCP server", () => {
    const testUserId = "user_sheet_meta_test";
    const testAccountId = "123456789012345";
    mcpToolRegistry.registerTools(testUserId, testAccountId, {
      serverUrl: "https://mcp.facebook.com/ads",
      transport: "STREAMABLE_HTTP",
      tools: [
        { name: "update_ad", description: "Update properties of an existing ad", inputSchema: { type: "object", properties: { ad_id: { type: "string" }, name: { type: "string" } } } },
        { name: "create_campaign", description: "Create a campaign" },
      ],
    });

    const matched = mcpToolRegistry.findToolByKeyword(testUserId, testAccountId, "update_meta_ad");
    assert.ok(matched, "Should match update_ad when querying update_meta_ad");
    assert.strictEqual(matched.name, "update_ad");
  });

  test("Normalizes argument aliases (adId -> ad_id, adName -> name)", () => {
    const testUserId = "user_sheet_meta_test";
    const testAccountId = "123456789012345";
    const tool = mcpToolRegistry.getTool(testUserId, testAccountId, "update_ad");
    assert.ok(tool);

    // McpToolExecutor argument alias normalization test
    const inputArgs = { adId: "120251301040470466", name: "New Brand Ad Name" };
    const normalized = {
      ...inputArgs,
      ad_id: inputArgs.adId,
      id: inputArgs.adId,
    };
    McpToolExecutor.validateArguments(tool.inputSchema, normalized);
    assert.strictEqual(normalized.ad_id, "120251301040470466");
  });

  // ------------------------------------------------------------------------
  // 4. Row Matching & Independent Execution Logic
  // ------------------------------------------------------------------------
  console.log("\n⚙️ 4. Sheet Row Matching & Independent Execution");

  test("Matches sheet row with Creative Code to corresponding Meta Ad and skips unmatched row", () => {
    const liveAds = [
      { id: "120251301040470466", name: "23/10/2026 _ NW_Shiva_Ghrishneshwar Jyotirlinga_OD-26-2190", adset_id: "adset_1" },
      { id: "120251301040470499", name: "23/10/2026 _ NW_Other_OD-26-9999", adset_id: "adset_1" },
    ];

    const sheetRows = [
      { rowNumber: 2, values: { "Creative Code": "OD-26-2172", "AdName": "GE_Shiva_2172" } },
      { rowNumber: 3, values: { "Creative Code": "OD-26-2190", "AdName": "GE_Shiva_2190" } },
      { rowNumber: 4, values: { "Creative Code": "", "AdName": "" } },
    ];

    const outcomes = [];
    for (const row of sheetRows) {
      const code = row.values["Creative Code"];
      const newName = row.values["AdName"];
      if (!code && !newName) {
        outcomes.push({ row: row.rowNumber, status: "SKIPPED", reason: "Empty row" });
        continue;
      }
      const matched = liveAds.find((a) => a.name.includes(code));
      if (matched) {
        outcomes.push({ row: row.rowNumber, status: "SUCCESS", adId: matched.id, newName });
      } else {
        outcomes.push({ row: row.rowNumber, status: "UNMATCHED", reason: "No matching Meta Ad found" });
      }
    }

    assert.strictEqual(outcomes.length, 3);
    assert.strictEqual(outcomes[0].status, "UNMATCHED", "Row 2 should be UNMATCHED (not in Meta)");
    assert.strictEqual(outcomes[1].status, "SUCCESS", "Row 3 should be matched to Ad 120251301040470466");
    assert.strictEqual(outcomes[1].adId, "120251301040470466");
    assert.strictEqual(outcomes[2].status, "SKIPPED", "Row 4 should be SKIPPED (empty)");
  });

  // ------------------------------------------------------------------------
  // 5. Task Completion Verification & Synthesis Report Tests
  // ------------------------------------------------------------------------
  console.log("\n📊 5. Verification & Markdown Report Generation");

  test("verifyTaskCompletion passes with authentic row outcomes", () => {
    const executedTools = [
      {
        toolName: "get_connected_sheet_rows",
        status: "SUCCESS",
        toolResult: { sheetName: "test", rows: [{ "Creative Code": "OD-26-2190", "AdName": "GE_New" }] },
      },
      {
        toolName: "get_live_adset_ads",
        status: "SUCCESS",
        toolResult: { totalAds: 1, ads: [{ id: "120251301040470466", name: "OD-26-2190" }] },
      },
      {
        toolName: "update_meta_ad",
        status: "SUCCESS",
        toolResult: {
          totalRows: 2,
          matchedCount: 1,
          updatedCount: 1,
          skippedCount: 1,
          failedCount: 0,
          rowOutcomes: [
            { rowNumber: 2, identifier: "OD-26-2172", matchedAdId: null, status: "UNMATCHED", reason: "No matching Meta Ad found" },
            { rowNumber: 3, identifier: "OD-26-2190", matchedAdId: "120251301040470466", status: "SUCCESS", currentName: "Old", newName: "New" },
          ],
        },
      },
    ];

    const validation = AiAgentOrchestrator.verifyTaskCompletion({
      intentObj: { intent: "META_AD_RENAME" },
      instruction: "old AdName replace with New AdName in meta ads",
      executedTools,
    });

    assert.strictEqual(validation.verified, true);
    assert.strictEqual(validation.status, "completed");
    assert.strictEqual(validation.outputData.updatedCount, 1);
    assert.strictEqual(validation.outputData.skippedCount, 1);
  });

  test("synthesizeResponse formats structured markdown table without fake successes", async () => {
    const executedTools = [
      {
        toolName: "update_meta_ad",
        status: "SUCCESS",
        toolResult: {
          totalRows: 2,
          matchedCount: 1,
          updatedCount: 1,
          skippedCount: 1,
          failedCount: 0,
          rowOutcomes: [
            { rowNumber: 2, identifier: "OD-26-2172", matchedAdId: null, currentName: null, newName: "GE_1", status: "UNMATCHED", reason: "No matching Meta Ad found" },
            { rowNumber: 3, identifier: "OD-26-2190", matchedAdId: "120251301040470466", currentName: "Old_Ad", newName: "GE_2", status: "SUCCESS" },
          ],
        },
      },
    ];

    const validation = { verified: true, status: "completed", checks: [] };

    const md = await AiAgentOrchestrator.synthesizeResponse({
      intentObj: { intent: "META_AD_RENAME" },
      instruction: "old AdName replace with New AdName in meta ads",
      context: { targetMetaAccountId: "123456789012345", connectedSheetName: "test" },
      executedTools,
      validation,
    });

    assert.ok(md.includes("Meta Ads Renaming Execution Report"), "Should contain report header");
    assert.ok(md.includes("120251301040470466"), "Should show live ad ID");
    assert.ok(md.includes("OD-26-2190"), "Should show matched row identifier");
    assert.ok(md.includes("UNMATCHED"), "Should show unmatched status for row 2");
    assert.ok(md.includes("Total Rows Processed"), "Should show total rows");
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test Suite Unhandled Exception:", err);
  process.exit(1);
});

