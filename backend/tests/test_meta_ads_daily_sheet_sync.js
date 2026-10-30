import assert from "node:assert";
import { MetaAdsSheetSyncService } from "../src/services/automation/metaAdsSheetSyncService.js";
import { AiAgentOrchestrator } from "../src/services/agent/aiAgentOrchestrator.js";

async function runTests() {
  console.log("==========================================================");
  console.log("🧪 TESTING META ADS DAILY SHEET SYNC & AUTOMATION WORKFLOW");
  console.log("==========================================================\n");

  let passed = 0;
  let failed = 0;

  // TEST 1: Date Range Calculation (Yesterday in Asia/Kolkata)
  try {
    console.log("👉 Test 1: getYesterdayDateRange in Asia/Kolkata");
    const range = MetaAdsSheetSyncService.getYesterdayDateRange("Asia/Kolkata");
    assert.ok(range.since, "since date must exist");
    assert.ok(range.until, "until date must exist");
    assert.strictEqual(range.since, range.until, "Daily sync must cover single day");
    assert.match(range.since, /^\d{4}-\d{2}-\d{2}$/, "Must be formatted as YYYY-MM-DD");
    assert.strictEqual(range.timeZone, "Asia/Kolkata");

    // Verify it is strictly in the past (yesterday)
    const targetDateObj = new Date(range.since + "T00:00:00Z");
    const nowUtc = new Date();
    assert.ok(targetDateObj.getTime() < nowUtc.getTime(), "Target date must be in the past");
    console.log(`✅ Test 1 Passed: Correct yesterday date "${range.targetDate}" in ${range.timeZone}\n`);
    passed++;
  } catch (err) {
    console.error("❌ Test 1 Failed:", err.message);
    failed++;
  }

  // TEST 2: Dynamic Header Detection & Field Mapping
  try {
    console.log("👉 Test 2: Dynamic Header Detection & Fuzzy Metric Mapping");
    const testHeaders = [
      "Report Date",
      "Campaign Title",
      "Ad Set",
      "Creative Name",
      "Amount Spent",
      "Views",
      "All Clicks",
      "Outbound Clicks",
      "CTR %",
      "Avg CPC",
      "Purchase ROAS",
      "Conversions",
      "Last Updated"
    ];

    const mapped = {};
    for (const h of testHeaders) {
      mapped[h] = MetaAdsSheetSyncService.matchHeaderToMetric(h);
    }

    assert.strictEqual(mapped["Report Date"], "date_start");
    assert.strictEqual(mapped["Campaign Title"], "campaign_name");
    assert.strictEqual(mapped["Ad Set"], "adset_name");
    assert.strictEqual(mapped["Creative Name"], "ad_name");
    assert.strictEqual(mapped["Amount Spent"], "spend");
    assert.strictEqual(mapped["Views"], "impressions");
    assert.strictEqual(mapped["All Clicks"], "clicks");
    assert.strictEqual(mapped["Outbound Clicks"], "link_clicks");
    assert.strictEqual(mapped["CTR %"], "ctr");
    assert.strictEqual(mapped["Avg CPC"], "cpc");
    assert.strictEqual(mapped["Purchase ROAS"], "purchase_roas");
    assert.strictEqual(mapped["Conversions"], "purchases");
    assert.strictEqual(mapped["Last Updated"], "synced_at");

    console.log("✅ Test 2 Passed: All dynamic header aliases accurately mapped to Meta metrics\n");
    passed++;
  } catch (err) {
    console.error("❌ Test 2 Failed:", err.message);
    failed++;
  }

  // TEST 3: Duplicate Protection Engine
  try {
    console.log("👉 Test 3: Duplicate Record Prevention");
    const headers = ["Date", "Campaign Name", "Ad Name", "Spend", "Purchases", "ROAS"];
    const existingRows = [
      ["2026-10-29", "BGMI Scaling", "Creative 01", "1500", "25", "3.2"],
      ["2026-10-29", "Free Fire Retargeting", "Video 02", "800", "12", "2.8"],
    ];

    const newCandidates = [
      // Duplicate of Row 1
      {
        date_start: "2026-10-29",
        campaign_name: "BGMI Scaling",
        ad_name: "Creative 01",
        spend: 1500,
        purchases: 25,
        purchase_roas: 3.2,
      },
      // New distinct record
      {
        date_start: "2026-10-29",
        campaign_name: "BGMI Scaling",
        ad_name: "Creative 02 - Winner",
        spend: 2100,
        purchases: 40,
        purchase_roas: 4.1,
      },
      // Another new distinct record
      {
        date_start: "2026-10-28",
        campaign_name: "BGMI Scaling",
        ad_name: "Creative 01",
        spend: 1200,
        purchases: 18,
        purchase_roas: 2.9,
      },
    ];

    const result = MetaAdsSheetSyncService.filterDuplicateRecords(newCandidates, existingRows, headers);
    assert.strictEqual(result.duplicateCount, 1, "Should identify exactly 1 duplicate record");
    assert.strictEqual(result.uniqueRecords.length, 2, "Should retain exactly 2 unique records");
    assert.strictEqual(result.uniqueRecords[0].ad_name, "Creative 02 - Winner");
    assert.strictEqual(result.uniqueRecords[1].date_start, "2026-10-28");

    console.log("✅ Test 3 Passed: Duplicate prevention successfully skipped existing row and retained 2 unique rows\n");
    passed++;
  } catch (err) {
    console.error("❌ Test 3 Failed:", err.message);
    failed++;
  }

  // TEST 4: Intent Classification in AiAgentOrchestrator
  try {
    console.log("👉 Test 4: AiAgentOrchestrator Intent Classification for Daily Sync");
    const prompts = [
      "Fetch Meta Ads performance data and append it to the BGMI worksheet.",
      "Fetch Meta Ads performance data and append it to the Free Fire worksheet.",
      "Sync daily Meta Ads reporting to GPRC tab",
      "Daily Meta Ads Reporting: append yesterday's campaign insights to performance spreadsheet",
    ];

    for (const prompt of prompts) {
      const classified = AiAgentOrchestrator.classifyIntent(prompt, {});
      assert.strictEqual(
        classified.intent,
        "META_ADS_SHEET_SYNC",
        `Prompt "${prompt}" should be classified as META_ADS_SHEET_SYNC`
      );
      assert.ok(classified.tools.includes("sync_meta_ads_to_sheet"));
    }

    console.log("✅ Test 4 Passed: All sync workflow prompts classified as META_ADS_SHEET_SYNC with sync_meta_ads_to_sheet tool\n");
    passed++;
  } catch (err) {
    console.error("❌ Test 4 Failed:", err.message);
    failed++;
  }

  // TEST 5: End-to-End Execution Pipeline (9-Step Audit Trail)
  try {
    console.log("👉 Test 5: End-to-End 9-Step Pipeline Execution");
    const mockContext = {
      userId: "650000000000000000000001",
      targetMetaAccountId: "1405197426806546",
      connectedSheetUrl: "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit",
      connectedSheetName: "Performance Marketing",
    };

    const syncResult = await MetaAdsSheetSyncService.syncMetaAdsToSheet({
      userId: mockContext.userId,
      instruction: "Fetch Meta Ads performance data and append it to the BGMI worksheet.",
      node: {
        label: "BGMI Daily Meta Ads Reporting",
        config: {
          worksheetName: "BGMI",
          metaAccountId: "1405197426806546",
          spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
        },
      },
      context: mockContext,
    });

    assert.strictEqual(syncResult.success, true);
    assert.strictEqual(syncResult.targetTab, "BGMI");
    assert.strictEqual(syncResult.metaAccountId, "1405197426806546");
    assert.ok(syncResult.totalInsightsFetched > 0, "Must fetch insight records");
    assert.ok(Array.isArray(syncResult.auditLogs), "Audit logs must be an array");
    assert.strictEqual(syncResult.auditLogs.length, 9, "Must contain all 9 pipeline audit steps");

    // Verify 9 steps
    const stepNames = syncResult.auditLogs.map((l) => l.name);
    assert.ok(stepNames.includes("Trigger Activated"));
    assert.ok(stepNames.includes("Meta Account Verified"));
    assert.ok(stepNames.includes("Sheet Connection Verified"));
    assert.ok(stepNames.includes("Worksheet Selected"));
    assert.ok(stepNames.includes("Meta Ads Data Fetched"));
    assert.ok(stepNames.includes("Headers Detected") || stepNames.includes("Headers Initialized"));
    assert.ok(stepNames.includes("Mapping Completed"));
    assert.ok(stepNames.includes("Duplicates Checked"));
    assert.ok(stepNames.includes("Records Appended"));

    console.log(`✅ Test 5 Passed: Full 9-step audit trail executed with status SUCCESS (${syncResult.recordsAppended} rows appended)\n`);
    passed++;
  } catch (err) {
    console.error("❌ Test 5 Failed:", err.message);
    failed++;
  }

  console.log("==========================================================");
  console.log(`📊 SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("==========================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Test Suite Crashed:", e);
  process.exit(1);
});
