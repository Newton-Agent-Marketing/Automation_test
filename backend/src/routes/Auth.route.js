import express from "express";
import { AuthController } from "../controller/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { avatarUploadMiddleware } from "../middleware/uploadMiddleware.js";
import { registerValidator, loginValidator } from "../validator/authValidator.js";

const router = express.Router();

// Public routes
router.post("/register", registerValidator, AuthController.register);
router.post("/login", loginValidator, AuthController.login);
router.post("/logout", AuthController.logout);
router.get("/profile-photo/:userId", AuthController.getProfilePhoto);

// Protected routes
router.get("/me", protect, AuthController.getMe);
router.put("/update-profile", protect, AuthController.updateProfile);
router.post("/upload-avatar", protect, avatarUploadMiddleware, AuthController.uploadAvatar);
router.delete("/remove-avatar", protect, AuthController.removeAvatar);

export default router;
