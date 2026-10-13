import { io } from "socket.io-client";
import { API_URL } from "../../../lib/api";

let socket = null;

export const getSocket = () => socket;

export const connectChatSocket = ({ onReady, onEvent, onStatus }) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (!socket) {
    socket = io(API_URL, {
      withCredentials: true,
      transports: ["polling", "websocket"],
      auth: { token },
      reconnectionAttempts: 5,
    });
  }

  socket.removeAllListeners();
  socket.on("connect", () => onStatus?.(true));
  socket.on("disconnect", () => onStatus?.(false));
  socket.on("connect_error", () => onStatus?.(false));
  socket.on("socket:ready", (payload) => onReady?.(payload));
  socket.on("chat:event", (event) => onEvent?.(event));

  if (!socket.connected) socket.connect();
  return socket;
};

export const disconnectChatSocket = () => {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
};

export const sendChatOverSocket = (payload) => {
  if (!socket?.connected) {
    throw new Error("Socket is not connected");
  }
  socket.emit("chat:send", payload);
};
