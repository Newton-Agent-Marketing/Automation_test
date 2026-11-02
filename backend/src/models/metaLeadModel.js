import mongoose from "mongoose";

const metaLeadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    leadId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    formId: {
      type: String,
      required: false,
      index: true,
    },
    formName: {
      type: String,
      default: "",
    },
    pageId: {
      type: String,
      required: false,
      index: true,
    },
    pageName: {
      type: String,
      default: "",
    },
    adAccountId: {
      type: String,
      required: false,
      index: true,
    },
    campaignId: {
      type: String,
      default: null,
      index: true,
    },
    campaignName: {
      type: String,
      default: "",
    },
    adSetId: {
      type: String,
      default: null,
      index: true,
    },
    adSetName: {
      type: String,
      default: "",
    },
    adId: {
      type: String,
      default: null,
      index: true,
    },
    adName: {
      type: String,
      default: "",
    },
    fieldData: [
      {
        name: { type: String, required: true },
        values: [{ type: String }],
      },
    ],
    fullName: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      default: "",
    },
    phoneNumber: {
      type: String,
      default: "",
    },
    leadCreatedTime: {
      type: Date,
      default: Date.now,
    },
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    source: {
      type: String,
      enum: ["WEBHOOK", "API_POLL", "MANUAL_SYNC", "SIMULATED"],
      default: "WEBHOOK",
    },
  },
  {
    timestamps: true,
  }
);

metaLeadSchema.index({ userId: 1, createdAt: -1 });
metaLeadSchema.index({ adAccountId: 1, createdAt: -1 });
metaLeadSchema.index({ formId: 1, createdAt: -1 });

const MetaLead = mongoose.models.MetaLead || mongoose.model("MetaLead", metaLeadSchema);

export default MetaLead;

