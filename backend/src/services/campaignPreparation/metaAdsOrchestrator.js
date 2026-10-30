import fs from "fs";
import path from "path";
import MetaApiService from "../meta/metaApiService.js";
import { executeAgentTool } from "../agent/queryDbMetrics.js";
import { SourceSheetReader } from "./sourceSheetReader.js";
import { CampaignValidator } from "./campaignValidator.js";
import driveService from "../../google/driveService.js";
import CampaignPreparationSession from "../../models/campaignPreparationSession.js";
import MetaAccount from "../../models/metaAccount.js";
import MetaUploadedMedia from "../../models/metaUploadedMedia.js";
import { cleanPageId } from "../data/fieldMapper.js";

export class MetaAdsOrchestrator {
  /**
   * Execute Meta Ads creation with strict dependency ordering, idempotency, and partial failure recovery
   */
  static async executeApprovalCreation({
    session,
    userId,
    userEmail,
    onProgress,
  } = {}) {
    if (!session) {
      throw new Error("No active preparation session provided for creation.");
    }

    if (session.approval?.status !== "APPROVED") {
      throw new Error("Cannot execute creation: Campaign configuration has not received explicit user approval.");
    }

    const snapshot = session.approval?.snapshot;
    if (!snapshot) {
      throw new Error("No approved configuration snapshot found. Approval requires an immutable snapshot.");
    }

    // 1. Verify latest source data has not changed since approval
    const rawLatestSource = await SourceSheetReader.readSource({
      userId,
      sheetUrlOrId: session.source?.sheetUrl || session.source?.spreadsheetId,
      filePath: session.source?.filePath,
      worksheetName: session.source?.worksheetName,
    });

    let effectiveLatestSource = rawLatestSource;
    if (session.filterCriteria) {
      const CampaignPrep = (await import("./campaignPreparationService.js")).default;
      const { filteredSource } = CampaignPrep.applyFiltersToSourceData(rawLatestSource, "", session.filterCriteria);
      effectiveLatestSource = filteredSource;
    } else if (Array.isArray(session.eligibleRows) && session.eligibleRows.length > 0 && session.eligibleRows.length < rawLatestSource.rows.length) {
      const filteredRows = rawLatestSource.rows.filter((r) => session.eligibleRows.includes(r.rowNumber));
      effectiveLatestSource = {
        ...rawLatestSource,
        rows: filteredRows,
        totalRows: filteredRows.length,
        eligibleRows: session.eligibleRows,
        dataFingerprint: SourceSheetReader.computeDataFingerprint(rawLatestSource.headers, filteredRows),
      };
    }

    const approvedAtMs = session.approval?.approvedAt ? new Date(session.approval.approvedAt).getTime() : 0;
    const isFreshApproval = Date.now() - approvedAtMs < 15 * 60 * 1000; // 15 mins window

    if (!isFreshApproval && session.approval.snapshotDataFingerprint && effectiveLatestSource.dataFingerprint !== session.approval.snapshotDataFingerprint) {
      session.status = "STALE_APPROVAL";
      session.approval.status = "STALE";
      await session.save();
      throw new Error("Source sheet data has been modified since your last approval. The previous approval is now stale. Please review the updated preview and re-approve.");
    }

    // 2. Initialize creation tracking state
    session.status = "CREATING";
    if (!session.creationJob || session.creationJob.status === "COMPLETED" || session.creationJob.campaignName !== session.campaignName) {
      session.creationJob = {
        status: "IN_PROGRESS",
        startedAt: new Date(),
        campaignName: session.campaignName,
        metaCampaignId: null,
        metaAdSetId: null,
        adResults: [],
        totalAds: session.preview?.adDetails?.length || 0,
      };
    } else {
      session.creationJob.status = "IN_PROGRESS";
      session.creationJob.startedAt = new Date();
    }
    await session.save();

    const emit = (stage, msg, extra = {}) => {
      console.log(`[MetaAdsOrchestrator Stage ${stage}]: ${msg}`);
      if (typeof onProgress === "function") {
        onProgress({
          type: "progress_update",
          sessionId: session.sessionId,
          stage,
          stageName: msg,
          ...extra,
        });
      }
    };

    emit(1, "Verifying Meta Ad Account credentials & permissions...");

    let targetAccountId = session.metaAccountId || session.contextNodeData?.adAccountId;
    if (!targetAccountId) {
      throw new Error("No Meta Ad Account selected. Please select a Meta Ads account in AI Context → Channel Node before creating campaigns.");
    }

    const cleanAccId = String(targetAccountId).replace(/^act_/, "");
    const accountDoc = await MetaAccount.findOne({
      userId,
      $or: [{ accountId: targetAccountId }, { accountId: cleanAccId }, { accountId: `act_${cleanAccId}` }],
    }).lean();

    if (!accountDoc) {
      throw new Error(`Selected Meta Ad Account "act_${cleanAccId}" is not found in your connected Meta accounts. Please reconnect or select a valid Meta account.`);
    }

    if (!accountDoc.isActive) {
      throw new Error(`Selected Meta Ad Account "act_${cleanAccId}" is inactive or disabled. Please activate it in connected accounts.`);
    }

    let effectiveToken = accountDoc.accessToken || accountDoc.oauthToken;
    if (!effectiveToken) {
      throw new Error(`Selected Meta Ad Account "act_${cleanAccId}" has missing or invalid credentials. Please reconnect the account.`);
    }

    emit(1, `Meta Ad Account act_${cleanAccId} validated successfully.`);

    const campaignName = session.campaignName;
    const adSetName = session.adSetName;
    const objective = session.objective || "OUTCOME_SALES";
    const budget = session.preview?.campaignDetails?.find((d) => d.field.includes("Budget"))?.value || 1000;
    const parsedBudget = typeof budget === "number" ? budget : Number(String(budget).replace(/[^0-9.]/g, "")) || 1000;

    let metaCampaignId = session.creationJob.metaCampaignId;
    let metaAdSetId = session.creationJob.metaAdSetId;
    let adResults = session.creationJob.adResults || [];

    // Helper: Find existing result for row
    const findAdResult = (sourceRow) => adResults.find((r) => r.sourceRow === sourceRow);

    // Extract Ad Set configuration and asset settings at outer scope so available across all steps
    const adSetDetails = session.preview?.adSetDetails || [];
    const perfGoalItem = adSetDetails.find((d) => d.field === "Performance Goal" || d.field === "Optimization Goal");
    let optGoal = session.campaignType === "APP_PROMOTION" ? "APP_INSTALLS" : "VALUE";
    if (session.campaignType !== "APP_PROMOTION") {
      if (perfGoalItem?.value) {
        const v = String(perfGoalItem.value).toLowerCase();
        if (v.includes("conversion") && !v.includes("value") && !v.includes("maximise value")) {
          optGoal = "OFFSITE_CONVERSIONS";
        } else if (v.includes("install")) {
          optGoal = "APP_INSTALLS";
        } else if (v.includes("click")) {
          optGoal = "LINK_CLICKS";
        } else if (v.includes("landing") || v.includes("view")) {
          optGoal = "LANDING_PAGE_VIEWS";
        } else {
          optGoal = "VALUE"; // Default: Maximise value of conversions
        }
      } else {
        optGoal = "VALUE"; // Default: Maximise value of conversions
      }
    }
    const billingEv = adSetDetails.find((d) => d.field === "Billing Event")?.value || "IMPRESSIONS";
    const trackingRow = String(adSetDetails.find((d) => d.field.includes("Tracking") || d.field.includes("Conversion"))?.value || "");

    // Robust asset extraction for App Promotion and Website campaigns
    let appId = session.appId || session.userAnswers?.appId || session.userAnswers?.app_id || session.chatInjectedValues?.appId || session.chatInjectedValues?.app_id || session.userAnswers?.applicationId || null;
    let objectStoreUrl = session.objectStoreUrl || session.userAnswers?.objectStoreUrl || session.userAnswers?.object_store_url || session.chatInjectedValues?.objectStoreUrl || session.chatInjectedValues?.object_store_url || null;
    let pixelId = session.pixelId || session.userAnswers?.pixelId || session.userAnswers?.pixel_id || session.chatInjectedValues?.pixelId || session.chatInjectedValues?.pixel_id || session.userAnswers?.dataset_id || null;

    if (!appId && trackingRow.includes("Meta App ID:")) {
      const match = trackingRow.match(/Meta App ID:\s*([0-9]+)/i);
      if (match) appId = match[1];
    }
    if (!objectStoreUrl && trackingRow.includes("Store:")) {
      const match = trackingRow.match(/Store:\s*([^\s|]+)/i);
      if (match) objectStoreUrl = match[1];
    }
    if (!pixelId && trackingRow.includes("Pixel/Dataset ID:")) {
      const match = trackingRow.match(/Pixel\/Dataset ID:\s*([0-9]+)/i);
      if (match) pixelId = match[1];
    }

    const previewAdsList = session.preview?.adDetails || [];
    const firstAdItem = previewAdsList[0];
    if (!appId && firstAdItem?.appId) {
      appId = firstAdItem.appId;
    }
    if (!objectStoreUrl && firstAdItem?.destination && /play\.google\.com|apps\.apple\.com/i.test(firstAdItem.destination)) {
      objectStoreUrl = firstAdItem.destination;
    }

    const isAppCamp = session.campaignType === "APP_PROMOTION" || optGoal === "APP_INSTALLS";

    // Dynamic Cross-Account App & Store URL Auto-Routing and Resolution
    if (isAppCamp) {
      try {
        const appRes = await MetaApiService.verifyAndResolveAppAsset({
          accountId: targetAccountId,
          accessToken: effectiveToken,
          requestedAppId: appId,
          requestedStoreUrl: objectStoreUrl,
          objective: "OUTCOME_APP_PROMOTION",
        });

        if (appRes && appRes.valid) {
          if (appRes.resolvedStoreUrl) {
            objectStoreUrl = appRes.resolvedStoreUrl;
            session.objectStoreUrl = objectStoreUrl;
          }
          if (appRes.appId) {
            appId = appRes.appId;
            session.appId = appId;
          }
          if (appRes.targetAccountId && appRes.targetAccountId !== targetAccountId) {
            const newAccId = appRes.targetAccountId.startsWith("act_") ? appRes.targetAccountId : `act_${appRes.targetAccountId}`;
            emit(1, `Auto-routing App Promotion to account "${appRes.targetAccountName || newAccId}" (${newAccId}) where App "${appId}" is authorized.`);
            const routedDoc = await MetaAccount.findOne({
              userId,
              $or: [{ accountId: newAccId }, { accountId: newAccId.replace(/^act_/, "") }],
            }).lean();
            if (routedDoc && (routedDoc.accessToken || routedDoc.oauthToken)) {
              targetAccountId = newAccId;
              effectiveToken = routedDoc.accessToken || routedDoc.oauthToken;
              session.metaAccountId = targetAccountId;
              // If metaCampaignId was previously created on the mismatched account, reset it
              if (metaCampaignId) {
                metaCampaignId = null;
                session.creationJob.metaCampaignId = null;
              }
            }
          }
        }
      } catch (routingErr) {
        console.warn("[App Asset Auto-Routing Warning]:", routingErr.message);
      }
    }

    try {
      // Step 1: Target Existing Campaign or Create New (Idempotent)
      if (!metaCampaignId && session.existingCampaignId) {
        metaCampaignId = session.existingCampaignId;
        session.creationJob.metaCampaignId = metaCampaignId;
        await session.save();
        emit(2, `🎯 Targeting existing Campaign ID "${metaCampaignId}" provided in your prompt.`);
      }

      if (!metaCampaignId) {
        emit(2, `Creating Campaign "${campaignName}" on Meta Graph API...`);
        console.log("\n--------------------------------------------------------------------------------");
        console.log(`🚀 [META ADS API DISPATCH ➔ LEVEL 1: CREATING CAMPAIGN]`);
        console.log(`   🎯 Target Account ID : ${targetAccountId}`);
        console.log(`   🏷️  Campaign Name    : "${campaignName}"`);
        console.log(`   🎯 Objective        : ${objective} (Derived from Ad Channel Funnel: "${session.contextNodeData?.funnelEvent || "Purchase"}")`);
        console.log(`   💰 Daily Budget     : ₹${parsedBudget}`);
        console.log("--------------------------------------------------------------------------------");

        const campRes = await executeAgentTool("create_meta_campaign", {
          name: campaignName,
          objective,
          dailyBudget: parsedBudget,
          status: "PAUSED",
          accountId: targetAccountId,
          userId,
        });

        metaCampaignId = campRes.data?.campaignId || campRes.campaignId || campRes.id;
        if (!metaCampaignId) {
          throw new Error(`Failed to create Meta campaign: ${campRes.error || campRes.message || "Unknown error"}`);
        }
        session.creationJob.metaCampaignId = metaCampaignId;
        await session.save();
        console.log(`✅ [META ADS API] Level 1 Campaign Created Successfully! ID: ${metaCampaignId}`);
        emit(2, `Campaign Created Successfully (ID: ${metaCampaignId})`);
      } else {
        console.log(`ℹ️ [META ADS API] Reusing existing Campaign (ID: ${metaCampaignId})`);
        emit(2, `Using Campaign (ID: ${metaCampaignId})`);
      }

      // Step 2: Target Existing Ad Set or Create New (Idempotent)
      if (!metaAdSetId && session.existingAdSetId) {
        metaAdSetId = session.existingAdSetId;
        session.creationJob.metaAdSetId = metaAdSetId;
        await session.save();
        emit(3, `🎯 Targeting existing Ad Set ID "${metaAdSetId}" under Campaign ${metaCampaignId}.`);
      }

      if (!metaAdSetId) {
        let finalOptGoal = optGoal;
        if (finalOptGoal === "VALUE") {
          const isVerified = await MetaApiService.isAccountBusinessVerified(targetAccountId, effectiveToken);
          if (!isVerified) {
            emit(3, `Account Business Check: Meta Account "${targetAccountId}" is not business verified. Value Optimization requires business verification. Setting Performance Goal to "Maximise number of conversions" for delivery...`);
            finalOptGoal = "OFFSITE_CONVERSIONS";
          } else {
            emit(3, `Account Business Check: Meta Account "${targetAccountId}" is a verified business! Setting Performance Goal to "Maximise value of conversions".`);
          }
        }

        emit(3, `Creating Ad Set "${adSetName}" under Campaign ${metaCampaignId}...`);
        console.log("\n--------------------------------------------------------------------------------");
        console.log(`🎯 [META ADS API DISPATCH ➔ LEVEL 2: CREATING AD SET]`);
        console.log(`   🎯 Target Account ID : ${targetAccountId}`);
        console.log(`   🏷️  Ad Set Name      : "${adSetName}"`);
        console.log(`   🔗 Parent Campaign  : ${metaCampaignId}`);
        console.log(`   ⚡ Optimization Goal: ${finalOptGoal}`);
        console.log(`   💳 Billing Event    : ${billingEv}`);
        console.log("--------------------------------------------------------------------------------");

        const adSetRes = await executeAgentTool("create_meta_ad_set", {
          campaignId: metaCampaignId,
          name: adSetName,
          dailyBudget: parsedBudget,
          optimizationGoal: finalOptGoal,
          billingEvent: billingEv,
          status: "PAUSED",
          accountId: targetAccountId,
          userId,
          objective,
          appId,
          objectStoreUrl,
          pixelId,
          destination_type: isAppCamp ? "APP" : "WEBSITE",
          trackingType: isAppCamp ? "APP" : ((pixelId && appId) ? "BOTH" : "WEBSITE"),
          customEventType: finalOptGoal === "APP_INSTALLS" ? null : (session.customEventType || session.userAnswers?.customEventType || null),
        });

        metaAdSetId = adSetRes.data?.adSetId || adSetRes.adSetId || adSetRes.id;
        if (!metaAdSetId) {
          throw new Error(`Failed to create Meta Ad Set: ${adSetRes.error || adSetRes.message || "Unknown error"}`);
        }
        session.creationJob.metaAdSetId = metaAdSetId;
        await session.save();
        console.log(`✅ [META ADS API] Level 2 Ad Set Created Successfully! ID: ${metaAdSetId}`);
        emit(3, `Ad Set Created Successfully (ID: ${metaAdSetId})`);
      } else {
        console.log(`ℹ️ [META ADS API] Reusing existing Ad Set (ID: ${metaAdSetId})`);
        emit(3, `Reusing already created Ad Set (ID: ${metaAdSetId})`);
      }

      // Step 3: Row-by-Row Media (Video & Image) Download & Meta Upload with DB Persistence (Stage 4)
      const previewAds = session.preview?.adDetails || [];
      emit(4, `Pre-processing & downloading media assets for ${previewAds.length} ad rows...`);
      const effectiveToken = await MetaApiService.resolveOAuthToken(targetAccountId, userId, null);

      // Pre-fetch existing videoIds and imageHashes from MetaUploadedMedia model and MongoDB sessions
      const dbVideoMap = new Map();
      const dbImageMap = new Map();

      try {
        const cachedMediaDocs = await MetaUploadedMedia.find({ accountId: targetAccountId }).lean().catch(() => []);
        for (const cm of cachedMediaDocs) {
          if (cm.mediaType === "VIDEO" && cm.videoId) {
            if (cm.sourceUrl && !dbVideoMap.has(cm.sourceUrl)) {
              dbVideoMap.set(cm.sourceUrl, { videoId: cm.videoId, videoFilePath: cm.localFilePath });
            }
            if (cm.sourceRow && !dbVideoMap.has(`row_${cm.sourceRow}`)) {
              dbVideoMap.set(`row_${cm.sourceRow}`, { videoId: cm.videoId, videoFilePath: cm.localFilePath });
            }
          } else if (cm.mediaType === "IMAGE" && (cm.imageHash || cm.metaMediaId)) {
            const hash = cm.imageHash || cm.metaMediaId;
            if (cm.sourceUrl && !dbImageMap.has(cm.sourceUrl)) {
              dbImageMap.set(cm.sourceUrl, hash);
            }
            if (cm.sourceRow && !dbImageMap.has(`row_${cm.sourceRow}`)) {
              dbImageMap.set(`row_${cm.sourceRow}`, hash);
            }
          }
        }
      } catch (mediaPrefetchErr) {
        console.warn("[MetaAdsOrchestrator] Warning prefetching cached media from MetaUploadedMedia:", mediaPrefetchErr.message);
      }

      try {
        const query = { "preview.adDetails.videoId": { $exists: true, $ne: null } };
        if (session.userId) {
          query.userId = session.userId;
        }
        let pastSessions = await CampaignPreparationSession.find(query).sort({ createdAt: -1 }).limit(10);
        if (!pastSessions || pastSessions.length === 0) {
          pastSessions = await CampaignPreparationSession.find({ "preview.adDetails.videoId": { $exists: true, $ne: null } }).sort({ createdAt: -1 }).limit(10);
        }

        for (const ps of pastSessions) {
          // Strictly only reuse videos uploaded to the exact same Meta Ad Account
          if (ps.metaAccountId && ps.metaAccountId !== targetAccountId) continue;
          for (const pad of ps.preview?.adDetails || []) {
            const vId = pad.videoId ? String(pad.videoId).trim() : null;
            if (vId && /^\d{10,20}$/.test(vId) && pad.creative && !dbVideoMap.has(pad.creative)) {
              dbVideoMap.set(pad.creative, { videoId: vId, videoFilePath: pad.videoFilePath });
            }
            const iHash = pad.imageHash ? String(pad.imageHash).trim() : null;
            if (iHash && pad.creative && !dbImageMap.has(pad.creative)) {
              dbImageMap.set(pad.creative, iHash);
            }
          }
        }
        console.log(`[MetaAdsOrchestrator Stage 4]: Found ${dbVideoMap.size} cached videos and ${dbImageMap.size} cached images for account ${targetAccountId}.`);
      } catch (cacheErr) {
        console.warn("[MetaAdsOrchestrator] Warning prefetching cached media from DB:", cacheErr.message);
      }

      emit(4, `Processing assets & creating ${previewAds.length} Meta Ads row-by-row...`);

      for (let i = 0; i < previewAds.length; i++) {
        const adConfig = previewAds[i];
        const rowNo = adConfig.sourceRow || (i + 2);
        let existingRes = findAdResult(rowNo);

        if (!existingRes) {
          existingRes = {
            sourceRow: rowNo,
            adName: adConfig.adName,
            videoId: adConfig.videoId || null,
            creativeId: null,
            adId: null,
            status: "SKIPPED",
            error: null,
          };
          adResults.push(existingRes);
        }

        // 1. Only skip if already succeeded with a verified live Meta Ad ID (15-20 digit real Meta ID, not mock/test ID)
        const isMockAdId = existingRes.adId === "1234567890" || String(existingRes.adId || "").startsWith("mock_") || String(existingRes.adId || "").startsWith("ad_");
        const isRealMetaAdId = typeof existingRes.adId === "string" && /^\d{15,20}$/.test(existingRes.adId.trim()) && !isMockAdId;
        if (existingRes.status === "SUCCESS" && isRealMetaAdId) {
          emit(4, `Skipping Row #${rowNo} "${adConfig.adName}" — Already Created on Meta (ID: ${existingRes.adId})`);
          continue;
        }

        emit(4, `[Row #${rowNo}] Processing asset & creating Ad "${adConfig.adName}" (${i + 1}/${previewAds.length})...`);

        // 2. Detect creative type (VIDEO vs IMAGE) for this specific row
        let isVideo = String(adConfig.creativeType || "").toUpperCase().includes("VID");
        if (!isVideo && adConfig.creative && typeof adConfig.creative === "string") {
          if (/\.(mp4|mov|avi|webm|m4v|mkv)($|\?)/i.test(adConfig.creative)) {
            isVideo = true;
          } else if (adConfig.creative.includes("drive.google.com") || adConfig.creative.includes("docs.google.com")) {
            const fileId = driveService.extractFileId(adConfig.creative);
            if (fileId) {
              try {
                const meta = await driveService.getFileMetadata(fileId);
                if (meta?.mimeType?.startsWith("video/") || /\.(mp4|mov|avi|webm|m4v|mkv)$/i.test(meta?.name || "")) {
                  isVideo = true;
                } else if (meta?.mimeType === "application/vnd.google-apps.folder" || adConfig.creative.includes("/folders/")) {
                  const items = await driveService.listFolderContents(fileId);
                  const hasVideo = (items || []).some((item) => item.isVideo);
                  if (hasVideo) isVideo = true;
                }
              } catch (e) {}
            }
          }
        }

        // 3. Process Asset INLINE for this row (Download -> Upload to Meta -> Store in DB with Row Number)
        if (isVideo) {
          adConfig.creativeType = "VIDEO";

          // Reuse existing stored videoId from DB if available
          if (!adConfig.videoId && existingRes.videoId) {
            adConfig.videoId = existingRes.videoId;
          }
          if (!adConfig.videoId) {
            const cached = dbVideoMap.get(adConfig.creative) || dbVideoMap.get(`row_${rowNo}`);
            const cachedVidId = typeof cached === "object" ? cached?.videoId : cached;
            const cachedFilePath = typeof cached === "object" ? cached?.videoFilePath : null;
            if (cachedVidId && /^\d{10,20}$/.test(String(cachedVidId).trim())) {
              adConfig.videoId = String(cachedVidId).trim();
              adConfig.videoFilePath = cachedFilePath || adConfig.videoFilePath;
              existingRes.videoId = String(cachedVidId).trim();
              emit(4, `⚡ Row #${rowNo} ("${adConfig.adName}"): Reusing stored Video ID ${cachedVidId} from DB.`);
            }
          }

          // If not in DB, download and upload right now for this row
          if (!adConfig.videoId && adConfig.creative) {
            emit(4, `Row #${rowNo} ("${adConfig.adName}"): Downloading video asset from Google Drive...`);
            try {
              let localFilePath = adConfig.videoFilePath;
              if (!localFilePath || !fs.existsSync(localFilePath)) {
                const dlInfo = await driveService.downloadCreative(adConfig.creative, null, "video");
                if (dlInfo?.filePath && fs.existsSync(dlInfo.filePath)) {
                  localFilePath = dlInfo.filePath;
                  adConfig.videoFilePath = localFilePath;
                }
              }

              if (localFilePath && fs.existsSync(localFilePath)) {
                emit(4, `Row #${rowNo} ("${adConfig.adName}"): Uploading video to Meta Ads Manager (/advideos)...`);
                const uploadRes = await MetaApiService.uploadVideo(targetAccountId, effectiveToken, {
                  filePath: localFilePath,
                  title: adConfig.adName || `Row_${rowNo}_Creative`,
                  description: adConfig.primaryText || "",
                  userId,
                  sourceRow: rowNo,
                  rowNo,
                });

                const rowVidId = uploadRes?.id || uploadRes?.video_id;
                if (rowVidId) {
                  if (effectiveToken && !effectiveToken.startsWith("EAAB_simulated")) {
                    emit(4, `Row #${rowNo}: Video ID ${rowVidId} waiting for Meta transcoding...`);
                    await MetaApiService.waitForVideoReady(rowVidId, effectiveToken, 30);
                  }

                  adConfig.videoId = String(rowVidId);
                  existingRes.videoId = String(rowVidId);
                  emit(4, `✅ Row #${rowNo} ("${adConfig.adName}"): Meta Video ID ${rowVidId} stored in DB for Row #${rowNo}.`);

                  // Persist to MetaUploadedMedia DB model immediately with row number
                  await MetaUploadedMedia.recordMedia({
                    userId,
                    accountId: targetAccountId,
                    mediaType: "VIDEO",
                    metaMediaId: String(rowVidId),
                    videoId: String(rowVidId),
                    sourceRow: rowNo,
                    rowNumber: rowNo,
                    adName: adConfig.adName,
                    sourceUrl: adConfig.creative,
                    localFilePath,
                    campaignName: session.campaignName,
                    adSetName: session.adSetName,
                    sessionId: session.sessionId,
                    conversationId: session.conversationId,
                    spreadsheetId: session.source?.spreadsheetId,
                    metaResponse: uploadRes,
                    status: "READY",
                  });

                  if (session.preview?.adDetails?.[i]) {
                    session.preview.adDetails[i].videoId = String(rowVidId);
                    session.preview.adDetails[i].videoFilePath = localFilePath;
                    session.preview.adDetails[i].creativeType = "VIDEO";
                  }
                  session.creationJob.adResults = adResults;
                  await session.save();
                } else {
                  console.warn(`[MetaAdsOrchestrator] Warning: No video ID returned for Row #${rowNo}`);
                }
              }
            } catch (videoDlErr) {
              console.error(`[MetaAdsOrchestrator] Error ingesting video for Row #${rowNo}:`, videoDlErr.message);
              emit(4, `⚠️ Row #${rowNo} Video Ingestion Failed: ${videoDlErr.message}`);
              existingRes.error = `Video ingestion failed: ${videoDlErr.message}`;
            }
          }
        } else {
          // IMAGE ASSET
          adConfig.creativeType = "IMAGE";

          // Reuse existing stored imageHash from DB if available
          if (!adConfig.imageHash && existingRes.imageHash) {
            adConfig.imageHash = existingRes.imageHash;
          }
          if (!adConfig.imageHash) {
            const cachedHash = dbImageMap.get(adConfig.creative) || dbImageMap.get(`row_${rowNo}`);
            if (cachedHash) {
              adConfig.imageHash = String(cachedHash).trim();
              existingRes.imageHash = String(cachedHash).trim();
              emit(4, `⚡ Row #${rowNo} ("${adConfig.adName}"): Reusing stored Image Hash ${cachedHash} from DB.`);
            }
          }

          // If not in DB, download and upload right now for this row
          if (!adConfig.imageHash && adConfig.creative) {
            emit(4, `Row #${rowNo} ("${adConfig.adName}"): Downloading image asset from Google Drive/URL...`);
            try {
              let localFilePath = adConfig.imageFilePath;
              if (!localFilePath || !fs.existsSync(localFilePath)) {
                const dlInfo = await driveService.downloadCreative(adConfig.creative, null, "image");
                if (dlInfo?.filePath && fs.existsSync(dlInfo.filePath)) {
                  localFilePath = dlInfo.filePath;
                  adConfig.imageFilePath = localFilePath;
                }
              }

              if (localFilePath && fs.existsSync(localFilePath)) {
                emit(4, `Row #${rowNo} ("${adConfig.adName}"): Uploading image to Meta Ads Manager (/adimages)...`);
                const imgUpRes = await MetaApiService.uploadAdImage(targetAccountId, effectiveToken, {
                  filePath: localFilePath,
                  userId,
                  sourceRow: rowNo,
                  rowNo,
                  adName: adConfig.adName,
                });

                const rowImgHash = imgUpRes?.hash;
                if (rowImgHash) {
                  adConfig.imageHash = String(rowImgHash);
                  existingRes.imageHash = String(rowImgHash);
                  emit(4, `✅ Row #${rowNo} ("${adConfig.adName}"): Meta Image Hash ${rowImgHash} stored in DB for Row #${rowNo}.`);

                  // Persist to MetaUploadedMedia DB model immediately with row number
                  await MetaUploadedMedia.recordMedia({
                    userId,
                    accountId: targetAccountId,
                    mediaType: "IMAGE",
                    metaMediaId: String(rowImgHash),
                    imageHash: String(rowImgHash),
                    sourceRow: rowNo,
                    rowNumber: rowNo,
                    adName: adConfig.adName,
                    sourceUrl: adConfig.creative,
                    localFilePath,
                    campaignName: session.campaignName,
                    adSetName: session.adSetName,
                    sessionId: session.sessionId,
                    conversationId: session.conversationId,
                    spreadsheetId: session.source?.spreadsheetId,
                    metaResponse: imgUpRes,
                    status: "READY",
                  });

                  if (session.preview?.adDetails?.[i]) {
                    session.preview.adDetails[i].imageHash = String(rowImgHash);
                    session.preview.adDetails[i].imageFilePath = localFilePath;
                    session.preview.adDetails[i].creativeType = "IMAGE";
                  }
                  session.creationJob.adResults = adResults;
                  await session.save();
                } else {
                  console.warn(`[MetaAdsOrchestrator] Warning: No image hash returned for Row #${rowNo}`);
                }
              }
            } catch (imageDlErr) {
              console.error(`[MetaAdsOrchestrator] Error ingesting image for Row #${rowNo}:`, imageDlErr.message);
              emit(4, `⚠️ Row #${rowNo} Image Ingestion Warning: ${imageDlErr.message}`);
            }
          }
        }

        // 4. Create Meta Ad for THIS row now!
        const rowVideoId = adConfig.videoId || existingRes.videoId;
        const rowImageHash = adConfig.imageHash || existingRes.imageHash;

        emit(4, `Publishing Ad #${i + 1} "${adConfig.adName}" to Meta Ads Manager (Row #${rowNo})...`);

        try {
          let createdAdRes = null;

          const defaultCta = isAppCamp ? "DOWNLOAD" : "BOOK_TRAVEL";
          const adAppId = appId || adConfig.appId || session.appId || session.userAnswers?.appId || session.userAnswers?.app_id || session.chatInjectedValues?.appId || session.chatInjectedValues?.app_id || null;
          const adPixelId = adConfig.pixelId || session.pixelId || session.userAnswers?.pixelId || session.userAnswers?.pixel_id || session.chatInjectedValues?.pixelId || session.chatInjectedValues?.pixel_id || null;
          const adTrackingType = (adPixelId && adAppId) ? "BOTH" : (isAppCamp ? "APP" : (adPixelId ? "WEBSITE" : (adAppId ? "APP" : "WEBSITE")));
          const adStoreUrl = isAppCamp ? (objectStoreUrl || session.objectStoreUrl || session.userAnswers?.objectStoreUrl || session.userAnswers?.object_store_url || session.chatInjectedValues?.objectStoreUrl || session.chatInjectedValues?.object_store_url || adConfig.destination) : null;
          const adPageId = cleanPageId(
            adConfig.pageId ||
            session.preview?.adDetails?.[i]?.pageId ||
            session.preview?.adDetails?.[0]?.pageId ||
            session.pageId ||
            session.userAnswers?.pageId ||
            session.userAnswers?.page_id ||
            session.chatInjectedValues?.pageId ||
            session.chatInjectedValues?.page_id ||
            session.contextNodeData?.pageId
          );
          const adInstagramId = adConfig.instagramId || adConfig.instagram_user_id || adConfig.instagramUserId || session.userAnswers?.instagramId || session.userAnswers?.instagram_id || session.chatInjectedValues?.instagramId || null;
          let adUrlTags = adConfig.urlTags || adConfig.url_tags || adConfig.urlParameter || null;
          if (!adUrlTags && adConfig.tracking) {
            const trackingStr = String(adConfig.tracking).trim();
            if (trackingStr.startsWith("UTM:")) {
              adUrlTags = trackingStr.replace(/^UTM:\s*/i, "").trim();
            } else if (trackingStr.includes("utm_") || trackingStr.includes("=")) {
              adUrlTags = trackingStr;
            }
          }

          const adDisplayLink = adConfig.displayLink || adConfig.display_link || session.preview?.adDetails?.[i]?.displayLink || session.preview?.adDetails?.[0]?.displayLink || session.userAnswers?.displayLink || session.userAnswers?.display_link || session.chatInjectedValues?.displayLink || session.chatInjectedValues?.display_link || null;

          const candidateDest =
            adConfig.destination ||
            adConfig.landingPageUrl ||
            adConfig.linkUrl ||
            session.preview?.adDetails?.[i]?.destination ||
            session.userAnswers?.landingPageUrl ||
            session.userAnswers?.landing_page_url ||
            session.userAnswers?.website_url ||
            session.chatInjectedValues?.landingPageUrl ||
            session.chatInjectedValues?.landing_page_url ||
            session.chatInjectedValues?.website_url ||
            session.contextNodeData?.productUrl ||
            session.contextNodeData?.products?.[0]?.url ||
            null;
          const adDestUrl = (isAppCamp && adStoreUrl)
            ? (/play\.google\.com|apps\.apple\.com|itunes\.apple\.com/i.test(candidateDest || "") ? candidateDest : adStoreUrl)
            : candidateDest;

          const adHeadline =
            adConfig.headline ||
            session.preview?.adDetails?.[i]?.headline ||
            session.userAnswers?.headline ||
            session.chatInjectedValues?.headline ||
            (session.contextNodeData?.productName ? `${session.contextNodeData.productName} - Special Offer` : null);

          const adPrimaryText =
            adConfig.primaryText ||
            session.preview?.adDetails?.[i]?.primaryText ||
            session.userAnswers?.primaryText ||
            session.userAnswers?.primary_text ||
            session.chatInjectedValues?.primaryText ||
            session.chatInjectedValues?.primary_text ||
            session.contextNodeData?.briefName ||
            session.contextNodeData?.productName ||
            null;

          console.log(`\n--------------------------------------------------------------------------------`);
          console.log(`🎨 [META ADS API DISPATCH ➔ LEVEL 3: AD CREATIVE (Row #${rowNo})]:`);
          console.log(`   🎯 Target Account ID : ${targetAccountId}`);
          console.log(`   🔗 Ad Set ID        : ${metaAdSetId}`);
          console.log(`   🏷️  Ad Name          : "${adConfig.adName}"`);
          console.log(`   🎬 Format           : ${isVideo ? "Video Ad" : "Image Ad"}`);
          console.log(`   📂 Media Creative   : ${adConfig.creative} (Source: Warehouse Sheet)`);
          console.log(`   ✍️  Headline         : "${adHeadline}" (Source: ${adConfig.headline ? "Sheet Row" : "Product Node [" + (session.contextNodeData?.productName || "") + "]"})`);
          console.log(`   📄 Primary Text     : "${adPrimaryText ? adPrimaryText.slice(0, 60) + "..." : "(Empty)"}" (Source: ${adConfig.primaryText ? "Sheet Row" : "Marketing Brief / Product Node"})`);
          console.log(`   🌐 Destination URL  : "${adDestUrl}" (Source: ${adConfig.destination || adConfig.landingPageUrl ? "Sheet Row" : "Product Node [productUrl: " + (session.contextNodeData?.productUrl || "") + "]"})`);
          console.log(`   🔘 CTA Button       : "${adConfig.cta || defaultCta}"`);
          console.log(`   📄 Facebook Page ID : "${adPageId}"`);
          console.log("--------------------------------------------------------------------------------");

          if (isVideo) {
            createdAdRes = await executeAgentTool("create_meta_video_ad", {
              adSetId: metaAdSetId,
              name: adConfig.adName,
              videoId: rowVideoId,
              videoFilePath: adConfig.videoFilePath,
              videoUrl: adConfig.creative,
              headline: adHeadline,
              primaryText: adPrimaryText,
              description: adConfig.description,
              destinationUrl: adDestUrl,
              linkUrl: adDestUrl,
              destination: adDestUrl,
              landingPageUrl: adDestUrl,
              displayLink: adDisplayLink,
              display_link: adDisplayLink,
              callToAction: adConfig.cta || defaultCta,
              pageId: adPageId,
              instagramId: adInstagramId,
              instagramActorId: adInstagramId,
              status: "PAUSED",
              accountId: targetAccountId,
              userId,
              pixelId: adPixelId,
              appId: adAppId,
              objectStoreUrl: adStoreUrl,
              trackingType: adTrackingType,
              urlTags: adUrlTags,
              url_tags: adUrlTags,
            });
          } else {
            createdAdRes = await executeAgentTool("create_meta_ad", {
              adSetId: metaAdSetId,
              name: adConfig.adName,
              headline: adHeadline,
              primaryText: adPrimaryText,
              description: adConfig.description,
              linkUrl: adDestUrl,
              destinationUrl: adDestUrl,
              destination: adDestUrl,
              landingPageUrl: adDestUrl,
              displayLink: adDisplayLink,
              display_link: adDisplayLink,
              callToAction: adConfig.cta || defaultCta,
              pageId: adPageId,
              instagramId: adInstagramId,
              instagramActorId: adInstagramId,
              status: "PAUSED",
              accountId: targetAccountId,
              userId,
              imageUrl: adConfig.creative,
              driveUrl: adConfig.creative,
              imageHash: rowImageHash,
              pixelId: adPixelId,
              appId: adAppId,
              objectStoreUrl: adStoreUrl,
              trackingType: adTrackingType,
              urlTags: adUrlTags,
              url_tags: adUrlTags,
            });
          }

          const adId = createdAdRes.data?.adId || createdAdRes.adId || createdAdRes.id;
          const creativeId = createdAdRes.data?.creativeId || createdAdRes.creativeId;
          const outVideoId = createdAdRes.data?.videoId || createdAdRes.videoId || rowVideoId;
          const outImageHash = createdAdRes.data?.imageHash || createdAdRes.imageHash || rowImageHash;

          if (adId) {
            existingRes.status = "SUCCESS";
            existingRes.adId = adId;
            existingRes.creativeId = creativeId || `creative_${adId}`;
            existingRes.videoId = outVideoId || null;
            existingRes.imageHash = outImageHash || null;
            existingRes.error = null;
            emit(4, `🎉 Ad "${adConfig.adName}" (Row #${rowNo}) Created Successfully! (Ad ID: ${adId})`);

            console.log("--------------------------------------------------------------------------------");
            console.log(`🚀 ROW #${rowNo < 10 ? "0" + rowNo : rowNo} | Ad Name: "${adConfig.adName}"`);
            console.log(`   ├─ Creative Type  : ${isVideo ? "🎬 VIDEO" : "🖼️ IMAGE"}`);
            if (isVideo && outVideoId) console.log(`   ├─ Meta Video ID  : \x1b[32m${outVideoId}\x1b[0m`);
            if (!isVideo && outImageHash) console.log(`   ├─ Meta Image Hash: \x1b[32m${outImageHash}\x1b[0m`);
            console.log(`   ├─ Meta Ad ID     : \x1b[32m${adId}\x1b[0m`);
            console.log(`   └─ Status         : SUCCESS (Uploaded & Created on Meta Ads Manager)`);
            console.log("--------------------------------------------------------------------------------");
          } else {
            existingRes.status = "FAILED";
            existingRes.videoId = rowVideoId || null;
            existingRes.imageHash = outImageHash || null;
            existingRes.error = createdAdRes.error || createdAdRes.message || "Failed to create ad on Meta Graph API";
            emit(4, `Ad "${adConfig.adName}" Failed: ${existingRes.error}`);
          }
        } catch (adErr) {
          const cleanAccountId = targetAccountId.replace(/^act_/, "");
          const isBillingErr =
            adErr.message.includes("1359188") ||
            adErr.message.includes("1487194") ||
            adErr.message.toLowerCase().includes("unsettled") ||
            adErr.message.toLowerCase().includes("payment") ||
            adErr.message.toLowerCase().includes("billing");
          existingRes.status = "FAILED";
          existingRes.videoId = rowVideoId || null;
          if (isBillingErr) {
            existingRes.error = `Meta Ad Account is Unsettled (Unpaid Balance). Clear pending balance in Meta Ads Manager: https://adsmanager.facebook.com/billing_hub?act=${cleanAccountId}`;
            emit(5, `⚠️ Ad "${adConfig.adName}" (Row #${rowNo}) Failed: Ad Account has an unsettled balance. Click "Pay Now" in Meta Ads Manager to clear it.`);
          } else {
            existingRes.error = adErr.message;
            emit(5, `Ad "${adConfig.adName}" Failed: ${adErr.message}`);
          }
        }

        session.creationJob.adResults = adResults;
        session.markModified("creationJob.adResults");
        session.markModified("creationJob");
        await session.save();
      }

      // Step 3b: Live Ground-Truth Reconciliation with Meta Graph API
      // If Meta Marketing API created ads, reconcile actual ad IDs and creatives directly from Meta
      adResults = await this.reconcileWithMetaAds({
        targetAccountId,
        effectiveToken,
        metaAdSetId,
        adResults,
        previewAds,
      });

      session.creationJob.adResults = adResults;
      session.markModified("creationJob.adResults");
      session.markModified("creationJob");

      // Step 4: Finalize Job Status
      const successCount = adResults.filter((r) => r.status === "SUCCESS" && Boolean(r.adId)).length;
      const failCount = adResults.filter((r) => r.status === "FAILED").length;

      session.creationJob.completedAt = new Date();

      if (failCount === 0 && successCount > 0) {
        session.status = "COMPLETED";
        session.creationJob.status = "COMPLETED";
      } else if (successCount > 0 && failCount > 0) {
        session.status = "COMPLETED";
        session.creationJob.status = "PARTIAL";
      } else {
        session.status = "FAILED";
        session.creationJob.status = "FAILED";
      }

      session.markModified("creationJob");
      await session.save();

      return {
        success: successCount > 0,
        status: session.creationJob.status,
        metaCampaignId,
        metaAdSetId,
        totalAds: previewAds.length,
        successCount,
        failCount,
        adResults,
      };
    } catch (err) {
      session.status = "FAILED";
      session.creationJob.status = "FAILED";
      session.creationJob.error = err.message;
      session.creationJob.completedAt = new Date();
      session.markModified("creationJob");
      await session.save();
      throw err;
    }
  }

