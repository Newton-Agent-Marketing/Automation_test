import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/authModel.js";
import { gcsStorage } from "../services/storage/gcsStorageService.js";

// Helper to generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      userType: user.userType,
    },
    process.env.JWT_SECRET || "ai_agent_jwt_secret_key_2026",
    {
      expiresIn: "7d",
    }
  );
};

// Helper to get cookie options
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
};

export class AuthController {
  // 1. User Registration
  static async register(req, res) {
    try {
      const { name, email, password, userType } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists",
        });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create new user
      const user = await User.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        userType: userType || "user",
      });

      // Generate JWT Token
      const token = generateToken(user);

      // Set cookie in response
      res.cookie("token", token, getCookieOptions());

      return res.status(201).json({
        success: true,
        message: "User registered successfully",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          userType: user.userType,
          avatar: user.avatar || "",
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error("[Auth Register Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to register user",
        error: error.message,
      });
    }
  }

  // 2. User Login
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await User.findOne({ email: email.toLowerCase().trim() });
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      // Compare password
      const isPasswordMatch = await bcrypt.compare(password, user.password);
      if (!isPasswordMatch) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      // Generate JWT Token
      const token = generateToken(user);

      // Set cookie in response
      res.cookie("token", token, getCookieOptions());

      return res.status(200).json({
        success: true,
        message: "Login successful",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          userType: user.userType,
          avatar: user.avatar || "",
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error("[Auth Login Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to login",
        error: error.message,
      });
    }
  }

  // 3. User Logout
  static async logout(req, res) {
    try {
      // Clear cookie
      res.cookie("token", "", {
        ...getCookieOptions(),
        maxAge: 0,
        expires: new Date(0),
      });

      return res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      console.error("[Auth Logout Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to logout",
        error: error.message,
      });
    }
  }

  // 4. Get Current Authenticated User (Profile / Session Check)
  static async getMe(req, res) {
    try {
      const user = await User.findById(req.user._id).select("-password");
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      return res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      console.error("[Auth GetMe Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch user profile",
        error: error.message,
      });
    }
  }

  // 5. Update Current User Profile
  static async updateProfile(req, res) {
    try {
      const { name, email, avatar } = req.body;
      const updateData = {};
      if (name !== undefined) updateData.name = name.trim();
      if (email !== undefined) updateData.email = email.toLowerCase().trim();

      if (avatar !== undefined) {
        if (avatar && avatar.startsWith("data:image/")) {
          if (gcsStorage.isConfigured()) {
            try {
              const matches = avatar.match(/^data:([^;]+);base64,(.+)$/);
              if (matches) {
                const mimeType = matches[1];
                const buffer = Buffer.from(matches[2], "base64");
                const ext = mimeType === "image/svg+xml" ? "svg" : mimeType.split("/")[1] || "webp";
                const destination = `avatars/user-${req.user._id}-${Date.now()}.${ext}`;

                await gcsStorage.uploadBuffer({ buffer, destination, contentType: mimeType });

                const currentUser = await User.findById(req.user._id);
                if (currentUser?.avatarStoragePath && currentUser.avatarStoragePath !== destination) {
                  await gcsStorage.deleteFile(currentUser.avatarStoragePath);
                }

                updateData.avatarStoragePath = destination;
                updateData.avatar = `/api/auth/profile-photo/${req.user._id}?v=${Date.now()}`;
              }
            } catch (gcsErr) {
              console.warn("[GCS Upload in updateProfile Warning]:", gcsErr.message);
              updateData.avatar = avatar;
            }
          } else {
            updateData.avatar = avatar;
          }
        } else if (avatar === "") {
          const currentUser = await User.findById(req.user._id);
          if (currentUser?.avatarStoragePath && gcsStorage.isConfigured()) {
            await gcsStorage.deleteFile(currentUser.avatarStoragePath);
          }
          updateData.avatar = "";
          updateData.avatarStoragePath = "";
        } else {
          updateData.avatar = avatar;
        }
      }

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updateData },
        { returnDocument: "after" }
      ).select("-password");

      return res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        user,
      });
    } catch (error) {
      console.error("[Auth UpdateProfile Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update profile",
        error: error.message,
      });
    }
  }

  // 6. Upload Profile Avatar to Google Cloud Storage (Private Bucket)
  static async uploadAvatar(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No image file provided",
        });
      }

      const userId = req.user._id;
      const currentUser = await User.findById(userId);
      if (!currentUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const ext = req.file.mimetype === "image/svg+xml" ? "svg" : req.file.mimetype.split("/")[1] || "webp";
      const destination = `avatars/user-${userId}-${Date.now()}.${ext}`;
      let finalAvatarUrl = "";
      let finalStoragePath = "";

      if (gcsStorage.isConfigured()) {
        // Upload to private GCS bucket
        await gcsStorage.uploadBuffer({
          buffer: req.file.buffer,
          destination,
          contentType: req.file.mimetype,
        });

        // Clean up previous GCS avatar file if exists
        if (currentUser.avatarStoragePath && currentUser.avatarStoragePath !== destination) {
          await gcsStorage.deleteFile(currentUser.avatarStoragePath);
        }

        finalStoragePath = destination;
        finalAvatarUrl = `/api/auth/profile-photo/${userId}?v=${Date.now()}`;
      } else {
        // Fallback for local development if GCS credentials are not set in .env yet
        const base64Data = req.file.buffer.toString("base64");
        finalAvatarUrl = `data:${req.file.mimetype};base64,${base64Data}`;
        finalStoragePath = "";
        console.warn("[GCS Warning] GCS is not configured in .env; saved image in database fallback.");
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            avatar: finalAvatarUrl,
            avatarStoragePath: finalStoragePath,
          },
        },
        { returnDocument: "after" }
      ).select("-password");

      return res.status(200).json({
        success: true,
        message: "Profile photo uploaded successfully",
        user: updatedUser,
        avatar: finalAvatarUrl,
      });
    } catch (error) {
      console.error("[Auth UploadAvatar Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to upload profile photo to storage",
        error: error.message,
      });
    }
  }

  // 7. Remove Profile Avatar
  static async removeAvatar(req, res) {
    try {
      const userId = req.user._id;
      const currentUser = await User.findById(userId);
      if (!currentUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      if (currentUser.avatarStoragePath && gcsStorage.isConfigured()) {
        await gcsStorage.deleteFile(currentUser.avatarStoragePath);
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            avatar: "",
            avatarStoragePath: "",
          },
        },
        { returnDocument: "after" }
      ).select("-password");

      return res.status(200).json({
        success: true,
        message: "Profile photo removed successfully",
        user: updatedUser,
      });
    } catch (error) {
      console.error("[Auth RemoveAvatar Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to remove profile photo",
        error: error.message,
      });
    }
  }

  // 8. Stream Profile Photo from Private GCS Bucket
  static async getProfilePhoto(req, res) {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId).select("avatar avatarStoragePath");
      if (!user) {
        return res.status(404).send("User not found");
      }

      if (user.avatarStoragePath && gcsStorage.isConfigured()) {
        const fileData = await gcsStorage.getFileStream(user.avatarStoragePath);
        if (fileData) {
          res.setHeader("Content-Type", fileData.contentType);
          res.setHeader("Cache-Control", "private, max-age=86400, stale-while-revalidate=604800");
          return fileData.stream.pipe(res);
        }
      }

      // If stored as base64 data url
      if (user.avatar && user.avatar.startsWith("data:")) {
        const matches = user.avatar.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const contentType = matches[1];
          const buffer = Buffer.from(matches[2], "base64");
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "private, max-age=86400");
          return res.send(buffer);
        }
      }

      return res.status(404).send("Profile photo not found");
    } catch (error) {
      console.error("[Auth GetProfilePhoto Error]:", error);
      return res.status(500).send("Failed to stream profile photo");
    }
  }
}

export default AuthController;
