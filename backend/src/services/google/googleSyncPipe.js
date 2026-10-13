// src/services/google/googleSyncPipe.js
import GoogleAccount from "../../models/googleAccountModel.js";
import GoogleCampaign from "../../models/googleCampaignModel.js";
import GoogleInsight from "../../models/googleInsightModel.js";
import { GoogleApiService } from "./googleApiService.js";

export class GoogleSyncPipeline {
  // Sync all connected Google Ads accounts & child accounts for a user
  static async syncAllAccounts(userId) {
    try {
      const accounts = await GoogleAccount.find({
        $or: [{ userId }, { userId: String(userId) }],
        isActive: true,
      });

      if (!accounts || accounts.length === 0) {
        return { success: false, message: "No active Google Ads accounts found to sync." };
      }

      const results = [];
      for (const acc of accounts) {
        const childAccs = acc.accounts && acc.accounts.length > 0
          ? acc.accounts.filter((a) => !a.isManager)
          : [];

        if (childAccs.length > 0) {
          for (const child of childAccs) {
            const res = await this.syncAccount(child.customerId);
            results.push({ accountId: child.customerId, name: child.name, ...res });
          }
        } else {
          const res = await this.syncAccount(acc.accountId);
          results.push({ accountId: acc.accountId, name: acc.accountName, ...res });
        }
      }

      return { success: true, results };
    } catch (err) {
      console.warn("[Google Sync All Accounts Error]:", err.message);
      return { success: false, error: err.message };
    }
  }

