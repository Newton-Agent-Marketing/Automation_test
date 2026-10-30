import express from "express";
import multer from "multer";
import { AiContextController } from "../controller/aiContextController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max excel file
});

router.use(protect);

router.get("/", AiContextController.getContext);
router.post("/save", AiContextController.saveContext);
router.post("/reset", AiContextController.resetContext);
router.delete("/node/:nodeId", AiContextController.deleteNode);
router.post("/connect-sheet", AiContextController.connectSheet);
router.post("/discover-sheet-tabs", AiContextController.discoverSheetTabs);
router.post("/save-tab-selection", AiContextController.saveTabSelection);
router.post("/preview-tab-data", AiContextController.previewTabData);
router.post("/sync-sheet", AiContextController.syncSheet);
router.get("/sheet-sync-status", AiContextController.getSheetSyncStatus);
router.post("/upload-excel", upload.single("file"), AiContextController.uploadExcel);
router.post("/preview-pipeline", AiContextController.previewPipeline);
router.get("/sheet-rows", AiContextController.getSheetRows);
router.post("/connect-drive", AiContextController.connectGoogleDrive);
router.post("/test-drive-link", AiContextController.testDriveLink);

export default router;
