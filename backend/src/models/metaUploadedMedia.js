import mongoose from "mongoose";

const metaUploadedMediaSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    // Meta Ad Account ID (e.g. act_1720250482578964)
    accountId: {
      type: String,
      required: true,
      index: true,
    },
    // Media Type: VIDEO or IMAGE
    mediaType: {
      type: String,
      enum: ["VIDEO", "IMAGE"],
      required: true,
      index: true,
    },
    // Actual ID received from Meta Ads API:
    // Video: Meta Video ID (e.g. "123456789012345") from /advideos
    // Image: Meta Image Hash / ID (e.g. "a1b2c3d4e5f6...") from /adimages
    metaMediaId: {
      type: String,
      required: true,
      index: true,
    },
    // Direct access helpers
    videoId: {
      type: String,
      default: null,
      index: true,
    },
    imageHash: {
      type: String,
      default: null,
      index: true,
    },
    // Sheet Row number (e.g. 2, 3, 4...)
    sourceRow: {
      type: Number,
      default: null,
      index: true,
    },
    rowNumber: {
      type: Number,
      default: null,
    },
    // Asset info
    adName: {
      type: String,
      default: "",
    },
    creativeName: {
      type: String,
      default: "",
    },
    sourceUrl: {
      type: String, // Google Drive share link, direct URL, etc.
      default: "",
    },
    fileId: {
      type: String, // Google Drive File ID
      default: null,
      index: true,
    },
    localFilePath: {
      type: String,
      default: "",
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      default: "",
    },
    // Workflow / Context
    campaignName: {
      type: String,
      default: "",
    },
    adSetName: {
      type: String,
      default: "",
    },
    sessionId: {
      type: String,
      default: null,
      index: true,
    },
    conversationId: {
      type: String,
      default: null,
    },
    spreadsheetId: {
      type: String,
      default: null,
    },
    // Raw response from Meta Graph API
    metaResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ["READY", "UPLOADED", "PROCESSING", "FAILED"],
      default: "READY",
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast querying & deduplication
metaUploadedMediaSchema.index({ accountId: 1, sourceRow: 1, mediaType: 1 });
metaUploadedMediaSchema.index({ accountId: 1, sourceUrl: 1, mediaType: 1 });
metaUploadedMediaSchema.index({ accountId: 1, fileId: 1, mediaType: 1 });
metaUploadedMediaSchema.index({ accountId: 1, metaMediaId: 1 });

/**
 * Static Helper: Safely insert or update an uploaded media record
 */
metaUploadedMediaSchema.statics.recordMedia = async function ({
  userId = null,
  accountId,
  mediaType,
  metaMediaId,
  videoId = null,
  imageHash = null,
  sourceRow = null,
  rowNumber = null,
  adName = "",
  creativeName = "",
  sourceUrl = "",
  fileId = null,
  localFilePath = "",
  campaignName = "",
  adSetName = "",
  sessionId = null,
  conversationId = null,
  spreadsheetId = null,
  metaResponse = {},
  status = "READY",
} = {}) {
  try {
    const cleanAccountId = String(accountId || "").startsWith("act_") ? accountId : `act_${accountId}`;
    const cleanMediaId = String(metaMediaId || videoId || imageHash || "").trim();
    if (!cleanMediaId) return null;

    const row = sourceRow !== null && sourceRow !== undefined ? Number(sourceRow) : (rowNumber !== null && rowNumber !== undefined ? Number(rowNumber) : null);
    const finalType = (mediaType || (videoId ? "VIDEO" : "IMAGE")).toUpperCase();

    const updateDoc = {
      accountId: cleanAccountId,
      mediaType: finalType,
      metaMediaId: cleanMediaId,
      videoId: finalType === "VIDEO" ? cleanMediaId : (videoId || null),
      imageHash: finalType === "IMAGE" ? cleanMediaId : (imageHash || null),
      status,
    };

    if (userId) updateDoc.userId = userId;
    if (row !== null) {
      updateDoc.sourceRow = row;
      updateDoc.rowNumber = row;
    }
    if (adName) updateDoc.adName = adName;
    if (creativeName || adName) updateDoc.creativeName = creativeName || adName;
    if (sourceUrl) updateDoc.sourceUrl = sourceUrl;
    if (fileId) updateDoc.fileId = fileId;
    if (localFilePath) updateDoc.localFilePath = localFilePath;
    if (campaignName) updateDoc.campaignName = campaignName;
    if (adSetName) updateDoc.adSetName = adSetName;
    if (sessionId) updateDoc.sessionId = sessionId;
    if (conversationId) updateDoc.conversationId = conversationId;
    if (spreadsheetId) updateDoc.spreadsheetId = spreadsheetId;
    if (metaResponse && Object.keys(metaResponse).length > 0) updateDoc.metaResponse = metaResponse;

    // Deduplicate by accountId + metaMediaId
    const record = await this.findOneAndUpdate(
      {
        accountId: cleanAccountId,
        metaMediaId: cleanMediaId,
      },
      {
        $set: updateDoc,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`[MetaUploadedMedia DB] ✅ Successfully saved ${finalType} Meta ID "${cleanMediaId}" for Row #${row ?? "N/A"} in DB`);
    return record;
  } catch (err) {
    console.warn(`[MetaUploadedMedia DB Warning] Failed to record media: ${err.message}`);
    return null;
  }
};

const MetaUploadedMedia = mongoose.model("MetaUploadedMedia", metaUploadedMediaSchema);

export default MetaUploadedMedia;
