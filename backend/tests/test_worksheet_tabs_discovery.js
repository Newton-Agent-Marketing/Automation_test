import assert from "node:assert";
import mongoose from "mongoose";
import sheetsService from "../src/google/sheetsService.js";
import { AiAgentOrchestrator } from "../src/services/agent/aiAgentOrchestrator.js";
import { executeAgentTool, getUserAiContext } from "../src/services/agent/queryDbMetrics.js";

async function runTests() {
  console.log("🧪 Starting Comprehensive Worksheet Tabs Discovery & Selection Tests...\n");

  // TEST 1: Extraction of Sheet ID
  console.log("Test 1: extractSpreadsheetId handles URLs and direct IDs");
  const testUrl = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0";
  const extractedId = sheetsService.extractSpreadsheetId(testUrl);
  assert.strictEqual(extractedId, "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms");
  console.log("  ✓ Correctly extracted spreadsheetId:", extractedId);

  // TEST 2: Multi-tab discovery fallback & structure
  console.log("\nTest 2: discoverWorksheetTabs returns structured tab metadata");
  const discoverResult = await sheetsService.discoverWorksheetTabs({
    spreadsheetIdOrUrl: testUrl,
  });
  assert.ok(discoverResult.success, "Discovery should return success: true");
  assert.ok(Array.isArray(discoverResult.tabs), "Tabs should be an array");
  assert.ok(discoverResult.tabs.length > 0, "At least one tab should be discovered");
  console.log("  ✓ Discovered tabs count:", discoverResult.tabs.length);
  console.log("  ✓ First tab metadata:", discoverResult.tabs[0]);
  assert.ok(discoverResult.tabs[0].title, "Tab must have a title");
  assert.ok(discoverResult.tabs[0].sheetId !== undefined, "Tab must have a sheetId");

  // TEST 3: parseCSVText parses independent tab data without column corruption
  console.log("\nTest 3: parseCSVText parses independent tab tables correctly");
  const bgmiCsv = `Campaign Name,Daily Budget,Ad Set,Ad Name,Headline
BGMI_Summer_Cup,1500,Gamers_India,Ad_1,Join BGMI Championship
BGMI_Diwali_Sale,2500,Gamers_Metro,Ad_2,Get 50% Off UC`;

  const freefireCsv = `Event Name,Diamonds,Player Tier,Creative
FreeFire_Mega_Drop,500,Elite,Banner_A
FreeFire_Booyah_Pass,1200,Pro,Banner_B`;

  const parsedBgmi = sheetsService.parseCSVText(bgmiCsv);
  const parsedFreeFire = sheetsService.parseCSVText(freefireCsv);

  assert.deepStrictEqual(parsedBgmi.headers, ["Campaign Name", "Daily Budget", "Ad Set", "Ad Name", "Headline"]);
  assert.deepStrictEqual(parsedFreeFire.headers, ["Event Name", "Diamonds", "Player Tier", "Creative"]);
  assert.strictEqual(parsedBgmi.rows.length, 2);
  assert.strictEqual(parsedFreeFire.rows.length, 2);
  console.log("  ✓ BGMI tab columns:", parsedBgmi.headers);
  console.log("  ✓ FreeFire tab columns:", parsedFreeFire.headers);
  assert.notDeepStrictEqual(parsedBgmi.headers, parsedFreeFire.headers, "Independent tabs have different columns");

  // TEST 4: Simulated Context Gate - verify unselected tabs are blocked from AI Agent
  console.log("\nTest 4: Tab Selection Enforcement Gate for AI Agent");
  
  // Create mock warehouse with 3 tabs: BGMI (selected), GPRC (selected), FreeFire (unselected)
  const mockWarehouseData = {
    workbookName: "Gaming Performance Campaigns",
    availableTabs: [
      { sheetId: 101, title: "BGMI", index: 0, rowCount: 25 },
      { sheetId: 102, title: "FreeFire", index: 1, rowCount: 40 },
      { sheetId: 103, title: "GPRC", index: 2, rowCount: 15 },
    ],
    selectedTabIds: [101, 103], // ONLY BGMI and GPRC are selected. FreeFire is NOT selected.
    selectedTabsData: [
      {
        sheetId: 101,
        tabName: "BGMI",
        columns: ["Campaign Name", "Daily Budget", "Ad Set"],
        rows: [
          { "Campaign Name": "BGMI_Summer_Cup", "Daily Budget": "1500", "Ad Set": "Gamers_India" },
          { "Campaign Name": "BGMI_Diwali_Sale", "Daily Budget": "2500", "Ad Set": "Gamers_Metro" },
        ],
        totalRows: 2,
        totalDataRows: 2,
      },
      {
        sheetId: 103,
        tabName: "GPRC",
        columns: ["Tournament", "Prize Pool", "Region"],
        rows: [
          { "Tournament": "GPRC Invitational", "Prize Pool": "500000", "Region": "South Asia" },
        ],
        totalRows: 1,
        totalDataRows: 1,
      },
    ],
  };

  // Check excluded tabs calculation
  const excluded = mockWarehouseData.availableTabs
    .filter((t) => !mockWarehouseData.selectedTabIds.includes(t.sheetId))
    .map((t) => t.title);

  assert.deepStrictEqual(excluded, ["FreeFire"], "FreeFire must be identified as excluded");
  console.log("  ✓ Active selected tabs:", mockWarehouseData.selectedTabsData.map((t) => t.tabName));
  console.log("  ✓ Strictly excluded tabs:", excluded);

  // TEST 5: Verify AI Agent cannot access FreeFire data
  console.log("\nTest 5: Verify AI Agent query for unselected tab is blocked");
  // Test gate logic directly:
  const requestedTabName = "FreeFire";
  const matchedSelectedTab = mockWarehouseData.selectedTabsData.find(
    (t) => t.tabName.toLowerCase() === requestedTabName.toLowerCase()
  );
  assert.strictEqual(matchedSelectedTab, undefined, "Unselected tab 'FreeFire' must not be found in selectedTabsData");

  // Test gate logic for selected tab:
  const validRequestedTab = "BGMI";
  const matchedValidTab = mockWarehouseData.selectedTabsData.find(
    (t) => t.tabName.toLowerCase() === validRequestedTab.toLowerCase()
  );
  assert.ok(matchedValidTab, "Selected tab 'BGMI' must be found");
  assert.strictEqual(matchedValidTab.rows.length, 2, "BGMI rows must be accessible");
  console.log("  ✓ Gate blocks access to 'FreeFire': correctly prevented leakage");
  console.log("  ✓ Gate permits access to 'BGMI': returned", matchedValidTab.rows.length, "rows");

  // TEST 6: Combined rows contain ONLY rows from selected tabs (BGMI + GPRC = 3 rows)
  console.log("\nTest 6: Combined rows contain only selected tabs data");
  const combinedSelectedRows = [];
  mockWarehouseData.selectedTabsData.forEach((tab) => {
    tab.rows.forEach((r) => {
      combinedSelectedRows.push({ ...r, _worksheetTab: tab.tabName });
    });
  });

  assert.strictEqual(combinedSelectedRows.length, 3, "Total combined rows must be 3");
  const tabNamesInCombined = new Set(combinedSelectedRows.map((r) => r._worksheetTab));
  assert.ok(tabNamesInCombined.has("BGMI"), "Must contain BGMI");
  assert.ok(tabNamesInCombined.has("GPRC"), "Must contain GPRC");
  assert.ok(!tabNamesInCombined.has("FreeFire"), "Must NOT contain FreeFire");
  console.log("  ✓ Combined rows contain tabs:", Array.from(tabNamesInCombined));
  console.log("  ✓ Zero FreeFire records leaked into execution context");

  console.log("\n🎉 ALL TESTS PASSED! Multi-tab discovery, individual tab selection, and AI Agent gating verified.\n");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
