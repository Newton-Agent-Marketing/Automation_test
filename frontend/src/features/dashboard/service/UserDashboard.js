import api from "../../../lib/api";

export const dashboardApi = {
  stats: (params) => api.get("/api/meta-dashboard/stats", { params }),
  daily: (params) => api.get("/api/meta-dashboard/daily-performance", { params }),
  campaigns: (params) => api.get("/api/meta-dashboard/campaigns", { params }),
  getPreferences: () => api.get("/api/meta-dashboard/preferences"),
  savePreferences: (payload) => api.post("/api/meta-dashboard/preferences", payload),
  syncNow: (payload) => api.post("/api/meta-dashboard/sync-now", payload),
};
