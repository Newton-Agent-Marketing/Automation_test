// src/services/google/googleDriveService.js
import driveServiceInstance from "../../google/driveService.js";

class GoogleDriveService {
  constructor() {
    this.driveService = driveServiceInstance;
    this.scratchDir = driveServiceInstance.scratchDir;
  }

  ensureScratchDir() {
    return this.driveService.ensureScratchDir();
  }

  extractFileId(driveLinkOrId) {
    return this.driveService.extractFileId(driveLinkOrId);
  }

  async validateDriveLink(driveLinkOrId) {
    return this.driveService.validateDriveLink(driveLinkOrId);
  }

  async downloadCreative(driveLinkOrId, destinationFilename = null) {
    return this.driveService.downloadFile(driveLinkOrId, destinationFilename);
  }

  async downloadFile(driveLinkOrId, destinationFilename = null) {
    return this.driveService.downloadFile(driveLinkOrId, destinationFilename);
  }

  async listFiles(options) {
    return this.driveService.listFiles(options);
  }

  async getFileMetadata(fileIdOrUrl) {
    return this.driveService.getFileMetadata(fileIdOrUrl);
  }

  cleanupTempFile(filePath) {
    return this.driveService.cleanupTempFile(filePath);
  }
}

export const googleDriveService = new GoogleDriveService();
export default googleDriveService;
