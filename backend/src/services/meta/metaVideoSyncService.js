import "dotenv/config";
import fs from "fs";
import path from "path";
import axios from "axios";
import mongoose from "mongoose";
import driveService from "../../google/driveService.js";
import sheetsService from "../../google/sheetsService.js";
import MetaApiService from "./metaApiService.js";
import CampaignPreparationSession from "../../models/campaignPreparationSession.js";
import MetaUploadedMedia from "../../models/metaUploadedMedia.js";

export class MetaVideoSyncService {
  /**
   * Sync videos from the connected Google Sheet to the connected Meta Ad Account
   */
  static async syncVideosFromConnectedSheet({
    targetAccountId = null,
    targetSpreadsheetId = null,
    userId = null,
    forceReupload = false,
    onProgress = null,
  } = {}) {
    console.log("\n================================================================================");
    console.log("🚀 STARTING META VIDEO SYNC FROM CONNECTED GOOGLE SHEET" + (forceReupload ? " [FORCE RE-UPLOAD ACTIVE]" : ""));
    console.log("================================================================================");

    if (forceReupload) {
      console.log("⚡ Note: Force re-upload enabled. Videos will be downloaded from Drive and uploaded fresh to Meta.\n");
    }

    // 1. Resolve connected user
    if (!userId) {
      const User = mongoose.model("User", new mongoose.Schema({}, { strict: false }));
      const user = await User.findOne();
      userId = user?._id;
    }

    // 2. Resolve connected Meta Ad Account
    let accountId = targetAccountId;
    if (!accountId) {
      const Channel = mongoose.model("ConnectedChannel", new mongoose.Schema({}, { strict: false }));
      const metaChan = await Channel.findOne({ channelType: "meta" });
      accountId = metaChan?.accountId || "act_1720250482578964";
    }
    const cleanAccountId = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;

    // 3. Resolve OAuth Token for Meta
    const token = await MetaApiService.resolveOAuthToken(cleanAccountId, userId, null);
    if (!token) {
      throw new Error(`Unable to resolve Meta OAuth token for account ${cleanAccountId}`);
    }

    // 4. Resolve connected Google Sheet
    let spreadsheetId = targetSpreadsheetId;
    if (!spreadsheetId) {
      const AIContext = mongoose.model("AIContext", new mongoose.Schema({}, { strict: false }));
      const ctx = await AIContext.findOne({ "canvasData.nodes.metadata.spreadsheetId": { $exists: true } });
      const foundNode = ctx?.canvasData?.nodes?.find((n) => n.metadata?.spreadsheetId);
      spreadsheetId = foundNode?.metadata?.spreadsheetId || "1WzjSxyrqiLb8jfly6G1bWDSBHMLKQD81nzZYURcD5Mw";
    }

    console.log(`📌 Connected Meta Ad Account : ${cleanAccountId}`);
    console.log(`📌 Connected Google Sheet ID : ${spreadsheetId}`);

    // 5. Read Sheet Rows
    const sheetData = await sheetsService.readSpreadsheet({ spreadsheetIdOrUrl: spreadsheetId });
    const rows = sheetData.rows || [];
    console.log(`📊 Found ${rows.length} total rows in worksheet "${sheetData.sheetTitle || "Sheet1"}"\n`);

    // 6. Pre-fetch any existing Video IDs from DB (if not force re-upload)
    const dbVideoMap = new Map();
    if (!forceReupload) {
      try {
        const cachedMedia = await MetaUploadedMedia.find({ accountId: cleanAccountId, mediaType: "VIDEO" }).lean().catch(() => []);
        for (const cm of cachedMedia) {
          if (cm.videoId) {
            if (cm.sourceUrl && !dbVideoMap.has(cm.sourceUrl)) {
              dbVideoMap.set(cm.sourceUrl, cm.videoId);
            }
            if (cm.sourceRow && !dbVideoMap.has(`row_${cm.sourceRow}`)) {
              dbVideoMap.set(`row_${cm.sourceRow}`, cm.videoId);
            }
          }
        }
      } catch (cacheErr) {
        console.warn("MetaUploadedMedia prefetch notice:", cacheErr.message);
      }

      try {
        const pastSessions = await CampaignPreparationSession.find({
          "preview.adDetails.videoId": { $exists: true, $ne: null },
        }).sort({ createdAt: -1 }).limit(10);

        for (const ps of pastSessions) {
          for (const pad of ps.preview?.adDetails || []) {
            if (pad.videoId) {
              if (pad.creative && !dbVideoMap.has(pad.creative)) {
                dbVideoMap.set(pad.creative, pad.videoId);
              }
              if (pad.sourceRow && !dbVideoMap.has(`row_${pad.sourceRow}`)) {
                dbVideoMap.set(`row_${pad.sourceRow}`, pad.videoId);
              }
            }
          }
        }
      } catch (e) {
        console.warn("DB video map prefetch notice:", e.message);
      }
    }

    // 7. Iterate through each row and process video upload
    const results = [];
    let uploadCount = 0;
    let reusedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNo = row._originalRowNumber || (i + 2);
      const adName = row["Ad Name"] || row.ad_name || `Ad_Row_${rowNo}`;
      const driveUrl = row["Creative Smart Chips"] || row.creative_smart_chips || row.creative || row.col_0;

      if (!driveUrl || typeof driveUrl !== "string" || !driveUrl.trim()) {
        continue;
      }

      let metaVideoId = null;
      let status = "PENDING";

      // Check if already in DB (only when forceReupload is FALSE)
      if (!forceReupload) {
        const cachedId = dbVideoMap.get(driveUrl) || dbVideoMap.get(`row_${rowNo}`);
        if (cachedId) {
          // Verify on Meta Graph API
          try {
            const verifyRes = await axios.get(`https://graph.facebook.com/v24.0/${cachedId}`, {
              params: { access_token: token, fields: "id,status" },
            });
            if (verifyRes.data?.id) {
              metaVideoId = String(cachedId);
              status = "READY (Reused from DB)";
              reusedCount++;
            }
          } catch (vErr) {
            metaVideoId = null; // Re-upload needed if expired/deleted
          }
        }
      }

      // If not yet uploaded, download from Google Drive and upload to Meta
      if (!metaVideoId) {
        console.log(`\n⏳ [Row #${rowNo}] Downloading video from Google Drive for "${adName}"...`);
        try {
          const dlInfo = await driveService.downloadCreative(driveUrl);
          if (dlInfo?.filePath && fs.existsSync(dlInfo.filePath)) {
            console.log(`📤 [Row #${rowNo}] Uploading video to Meta Ads Manager (${cleanAccountId}/advideos)...`);
            const uploadRes = await MetaApiService.uploadVideo(cleanAccountId, token, {
              filePath: dlInfo.filePath,
              title: adName,
              description: row["Primary Text"] || row.primary_text || "",
              userId,
            });

            const vid = uploadRes?.id || uploadRes?.video_id;
            if (vid) {
              metaVideoId = String(vid);
              status = "READY (Newly Uploaded)";
              uploadCount++;

              // Wait for transcoding
              if (!token.startsWith("EAAB_simulated")) {
                await MetaApiService.waitForVideoReady(vid, token, 30);
              }
            }
          }
        } catch (upErr) {
          status = `FAILED: ${upErr.message}`;
        }
      }

      // Store in DB session if available
      if (metaVideoId) {
        dbVideoMap.set(driveUrl, metaVideoId);
        dbVideoMap.set(`row_${rowNo}`, metaVideoId);

        // Record in dedicated MetaUploadedMedia DB collection
        await MetaUploadedMedia.recordMedia({
          userId,
          accountId: cleanAccountId,
          mediaType: "VIDEO",
          metaMediaId: metaVideoId,
          videoId: metaVideoId,
          sourceRow: rowNo,
          rowNumber: rowNo,
          adName,
          sourceUrl: driveUrl,
          spreadsheetId,
          status: "READY",
        });

        // Update latest preparation session with this videoId
        try {
          const latestSession = await CampaignPreparationSession.findOne().sort({ createdAt: -1 });
          if (latestSession && latestSession.preview?.adDetails) {
            const matchAd = latestSession.preview.adDetails.find((a) => a.sourceRow === rowNo || a.creative === driveUrl);
            if (matchAd) {
              matchAd.videoId = metaVideoId;
              matchAd.creativeType = "VIDEO";
              await latestSession.save();
            }
          }
        } catch (dbErr) {
          // ignore session update errors
        }
      }

      // 8. LOG CLEARLY IN TERMINAL AS REQUESTED
      console.log("--------------------------------------------------------------------------------");
      console.log(`🎬 ROW #${rowNo < 10 ? "0" + rowNo : rowNo} | Ad Name: "${adName}"`);
      console.log(`   ├─ Meta Video ID : ${metaVideoId ? `\x1b[32m${metaVideoId}\x1b[0m` : "\x1b[31mFAILED\x1b[0m"}`);
      console.log(`   ├─ Drive Link    : ${driveUrl.substring(0, 70)}...`);
      console.log(`   └─ Status        : ${status}`);
      console.log("--------------------------------------------------------------------------------");

      results.push({
        rowNumber: rowNo,
        adName,
        driveUrl,
        videoId: metaVideoId,
        status,
      });

      if (onProgress) {
        onProgress({ rowNumber: rowNo, adName, videoId: metaVideoId, status });
      }
    }

    // 9. FINAL SUMMARY REPORT IN TERMINAL
    console.log("\n================================================================================");
    console.log(`✨ META VIDEO SYNC COMPLETE FOR SHEET "${sheetData.spreadsheetName || "App update"}"`);
    console.log(`   - Total Processed Rows : ${results.length}`);
    console.log(`   - Successfully Verified: ${results.filter((r) => r.videoId).length}`);
    console.log(`   - Newly Uploaded       : ${uploadCount}`);
    console.log(`   - Reused from DB       : ${reusedCount}`);
    console.log("================================================================================");

    console.table(
      results.map((r) => ({
        "Row #": r.rowNumber,
        "Ad Name": r.adName,
        "Meta Video ID": r.videoId || "FAILED",
        Status: r.status,
      }))
    );

    return results;
  }
}

export default MetaVideoSyncService;
