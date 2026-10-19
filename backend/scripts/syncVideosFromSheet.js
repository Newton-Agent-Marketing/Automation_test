import "dotenv/config";
import mongoose from "mongoose";
import MetaVideoSyncService from "../src/services/meta/metaVideoSyncService.js";

async function main() {
  try {
    if (!process.env.MONGO_URI) {
      console.error("❌ Error: MONGO_URI is missing from environment variables.");
      process.exit(1);
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    const forceReupload = process.argv.includes("--force") || process.argv.includes("-f");
    if (forceReupload) {
      console.log("🔥 Option --force detected: Will freshly download from Google Drive and upload to Meta Ads Manager!\n");
    }

    const results = await MetaVideoSyncService.syncVideosFromConnectedSheet({ forceReupload });
    console.log(`\n🎉 Processed ${results.length} rows successfully.`);
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error during Meta Video Sync:", error.message);
    if (error.response?.data) {
      console.error("Meta Graph API Response:", JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
