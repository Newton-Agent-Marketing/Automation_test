import mongoose, { Schema } from "mongoose";

const automationNodeSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, default: "" },
    stepNumber: { type: Number, default: null }, // e.g. 1 for node1, 2 for node2, null for unconnected
    sequenceLabel: { type: String, default: "node_" }, // e.g. "node1", "node2", or "node_"
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

const aiAutomationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      default: "AI Automation Workspace",
    },
    nodes: {
      type: [automationNodeSchema],
      default: [], // Zero predefined nodes! Empty canvas initially.
    },
    edges: {
      type: [automationEdgeSchema],
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
