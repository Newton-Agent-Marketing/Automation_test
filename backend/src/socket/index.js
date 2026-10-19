import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { parseCookie } from "cookie";
import User from "../models/authModel.js";
import { runAgentChat } from "../controller/chat.controller.js";

let ioInstance = null;

export const getIo = () => ioInstance;

export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (
          !origin ||
          /^http:\/\/localhost:\d+$/.test(origin) ||
          /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
          origin === process.env.FRONTEND_URL
        ) {
          return callback(null, true);
        }
        return callback(new Error(`Not allowed by CORS: ${origin}`));
      },
      credentials: true,
    },
  });

  ioInstance = io;

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie || "");
      let token = cookies.token;

      if (!token && socket.handshake.auth?.token) {
        token = socket.handshake.auth.token;
      }

      if (!token) {
        return next(new Error("Not authorized. No token provided."));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "ai_agent_jwt_secret_key_2026"
      );

      const user = await User.findById(decoded.id).select("-password");
      if (!user) {
        return next(new Error("User not found. Token is invalid."));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error("Authentication failed. Invalid or expired token."));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user._id.toString();
    socket.join(`user:${userId}`);
    socket.emit("socket:ready", { userId, connected: true });

    socket.on("chat:send", async (payload = {}) => {
      const {
        conversationId,
        userMessage,
        accountId,
        metaAccountId,
        googleAccountId,
        aiContextMetaAccountId,
        startRow,
        endRow,
        rowRange,
        rangeSelector,
      } = payload;

      if (!conversationId || !userMessage) {
        socket.emit("chat:event", {
          type: "error",
          message: "conversationId and userMessage are required",
        });
        return;
      }

      try {
        await runAgentChat({
          userId: socket.user._id,
          userEmail: socket.user.email,
          conversationId,
          userMessage,
          accountId,
          metaAccountId,
          googleAccountId,
          aiContextMetaAccountId,
          startRow,
          endRow,
          rowRange,
          rangeSelector,
          onEvent: (event) => socket.emit("chat:event", event),
        });
        socket.emit("chat:event", { type: "done" });
      } catch (error) {
        console.error("[Socket Chat Error]:", error);
        socket.emit("chat:event", {
          type: "error",
          message: error.message,
        });
        socket.emit("chat:event", { type: "done" });
      }
    });
  });

  return io;
};
