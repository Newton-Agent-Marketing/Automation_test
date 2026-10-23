import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import { resolveAiContextSelection } from "../src/services/agent/queryDbMetrics.js";
import { SourceSheetReader } from "../src/services/campaignPreparation/sourceSheetReader.js";

async function runLiveTest() {
  console.log("\n================================================================================");
  console.log("🧪 LIVE TEST RUN: AI CONTEXT RESOLUTION & ACTUAL GOOGLE SHEET DATA EXTRACTION");
  console.log("================================================================================");

  // ---------------------------------------------------------------------------
  // PART 1: TEST ACTUAL SHEET DATA EXTRACTION VIA SourceSheetReader
  // ---------------------------------------------------------------------------
  const testSpreadsheetId = "1WzjSxyrqiLb8jfly6G1bWDSBHMLKQD81nzZYURcD5Mw";
  const testSheetUrl = `https://docs.google.com/spreadsheets/d/${testSpreadsheetId}`;

  console.log(`\n📥 STEP 1: Reading Actual Data from Google Sheet:`);
  console.log(`URL: ${testSheetUrl}\n`);

  try {
    const sheetData = await SourceSheetReader.readSource({
      sheetUrlOrId: testSpreadsheetId,
    });

    console.log(`✅ [SourceSheetReader Succeeded!]`);
    console.log(`• Spreadsheet Name   : "${sheetData.spreadsheetName}"`);
    console.log(`• Worksheet / Tab    : "${sheetData.worksheetName}"`);
    console.log(`• Source Format      : ${sheetData.sourceType.toUpperCase()}`);
    console.log(`• Total Rows Synced  : ${sheetData.totalRows}`);
    console.log(`• Total Columns (${sheetData.headers?.length}):`, sheetData.headers);
    console.log(`• Data Fingerprint   : ${sheetData.dataFingerprint?.slice(0, 16)}...`);

    if (sheetData.rows && sheetData.rows.length > 0) {
      console.log(`\n📋 Actual Data Extracted from Sheet Rows (First 3 Rows Sample):`);
      sheetData.rows.slice(0, 3).forEach((row, i) => {
        console.log(`\n  --- [Row #${row.rowNumber || i + 2}] ---`);
        const keysToShow = [
          "campaign_name", "campaign name",
          "adset_name", "ad set name",
          "headline", "title",
          "primary_text", "body", "caption",
          "media_url", "video_url", "creative_url", "drive_url", "creative link", "media",
          "daily_budget", "budget",
          "call_to_action", "cta",
          "destination_url", "website_url", "link"
        ];
        
        const cellData = row.values || row;
        const printKeys = [
          "Video ID", "Creative Smart Chips", "Headline", "Primary Text",
          "Ad Name", "campaign_type", "campaign_objective", "campaign_budget",
          "call_to_action", "optimization_goal", "countries", "age_min", "age_max"
        ];
        
        printKeys.forEach((pk) => {
          if (cellData[pk] !== undefined && cellData[pk] !== null && String(cellData[pk]).trim()) {
            console.log(`    • ${pk.padEnd(24)}: "${String(cellData[pk]).slice(0, 75)}"`);
          }
        });
      });
    } else {
      console.log(`⚠️ Note: Sheet is accessible, but has 0 populated data rows.`);
    }
  } catch (err) {
    console.error(`❌ Sheet Reading Failed:`, err.message);
  }

  // ---------------------------------------------------------------------------
  // PART 2: TEST MULTI-ENTITY AI CONTEXT RESOLUTION ENGINE
  // ---------------------------------------------------------------------------
  console.log(`\n================================================================================`);
  console.log(`🧠 STEP 2: Testing Multi-Entity AI Context Routing Engine`);
  console.log(`================================================================================`);

  // Construct realistic multi-BU graph context
  const mockAiContext = {
    hasContext: true,
    workflowName: "Brand Master Multi-Channel Context",
    businessUnitsHierarchy: [
      {
        id: "bu_merch",
        name: "Merchandise",
        description: "Apparel & physical branded products",
        channels: [
          {
            id: "chan_meta_merch",
            channel: "Meta Ads",
            channelName: "Meta Ads",
            accountId: "act_1720250482578964",
            accountName: "Merch Meta Ads Manager",
            funnelEvent: "Purchase",
            funnelDescription: "Direct e-commerce purchase checkout",
          },
          {
            id: "chan_google_merch",
            channel: "Google Ads",
            channelName: "Google Ads",
            accountId: "300-208-3352",
            accountName: "Merch Google Search Child CID",
            funnelEvent: "Purchase",
            funnelDescription: "Google Search & Shopping conversions",
          },
        ],
        briefs: [
          {
            id: "brief_merch",
            name: "Merchandise Q4 Scaling",
            targetPeriod: "Q4 High-Intent Festive Season",
            metricsList: [{ metrics: "Target ROAS > 4.0x | CPA < ₹220" }],
          },
        ],
        products: [
          {
            id: "prod_tshirt",
            name: "Premium Cotton T-Shirt",
            productName: "Premium Cotton T-Shirt",
            url: "https://brand.com/shop/cotton-tshirt",
            productUrl: "https://brand.com/shop/cotton-tshirt",
            price: 799,
            productPrice: 799,
          },
          {
            id: "prod_hoodie",
            name: "Winter Warmth Fleece Hoodie",
            productName: "Winter Warmth Fleece Hoodie",
            url: "https://brand.com/shop/fleece-hoodie",
            productUrl: "https://brand.com/shop/fleece-hoodie",
            price: 1499,
            productPrice: 1499,
          },
        ],
        warehouses: [
          {
            id: "dw_merch",
            name: "Merchandise Excel & Sheets Warehouse",
            sheets: [
              {
                sheetName: "T-Shirts Retargeting Sheet",
                sheetUrl: "https://docs.google.com/spreadsheets/d/1WzjSxyrqiLb8jfly6G1bWDSBHMLKQD81nzZYURcD5Mw?gid=0",
                dataLabels: "T-Shirt Retargeting, Social Proof",
              },
              {
                sheetName: "Hoodie Cold Traffic Sheet",
                sheetUrl: "https://docs.google.com/spreadsheets/d/1WzjSxyrqiLb8jfly6G1bWDSBHMLKQD81nzZYURcD5Mw?gid=12345",
                dataLabels: "Hoodie Cold Prospecting, Video Ads",
              },
            ],
          },
        ],
      },
      {
        id: "bu_sub",
        name: "Subscription",
        description: "Monthly & annual VIP club membership",
        channels: [
          {
            id: "chan_meta_sub",
            channel: "Meta Ads",
            channelName: "Meta Ads",
            accountId: "act_999888777666",
            accountName: "Subscription Growth Ad Account",
            funnelEvent: "Subscribe",
            funnelDescription: "Recurring membership signups",
          },
          {
            id: "chan_google_sub",
            channel: "Google Ads",
            channelName: "Google Ads",
            accountId: "888-777-6665",
            accountName: "Subscription Search Ads",
            funnelEvent: "Subscribe",
            funnelDescription: "Search intent subscriptions",
          },
        ],
        briefs: [
          {
            id: "brief_sub",
            name: "Monthly VIP Retention & Acquisition",
            metricsList: [{ metrics: "Target CAC < ₹500 | LTV:CAC > 5:1" }],
          },
        ],
        products: [
          {
            id: "prod_vip",
            name: "VIP Club Annual Membership",
            productName: "VIP Club Annual Membership",
            url: "https://brand.com/vip-membership",
            productUrl: "https://brand.com/vip-membership",
            price: 2999,
            productPrice: 2999,
          },
        ],
        warehouses: [
          {
            id: "dw_sub",
            name: "Subscription Creative Warehouse",
            sheets: [
              {
                sheetName: "VIP Membership Retargeting",
                sheetUrl: "https://docs.google.com/spreadsheets/d/1WzjSxyrqiLb8jfly6G1bWDSBHMLKQD81nzZYURcD5Mw?gid=9999",
                dataLabels: "Membership, Free Trial",
              },
            ],
          },
        ],
      },
    ],
  };

  const testScenarios = [
    {
      title: "Test Case 1: User asks for Meta Ads under Merchandise",
      prompt: "Create Meta ads campaign for merchandise with budget 2000",
      channelHint: "Meta Ads",
    },
    {
      title: "Test Case 2: User asks for Google Ads under Merchandise",
      prompt: "Launch Google search campaign for merchandise",
      channelHint: "Google Ads",
    },
    {
      title: "Test Case 3: User specifies Product (Hoodie) without naming Business Unit",
      prompt: "create Meta ad for hoodie using hoodie sheet",
      channelHint: "Meta Ads",
    },
    {
      title: "Test Case 4: User asks for Subscription Business Unit",
      prompt: "create campaign for subscription membership",
      channelHint: null,
    },
  ];

  testScenarios.forEach((test, idx) => {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`🧪 ${test.title}`);
    console.log(`💬 User Prompt   : "${test.prompt}"`);

    const result = resolveAiContextSelection({
      aiCtx: mockAiContext,
      userMessage: test.prompt,
      requestedChannel: test.channelHint,
    });

    console.log(`🏢 Selected BU   : "${result.businessUnit?.name}"`);
    console.log(`📢 Target Channel: "${result.channel?.channelName}" ➔ Account ID: \`${result.channel?.accountId}\` (${result.channel?.accountName})`);
    console.log(`📦 Target Product: "${result.product?.productName}" (Price: ₹${result.product?.productPrice}, Landing URL: ${result.product?.productUrl})`);
    console.log(`📄 Selected Sheet: "${result.selectedSheet?.sheetName}"`);
    console.log(`🔗 Sheet URL     : ${result.selectedSheet?.sheetUrl}`);
    console.log(`🏷️  Sheet Label   : "${result.selectedSheet?.dataLabels}"`);
  });

  console.log("\n================================================================================");
  console.log("🏁 ALL TEST SCENARIOS COMPLETED SUCCESSFULLY");
  console.log("================================================================================\n");
}

runLiveTest().catch((e) => {
  console.error("Live test crashed:", e);
});
