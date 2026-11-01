import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import MetaAccount from "../src/models/metaAccount.js";
import AiContext from "../src/models/aiContextModel.js";
import ChatMessage from "../src/models/chatMessage.js";
import { runAgentChat } from "../src/controller/chat.controller.js";

function assertCond(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function countOccurrences(haystack = "", needle = "") {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

async function runChatTurn({ userId, conversationId, userMessage, executionId = null }) {
  let streamed = "";
  let streamResets = 0;
  const events = [];

  const result = await runAgentChat({
    userId,
    conversationId,
    userMessage,
    executionId,
    onEvent: (ev) => {
      events.push(ev);
      if (ev.type === "stream_reset") {
        streamed = "";
        streamResets++;
      } else if (ev.type === "text_delta" && ev.content) {
        streamed += ev.content;
      }
    },
  });

  return { result, streamed, streamResets, events };
}

async function main() {
  console.log("Connecting to MongoDB for live end-to-end verification (Tests A–H)...");
  await mongoose.connect(process.env.MONGO_URI);

  // Locate real MetaAccount token for act_1416124059911929 to clone into an isolated temporary test user
  const realMeta = await MetaAccount.findOne({
    $or: [{ accountId: "act_1416124059911929" }, { accountId: "1416124059911929" }],
    isActive: true,
  }).lean();

  assertCond(Boolean(realMeta?.accessToken), "Active MetaAccount act_1416124059911929 must exist in DB for live test");

  const tempUserId = new mongoose.Types.ObjectId();
  const convSheets = `test_conv_sheets_${Date.now()}`;
  const convMeta = `test_conv_meta_${Date.now()}`;
  const convMisc = `test_conv_misc_${Date.now()}`;

  const resultsSummary = [];

  try {
    // Seed isolated test user's MetaAccount + 2 connected Google Sheets in AiContext
    await MetaAccount.create({
      userId: tempUserId,
      accountId: "act_1416124059911929",
      accountName: realMeta.accountName || "Raj Singh",
      currency: realMeta.currency || "INR",
      accessToken: realMeta.accessToken,
      isActive: true,
    });

    await AiContext.create({
      userId: tempUserId,
      nodes: [
        {
          id: "node-ad_channel-test",
          type: "ad_channel",
          label: "Meta Ads",
          data: {
            channel: "meta",
            channelName: "Meta Ads",
            adAccountId: "act_1416124059911929",
          },
        },
        {
          id: "node-warehouse-test",
          type: "data_warehouse",
          label: "Warehouse (2 Sheets)",
          data: {
            sheets: [
              {
                id: "sheet-1",
                workbookName: "Copy of NWTN | Utsav BAU Retargeting",
                sheetUrl:
                  "https://docs.google.com/spreadsheets/d/1WsNqpKOvR6HB_r2EOQSlIse0MDlUSpsufTL3B9IePnA/edit?usp=sharing",
                excelProvider: "Google Sheets",
              },
              {
                id: "sheet-2",
                workbookName: "NWTN | Utsav | 2-5 Nov Tithi",
                sheetUrl:
                  "https://docs.google.com/spreadsheets/d/18m8I9zte3wZjnfGJjs29294jiVPl4tpIXJE00MQWLow/edit?usp=sharing",
                excelProvider: "Google Sheets",
                selectedTabIds: ["Eveil Eye | Protection"],
              },
            ],
          },
        },
      ],
      edges: [],
    });

    // =========================================================================
    // TEST A: Google Sheets Video Link Extraction
    // =========================================================================
    console.log("\n▶ Running Test A: 'Use 2nd sheet and fetch video link data.'");
    const turnA = await runChatTurn({
      userId: tempUserId,
      conversationId: convSheets,
      userMessage: "Use 2nd sheet and fetch video link data.",
    });
    console.log(turnA.result.content);

    assertCond(
      turnA.result.content.includes("18m8I9zte3wZjnfGJjs29294jiVPl4tpIXJE00MQWLow") &&
        turnA.result.content.includes("Eveil Eye | Protection"),
      "Test A must select Sheet #2 and worksheet 'Eveil Eye | Protection'"
    );
    assertCond(
      /https:\/\/drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]{15,}\/view\?usp=(?:drive_link|sharing)/.test(turnA.result.content),
      "Test A must extract the complete untruncated Google Drive video URL from Smart Chips"
    );
    assertCond(
      !turnA.result.content.includes("Autonomous Task Execution Completed") &&
        !turnA.result.content.includes("VERIFIED & VALIDATED"),
      "Test A must not contain any hardcoded completion/verification strings"
    );
    assertCond(
      !turnA.result.content.includes("Landing Page") && !turnA.result.content.includes("Age Max"),
      "Test A must return a concise video table rather than dumping all 50 columns"
    );
    assertCond(
      turnA.streamed.trim() === turnA.result.content.trim(),
      "Test A streamed output must match final result.content exactly once"
    );
    resultsSummary.push({ test: "Test A (Sheet #2 Video Link Extraction)", status: "PASS" });

    // =========================================================================
    // TEST B: Follow-Up Context ("Now fetch creative codes for these videos.")
    // =========================================================================
    console.log("\n▶ Running Test B: 'Now fetch creative codes for these videos.'");
    const turnB = await runChatTurn({
      userId: tempUserId,
      conversationId: convSheets,
      userMessage: "Now fetch creative codes for these videos.",
    });
    console.log(turnB.result.content);

    assertCond(
      turnB.result.content.includes("18m8I9zte3wZjnfGJjs29294jiVPl4tpIXJE00MQWLow") &&
        turnB.result.content.includes("Eveil Eye | Protection"),
      "Test B must reuse Sheet #2 & 'Eveil Eye | Protection' from conversation memory"
    );
    assertCond(
      turnB.result.content.includes("Creative Code") &&
        /https:\/\/drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]{15,}/.test(turnB.result.content),
      "Test B must map video URLs to their actual Creative Code"
    );
    resultsSummary.push({ test: "Test B (Follow-Up Sheet Context & Creative Codes)", status: "PASS" });

    // =========================================================================
    // TEST C: Duplicate Response Prevention & Retry Idempotency
    // =========================================================================
    console.log("\n▶ Running Test C: Repeat Test A + Concurrent/Idempotent Execution Check");
    const turnC1 = await runChatTurn({
      userId: tempUserId,
      conversationId: convSheets,
      userMessage: "Use 2nd sheet and fetch video link data.",
    });
    const headerCount = countOccurrences(turnC1.streamed, "### Video Links Extracted");
    assertCond(headerCount === 1, `Test C expected 1 report header in stream, got ${headerCount}`);

    const sharedExecId = `exec_idempotent_test_${Date.now()}`;
    const [dup1, dup2] = await Promise.all([
      runChatTurn({
        userId: tempUserId,
        conversationId: convSheets,
        userMessage: "Use 2nd sheet and fetch video link data.",
        executionId: sharedExecId,
      }),
      runChatTurn({
        userId: tempUserId,
        conversationId: convSheets,
        userMessage: "Use 2nd sheet and fetch video link data.",
        executionId: sharedExecId,
      }),
    ]);
    assertCond(dup1.result.executionId === sharedExecId && dup2.result.executionId === sharedExecId, "Execution ID preserved");
    const persistedForSharedExec = await ChatMessage.countDocuments({
      conversationId: convSheets,
      role: "assistant",
      executionId: sharedExecId,
    });
    assertCond(
      persistedForSharedExec === 1,
      `Test C expected exactly 1 persisted assistant message for shared executionId, got ${persistedForSharedExec}`
    );
    resultsSummary.push({ test: "Test C (No Duplicate Stream & Single Persisted Message)", status: "PASS" });

    // =========================================================================
    // TEST D: Meta Ads Campaign Fetch
    // =========================================================================
    console.log("\n▶ Running Test D: 'In account act_1416124059911929, fetch all campaign names.'");
    const turnD = await runChatTurn({
      userId: tempUserId,
      conversationId: convMeta,
      userMessage: "In account act_1416124059911929, fetch all campaign names.",
    });
    console.log(turnD.result.content);

    assertCond(
      turnD.result.content.includes("### Campaigns Retrieved") &&
        turnD.result.content.includes("| Campaign Name | Campaign ID | Status |") &&
        turnD.result.content.includes("act_1416124059911929"),
      "Test D must render real Campaigns Retrieved table for act_1416124059911929"
    );
    assertCond(
      turnD.result.content.includes("Total Campaigns Returned:"),
      "Test D must report exact total campaign count"
    );
    resultsSummary.push({ test: "Test D (Meta Ads Campaign Fetch on act_1416124059911929)", status: "PASS" });

    // =========================================================================
    // TEST E: Follow-Up Meta Ads Metrics ("Now fetch their spend.")
    // =========================================================================
    console.log("\n▶ Running Test E: 'Now fetch their spend.'");
    const turnE = await runChatTurn({
      userId: tempUserId,
      conversationId: convMeta,
      userMessage: "Now fetch their spend.",
    });
    console.log(turnE.result.content);

    assertCond(
      turnE.result.content.includes("act_1416124059911929") &&
        turnE.result.content.includes("Spend"),
      "Test E must reuse act_1416124059911929 from session memory and report live spend"
    );
    resultsSummary.push({ test: "Test E (Follow-Up Meta Ads Spend from Memory)", status: "PASS" });

    // =========================================================================
    // TEST F: Permission / Unavailable Account Error Handling
    // =========================================================================
    console.log("\n▶ Running Test F: 'In account act_999999999999, fetch all campaign names.'");
    const turnF = await runChatTurn({
      userId: tempUserId,
      conversationId: convMisc,
      userMessage: "In account act_999999999999, fetch all campaign names.",
    });
    console.log(turnF.result.content);

    assertCond(
      turnF.result.content.includes("act_999999999999") &&
        /not connected|inaccessible|failed|error/i.test(turnF.result.content) &&
        !turnF.result.content.includes("| Campaign Name | Campaign ID | Status |"),
      "Test F must explain the account/permission error and never fabricate campaign data"
    );
    resultsSummary.push({ test: "Test F (Unavailable/Unauthorized Meta Account Error)", status: "PASS" });

    // =========================================================================
    // TEST G: Unknown Spreadsheet Field Request
    // =========================================================================
    console.log("\n▶ Running Test G: 'Fetch the TikTok Shop SKU column from Sheet #2.'");
    const turnG = await runChatTurn({
      userId: tempUserId,
      conversationId: convMisc,
      userMessage: "Fetch the TikTok Shop SKU column from Sheet #2.",
    });
    console.log(turnG.result.content);

    assertCond(
      turnG.result.content.includes("TikTok Shop SKU") &&
        /not found|do not exist/i.test(turnG.result.content) &&
        turnG.result.content.includes("Actual Available Columns"),
      "Test G must state that 'TikTok Shop SKU' does not exist and list actual headers without fabricating values"
    );
    resultsSummary.push({ test: "Test G (Unknown Spreadsheet Column Truthfulness)", status: "PASS" });

    // =========================================================================
    // TEST H: Arbitrary Multi-Step Cross-Source Instruction
    // =========================================================================
    console.log(
      "\n▶ Running Test H: 'List worksheet tabs in Sheet #2 and fetch ad creatives from account act_1416124059911929.'"
    );
    const turnH = await runChatTurn({
      userId: tempUserId,
      conversationId: convMisc,
      userMessage:
        "List worksheet tabs in Sheet #2 and fetch ad creatives from account act_1416124059911929.",
    });
    console.log(turnH.result.content);

    assertCond(
      turnH.result.content.includes("Wealth & Prosperity") &&
        turnH.result.content.includes("Eveil Eye | Protection") &&
        turnH.result.content.includes("act_1416124059911929") &&
        turnH.result.content.includes("Creatives"),
      "Test H must dynamically execute multi-step tools across both Sheet #2 and Meta Ads creatives"
    );
    resultsSummary.push({ test: "Test H (Arbitrary Multi-Step Sheets + Meta Creatives)", status: "PASS" });

    console.log("\n=======================================================");
    console.log("ALL 8 MANDATORY SCENARIOS (TESTS A–H) PASSED!");
    console.table(resultsSummary);
    console.log("=======================================================");
  } finally {
    // Clean up all temporary verification documents
    await Promise.all([
      MetaAccount.deleteMany({ userId: tempUserId }),
      AiContext.deleteMany({ userId: tempUserId }),
      ChatMessage.deleteMany({ userId: tempUserId }),
    ]);
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("\n❌ VERIFICATION SUITE FAILED:", err);
  process.exit(1);
});
