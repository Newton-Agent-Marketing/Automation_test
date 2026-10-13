import mongoose, { Schema } from "mongoose";

const connectedChannelSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    channelId: {
      type: String, // e.g., "meta", "google", "spotify", "linkedin", "twitter", "tiktok", "snapchat", "apple-music", "jiosaavn", "microsoft", "taboola", "outbrain"
      required: true,
    },
    channelName: {
      type: String,
      required: true,
    },
    accountId: {
      type: String,
      default: "",
    },
    accountName: {
      type: String,
      default: "",
    },
    accessToken: {
      type: String,
      default: "",
    },
    isConnected: {
      type: Boolean,
      default: false,
    },
    config: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

connectedChannelSchema.pre("save", function () {
  if (
    this.accountId &&
    typeof this.accountId === "string" &&
    this.accountId.trim() !== "" &&
    this.accessToken &&
    typeof this.accessToken === "string" &&
    this.accessToken.trim() !== ""
  ) {
    this.isConnected = true;
  } else {
    this.isConnected = false;
  }
});

connectedChannelSchema.index({ userId: 1, channelId: 1, accountId: 1 }, { unique: true });

const ConnectedChannel =
  mongoose.models.ConnectedChannel ||
  mongoose.model("ConnectedChannel", connectedChannelSchema);

// Self-healing: drop legacy index if it exists in MongoDB
if (mongoose.connection) {
  mongoose.connection.on("open", async () => {
    try {
      await mongoose.connection.collection("connectedchannels").dropIndex("userId_1_channelId_1");
      console.log("✅ [ConnectedChannel Model] Dropped legacy userId_1_channelId_1 index successfully.");
    } catch (e) {
      // index not found or already dropped
    }
  });
}

export default ConnectedChannel;


