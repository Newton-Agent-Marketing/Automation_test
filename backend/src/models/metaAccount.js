import mongoose from "mongoose";


const metaAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Meta Ad Account ID (e.g., act_1234567890)
    accountId: {
      type: String,
      required: [true, 'Meta Account ID is required'],
      trim: true,
    },
    accountName: {
      type: String,
      required: true,
      trim: true,
    },
    businessId: {
      type: String,
      default: null,
    },
    businessName: {
      type: String,
      default: null,
    },
    authType: {
      type: String,
      enum: ["OAUTH", "TOKEN", "MCP_SERVER"],
      default: "TOKEN",
    },
    // Settings & Currency
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
    },
    timezoneName: {
      type: String,
      default: 'Asia/Kolkata',
    },
    timezoneOffsetHoursUtc: {
      type: Number,
      default: 5.5,
    },
    // Account Status (Meta Code: 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, etc.)
    accountStatus: {
      type: Number,
      default: 1,
    },
    spendCap: {
      type: Number,
      default: 0,
    },
    amountSpent: {
      type: Number,
      default: 0,
    },
    // Pipeline Sync Tracking
    lastSyncedAt: {
      type: Date,
      default: null,
    },
    syncStatus: {
      type: String,
      enum: ['IDLE', 'SYNCING', 'SUCCESS', 'FAILED'],
      default: 'IDLE',
    },
    syncErrorMessage: {
      type: String,
      default: null,
    },
    accessToken: {
      type: String,
      default: "",
      trim: true,
    },
    mcpServerUrl: {
      type: String,
      default: "",
      trim: true,
    },
    mcpTransport: {
      type: String,
      enum: ["STREAMABLE_HTTP", "SSE", "STDIO"],
      default: "STREAMABLE_HTTP",
    },
    mcpCommand: {
      type: String,
      default: "",
      trim: true,
    },
    mcpArgs: {
      type: [String],
      default: [],
    },
    mcpStatus: {
      type: String,
      enum: ["DISCONNECTED", "CONNECTING", "CONNECTED", "ERROR"],
      default: "DISCONNECTED",
    },
    discoveredTools: [
      {
        name: { type: String, required: true },
        description: { type: String, default: "" },
        inputSchema: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        discoveredAt: { type: Date, default: Date.now },
      },
    ],
    lastDiscoveredAt: {
      type: Date,
      default: null,
    },
    mcpErrorMessage: {
      type: String,
      default: null,
    },
    isConnected: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // createdAt and updatedAt automatic banayega
  }
);

metaAccountSchema.index({ userId: 1, accountId: 1 }, { unique: true });

const MetaAccount =
  mongoose.models.MetaAccount || mongoose.model("MetaAccount", metaAccountSchema);

export default MetaAccount;
