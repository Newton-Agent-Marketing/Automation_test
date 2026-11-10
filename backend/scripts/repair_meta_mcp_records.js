// backend/scripts/repair_meta_mcp_records.js
/**
 * Safe Targeted Migration Script for Official Meta Ads MCP Endpoint
 *
 * Target Scope (Strictly Restricted):
 * - User ID: 6ae9de17b8639ff489f5a9da
 * - MetaAccount Documents (Exactly 2):
 *     1. 6ae9de894fe651d3cd1665db -> act_354818122576852
 *     2. 6ae9de894fe651d3cd1665dd -> act_517557233790148
 * - ConnectedChannel Documents (Exactly 2):
 *     1. 6af2fb85be3220764fb3e284 -> act_354818122576852 (channelId: "meta")
 *     2. 6af2fb86be3220764fb3e285 -> act_517557233790148 (channelId: "meta")
 *
 * Usage:
 *   node scripts/repair_meta_mcp_records.js --inspect          (Dry-run inspection, no writes)
 *   node scripts/repair_meta_mcp_records.js --repair           (Targeted repair with backup)
 *   node scripts/repair_meta_mcp_records.js --rollback <file>  (Exact rollback from backup)
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import MetaAccount from "../src/models/metaAccount.js";
import ConnectedChannel from "../src/models/connectedChannelModel.js";

export const TARGET_SPEC = {
  userId: "6ae9de17b8639ff489f5a9da",
  metaAccounts: [
    {
      _id: "6ae9de894fe651d3cd1665db",
      expectedAccountId: "act_354818122576852",
    },
    {
      _id: "6ae9de894fe651d3cd1665dd",
      expectedAccountId: "act_517557233790148",
    },
  ],
  connectedChannels: [
    {
      _id: "6af2fb85be3220764fb3e284",
      expectedAccountId: "act_354818122576852",
      expectedChannelId: "meta",
    },
    {
      _id: "6af2fb86be3220764fb3e285",
      expectedAccountId: "act_517557233790148",
      expectedChannelId: "meta",
    },
  ],
};

export const OFFICIAL_URL = "https://mcp.facebook.com/ads";
export const OFFICIAL_TRANSPORT = "STREAMABLE_HTTP";

/**
 * Builds exact document ID filter for MetaAccount
 * Ensures no broad user/account filters can match extraneous documents.
 */
export function buildMetaAccountQuery(spec = TARGET_SPEC) {
  const docIds = spec.metaAccounts
    .map((m) => (mongoose.Types.ObjectId.isValid(m._id) ? new mongoose.Types.ObjectId(m._id) : m._id));
  return { _id: { $in: docIds } };
}

/**
 * Builds exact document ID filter for ConnectedChannel
 * Ensures no broad user/account filters can match extraneous documents.
 */
export function buildConnectedChannelQuery(spec = TARGET_SPEC) {
  const docIds = spec.connectedChannels
    .map((c) => (mongoose.Types.ObjectId.isValid(c._id) ? new mongoose.Types.ObjectId(c._id) : c._id));
  return { _id: { $in: docIds } };
}

/**
 * Validates that fetched documents match the exact specification:
 * - Exactly 2 MetaAccounts and 2 ConnectedChannels.
 * - Each document belongs to the specified userId.
 * - Each document belongs to its expected accountId and channelId.
 * Throws an explicit Error if any mismatch is found.
 */
