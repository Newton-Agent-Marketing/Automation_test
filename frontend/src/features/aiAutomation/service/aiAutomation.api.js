import api from "../../../lib/api";

export const aiAutomationApi = {
  getAutomation: () => api.get("/api/automation"),
  saveAutomation: (payload) => api.post("/api/automation/save", payload),
  addNode: (payload) => api.post("/api/automation/node", payload),
  updateNode: (nodeId, payload) => api.put(`/api/automation/node/${nodeId}`, payload),
  deleteNode: (nodeId) => api.delete(`/api/automation/node/${nodeId}`),
  createEdge: (payload) => api.post("/api/automation/edge", payload),
  deleteEdge: (edgeId) => api.delete(`/api/automation/edge/${edgeId}`),
};

export default aiAutomationApi;
