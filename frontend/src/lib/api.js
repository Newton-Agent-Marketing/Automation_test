import axios from "axios";

export const API_URL = (() => {
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  if (isLocal) {
    return "http://localhost:3000";
  }
  const rawEnv = import.meta.env.VITE_API_URL;
  if (rawEnv && typeof rawEnv === "string" && rawEnv.trim()) {
    return rawEnv.trim().replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.trim().replace(/\/+$/, "");
  }
  return "http://localhost:3000";
})();

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: sanitize URLs and attach token from localStorage if available
api.interceptors.request.use(
  (config) => {
    if (config.baseURL && typeof config.baseURL === "string") {
      config.baseURL = config.baseURL.trim().replace(/\/+$/, "");
    }
    if (config.url && typeof config.url === "string") {
      config.url = config.url.trim();
    }
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const getErrorMessage = (error, fallback = "Something went wrong") => {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
};

export default api;