export function validateRecords(metaAccounts, channels, spec = TARGET_SPEC) {
  if (!Array.isArray(metaAccounts) || metaAccounts.length !== spec.metaAccounts.length) {
    throw new Error(
      `MetaAccount count mismatch: expected exactly ${spec.metaAccounts.length} documents, found ${metaAccounts ? metaAccounts.length : 0}`
    );
  }

  if (!Array.isArray(channels) || channels.length !== spec.connectedChannels.length) {
    throw new Error(
      `ConnectedChannel count mismatch: expected exactly ${spec.connectedChannels.length} documents, found ${channels ? channels.length : 0}`
    );
  }

  // Validate each MetaAccount
  for (const expected of spec.metaAccounts) {
    const doc = metaAccounts.find((m) => m._id.toString() === expected._id);
    if (!doc) {
      throw new Error(`Target MetaAccount document [${expected._id}] was not found in query results.`);
    }

    const docUserId = doc.userId?.toString();
    if (docUserId !== spec.userId) {
      throw new Error(
        `Ownership validation failed for MetaAccount [${expected._id}]: expected userId "${spec.userId}", found "${docUserId}"`
      );
    }

    const cleanDocAcc = String(doc.accountId || "").replace(/^act_/, "");
    const cleanExpAcc = String(expected.expectedAccountId || "").replace(/^act_/, "");
    if (cleanDocAcc !== cleanExpAcc) {
      throw new Error(
        `Account validation failed for MetaAccount [${expected._id}]: expected accountId "${expected.expectedAccountId}", found "${doc.accountId}"`
      );
    }
  }

  // Validate each ConnectedChannel
  for (const expected of spec.connectedChannels) {
    const doc = channels.find((c) => c._id.toString() === expected._id);
    if (!doc) {
      throw new Error(`Target ConnectedChannel document [${expected._id}] was not found in query results.`);
    }

    const docUserId = doc.userId?.toString();
    if (docUserId !== spec.userId) {
      throw new Error(
        `Ownership validation failed for ConnectedChannel [${expected._id}]: expected userId "${spec.userId}", found "${docUserId}"`
      );
    }

    if (doc.channelId !== expected.expectedChannelId) {
      throw new Error(
        `Channel validation failed for ConnectedChannel [${expected._id}]: expected channelId "${expected.expectedChannelId}", found "${doc.channelId}"`
      );
    }

    const cleanDocAcc = String(doc.accountId || "").replace(/^act_/, "");
    const cleanExpAcc = String(expected.expectedAccountId || "").replace(/^act_/, "");
    if (cleanDocAcc !== cleanExpAcc) {
      throw new Error(
        `Account validation failed for ConnectedChannel [${expected._id}]: expected accountId "${expected.expectedAccountId}", found "${doc.accountId}"`
      );
    }
  }

  return true;
}

/**
 * Checks whether an error message refers to stale localhost/SSE connection errors
 */
export function isStaleMcpErrorMessage(msg) {
  if (!msg || typeof msg !== "string") return false;
  const lower = msg.toLowerCase();
  return (
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    lower.includes("8000") ||
    lower.includes("econnrefused") ||
    lower.includes("/sse")
  );
}

/**
 * Generates an exact snapshot backup object without logging or exposing access tokens
 */
export function createBackupSnapshot(metaAccounts, channels, spec = TARGET_SPEC) {
  return {
    timestamp: new Date().toISOString(),
    specUserId: spec.userId,
    metaAccounts: metaAccounts.map((a) => ({
      _id: a._id.toString(),
      userId: a.userId?.toString(),
      accountId: a.accountId,
      accountName: a.accountName,
      isConnected: a.isConnected,
      isActive: a.isActive,
      mcpServerUrl: a.mcpServerUrl,
      mcpTransport: a.mcpTransport,
      mcpStatus: a.mcpStatus,
      mcpErrorMessage: a.mcpErrorMessage,
      hasAccessToken: Boolean(a.accessToken),
      tokenLength: a.accessToken ? a.accessToken.length : 0,
      updatedAt: a.updatedAt ? new Date(a.updatedAt).toISOString() : null,
    })),
    connectedChannels: channels.map((c) => ({
      _id: c._id.toString(),
      userId: c.userId?.toString(),
      channelId: c.channelId,
      accountId: c.accountId,
      accountName: c.accountName,
      isConnected: c.isConnected,
      config: JSON.parse(JSON.stringify(c.config || {})),
      hasAccessToken: Boolean(c.accessToken),
      tokenLength: c.accessToken ? c.accessToken.length : 0,
      updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
    })),
  };
}

