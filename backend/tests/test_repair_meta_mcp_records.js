// backend/tests/test_repair_meta_mcp_records.js
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import {
  TARGET_SPEC,
  OFFICIAL_URL,
  OFFICIAL_TRANSPORT,
  buildMetaAccountQuery,
  buildConnectedChannelQuery,
  validateRecords,
  createBackupSnapshot,
  repairRecords,
  rollbackRecords,
} from "../scripts/repair_meta_mcp_records.js";

console.log("=== TARGETED MIGRATION & REPAIR SAFETY TEST SUITE ===\n");

// Helper to create mock documents strictly conforming to TARGET_SPEC
function createMockValidState() {
  const metaAccounts = [
    {
      _id: "6ae9de894fe651d3cd1665db",
      userId: "6ae9de17b8639ff489f5a9da",
      accountId: "act_354818122576852",
      accountName: "Meta Account 1",
      isConnected: true,
      isActive: true,
      accessToken: "EAAB_secret_token_1",
      mcpServerUrl: "http://localhost:8000/sse",
      mcpTransport: "STREAMABLE_HTTP",
      mcpStatus: "DISCONNECTED",
      mcpErrorMessage: "Request to http://localhost:8000/sse failed: ECONNREFUSED",
    },
    {
      _id: "6ae9de894fe651d3cd1665dd",
      userId: "6ae9de17b8639ff489f5a9da",
      accountId: "act_517557233790148",
      accountName: "Meta Account 2",
      isConnected: false,
      isActive: true,
      accessToken: "",
      mcpServerUrl: "http://localhost:8000/sse",
      mcpTransport: "STREAMABLE_HTTP",
      mcpStatus: "DISCONNECTED",
      mcpErrorMessage: "connect ECONNREFUSED 127.0.0.1:8000",
    },
  ];

  const connectedChannels = [
    {
      _id: "6af2fb85be3220764fb3e284",
      userId: "6ae9de17b8639ff489f5a9da",
      channelId: "meta",
      accountId: "act_354818122576852",
      accountName: "Meta Ads 1",
      isConnected: true,
      accessToken: "EAAB_secret_token_1",
      config: {
        mcpServerUrl: "http://localhost:8000/sse",
        mcpErrorMessage: "fetch failed (ECONNREFUSED)",
      },
    },
    {
      _id: "6af2fb86be3220764fb3e285",
      userId: "6ae9de17b8639ff489f5a9da",
      channelId: "meta",
      accountId: "act_517557233790148",
      accountName: "Meta Ads 2",
      isConnected: false,
      accessToken: "",
      config: {
        mcpServerUrl: "http://localhost:8000/sse",
      },
    },
  ];

  return { metaAccounts, connectedChannels };
}

// 1. Query Construction Isolation
console.log("--- 1. Query Construction & Scoping Isolation ---");
const metaQ = buildMetaAccountQuery(TARGET_SPEC);
assert.deepStrictEqual(
  metaQ._id.$in.map((id) => id.toString()),
  ["6ae9de894fe651d3cd1665db", "6ae9de894fe651d3cd1665dd"],
  "MetaAccount query strictly matches exact 2 document IDs only"
);
assert.strictEqual(metaQ.$or, undefined, "No broad $or clause permitted");

const channelQ = buildConnectedChannelQuery(TARGET_SPEC);
assert.deepStrictEqual(
  channelQ._id.$in.map((id) => id.toString()),
  ["6af2fb85be3220764fb3e284", "6af2fb86be3220764fb3e285"],
  "ConnectedChannel query strictly matches exact 2 document IDs only"
);
assert.strictEqual(channelQ.$or, undefined, "No broad $or clause permitted");
console.log("  ✓ Queries strictly isolated to exact document IDs without broad $or fallbacks");

// 2. Exact Validation Rules
console.log("\n--- 2. Document Validation & Abort Conditions ---");
const { metaAccounts: validMeta, connectedChannels: validChannels } = createMockValidState();
assert.doesNotThrow(() => validateRecords(validMeta, validChannels, TARGET_SPEC), "Valid documents pass validation");

// 2a. Extra document abort
const extraMeta = [...validMeta, { _id: "6ae9de894fe651d3cd1665df", userId: TARGET_SPEC.userId, accountId: "act_999" }];
assert.throws(
  () => validateRecords(extraMeta, validChannels, TARGET_SPEC),
  /expected exactly 2 documents/i,
  "Aborts if extra MetaAccount document is matched"
);

