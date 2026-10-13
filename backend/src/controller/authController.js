import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/authModel.js";

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
      const { name, email } = req.body;
      const updateData = {};
      if (name) updateData.name = name.trim();
      if (email) updateData.email = email.toLowerCase().trim();

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
}

export default AuthController;
