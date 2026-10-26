import mongoose, { Schema } from "mongoose";

const nodeExecutionSchema = new Schema(
  {
    nodeId: { type: String, required: true },
    nodeName: { type: String, default: "" },
    nodeType: { type: String, default: "generic" },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed", "skipped", "cancelled", "paused"],
      default: "pending",
    },
    executionOrder: { type: Number, default: 1 },
    attemptNumber: { type: Number, default: 1 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0 },
    input: { type: Schema.Types.Mixed, default: null },
    output: { type: Schema.Types.Mixed, default: null },
    error: { type: Schema.Types.Mixed, default: null },
    retryInfo: { type: Schema.Types.Mixed, default: null },
  },
  { _id: true, timestamps: false }
);

const executionLogSchema = new Schema(
  {
    timestamp: { type: Date, default: Date.now },
    level: {
      type: String,
      enum: ["info", "warn", "error", "success"],
      default: "info",
    },
    nodeId: { type: String, default: null },
    nodeName: { type: String, default: null },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const automationExecutionSchema = new Schema(
  {
    executionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    automationId: {
      type: Schema.Types.ObjectId,
      ref: "AiAutomation",
      required: false,
      index: true,
    },
    automationName: {
      type: String,
      default: "AI Automation Workspace",
    },
    workflowName: {
      type: String,
      default: null,
    },
    rootNodeId: {
      type: String,
      default: null,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    triggerType: {
      type: String,
      enum: ["manual", "schedule"],
      default: "manual",
    },
    status: {
      type: String,
      enum: ["running", "completed", "failed", "partially_failed", "cancelled", "paused"],
      default: "running",
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    totalNodes: {
      type: Number,
      default: 0,
    },
    successfulNodes: {
      type: Number,
      default: 0,
    },
    failedNodes: {
      type: Number,
      default: 0,
    },
    errorSummary: {
      type: String,
      default: null,
    },
    nodes: {
      type: [nodeExecutionSchema],
      default: [],
    },
    logs: {
      type: [executionLogSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

automationExecutionSchema.index({ userId: 1, startedAt: -1 });
automationExecutionSchema.index({ userId: 1, status: 1 });

const AutomationExecution =
  mongoose.models.AutomationExecution ||
  mongoose.model("AutomationExecution", automationExecutionSchema);

export default AutomationExecution;