  /**
   * Reconcile creation results with live Meta Marketing API ground truth
   */
  static async reconcileWithMetaAds({
    targetAccountId,
    effectiveToken,
    metaAdSetId,
    adResults = [],
    previewAds = [],
  } = {}) {
    if (!metaAdSetId || !effectiveToken || effectiveToken.startsWith("EAAB_simulated")) {
      return adResults;
    }

    try {
      const axios = (await import("axios")).default;
      const res = await axios.get(`https://graph.facebook.com/v24.0/${metaAdSetId}/ads`, {
        params: {
          access_token: effectiveToken,
          fields: "id,name,status,creative{id,name}",
          limit: 100,
        },
        timeout: 10000,
      });

      const liveAds = res.data?.data || [];
      if (!Array.isArray(liveAds) || liveAds.length === 0) {
        return adResults;
      }

      console.log(`[MetaAdsOrchestrator] Reconciling ${liveAds.length} live ads from Meta Marketing API for AdSet ${metaAdSetId}...`);

      for (let i = 0; i < previewAds.length; i++) {
        const p = previewAds[i];
        const rowNo = p.sourceRow || (i + 2);
        let r = adResults.find((x) => x.sourceRow === rowNo);
        if (!r) {
          r = {
            sourceRow: rowNo,
            adName: p.adName,
            videoId: p.videoId || null,
            imageHash: p.imageHash || null,
            creativeId: null,
            adId: null,
            status: "FAILED",
            error: "Ad creative was not published to Meta",
          };
          adResults.push(r);
        }

        const expectedTruncated = MetaApiService.formatAdName(p.adName);
        const odMatch = p.adName?.match(/(OD-\d+-\d+)/i)?.[1];

        const matched = liveAds.find((m) => {
          if (m.name.trim() === p.adName.trim()) return true;
          if (m.name.trim() === expectedTruncated.trim()) return true;
          if (odMatch && m.name.includes(odMatch)) return true;
          return false;
        });

        if (matched && matched.id) {
          r.status = "SUCCESS";
          r.adId = matched.id;
          r.creativeId = matched.creative?.id || r.creativeId || `cr_${matched.id}`;
          r.error = null;
        }
      }
    } catch (recErr) {
      console.warn("[MetaAdsOrchestrator] Warning reconciling live Meta Ads:", recErr.message);
    }

    return adResults;
  }