/**
 * Read-only inspection of target documents (dry-run mode)
 */
export async function inspectRecords(models = { MetaAccount, ConnectedChannel }, spec = TARGET_SPEC) {
  console.log("==========================================================");
  console.log("   READ-ONLY INSPECTION: TARGET OFFICIAL META MCP DOCS    ");
  console.log("==========================================================");
  console.log(`Target User ID     : ${spec.userId}`);
  console.log(`Target Document IDs:`);
  console.log(`  - MetaAccount    : ${spec.metaAccounts.map((m) => `${m._id} (${m.expectedAccountId})`).join(", ")}`);
  console.log(`  - ConnectedChannel: ${spec.connectedChannels.map((c) => `${c._id} (${c.expectedAccountId})`).join(", ")}`);
  console.log(`Official Endpoint  : ${OFFICIAL_URL}`);
  console.log(`Official Transport : ${OFFICIAL_TRANSPORT}\n`);

  const metaAccounts = await models.MetaAccount.find(buildMetaAccountQuery(spec));
  console.log(`[MetaAccount Collection] Found Documents: ${metaAccounts.length} / ${spec.metaAccounts.length}`);
  for (const acc of metaAccounts) {
    console.log(`  - Document ID   : ${acc._id}`);
    console.log(`    User ID       : ${acc.userId}`);
    console.log(`    Account ID    : ${acc.accountId}`);
    console.log(`    Account Name  : ${acc.accountName}`);
    console.log(`    mcpServerUrl  : "${acc.mcpServerUrl}"`);
    console.log(`    mcpTransport  : "${acc.mcpTransport}"`);
    console.log(`    mcpStatus     : "${acc.mcpStatus}"`);
    console.log(`    isConnected   : ${acc.isConnected}`);
    console.log(`    mcpErrorMsg   : "${acc.mcpErrorMessage || "none"}"`);
    console.log(`    Token Stored  : ${Boolean(acc.accessToken)} (length: ${acc.accessToken ? acc.accessToken.length : 0})`);
    console.log("    ------------------------------------------------------");
  }

  const channels = await models.ConnectedChannel.find(buildConnectedChannelQuery(spec));
  console.log(`\n[ConnectedChannel Collection] Found Documents: ${channels.length} / ${spec.connectedChannels.length}`);
  for (const ch of channels) {
    console.log(`  - Document ID   : ${ch._id}`);
    console.log(`    User ID       : ${ch.userId}`);
    console.log(`    Channel ID    : ${ch.channelId}`);
    console.log(`    Account ID    : ${ch.accountId}`);
    console.log(`    Account Name  : ${ch.accountName}`);
    console.log(`    isConnected   : ${ch.isConnected}`);
    console.log(`    config.mcpUrl : "${ch.config?.mcpServerUrl}"`);
    console.log(`    config.mcpTrn : "${ch.config?.mcpTransport}"`);
    console.log(`    config.status : "${ch.config?.mcpStatus}"`);
    console.log(`    config.error  : "${ch.config?.mcpErrorMessage || "none"}"`);
    console.log(`    Token Stored  : ${Boolean(ch.accessToken)} (length: ${ch.accessToken ? ch.accessToken.length : 0})`);
    console.log("    ------------------------------------------------------");
  }

  try {
    validateRecords(metaAccounts, channels, spec);
    console.log("\n✓ Validation PASSED: All 4 documents strictly match expected user, accounts, and channel IDs.");
  } catch (valErr) {
    console.warn(`\n⚠ Validation Warning (dry-run): ${valErr.message}`);
  }

  console.log("\n[DRY-RUN INSPECTION COMPLETE] Zero database writes performed.");
  return { metaAccounts, channels };
}

