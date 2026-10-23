import mongoose, { Schema } from "mongoose";

const automationNodeSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, default: "" },
    position: {
      x: { type: Number, default: 250 },
      y: { type: Number, default: 150 },
    },
    width: { type: Number, default: 240 },
    height: { type: Number, default: 110 },
  },
  { _id: false, timestamps: true }
);

const automationEdgeSchema = new Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    sourceHandle: { type: String, default: "bottom" },
    targetHandle: { type: String, default: "top" },
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
