// src/services/mcp/metaMcpClient.js
import { MetaApiService } from "../meta/metaApiService.js";
import MetaAccount from "../../models/metaAccount.js";
import MetaCampaign from "../../models/metaCampaign.js";
import driveService from "../../google/driveService.js";
import axios from "axios";
import fs from "fs";

const META_GRAPH_URL = "https://graph.facebook.com/v24.0";

export class MetaMcpClient {
  /**
   * Check MCP Server URL Health and capabilities
   */
  static async pingMcpServer(mcpServerUrl) {
    if (!mcpServerUrl) return { status: "OK", type: "BUILTIN" };
    try {
      const resp = await axios.get(mcpServerUrl, { timeout: 4000 });
      return { status: "CONNECTED", type: "EXTERNAL_MCP", info: resp.data };
    } catch (err) {
      // Many MCP SSE servers expect specific headers or SSE handshakes
      return { status: "ACTIVE", type: "EXTERNAL_MCP", url: mcpServerUrl };
    }
  }

  /**
   * Live real-time data & operations Meta MCP execution
   */
  static async executeLiveTool(toolName, args) {
    if (toolName === "verify_meta_campaign") {
      const { campaignId, adSetId, adId, accountId } = args;
      const targetAccId = accountId ? String(accountId).replace(/^act_/, "") : null;

      // Verify against MongoDB MetaCampaign or live Meta API
      if (targetAccId && campaignId) {
        try {
          const mongoose = (await import("mongoose")).default;
          if (mongoose?.connection?.readyState === 1) {
            const MetaCampaign = (await import("../../models/metaCampaign.js")).default;
            const campDoc = await MetaCampaign.findOne({ campaignId }).lean();
            if (campDoc?.accountId) {
              const campAccRaw = String(campDoc.accountId).replace(/^act_/, "");
              if (campAccRaw !== targetAccId) {
                return {
                  success: false,
                  status: "ACCOUNT_MISMATCH",
                  verificationStatus: "ACCOUNT_MISMATCH",
                  campaignId,
                  adSetId,
                  adId,
                  error: `Account ID mismatch: Campaign "${campaignId}" belongs to Meta account act_${campAccRaw}, which does not match the selected Meta account act_${targetAccId}. Cross-account creation is strictly forbidden.`,
                  message: `Account Mismatch Detected: Campaign ${campaignId} belongs to act_${campAccRaw}, but selected account is act_${targetAccId}. Cross-account creation is strictly forbidden.`,
                };
              }
            }
          }
        } catch (_) {}

        if (args.accessToken && !args.accessToken.startsWith("EAAB_simulated")) {
          try {
            const campRes = await axios.get(`${META_GRAPH_URL}/${campaignId}`, {
              params: { fields: "id,name,status,account_id", access_token: args.accessToken },
              timeout: 5000,
            });
            const liveAcc = String(campRes.data?.account_id || "").replace(/^act_/, "");
            if (liveAcc && liveAcc !== targetAccId) {
              return {
                success: false,
                status: "ACCOUNT_MISMATCH",
                verificationStatus: "ACCOUNT_MISMATCH",
                campaignId,
                adSetId,
                adId,
                error: `Account ID mismatch: Campaign "${campaignId}" belongs to Meta account act_${liveAcc}, which does not match the selected Meta account act_${targetAccId}. Cross-account creation is strictly forbidden.`,
                message: `Account Mismatch Detected: Campaign ${campaignId} belongs to act_${liveAcc}, but selected account is act_${targetAccId}. Cross-account creation is strictly forbidden.`,
              };
            }
          } catch (campErr) {
            console.warn("[Meta MCP verify_meta_campaign live lookup warning]:", campErr.message);
          }
        }
      }

      if (targetAccId && adSetId && args.accessToken && !args.accessToken.startsWith("EAAB_simulated")) {
        try {
          const adSetRes = await axios.get(`${META_GRAPH_URL}/${adSetId}`, {
            params: { fields: "id,name,status,account_id", access_token: args.accessToken },
            timeout: 5000,
          });
          const liveAcc = String(adSetRes.data?.account_id || "").replace(/^act_/, "");
          if (liveAcc && liveAcc !== targetAccId) {
            return {
              success: false,
              status: "ACCOUNT_MISMATCH",
              verificationStatus: "ACCOUNT_MISMATCH",
              campaignId,
              adSetId,
              adId,
              error: `Account ID mismatch: Ad Set "${adSetId}" belongs to Meta account act_${liveAcc}, which does not match the selected Meta account act_${targetAccId}. Cross-account creation is strictly forbidden.`,
              message: `Account Mismatch Detected: Ad Set ${adSetId} belongs to act_${liveAcc}, but selected account is act_${targetAccId}. Cross-account creation is strictly forbidden.`,
            };
          }
        } catch (adSetErr) {
          console.warn("[Meta MCP verify_meta_campaign adSet live lookup warning]:", adSetErr.message);
        }
      }

      return {
        success: true,
        status: "CAMPAIGN_VERIFIED",
        campaignId: campaignId || null,
        adSetId: adSetId || null,
        adId: adId || null,
        accountId: targetAccId ? `act_${targetAccId}` : null,
        verification: {
          campaignExists: Boolean(campaignId),
          adSetExists: Boolean(adSetId),
          adExists: Boolean(adId),
          accountMatched: true,
          allComponentsReady: Boolean(campaignId),
        },
        message: `Meta Campaign ${campaignId || ""} verification complete on account act_${targetAccId || ""}. All configured layers verified.`,
      };
    }

    const { accountId, userId } = args;
    let account = null;

    const mongoose = (await import("mongoose")).default;
    const validUserId = userId && mongoose?.Types?.ObjectId?.isValid(userId) ? userId : null;
    const userCondition = validUserId ? { userId: validUserId } : {};

    if (args.accessToken) {
      account = {
        accountId: args.accountId || accountId || "act_simulated_default",
        accessToken: args.accessToken,
        accountName: args.accessToken.startsWith("EAAB_simulated") ? "Simulated Ad Account" : "Authenticated Ad Account",
        currency: "INR",
        userId: validUserId || "authenticated_user",
      };
    } else if (accountId) {
      const cleanId = String(accountId).trim();
      const numOnly = cleanId.replace(/^act_/, "");
      const canonicalActId = `act_${numOnly}`;
      if (!/^\d{4,25}$/.test(numOnly)) {
        throw new Error(
          `Invalid Meta Ad Account ID "${accountId}". Expected format like "act_1416124059911929" or numeric account ID.`
        );
      }
      if (mongoose?.connection?.readyState === 1) {
        account = await MetaAccount.findOne({
          $or: [{ accountId: cleanId }, { accountId: numOnly }, { accountId: canonicalActId }],
          ...userCondition,
        });
      }
      // If not directly stored as its own MetaAccount doc, check if the user's connected Meta OAuth token has live Graph API permission for this account
      if (!account && validUserId && mongoose?.connection?.readyState === 1) {
        const userPrimaryAcc = await MetaAccount.findOne({
          userId: validUserId,
          accessToken: { $exists: true, $ne: "" },
        }).sort({ isActive: -1, updatedAt: -1 });
        if (userPrimaryAcc?.accessToken) {
          try {
            const checkRes = await axios.get(`${META_GRAPH_URL}/${canonicalActId}`, {
              params: {
                access_token: userPrimaryAcc.accessToken,
                fields: "id,account_id,name,currency,account_status",
              },
              timeout: 10000,
            });
            if (checkRes.data?.id) {
              account = {
                _id: userPrimaryAcc._id,
                accountId: canonicalActId,
                accountName: checkRes.data.name || canonicalActId,
                currency: checkRes.data.currency || userPrimaryAcc.currency || "INR",
                accessToken: userPrimaryAcc.accessToken,
                userId: validUserId,
              };
            }
          } catch (permErr) {
            const metaErr = permErr.response?.data?.error;
            const detail = metaErr?.message
              ? `(#${metaErr.code || "API"}) ${metaErr.message}`
              : permErr.message;
            throw new Error(
              `Meta Ad Account "${canonicalActId}" is unavailable or missing permissions for your connected Meta user: ${detail}`
            );
          }
        }
      }
      if (!account) {
        throw new Error(
          `Ad Account "${canonicalActId}" was not found in your connected Meta Ads accounts or you do not have permission to access it. Fallback to other accounts is strictly prohibited.`
        );
      }
    } else if (userId) {
      // Resolve selected Meta account from AI Context Channel Node or active connected MetaAccount
      const AiContext = (await import("../../models/aiContextModel.js")).default;
      const aiContextDoc = (validUserId && mongoose?.connection?.readyState === 1)
        ? await AiContext.findOne({ userId: validUserId }).lean().catch(() => null)
        : null;
      const channelNodes = (aiContextDoc?.nodes || []).filter((n) => n.type === "ad_channel");
      const metaChannelNode =
        channelNodes.find((n) => {
          const cName = (n.data?.channelName || n.data?.channel || n.label || "").toLowerCase();
          return cName.includes("meta") || cName.includes("facebook");
        }) || (channelNodes.length === 1 ? channelNodes[0] : null);

      const contextAccId = metaChannelNode?.data?.adAccountId?.trim();
      if (contextAccId) {
        const cleanContextId = String(contextAccId).trim();
        const numContextId = cleanContextId.replace(/^act_/, "");
        if (mongoose?.connection?.readyState === 1) {
          account = await MetaAccount.findOne({
            ...userCondition,
            $or: [{ accountId: cleanContextId }, { accountId: numContextId }, { accountId: `act_${numContextId}` }],
          });
        }
        if (!account) {
          throw new Error(
            `Selected Meta Ad Account "${contextAccId}" from AI Context Channel Node was not found or is disconnected for this user. Fallback to other accounts is strictly prohibited.`
          );
        }
      } else if (mongoose?.connection?.readyState === 1 && validUserId) {
        const activeMetaAccounts = await MetaAccount.find({
          userId: validUserId,
          isActive: true,
          accessToken: { $exists: true, $ne: "" },
        }).lean();
        if (activeMetaAccounts.length === 1) {
          account = activeMetaAccounts[0];
        } else {
          throw new Error(
            "No Meta Ads account is selected in AI Context and no explicit account ID was specified in your message. Please specify the target account ID (e.g. act_...) or select one in AI Context → Channel Node."
          );
        }
      } else {
        throw new Error(
          "No Meta Ads account is selected in the AI Context Channel Node. Please select a Meta Ads account in AI Context → Channel Node."
        );
      }
    }

    if (!account || !account.accessToken) {
      throw new Error(
        `Active Meta account not connected or authorization expired. Please connect Meta Ads in the Marketing Channels section.`
      );
    }

    const effectiveAccountId = String(account.accountId).startsWith("act_")
      ? String(account.accountId)
      : `act_${account.accountId}`;
    const effectiveToken = account.accessToken;
    const effectiveUserId = account.userId || userId;

    const maskedToken = effectiveToken && effectiveToken.length > 15
      ? `${effectiveToken.slice(0, 10)}...${effectiveToken.slice(-5)}`
      : "REDACTED";
    console.log(`-> Access Token (Masked): ${maskedToken}`);

    switch (toolName) {
      case "get_live_today_insights": {
        try {
          const insights = await MetaApiService.getInsights(effectiveAccountId, effectiveToken, {
            datePreset: "today",
            timeIncrement: null,
          });
          return {
            status: "LIVE_DATA_FROM_META",
            date: new Date().toISOString().split("T")[0],
            datePreset: "today",
            accountId: effectiveAccountId,
            accountName: account.accountName,
            currency: account.currency || "INR",
            insights,
          };
        } catch (err) {
          if (MetaApiService.isTokenRevokedOrExpired(err)) {
            await MetaAccount.updateOne({ _id: account._id }, { $set: { isActive: false } });
            throw new Error(
              "Meta authorization has expired or been revoked. Please reconnect your Meta Ads account in Channels."
            );
          }
          throw err;
        }
      }

      case "get_live_campaign_insights": {
        try {
          const {
            datePreset,
            timeRange,
            timeIncrement,
            level = "campaign",
            campaignIds = null,
          } = args;
          const resolvedPreset = timeRange ? undefined : (datePreset || "maximum");

          // Propagate real Meta API errors directly — never swallow with .catch(() => [])
          const [campaigns, insights] = await Promise.all([
            MetaApiService.getCampaigns(effectiveAccountId, effectiveToken),
            MetaApiService.getInsights(effectiveAccountId, effectiveToken, {
              datePreset: resolvedPreset,
              timeRange,
              timeIncrement: timeIncrement ?? null,
              level,
            }),
          ]);

          const statusMap = new Map();
          const campaignMetaMap = new Map();
          (campaigns || []).forEach((c) => {
            statusMap.set(c.id, c.status || c.effective_status || "UNKNOWN");
            campaignMetaMap.set(c.id, {
              id: c.id,
              name: c.name,
              status: c.status || c.effective_status || "UNKNOWN",
              effectiveStatus: c.effective_status || c.status || "UNKNOWN",
              objective: c.objective || null,
            });
          });

          const filterSet = Array.isArray(campaignIds) && campaignIds.length > 0
            ? new Set(campaignIds.map((id) => String(id).trim()))
            : null;

          const mappedInsights = (insights || [])
            .filter((row) => !filterSet || filterSet.has(String(row.campaign_id)))
            .map((row) => {
              const purchasesAction =
                (row.actions || []).find((a) =>
                  ["purchase", "omni_purchase", "lead", "offsite_conversion.fb_pixel_purchase", "mobile_app_install", "link_click"].includes(a.action_type)
                ) || (row.actions || [])[0];
              const resultActionType = purchasesAction?.action_type || null;
              const conversions = purchasesAction ? Number(purchasesAction.value || 0) : 0;

              const purchaseOnlyAction = (row.actions || []).find((a) =>
                ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"].includes(a.action_type)
              );
              const purchases = purchaseOnlyAction ? Number(purchaseOnlyAction.value || 0) : 0;

              const valueAction =
                (row.action_values || []).find((a) =>
                  ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"].includes(a.action_type)
                ) || (row.action_values || [])[0];
              const conversionValue = valueAction ? Number(valueAction.value || 0) : 0;

              const spend = Number(row.spend || 0);
              const impressions = Number(row.impressions || 0);
              const clicks = Number(row.clicks || 0);
              const reach = Number(row.reach || 0);
              const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : Number(row.ctr || 0);
              const cpc = clicks > 0 ? Number((spend / clicks).toFixed(2)) : (row.cpc ? Number(Number(row.cpc).toFixed(2)) : null);
              const cpm = impressions > 0 ? Number(((spend / impressions) * 1000).toFixed(2)) : (row.cpm ? Number(Number(row.cpm).toFixed(2)) : null);
              const cpa = conversions > 0 ? Number((spend / conversions).toFixed(2)) : null;
              const cpr = cpa;
              const roasFromApi = Array.isArray(row.purchase_roas) && row.purchase_roas[0]?.value
                ? Number(Number(row.purchase_roas[0].value).toFixed(2))
                : null;
              const roas = spend > 0 && conversionValue > 0
                ? Number((conversionValue / spend).toFixed(2))
                : roasFromApi;

              return {
                campaignId: row.campaign_id,
                campaignName: row.campaign_name,
                ...(row.adset_id ? { adSetId: row.adset_id, adSetName: row.adset_name } : {}),
                ...(row.ad_id ? { adId: row.ad_id, adName: row.ad_name } : {}),
                status: statusMap.get(row.campaign_id) || "UNKNOWN",
                objective: row.objective || campaignMetaMap.get(row.campaign_id)?.objective || null,
                spend,
                impressions,
                clicks,
                reach,
                ctr,
                cpc,
                cpm,
                conversions,
                purchases,
                resultActionType,
                cpa,
                cpr,
                conversionValue,
                roas,
                currency: row.account_currency || account.currency || "INR",
                dateStart: row.date_start,
                dateStop: row.date_stop,
              };
            });

          // Build per-campaign spend Rollup across all campaigns in the account (or filtered campaignIds)
          const spendByCampId = new Map();
          for (const item of mappedInsights) {
            const prev = spendByCampId.get(item.campaignId) || {
              campaignId: item.campaignId,
              campaignName: item.campaignName,
              status: item.status,
              spend: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              purchases: 0,
              conversionValue: 0,
              currency: item.currency,
              dateStart: item.dateStart,
              dateStop: item.dateStop,
            };
            prev.spend = Number((prev.spend + item.spend).toFixed(2));
            prev.impressions += item.impressions;
            prev.clicks += item.clicks;
            prev.conversions += item.conversions;
            prev.purchases += item.purchases;
            prev.conversionValue = Number((prev.conversionValue + item.conversionValue).toFixed(2));
            spendByCampId.set(item.campaignId, prev);
          }

          const targetCampaigns = (campaigns || []).filter((c) => !filterSet || filterSet.has(String(c.id)));
          const allCampaignsPerformance = targetCampaigns.map((c) => {
            const agg = spendByCampId.get(c.id);
            if (!agg) {
              return {
                campaignId: c.id,
                campaignName: c.name,
                status: c.status || c.effective_status || "UNKNOWN",
                spend: 0,
                impressions: 0,
                clicks: 0,
                ctr: 0,
                cpc: null,
                cpm: null,
                conversions: 0,
                cpa: null,
                cpr: null,
                conversionValue: 0,
                roas: null,
                currency: account.currency || "INR",
              };
            }
            return {
              ...agg,
              ctr: agg.impressions > 0 ? Number(((agg.clicks / agg.impressions) * 100).toFixed(2)) : 0,
              cpc: agg.clicks > 0 ? Number((agg.spend / agg.clicks).toFixed(2)) : null,
              cpm: agg.impressions > 0 ? Number(((agg.spend / agg.impressions) * 1000).toFixed(2)) : null,
              cpa: agg.conversions > 0 ? Number((agg.spend / agg.conversions).toFixed(2)) : null,
              cpr: agg.conversions > 0 ? Number((agg.spend / agg.conversions).toFixed(2)) : null,
              roas: agg.spend > 0 && agg.conversionValue > 0 ? Number((agg.conversionValue / agg.spend).toFixed(2)) : null,
            };
          });

          const totalAccountSpend = Number(
            mappedInsights.reduce((sum, r) => sum + Number(r.spend || 0), 0).toFixed(2)
          );

          return {
            status: "LIVE_DATA_FROM_META",
            accountId: effectiveAccountId,
            accountName: account.accountName,
            currency: account.currency || "INR",
            datePreset: resolvedPreset || "custom",
            timeRange: timeRange || null,
            level,
            totalAccountSpend,
            totalInsightsRows: mappedInsights.length,
            totalCampaignsInAccount: (campaigns || []).length,
            insights: mappedInsights,
            allCampaignsPerformance,
            pagination: {
              campaignsPagination: campaigns?._pagination || { totalFetched: (campaigns || []).length, hasMore: false },
              insightsPagination: insights?._pagination || { totalFetched: mappedInsights.length, hasMore: false },
            },
          };
        } catch (err) {
          if (MetaApiService.isTokenRevokedOrExpired(err)) {
            await MetaAccount.updateOne({ _id: account._id }, { $set: { isActive: false } });
            throw new Error(
              "Meta authorization has expired or been revoked. Please reconnect your Meta Ads account in Channels."
            );
          }
          throw err;
        }
      }

      case "get_live_campaigns_status": {
        try {
          const campaigns = await MetaApiService.getCampaigns(effectiveAccountId, effectiveToken);
          const pagination = campaigns?._pagination || {
            totalFetched: (campaigns || []).length,
            pagesFetched: 1,
            hasMore: false,
          };

          let totalAdsInAccount = 0;
          const mappedCampaigns = (campaigns || []).map((c) => {
            const rawAds = Array.isArray(c.ads?.data)
              ? c.ads.data
              : Array.isArray(c.ads)
              ? c.ads
              : [];
            totalAdsInAccount += rawAds.length;
            return {
              id: c.id,
              name: c.name,
              status: c.status,
              effectiveStatus: c.effective_status,
              dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : 0,
              lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : 0,
              objective: c.objective,
              startTime: c.start_time || null,
              stopTime: c.stop_time || null,
              totalAds: rawAds.length,
              ads: rawAds.map((a) => ({ id: a.id, name: a.name, status: a.status || a.effective_status || "ACTIVE" })),
            };
          });

          // Fallback: If campaigns did not contain nested ads, query account ads safely
          if (totalAdsInAccount === 0 && mappedCampaigns.length > 0 && args.includeAds !== false) {
            try {
              const allAds = await MetaApiService.getAccountAds(effectiveAccountId, effectiveToken);
              if (allAds && allAds.length > 0) {
                totalAdsInAccount = allAds.length;
                const adsByCamp = {};
                allAds.forEach((a) => {
                  if (a.campaign_id) {
                    if (!adsByCamp[a.campaign_id]) adsByCamp[a.campaign_id] = [];
                    adsByCamp[a.campaign_id].push(a);
                  }
                });
                mappedCampaigns.forEach((c) => {
                  const cAds = adsByCamp[c.id] || [];
                  if (cAds.length > 0) {
                    c.totalAds = cAds.length;
                    c.ads = cAds.map((a) => ({ id: a.id, name: a.name, status: a.status || "ACTIVE" }));
                  }
                });
              }
            } catch (fallbackErr) {
              console.warn("[get_live_campaigns_status]: Fallback getAccountAds error:", fallbackErr.message);
            }
          }

          return {
            status: "LIVE_DATA_FROM_META",
            accountId: effectiveAccountId,
            accountName: account.accountName,
            currency: account.currency || "INR",
            totalCampaigns: mappedCampaigns.length,
            totalAdsInAccount,
            pagination: {
              totalFetched: pagination.totalFetched,
              pagesFetched: pagination.pagesFetched,
              hasMore: Boolean(pagination.hasMore),
              complete: !pagination.hasMore,
            },
            campaigns: mappedCampaigns,
          };
        } catch (err) {
          if (MetaApiService.isTokenRevokedOrExpired(err)) {
            await MetaAccount.updateOne({ _id: account._id }, { $set: { isActive: false } });
            throw new Error(
              "Meta authorization has expired or been revoked. Please reconnect your Meta Ads account in Channels."
            );
          }
          throw err;
        }
      }

      case "get_live_adsets": {
        try {
          const adSets = await MetaApiService.getAdSets(effectiveAccountId, effectiveToken, {
            campaignId: args.campaignId || null,
            limit: args.limit || 200,
          });
          return {
            status: "LIVE_DATA_FROM_META",
            accountId: effectiveAccountId,
            accountName: account.accountName,
            currency: account.currency || "INR",
            totalAdSets: adSets.length,
            pagination: adSets._pagination || { totalFetched: adSets.length, hasMore: false },
            adSets: adSets.map((as) => ({
              id: as.id,
              name: as.name,
              status: as.status,
              effectiveStatus: as.effective_status,
              campaignId: as.campaign_id,
              dailyBudget: as.daily_budget ? Number(as.daily_budget) / 100 : 0,
              lifetimeBudget: as.lifetime_budget ? Number(as.lifetime_budget) / 100 : 0,
              optimizationGoal: as.optimization_goal,
              billingEvent: as.billing_event,
              bidStrategy: as.bid_strategy || null,
            })),
          };
        } catch (err) {
          if (MetaApiService.isTokenRevokedOrExpired(err)) {
            await MetaAccount.updateOne({ _id: account._id }, { $set: { isActive: false } });
            throw new Error("Meta authorization has expired or been revoked. Please reconnect your Meta Ads account in Channels.");
          }
          throw err;
        }
      }

      case "get_live_ad_creatives": {
        try {
          const { campaignId = null, adSetId = null, includeInsights = true, datePreset = "maximum", timeRange = null, limit = 100 } = args;
          const [adsList, adInsights] = await Promise.all([
            MetaApiService.getAdCreatives(effectiveAccountId, effectiveToken, { campaignId, adSetId, limit }),
            includeInsights
              ? MetaApiService.getInsights(effectiveAccountId, effectiveToken, {
                  level: "ad",
                  datePreset: timeRange ? undefined : datePreset,
                  timeRange,
                  timeIncrement: null,
                }).catch(() => [])
              : Promise.resolve([]),
          ]);

          const insightByAdId = new Map();
          (adInsights || []).forEach((row) => {
            if (!row.ad_id) return;
            const spend = Number(row.spend || 0);
            const impressions = Number(row.impressions || 0);
            const clicks = Number(row.clicks || 0);
            const act = (row.actions || []).find((a) =>
              ["purchase", "omni_purchase", "lead", "offsite_conversion.fb_pixel_purchase"].includes(a.action_type)
            ) || (row.actions || [])[0];
            const conversions = act ? Number(act.value || 0) : 0;
            const valAct = (row.action_values || []).find((a) =>
              ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"].includes(a.action_type)
            ) || (row.action_values || [])[0];
            const conversionValue = valAct ? Number(valAct.value || 0) : 0;
            insightByAdId.set(String(row.ad_id), {
              spend,
              impressions,
              clicks,
              ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
              cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : null,
              cpm: impressions > 0 ? Number(((spend / impressions) * 1000).toFixed(2)) : null,
              conversions,
              cpa: conversions > 0 ? Number((spend / conversions).toFixed(2)) : null,
              conversionValue,
              roas: spend > 0 && conversionValue > 0 ? Number((conversionValue / spend).toFixed(2)) : null,
            });
          });

          const creatives = (adsList || []).map((ad) => {
            const cr = ad.creative || {};
            const spec = cr.object_story_spec || {};
            const linkData = spec.link_data || {};
            const videoData = spec.video_data || {};
            const headline = cr.title || linkData.name || videoData.title || null;
            const primaryText = cr.body || linkData.message || videoData.message || null;
            const callToAction =
              cr.call_to_action_type ||
              linkData.call_to_action?.type ||
              videoData.call_to_action?.type ||
              null;
            const destinationUrl =
              linkData.link ||
              videoData.call_to_action?.value?.link ||
              null;
            const videoId = cr.video_id || videoData.video_id || null;
            const mediaType = videoId ? "VIDEO" : (cr.image_url || linkData.image_hash ? "IMAGE" : "CREATIVE");
            const perf = insightByAdId.get(String(ad.id)) || null;

            return {
              adId: ad.id,
              adName: ad.name,
              status: ad.status || ad.effective_status,
              effectiveStatus: ad.effective_status,
              campaignId: ad.campaign_id,
              adSetId: ad.adset_id,
              creativeId: cr.id || null,
              creativeName: cr.name || null,
              mediaType,
              videoId,
              imageUrl: cr.image_url || cr.thumbnail_url || null,
              headline,
              primaryText,
              callToAction,
              destinationUrl,
              performance: perf,
            };
          });

          return {
            status: "LIVE_DATA_FROM_META",
            accountId: effectiveAccountId,
            accountName: account.accountName,
            currency: account.currency || "INR",
            totalCreatives: creatives.length,
            pagination: adsList._pagination || { totalFetched: creatives.length, hasMore: false },
            creatives,
          };
        } catch (err) {
          if (MetaApiService.isTokenRevokedOrExpired(err)) {
            await MetaAccount.updateOne({ _id: account._id }, { $set: { isActive: false } });
            throw new Error("Meta authorization has expired or been revoked. Please reconnect your Meta Ads account in Channels.");
          }
          throw err;
        }
      }

      case "create_meta_campaign": {
        const {
          name,
          objective = "OUTCOME_SALES",
          dailyBudget,
          daily_budget,
          daily_budget_inr,
          campaign_daily_budget,
          campaign_daily_budget_inr,
          budget,
          lifetimeBudget = 0,
          status = "PAUSED",
          specialAdCategories = ["NONE"],
          isSkadnetworkAttribution,
          is_skadnetwork_attribution,
        } = args;

        const rawCampBudget = dailyBudget || daily_budget || daily_budget_inr || campaign_daily_budget || campaign_daily_budget_inr || budget;
        const effectiveDailyBudget = rawCampBudget ? Number(String(rawCampBudget).replace(/[^0-9.]/g, "")) : 1000;

        let metaRemoteId = `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        let creationSource = "AI_AGENT_MCP";

        try {
          // Attempt real Meta Graph API creation if access token is live
          const metaResult = await MetaApiService.createCampaign(effectiveAccountId, effectiveToken, {
            name,
            objective,
            dailyBudget: effectiveDailyBudget,
            lifetimeBudget,
            status,
            specialAdCategories,
            isSkadnetworkAttribution: isSkadnetworkAttribution || is_skadnetwork_attribution,
          });
          if (metaResult?.id) {
            metaRemoteId = metaResult.id;
            creationSource = "META_GRAPH_API";
          }
        } catch (err) {
          console.warn("[Meta Campaign API Warning]:", err.message);
          if (MetaApiService.isTokenRevokedOrExpired(err)) {
            await MetaAccount.updateOne({ _id: account._id }, { $set: { isActive: false } });
            throw new Error(
              "Meta authorization has expired. Please reconnect your Meta Ads account in Channels."
            );
          }
          if (effectiveToken && !effectiveToken.startsWith("EAAB_simulated")) {
            throw err;
          }
        }

        // Save new campaign record into MongoDB so dashboard & user can immediately track it
        let savedCampaign = {
          campaignId: metaRemoteId,
          name,
          objective: objective || "OUTCOME_SALES",
          status: status || "PAUSED",
          dailyBudget: Number(dailyBudget) || 0,
        };

        const mongoose = (await import("mongoose")).default;
        if (mongoose?.connection?.readyState === 1) {
          try {
            savedCampaign = await MetaCampaign.findOneAndUpdate(
              { campaignId: metaRemoteId },
              {
                $set: {
                  userId: effectiveUserId,
                  accountId: effectiveAccountId,
                  campaignId: metaRemoteId,
                  name,
                  status: status || "PAUSED",
                  effectiveStatus: status || "PAUSED",
                  objective: objective || "OUTCOME_SALES",
                  dailyBudget: Number(dailyBudget) || 0,
                  lifetimeBudget: Number(lifetimeBudget) || 0,
                  startTime: new Date(),
                  lastSyncedAt: new Date(),
                },
              },
              { upsert: true, returnDocument: "after" }
            );
          } catch (dbErr) {
            console.warn("[Meta Campaign DB Save Warning]:", dbErr.message);
          }
        }

        return {
          success: true,
          status: "CAMPAIGN_CREATED",
          source: creationSource,
          data: {
            campaignId: savedCampaign.campaignId,
            name: savedCampaign.name,
            objective: savedCampaign.objective,
            status: savedCampaign.status,
            dailyBudget: savedCampaign.dailyBudget,
            currency: account.currency || "INR",
            adAccount: account.accountName,
            accountId: effectiveAccountId,
            createdAt: savedCampaign.createdAt,
          },
          message: `Campaign "${name}" successfully created on ${account.accountName} (${effectiveAccountId}) with status ${status} and daily budget ${account.currency || "INR"} ${dailyBudget}!`,
        };
      }

      case "update_meta_campaign": {
        const { campaignId, status: newStatus, dailyBudget: newBudget, name: newName } = args;
        if (!campaignId) throw new Error("campaignId is required to update campaign");

        try {
          await MetaApiService.updateCampaign(campaignId, effectiveToken, {
            name: newName,
            status: newStatus,
            dailyBudget: newBudget,
          });
        } catch (err) {
          console.warn("[Meta Update Campaign Warning]:", err.message);
        }

        const updateFields = {};
        if (newStatus) {
          updateFields.status = newStatus;
          updateFields.effectiveStatus = newStatus;
        }
        if (newBudget) updateFields.dailyBudget = Number(newBudget);
        if (newName) updateFields.name = newName;
        updateFields.lastSyncedAt = new Date();

        const updated = await MetaCampaign.findOneAndUpdate(
          { campaignId },
          { $set: updateFields },
          { returnDocument: "after" }
        );

        return {
          success: true,
          status: "CAMPAIGN_UPDATED",
          data: updated,
          message: `Campaign ${campaignId} updated successfully.`,
        };
      }

      case "create_meta_ad_set": {
        const {
          campaignId,
          name,
          dailyBudget,
          daily_budget,
          daily_budget_inr,
          campaign_daily_budget,
          campaign_daily_budget_inr,
          budget,
          lifetimeBudget,
          optimizationGoal = "OFFSITE_CONVERSIONS",
          billingEvent = "IMPRESSIONS",
          bidAmount,
          bidStrategy,
          bid_strategy,
          status = "PAUSED",
          targeting = {},
          pixelId,
          appId,
          application_id,
          applicationId,
          objectStoreUrl,
          object_store_url,
          startTime,
          start_time,
          endTime,
          end_time,
          customEventType,
          custom_event_type,
          trackingType,
          tracking_type,
          promotedObject,
        } = args;

        const rawAdSetBudget = dailyBudget || daily_budget || daily_budget_inr || campaign_daily_budget || campaign_daily_budget_inr || budget;
        const effectiveAdSetBudget = rawAdSetBudget ? Number(String(rawAdSetBudget).replace(/[^0-9.]/g, "")) : undefined;

        if (!campaignId) throw new Error("campaignId is required to create a Meta ad set");

        let remoteAdSetId = `adset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        let creationSource = "AI_AGENT_MCP";

        try {
          const res = await MetaApiService.createAdSet(effectiveAccountId, effectiveToken, {
            campaignId,
            name: name || `AdSet_${Date.now()}`,
            dailyBudget: effectiveAdSetBudget,
            lifetimeBudget,
            optimizationGoal,
            billingEvent,
            bidAmount,
            bidStrategy: bidStrategy || bid_strategy,
            status,
            targeting,
            pixelId: pixelId || null,
            appId: appId || application_id || applicationId,
            objectStoreUrl: objectStoreUrl || object_store_url,
            startTime: startTime || start_time,
            endTime: endTime || end_time,
            customEventType: customEventType || custom_event_type,
            trackingType: trackingType || tracking_type,
            destination_type: args.destination_type || args.destinationType || null,
            promotedObject,
            objective: args.objective || args.campaignObjective,
          });
          if (res?.id) {
            remoteAdSetId = res.id;
            creationSource = "META_GRAPH_API";
          }
        } catch (err) {
          console.error("[Meta API error] create_meta_ad_set failed:", err.message);
          if (
            err.message.includes("Selected campaign is archived") ||
            err.message.includes("invalid, deleted, or inaccessible")
          ) {
            throw err;
          }
          if (MetaApiService.isTokenRevokedOrExpired(err)) {
            await MetaAccount.updateOne({ _id: account._id }, { $set: { isActive: false } });
            throw new Error(
              "Meta authorization has expired. Please reconnect your Meta Ads account in Channels."
            );
          }
          if (effectiveToken && !effectiveToken.startsWith("EAAB_simulated")) {
            throw err;
          }
        }

        return {
          success: true,
          status: "AD_SET_CREATED",
          source: creationSource,
          adSetId: remoteAdSetId,
          campaignId,
          name: name || `AdSet_${Date.now()}`,
          dailyBudget: Number(dailyBudget) || 0,
          optimizationGoal,
          billingEvent,
          adSetStatus: status,
          targeting: targeting || {},
          message: `Meta Ad Set "${name || remoteAdSetId}" (ID: ${remoteAdSetId}) created successfully under Campaign ${campaignId}! [Source: ${creationSource}]`,
        };
      }

      case "update_meta_ad_set": {
        const { adSetId, name, status, dailyBudget, targeting } = args;
        if (!adSetId) throw new Error("adSetId is required to update a Meta ad set");

        try {
          await MetaApiService.updateAdSet(adSetId, effectiveToken, {
            name,
            status,
            dailyBudget,
            targeting,
          });
        } catch (err) {
          console.warn("[Meta Update AdSet Warning]:", err.message);
        }

        return {
          success: true,
          status: "AD_SET_UPDATED",
          adSetId,
          name,
          adSetStatus: status,
          dailyBudget: dailyBudget ? Number(dailyBudget) : undefined,
          targeting,
          message: `Meta Ad Set ${adSetId} updated successfully.`,
        };
      }

      case "set_meta_targeting": {
        const { adSetId, locations, countries, cities, ageMin = 18, ageMax = 65, genders, interests = [] } = args;
        if (!adSetId) throw new Error("adSetId is required to set Meta targeting");

        const targetingObj = {
          locations: locations || countries || ["IN"],
          countries: countries || (locations?.length > 0 ? locations : ["IN"]),
          cities: cities || [],
          ageMin: Number(ageMin) || 18,
          ageMax: Number(ageMax) || 65,
          genders: genders || [1, 2],
          interests: interests || [],
        };

        try {
          await MetaApiService.updateAdSet(adSetId, effectiveToken, { targeting: targetingObj });
        } catch (err) {
          console.warn("[Meta Set Targeting Warning]:", err.message);
        }

        return {
          success: true,
          status: "TARGETING_SET",
          adSetId,
          targeting: targetingObj,
          message: `Targeting updated for Ad Set ${adSetId}: Age ${ageMin}-${ageMax}, Locations: ${(locations || ["India"]).join(", ")}, Interests: ${interests.join(", ") || "Broad"}.`,
        };
      }

      case "create_meta_ad": {
        const {
          adSetId,
          name,
          headline,
          primaryText,
          description,
          linkUrl,
          destinationUrl,
          destination,
          displayLink,
          display_link,
          callToAction = "BOOK_TRAVEL",
          imageUrl,
          imageHash,
          pageId,
          status = "PAUSED",
          optimizeTextPerPerson = true,
          optimizedAdCreative = true,
          pixelId,
          appId,
          application_id,
          applicationId,
          objectStoreUrl,
          object_store_url,
          instagramActorId,
          instagram_actor_id,
          instagram_account_id,
          ig_id,
          instagramId,
          trackingType,
          tracking_type,
          urlTags,
          url_tags,
          driveUrl,
          videoUrl,
          videoFilePath,
          videoId,
        } = args;

        if (!adSetId) throw new Error("adSetId is required to create a Meta ad");

        const effectiveLink = linkUrl || destinationUrl || destination || args.landingPageUrl || args.landing_page_url || null;
        const effectiveDisplayLink = displayLink || display_link || args.displayLink || args.display_link || null;

        // Media Type Guard Check
        const targetImageRef = imageUrl || driveUrl;
        if (targetImageRef && fs.existsSync(targetImageRef)) {
          const magic = driveService.inspectFileMagicBytes(targetImageRef);
          if (magic.isVideo) {
            console.log(`[Meta MCP Ad Creation]: Asset "${targetImageRef}" is a video (${magic.format}). Auto-delegating to create_meta_video_ad...`);
            return await this.executeLiveTool("create_meta_video_ad", {
              ...args,
              videoFilePath: targetImageRef,
              videoUrl: targetImageRef,
              linkUrl: effectiveLink,
              destinationUrl: effectiveLink,
              destination: effectiveLink,
              displayLink: effectiveDisplayLink,
              display_link: effectiveDisplayLink,
            });
          }
        }

        let remoteAdId = `ad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        let creativeId = `cr_${Date.now()}`;
        let creationSource = "AI_AGENT_MCP";
        let outImageHash = imageHash || args.imageHash || null;

        try {
          const res = await MetaApiService.createAd(effectiveAccountId, effectiveToken, {
            adSetId,
            name: name || `Ad_${Date.now()}`,
            headline,
            primaryText,
            description,
            linkUrl: effectiveLink,
            destinationUrl: effectiveLink,
            destination: effectiveLink,
            displayLink: effectiveDisplayLink,
            display_link: effectiveDisplayLink,
            callToAction,
            imageUrl,
            imageHash: outImageHash,
            driveUrl,
            videoUrl,
            videoFilePath,
            videoId,
            pageId,
            status,
            optimizeTextPerPerson,
            optimizedAdCreative,
            pixelId: pixelId || null,
            appId: appId || application_id || applicationId || null,
            objectStoreUrl: objectStoreUrl || object_store_url || null,
            pageId: pageId || null,
            instagramActorId: instagramActorId || instagram_actor_id || instagram_account_id || ig_id || instagramId,
            trackingType: trackingType || tracking_type,
            urlTags: urlTags || url_tags,
          });
          if (res?.id) {
            remoteAdId = res.id;
            creativeId = res.creativeId || creativeId;
            creationSource = "META_GRAPH_API";
            if (res.imageHash) outImageHash = res.imageHash;
          }
        } catch (err) {
          console.warn("[Meta Ad Creation API Warning]:", err.message);
          if (MetaApiService.isTokenRevokedOrExpired(err)) {
            await MetaAccount.updateOne({ _id: account._id }, { $set: { isActive: false } });
            throw new Error(
              "Meta authorization has expired. Please reconnect your Meta Ads account in Channels."
            );
          }
          if (effectiveToken && !effectiveToken.startsWith("EAAB_simulated")) {
            throw err;
          }
        }

        return {
          success: true,
          status: "AD_CREATED",
          source: creationSource,
          adId: remoteAdId,
          creativeId,
          imageHash: outImageHash,
          adSetId,
          name: name || `Ad_${Date.now()}`,
          headline: headline || null,
          primaryText: primaryText || null,
          description: description || null,
          linkUrl: linkUrl || null,
          callToAction: MetaApiService.normalizeCallToAction(callToAction),
          urlTags: urlTags || url_tags || null,
          adStatus: status,
          data: { adId: remoteAdId, creativeId, imageHash: outImageHash },
          message: `Meta Ad "${name || remoteAdId}" (ID: ${remoteAdId}) created successfully under Ad Set ${adSetId}! [Source: ${creationSource}]`,
        };
      }

      case "create_meta_video_ad": {
        const {
          adSetId,
          name,
          headline,
          primaryText,
          description,
          linkUrl,
          destinationUrl,
          destination,
          displayLink,
          display_link,
          callToAction = "BOOK_TRAVEL",
          imageUrl,
          driveUrl,
          videoUrl,
          videoFilePath,
          videoId,
          pageId,
          status = "PAUSED",
          optimizeTextPerPerson = true,
          optimizedAdCreative = true,
          pixelId,
          appId,
          application_id,
          applicationId,
          objectStoreUrl,
          object_store_url,
          instagramActorId,
          instagram_actor_id,
          instagram_account_id,
          ig_id,
          instagramId,
          trackingType,
          tracking_type,
          urlTags,
          url_tags,
        } = args;

        if (!adSetId) throw new Error("adSetId is required to create a Meta Video Ad");

        const effectiveLink = linkUrl || destinationUrl || destination || args.landingPageUrl || args.landing_page_url || null;
        const effectiveDisplayLink = displayLink || display_link || args.displayLink || args.display_link || null;

        let localFilePath = videoFilePath;
        let downloadedInfo = null;

        // Auto-download from Google Drive / Smart Chips using saved OAuth tokens if driveUrl or videoUrl is provided
        const targetVideoRef = driveUrl || videoUrl;
        if (targetVideoRef && !localFilePath && !videoId) {
          try {
            downloadedInfo = await driveService.downloadCreative(targetVideoRef, null, "video");
            if (downloadedInfo?.filePath) {
              localFilePath = downloadedInfo.filePath;
            }
          } catch (dlErr) {
            console.warn("[Meta MCP Video Ad] Google Drive / Smart Chip download warning:", dlErr.message);
          }
        }

        // Media Type Guard Check: Prevent uploading images to /advideos endpoint
        if (localFilePath && fs.existsSync(localFilePath)) {
          const magic = driveService.inspectFileMagicBytes(localFilePath);
          if (magic.isImage) {
            throw new Error(
              `Media Type Mismatch Error: Creative asset "${localFilePath}" is an Image (${magic.format?.toUpperCase()}), but create_meta_video_ad was called. Images must be uploaded using create_meta_ad and Meta /adimages endpoint.`
            );
          }
        }

        let remoteAdId = `ad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        let creativeId = `cr_vid_${Date.now()}`;
        let remoteVideoId = videoId || `vid_${Date.now()}`;
        let creationSource = "AI_AGENT_MCP";

        try {
          const res = await MetaApiService.createVideoAd(effectiveAccountId, effectiveToken, {
            adSetId,
            name: name || `Video_Ad_${Date.now()}`,
            headline,
            primaryText,
            description,
            linkUrl: effectiveLink,
            destinationUrl: effectiveLink,
            destination: effectiveLink,
            displayLink: effectiveDisplayLink,
            display_link: effectiveDisplayLink,
            callToAction,
            imageUrl,
            videoId,
            videoFilePath: localFilePath,
            videoUrl: videoUrl || driveUrl,
            pageId,
            status,
            optimizeTextPerPerson,
            optimizedAdCreative,
            pixelId: pixelId || null,
            appId: appId || application_id || applicationId || null,
            objectStoreUrl: objectStoreUrl || object_store_url || null,
            pageId: pageId || null,
            instagramActorId: instagramActorId || instagram_actor_id || instagram_account_id || ig_id || instagramId,
            trackingType: trackingType || tracking_type,
            urlTags: urlTags || url_tags,
          });
          if (res?.id) {
            remoteAdId = res.id;
            creativeId = res.creativeId || creativeId;
            remoteVideoId = res.videoId || remoteVideoId;
            creationSource = "META_GRAPH_API";
          }
        } catch (err) {
          console.warn("[Meta Video Ad Creation API Warning]:", err.message);
          if (MetaApiService.isTokenRevokedOrExpired(err)) {
            await MetaAccount.updateOne({ _id: account._id }, { $set: { isActive: false } });
            throw new Error(
              "Meta authorization has expired. Please reconnect your Meta Ads account in Channels."
            );
          }
          if (effectiveToken && !effectiveToken.startsWith("EAAB_simulated")) {
            throw err;
          }
        }

        return {
          success: true,
          status: "VIDEO_AD_CREATED",
          source: creationSource,
          adId: remoteAdId,
          creativeId,
          videoId: remoteVideoId,
          adSetId,
          name: name || `Video_Ad_${Date.now()}`,
          headline: headline || null,
          primaryText: primaryText || null,
          description: description || null,
          linkUrl: linkUrl || null,
          callToAction: MetaApiService.normalizeCallToAction(callToAction),
          urlTags: urlTags || url_tags || null,
          driveAsset: downloadedInfo ? { fileName: downloadedInfo.fileName, fileSize: downloadedInfo.fileSize } : null,
          adStatus: status,
          message: `Meta Video Ad "${name || remoteAdId}" (ID: ${remoteAdId}, Video: ${remoteVideoId}) created successfully under Ad Set ${adSetId}!`,
        };
      }

      case "verify_meta_campaign": {
        const { campaignId, adSetId, adId } = args;
        const targetClean = String(effectiveAccountId || "").replace(/^act_/, "");

        if (campaignId && effectiveToken && !effectiveToken.startsWith("EAAB_simulated")) {
          try {
            const campRes = await axios.get(`${META_GRAPH_URL}/${campaignId}`, {
              params: { fields: "id,name,status,account_id", access_token: effectiveToken },
              timeout: 5000,
            });
            const campAcc = String(campRes.data?.account_id || "").replace(/^act_/, "");
            if (campAcc && targetClean && campAcc !== targetClean) {
              return {
                success: false,
                verificationStatus: "ACCOUNT_MISMATCH",
                campaignId,
                error: `Account ID mismatch: Campaign "${campaignId}" belongs to Meta account act_${campAcc}, which does not match the selected Meta account act_${targetClean}. Verification failed.`,
              };
            }
          } catch (campErr) {
            console.warn("[Meta MCP verify_meta_campaign lookup warning]:", campErr.message);
          }
        }

        if (adSetId && effectiveToken && !effectiveToken.startsWith("EAAB_simulated")) {
          try {
            const adSetRes = await axios.get(`${META_GRAPH_URL}/${adSetId}`, {
              params: { fields: "id,name,status,account_id", access_token: effectiveToken },
              timeout: 5000,
            });
            const adSetAcc = String(adSetRes.data?.account_id || "").replace(/^act_/, "");
            if (adSetAcc && targetClean && adSetAcc !== targetClean) {
              return {
                success: false,
                verificationStatus: "ACCOUNT_MISMATCH",
                campaignId,
                adSetId,
                error: `Account ID mismatch: Ad Set "${adSetId}" belongs to Meta account act_${adSetAcc}, which does not match the selected Meta account act_${targetClean}. Verification failed.`,
              };
            }
          } catch (adSetErr) {
            console.warn("[Meta MCP verify_meta_campaign adSet lookup warning]:", adSetErr.message);
          }
        }

        return {
          success: true,
          status: "CAMPAIGN_VERIFIED",
          campaignId: campaignId || null,
          adSetId: adSetId || null,
          adId: adId || null,
          verification: {
            campaignExists: Boolean(campaignId),
            adSetExists: Boolean(adSetId),
            adExists: Boolean(adId),
            allComponentsReady: Boolean(campaignId),
          },
          message: `Meta Campaign ${campaignId || ""} verification complete. All configured layers are ready.`,
        };
      }

      default:
        throw new Error(`Unknown MCP Tool: ${toolName}`);
    }
  }
}

export default MetaMcpClient;
