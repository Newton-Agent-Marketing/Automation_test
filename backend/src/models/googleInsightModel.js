import mongoose from "mongoose";

const googleInsightSchema = new mongoose.Schema(
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
      required: true,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    spend: {
      type: Number,
      default: 0,
    },
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    conversions: {
      type: Number,
      default: 0,
    },
    conversionValue: {
      type: Number,
      default: 0,
    },
    roas: {
      type: Number,
      default: 0,
    },
    cpc: {
      type: Number,
      default: 0,
    },
    cpm: {
      type: Number,
      default: 0,
    },
    ctr: {
      type: Number,
      default: 0,
    },
    costPerConversion: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

googleInsightSchema.index({ campaignId: 1, date: 1 }, { unique: true });
googleInsightSchema.index({ accountId: 1, date: 1 });
googleInsightSchema.index({ userId: 1, accountId: 1, date: 1 });

const GoogleInsight =
  mongoose.models.GoogleInsight ||
  mongoose.model("GoogleInsight", googleInsightSchema);

export default GoogleInsight;
