// backend/scripts/inspect_and_repair_meta_mcp_url.js
import "dotenv/config";
import mongoose from "mongoose";
import MetaAccount from "../src/models/metaAccount.js";
import ConnectedChannel from "../src/models/connectedChannelModel.js";

const TARGET_USER_IDS = ["6ae9de17b8639ff489f5a9da", "6acf81b175fe30f5cbefcff6"];
const TARGET_ACCOUNT_IDS = ["act_354818122576852", "354818122576852", "act_517557233790148", "517557233790148"];
const OFFICIAL_URL = "https://mcp.facebook.com/ads";

async function main() {
  const isRepair = process.argv.includes("--repair");

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("Error: MONGO_URI is not defined in environment.");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log(`Connected to MongoDB. Mode: ${isRepair ? "REPAIR (WRITE)" : "INSPECT (READ-ONLY)"}\n`);

  console.log("=== TARGET SCOPE ===");
  console.log(`User IDs   : ${TARGET_USER_IDS.join(", ")}`);
  console.log(`Account IDs: ${TARGET_ACCOUNT_IDS.join(", ")}`);
  console.log(`Target URL : ${OFFICIAL_URL}\n`);

  // 1. Inspect MetaAccount
  const userObjectIds = TARGET_USER_IDS.map((id) => new mongoose.Types.ObjectId(id));
  const metaFilter = {
    userId: { $in: userObjectIds },
    accountId: { $in: TARGET_ACCOUNT_IDS },
  };

  const metaAccounts = await MetaAccount.find(metaFilter);
  console.log(`[MetaAccount Collection] Matched Records: ${metaAccounts.length}`);
  for (const acc of metaAccounts) {
    console.log(`  - _id: ${acc._id}`);
    console.log(`    userId: ${acc.userId}`);
    console.log(`    accountId: ${acc.accountId}`);
    console.log(`    accountName: ${acc.accountName}`);
    console.log(`    current mcpServerUrl: ${acc.mcpServerUrl}`);
    console.log(`    current mcpTransport: ${acc.mcpTransport}`);
    console.log(`    current mcpStatus: ${acc.mcpStatus}`);
    console.log(`    hasAccessToken: ${Boolean(acc.accessToken)} (Token length: ${acc.accessToken ? acc.accessToken.length : 0})`);
  }

  // 2. Inspect ConnectedChannel
  const channelFilter = {
    userId: { $in: userObjectIds },
    channelId: "meta",
    accountId: { $in: TARGET_ACCOUNT_IDS },
  };

  const channels = await ConnectedChannel.find(channelFilter);
  console.log(`\n[ConnectedChannel Collection] Matched Records: ${channels.length}`);
  for (const ch of channels) {
    console.log(`  - _id: ${ch._id}`);
    console.log(`    userId: ${ch.userId}`);
    console.log(`    channelId: ${ch.channelId}`);
    console.log(`    accountId: ${ch.accountId}`);
    console.log(`    accountName: ${ch.accountName}`);
    console.log(`    current config.mcpServerUrl: ${ch.config?.mcpServerUrl}`);
    console.log(`    current config.mcpTransport: ${ch.config?.mcpTransport}`);
    console.log(`    current config.mcpStatus: ${ch.config?.mcpStatus}`);
  }

  if (!isRepair) {
    console.log("\n[INSPECT COMPLETE] No writes were performed. Pass --repair to apply the official URL update.");
    await mongoose.disconnect();
    process.exit(0);
  }

  // Execute Repair
  console.log("\n=== EXECUTING TARGETED REPAIR ===");

  const metaUpdateResult = await MetaAccount.updateMany(metaFilter, {
    $set: {
      mcpServerUrl: OFFICIAL_URL,
      mcpTransport: "STREAMABLE_HTTP",
      mcpErrorMessage: null,
    },
  });
  console.log(`✓ Updated MetaAccount records: ${metaUpdateResult.modifiedCount} modified (matched: ${metaUpdateResult.matchedCount})`);

  const channelUpdateResult = await ConnectedChannel.updateMany(channelFilter, {
    $set: {
      "config.mcpServerUrl": OFFICIAL_URL,
      "config.mcpTransport": "STREAMABLE_HTTP",
      "config.mcpErrorMessage": null,
    },
  });
  console.log(`✓ Updated ConnectedChannel records: ${channelUpdateResult.modifiedCount} modified (matched: ${channelUpdateResult.matchedCount})`);

  console.log("\n=== POST-REPAIR VERIFICATION ===");
  const verifiedMeta = await MetaAccount.find(metaFilter);
  for (const acc of verifiedMeta) {
    console.log(`  [MetaAccount] _id: ${acc._id} -> mcpServerUrl: ${acc.mcpServerUrl}, mcpTransport: ${acc.mcpTransport}`);
  }
  const verifiedChannels = await ConnectedChannel.find(channelFilter);
  for (const ch of verifiedChannels) {
    console.log(`  [ConnectedChannel] _id: ${ch._id} -> config.mcpServerUrl: ${ch.config?.mcpServerUrl}, config.mcpTransport: ${ch.config?.mcpTransport}`);
  }

  await mongoose.disconnect();
  console.log("\nTargeted repair completed successfully.");
}

main().catch((err) => {
  console.error("Inspection/Repair error:", err);
  process.exit(1);
});
