import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import AutomationExecution from "../src/models/automationExecutionModel.js";
import { buildExecutionOrder, sanitizePayload } from "../src/services/automation/workflowExecutionEngine.js";

async function runTests() {
  console.log("=== Testing Automation Execution Logic ===");

  // 1. Test buildExecutionOrder
  const sampleNodes = [
    { id: "node_start", type: "trigger", label: "Start Node" },
    { id: "node_custom", type: "generic", label: "Custom Task" },
    { id: "node_action", type: "action", label: "Action Node" },
  ];
  const sampleEdges = [
    { id: "edge_1", source: "node_start", target: "node_custom" },
    { id: "edge_2", source: "node_custom", target: "node_action" },
  ];

  const order = buildExecutionOrder(sampleNodes, sampleEdges);
  console.log("Ordered nodes:", order.map((n) => n.id));
  if (order[0].id !== "node_start" || order[1].id !== "node_custom" || order[2].id !== "node_action") {
    throw new Error("Execution order failed");
  }
  console.log("✔ Topological execution order verified");

  // 2. Test sanitizePayload
  const dirty = {
    user: "john",
    password: "secret_password",
    token: "jwt_token_here",
    nested: {
      apiKey: "12345",
      regular: "safe_value",
    },
  };
  const clean = sanitizePayload(dirty);
  if (clean.password !== "[REDACTED]" || clean.token !== "[REDACTED]" || clean.nested.apiKey !== "[REDACTED]" || clean.nested.regular !== "safe_value") {
    throw new Error("Sanitization failed");
  }
  console.log("✔ Sensitive payload sanitization verified");

  console.log("ALL AUTOMATION LOGS BACKEND LOGIC PASSED");
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
