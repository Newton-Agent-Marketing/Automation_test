import express from "express";
import { AiAutomationController } from "../controller/aiAutomationController.js";
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

export default router;
