import api from "../../../lib/api";

export const aiContextApi = {
  getContext: () => api.get("/api/ai-context"),
  saveContext: (payload) => api.post("/api/ai-context/save", payload),
  resetContext: () => api.post("/api/ai-context/reset"),
  deleteNode: (nodeId, payload = {}) => api.delete(`/api/ai-context/node/${nodeId}`, { data: payload }),
  
  // Data Ingestion (Excel Upload & Google Sheets)
  connectSheet: (payload) => api.post("/api/ai-context/connect-sheet", payload),
  discoverSheetTabs: (payload) => api.post("/api/ai-context/discover-sheet-tabs", payload),
  saveTabSelection: (payload) => api.post("/api/ai-context/save-tab-selection", payload),
  previewTabData: (payload) => api.post("/api/ai-context/preview-tab-data", payload),
  syncSheet: (payload) => api.post("/api/ai-context/sync-sheet", payload),
  getSheetSyncStatus: () => api.get("/api/ai-context/sheet-sync-status"),
  uploadExcel: (formData) => api.post("/api/ai-context/upload-excel", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }),
  previewPipeline: (payload) => api.post("/api/ai-context/preview-pipeline", payload),
  getSheetRows: () => api.get("/api/ai-context/sheet-rows"),
  
  // Google Drive & OAuth
  connectDrive: (payload) => api.post("/api/ai-context/connect-drive", payload),
  testDriveLink: (payload) => api.post("/api/ai-context/test-drive-link", payload),
  getDriveAuthUrl: (params) => api.get("/api/drive/auth-url", { params }),
  getDriveStatus: () => api.get("/api/drive/status"),
  listDriveFiles: (params) => api.get("/api/drive/files", { params }),
  downloadDriveFile: (payload) => api.post("/api/drive/download", payload),
  validateDriveLink: (payload) => api.post("/api/drive/validate", payload),
  disconnectDrive: () => api.post("/api/drive/disconnect"),
  getDriveSheetData: (payload) => api.post("/api/drive/sheet-data", payload),
  runDrivePipeline: (payload) => api.post("/api/drive/run-pipeline", payload),
};

export default aiContextApi;
