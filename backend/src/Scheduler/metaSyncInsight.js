// src/Scheduler/metaSyncInsight.js
import cron from "node-cron";
import MetaAccount from "../models/metaAccount.js";
import { MetaSyncPipeline } from "../services/meta/metaSyncPipe.js"; // Aapki pipeline file ka path

export class MetaSyncScheduler {
  /**
   * Cron Job Initialize karna
   */
  static startCronJob() {
    console.log("[Scheduler] 🕒 Meta Sync Cron Scheduler initialized...");

    // -------------------------------------------------------------
    // Schedule Timings:
    // '0 * * * *'   -> Har ghante (Every 1 hour)
    // '*/30 * * * *'-> Har 30 minute mein
    // '0 0 * * *'   -> Har raat 12:00 baje (Midnight daily)
    // -------------------------------------------------------------
    
    // Yahan hum har 1 ghante mein sync chala rahe hain:
    cron.schedule("0 0 * * *", async () => {
      console.log(`[Scheduler] ⏳ Running scheduled Meta Ads sync at ${new Date().toISOString()}`);
      await this.runSyncForAllAccounts();
    });
  }

  /**
   * Sabhi Active Accounts ka sync execute karna
   */
  static async runSyncForAllAccounts() {
    try {
      // 1. DB se sabhi active accounts nikalna
      const activeAccounts = await MetaAccount.find({ isActive: true });

      if (activeAccounts.length === 0) {
        console.log("[Scheduler] ℹ️ No active Meta accounts found to sync.");
        return;
      }

      console.log(`[Scheduler] 🚀 Found ${activeAccounts.length} active account(s) to sync.`);

      // 2. Loop chala kar har account ko sync karna
      for (const account of activeAccounts) {
        try {
          console.log(`[Scheduler] 🔄 Syncing account: ${account.accountName} (${account.accountId})`);
          await MetaSyncPipeline.syncAccount(account.accountId);
          console.log(`[Scheduler] ✅ Successfully synced: ${account.accountId}`);
        } catch (error) {
          // Ek account fail ho jaye toh bhi baaki accounts chalte rahenge
          console.error(`[Scheduler] ❌ Failed to sync ${account.accountId}:`, error.message);
        }
      }

      console.log("[Scheduler] 🏁 Batch sync finished successfully.");
    } catch (err) {
      console.error("[Scheduler] 🚨 Fatal error in Meta Sync Scheduler:", err);
    }
  }
}
