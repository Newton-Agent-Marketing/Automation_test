import api from "../../../lib/api";

export const authApi = {
  register: (payload) => api.post("/api/auth/register", payload),
  login: (payload) => api.post("/api/auth/login", payload),
  logout: () => api.post("/api/auth/logout"),
  me: () => api.get("/api/auth/me"),
  updateProfile: (payload) => api.put("/api/auth/update-profile", payload),
};

export default authApi;
