// src/services/data/mediaAssetResolver.js
import fs from "fs";
import path from "path";
import driveService from "../../google/driveService.js";

export class MediaAssetResolver {
  /**
   * Extract all Google Drive URLs, file IDs, or Smart Chip filenames from a cell value string/array
   */
  static extractDriveUrls(cellValue) {
    if (!cellValue) return [];
    
    let text = "";
    if (typeof cellValue === "string") {
      text = cellValue;
    } else if (Array.isArray(cellValue)) {
      text = cellValue.map((item) => String(item || "")).join("\n");
    } else if (typeof cellValue === "object") {
      text = JSON.stringify(cellValue);
    } else {
      text = String(cellValue);
    }

    if (!text.trim()) return [];

    // Split text by common delimiters: newlines, commas, semicolons, spaces
    const candidates = text
      .split(/[\r\n,;\t]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const urls = [];
    const seen = new Set();

    for (const cand of candidates) {
      // 1. Direct Drive URL match
      if (cand.includes("drive.google.com") || cand.includes("docs.google.com")) {
        const urlMatch = cand.match(/https?:\/\/[^\s"',;]+/);
        const effectiveUrl = urlMatch ? urlMatch[0] : cand;
        if (!seen.has(effectiveUrl)) {
          seen.add(effectiveUrl);
          urls.push(effectiveUrl);
        }
        continue;
      }

      // 2. Standalone Drive File/Folder ID (25 to 60 alphanumeric/dash/underscore chars)
      const fileId = driveService.extractFileId(cand);
      if (fileId && !cand.startsWith("http") && cand.length >= 25 && cand.length <= 60) {
        if (!seen.has(cand)) {
          seen.add(cand);
          urls.push(cand);
        }
        continue;
      }

      // 3. Media filename (e.g. video.mp4, creative.mov from Smart Chip text)
      if (/\.(mp4|mov|avi|webm|m4v|mkv|png|jpg|jpeg|webp)$/i.test(cand) && cand.length > 4) {
        if (!seen.has(cand)) {
          seen.add(cand);
          urls.push(cand);
        }
        continue;
      }
    }

    return urls;
  }

  /**
   * Search all potential creative asset columns in a row and extract all Google Drive URLs.
   * Priority: Row-specific Smart Chips first, direct video/media columns second, generic folders last.
   */
  static extractRowDriveUrls(rowValues = {}) {
    const keys = Object.keys(rowValues || {});
    const priorityTiers = [
      ["creative_smart_chips", "creative_smart_chip", "smart_chips", "smart_chip", "creativesmartchips"],
      ["video_url", "video_file", "video", "image_url", "creative_url", "media_url", "media", "creative"],
      ["google_drive_link", "drive_url", "drive_link", "drive", "asset"]
    ];

    const extractedUrls = [];
    const seen = new Set();

    for (const tier of priorityTiers) {
      for (const k of keys) {
        const kClean = k.toLowerCase().replace(/[^a-z0-9]/g, "");
        const matchesTier = tier.some((kw) => kClean.includes(kw.replace(/[^a-z0-9]/g, "")));
        if (matchesTier) {
          const val = rowValues[k];
          if (val) {
            const found = this.extractDriveUrls(val);
            found.forEach((url) => {
              if (!seen.has(url)) {
                seen.add(url);
                extractedUrls.push(url);
              }
            });
          }
        }
      }
    }

    // Direct file URLs (/file/d/ or standalone file IDs) take strict priority over folder URLs (/folders/)
    extractedUrls.sort((a, b) => {
      const aIsFolder = a.includes("/folders/");
      const bIsFolder = b.includes("/folders/");
      if (!aIsFolder && bIsFolder) return -1;
      if (aIsFolder && !bIsFolder) return 1;
      return 0;
    });

    return extractedUrls;
  }

  /**
   * Detect actual media type (image vs video) by inspecting API MIME type & file binary
   */
  static async resolveAndDetectAsset(driveLinkOrId) {
    if (!driveLinkOrId || typeof driveLinkOrId !== "string") {
      throw new Error("Invalid Drive URL or File ID provided for asset detection.");
    }

    let fileId = driveService.extractFileId(driveLinkOrId);
    if (!fileId) {
      fileId = await driveService.resolveFileId(driveLinkOrId);
    }

    let downloadedInfo = null;
    try {
      downloadedInfo = await driveService.downloadFile(driveLinkOrId);
    } catch (dlErr) {
      throw new Error(`Failed to download Google Drive asset (${driveLinkOrId}): ${dlErr.message}`);
    }

    const { filePath, fileName, mimeType, isVideo, isImage } = downloadedInfo;
    
    // Inspect actual MIME type & file binary to determine if image or video
    let mediaType = "unknown";
    const cleanMime = String(mimeType || "").toLowerCase();
    const cleanExt = path.extname(fileName || filePath || "").toLowerCase();

    if (cleanMime.startsWith("video/") || isVideo || [".mp4", ".mov", ".avi", ".webm", ".m4v"].includes(cleanExt)) {
      mediaType = "video";
    } else if (cleanMime.startsWith("image/") || isImage || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(cleanExt)) {
      mediaType = "image";
    } else {
      // Binary header magic byte check
      try {
        if (fs.existsSync(filePath)) {
          const buffer = Buffer.alloc(12);
          const fd = fs.openSync(filePath, "r");
          fs.readSync(fd, buffer, 0, 12, 0);
          fs.closeSync(fd);

          // Check PNG magic bytes: 89 50 4E 47
          // Check JPEG magic bytes: FF D8 FF
          if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
            mediaType = "image";
          } else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
            mediaType = "image";
          } else if (buffer.toString("utf8", 4, 8) === "ftyp" || buffer.toString("utf8", 4, 11) === "ftypmp4") {
            mediaType = "video";
          } else {
            mediaType = "video"; // default fallback for media assets
          }
        }
      } catch (bErr) {
        mediaType = isVideo ? "video" : "image";
      }
    }

    return {
      driveUrl: driveLinkOrId,
      fileId,
      filePath,
      fileName,
      mimeType,
      fileSize: downloadedInfo.fileSize,
      mediaType, // "image" or "video"
    };
  }

  /**
   * Resolve all media assets for a given spreadsheet row
   */
  static async resolveRowMediaAssets(rowValues = {}) {
    const urls = this.extractRowDriveUrls(rowValues);
    if (urls.length === 0) {
      return [];
    }

    const resolvedAssets = [];
    for (const url of urls) {
      try {
        const asset = await this.resolveAndDetectAsset(url);
        resolvedAssets.push(asset);
      } catch (err) {
        console.warn(`[MediaAssetResolver] Skipping inaccessible asset "${url}":`, err.message);
        resolvedAssets.push({
          driveUrl: url,
          error: err.message,
          mediaType: "invalid",
        });
      }
    }

    return resolvedAssets;
  }
}

export default MediaAssetResolver;
