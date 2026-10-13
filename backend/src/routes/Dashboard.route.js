// src/routes/Dashboard.route.js
import { Router } from "express";
import { MetaDashboardController } from "../controller/Dashbord.controller.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protect);

router.get("/stats", MetaDashboardController.getOverviewStats);
router.get("/daily-performance", MetaDashboardController.getDailyPerformance);
router.get("/campaigns", MetaDashboardController.getCampaigns);
router.get("/preferences", MetaDashboardController.getPreferences);
router.post("/preferences", MetaDashboardController.savePreferences);
router.post("/sync-now", MetaDashboardController.triggerManualSync);

export default router;