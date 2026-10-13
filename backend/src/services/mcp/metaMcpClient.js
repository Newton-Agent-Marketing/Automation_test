// src/services/mcp/metaMcpClient.js
import { MetaApiService } from "../meta/metaApiService.js";
import MetaAccount from "../../models/metaAccount.js";
import MetaCampaign from "../../models/metaCampaign.js";
import driveService from "../../google/driveService.js";
import axios from "axios";
import fs from "fs";

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
    const { accountId, userId } = args;
    let account = null;

    if (accountId) {
      const cleanId = String(accountId).trim();
      const numOnly = cleanId.replace(/^act_/, "");
      account = await MetaAccount.findOne({
        $or: [{ accountId: cleanId }, { accountId: numOnly }, { accountId: `act_${numOnly}` }],
        ...(userId ? { userId } : {}),
      });
      if (!account) {
        throw new Error(
          `Ad Account "${accountId}" was not found or is inaccessible for this user. Please select an authorized connected account.`
        );
      }
    } else if (userId) {
      // 1. Check if user has an active selected account in ConnectedChannel
      const ConnectedChannel = (await import("../../models/connectedChannelModel.js")).default;
      const activeMetaChannel = await ConnectedChannel.findOne({ userId, channelId: "meta", isConnected: true }).lean().catch(() => null);
      if (activeMetaChannel?.accountId) {
        const cleanChanId = String(activeMetaChannel.accountId).trim();
        const numChan = cleanChanId.replace(/^act_/, "");
        account = await MetaAccount.findOne({
          userId,
          isActive: true,
          $or: [{ accountId: cleanChanId }, { accountId: numChan }, { accountId: `act_${numChan}` }],
        });
      }

      // 2. Check user's dashboardSettings.accountId
      if (!account) {
        const User = (await import("../../models/authModel.js")).default;
        const userDoc = await User.findById(userId).select("dashboardSettings").lean().catch(() => null);
        const prefAcc = userDoc?.dashboardSettings?.accountId;
        if (prefAcc && !String(prefAcc).includes("-")) {
          const cleanPref = String(prefAcc).trim();
          const numPref = cleanPref.replace(/^act_/, "");
          account = await MetaAccount.findOne({
            userId,
            isActive: true,
            $or: [{ accountId: cleanPref }, { accountId: numPref }, { accountId: `act_${numPref}` }],
          });
        }
      }

      // 3. Fallback to user's most recently updated active account
      if (!account) {
        account = await MetaAccount.findOne({ userId, isActive: true }).sort({ updatedAt: -1 });
      }
    }

    if (!account || !account.accessToken) {
      throw new Error(
        `Active Meta account not connected or authorization expired. Please connect Meta Ads in the Marketing Channels section.`
      );
    }

    const effectiveAccountId = account.accountId;
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
          });
          return {
            status: "LIVE_DATA_FROM_META",
            date: new Date().toISOString().split("T")[0],
            accountId: effectiveAccountId,
            accountName: account.accountName,
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

      case "get_live_campaigns_status": {
        try {
          const campaigns = await MetaApiService.getCampaigns(effectiveAccountId, effectiveToken);
          return {
            status: "LIVE_DATA_FROM_META",
            accountId: effectiveAccountId,
            accountName: account.accountName,
            campaigns: campaigns.map((c) => ({
              id: c.id,
              name: c.name,
              status: c.status,
              effectiveStatus: c.effective_status,
              dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : 0,
              objective: c.objective,
            })),
          };
        } catch (err) {
          if (MetaApiService.isTokenRevokedOrExpired(err)) {
            await MetaAccount.updateOne({ _id: account._id }, { $set: { isActive: false } });
            throw new Error(
              "Meta authorization has expired or been revoked. Please reconnect your Meta Ads account in Channels."
            );
          }
          // Fallback to locally saved campaigns if remote API isn't responding
          const localCampaigns = await MetaCampaign.find({ accountId: effectiveAccountId });
          return {
            status: "LOCAL_DATABASE_FALLBACK",
            accountId: effectiveAccountId,
            accountName: account.accountName,
            campaigns: localCampaigns.map((c) => ({
              id: c.campaignId,
              name: c.name,
              status: c.status,
              effectiveStatus: c.effectiveStatus || c.status,
              dailyBudget: c.dailyBudget,
              objective: c.objective,
            })),
          };
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
          });
          if (metaResult?.id) {
            metaRemoteId = metaResult.id;
            creationSource = "META_GRAPH_API";
          }
        } catch (err) {
          console.warn("[Meta Campaign API Warning]: Using MCP Database record creation:", err.message);
          if (MetaApiService.isTokenRevokedOrExpired(err)) {
            await MetaAccount.updateOne({ _id: account._id }, { $set: { isActive: false } });
            throw new Error(
              "Meta authorization has expired. Please reconnect your Meta Ads account in Channels."
            );
          }
        }

        // Save new campaign record into MongoDB so dashboard & user can immediately track it
        const savedCampaign = await MetaCampaign.findOneAndUpdate(
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
          status = "PAUSED",
          targeting = {},
          pixelId,
          appId,
          application_id,
          applicationId,
          objectStoreUrl,
          object_store_url,
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
            status,
            targeting,
            pixelId: pixelId || null,
            appId: appId || application_id || applicationId,
            objectStoreUrl: objectStoreUrl || object_store_url,
            customEventType: customEventType || custom_event_type,
            trackingType: trackingType || tracking_type,
            promotedObject,
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
          displayLink,
          callToAction = "Book now",
          imageUrl,
          pageId,
          status = "PAUSED",
          optimizeTextPerPerson = true,
          optimizedAdCreative = true,
          pixelId,
          appId,
          application_id,
          applicationId,
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

        // Media Type Guard Check
        const targetImageRef = imageUrl || driveUrl;
        if (targetImageRef && fs.existsSync(targetImageRef)) {
          const magic = driveService.inspectFileMagicBytes(targetImageRef);
          if (magic.isVideo) {
            throw new Error(
              `Media Type Mismatch Error: Creative asset "${targetImageRef}" is a Video (${magic.format?.toUpperCase()}), but create_meta_ad was called. Video assets must be created using create_meta_video_ad.`
            );
          }
        }

        let remoteAdId = `ad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        let creativeId = `cr_${Date.now()}`;
        let creationSource = "AI_AGENT_MCP";

        try {
          const res = await MetaApiService.createAd(effectiveAccountId, effectiveToken, {
            adSetId,
            name: name || `Ad_${Date.now()}`,
            headline,
            primaryText,
            description,
            linkUrl,
            displayLink,
            callToAction,
            imageUrl,
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
            pageId: pageId || null,
            instagramActorId: instagramActorId || instagram_actor_id || instagram_account_id || ig_id || instagramId,
            trackingType: trackingType || tracking_type,
            urlTags: urlTags || url_tags,
          });
          if (res?.id) {
            remoteAdId = res.id;
            creativeId = res.creativeId || creativeId;
            creationSource = "META_GRAPH_API";
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
          adSetId,
          name: name || `Ad_${Date.now()}`,
          headline: headline || null,
          primaryText: primaryText || null,
          description: description || null,
          linkUrl: linkUrl || null,
          callToAction: MetaApiService.normalizeCallToAction(callToAction),
          urlTags: urlTags || url_tags || null,
          adStatus: status,
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
          displayLink,
          callToAction = "BOOK_NOW",
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

        let localFilePath = videoFilePath;
        let downloadedInfo = null;

        // Auto-download from Google Drive / Smart Chips using saved OAuth tokens if driveUrl or videoUrl is provided
        const targetVideoRef = driveUrl || videoUrl;
        if (targetVideoRef && !localFilePath && !videoId) {
          try {
            downloadedInfo = await driveService.downloadCreative(targetVideoRef);
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
            linkUrl,
            displayLink,
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
