import api from "../../../lib/api";

export const authApi = {
  register: (payload) => api.post("/api/auth/register", payload),
  login: (payload) => api.post("/api/auth/login", payload),
  logout: () => api.post("/api/auth/logout"),
  me: () => api.get("/api/auth/me"),
  updateProfile: (payload) => api.put("/api/auth/update-profile", payload),
  uploadAvatar: (formData, onUploadProgress) =>
    api.post("/api/auth/upload-avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress,
    }),
  removeAvatar: () => api.delete("/api/auth/remove-avatar"),
};

export default authApi;