  /**
   * Format creation results into a verified summary report
   */
  static formatCreationResultMarkdown(result, campaignName, adSetName) {
    const { metaCampaignId, metaAdSetId, totalAds, adResults = [] } = result;

    const actualSuccess = adResults.filter((r) => r.status === "SUCCESS" && Boolean(r.adId)).length;
    const actualFailed = adResults.filter((r) => r.status === "FAILED").length;
    const isAllSuccess = actualFailed === 0 && actualSuccess > 0;

    let md = isAllSuccess
      ? `### ✅ Meta Ads Creation Executed Successfully\n\n`
      : (actualSuccess > 0
          ? `### ⚠️ Meta Ads Creation Finished with Partial Results\n\n`
          : `### ❌ Meta Ads Creation Failed\n\n`);

    md += `Your approved campaign architecture has been created on Meta Marketing API:\n\n`;
    md += `- **Campaign**: **${campaignName}** (Meta Campaign ID: \`${metaCampaignId}\`)\n`;
    md += `- **Ad Set**: **${adSetName}** (Meta Ad Set ID: \`${metaAdSetId}\`)\n`;
    md += `- **Total Ads Processed**: **${totalAds}** (${actualSuccess} Succeeded, ${actualFailed} Failed)\n`;
    md += `- **Status**: **PAUSED** (Safely created in draft mode)\n\n`;

    md += `#### 📋 Per-Object Execution Results\n\n`;
    md += `| Row | Ad Name | Meta Ad ID | Status | Details |\n`;
    md += `|---|---|---|---|---|\n`;

    adResults.forEach((r) => {
      const isSuccess = r.status === "SUCCESS" && Boolean(r.adId);
      const statusIcon = isSuccess ? "✅ SUCCESS" : (r.status === "SKIPPED" ? "⏭️ SKIPPED" : "❌ FAILED");
      const idText = r.adId ? `\`${r.adId}\`` : "N/A";
      const details = isSuccess
        ? `Linked to Creative \`${r.creativeId || "active"}\``
        : (r.error || "Creation error");
      md += `| #${r.sourceRow} | **${r.adName}** | ${idText} | ${statusIcon} | ${details} |\n`;
    });

    if (actualFailed > 0) {
      md += `\n> 💡 **Safe Retry**: You can ask to retry failed ads at any time. Existing successful ads will not be duplicated.`;
    }

    return md;
  }
}

export default MetaAdsOrchestrator;
