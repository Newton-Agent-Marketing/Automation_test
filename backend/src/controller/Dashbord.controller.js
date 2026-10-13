// src/controllers/metaDashboardController.js
import MetaInsight from "../models/metaInsight.js";
import MetaCampaign from "../models/metaCampaign.js";
import MetaAccount from "../models/metaAccount.js";
import GoogleInsight from "../models/googleInsightModel.js";
import GoogleCampaign from "../models/googleCampaignModel.js";
import GoogleAccount from "../models/googleAccountModel.js";
import User from "../models/authModel.js";
import { MetaSyncPipeline } from "../services/meta/metaSyncPipe.js";
import { GoogleSyncPipeline } from "../services/google/googleSyncPipe.js";

// Clean up any previously auto-seeded dummy data
(async () => {
  try {
    await Promise.all([
      MetaInsight.deleteMany({ campaignId: "cmp_meta_growth_01" }),
      MetaCampaign.deleteMany({ campaignId: "cmp_meta_growth_01" }),
    ]);
  } catch (err) {
    // ignore
  }
})();

export class MetaDashboardController {
  // Helper to determine active channel and account filter with multi-format matching
  static async resolveAccountFilter(userId, channel, accountId) {
    const isGoogle = Boolean(
      channel && (channel.toLowerCase().includes("google") || channel === "google")
    );

    const userQuery = {
      $or: [{ userId }, { userId: String(userId) }],
    };

    let targetAccountIds = [];
    let allUserAccounts = [];

    if (isGoogle) {
      allUserAccounts = await GoogleAccount.find(userQuery).lean();
      for (const a of allUserAccounts) {
        if (a.accountId) targetAccountIds.push(a.accountId);
        if (a.selectedCustomerId) targetAccountIds.push(a.selectedCustomerId);
        if (a.accounts && Array.isArray(a.accounts)) {
          for (const child of a.accounts) {
            if (child.customerId) targetAccountIds.push(child.customerId);
          }
        }
      }
    } else {
      allUserAccounts = await MetaAccount.find(userQuery).lean();
      targetAccountIds = allUserAccounts.map((a) => a.accountId).filter(Boolean);
    }

    const filter = {};
    const isAll = !accountId || accountId.trim() === "" || accountId.toUpperCase() === "ALL";

    if (!isAll) {
      const cleanAccId = accountId.trim();
      const cleanMetaId = cleanAccId.startsWith("act_") ? cleanAccId : `act_${cleanAccId}`;
      const rawMetaId = cleanAccId.replace(/^act_/, "");
      const noHyphenGId = cleanAccId.replace(/-/g, "");
      const withHyphenGId = /^\d{10}$/.test(noHyphenGId)
        ? noHyphenGId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")
        : cleanAccId;

      // Also check if accountId matches by accountName or child customerId
      let matchedAccountId = null;
      for (const a of allUserAccounts) {
        if (
          a.accountId === cleanAccId ||
          a.accountId === cleanMetaId ||
          a.accountId === rawMetaId ||
          (a.accountName && a.accountName.toLowerCase() === cleanAccId.toLowerCase()) ||
          String(a._id) === cleanAccId
        ) {
          matchedAccountId = a.accountId;
          break;
        }
        if (a.accounts && Array.isArray(a.accounts)) {
          const childMatch = a.accounts.find(
            (c) =>
              c.customerId === cleanAccId ||
              c.customerId === noHyphenGId ||
              c.name?.toLowerCase() === cleanAccId.toLowerCase()
          );
          if (childMatch) {
            matchedAccountId = childMatch.customerId;
            break;
          }
        }
      }

      const candidateIds = [
        cleanAccId,
        cleanMetaId,
        rawMetaId,
        noHyphenGId,
        withHyphenGId,
      ];

      if (matchedAccountId) {
        candidateIds.push(matchedAccountId);
        candidateIds.push(
          matchedAccountId.startsWith("act_")
            ? matchedAccountId
            : `act_${matchedAccountId}`
        );
        candidateIds.push(matchedAccountId.replace(/^act_/, ""));
        candidateIds.push(matchedAccountId.replace(/-/g, ""));
      }

      const uniqueCandidateIds = Array.from(new Set(candidateIds.filter(Boolean)));
      filter.accountId = { $in: uniqueCandidateIds };

      // Immediate auto-sync if account is connected but has no records yet
      const targetSyncId = matchedAccountId || cleanAccId;
      if (targetSyncId) {
        if (isGoogle) {
          const cnt = await GoogleInsight.countDocuments({ accountId: { $in: uniqueCandidateIds } });
          if (cnt === 0) {
            await GoogleSyncPipeline.syncAccount(targetSyncId).catch(() => {});
          }
        } else {
          const cnt = await MetaInsight.countDocuments({ accountId: { $in: uniqueCandidateIds } });
          if (cnt === 0) {
            await MetaSyncPipeline.syncAccount(targetSyncId).catch(() => {});
          }
        }
      }
    } else if (targetAccountIds.length > 0) {
      const expandedTargetIds = [];
      for (const id of targetAccountIds) {
        expandedTargetIds.push(id);
        if (isGoogle) {
          expandedTargetIds.push(id.replace(/-/g, ""));
          if (/^\d{10}$/.test(id.replace(/-/g, ""))) {
            expandedTargetIds.push(id.replace(/-/g, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3"));
          }
        } else {
          expandedTargetIds.push(id.startsWith("act_") ? id : `act_${id}`);
          expandedTargetIds.push(id.replace(/^act_/, ""));
        }
      }
      const uniqueExpandedIds = Array.from(new Set(expandedTargetIds.filter(Boolean)));
      filter.accountId = { $in: uniqueExpandedIds };

      // If all accounts selected but 0 insights in DB, sync all connected accounts immediately
      if (isGoogle) {
        const cnt = await GoogleInsight.countDocuments({ accountId: { $in: uniqueExpandedIds } });
        if (cnt === 0) {
          await GoogleSyncPipeline.syncAllAccounts(userId).catch(() => {});
        }
      } else {
        const cnt = await MetaInsight.countDocuments({ accountId: { $in: uniqueExpandedIds } });
        if (cnt === 0 && targetAccountIds[0]) {
          await MetaSyncPipeline.syncAccount(targetAccountIds[0]).catch(() => {});
        }
      }
    } else {
      return { isGoogle, filter: null, hasAccounts: false, allUserAccounts };
    }

    return { isGoogle, filter, hasAccounts: allUserAccounts.length > 0, allUserAccounts };
  }

  // 1. Dashboard Top Summary Cards (Total Spend, Impressions, ROAS, Purchases)
  static async getOverviewStats(req, res) {
    try {
      const userId = req.user._id;
      const { channel, accountId, startDate, endDate } = req.query;

      const { isGoogle, filter, hasAccounts, allUserAccounts } = await MetaDashboardController.resolveAccountFilter(
        userId,
        channel,
        accountId
      );

      // Also calculate all-channels breakdown for Channel Performance & Top Channels charts
      const [metaAccounts, googleAccounts] = await Promise.all([
        MetaAccount.find({ $or: [{ userId }, { userId: String(userId) }] }).select("accountId").lean(),
        GoogleAccount.find({ $or: [{ userId }, { userId: String(userId) }] }).select("accountId accounts selectedCustomerId").lean(),
      ]);

      const metaAccountIds = [];
      metaAccounts.forEach((a) => {
        if (a.accountId) {
          metaAccountIds.push(a.accountId);
          metaAccountIds.push(a.accountId.startsWith("act_") ? a.accountId : `act_${a.accountId}`);
          metaAccountIds.push(a.accountId.replace(/^act_/, ""));
        }
      });

      const googleAccountIds = [];
      googleAccounts.forEach((a) => {
        if (a.accountId) {
          googleAccountIds.push(a.accountId);
          googleAccountIds.push(a.accountId.replace(/-/g, ""));
        }
        if (a.selectedCustomerId) {
          googleAccountIds.push(a.selectedCustomerId);
          googleAccountIds.push(a.selectedCustomerId.replace(/-/g, ""));
        }
        if (a.accounts && Array.isArray(a.accounts)) {
          a.accounts.forEach((child) => {
            if (child.customerId) {
              googleAccountIds.push(child.customerId);
              googleAccountIds.push(child.customerId.replace(/-/g, ""));
            }
          });
        }
      });

      const dateQuery = {};
      if (startDate && endDate) {
        dateQuery.date = { $gte: startDate, $lte: endDate };
      }

      const [metaInsightsAll, googleInsightsAll] = await Promise.all([
        metaAccountIds.length > 0 ? MetaInsight.find({ accountId: { $in: Array.from(new Set(metaAccountIds)) }, ...dateQuery }).lean() : [],
        googleAccountIds.length > 0 ? GoogleInsight.find({ accountId: { $in: Array.from(new Set(googleAccountIds)) }, ...dateQuery }).lean() : [],
      ]);

      const sumChannel = (arr, isG) =>
        arr.reduce(
          (acc, item) => {
            acc.spend += Number(item.spend || 0);
            acc.impressions += Number(item.impressions || 0);
            acc.clicks += Number(item.clicks || 0);
            acc.conversions += Number(isG ? (item.conversions || item.purchases || 0) : (item.purchases || item.conversions || 0));
            acc.revenue += Number(isG ? (item.conversionValue || item.purchaseValue || 0) : (item.purchaseValue || item.conversionValue || 0));
            return acc;
          },
          { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
        );

      const metaSum = sumChannel(metaInsightsAll, false);
      const googleSum = sumChannel(googleInsightsAll, true);

      const metaCpr = metaSum.conversions > 0 ? Number((metaSum.spend / metaSum.conversions).toFixed(2)) : 0;
      const metaRoas = metaSum.spend > 0 ? Number((metaSum.revenue / metaSum.spend).toFixed(2)) : 0;
      const googleCpr = googleSum.conversions > 0 ? Number((googleSum.spend / googleSum.conversions).toFixed(2)) : 0;
      const googleRoas = googleSum.spend > 0 ? Number((googleSum.revenue / googleSum.spend).toFixed(2)) : 0;

      const channelBreakdown = [];
      if (metaAccounts.length > 0 || metaSum.spend > 0) {
        channelBreakdown.push({
          name: "Meta Ads",
          channelKey: "meta",
          spend: metaSum.spend,
          conversions: metaSum.conversions,
          clicks: metaSum.clicks,
          impressions: metaSum.impressions,
          revenue: metaSum.revenue,
          cpr: metaCpr,
          roas: metaRoas,
          isConnected: metaAccounts.length > 0,
        });
      }
      if (googleAccounts.length > 0 || googleSum.spend > 0) {
        channelBreakdown.push({
          name: "Google Ads",
          channelKey: "google",
          spend: googleSum.spend,
          conversions: googleSum.conversions,
          clicks: googleSum.clicks,
          impressions: googleSum.impressions,
          revenue: googleSum.revenue,
          cpr: googleCpr,
          roas: googleRoas,
          isConnected: googleAccounts.length > 0,
        });
      }

      if (!hasAccounts && !accountId) {
        return res.json({
          success: true,
          data: {
            totalSpend: 0,
            totalImpressions: 0,
            totalClicks: 0,
            totalPurchases: 0,
            totalRevenue: 0,
            overallRoas: 0,
            avgCtr: 0,
            recordsCount: 0,
            channelBreakdown,
            accountBreakdown: [],
            campaignBreakdown: [],
          },
        });
      }

      const queryFilter = { ...(filter || {}) };
      if (startDate && endDate) {
        queryFilter.date = { $gte: startDate, $lte: endDate };
      }

      let insights = [];
      if (isGoogle) {
        insights = await GoogleInsight.find(queryFilter).lean();
      } else {
        insights = await MetaInsight.find(queryFilter).lean();
      }

      const totals = insights.reduce(
        (acc, item) => {
          acc.totalSpend += Number(item.spend || 0);
          acc.totalImpressions += Number(item.impressions || 0);
          acc.totalClicks += Number(item.clicks || 0);
          acc.totalPurchases += Number(item.purchases || item.conversions || 0);
          acc.totalRevenue += Number(item.purchaseValue || item.conversionValue || 0);
          return acc;
        },
        { totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalPurchases: 0, totalRevenue: 0 }
      );

      const overallRoas =
        totals.totalSpend > 0 ? Number((totals.totalRevenue / totals.totalSpend).toFixed(2)) : 0;
      const avgCtr =
        totals.totalImpressions > 0
          ? Number(((totals.totalClicks / totals.totalImpressions) * 100).toFixed(2))
          : 0;

      // Compute accountBreakdown & campaignBreakdown for the filtered channel
      const accountMap = {};
      const campaignMap = {};

      insights.forEach((item) => {
        const accId = item.accountId || "Account";
        if (!accountMap[accId]) {
          accountMap[accId] = {
            name: accId,
            accountId: accId,
            spend: 0,
            conversions: 0,
            clicks: 0,
            impressions: 0,
            revenue: 0,
          };
        }
        accountMap[accId].spend += Number(item.spend || 0);
        accountMap[accId].impressions += Number(item.impressions || 0);
        accountMap[accId].clicks += Number(item.clicks || 0);
        accountMap[accId].conversions += Number(isGoogle ? (item.conversions || item.purchases || 0) : (item.purchases || item.conversions || 0));
        accountMap[accId].revenue += Number(isGoogle ? (item.conversionValue || item.purchaseValue || 0) : (item.purchaseValue || item.conversionValue || 0));

        const campId = item.campaignName || item.campaignId || "Campaign";
        if (!campaignMap[campId]) {
          campaignMap[campId] = {
            name: campId,
            campaignId: item.campaignId,
            spend: 0,
            conversions: 0,
            clicks: 0,
            impressions: 0,
            revenue: 0,
          };
        }
        campaignMap[campId].spend += Number(item.spend || 0);
        campaignMap[campId].impressions += Number(item.impressions || 0);
        campaignMap[campId].clicks += Number(item.clicks || 0);
        campaignMap[campId].conversions += Number(isGoogle ? (item.conversions || item.purchases || 0) : (item.purchases || item.conversions || 0));
        campaignMap[campId].revenue += Number(isGoogle ? (item.conversionValue || item.purchaseValue || 0) : (item.purchaseValue || item.conversionValue || 0));
      });

      const accountBreakdown = Object.values(accountMap).map((acc) => {
        let displayName = acc.accountId;
        if (isGoogle) {
          for (const gAcc of allUserAccounts || []) {
            const matchedChild = gAcc.accounts?.find((c) => c.customerId === acc.accountId || c.customerId === acc.accountId.replace(/-/g, ""));
            if (matchedChild?.name) {
              displayName = matchedChild.name;
              break;
            }
          }
        } else {
          const matchedMeta = (allUserAccounts || []).find((m) => m.accountId === acc.accountId || m.accountId === `act_${acc.accountId}`);
          if (matchedMeta?.accountName) displayName = matchedMeta.accountName;
        }
        return {
          ...acc,
          name: displayName,
          cpr: acc.conversions > 0 ? Number((acc.spend / acc.conversions).toFixed(2)) : 0,
          roas: acc.spend > 0 ? Number((acc.revenue / acc.spend).toFixed(2)) : 0,
        };
      });

      const campaignBreakdown = Object.values(campaignMap).map((c) => ({
        ...c,
        cpr: c.conversions > 0 ? Number((c.spend / c.conversions).toFixed(2)) : 0,
        roas: c.spend > 0 ? Number((c.revenue / c.spend).toFixed(2)) : 0,
      }));

      res.json({
        success: true,
        data: {
          ...totals,
          overallRoas,
          avgCtr,
          recordsCount: insights.length,
          channel: isGoogle ? "Google Ads" : "Meta Ads",
          accountId: accountId || "ALL",
          channelBreakdown,
          accountBreakdown,
          campaignBreakdown,
        },
      });
    } catch (error) {
      console.error("[Dashboard OverviewStats Error]:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // 2. Chart ke liye Date-wise performance (Line / Bar Charts)
  static async getDailyPerformance(req, res) {
    try {
      const userId = req.user._id;
      const { channel, accountId, startDate, endDate } = req.query;

      const { isGoogle, filter, hasAccounts } = await MetaDashboardController.resolveAccountFilter(
        userId,
        channel,
        accountId
      );

      if (!hasAccounts && !accountId) {
        return res.json({ success: true, data: [] });
      }

      const queryFilter = { ...(filter || {}) };
      if (startDate && endDate) {
        queryFilter.date = { $gte: startDate, $lte: endDate };
      }

      let dailyData = [];
      if (isGoogle) {
        dailyData = await GoogleInsight.aggregate([
          { $match: queryFilter },
          {
            $group: {
              _id: "$date",
              spend: { $sum: "$spend" },
              clicks: { $sum: "$clicks" },
              impressions: { $sum: "$impressions" },
              revenue: { $sum: "$conversionValue" },
              purchases: { $sum: "$conversions" },
            },
          },
          { $sort: { _id: 1 } },
        ]);
      } else {
        dailyData = await MetaInsight.aggregate([
          { $match: queryFilter },
          {
            $group: {
              _id: "$date",
              spend: { $sum: "$spend" },
              clicks: { $sum: "$clicks" },
              impressions: { $sum: "$impressions" },
              revenue: { $sum: "$purchaseValue" },
              purchases: { $sum: "$purchases" },
            },
          },
          { $sort: { _id: 1 } },
        ]);
      }

      res.json({ success: true, data: dailyData });
    } catch (error) {
      console.error("[Dashboard DailyPerformance Error]:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // 3. Campaigns List Table
  static async getCampaigns(req, res) {
    try {
      const userId = req.user._id;
      const { channel, accountId } = req.query;

      const { isGoogle, filter, hasAccounts } = await MetaDashboardController.resolveAccountFilter(
        userId,
        channel,
        accountId
      );

      if (!hasAccounts && !accountId) {
        return res.json({ success: true, data: [] });
      }

      let campaigns = [];
      if (isGoogle) {
        const campaignFilter = filter?.accountId ? { accountId: filter.accountId } : { userId };
        campaigns = await GoogleCampaign.find(campaignFilter).sort({ updatedAt: -1 }).lean();
        if (campaigns.length === 0) {
          const targetId = accountId && accountId !== "ALL" ? accountId : null;
          if (targetId) {
            await GoogleSyncPipeline.syncAccount(targetId).catch(() => {});
            campaigns = await GoogleCampaign.find(campaignFilter).sort({ updatedAt: -1 }).lean();
          } else {
            await GoogleSyncPipeline.syncAllAccounts(userId).catch(() => {});
            campaigns = await GoogleCampaign.find({ userId }).sort({ updatedAt: -1 }).lean();
          }
        }
      } else {
        const campaignFilter = filter?.accountId ? { accountId: filter.accountId } : { userId };
        campaigns = await MetaCampaign.find(campaignFilter).sort({ updatedAt: -1 }).lean();
        if (campaigns.length === 0) {
          const targetId = accountId && accountId !== "ALL" ? accountId : null;
          if (targetId) {
            await MetaSyncPipeline.syncAccount(targetId).catch(() => {});
            campaigns = await MetaCampaign.find(campaignFilter).sort({ updatedAt: -1 }).lean();
          }
        }
      }

      res.json({ success: true, data: campaigns });
    } catch (error) {
      console.error("[Dashboard GetCampaigns Error]:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // 4. User Dashboard Preferences (Saved Date Range & Channel & Account)
  static async getPreferences(req, res) {
    try {
      const user = await User.findById(req.user._id).select("dashboardSettings");
      res.json({
        success: true,
        data: user?.dashboardSettings || {},
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async savePreferences(req, res) {
    try {
      const { startDate, endDate, preset, channel, accountId } = req.body;
      const userId = req.user._id;

      if (accountId && typeof accountId === "string" && accountId.trim()) {
        const cleanAcc = accountId.trim();
        const isMetaChannel = channel === "meta" || String(cleanAcc).startsWith("act_");
        
        let isAuthorized = false;
        if (isMetaChannel) {
          const MetaAccount = (await import("../models/metaAccount.js")).default;
          const cleanId = cleanAcc.startsWith("act_") ? cleanAcc : `act_${cleanAcc}`;
          const rawId = cleanAcc.replace(/^act_/, "");
          const matchMeta = await MetaAccount.findOne({
            userId,
            isActive: true,
            $or: [{ accountId: cleanAcc }, { accountId: cleanId }, { accountId: rawId }],
          });
          if (matchMeta) isAuthorized = true;
        } else {
          const GoogleAccount = (await import("../models/googleAccountModel.js")).default;
          const cleanNum = cleanAcc.replace(/[^0-9]/g, "");
          const matchGoogle = await GoogleAccount.findOne({
            userId,
            isActive: true,
            $or: [
              { accountId: cleanAcc },
              { selectedCustomerId: cleanAcc },
              { selectedCustomerId: cleanNum },
              { "accounts.customerId": cleanAcc },
              { "accounts.customerId": cleanNum },
            ],
          });
          if (matchGoogle) isAuthorized = true;
        }

        if (!isAuthorized) {
          return res.status(403).json({
            success: false,
            message: `Selected Ad Account "${accountId}" is unauthorized or does not belong to your connected accounts.`,
          });
        }
      }

      const user = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            "dashboardSettings.startDate": startDate,
            "dashboardSettings.endDate": endDate,
            "dashboardSettings.preset": preset,
            "dashboardSettings.channel": channel,
            ...(accountId !== undefined ? { "dashboardSettings.accountId": accountId } : {}),
          },
        },
        { returnDocument: "after" }
      ).select("dashboardSettings");

      res.json({
        success: true,
        message: "Dashboard preferences saved in database",
        data: user?.dashboardSettings,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // 5. Frontend se "Sync Now" button click karne par turant sync trigger karna (ONLY for connected accounts)
  static async triggerManualSync(req, res) {
    try {
      const userId = req.user._id;
      let { accountId, channel } = req.body;

      const isGoogle = channel && (channel.toLowerCase().includes("google") || channel === "google");

      if (isGoogle) {
        let account = null;
        if (accountId) {
          const noHyphen = accountId.replace(/-/g, "");
          const withHyphen = /^\d{10}$/.test(noHyphen) ? noHyphen.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : accountId;
          account = await GoogleAccount.findOne({
            userId,
            isActive: true,
            $or: [
              { accountId },
              { accountId: noHyphen },
              { accountId: withHyphen },
              { accountName: new RegExp(`^${accountId}$`, "i") },
            ],
          });
        }
        if (!account) {
          account = await GoogleAccount.findOne({
            userId,
            isActive: true,
            accessToken: { $exists: true, $ne: "" },
          });
        }

        if (!account || (!account.accessToken && !account.refreshToken)) {
          return res.status(400).json({
            success: false,
            message: "No connected Google Ads account found with valid credentials.",
          });
        }

        const result = await GoogleSyncPipeline.syncAccount(account.accountId);
        return res.json({
          success: true,
          message: `Sync completed successfully for Google account ${account.accountName || account.accountId}`,
          data: result,
        });
      } else {
        let account = null;
        if (accountId) {
          const cleanId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
          const rawId = accountId.replace(/^act_/, "");
          account = await MetaAccount.findOne({
            userId,
            isActive: true,
            $or: [
              { accountId },
              { accountId: cleanId },
              { accountId: rawId },
              { accountName: new RegExp(`^${accountId}$`, "i") },
              { accountName: accountId },
            ],
          });
        }
        if (!account) {
          account = await MetaAccount.findOne({
            userId,
            isActive: true,
            accessToken: { $exists: true, $ne: "" },
          });
        }

        if (!account || !account.accessToken) {
          return res.status(400).json({
            success: false,
            message: "No connected Meta Ads account found with valid credentials.",
          });
        }

        const cleanSyncId = account.accountId.startsWith("act_")
          ? account.accountId
          : `act_${account.accountId}`;
        const result = await MetaSyncPipeline.syncAccount(cleanSyncId);
        return res.json({
          success: true,
          message: `Sync completed successfully for Meta account ${account.accountName || cleanSyncId}`,
          data: result,
        });
      }
    } catch (error) {
      console.error("[Dashboard ManualSync Error]:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
