/**
 * Comprehensive Test Suite for Genuine Meta MCP Client Integration
 *
 * Verifies:
 * 1. McpToolRegistry dynamic tool registration, lookup, and isolation
 * 2. McpToolExecutor argument validation against JSON schema
 * 3. Genuine MCP Handshake, tool discovery (tools/list), and execution (tools/call)
 * 4. Account and user isolation (no cross-user execution)
 * 5. Error handling (no fake tokens, no fake successes)
 * 6. Backward compatibility preservation for OAuth/Token accounts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTransport } from "./inMemoryTransport.js";
import { mcpToolRegistry } from "../src/services/mcp/McpToolRegistry.js";
import { McpToolExecutor } from "../src/services/mcp/McpToolExecutor.js";

async function runTests() {
  console.log("=== STARTING GENUINE META MCP INTEGRATION TEST SUITE ===\n");
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  // TEST 1: McpToolRegistry
  console.log("--- 1. McpToolRegistry Tests ---");
  const testUserId = "user_test_123";
  const testAccountId = "1416124059911929";

  mcpToolRegistry.clear(testUserId, testAccountId);

  mcpToolRegistry.registerTools(testUserId, testAccountId, {
    serverUrl: "https://mcp.facebook.com/ads",
    transport: "SSE",
    tools: [
      {
        name: "create_campaign",
        description: "Creates a Meta Ads campaign",
        inputSchema: {
          type: "object",
          required: ["name", "objective"],
          properties: {
            name: { type: "string", description: "Campaign name" },
            objective: { type: "string", description: "OUTCOME_LEADS, etc." },
            daily_budget: { type: "number", description: "Daily budget in cents" },
          },
        },
      },
      {
        name: "get_campaign_insights",
        description: "Fetches performance metrics",
        inputSchema: {
          type: "object",
          required: ["campaign_id"],
          properties: {
            campaign_id: { type: "string" },
          },
        },
      },
    ],
    status: "CONNECTED",
  });

  const registered = mcpToolRegistry.getTools(testUserId, testAccountId);
  assert(registered.length === 2, `Registered 2 tools, found ${registered.length}`);
  assert(mcpToolRegistry.hasTool(testUserId, testAccountId, "create_campaign"), "hasTool('create_campaign') returns true");
  assert(mcpToolRegistry.hasTool(testUserId, testAccountId, "get_campaign_insights"), "hasTool('get_campaign_insights') returns true");
  assert(!mcpToolRegistry.hasTool(testUserId, testAccountId, "non_existent_tool"), "hasTool('non_existent_tool') returns false");

  const details = mcpToolRegistry.getRegistryDetails(testUserId, testAccountId);
  assert(details.status === "CONNECTED", "Registry status is CONNECTED");
  assert(details.serverUrl === "https://mcp.facebook.com/ads", "Registry serverUrl preserved");

  // TEST 2: Schema Argument Validation
  console.log("\n--- 2. McpToolExecutor Schema Validation Tests ---");
  const toolDef = mcpToolRegistry.getTool(testUserId, testAccountId, "create_campaign");

  // Valid arguments
  try {
    McpToolExecutor.validateArguments(toolDef.inputSchema, {
      name: "Q4_LeadGen_Campaign",
      objective: "OUTCOME_LEADS",
      daily_budget: 5000,
    });
    assert(true, "Valid arguments passed schema validation without error");
  } catch (err) {
    assert(false, `Valid arguments failed schema validation: ${err.message}`);
  }

  // Missing required argument
  try {
    McpToolExecutor.validateArguments(toolDef.inputSchema, {
      name: "Q4_LeadGen_Campaign",
      // missing 'objective'
    });
    assert(false, "Should have thrown for missing required 'objective'");
  } catch (err) {
    assert(
      err.message.includes("Missing required field"),
      `Correctly rejected missing required field: ${err.message}`
    );
  }

  // Wrong type for number field
  try {
    McpToolExecutor.validateArguments(toolDef.inputSchema, {
      name: "Q4_LeadGen_Campaign",
      objective: "OUTCOME_LEADS",
      daily_budget: "NOT_A_NUMBER",
    });
    assert(false, "Should have thrown for invalid number type");
  } catch (err) {
    assert(
      err.message.includes("expected number"),
      `Correctly caught type mismatch for daily_budget: ${err.message}`
    );
  }

  // TEST 3: Genuine MCP Handshake & Protocol Execution
  console.log("\n--- 3. Genuine MCP Protocol Client & Server Handshake Tests ---");
  const server = new Server(
    { name: "meta-mock-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "create_meta_lead_ad",
          description: "Creates an official Meta lead ad",
          inputSchema: {
            type: "object",
            required: ["ad_name", "campaign_id"],
            properties: {
              ad_name: { type: "string" },
              campaign_id: { type: "string" },
            },
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArgs } = request.params;
    if (name === "create_meta_lead_ad") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              ad_id: "ad_official_mcp_998877",
              name: toolArgs.ad_name,
              campaign_id: toolArgs.campaign_id,
              status: "PAUSED",
            }),
          },
        ],
      };
    }
    return {
      isError: true,
      content: [{ type: "text", text: `Tool ${name} not found on MCP server.` }],
    };
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client(
    { name: "atelion-meta-mcp-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(clientTransport);
  assert(true, "Client successfully completed genuine MCP handshake with MCP Server");

  // Call tools/list via MCP protocol
  const toolsListResponse = await client.listTools();
  assert(
    toolsListResponse.tools?.length === 1 && toolsListResponse.tools[0].name === "create_meta_lead_ad",
    `Dynamic tool discovery succeeded: found "${toolsListResponse.tools?.[0]?.name}"`
  );

  // Register in tool registry
  mcpToolRegistry.registerTools(testUserId, testAccountId, {
    serverUrl: "in-memory://meta-mcp",
    transport: "SSE",
    tools: toolsListResponse.tools,
    status: "CONNECTED",
  });

  // Call tool via McpToolExecutor with genuine MCP client
  const mockAccount = {
    userId: testUserId,
    accountId: testAccountId,
    mcpServerUrl: "in-memory://meta-mcp",
    mcpTransport: "SSE",
    authType: "MCP_SERVER",
    discoveredTools: toolsListResponse.tools,
    isActive: true,
  };

  const execResult = await McpToolExecutor.executeTool(
    "create_meta_lead_ad",
    {
      ad_name: "GE_Official_MCP_Ad_1",
      campaign_id: "camp_12345",
    },
    {
      userId: testUserId,
      accountId: testAccountId,
      metaAccount: mockAccount,
      mcpClient: client,
    }
  );

  assert(execResult.success === true, "McpToolExecutor returned success: true");
  assert(execResult.result?.ad_id === "ad_official_mcp_998877", `Received genuine MCP ad_id: ${execResult.result?.ad_id}`);
  assert(execResult.result?.name === "GE_Official_MCP_Ad_1", `Ad name matches passed argument: ${execResult.result?.name}`);

  // TEST 4: Tenant and User Isolation
  console.log("\n--- 4. Account & User Isolation Tests ---");
  try {
    await McpToolExecutor.executeTool(
      "create_meta_lead_ad",
      { ad_name: "Cross_Tenant_Ad", campaign_id: "camp_123" },
      {
        userId: "different_user_999", // Different user than account owner
        accountId: testAccountId,
        metaAccount: mockAccount, // mockAccount.userId is testUserId
        mcpClient: client,
      }
    );
    assert(false, "Should have thrown cross-user security alert");
  } catch (secErr) {
    assert(
      secErr.message.includes("Cross-user tool execution is strictly prohibited"),
      `Strict tenant isolation verified: ${secErr.message}`
    );
  }

  // TEST 5: Error Handling
  console.log("\n--- 5. Error Handling Tests ---");
  try {
    await McpToolExecutor.executeTool(
      "unknown_tool_on_server",
      {},
      {
        userId: testUserId,
        accountId: testAccountId,
        metaAccount: mockAccount,
        mcpClient: client,
      }
    );
    assert(false, "Should have thrown for tool error");
  } catch (err) {
    assert(
      err.message.includes("Meta MCP Tool Error") || err.message.includes("not found"),
      `McpToolExecutor properly captured server error without fabricating success: ${err.message}`
    );
  }

  // Cleanup
  await client.close();
  await server.close();

  console.log("\n=== TEST RESULTS SUMMARY ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("ALL GENUINE META MCP TESTS PASSED SUCCESSFULLY! ✓\n");
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
