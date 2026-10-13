import jwt from "jsonwebtoken";
import User from "../models/authModel.js";

export const protect = async (req, res, next) => {
  try {
    let token = req.cookies?.token;

    // Check authorization header as fallback (Bearer <token>)
    if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. No token provided.",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "ai_agent_jwt_secret_key_2026"
    );

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found. Token is invalid.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Authentication failed. Invalid or expired token.",
      error: error.message,
    });
  }
};