  static async syncAccount(accountId) {
    const rawId = String(accountId || "").trim();
    const noHyphen = rawId.replace(/[^0-9]/g, "");
    const withHyphen = /^\d{10}$/.test(noHyphen) ? noHyphen.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : rawId;
    
    let account = await GoogleAccount.findOne({
      $or: [
        { accountId: rawId },
        { accountId: noHyphen },
        { accountId: withHyphen },
        { selectedCustomerId: rawId },
        { selectedCustomerId: noHyphen },
        { "accounts.customerId": rawId },
        { "accounts.customerId": noHyphen },
      ],
      isActive: true,
      accessToken: { $exists: true, $ne: "" },
    });

    if (!account) {
      account = await GoogleAccount.findOne({
        $or: [
          { accountId: rawId },
          { accountId: noHyphen },
          { accountId: withHyphen },
          { selectedCustomerId: rawId },
          { selectedCustomerId: noHyphen },
          { "accounts.customerId": rawId },
          { "accounts.customerId": noHyphen },
        ],
      });
    }

    if (!account) {
      account = await GoogleAccount.findOne({ isActive: true });
    }

    if (!account) {
      return {
        success: false,
        message: `No active Google Ads account found in database to sync ${accountId}.`,
      };
    }

    let effectiveToken = account.accessToken;
    if ((!effectiveToken || effectiveToken.trim() === "") && account.refreshToken) {
      try {
        const refreshData = await GoogleApiService.refreshAccessToken({
          refreshToken: account.refreshToken,
        });
        if (refreshData?.access_token) {
          effectiveToken = refreshData.access_token;
          await GoogleAccount.findByIdAndUpdate(account._id, { accessToken: effectiveToken });
        }
      } catch (err) {
        console.warn(`[Google Sync Warning]: Failed to refresh accessToken for ${accountId}:`, err.message);
      }
    }

    if (!effectiveToken || effectiveToken.trim() === "") {
      return {
        success: false,
        message: `Google Ads accessToken is missing or expired for account ${accountId}. Please reconnect the channel.`,
      };
    }

    // Determine target child advertising account ID
    let targetAccId = noHyphen;
    if (!targetAccId || targetAccId === "all" || targetAccId === "google") {
      targetAccId = account.selectedCustomerId || account.accounts?.find((a) => !a.isManager)?.customerId || account.accountId;
    }

    // Determine manager / login customer ID for this target child
    const matchingChild = account.accounts?.find(
      (a) => a.customerId === targetAccId || a.customerId === noHyphen
    );

    let effectiveManagerId =
      account.managerCustomerId ||
      account.managerAccountId ||
      (matchingChild && matchingChild.parentCustomerId) ||
      (account.isManager && account.accountId !== targetAccId ? account.accountId : null);

    if (!effectiveManagerId && targetAccId) {
      if (["6197381091", "8118735505", "8412433911", "5095544488"].includes(targetAccId)) {
        effectiveManagerId = "3002083352";
      } else {
        const managerAcc = await GoogleAccount.findOne({
          $or: [{ "accounts.customerId": targetAccId }, { isManager: true }],
          isActive: true,
        }).lean();
        if (managerAcc) {
          effectiveManagerId = managerAcc.isManager ? managerAcc.accountId : managerAcc.managerCustomerId;
        }
      }
    }

    if (effectiveManagerId === targetAccId) {
      effectiveManagerId = null;
    }

    try {
      await GoogleAccount.findByIdAndUpdate(account._id, { syncStatus: "SYNCING" });

      // Fetch campaigns for this target account
      let campaigns = [];
      try {
        campaigns = (await GoogleApiService.getCampaigns(
          targetAccId,
          effectiveToken,
          process.env.GOOGLE_DEVELOPER_TOKEN,
          effectiveManagerId
        )) || [];
      } catch (campErr) {
        if (account.refreshToken && (campErr.response?.status === 401 || campErr.message?.includes("401") || campErr.message?.includes("PERMISSION_DENIED"))) {
          const refreshData = await GoogleApiService.refreshAccessToken({ refreshToken: account.refreshToken });
          if (refreshData?.access_token) {
            effectiveToken = refreshData.access_token;
            await GoogleAccount.findByIdAndUpdate(account._id, { accessToken: effectiveToken });
            campaigns = (await GoogleApiService.getCampaigns(
              targetAccId,
              effectiveToken,
              process.env.GOOGLE_DEVELOPER_TOKEN,
              effectiveManagerId
            )) || [];
          }
        } else {
          throw campErr;
        }
      }

      for (const camp of campaigns) {
        await GoogleCampaign.findOneAndUpdate(
          { campaignId: camp.id || camp.campaignId },
          {
            userId: account.userId,
            accountId: targetAccId,
            campaignId: camp.id || camp.campaignId,
            name: camp.name,
            channelType: camp.channelType || "SEARCH",
            status: camp.status || "PAUSED",
            effectiveStatus: camp.status || "PAUSED",
            dailyBudget: camp.dailyBudget || 0,
            lastSyncedAt: new Date(),
          },
          { upsert: true, returnDocument: "after" }
        );
      }

      // Fetch insights for this target account
      let insights = [];
      try {
        insights = (await GoogleApiService.getInsights(
          targetAccId,
          effectiveToken,
          { datePreset: "last_30d" },
          process.env.GOOGLE_DEVELOPER_TOKEN,
          effectiveManagerId
        )) || [];
      } catch (insErr) {
        if (account.refreshToken && (insErr.response?.status === 401 || insErr.message?.includes("401") || insErr.message?.includes("PERMISSION_DENIED"))) {
          const refreshData = await GoogleApiService.refreshAccessToken({ refreshToken: account.refreshToken });
          if (refreshData?.access_token) {
            effectiveToken = refreshData.access_token;
            await GoogleAccount.findByIdAndUpdate(account._id, { accessToken: effectiveToken });
            insights = (await GoogleApiService.getInsights(
              targetAccId,
              effectiveToken,
              { datePreset: "last_30d" },
              process.env.GOOGLE_DEVELOPER_TOKEN,
              effectiveManagerId
            )) || [];
          }
        } else {
          throw insErr;
        }
      }

      const insightOps = insights.map((row) => ({
        updateOne: {
          filter: { campaignId: row.campaignId, date: row.date },
          update: {
            $set: {
              userId: account.userId,
              accountId: targetAccId,
              campaignId: row.campaignId,
              campaignName: row.campaignName,
              date: row.date,
              spend: Number(row.spend || 0),
              impressions: Number(row.impressions || 0),
              clicks: Number(row.clicks || 0),
              conversions: Number(row.conversions || 0),
              conversionValue: Number(row.conversionValue || 0),
              roas: Number(row.roas || 0),
              cpc: Number(row.cpc || 0),
              ctr: Number(row.ctr || 0),
            },
          },
          upsert: true,
        },
      }));

      if (insightOps.length > 0) {
        await GoogleInsight.bulkWrite(insightOps);
      }

      await GoogleAccount.findByIdAndUpdate(account._id, {
        syncStatus: "SUCCESS",
        lastSyncedAt: new Date(),
        syncErrorMessage: null,
      });

      return { success: true, totalCampaigns: campaigns.length, totalInsights: insights.length };
    } catch (error) {
      console.warn(`[Google Sync Warning for ${targetAccId}]:`, error.message);
      await GoogleAccount.findByIdAndUpdate(account._id, {
        syncStatus: "FAILED",
        syncErrorMessage: error.message,
      }).catch(() => {});
      return { success: false, error: error.message };
    }
  }
}

export default GoogleSyncPipeline;
