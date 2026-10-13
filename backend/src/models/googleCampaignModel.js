import mongoose from "mongoose";

const googleCampaignSchema = new mongoose.Schema(
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
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    channelType: {
      type: String,
      enum: ["SEARCH", "DISPLAY", "PERFORMANCE_MAX", "VIDEO", "SHOPPING", "MULTI_CHANNEL"],
      default: "SEARCH",
    },
    status: {
      type: String,
      enum: ["ENABLED", "PAUSED", "REMOVED", "UNKNOWN"],
      default: "PAUSED",
    },
    effectiveStatus: {
      type: String,
      default: "PAUSED",
    },
    biddingStrategyType: {
      type: String,
      default: "MAXIMIZE_CONVERSIONS",
    },
    dailyBudget: {
      type: Number,
      default: 0,
    },
    targetCpa: {
      type: Number,
      default: 0,
    },
    targetRoas: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: String,
      default: null,
    },
    endDate: {
      type: String,
      default: null,
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

googleCampaignSchema.index({ accountId: 1, status: 1 });

const GoogleCampaign =
  mongoose.models.GoogleCampaign ||
  mongoose.model("GoogleCampaign", googleCampaignSchema);

export default GoogleCampaign;