// 2b. Missing document abort
const missingMeta = [validMeta[0]];
assert.throws(
  () => validateRecords(missingMeta, validChannels, TARGET_SPEC),
  /expected exactly 2 documents/i,
  "Aborts if fewer than 2 MetaAccount documents matched"
);

// 2c. Wrong userId abort
const wrongUserMeta = [
  { ...validMeta[0], userId: "6bf999999999999999999999" },
  validMeta[1],
];
assert.throws(
  () => validateRecords(wrongUserMeta, validChannels, TARGET_SPEC),
  /Ownership validation failed for MetaAccount/i,
  "Aborts if userId does not match expected user"
);

// 2d. Wrong accountId abort
const wrongAccMeta = [
  { ...validMeta[0], accountId: "act_unauthorized_account" },
  validMeta[1],
];
assert.throws(
  () => validateRecords(wrongAccMeta, validChannels, TARGET_SPEC),
  /Account validation failed for MetaAccount/i,
  "Aborts if accountId does not match expected account"
);

// 2e. Wrong channelId abort for ConnectedChannel
const wrongChan = [
  { ...validChannels[0], channelId: "google" },
  validChannels[1],
];
assert.throws(
  () => validateRecords(validMeta, wrongChan, TARGET_SPEC),
  /Channel validation failed for ConnectedChannel/i,
  "Aborts if channelId is not meta"
);
console.log("  ✓ All validation barriers (extra docs, missing docs, wrong user, wrong account, wrong channel) abort cleanly");

// 3. Snapshot Backup & Token Sanitization
console.log("\n--- 3. Snapshot Backup & Token Sanitization ---");
const snapshot = createBackupSnapshot(validMeta, validChannels, TARGET_SPEC);
assert.strictEqual(snapshot.metaAccounts.length, 2);
assert.strictEqual(snapshot.connectedChannels.length, 2);
assert.strictEqual(snapshot.metaAccounts[0].isConnected, true);
assert.strictEqual(snapshot.metaAccounts[1].isConnected, false);
assert.strictEqual(snapshot.connectedChannels[0].isConnected, true);
assert.strictEqual(snapshot.connectedChannels[1].isConnected, false);
// Verify no access token is recorded in backup
assert.strictEqual(snapshot.metaAccounts[0].accessToken, undefined, "Token omitted from backup");
assert.strictEqual(snapshot.connectedChannels[0].accessToken, undefined, "Token omitted from backup");
assert.strictEqual(snapshot.metaAccounts[0].hasAccessToken, true, "Records token presence flag");
assert.strictEqual(snapshot.metaAccounts[0].tokenLength, "EAAB_secret_token_1".length, "Records token length flag");
console.log("  ✓ Backup snapshot captures isConnected and config without exposing secrets");

// 4. Update Execution Safety (No Hook Trigger, isConnected Preserved, Tokens Preserved)
console.log("\n--- 4. Update Execution Safety & Invariance ---");

