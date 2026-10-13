import mongoose from "mongoose";

const metaInsightSchema = new mongoose.Schema(
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
    // Kis date ka data hai (Format: YYYY-MM-DD)
    date: {
      type: String,
      required: true,
      index: true,
    },
    // Core Metrics
    spend: {
      type: Number,
      default: 0, // Kitna paisa kharch hua
    },
    impressions: {
      type: Number,
      default: 0, // Kitni baar ad dikha
    },
    clicks: {
      type: Number,
      default: 0, // Total clicks
    },
    reach: {
      type: Number,
      default: 0, // Unique users
    },
    frequency: {
      type: Number,
      default: 0, // impressions / reach
    },
    // Cost Calculations
    cpc: {
      type: Number,
      default: 0, // Cost Per Click
    },
    cpm: {
      type: Number,
      default: 0, // Cost Per 1000 Impressions
    },
    ctr: {
      type: Number,
      default: 0, // Click Through Rate (%)
    },
    // Conversions & Sales (E-commerce / Leads)
    purchases: {
      type: Number,
      default: 0,
    },
    purchaseValue: {
      type: Number,
      default: 0, // Total Revenue from ads
    },
    roas: {
      type: Number,
      default: 0, // Return on Ad Spend (purchaseValue / spend)
    },
    costPerPurchase: {
      type: Number,
      default: 0, // CPA
    },
    leads: {
      type: Number,
      default: 0,
    },
    costPerLead: {
      type: Number,
      default: 0,
    },
    // Meta se aaya hua raw actions array (agar kuch extra check karna ho)
    rawActions: {
      type: Array,
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// IMPORTANT: Compound unique index taaki same campaign aur same date ka record duplicate na ho
metaInsightSchema.index({ campaignId: 1, date: 1 }, { unique: true });
metaInsightSchema.index({ accountId: 1, date: 1 });
metaInsightSchema.index({ userId: 1, accountId: 1, date: 1 });

const MetaInsight = mongoose.model("MetaInsight", metaInsightSchema);

export default MetaInsight;
