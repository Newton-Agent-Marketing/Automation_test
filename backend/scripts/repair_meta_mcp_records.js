// backend/scripts/repair_meta_mcp_records.js
/**
 * Safe Targeted Migration Script for Official Meta Ads MCP Endpoint
 *
 * Target Scope:
 * - User ID: 6ae9de17b8639ff489f5a9da
 * - Accounts: act_354818122576852, act_517557233790148
 * - Document IDs:
 *     MetaAccount: 6ae9de894fe651d3cd1665db, 6ae9de894fe651d3cd1665dd
 *     ConnectedChannel: 6af2fb85be3220764fb3e284, 6af2fb86be3220764fb3e285
 *
 * Usage:
 *   node scripts/repair_meta_mcp_records.js --inspect
 *   node scripts/repair_meta_mcp_records.js --repair
 *   node scripts/repair_meta_mcp_records.js --rollback <path-to-backup.json>
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import MetaAccount from "../src/models/metaAccount.js";
import ConnectedChannel from "../src/models/connectedChannelModel.js";

const TARGET_USER_ID = "6ae9de17b8639ff489f5a9da";
const TARGET_ACCOUNT_IDS = ["act_354818122576852", "354818122576852", "act_517557233790148", "517557233790148"];
const TARGET_DOC_IDS = {
  metaAccount: ["6ae9de894fe651d3cd1665db", "6ae9de894fe651d3cd1665dd"],
  connectedChannel: ["6af2fb85be3220764fb3e284", "6af2fb86be3220764fb3e285"],
};
const OFFICIAL_URL = "https://mcp.facebook.com/ads";
const OFFICIAL_TRANSPORT = "STREAMABLE_HTTP";

function buildMetaAccountQuery() {
  const userObjId = mongoose.Types.ObjectId.isValid(TARGET_USER_ID)
    ? new mongoose.Types.ObjectId(TARGET_USER_ID)
    : null;

  const validDocObjIds = TARGET_DOC_IDS.metaAccount
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  return {
    $or: [
      { _id: { $in: validDocObjIds } },
      {
        userId: userObjId ? { $in: [TARGET_USER_ID, userObjId] } : TARGET_USER_ID,
        accountId: { $in: TARGET_ACCOUNT_IDS },
      },
    ],
  };
}

function buildConnectedChannelQuery() {
  const userObjId = mongoose.Types.ObjectId.isValid(TARGET_USER_ID)
    ? new mongoose.Types.ObjectId(TARGET_USER_ID)
    : null;

  const validDocObjIds = TARGET_DOC_IDS.connectedChannel
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  return {
    $or: [
      { _id: { $in: validDocObjIds } },
      {
        userId: userObjId ? { $in: [TARGET_USER_ID, userObjId] } : TARGET_USER_ID,
        channelId: "meta",
        accountId: { $in: TARGET_ACCOUNT_IDS },
      },
    ],
  };
}

async function inspectRecords() {
  console.log("=================================================");
  console.log("   READ-ONLY INSPECTION: TARGET META MCP RECORDS  ");
  console.log("=================================================");
  console.log(`Target User ID   : ${TARGET_USER_ID}`);
  console.log(`Target Accounts  : ${TARGET_ACCOUNT_IDS.join(", ")}`);
  console.log(`Official Endpoint: ${OFFICIAL_URL}`);
  console.log(`Official Transport: ${OFFICIAL_TRANSPORT}\n`);

  const metaAccounts = await MetaAccount.find(buildMetaAccountQuery());
  console.log(`[MetaAccount Collection] Matched Documents: ${metaAccounts.length}`);
  for (const acc of metaAccounts) {
    console.log(`  - Document ID   : ${acc._id}`);
    console.log(`    User ID       : ${acc.userId}`);
    console.log(`    Account ID    : ${acc.accountId}`);
    console.log(`    Account Name  : ${acc.accountName}`);
    console.log(`    mcpServerUrl  : ${acc.mcpServerUrl}`);
    console.log(`    mcpTransport  : ${acc.mcpTransport}`);
    console.log(`    mcpStatus     : ${acc.mcpStatus}`);
    console.log(`    mcpErrorMsg   : ${acc.mcpErrorMessage || "none"}`);
    console.log(`    Token Stored  : ${Boolean(acc.accessToken)} (length: ${acc.accessToken ? acc.accessToken.length : 0})`);
    console.log("    -----------------------------------------");
  }

  const channels = await ConnectedChannel.find(buildConnectedChannelQuery());
  console.log(`\n[ConnectedChannel Collection] Matched Documents: ${channels.length}`);
  for (const ch of channels) {
    console.log(`  - Document ID   : ${ch._id}`);
    console.log(`    User ID       : ${ch.userId}`);
    console.log(`    Channel ID    : ${ch.channelId}`);
    console.log(`    Account ID    : ${ch.accountId}`);
    console.log(`    Account Name  : ${ch.accountName}`);
    console.log(`    config.mcpUrl : ${ch.config?.mcpServerUrl}`);
    console.log(`    config.mcpTrn : ${ch.config?.mcpTransport}`);
    console.log(`    config.status : ${ch.config?.mcpStatus}`);
    console.log(`    config.error  : ${ch.config?.mcpErrorMessage || "none"}`);
    console.log("    -----------------------------------------");
  }

  console.log("\n[INSPECT COMPLETE] No writes were performed.");
  return { metaAccounts, channels };
}

async function repairRecords() {
  const { metaAccounts, channels } = await inspectRecords();

  if (metaAccounts.length === 0 && channels.length === 0) {
    console.log("\nNo matching records found to repair in this database connection.");
    return;
  }

  // 1. Create backup snapshot
  const backupData = {
    timestamp: new Date().toISOString(),
    targetUserId: TARGET_USER_ID,
    metaAccounts: metaAccounts.map((a) => ({
      _id: a._id.toString(),
      userId: a.userId?.toString(),
      accountId: a.accountId,
      mcpServerUrl: a.mcpServerUrl,
      mcpTransport: a.mcpTransport,
      mcpStatus: a.mcpStatus,
      mcpErrorMessage: a.mcpErrorMessage,
    })),
    connectedChannels: channels.map((c) => ({
      _id: c._id.toString(),
      userId: c.userId?.toString(),
      channelId: c.channelId,
      accountId: c.accountId,
      config: c.config,
    })),
  };

  const backupDir = path.resolve(process.cwd(), "scripts");
  const backupFilePath = path.join(
    backupDir,
    `backup_meta_mcp_records_${Date.now()}.json`
  );
  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), "utf-8");
  console.log(`\n✓ Snapshot backup written to: ${backupFilePath}`);

  // 2. Perform exact, scoped updates
  console.log("\n=== EXECUTING TARGETED DATABASE UPDATE ===");

  let metaUpdatedCount = 0;
  for (const acc of metaAccounts) {
    const isStaleError = acc.mcpErrorMessage && (
      acc.mcpErrorMessage.includes("localhost") ||
      acc.mcpErrorMessage.includes("ECONNREFUSED") ||
      acc.mcpErrorMessage.includes("8000") ||
      acc.mcpErrorMessage.includes("/sse")
    );

    acc.mcpServerUrl = OFFICIAL_URL;
    acc.mcpTransport = OFFICIAL_TRANSPORT;
    if (isStaleError) {
      acc.mcpErrorMessage = null;
    }
    // Do not mark CONNECTED unless genuine handshake has occurred
    await acc.save();
    metaUpdatedCount++;
    console.log(`  ✓ Updated MetaAccount [${acc._id}] (${acc.accountId}) -> ${OFFICIAL_URL}`);
  }

  let channelUpdatedCount = 0;
  for (const ch of channels) {
    ch.config = ch.config || {};
    const isStaleError = ch.config.mcpErrorMessage && (
      ch.config.mcpErrorMessage.includes("localhost") ||
      ch.config.mcpErrorMessage.includes("ECONNREFUSED") ||
      ch.config.mcpErrorMessage.includes("8000") ||
      ch.config.mcpErrorMessage.includes("/sse")
    );

    ch.config.mcpServerUrl = OFFICIAL_URL;
    ch.config.mcpTransport = OFFICIAL_TRANSPORT;
    if (isStaleError) {
      ch.config.mcpErrorMessage = null;
    }
    ch.markModified("config");
    await ch.save();
    channelUpdatedCount++;
    console.log(`  ✓ Updated ConnectedChannel [${ch._id}] (${ch.accountId}) -> ${OFFICIAL_URL}`);
  }

  // 3. Post-repair verification
  console.log("\n=== POST-REPAIR VERIFICATION ===");
  const verifiedMeta = await MetaAccount.find(buildMetaAccountQuery());
  for (const a of verifiedMeta) {
    console.log(`  [MetaAccount Verified] ${a._id} (${a.accountId}) -> mcpServerUrl: "${a.mcpServerUrl}", mcpTransport: "${a.mcpTransport}"`);
  }
  const verifiedChannels = await ConnectedChannel.find(buildConnectedChannelQuery());
  for (const c of verifiedChannels) {
    console.log(`  [ConnectedChannel Verified] ${c._id} (${c.accountId}) -> config.mcpServerUrl: "${c.config?.mcpServerUrl}", config.mcpTransport: "${c.config?.mcpTransport}"`);
  }

  console.log(`\nSuccessfully updated ${metaUpdatedCount} MetaAccount(s) and ${channelUpdatedCount} ConnectedChannel(s).`);
  console.log("Rollback file preserved in case restoration is needed.");
}

async function rollbackRecords(backupFilePath) {
  if (!backupFilePath || !fs.existsSync(backupFilePath)) {
    throw new Error(`Invalid or missing backup file path: ${backupFilePath}`);
  }

  const backupData = JSON.parse(fs.readFileSync(backupFilePath, "utf-8"));
  console.log(`\n=== ROLLING BACK FROM BACKUP: ${backupFilePath} ===`);
  console.log(`Backup created at: ${backupData.timestamp}`);

  let metaRestored = 0;
  for (const m of backupData.metaAccounts || []) {
    await MetaAccount.findByIdAndUpdate(m._id, {
      $set: {
        mcpServerUrl: m.mcpServerUrl,
        mcpTransport: m.mcpTransport,
        mcpStatus: m.mcpStatus,
        mcpErrorMessage: m.mcpErrorMessage,
      },
    });
    metaRestored++;
    console.log(`  ✓ Restored MetaAccount [${m._id}]`);
  }

  let channelRestored = 0;
  for (const c of backupData.connectedChannels || []) {
    await ConnectedChannel.findByIdAndUpdate(c._id, {
      $set: {
        config: c.config,
      },
    });
    channelRestored++;
    console.log(`  ✓ Restored ConnectedChannel [${c._id}]`);
  }

  console.log(`\nRollback completed: ${metaRestored} MetaAccount(s) and ${channelRestored} ConnectedChannel(s) restored.`);
}

async function main() {
  const args = process.argv.slice(2);
  const isRepair = args.includes("--repair");
  const rollbackIndex = args.indexOf("--rollback");
  const isRollback = rollbackIndex !== -1;
  const rollbackFile = isRollback ? args[rollbackIndex + 1] : null;

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("Error: MONGO_URI is not defined in environment.");
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
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
