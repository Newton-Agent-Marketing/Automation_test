import mongoose, { Schema } from "mongoose";

const automationNodeSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ["trigger", "date", "action", "time", "generic"],
      default: "generic",
    },
    label: { type: String, default: "" },
    text: { type: String, default: "" },
    status: {
      type: String,
      enum: ["configured", "incomplete", "invalid", "saved"],
      default: "incomplete",
    },
    stepNumber: { type: Number, default: null },
    sequenceLabel: { type: String, default: "node_" },
    config: {
      type: Schema.Types.Mixed,
      default: {},
    },
    position: {
      x: { type: Number, default: 250 },
      y: { type: Number, default: 150 },
    },
    width: { type: Number, default: 260 },
    height: { type: Number, default: 100 },
  },
  { _id: false, timestamps: true }
);

const automationEdgeSchema = new Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    sourceHandle: { type: String, default: "right" },
    targetHandle: { type: String, default: "left" },
  },
  { _id: false, timestamps: true }
);

const executionHistorySchema = new Schema(
  {
    id: { type: String, required: true },
    executedAt: { type: Date, default: Date.now },
    triggerType: { type: String, default: "manual" }, // "manual" | "schedule" | "webhook"
    actionType: { type: String, default: "send_notification" },
    status: { type: String, enum: ["success", "failed"], default: "success" },
    message: { type: String, default: "" },
    result: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
    durationMs: { type: Number, default: 0 },
  },
  { _id: false }
);

const aiAutomationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: false,
      index: true,
    },
    name: {
      type: String,
      default: "AI Automation Workspace",
    },
    metaAccountId: {
      type: String,
      default: "",
    },
    spreadsheetId: {
      type: String,
      default: "",
    },
    targetTab: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    nextRunAt: {
      type: Date,
      default: null,
    },
    nodes: {
      type: [automationNodeSchema],
      default: [], // Zero predefined nodes initially
    },
    edges: {
      type: [automationEdgeSchema],
      default: [],
    },
    executionHistory: {
      type: [executionHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const AiAutomation =
  mongoose.models.AiAutomation ||
  mongoose.model("AiAutomation", aiAutomationSchema);

export default AiAutomation;
