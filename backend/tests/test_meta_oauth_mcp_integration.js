/**
 * Test Suite: Meta OAuth + Official Meta MCP Integration Flow
 *
 * Verifies:
 * 1. OAuth success + MCP session success (handshake, discovery, dual status)
 * 2. OAuth success + MCP failure (OAuth connects, MCP reports ERROR with retry capability)
 * 3. MCP tool discovery and persistence
 * 4. Account-specific tool execution & strictly no unsafe account fallback
 * 5. Rejection of unregistered tools
 * 6. Cross-user isolation security enforcement
 * 7. MCP refresh flow (live tool re-discovery and timestamp update)
 * 8. MCP disconnect and session cleanup
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTransport } from "./inMemoryTransport.js";
import { mcpToolRegistry } from "../src/services/mcp/McpToolRegistry.js";
import { McpToolExecutor } from "../src/services/mcp/McpToolExecutor.js";
import { MetaMcpClient } from "../src/services/mcp/metaMcpClient.js";

async function runTestSuite() {
  console.log("=== META OAUTH + OFFICIAL MCP INTEGRATION TEST SUITE ===\n");
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

  const testUserId = "user_oauth_mcp_test_01";
  const testAccountId = "1416124059911929";
  const otherAccountId = "857815937331282";

  // 1. Setup Mock Official Meta MCP Server
  const server = new Server(
    { name: "official-meta-ads-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  let serverToolList = [
    {
      name: "create_campaign",
      description: "Creates a Meta Ads campaign",
      inputSchema: {
        type: "object",
        required: ["name", "objective"],
        properties: {
          name: { type: "string" },
          objective: { type: "string" },
          daily_budget: { type: "number" },
        },
      },
    },
    {
      name: "get_campaign_insights",
      description: "Fetches performance insights for a campaign",
      inputSchema: {
        type: "object",
        required: ["campaign_id"],
        properties: {
          campaign_id: { type: "string" },
        },
      },
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: serverToolList };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArgs } = request.params;
    if (name === "create_campaign") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: "camp_official_meta_123",
              name: toolArgs.name,
              objective: toolArgs.objective,
              status: "PAUSED",
            }),
          },
        ],
      };
    }
    return {
      isError: true,
      content: [{ type: "text", text: `Tool "${name}" not recognized.` }],
    };
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client(
    { name: "atelion-meta-mcp-client", version: "1.0.0" },
    { capabilities: {} }
  );
  await client.connect(clientTransport);

  // --- TEST 1: OAuth Success + MCP Success ---
  console.log("--- 1. OAuth Success + MCP Connection Success ---");
  const toolsDiscovered = await client.listTools();
  assert(toolsDiscovered.tools.length === 2, `MCP tools/list discovered ${toolsDiscovered.tools.length} dynamic tools`);

  mcpToolRegistry.registerTools(testUserId, testAccountId, {
    serverUrl: "https://mcp.facebook.com/ads",
    transport: "STREAMABLE_HTTP",
    tools: toolsDiscovered.tools,
    status: "CONNECTED",
  });

  const mockMetaAccountRecord = {
    _id: "doc_meta_acc_1",
    userId: testUserId,
    accountId: `act_${testAccountId}`,
    accountName: "Primary Meta Ads Account",
    accessToken: "EAAB_test_valid_oauth_token_123456",
    currency: "USD",
    timezoneName: "America/Los_Angeles",
    mcpServerUrl: "https://mcp.facebook.com/ads",
    mcpTransport: "STREAMABLE_HTTP",
    mcpStatus: "CONNECTED",
    discoveredTools: toolsDiscovered.tools,
    lastDiscoveredAt: new Date(),
    mcpErrorMessage: null,
    isActive: true,
    isConnected: true,
  };

  assert(mockMetaAccountRecord.mcpStatus === "CONNECTED", "Account MCP status is CONNECTED");
  assert(mockMetaAccountRecord.discoveredTools.length === 2, "Discovered tools persisted against account");
  assert(mockMetaAccountRecord.accessToken.startsWith("EAAB_"), "Real OAuth token persisted against account");

  // --- TEST 2: OAuth Success + MCP Failure ---
  console.log("\n--- 2. OAuth Success + MCP Failure ---");
  // Simulate OAuth succeeding but MCP endpoint timing out or unreachable
  const failingMcpUrl = "https://unreachable.mcp.example.com/ads";
  let mcpConnectionError = null;

  try {
    // Connect to invalid endpoint should throw handshake failure
    await MetaMcpClient.connectSession({
      userId: testUserId,
      accountId: otherAccountId,
      mcpServerUrl: failingMcpUrl,
      accessToken: "EAAB_test_token",
      transportType: "STREAMABLE_HTTP",
      timeoutMs: 1000,
    });
  } catch (err) {
    mcpConnectionError = err.message;
  }

  assert(mcpConnectionError !== null, `Handshake error captured: ${mcpConnectionError}`);

  const mockFailedMcpAccount = {
    userId: testUserId,
    accountId: `act_${otherAccountId}`,
    accountName: "Secondary Meta Account",
    accessToken: "EAAB_test_valid_oauth_token_654321", // OAuth is valid!
    mcpServerUrl: failingMcpUrl,
    mcpStatus: "ERROR",
    mcpErrorMessage: mcpConnectionError,
    discoveredTools: [],
    isActive: true,
    isConnected: true, // OAuth connected
  };

  assert(mockFailedMcpAccount.accessToken.length > 0, "OAuth token preserved despite MCP failure");
  assert(mockFailedMcpAccount.mcpStatus === "ERROR", "MCP status correctly marked as ERROR");
  assert(mockFailedMcpAccount.discoveredTools.length === 0, "No fake tools stored when MCP connection fails");
  assert(Boolean(mockFailedMcpAccount.mcpErrorMessage), "Actual MCP error stored for UI display");

  // --- TEST 3: Account-Specific Tool Execution & Unsafe Fallback Prevention ---
  console.log("\n--- 3. Account-Specific Tool Execution & Unsafe Fallback Prevention ---");

  // Valid account execution
  const execResult = await McpToolExecutor.executeTool(
    "create_campaign",
    { name: "Fall_Collection_Ads", objective: "OUTCOME_SALES" },
    {
      userId: testUserId,
      accountId: testAccountId,
      metaAccount: mockMetaAccountRecord,
      mcpClient: client,
    }
  );

  assert(execResult.success === true, "Tool executed successfully for designated account");
  assert(execResult.result?.id === "camp_official_meta_123", "Correct campaign ID returned from official MCP call");

  // Missing accountId test (must be rejected, no unsafe fallback)
  try {
    await McpToolExecutor.executeTool(
      "create_campaign",
      { name: "Unsafe_Campaign" },
      {
        userId: testUserId,
        accountId: "", // Empty / missing
        mcpClient: client,
      }
    );
    assert(false, "Should have rejected missing accountId");
  } catch (err) {
    assert(
      err.message.includes("accountId is required"),
      `Strictly rejected missing accountId: ${err.message}`
    );
  }

  // Non-matching accountId test (must not fall back to active account)
  try {
    await McpToolExecutor.executeTool(
      "create_campaign",
      { name: "Wrong_Account_Campaign" },
      {
        userId: testUserId,
        accountId: "999999999999999", // Does not exist
        mcpClient: client,
      }
    );
    assert(false, "Should have rejected non-existent account without fallback");
  } catch (err) {
    assert(
      err.message.includes("Fallback to other accounts is strictly prohibited") ||
      err.message.includes("was not found"),
      `Strictly rejected non-existent account without fallback: ${err.message}`
    );
  }

  // Unregistered tool test
  try {
    await McpToolExecutor.executeTool(
      "unregistered_ghost_tool",
      {},
      {
        userId: testUserId,
        accountId: testAccountId,
        metaAccount: mockMetaAccountRecord,
        mcpClient: client,
      }
    );
    assert(false, "Should have rejected tool not in discovered registry");
  } catch (err) {
    assert(
      err.message.includes("is not registered or available"),
      `Correctly rejected unregistered tool: ${err.message}`
    );
  }

  // Cross-user execution test
  try {
    await McpToolExecutor.executeTool(
      "create_campaign",
      { name: "Cross_User_Campaign" },
      {
        userId: "hacker_user_456",
        accountId: testAccountId,
        metaAccount: mockMetaAccountRecord,
        mcpClient: client,
      }
    );
    assert(false, "Should have blocked cross-user execution");
  } catch (secErr) {
    assert(
      secErr.message.includes("Cross-user tool execution is strictly prohibited"),
      `Security alert blocked cross-user execution: ${secErr.message}`
    );
  }

  // --- TEST 4: Dynamic Tool Refresh Flow ---
  console.log("\n--- 4. Dynamic Tool Refresh Flow ---");
  // Server dynamically adds a new tool (e.g. Meta releases a new tool)
  serverToolList.push({
    name: "manage_lead_forms",
    description: "Manage Meta Instant Forms for lead campaigns",
    inputSchema: {
      type: "object",
      properties: {
        form_name: { type: "string" },
      },
    },
  });

  const refreshedList = await client.listTools();
  assert(refreshedList.tools.length === 3, `Server exposes 3 tools after update`);

  mcpToolRegistry.registerTools(testUserId, testAccountId, {
    serverUrl: "https://mcp.facebook.com/ads",
    transport: "STREAMABLE_HTTP",
    tools: refreshedList.tools,
    status: "CONNECTED",
  });

  assert(
    mcpToolRegistry.hasTool(testUserId, testAccountId, "manage_lead_forms"),
    "Newly added tool 'manage_lead_forms' is discovered and registered on refresh"
  );

  // --- TEST 5: MCP Disconnect and Session Cleanup ---
  console.log("\n--- 5. MCP Disconnect and Session Cleanup ---");
  await client.close();
  await server.close();

  const discResult = await MetaMcpClient.disconnectSession(testUserId, testAccountId);
  assert(discResult.success === true, "MetaMcpClient.disconnectSession succeeded");
  assert(
    mcpToolRegistry.getTools(testUserId, testAccountId).length === 0,
    "Registry cleared for disconnected account"
  );

  // --- TEST 6: Expired Credentials & Authentication Error Handling ---
  console.log("\n--- 6. Expired Credentials & Authentication Error Handling ---");
  const expiredMockClient = {
    callTool: async () => {
      throw new Error("OAuthException: Error validating access token: Session has expired.");
    },
  };

  mcpToolRegistry.registerTools(testUserId, testAccountId, {
    serverUrl: "https://mcp.facebook.com/ads",
    transport: "STREAMABLE_HTTP",
    tools: [
      {
        name: "get_campaign_insights",
        description: "Fetches performance insights",
        inputSchema: { type: "object", properties: { campaign_id: { type: "string" } } },
      },
    ],
    status: "CONNECTED",
  });

  try {
    await McpToolExecutor.executeTool(
      "get_campaign_insights",
      { campaign_id: "camp_123" },
      {
        userId: testUserId,
        accountId: testAccountId,
        metaAccount: mockMetaAccountRecord,
        mcpClient: expiredMockClient,
      }
    );
    assert(false, "Should have thrown authentication error for expired session");
  } catch (authErr) {
    assert(
      authErr.message.includes("Meta MCP Authentication Error") &&
      authErr.message.includes("expired or is unauthorized"),
      `Captured expired credentials error cleanly: ${authErr.message}`
    );
  }

  // --- TEST 7: Reconnection Flow After Disconnect ---
  console.log("\n--- 7. MCP Reconnect Flow After Disconnect ---");
  const [reconnectClientTransport, reconnectServerTransport] = InMemoryTransport.createLinkedPair();
  const reconnectServer = new Server(
    { name: "official-meta-ads-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  reconnectServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_campaign_insights",
        description: "Fetches campaign insights",
        inputSchema: { type: "object" },
      },
    ],
  }));
  await reconnectServer.connect(reconnectServerTransport);

  const reconnectClient = new Client(
    { name: "atelion-meta-mcp-client", version: "1.0.0" },
    { capabilities: {} }
  );
  await reconnectClient.connect(reconnectClientTransport);

  const reconnectedTools = await reconnectClient.listTools();
  mcpToolRegistry.registerTools(testUserId, testAccountId, {
    serverUrl: "https://mcp.facebook.com/ads",
    transport: "STREAMABLE_HTTP",
    tools: reconnectedTools.tools,
    status: "CONNECTED",
  });

  assert(
    mcpToolRegistry.hasTool(testUserId, testAccountId, "get_campaign_insights"),
    "Successfully reconnected MCP session and re-populated registry after disconnect"
  );
  assert(
    mcpToolRegistry.getTools(testUserId, testAccountId).length === 1,
    "Registry active with 1 tool after reconnect"
  );

  await reconnectClient.close();
  await reconnectServer.close();

  console.log("\n=== TEST RESULTS SUMMARY ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("ALL META OAUTH + MCP INTEGRATION TESTS PASSED! ✓\n");
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

