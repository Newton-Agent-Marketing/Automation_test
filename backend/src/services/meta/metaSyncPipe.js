// src/services/meta/metaSyncPipeline.js
//Yeh metaApiService se data nikalta hai, format karta hai aur MongoDB mein MetaCampaign aur MetaInsight models mein Upsert (Insert/Update) karta hai.
import MetaAccount from "../../models/metaAccount.js";
import MetaCampaign from "../../models/metaCampaign.js";
import MetaInsight from "../../models/metaInsight.js";
import { MetaApiService } from "./metaApiService.js";

export class MetaSyncPipeline {
  static async syncAccount(accountId) {
    console.log(`[Pipeline] Starting sync for account: ${accountId}`);

    // 1. DB se Account & Token check karo
    const cleanId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const rawId = accountId.replace(/^act_/, "");
    const account = await MetaAccount.findOne({
      $or: [{ accountId }, { accountId: cleanId }, { accountId: rawId }],
    });
    if (!account || !account.accessToken) {
      return { success: false, message: `Meta Account or Access Token not found for ${accountId}` };
    }

    try {
      // Sync status ko SYNCING karo
      account.syncStatus = "SYNCING";
      await account.save();

      let campaigns = [];
      let insights = [];

      // 2. Meta API se Campaigns fetch karo & DB mein save karo
      try {
        campaigns = (await MetaApiService.getCampaigns(cleanId, account.accessToken)) || [];
      } catch (campErr) {
        console.warn(`[Meta Sync Campaigns Warning for ${cleanId}]:`, campErr.response?.data?.error?.message || campErr.message);
        if (MetaApiService.isTokenRevokedOrExpired(campErr)) {
          throw campErr;
        }
      }

      for (const camp of campaigns) {
        await MetaCampaign.findOneAndUpdate(
          { campaignId: camp.id },
          {
            userId: account.userId,
            accountId: account.accountId,
            campaignId: camp.id,
            name: camp.name,
            status: camp.status,
            effectiveStatus: camp.effective_status || camp.status,
            objective: camp.objective,
            dailyBudget: camp.daily_budget ? Number(camp.daily_budget) / 100 : 0,
            lifetimeBudget: camp.lifetime_budget ? Number(camp.lifetime_budget) / 100 : 0,
            startTime: camp.start_time ? new Date(camp.start_time) : null,
            stopTime: camp.stop_time ? new Date(camp.stop_time) : null,
            lastSyncedAt: new Date(),
          },
          { upsert: true, returnDocument: "after" }
        );
      }

      // 3. Meta API se Daily Insights fetch karo & DB mein save karo
      try {
        insights = (await MetaApiService.getInsights(cleanId, account.accessToken, {
          datePreset: "last_30d",
        })) || [];
      } catch (insErr) {
        console.warn(`[Meta Sync Insights Warning for ${cleanId}]:`, insErr.response?.data?.error?.message || insErr.message);
        if (MetaApiService.isTokenRevokedOrExpired(insErr)) {
          throw insErr;
        }
      }

      const insightOps = insights.map((row) => {
        const purchasesAction = (row.actions || []).find((a) => a.action_type === "purchase");
        const purchases = purchasesAction ? Number(purchasesAction.value) : 0;

        const purchaseValueAction = (row.action_values || []).find((a) => a.action_type === "purchase");
        const purchaseValue = purchaseValueAction ? Number(purchaseValueAction.value) : 0;

        const spend = Number(row.spend || 0);
        const roas = spend > 0 && purchaseValue > 0 ? Number((purchaseValue / spend).toFixed(2)) : 0;

        return {
          updateOne: {
            filter: { campaignId: row.campaign_id, date: row.date_start },
            update: {
              $set: {
                userId: account.userId,
                accountId: account.accountId,
                campaignId: row.campaign_id,
                campaignName: row.campaign_name,
                date: row.date_start,
                spend,
                impressions: Number(row.impressions || 0),
                clicks: Number(row.clicks || 0),
                reach: Number(row.reach || 0),
                cpc: Number(row.cpc || 0),
                cpm: Number(row.cpm || 0),
                ctr: Number(row.ctr || 0),
                purchases,
                purchaseValue,
                roas,
                rawActions: row.actions || [],
              },
            },
            upsert: true,
          },
        };
      });

      if (insightOps.length > 0) {
        await MetaInsight.bulkWrite(insightOps);
      }

      // 4. Account sync status SUCCESS mark karo
      account.syncStatus = "SUCCESS";
      account.lastSyncedAt = new Date();
      account.syncErrorMessage = null;
      await account.save();

      console.log(`[Pipeline] Sync completed successfully for ${accountId}`);
      return { success: true, totalCampaigns: campaigns.length, totalInsights: insights.length };
    } catch (error) {
      console.error(`[Pipeline] Sync error for ${accountId}:`, error.message);
      account.syncStatus = "FAILED";
      account.syncErrorMessage = error.message;
      await account.save().catch(() => {});
      return { success: false, error: error.message };
    }
  }
}

export default MetaSyncPipeline;
