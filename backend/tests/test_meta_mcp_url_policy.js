// backend/tests/test_meta_mcp_url_policy.js
import assert from "node:assert";
import {
  OFFICIAL_META_MCP_ENDPOINT,
  getOfficialMetaMcpEndpoint,
  isLocalhostOrPrivateUrl,
  resolveOfficialMetaMcpUrl,
  resolveMetaMcpTransport,
} from "../src/services/mcp/metaMcpConfig.js";
import { MetaMcpClient } from "../src/services/mcp/metaMcpClient.js";
import mcpToolRegistry from "../src/services/mcp/McpToolRegistry.js";

console.log("=== META MCP URL POLICY & SANITIZATION TEST SUITE ===\n");

// 1. isLocalhostOrPrivateUrl Detection
console.log("--- 1. Localhost and Stale URL Detection ---");
assert.strictEqual(isLocalhostOrPrivateUrl("http://localhost:8000/sse"), true, "Detects localhost:8000/sse");
assert.strictEqual(isLocalhostOrPrivateUrl("http://127.0.0.1:8000/sse"), true, "Detects 127.0.0.1:8000/sse");
assert.strictEqual(isLocalhostOrPrivateUrl("localhost:8000"), true, "Detects raw localhost:8000");
assert.strictEqual(isLocalhostOrPrivateUrl("http://0.0.0.0:8000/sse"), true, "Detects 0.0.0.0");
assert.strictEqual(isLocalhostOrPrivateUrl("http://localhost:3000"), true, "Detects http://localhost:3000");
assert.strictEqual(isLocalhostOrPrivateUrl("https://example.com/sse"), true, "Detects legacy /sse path");
assert.strictEqual(isLocalhostOrPrivateUrl("https://mcp.facebook.com/ads"), false, "Official endpoint is not localhost");
console.log("  ✓ All localhost and stale /sse variants correctly identified");

// 2. resolveOfficialMetaMcpUrl Overrides
console.log("\n--- 2. Centralized URL Resolution & Overrides ---");
const testCases = [
  { input: "http://localhost:8000/sse", expected: OFFICIAL_META_MCP_ENDPOINT },
  { input: "http://127.0.0.1:8000/sse", expected: OFFICIAL_META_MCP_ENDPOINT },
  { input: "http://localhost:3000", expected: OFFICIAL_META_MCP_ENDPOINT },
  { input: "", expected: OFFICIAL_META_MCP_ENDPOINT },
  { input: null, expected: OFFICIAL_META_MCP_ENDPOINT },
  { input: undefined, expected: OFFICIAL_META_MCP_ENDPOINT },
  { input: "   ", expected: OFFICIAL_META_MCP_ENDPOINT },
  { input: "https://mcp.facebook.com/ads", expected: "https://mcp.facebook.com/ads" },
  { input: "https://custom-proxy.internal.net/meta-ads", expected: "https://custom-proxy.internal.net/meta-ads" },
];

for (const tc of testCases) {
  const resolved = resolveOfficialMetaMcpUrl(tc.input, { accountId: "act_354818122576852" });
  assert.strictEqual(resolved, tc.expected, `Expected "${tc.input}" to resolve to "${tc.expected}", got "${resolved}"`);
}
console.log("  ✓ Stale localhost and empty URLs strictly overridden with official endpoint");

// 3. Transport Resolution
console.log("\n--- 3. Transport Resolution for Official Meta MCP ---");
assert.strictEqual(resolveMetaMcpTransport("https://mcp.facebook.com/ads", "SSE"), "STREAMABLE_HTTP");
assert.strictEqual(resolveMetaMcpTransport("https://mcp.facebook.com/ads", "STREAMABLE_HTTP"), "STREAMABLE_HTTP");
assert.strictEqual(resolveMetaMcpTransport("https://mcp.facebook.com/ads", ""), "STREAMABLE_HTTP");
assert.strictEqual(resolveMetaMcpTransport("https://mcp.facebook.com/ads", "STDIO"), "STDIO");
assert.strictEqual(resolveMetaMcpTransport("http://localhost:8000/sse", "SSE"), "STREAMABLE_HTTP");
console.log("  ✓ Transport normalized to STREAMABLE_HTTP for official endpoint");

// 4. Registry Sanitization
console.log("\n--- 4. McpToolRegistry Sanitization ---");
mcpToolRegistry.registerTools("user_test_url_01", "act_354818122576852", {
  serverUrl: "http://localhost:8000/sse",
  transport: "SSE",
  tools: [{ name: "get_campaigns", description: "Fetch campaigns" }],
});
const reg = mcpToolRegistry.getRegistryDetails("user_test_url_01", "act_354818122576852");
assert.strictEqual(reg.serverUrl, OFFICIAL_META_MCP_ENDPOINT, "Registry serverUrl overridden to official endpoint");
assert.strictEqual(reg.transport, "STREAMABLE_HTTP", "Registry transport normalized to STREAMABLE_HTTP");
console.log("  ✓ McpToolRegistry sanitizes serverUrl and transport on registration");

// 5. MetaMcpClient Static Delegates
console.log("\n--- 5. MetaMcpClient Static Delegates ---");
assert.strictEqual(MetaMcpClient.resolveOfficialMcpUrl("http://localhost:8000/sse"), OFFICIAL_META_MCP_ENDPOINT);
assert.strictEqual(MetaMcpClient.resolveTransport("https://mcp.facebook.com/ads"), "STREAMABLE_HTTP");
console.log("  ✓ MetaMcpClient exposes static URL resolver methods");

console.log("\n=== ALL META MCP URL POLICY TESTS PASSED! ✓ ===");
