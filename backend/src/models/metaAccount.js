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