/**
 * Targeted repair execution:
 * 1. Strict validation of exactly 2 MetaAccount + 2 ConnectedChannel docs.
 * 2. Pre-update snapshot backup to JSON.
 * 3. Scoped updateOne operations (avoiding Mongoose pre-save hooks so isConnected is NEVER recalculated).
 * 4. Post-update verification of all fields.
 */
export async function repairRecords(models = { MetaAccount, ConnectedChannel }, spec = TARGET_SPEC, options = {}) {
  const metaAccounts = await models.MetaAccount.find(buildMetaAccountQuery(spec));
  const channels = await models.ConnectedChannel.find(buildConnectedChannelQuery(spec));

  // Strict pre-execution validation
  validateRecords(metaAccounts, channels, spec);

  // 1. Create snapshot backup
  const backupSnapshot = createBackupSnapshot(metaAccounts, channels, spec);
  const backupDir = options.backupDir || path.resolve(process.cwd(), "scripts");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupFilePath = path.join(
    backupDir,
    `backup_meta_mcp_records_${Date.now()}.json`
  );
  fs.writeFileSync(backupFilePath, JSON.stringify(backupSnapshot, null, 2), "utf-8");
  console.log(`\n✓ Snapshot backup written to: ${backupFilePath}`);

  // 2. Perform scoped updates using updateOne (bypassing pre-save hook to preserve isConnected)
  console.log("\n=== EXECUTING TARGETED DATABASE UPDATES ===");

  const userObjId = mongoose.Types.ObjectId.isValid(spec.userId)
    ? new mongoose.Types.ObjectId(spec.userId)
    : spec.userId;

  for (const mSpec of spec.metaAccounts) {
    const doc = metaAccounts.find((m) => m._id.toString() === mSpec._id);
    const clearError = isStaleMcpErrorMessage(doc.mcpErrorMessage);

    const updateOps = {
      $set: {
        mcpServerUrl: OFFICIAL_URL,
        mcpTransport: OFFICIAL_TRANSPORT,
      },
    };
    if (clearError) {
      updateOps.$set.mcpErrorMessage = null;
    }

    const docObjId = mongoose.Types.ObjectId.isValid(mSpec._id)
      ? new mongoose.Types.ObjectId(mSpec._id)
      : mSpec._id;

    const res = await models.MetaAccount.updateOne(
      {
        _id: docObjId,
        userId: userObjId,
        accountId: { $in: [mSpec.expectedAccountId, mSpec.expectedAccountId.replace(/^act_/, "")] },
      },
      updateOps
    );

    if (res.matchedCount !== 1) {
      throw new Error(`Failed to update MetaAccount [${mSpec._id}]: matchedCount was ${res.matchedCount}`);
    }
    console.log(`  ✓ Updated MetaAccount [${mSpec._id}] (${mSpec.expectedAccountId}) -> ${OFFICIAL_URL} (${OFFICIAL_TRANSPORT})`);
  }

  for (const cSpec of spec.connectedChannels) {
    const doc = channels.find((c) => c._id.toString() === cSpec._id);
    const clearError = isStaleMcpErrorMessage(doc.config?.mcpErrorMessage);

    const updateOps = {
      $set: {
        "config.mcpServerUrl": OFFICIAL_URL,
        "config.mcpTransport": OFFICIAL_TRANSPORT,
      },
    };
    if (clearError) {
      updateOps.$set["config.mcpErrorMessage"] = null;
    }

    const docObjId = mongoose.Types.ObjectId.isValid(cSpec._id)
      ? new mongoose.Types.ObjectId(cSpec._id)
      : cSpec._id;

    const res = await models.ConnectedChannel.updateOne(
      {
        _id: docObjId,
        userId: userObjId,
        channelId: cSpec.expectedChannelId,
        accountId: { $in: [cSpec.expectedAccountId, cSpec.expectedAccountId.replace(/^act_/, "")] },
      },
      updateOps
    );

    if (res.matchedCount !== 1) {
      throw new Error(`Failed to update ConnectedChannel [${cSpec._id}]: matchedCount was ${res.matchedCount}`);
    }
    console.log(`  ✓ Updated ConnectedChannel [${cSpec._id}] (${cSpec.expectedAccountId}) -> ${OFFICIAL_URL} (${OFFICIAL_TRANSPORT})`);
  }

  // 3. Post-update verification
  console.log("\n=== POST-UPDATE VERIFICATION ===");
  const verifiedMeta = await models.MetaAccount.find(buildMetaAccountQuery(spec));
  const verifiedChannels = await models.ConnectedChannel.find(buildConnectedChannelQuery(spec));

  validateRecords(verifiedMeta, verifiedChannels, spec);

  for (const vMeta of verifiedMeta) {
    const original = backupSnapshot.metaAccounts.find((a) => a._id === vMeta._id.toString());
    if (vMeta.mcpServerUrl !== OFFICIAL_URL) {
      throw new Error(`Verification failed for MetaAccount [${vMeta._id}]: mcpServerUrl is "${vMeta.mcpServerUrl}", expected "${OFFICIAL_URL}"`);
    }
    if (vMeta.mcpTransport !== OFFICIAL_TRANSPORT) {
      throw new Error(`Verification failed for MetaAccount [${vMeta._id}]: mcpTransport is "${vMeta.mcpTransport}", expected "${OFFICIAL_TRANSPORT}"`);
    }
    if (vMeta.isConnected !== original.isConnected) {
      throw new Error(`Verification failed for MetaAccount [${vMeta._id}]: isConnected changed from ${original.isConnected} to ${vMeta.isConnected}`);
    }
    const curTokenLen = vMeta.accessToken ? vMeta.accessToken.length : 0;
    if (curTokenLen !== original.tokenLength) {
      throw new Error(`Verification failed for MetaAccount [${vMeta._id}]: access token length changed`);
    }
    console.log(`  ✓ Verified MetaAccount [${vMeta._id}]: mcpServerUrl="${vMeta.mcpServerUrl}", mcpTransport="${vMeta.mcpTransport}", isConnected=${vMeta.isConnected}`);
  }

  for (const vChannel of verifiedChannels) {
    const original = backupSnapshot.connectedChannels.find((c) => c._id === vChannel._id.toString());
    if (vChannel.config?.mcpServerUrl !== OFFICIAL_URL) {
      throw new Error(`Verification failed for ConnectedChannel [${vChannel._id}]: config.mcpServerUrl is "${vChannel.config?.mcpServerUrl}", expected "${OFFICIAL_URL}"`);
    }
    if (vChannel.config?.mcpTransport !== OFFICIAL_TRANSPORT) {
      throw new Error(`Verification failed for ConnectedChannel [${vChannel._id}]: config.mcpTransport is "${vChannel.config?.mcpTransport}", expected "${OFFICIAL_TRANSPORT}"`);
    }
    if (vChannel.isConnected !== original.isConnected) {
      throw new Error(`Verification failed for ConnectedChannel [${vChannel._id}]: isConnected changed from ${original.isConnected} to ${vChannel.isConnected}`);
    }
    const curTokenLen = vChannel.accessToken ? vChannel.accessToken.length : 0;
    if (curTokenLen !== original.tokenLength) {
      throw new Error(`Verification failed for ConnectedChannel [${vChannel._id}]: access token length changed`);
    }
    console.log(`  ✓ Verified ConnectedChannel [${vChannel._id}]: config.mcpServerUrl="${vChannel.config?.mcpServerUrl}", config.mcpTransport="${vChannel.config?.mcpTransport}", isConnected=${vChannel.isConnected}`);
  }

  console.log("\n✓ All 4 documents verified successfully: official endpoint and transport enforced; isConnected and tokens intact.");
  console.log(`Backup file stored at: ${backupFilePath}`);
  return { success: true, backupFilePath, verifiedMeta, verifiedChannels };
}

