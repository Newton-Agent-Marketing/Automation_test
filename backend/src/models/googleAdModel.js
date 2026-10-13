import mongoose from "mongoose";

const googleAdSchema = new mongoose.Schema(
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
    adId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      default: "RESPONSIVE_SEARCH_AD",
    },
    status: {
      type: String,
      enum: ["ENABLED", "PAUSED", "REMOVED", "UNKNOWN"],
      default: "ENABLED",
    },
    approvalStatus: {
      type: String,
      default: "ELIGIBLE",
    },
    adStrength: {
      type: String,
      default: "PENDING",
    },
    finalUrls: {
      type: [String],
      default: [],
    },
    headlines: [
      {
        text: { type: String, required: true },
        pinnedField: { type: String, default: null },
      },
    ],
    descriptions: [
      {
        text: { type: String, required: true },
        pinnedField: { type: String, default: null },
      },
    ],
    path1: {
      type: String,
      default: "",
    },
    path2: {
      type: String,
      default: "",
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

googleAdSchema.index({ accountId: 1, campaignId: 1, adGroupId: 1 });

const GoogleAd =
  mongoose.models.GoogleAd ||
  mongoose.model("GoogleAd", googleAdSchema);

export default GoogleAd;
