import mongoose from "mongoose";

const googleAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Google Ads Customer / Account ID (e.g., 123-456-7890 or act_google_123456)
    accountId: {
      type: String,
      required: [true, "Google Account ID is required"],
      trim: true,
    },
    accountName: {
      type: String,
      required: true,
      trim: true,
    },
    managerAccountId: {
      type: String,
      default: null,
    },
    managerCustomerId: {
      type: String,
      default: null,
    },
    selectedCustomerId: {
      type: String,
      default: null,
    },
    googleEmail: {
      type: String,
      default: "",
    },
    isManager: {
      type: Boolean,
      default: false,
    },
    accounts: [
      {
        customerId: { type: String, required: true },
        name: { type: String, default: "Google Ads Account" },
        isManager: { type: Boolean, default: false },
        currencyCode: { type: String, default: "INR" },
        timeZone: { type: String, default: "Asia/Kolkata" },
        status: { type: String, default: "ENABLED" },
        parentCustomerId: { type: String, default: null },
        level: { type: Number, default: 0 },
      },
    ],
    authType: {
      type: String,
      enum: ["OAUTH", "TOKEN", "MCP_SERVER"],
      default: "TOKEN",
    },
    accessToken: {
      type: String,
      default: "",
      trim: true,
    },
    refreshToken: {
      type: String,
      default: "",
      trim: true,
    },
    developerToken: {
      type: String,
      default: "",
      trim: true,
    },
    mcpServerUrl: {
      type: String,
      default: "",
      trim: true,
    },
    // Settings & Currency
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
    },
    timezoneName: {
      type: String,
      default: "Asia/Kolkata",
    },
    timezoneOffsetHoursUtc: {
      type: Number,
      default: 5.5,
    },
    accountStatus: {
      type: Number,
      default: 1, // 1=ENABLED, 2=CANCELED, 3=SUSPENDED
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
      enum: ["IDLE", "SYNCING", "SUCCESS", "FAILED"],
      default: "IDLE",
    },
    syncErrorMessage: {
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
    timestamps: true,
  }
);

googleAccountSchema.pre("save", function () {
  if (
    this.accountId &&
    typeof this.accountId === "string" &&
    this.accountId.trim() !== "" &&
    this.accessToken &&
    typeof this.accessToken === "string" &&
    this.accessToken.trim() !== "" &&
    this.isActive
  ) {
    this.isConnected = true;
  } else {
    this.isConnected = false;
  }
});

googleAccountSchema.index({ userId: 1, accountId: 1 }, { unique: true });

const GoogleAccount =
  mongoose.models.GoogleAccount ||
  mongoose.model("GoogleAccount", googleAccountSchema);

export default GoogleAccount;
