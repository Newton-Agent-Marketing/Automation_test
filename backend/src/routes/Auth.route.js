import express from "express";
import { AuthController } from "../controller/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { registerValidator, loginValidator } from "../validator/authValidator.js";

const router = express.Router();

// Public routes
router.post("/register", registerValidator, AuthController.register);
router.post("/login", loginValidator, AuthController.login);
router.post("/logout", AuthController.logout);

// Protected routes
router.get("/me", protect, AuthController.getMe);
router.put("/update-profile", protect, AuthController.updateProfile);

export default router;