/**
 * Exact Rollback execution from a backup snapshot:
 * Validates ownership and exact document IDs before updating.
 */
export async function rollbackRecords(backupFilePath, models = { MetaAccount, ConnectedChannel }, spec = TARGET_SPEC) {
  if (!backupFilePath || !fs.existsSync(backupFilePath)) {
    throw new Error(`Rollback failed: Backup file does not exist: "${backupFilePath}"`);
  }

  const backupData = JSON.parse(fs.readFileSync(backupFilePath, "utf-8"));
  console.log(`\n=== EXECUTING ROLLBACK FROM BACKUP: ${backupFilePath} ===`);
  console.log(`Backup Timestamp: ${backupData.timestamp}`);

  if (backupData.specUserId !== spec.userId) {
    throw new Error(`Rollback aborted: Backup userId "${backupData.specUserId}" does not match target spec userId "${spec.userId}"`);
  }

  const userObjId = mongoose.Types.ObjectId.isValid(spec.userId)
    ? new mongoose.Types.ObjectId(spec.userId)
    : spec.userId;

  let metaRestored = 0;
  for (const m of backupData.metaAccounts || []) {
    const docObjId = mongoose.Types.ObjectId.isValid(m._id) ? new mongoose.Types.ObjectId(m._id) : m._id;
    const res = await models.MetaAccount.updateOne(
      { _id: docObjId, userId: userObjId, accountId: m.accountId },
      {
        $set: {
          mcpServerUrl: m.mcpServerUrl,
          mcpTransport: m.mcpTransport,
          mcpStatus: m.mcpStatus,
          mcpErrorMessage: m.mcpErrorMessage,
          isConnected: m.isConnected,
        },
      }
    );
    if (res.matchedCount !== 1) {
      throw new Error(`Rollback failed: MetaAccount [${m._id}] could not be matched for restoration.`);
    }
    metaRestored++;
    console.log(`  ✓ Restored MetaAccount [${m._id}] -> mcpServerUrl="${m.mcpServerUrl}", mcpTransport="${m.mcpTransport}"`);
  }

  let channelRestored = 0;
  for (const c of backupData.connectedChannels || []) {
    const docObjId = mongoose.Types.ObjectId.isValid(c._id) ? new mongoose.Types.ObjectId(c._id) : c._id;
    const res = await models.ConnectedChannel.updateOne(
      { _id: docObjId, userId: userObjId, channelId: c.channelId, accountId: c.accountId },
      {
        $set: {
          config: c.config,
          isConnected: c.isConnected,
        },
      }
    );
    if (res.matchedCount !== 1) {
      throw new Error(`Rollback failed: ConnectedChannel [${c._id}] could not be matched for restoration.`);
    }
    channelRestored++;
    console.log(`  ✓ Restored ConnectedChannel [${c._id}] -> config.mcpServerUrl="${c.config?.mcpServerUrl}", isConnected=${c.isConnected}`);
  }

  console.log(`\n✓ Rollback completed successfully: ${metaRestored} MetaAccount(s) and ${channelRestored} ConnectedChannel(s) restored.`);
  return { success: true, metaRestored, channelRestored };
}

async function main() {
  const args = process.argv.slice(2);
  const isRepair = args.includes("--repair") || args.includes("--execute");
  const rollbackIdx = args.indexOf("--rollback");
  const isRollback = rollbackIdx !== -1;
  const rollbackFile = isRollback ? args[rollbackIdx + 1] : null;

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("Error: MONGO_URI is not configured in environment.");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  try {
    if (isRollback) {
      await rollbackRecords(rollbackFile);
    } else if (isRepair) {
      await repairRecords();
    } else {
      await inspectRecords();
    }
  } catch (err) {
    console.error(`\n✖ SCRIPT EXECUTION ABORTED: ${err.message}`);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// Only execute CLI if executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
