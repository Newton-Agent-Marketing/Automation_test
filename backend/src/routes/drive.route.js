import express from "express";
import { DriveController } from "../controller/driveController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public OAuth Initiator & Callback endpoints
router.get("/auth-url", DriveController.getAuthUrl);
router.get("/auth/google", DriveController.getAuthUrl);
router.get("/oauth/callback", DriveController.handleOAuthCallback);
router.post("/oauth-callback", DriveController.handleOAuthCallback);

// Protected Drive & Sheet operations
router.get("/status", DriveController.getStatus);
router.post("/validate", DriveController.validateLink);
router.get("/files", DriveController.listFiles);
router.get("/list", DriveController.listFiles);
router.post("/download", DriveController.downloadFile);
router.post("/sheet-data", DriveController.getSheetData);
router.post("/run-pipeline", DriveController.runPipeline);
router.post("/disconnect", DriveController.disconnect);

export default router;
