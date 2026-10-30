import mongoose from "mongoose";

const campaignPreparationSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    metaAccountId: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: [
        "READING_SOURCE",
        "VALIDATING",
        "NEEDS_USER_INPUT",
        "UPDATING_SHEET",
        "REVALIDATING",
        "READY_FOR_REVIEW",
        "EDITING",
        "APPROVED",
        "CREATING",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
        "STALE_APPROVAL",
      ],
      default: "READING_SOURCE",
    },
    campaignName: {
      type: String,
      required: true,
    },
    adSetName: {
      type: String,
      required: true,
    },
    existingCampaignId: {
      type: String,
      default: null,
    },
    existingAdSetId: {
      type: String,
      default: null,
    },
    adNamePattern: {
      type: String,
      default: null,
    },
    campaignType: {
      type: String,
      enum: ["WEBSITE", "APP_PROMOTION"],
      default: "WEBSITE",
    },
    objective: {
      type: String,
      default: "OUTCOME_SALES",
    },
    appId: {
      type: String,
      default: null,
    },
    objectStoreUrl: {
      type: String,
      default: null,
    },
    pixelId: {
      type: String,
      default: null,
    },
    source: {
      type: {
        type: String,
        enum: ["google_sheets", "excel"],
        default: "google_sheets",
      },
      sheetUrl: { type: String, default: null },
      spreadsheetId: { type: String, default: null },
      spreadsheetName: { type: String, default: "" },
      worksheetName: { type: String, default: "Sheet1" },
      filePath: { type: String, default: null },
      totalRows: { type: Number, default: 0 },
      headerRow: { type: Number, default: 1 },
      dataRowStart: { type: Number, default: 2 },
      dataFingerprint: { type: String, default: "" },
      lastSyncedAt: { type: Date, default: null },
      isReadOnly: { type: Boolean, default: false },
    },
    eligibleRows: [{ type: Number }],
    excludedRows: [
      {
        rowNumber: { type: Number },
        reason: { type: String },
      },
    ],
    columnMapping: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    filterCriteria: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    contextNodeData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    validationReport: {
      summaryTable: [
        {
          item: { type: String },
          result: { type: String },
          status: { type: String, enum: ["valid", "warning", "error", "action_required"] },
        },
      ],
      campaignIssues: [
        {
          field: { type: String },
          message: { type: String },
          blocking: { type: Boolean, default: true },
        },
      ],
      adSetIssues: [
        {
          field: { type: String },
          message: { type: String },
          blocking: { type: Boolean, default: true },
        },
      ],
      adIssues: [
        {
          rowNumber: { type: Number },
          adName: { type: String },
          field: { type: String },
          message: { type: String },
          blocking: { type: Boolean, default: true },
        },
      ],
      mediaIssues: [
        {
          rowNumber: { type: Number },
          url: { type: String },
          message: { type: String },
          blocking: { type: Boolean, default: true },
        },
      ],
      blockingCount: { type: Number, default: 0 },
      warningCount: { type: Number, default: 0 },
    },
    missingFields: [
      {
        id: { type: String, required: true },
        level: { type: String, enum: ["campaign", "adset", "ad"], required: true },
        field: { type: String, required: true },
        label: { type: String, required: true },
        description: { type: String },
        affectedRows: [{ type: Number }],
        currentValue: { type: mongoose.Schema.Types.Mixed },
        options: [{ type: String }],
        resolved: { type: Boolean, default: false },
        answer: { type: mongoose.Schema.Types.Mixed, default: null },
      },
    ],
    preview: {
      version: { type: Number, default: 1 },
      generatedAt: { type: Date, default: null },
      campaignDetails: [
        {
          field: { type: String },
          value: { type: mongoose.Schema.Types.Mixed },
          source: { type: String },
        },
      ],
      adSetDetails: [
        {
          field: { type: String },
          value: { type: mongoose.Schema.Types.Mixed },
          source: { type: String },
        },
      ],
      adDetails: [
        {
          sourceRow: { type: Number },
          adName: { type: String },
          creativeType: { type: String },
          creative: { type: mongoose.Schema.Types.Mixed },
          primaryText: { type: String },
          headline: { type: String },
          description: { type: String },
          destination: { type: String },
          displayLink: { type: String, default: null },
          cta: { type: String },
          pageId: { type: String },
          instagramId: { type: String },
          videoId: { type: String, default: null },
          videoFilePath: { type: String, default: null },
          imageHash: { type: String, default: null },
          imageFilePath: { type: String, default: null },
          tracking: { type: String },
          urlTags: { type: String, default: null },
          url_tags: { type: String, default: null },
          status: { type: String },
          fieldSources: { type: mongoose.Schema.Types.Mixed },
        },
      ],
    },
    approval: {
      status: {
        type: String,
        enum: ["NONE", "PENDING", "APPROVED", "REJECTED", "STALE"],
        default: "NONE",
      },
      approvedAt: { type: Date, default: null },
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      snapshotDataFingerprint: { type: String, default: null },
      snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    creationJob: {
      status: {
        type: String,
        enum: ["IDLE", "PENDING", "IN_PROGRESS", "COMPLETED", "PARTIAL", "FAILED"],
        default: "IDLE",
      },
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      metaCampaignId: { type: String, default: null },
      metaAdSetId: { type: String, default: null },
      adResults: [
        {
          sourceRow: { type: Number },
          adName: { type: String },
          videoId: { type: String, default: null },
          imageHash: { type: String, default: null },
          creativeId: { type: String, default: null },
          adId: { type: String, default: null },
          status: { type: String, enum: ["SUCCESS", "FAILED", "SKIPPED"], default: "SKIPPED" },
          error: { type: String, default: null },
        },
      ],
      error: { type: String, default: null },
      retries: { type: Number, default: 0 },
    },
    auditHistory: [
      {
        action: { type: String, required: true },
        performedBy: { type: String, default: "USER" },
        details: { type: mongoose.Schema.Types.Mixed },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    pendingEdit: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    userAnswers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    chatInjectedValues: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    mergedPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

campaignPreparationSessionSchema.index({ conversationId: 1, createdAt: -1 });
campaignPreparationSessionSchema.index({ userId: 1, status: 1 });

const CampaignPreparationSession =
  mongoose.models.CampaignPreparationSession ||
  mongoose.model("CampaignPreparationSession", campaignPreparationSessionSchema);

export default CampaignPreparationSession;
