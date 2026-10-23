import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import dbConnect from "../src/config/db.js";

async function runTest() {
  console.log("Connecting to MongoDB via dbConnect...");
  await dbConnect();

  const AiContext = (await import("../src/models/aiContextModel.js")).default;
  const { getUserAiContext, resolveAiContextSelection } = await import("../src/services/agent/queryDbMetrics.js");
  const { SourceSheetReader } = await import("../src/services/campaignPreparation/sourceSheetReader.js");

  const contexts = await AiContext.find({}).lean();
  console.log(`Found ${contexts.length} AI Context document(s) in DB.\n`);

  for (const ctxDoc of contexts) {
    const userId = ctxDoc.userId;
    console.log(`================================================================================`);
    console.log(`👤 User ID: ${userId} | Context Name: "${ctxDoc.name}"`);
    console.log(`Total Nodes in DB Document: ${ctxDoc.nodes?.length || 0}`);

    // 1. Fetch AI Context via getUserAiContext
    const aiCtx = await getUserAiContext({ userId });
    console.log(`\n🧠 getUserAiContext Result:`);
    console.log(`- hasContext: ${aiCtx.hasContext}`);
    console.log(`- totalNodes: ${aiCtx.totalNodes}`);
    console.log(`- totalFlows: ${aiCtx.totalFlows}`);
    console.log(`- Business Units Count: ${aiCtx.businessUnitsHierarchy?.length || 0}`);

    aiCtx.businessUnitsHierarchy?.forEach((bu, idx) => {
      console.log(`\n  🏢 [Business Unit #${idx + 1}] "${bu.name}"`);
      console.log(`     📢 Channels (${bu.channels?.length || 0}):`, bu.channels?.map(c => `${c.channel} (Account: ${c.accountId || 'none'}, Funnel: ${c.funnelEvent})`));
      console.log(`     📦 Products (${bu.products?.length || 0}):`, bu.products?.map(p => `${p.productName} (Price: ₹${p.productPrice || p.price}, URL: ${p.url || p.productUrl || 'none'})`));
      console.log(`     📝 Briefs (${bu.briefs?.length || 0}):`, bu.briefs?.map(b => b.name));
      console.log(`     📊 Warehouses (${bu.warehouses?.length || 0}):`, bu.warehouses?.map(w => ({
        name: w.name,
        sheetsCount: w.sheets?.length || (w.sheetUrl ? 1 : 0),
        sheets: w.sheets?.map(s => s.sheetName || s.workbookName || s.name || s.dataLabels),
      })));
    });

    // 2. Test Dynamic Resolution for various user queries
    const testPrompts = [
      "create meta ads campaign for merchandise",
      "create google ad for subscription",
      "create campaign using hoodie sheet",
    ];

    console.log(`\n🎯 Testing Intelligent AI Context Resolution on Prompts:`);
    for (const prompt of testPrompts) {
      console.log(`\n  👉 User Prompt: "${prompt}"`);
      const selection = resolveAiContextSelection({ aiCtx, userMessage: prompt });
      console.log(`     • Matched Business Unit : "${selection.businessUnit?.name || '(None)'}"`);
      console.log(`     • Matched Ad Channel    : "${selection.channel?.channel || selection.channel?.channelName || '(None)'}" (Ad Account: ${selection.channel?.accountId || '(None)'})`);
      console.log(`     • Matched Product       : "${selection.product?.productName || '(None)'}" (Price: ₹${selection.product?.productPrice}, Landing URL: ${selection.product?.productUrl || selection.product?.url || '(None)'})`);
      console.log(`     • Matched Sheet Name    : "${selection.selectedSheet?.sheetName || selection.selectedSheet?.workbookName || '(Default Sheet)'}"`);
      console.log(`     • Matched Sheet URL     : "${selection.selectedSheet?.sheetUrl || selection.warehouse?.sheetUrl || '(None)'}"`);
    }

    // 3. Test Actual Sheet Reading
    let targetSheetUrl =
      aiCtx.dataWarehouses?.[0]?.sheets?.[0]?.sheetUrl ||
      aiCtx.dataWarehouses?.[0]?.sheetUrl;

    if (!targetSheetUrl && ctxDoc.nodes) {
      const whNode = ctxDoc.nodes.find(n => n.type === "data_warehouse");
      targetSheetUrl = whNode?.data?.sheetUrl || whNode?.data?.sheets?.[0]?.sheetUrl;
    }

    if (targetSheetUrl) {
      console.log(`\n================================================================================`);
      console.log(`📄 Testing Actual Sheet Data Read from URL:\n${targetSheetUrl}`);
      console.log(`================================================================================`);
      try {
        const sheetData = await SourceSheetReader.readSource({
          userId,
          sheetUrlOrId: targetSheetUrl,
        });

        console.log(`\n✅ Sheet Reader Succeeded!`);
        console.log(`- Spreadsheet Title : "${sheetData.spreadsheetName}"`);
        console.log(`- Worksheet Tab Name: "${sheetData.worksheetName}"`);
        console.log(`- Total Rows Read   : ${sheetData.totalRows}`);
        console.log(`- Total Columns     : ${sheetData.headers?.length}`);
        console.log(`- Header Columns    :`, sheetData.headers);

        if (sheetData.rows && sheetData.rows.length > 0) {
          console.log(`\n📊 Sample Row #1 Actual Values:`);
          const firstRow = sheetData.rows[0];
          for (const [key, val] of Object.entries(firstRow)) {
            if (key !== "rawValues" && val) {
              console.log(`   • ${key.padEnd(25)}: ${String(val).slice(0, 80)}`);
            }
          }
        } else {
          console.log(`⚠️ Note: Sheet is accessible, but has 0 populated data rows.`);
        }
      } catch (sheetErr) {
        console.error(`❌ Sheet Read Error:`, sheetErr.message);
      }
    } else {
      console.log(`\n⚠️ No active sheet URL configured in Data Warehouse node.`);
    }
  }

  await mongoose.disconnect();
  console.log("\n================================================================================");
  console.log("🏁 Test Run Completed.");
}

runTest().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