function createMockDb() {
  const state = createMockValidState();

  const mockMetaModel = {
    find: async (query) => {
      const ids = query._id.$in.map((id) => id.toString());
      return state.metaAccounts.filter((m) => ids.includes(m._id.toString()));
    },
    updateOne: async (filter, update) => {
      const doc = state.metaAccounts.find((m) => m._id.toString() === filter._id.toString());
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      if (filter.userId.toString() !== doc.userId.toString()) return { matchedCount: 0, modifiedCount: 0 };

      // Apply $set directly (NO Mongoose pre-save hook invoked)
      if (update.$set) {
        Object.assign(doc, update.$set);
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };

  const mockChannelModel = {
    find: async (query) => {
      const ids = query._id.$in.map((id) => id.toString());
      return state.connectedChannels.filter((c) => ids.includes(c._id.toString()));
    },
    updateOne: async (filter, update) => {
      const doc = state.connectedChannels.find((c) => c._id.toString() === filter._id.toString());
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      if (filter.userId.toString() !== doc.userId.toString()) return { matchedCount: 0, modifiedCount: 0 };
      if (filter.channelId && filter.channelId !== doc.channelId) return { matchedCount: 0, modifiedCount: 0 };

      // Apply $set directly without invoking pre-save hook
      if (update.$set) {
        for (const [key, val] of Object.entries(update.$set)) {
          if (key.startsWith("config.")) {
            const subKey = key.split(".")[1];
            doc.config[subKey] = val;
          } else {
            doc[key] = val;
          }
        }
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };

  return { state, models: { MetaAccount: mockMetaModel, ConnectedChannel: mockChannelModel } };
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp_migration_test_"));
const { state: preState, models: mockModels } = createMockDb();

let repairResult;
(async () => {
  repairResult = await repairRecords(mockModels, TARGET_SPEC, { backupDir: tempDir });
  assert.strictEqual(repairResult.success, true);

  // Invariance Verification
  const meta1 = preState.metaAccounts[0];
  const meta2 = preState.metaAccounts[1];
  const ch1 = preState.connectedChannels[0];
  const ch2 = preState.connectedChannels[1];

  // 1. Official endpoint updated
  assert.strictEqual(meta1.mcpServerUrl, OFFICIAL_URL, "Meta 1 URL updated to official endpoint");
  assert.strictEqual(meta2.mcpServerUrl, OFFICIAL_URL, "Meta 2 URL updated to official endpoint");
  assert.strictEqual(ch1.config.mcpServerUrl, OFFICIAL_URL, "Channel 1 config URL updated to official endpoint");
  assert.strictEqual(ch2.config.mcpServerUrl, OFFICIAL_URL, "Channel 2 config URL updated to official endpoint");

  // 2. Transport normalized
  assert.strictEqual(meta1.mcpTransport, OFFICIAL_TRANSPORT, "Meta 1 transport is STREAMABLE_HTTP");
  assert.strictEqual(meta2.mcpTransport, OFFICIAL_TRANSPORT, "Meta 2 transport is STREAMABLE_HTTP");
  assert.strictEqual(ch1.config.mcpTransport, OFFICIAL_TRANSPORT, "Channel 1 transport is STREAMABLE_HTTP");
  assert.strictEqual(ch2.config.mcpTransport, OFFICIAL_TRANSPORT, "Channel 2 transport is STREAMABLE_HTTP");

  // 3. Stale error messages cleared
  assert.strictEqual(meta1.mcpErrorMessage, null, "Meta 1 stale error cleared");
  assert.strictEqual(meta2.mcpErrorMessage, null, "Meta 2 stale error cleared");
  assert.strictEqual(ch1.config.mcpErrorMessage, null, "Channel 1 stale error cleared");

  // 4. CRITICAL INVARIANCE: isConnected remains identical!
  assert.strictEqual(meta1.isConnected, true, "Meta 1 isConnected preserved as true");
  assert.strictEqual(meta2.isConnected, false, "Meta 2 isConnected preserved as false");
  assert.strictEqual(ch1.isConnected, true, "Channel 1 isConnected preserved as true");
  assert.strictEqual(ch2.isConnected, false, "Channel 2 isConnected preserved as false");

  // 5. CRITICAL INVARIANCE: access tokens are identical!
  assert.strictEqual(meta1.accessToken, "EAAB_secret_token_1", "Meta 1 token untouched");
  assert.strictEqual(meta2.accessToken, "", "Meta 2 token untouched");
  assert.strictEqual(ch1.accessToken, "EAAB_secret_token_1", "Channel 1 token untouched");
  assert.strictEqual(ch2.accessToken, "", "Channel 2 token untouched");

  console.log("  ✓ Repair executed safely: URLs and transports updated, stale errors cleared, isConnected & tokens 100% invariant");

  // 5. Rollback Verification
  console.log("\n--- 5. Rollback Verification ---");
  const rollbackRes = await rollbackRecords(repairResult.backupFilePath, mockModels, TARGET_SPEC);
  assert.strictEqual(rollbackRes.success, true);
  assert.strictEqual(rollbackRes.metaRestored, 2);
  assert.strictEqual(rollbackRes.channelRestored, 2);

  // Verify rollback restored exact previous values
  assert.strictEqual(meta1.mcpServerUrl, "http://localhost:8000/sse", "Meta 1 URL restored to localhost");
  assert.strictEqual(meta2.mcpServerUrl, "http://localhost:8000/sse", "Meta 2 URL restored to localhost");
  assert.strictEqual(ch1.config.mcpServerUrl, "http://localhost:8000/sse", "Channel 1 config URL restored to localhost");
  assert.strictEqual(ch2.config.mcpServerUrl, "http://localhost:8000/sse", "Channel 2 config URL restored to localhost");
  assert.strictEqual(ch1.isConnected, true, "Channel 1 isConnected preserved upon rollback");
  assert.strictEqual(ch2.isConnected, false, "Channel 2 isConnected preserved upon rollback");

  // Cleanup temp dir
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("  ✓ Rollback restored all modified fields exactly without altering isConnected or tokens");

  console.log("\n=== ALL TARGETED MIGRATION SAFETY TESTS PASSED! ✓ ===");
})().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});

