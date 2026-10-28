import api from "../../../lib/api";

export const aiAutomationApi = {
  getAutomation: () => api.get("/api/automation"),
  saveAutomation: (payload) => api.post("/api/automation/save", payload),
  addNode: (payload) => api.post("/api/automation/node", payload),
  updateNode: (nodeId, payload) => api.put(`/api/automation/node/${nodeId}`, payload),
  deleteNode: (nodeId) => api.delete(`/api/automation/node/${nodeId}`),
  createEdge: (payload) => api.post("/api/automation/edge", payload),
  deleteEdge: (edgeId) => api.delete(`/api/automation/edge/${edgeId}`),
  validate: () => api.post("/api/automation/validate"),
  toggleActive: () => api.post("/api/automation/toggle-active"),
  runNow: (payload) => api.post("/api/automation/run", payload),
  getHistory: () => api.get("/api/automation/history"),
  getExecutions: (params) => api.get("/api/automation/executions", { params }),
  getExecutionById: (executionId) => api.get(`/api/automation/executions/${executionId}`),
  retryExecution: (executionId) => api.post(`/api/automation/executions/${executionId}/retry`),
  startExecution: (payload) => api.post("/api/automation/executions/run", payload),
  pauseExecution: (executionId) => api.post(`/api/automation/executions/${executionId}/pause`),
  resumeExecution: (executionId) => api.post(`/api/automation/executions/${executionId}/resume`),
  cancelExecution: (executionId) => api.post(`/api/automation/executions/${executionId}/cancel`),
  retryNodeExecution: (executionId, nodeId) => api.post(`/api/automation/executions/${executionId}/retry/${nodeId}`),
};

export default aiAutomationApi;

