import { Storage } from "@google-cloud/storage";
import fs from "fs";
import path from "path";

class GcsStorageService {
  constructor() {
    this.storage = null;
    this.bucketName = null;
    this.initialized = false;
    this.initError = null;

    this.init();
  }

  init() {
    try {
      this.bucketName =
        process.env.GCS_BUCKET_NAME ||
        process.env.GOOGLE_CLOUD_STORAGE_BUCKET ||
        process.env.GCS_BUCKET ||
        "";

      const projectId =
        process.env.GCS_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT_ID ||
        process.env.GOOGLE_PROJECT_ID ||
        "";

      const keyFilePath =
        process.env.GCS_KEY_FILE ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        "";

      const clientEmail = process.env.GCS_CLIENT_EMAIL || "";
      let privateKey = process.env.GCS_PRIVATE_KEY || "";
      if (privateKey && privateKey.includes("\\n")) {
        privateKey = privateKey.replace(/\\n/g, "\n");
      }

      const storageOptions = {};
      if (projectId) {
        storageOptions.projectId = projectId;
      }

      if (keyFilePath && fs.existsSync(keyFilePath)) {
        storageOptions.keyFilename = path.resolve(keyFilePath);
      } else if (clientEmail && privateKey) {
        storageOptions.credentials = {
          client_email: clientEmail,
          private_key: privateKey,
        };
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        // Will be picked up by Storage automatically
      }

      // Auto-fallback: use existing connected Google OAuth credentials if available
      if (!storageOptions.credentials && !storageOptions.keyFilename) {
        const tokenDir = process.env.TOKEN_STORAGE_DIR || "./.tokens";
        const tokenFile = path.resolve(tokenDir, "google_tokens.json");
        if (fs.existsSync(tokenFile) && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
          try {
            const tokenData = JSON.parse(fs.readFileSync(tokenFile, "utf8"));
            if (tokenData?.refresh_token) {
              storageOptions.credentials = {
                type: "authorized_user",
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                refresh_token: tokenData.refresh_token,
              };
              console.log("[GCS Storage] Using connected Google OAuth credentials for bucket access.");
            }
          } catch (tErr) {
            console.warn("[GCS Storage] Could not read google_tokens.json:", tErr.message);
          }
        }
      }

      if (this.bucketName && (storageOptions.keyFilename || storageOptions.credentials || process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
        this.storage = new Storage(storageOptions);
        this.initialized = true;
        this.initError = null;
        console.log(`[GCS Storage] Initialized successfully with bucket: "${this.bucketName}"`);
      } else {
        this.initialized = false;
        this.initError = "GCS credentials or bucket name not configured in environment variables.";
      }
    } catch (err) {
      this.storage = null;
      this.initialized = false;
      this.initError = err.message;
      console.warn("[GCS Storage] Initialization warning:", err.message);
    }
  }

  isConfigured() {
    if (!this.initialized) {
      // Re-attempt init in case env variables were loaded dynamically
      this.init();
    }
    return Boolean(this.initialized && this.storage && this.bucketName);
  }

  getBucket() {
    if (!this.isConfigured()) {
      throw new Error(
        `Google Cloud Storage is not configured. (${this.initError || "Missing GCS_BUCKET_NAME or credentials in .env"})`
      );
    }
    return this.storage.bucket(this.bucketName);
  }

  /**
   * Upload buffer to Google Cloud Storage private bucket
   */
  async uploadBuffer({ buffer, destination, contentType = "image/webp" }) {
    const bucket = this.getBucket();
    const file = bucket.file(destination);

    await file.save(buffer, {
      metadata: {
        contentType,
        cacheControl: "private, max-age=86400, stale-while-revalidate=604800",
      },
      resumable: false,
    });

    return {
      bucket: this.bucketName,
      destination,
      size: buffer.length,
      contentType,
    };
  }

  /**
   * Get readable stream for private file from GCS
   */
  async getFileStream(destination) {
    const bucket = this.getBucket();
    const file = bucket.file(destination);

    const [exists] = await file.exists();
    if (!exists) {
      return null;
    }

    const [metadata] = await file.getMetadata();
    const stream = file.createReadStream();

    return {
      stream,
      contentType: metadata.contentType || "application/octet-stream",
      contentLength: metadata.size,
      updated: metadata.updated,
    };
  }

  /**
   * Delete object from GCS bucket
   */
  async deleteFile(destination) {
    if (!destination) return false;
    try {
      const bucket = this.getBucket();
      const file = bucket.file(destination);
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
        return true;
      }
    } catch (err) {
      console.warn(`[GCS Storage] Failed to delete file "${destination}":`, err.message);
    }
    return false;
  }

  /**
   * Generate v4 Signed Read URL for private bucket
   */
  async getSignedUrl(destination, expiresInMinutes = 60) {
    const bucket = this.getBucket();
    const file = bucket.file(destination);

    const [exists] = await file.exists();
    if (!exists) return null;

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + expiresInMinutes * 60 * 1000,
    });

    return url;
  }
}

export const gcsStorage = new GcsStorageService();
export default gcsStorage;
