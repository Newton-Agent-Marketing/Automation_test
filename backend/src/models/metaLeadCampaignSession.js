import mongoose from "mongoose";

const metaLeadCampaignSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    executionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "COLLECTING_INFO",
        "READY_FOR_CONFIRMATION",
        "CREATING",
        "COMPLETED",
        "FAILED",
        "PUBLISHED",
        "CANCELLED",
      ],
      default: "COLLECTING_INFO",
      index: true,
    },
    config: {
      intent: {
        type: String,
        default: "CREATE_META_LEAD_CAMPAIGN",
      },
      adAccountId: {
        type: String,
        default: null,
      },
      accountName: {
        type: String,
        default: "",
      },
      pageId: {
        type: String,
        default: null,
      },
      pageName: {
        type: String,
        default: "",
      },
      instagramActorId: {
        type: String,
        default: null,
      },
      campaign: {
        name: { type: String, default: null },
        objective: { type: String, default: "OUTCOME_LEADS" },
        buyingType: { type: String, default: "AUCTION" },
        budgetStrategy: { type: String, default: "DAILY_BUDGET" },
        dailyBudget: { type: Number, default: null },
        lifetimeBudget: { type: Number, default: null },
        specialAdCategories: { type: [String], default: [] },
        status: { type: String, default: "PAUSED" },
      },
      adSet: {
        name: { type: String, default: null },
        conversionLocation: { type: String, default: "INSTANT_FORMS" },
        optimizationGoal: { type: String, default: "LEAD_GENERATION" },
        billingEvent: { type: String, default: "IMPRESSIONS" },
        targeting: {
          geoLocations: {
            countries: { type: [String], default: ["IN"] },
            cities: { type: [mongoose.Schema.Types.Mixed], default: [] },
          },
          ageMin: { type: Number, default: 18 },
          ageMax: { type: Number, default: 45 },
          genders: { type: [Number], default: [1, 2] },
          interests: { type: [mongoose.Schema.Types.Mixed], default: [] },
        },
        placements: { type: mongoose.Schema.Types.Mixed, default: {} },
        startTime: { type: Date, default: null },
        endTime: { type: Date, default: null },
        status: { type: String, default: "PAUSED" },
      },
      leadForm: {
        id: { type: String, default: null },
        name: { type: String, default: null },
        privacyPolicyUrl: { type: String, default: null },
        questions: [
          {
            type: { type: String, default: "FULL_NAME" },
            key: { type: String, default: "" },
            label: { type: String, default: "" },
          },
        ],
        greetingTitle: { type: String, default: "" },
        greetingDescription: { type: String, default: "" },
        thankYouTitle: { type: String, default: "Thank You!" },
        thankYouBody: { type: String, default: "Thanks for your submission. We will get in touch shortly." },
        thankYouLinkUrl: { type: String, default: "" },
        locale: { type: String, default: "EN_US" },
      },
      creative: {
        id: { type: String, default: null },
        name: { type: String, default: null },
        format: { type: String, enum: ["IMAGE", "VIDEO"], default: "IMAGE" },
        message: { type: String, default: null },
        headline: { type: String, default: null },
        description: { type: String, default: null },
        callToAction: { type: String, default: "SIGN_UP" },
        imageUrl: { type: String, default: null },
        videoUrl: { type: String, default: null },
        imageHash: { type: String, default: null },
        videoId: { type: String, default: null },
      },
      ad: {
        id: { type: String, default: null },
        name: { type: String, default: null },
        status: { type: String, default: "PAUSED" },
      },
    },
    createdObjects: {
      campaignId: { type: String, default: null },
      adSetId: { type: String, default: null },
      leadFormId: { type: String, default: null },
      creativeId: { type: String, default: null },
      adId: { type: String, default: null },
    },
    executionSteps: [
      {
        stepIndex: { type: Number, default: 0 },
        stepName: { type: String, required: true },
        label: { type: String, default: "" },
        status: {
          type: String,
          enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED", "SKIPPED"],
          default: "PENDING",
        },
        metaObjectId: { type: String, default: null },
        details: { type: String, default: "" },
        error: { type: String, default: null },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    currentExecutionStep: {
      type: String,
      default: null,
    },
    failedStep: {
      type: String,
      default: null,
    },
    metaErrorDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    summaryText: {
      type: String,
      default: null,
    },
    lastUserPrompt: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

metaLeadCampaignSessionSchema.index({ userId: 1, conversationId: 1, createdAt: -1 });

const MetaLeadCampaignSession =
  mongoose.models.MetaLeadCampaignSession ||
  mongoose.model("MetaLeadCampaignSession", metaLeadCampaignSessionSchema);

export default MetaLeadCampaignSession;

