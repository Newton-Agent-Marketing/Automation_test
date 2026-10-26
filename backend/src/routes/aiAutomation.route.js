import express from "express";
import { AiAutomationController } from "../controller/aiAutomationController.js";
import AutomationExecutionController from "../controller/automationExecutionController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Enforce authentication for all automation routes
router.use(protect);

// Canvas document endpoints
router.get("/", AiAutomationController.getAutomation);
router.post("/save", AiAutomationController.saveAutomation);

// Node endpoints
router.post("/node", AiAutomationController.addNode);
router.put("/node/:nodeId", AiAutomationController.updateNode);
router.delete("/node/:nodeId", AiAutomationController.deleteNode);

// Connection / Edge endpoints
router.post("/edge", AiAutomationController.createEdge);
router.delete("/edge/:edgeId", AiAutomationController.deleteEdge);

// Validation and Activation endpoints
router.post("/validate", AiAutomationController.validate);
router.post("/toggle-active", AiAutomationController.toggleActive);
router.get("/history", AiAutomationController.getHistory);

// Automation Execution Logs & Controls endpoints
router.post("/executions/run", AutomationExecutionController.startExecution);
router.get("/executions", AutomationExecutionController.getExecutions);
router.get("/executions/:executionId", AutomationExecutionController.getExecutionById);
router.delete("/executions", AutomationExecutionController.clearAllExecutions);
router.delete("/executions/:executionId", AutomationExecutionController.deleteExecution);
router.post("/executions/:executionId/pause", AutomationExecutionController.pauseExecution);
router.post("/executions/:executionId/resume", AutomationExecutionController.resumeExecution);
router.post("/executions/:executionId/cancel", AutomationExecutionController.cancelExecution);
router.post("/executions/:executionId/retry/:nodeId", AutomationExecutionController.retryNodeExecution);

export default router;

