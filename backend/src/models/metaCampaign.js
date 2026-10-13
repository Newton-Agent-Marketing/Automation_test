import mongoose from "mongoose";

const metaCampaignSchema = new mongoose.Schema(
  {
    // Kis User ka campaign hai
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    // Kis Ad Account ka campaign hai (e.g., act_123456789)
    accountId: {
      type: String,
      required: true,
      index: true,
    },
    // Meta ka unique Campaign ID
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
    // Campaign Status: ACTIVE, PAUSED, ARCHIVED, DELETED
    status: {
      type: String,
      enum: ["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"],
      default: "PAUSED",
    },
    // Effective Status (Meta ka actual delivery status)
    effectiveStatus: {
      type: String,
      default: "PAUSED",
    },
    // Objective: OUTCOME_SALES, OUTCOME_LEADS, OUTCOME_TRAFFIC, OUTCOME_AWARENESS
    objective: {
      type: String,
      default: "OUTCOME_SALES",
    },
    // Budgets
    dailyBudget: {
      type: Number,
      default: 0,
    },
    lifetimeBudget: {
      type: Number,
      default: 0,
    },
    budgetRemaining: {
      type: Number,
      default: 0,
    },
    // Dates
    startTime: {
      type: Date,
      default: null,
    },
    stopTime: {
      type: Date,
      default: null,
    },
    // Last Sync timestamp
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Account ID + Status par fast search ke liye index
metaCampaignSchema.index({ accountId: 1, status: 1 });

const MetaCampaign = mongoose.model("MetaCampaign", metaCampaignSchema);

export default MetaCampaign;
