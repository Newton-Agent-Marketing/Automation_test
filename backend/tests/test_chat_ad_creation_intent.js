import assert from "assert";
import { AiAgentOrchestrator } from "../src/services/agent/aiAgentOrchestrator.js";
import DynamicSheetFilter from "../src/services/data/dynamicSheetFilter.js";

async function runTests() {
  console.log("==========================================================");
  console.log("🧪 TESTING CHAT AD CREATION INTENT & PARSING");
  console.log("==========================================================");

  const userPrompt =
    "Create a Campaign in Draft with Name NW Shiva test, Adset name - Shiva New Creatives Test and Put Ads with Name - NW_Kali_Bhadrakali Mandir Kashi_Bhadrakali Mandir Kashi_Sankalp_Tithi Specific_Annual Generic_Video_Swagger_NA_English_NA_NA_NA_Make your boss like you Generic Tuesday_BAU_NA_<30 Sec_Web_Sales_orders biz_30 July The Ad Creatives and everything ylu can fetch from connected google sheet";

  // Test 1: Intent Classification
  console.log("\n👉 Test 1: Intent Classification for Ad Creation Prompt referencing Sheet");
  const intent = AiAgentOrchestrator.classifyIntent(userPrompt, { targetMetaAccountId: "1416124059911929" });
  console.log("   Classified Intent:", intent.intent);
  assert.strictEqual(
    intent.intent,
    "CAMPAIGN_CREATION",
    "Should classify as CAMPAIGN_CREATION, not GOOGLE_SHEET_FETCH"
  );
  console.log("✅ Test 1 Passed: Intent is CAMPAIGN_CREATION");

  // Test 2: Field Extraction
  console.log("\n👉 Test 2: Dynamic Name & Pattern Extraction");
  const campName = DynamicSheetFilter.parseNameFromMessage(userPrompt, "campaign");
  const adSetName = DynamicSheetFilter.parseNameFromMessage(userPrompt, "adset");
  const adPattern = DynamicSheetFilter.parseAdNamePattern(userPrompt);

  console.log("   Extracted Campaign Name:", campName);
  console.log("   Extracted AdSet Name   :", adSetName);
  console.log("   Extracted Ad Pattern   :", adPattern);

  assert.strictEqual(campName, "NW Shiva test", "Campaign Name must be 'NW Shiva test'");
  assert.strictEqual(adSetName, "Shiva New Creatives Test", "AdSet Name must be 'Shiva New Creatives Test'");
  assert.ok(
    adPattern && adPattern.startsWith("NW_Kali_Bhadrakali"),
    "Ad Name Pattern must start with NW_Kali_Bhadrakali"
  );
  assert.ok(
    !adPattern.includes("The Ad Creatives and everything"),
    "Ad Name Pattern must not leak trailing sheet instruction"
  );
  console.log("✅ Test 2 Passed: Names and Pattern extracted accurately without boundary leaks");

  // Test 3: Chat response synthesis does not contain Node Instruction or downstream nodes in Chat
  console.log("\n👉 Test 3: Chat Response Synthesis Cleanness");
  const chatResponse = AiAgentOrchestrator.synthesizeResponse({
    intentObj: { intent: "GOOGLE_SHEET_FETCH" },
    instruction: "fetch sheet data",
    context: {
      targetMetaAccountId: "1416124059911929",
      isAutomation: false,
      conversationId: "chat_user_123",
      connectedSheetName: "Stan_Shop_Ads_with_NW_Prefix",
    },
    executedTools: [
      {
        toolName: "get_connected_sheet_rows",
        toolResult: { rows: [{ "Ad Name": "Ad 1" }], totalRows: 1, columns: ["Ad Name"] },
        status: "SUCCESS",
      },
    ],
    validation: { verified: true, checks: [{ name: "Sheet", passed: true, detail: "OK" }] },
  });

  assert.ok(
    !chatResponse.includes("Node Instruction"),
    "Chat response must NOT contain 'Node Instruction'"
  );
  assert.ok(
    !chatResponse.includes("downstream execution nodes"),
    "Chat response must NOT contain 'downstream execution nodes'"
  );
  console.log("✅ Test 3 Passed: Chat response is completely free of node instruction metadata");

  console.log("\n==========================================================");
  console.log("🎉 ALL TESTS PASSED!");
  console.log("==========================================================");
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});

