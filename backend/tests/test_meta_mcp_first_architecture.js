/**
 * test_meta_mcp_first_architecture.js
 *
 * Comprehensive Automated Test Suite verifying the Official Meta Ads MCP-First Architecture:
 * 1. get_live_campaigns_status fetches live campaigns & adsets via MCP without MetaApiService.getCampaignAdSets
 * 2. get_live_adset_ads fetches and filters ads via MCP
 * 3. get_live_campaign_insights aggregates metrics via MCP
 * 4. aiAgentOrchestrator planIntent classifies Hindi/English campaign search queries
 * 5. Strict rejection with clear error when MCP is disconnected
 * 6. McpExecutionLogger scrubs sensitive tokens and records structured audit logs
 */

import assert from "assert";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import mcpToolRegistry from "../src/services/mcp/McpToolRegistry.js";
import { McpToolExecutor } from "../src/services/mcp/McpToolExecutor.js";
import { MetaMcpClient } from "../src/services/mcp/metaMcpClient.js";
import { McpExecutionLogger } from "../src/services/mcp/McpExecutionLogger.js";
import AiAgentOrchestrator from "../src/services/agent/aiAgentOrchestrator.js";

let passedCount = 0;
let failedCount = 0;

function assertTest(desc, fn) {
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${desc}: ${err.message}`);
    failedCount++;
  }
}

async function runTests() {
  console.log("=== OFFICIAL META ADS MCP-FIRST ARCHITECTURE TEST SUITE ===\n");

  const userId = "user_mcp_first_arch_01";
  const cleanAccountId = "517557233790148";
  const accountId = `act_${cleanAccountId}`;

  // 1. Setup Mock Meta MCP Server with official tools
  const server = new Server(
    { name: "meta-official-ads-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  const mockCampaigns = [
    {
      id: "120205847291010",
      name: "Summer Lead Gen 2026",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      objective: "OUTCOME_LEADS",
      created_time: "2026-06-01T10:00:00+0000",
    },
  ];

  const mockAdSets = [
    {
      id: "120205847291020",
      campaign_id: "120205847291010",
      name: "Open Targeting AdSet",
      status: "ACTIVE",
      effective_status: "ACTIVE",
    },
  ];

  const mockAds = [
    {
      id: "120205847291030",
      adset_id: "120205847291020",
      name: "Ad Creative 01",
      status: "ACTIVE",
      effective_status: "ACTIVE",
    },
  ];

  const mockInsights = [
    {
      spend: "1250.50",
      impressions: "45000",
      clicks: "1350",
      actions: [{ action_type: "lead", value: "85" }],
      action_values: [{ action_type: "lead", value: "4250.00" }],
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_campaigns",
        description: "Fetch campaigns from Meta Ads account",
        inputSchema: { type: "object", properties: { account_id: { type: "string" } } },
      },
      {
        name: "get_ad_sets",
        description: "Fetch ad sets from Meta Ads account",
        inputSchema: { type: "object", properties: { account_id: { type: "string" } } },
      },
      {
        name: "get_ads",
        description: "Fetch ads from Meta Ads account",
        inputSchema: { type: "object", properties: { account_id: { type: "string" } } },
      },
      {
        name: "get_ad_account_insights",
        description: "Fetch insights for Meta Ads account",
        inputSchema: { type: "object", properties: { account_id: { type: "string" }, date_preset: { type: "string" } } },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name } = req.params;
    if (name === "get_campaigns") {
      return { content: [{ type: "text", text: JSON.stringify(mockCampaigns) }] };
    }
    if (name === "get_ad_sets") {
      return { content: [{ type: "text", text: JSON.stringify(mockAdSets) }] };
    }
    if (name === "get_ads") {
      return { content: [{ type: "text", text: JSON.stringify(mockAds) }] };
    }
    if (name === "get_ad_account_insights") {
      return { content: [{ type: "text", text: JSON.stringify(mockInsights) }] };
    }
    throw new Error(`Tool ${name} not implemented`);
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client(
    { name: "atelion-test-client", version: "1.0.0" },
    { capabilities: {} }
  );
  await client.connect(clientTransport);

  // Discover and register tools in dynamic registry
  const discovered = await client.listTools();
  mcpToolRegistry.registerTools(userId, cleanAccountId, {
    serverUrl: "https://mcp.facebook.com/ads",
    transport: "STREAMABLE_HTTP",
    tools: discovered.tools,
    status: "CONNECTED",
  });

  const mockMetaAccount = {
    userId,
    accountId: cleanAccountId,
    accountName: "Test Marketing Account",
    mcpStatus: "CONNECTED",
    mcpServerUrl: "https://mcp.facebook.com/ads",
    discoveredTools: discovered.tools,
  };

  // Inject client into session cache
  const clientKey = `${userId}_${cleanAccountId}`;
  // @ts-ignore
  const activeClients = (await import("../src/services/mcp/metaMcpClient.js")).MetaMcpClient;

  // --- 1. Test get_live_campaigns_status ---
  console.log("--- 1. get_live_campaigns_status via Official Meta MCP ---");
  try {
    const statusResult = await MetaMcpClient.executeLiveTool("get_live_campaigns_status", {
      userId,
      accountId: cleanAccountId,
      metaAccount: mockMetaAccount,
      mcpClient: client,
    });

    assertTest("statusResult reports LIVE_DATA_FROM_META_MCP status", () => {
      assert.strictEqual(statusResult.status, "LIVE_DATA_FROM_META_MCP");
    });

    assertTest("statusResult reports OFFICIAL_META_MCP source", () => {
      assert.strictEqual(statusResult.source, "OFFICIAL_META_MCP");
    });

    assertTest("statusResult contains correct accountId", () => {
      assert.strictEqual(statusResult.accountId, accountId);
    });

    assertTest("totalCampaignsReturned and totalAdSetsReturned match count", () => {
      assert.strictEqual(statusResult.totalCampaignsReturned, 1);
      assert.strictEqual(statusResult.totalAdSetsReturned, 1);
    });

    assertTest("Ad sets are nested under parent campaign by campaign_id", () => {
      const camp = statusResult.campaigns[0];
      assert.strictEqual(camp.id, "120205847291010");
      assert.strictEqual(camp.name, "Summer Lead Gen 2026");
      assert.strictEqual(camp.status, "ACTIVE");
      assert.strictEqual(camp.totalAdSets, 1);
      assert.strictEqual(camp.adSets[0].id, "120205847291020");
      assert.strictEqual(camp.adSets[0].name, "Open Targeting AdSet");
    });
  } catch (err) {
    console.error("  ✗ get_live_campaigns_status error:", err.message);
    failedCount++;
  }

  // --- 2. Test get_live_adset_ads ---
  console.log("\n--- 2. get_live_adset_ads via Official Meta MCP ---");
  try {
    const adsResult = await MetaMcpClient.executeLiveTool("get_live_adset_ads", {
      userId,
      accountId: cleanAccountId,
      adSetId: "120205847291020",
      metaAccount: mockMetaAccount,
      mcpClient: client,
    });

    assertTest("adsResult reports LIVE_DATA_FROM_META_MCP", () => {
      assert.strictEqual(adsResult.status, "LIVE_DATA_FROM_META_MCP");
    });

    assertTest("adsResult returns ads array matching adSetId filter", () => {
      assert.strictEqual(adsResult.totalAds, 1);
      assert.strictEqual(adsResult.ads[0].id, "120205847291030");
      assert.strictEqual(adsResult.ads[0].name, "Ad Creative 01");
    });
  } catch (err) {
    console.error("  ✗ get_live_adset_ads error:", err.message);
    failedCount++;
  }

  // --- 3. Test get_live_campaign_insights ---
  console.log("\n--- 3. get_live_campaign_insights via Official Meta MCP ---");
  try {
    const insightsResult = await MetaMcpClient.executeLiveTool("get_live_campaign_insights", {
      userId,
      accountId: cleanAccountId,
      datePreset: "last_7d",
      metaAccount: mockMetaAccount,
      mcpClient: client,
    });

    assertTest("insightsResult reports LIVE_DATA_FROM_META_MCP", () => {
      assert.strictEqual(insightsResult.status, "LIVE_DATA_FROM_META_MCP");
    });

    assertTest("insightsResult aggregates spend, clicks, conversions accurately", () => {
      assert.strictEqual(insightsResult.summary.spend, 1250.5);
      assert.strictEqual(insightsResult.summary.impressions, 45000);
      assert.strictEqual(insightsResult.summary.clicks, 1350);
      assert.strictEqual(insightsResult.summary.conversions, 85);
      assert.strictEqual(insightsResult.summary.ctr, 3);
    });
  } catch (err) {
    console.error("  ✗ get_live_campaign_insights error:", err.message);
    failedCount++;
  }

  // --- 4. Intent Classification for Campaign Fetch Prompts ---
  console.log("\n--- 4. Intent Classification for English and Hinglish Prompts ---");
  const testPrompts = [
    { text: "this connected account latest campaign name fetch karo", expected: "META_CAMPAIGN_SEARCH" },
    { text: "Fetch the latest campaign name for my connected Meta account", expected: "META_CAMPAIGN_SEARCH" },
    { text: "Show live Meta campaigns and adsets status", expected: "META_CAMPAIGN_SEARCH" },
    { text: "is connected account ki latest campaign batao", expected: "META_CAMPAIGN_SEARCH" },
  ];

  for (const item of testPrompts) {
    const plan = AiAgentOrchestrator.planIntent({ instruction: item.text });
    assertTest(`Classifies '${item.text}' as ${item.expected}`, () => {
      assert.strictEqual(plan.intent, item.expected);
      assert.ok(plan.tools.includes("get_live_campaigns_status"));
    });
  }

  // --- 5. Strict Rejection When Disconnected ---
  console.log("\n--- 5. Strict Rejection When MCP Is Disconnected (Zero Graph API Fallback) ---");
  const disconnectedMetaAccount = {
    userId,
    accountId: "999888777",
    mcpStatus: "DISCONNECTED",
    discoveredTools: [],
  };

  try {
    await MetaMcpClient.executeLiveTool("get_live_campaigns_status", {
      userId,
      accountId: "999888777",
      metaAccount: disconnectedMetaAccount,
    });
    console.error("  ✗ Expected error when MCP disconnected, but call succeeded");
    failedCount++;
  } catch (err) {
    assertTest("Refuses execution and throws Meta MCP Disconnected Error", () => {
      assert.ok(err.message.includes("Meta MCP Disconnected Error"));
    });
  }

  // --- 6. Structured Execution Logger Audit ---
  console.log("\n--- 6. McpExecutionLogger Token Scrubbing and Structured Audit ---");
  const sensitiveArgs = {
    account_id: "act_517557233790148",
    access_token: "EAAB_super_secret_token_12345",
    campaign_name: "Test Campaign",
  };

  const sanitized = McpExecutionLogger.sanitize(sensitiveArgs);
  assertTest("Sanitizes sensitive access_token without touching campaign_name", () => {
    assert.strictEqual(sanitized.access_token, "[REDACTED]");
    assert.strictEqual(sanitized.campaign_name, "Test Campaign");
  });

  const auditLog = await McpExecutionLogger.logExecution({
    userId,
    accountId: cleanAccountId,
    provider: "META",
    executionSource: "OFFICIAL_META_MCP",
    toolName: "get_campaigns",
    status: "SUCCESS",
    durationMs: 45,
    args: sensitiveArgs,
  });

  assertTest("Execution log records structured metadata with scrubbed token", () => {
    assert.strictEqual(auditLog.provider, "META");
    assert.strictEqual(auditLog.executionSource, "OFFICIAL_META_MCP");
    assert.strictEqual(auditLog.status, "SUCCESS");
    assert.strictEqual(auditLog.args.access_token, "[REDACTED]");
  });

  console.log(`\n=== TEST RESULTS SUMMARY ===`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);

  if (failedCount > 0) {
    process.exit(1);
  } else {
    console.log("ALL OFFICIAL META ADS MCP-FIRST TESTS PASSED! ✓\n");
  }
}

runTests().catch((e) => {
  console.error("Test Suite Unhandled Rejection:", e);
  process.exit(1);
});
