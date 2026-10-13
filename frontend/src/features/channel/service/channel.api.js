import api from "../../../lib/api";

export const channelApi = {
  status: () => api.get("/api/channel/status"),
  getAccounts: (params) => api.get("/api/channel/accounts", { params }),
  tools: () => api.get("/api/channel/tools"),
  getMetaOAuthUrl: (params) => api.get("/api/channel/meta/oauth-url", { params }),
  metaOAuthCallback: (payload) => api.post("/api/channel/meta/oauth-callback", payload),
  connectMcpServer: (payload) => api.post("/api/channel/meta/mcp-connect", payload),
  fetchMetaAccounts: (payload) => api.post("/api/channel/meta/fetch-accounts", payload),
  connectMeta: (payload) => api.post("/api/channel/meta/connect", payload),
  selectMetaAccount: (payload) => api.post("/api/channel/meta/accounts/select", payload),
  disconnectMeta: (payload) => api.post("/api/channel/meta/disconnect", payload),
  getGoogleOAuthUrl: (params) => api.get("/api/channel/google/oauth-url", { params }),
  googleOAuthCallback: (payload) => api.post("/api/channel/google/oauth-callback", payload),
  connectGoogleMcpServer: (payload) => api.post("/api/channel/google/mcp-connect", payload),
  fetchGoogleAccounts: (payload) => api.post("/api/channel/google/fetch-accounts", payload),
  selectGoogleAccount: (payload) => api.post("/api/channel/google/accounts/select", payload),
  getGoogleAccounts: () => api.get("/api/channel/google/accounts"),
  getGoogleStatus: () => api.get("/api/channel/google/status"),
  connectGoogle: (payload) => api.post("/api/channel/google/connect", payload),
  disconnectGoogle: (payload) => api.post("/api/channel/google/disconnect", payload),
  connectGeneric: (payload) => api.post("/api/channel/connect", payload),
  disconnectGeneric: (payload) => api.post("/api/channel/disconnect", payload),
  sync: (payload) => api.post("/api/channel/sync", payload),
  resyncChannel: (id) => api.post(`/api/channel/connected-channels/${id}/resync`),
};

export default channelApi;
