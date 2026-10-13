import mongoose from "mongoose";

const systemLogSchema = new mongoose.Schema(
  {
    level: {
      type: String,
      enum: ["log", "info", "warn", "error", "debug"],
      default: "log",
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    source: {
      type: String,
      default: "backend",
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 30 * 24 * 60 * 60, // 30-day auto retention (TTL index)
      index: true,
    },
  },
  { timestamps: true }
);

const SystemLog = mongoose.models.SystemLog || mongoose.model("SystemLog", systemLogSchema);
export default SystemLog;
