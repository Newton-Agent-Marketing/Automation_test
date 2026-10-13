import mongoose from "mongoose";

const googleKeywordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    accountId: {
      type: String,
      required: true,
      index: true,
    },
    campaignId: {
      type: String,
      required: true,
      index: true,
    },
    campaignName: {
      type: String,
      default: "",
    },
    adGroupId: {
      type: String,
      required: true,
      index: true,
    },
    adGroupName: {
      type: String,
      default: "",
    },
    criterionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    keywordText: {
      type: String,
      required: true,
      index: true,
    },
    matchType: {
      type: String,
      enum: ["BROAD", "PHRASE", "EXACT", "UNKNOWN"],
      default: "BROAD",
    },
    status: {
      type: String,
      enum: ["ENABLED", "PAUSED", "REMOVED", "UNKNOWN"],
      default: "ENABLED",
    },
    cpcBid: {
      type: Number,
      default: 0,
    },
    qualityScore: {
      type: Number,
      default: null,
    },
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    cost: {
      type: Number,
      default: 0,
    },
    conversions: {
      type: Number,
      default: 0,
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

googleKeywordSchema.index({ accountId: 1, campaignId: 1, adGroupId: 1 });
googleKeywordSchema.index({ accountId: 1, keywordText: 1 });

const GoogleKeyword =
  mongoose.models.GoogleKeyword ||
  mongoose.model("GoogleKeyword", googleKeywordSchema);

export default GoogleKeyword;
