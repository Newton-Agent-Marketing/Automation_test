import fs from "fs";
import path from "path";
import axios from "axios";
import googleOAuth from "../auth/googleOAuth.js";

class DriveService {
  constructor() {
    this.scratchDir = process.env.SCRATCH_DIR
      ? path.resolve(process.cwd(), process.env.SCRATCH_DIR)
      : path.resolve(process.cwd(), "scratch");
    this.ensureScratchDir();
  }

  ensureScratchDir() {
    if (!fs.existsSync(this.scratchDir)) {
      try {
        fs.mkdirSync(this.scratchDir, { recursive: true });
      } catch (err) {
        console.error(`[DriveService] Failed to create scratch directory: ${err.message}`);
      }
    }
  }

  /**
   * Extract file ID or folder ID from various Google Drive URL formats
   */
  extractFileId(driveLinkOrId) {
    if (!driveLinkOrId || typeof driveLinkOrId !== "string") return null;
    const trimmed = driveLinkOrId.trim();

    // Raw ID (25 to 60 alphanumeric/dash/underscore chars)
    if (/^[a-zA-Z0-9_-]{25,60}$/.test(trimmed)) {
      return trimmed;
    }

    // Standard /file/d/<id>/
    const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{25,60})/);
    if (fileDMatch) return fileDMatch[1];

    // Direct /d/<id>/
    const directDMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]{25,60})/);
    if (directDMatch) return directDMatch[1];

    // Folders: /folders/<id>
    const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{25,60})/);
    if (folderMatch) return folderMatch[1];

    // Query param: ?id=<id> or &id=<id>
    const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{25,60})/);
    if (idParamMatch) return idParamMatch[1];

    // Open URL format: open?id=<id>
    const openMatch = trimmed.match(/open\?id=([a-zA-Z0-9_-]{25,60})/);
    if (openMatch) return openMatch[1];

    return null;
  }

  /**
   * Resolve Google Drive File ID from direct ID, URL, or exact filename match ONLY.
   * Fuzzy text searching is disabled to prevent cross-row asset mismatch.
   */
  async resolveFileId(driveLinkOrId, expectedMediaType = null) {
    if (!driveLinkOrId || typeof driveLinkOrId !== "string") return null;
    const directId = this.extractFileId(driveLinkOrId);
    if (directId) return directId;

    const cleanFilename = driveLinkOrId.trim();
    if (!cleanFilename) return null;

    const targetType = expectedMediaType ? String(expectedMediaType).trim().toLowerCase() : null;
    const isTargetImage = targetType ? targetType.includes("image") || targetType.includes("static") || targetType.includes("photo") : false;
    const isTargetVideo = targetType ? targetType.includes("video") || targetType.includes("mp4") || targetType.includes("reel") : false;

    const matchesExpectedType = (mimeType, name) => {
      if (!isTargetImage && !isTargetVideo) return true;
      const m = String(mimeType || "").toLowerCase();
      const n = String(name || "").toLowerCase();
      if (isTargetImage) {
        return m.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(n);
      }
      if (isTargetVideo) {
        return m.startsWith("video/") || /\.(mp4|mov|avi|webm|m4v|mkv)($|\?)/i.test(n);
      }
      return true;
    };

    try {
      const auth = await googleOAuth.getAuthenticatedClient();

      // Try exact filename match ONLY (with and without common media extensions)
      const mediaExtensions = ["", ".mp4", ".mov", ".png", ".jpg", ".jpeg", ".webm", ".avi", ".gif", ".webp"];
      for (const ext of mediaExtensions) {
        try {
          const testName = (ext && !cleanFilename.toLowerCase().endsWith(ext)) ? `${cleanFilename}${ext}` : cleanFilename;
          const safeName = testName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          const exactQ = `trashed = false and name = '${safeName}'`;
          const res = await auth.axiosInstance.get("https://www.googleapis.com/drive/v3/files", {
            params: {
              q: exactQ,
              fields: "files(id, name, mimeType)",
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
            },
          });
          const matched = (res.data?.files || []).find((f) => matchesExpectedType(f.mimeType, f.name));
          if (matched) {
            console.log(`[DriveService] Strategy: EXACT_NAME_MATCH | Filename "${cleanFilename}" -> "${matched.name}" (File ID: ${matched.id})`);
            return matched.id;
          }
        } catch (e1) {}
      }

      // Exact normalized name match
      const listRes = await auth.axiosInstance.get("https://www.googleapis.com/drive/v3/files", {
        params: {
          q: "trashed = false",
          pageSize: 500,
          fields: "files(id, name, mimeType)",
          orderBy: "modifiedTime desc",
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        },
      });

      const files = (listRes.data?.files || []).filter((f) => {
        const m = String(f.mimeType || "").toLowerCase();
        const isMedia = !m.includes("spreadsheet") && !m.includes("folder") && !m.includes("document") && !m.includes("presentation");
        return isMedia && matchesExpectedType(f.mimeType, f.name);
      });
      const normSearch = cleanFilename.toLowerCase().replace(/[^a-z0-9]/g, "");

      for (const file of files) {
        const normFileName = file.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normFileBase = file.name.replace(/\.[a-zA-Z0-9]+$/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (normFileName === normSearch || normFileBase === normSearch) {
          console.log(`[DriveService] Strategy: EXACT_NAME_MATCH (Normalized) | Filename "${cleanFilename}" -> "${file.name}" (File ID: ${file.id})`);
          return file.id;
        }
      }
    } catch (err) {
      console.warn(`[DriveService] Exact filename resolution notice for "${cleanFilename}":`, err.message);
    }

    // Strict Rule: No fuzzy keyword fallback!
    return null;
  }

  /**
   * Resolve a Google Drive folder by URL, direct folder ID, or exact folder name ONLY.
   * Resolution priority:
   * 1. Extract direct file or folder ID from URL or Smart Chip metadata (EXACT_ID).
   * 2. Search Drive for exact folder name match (EXACT_NAME_MATCH).
   * 3. If no direct ID or exact folder match exists -> Return null. Fuzzy searching is disabled.
   */
  async resolveFolder(driveLinkOrId) {
    if (!driveLinkOrId || typeof driveLinkOrId !== "string") return null;
    const cleanInput = driveLinkOrId.trim();
    if (!cleanInput) return null;

    // Fast check: If input is explicitly an individual file link (e.g. /file/d/), it is NOT a folder
    if (cleanInput.includes("/file/d/") || cleanInput.includes("open?id=") || cleanInput.includes("uc?id=")) {
      return null;
    }

    console.log(`\n🔍 [DriveService Diagnostics] Resolving folder for input: "${cleanInput}"`);

    // 1. Priority 1: Extract direct folder ID (from URL, hyperlink, or raw ID)
    const directId = this.extractFileId(cleanInput);
    if (directId) {
      try {
        const meta = await this.getFileMetadata(directId);
        if (meta?.mimeType === "application/vnd.google-apps.folder") {
          console.log(`📂 [DriveService] Strategy: EXACT_ID | Extracted Direct Folder ID "${directId}" ("${meta.name}")`);
          return { id: directId, name: meta.name, resolutionType: "EXACT_ID" };
        }
        if (meta?.mimeType === "application/vnd.google-apps.shortcut") {
          const targetMeta = await this.getFileMetadata(meta.shortcutDetails?.targetId || directId);
          if (targetMeta?.mimeType === "application/vnd.google-apps.folder") {
            console.log(`📂 [DriveService] Strategy: EXACT_ID_SHORTCUT | Direct Shortcut Target Folder ID "${targetMeta.id}" ("${targetMeta.name}")`);
            return { id: targetMeta.id, name: targetMeta.name || meta.name, resolutionType: "EXACT_ID_SHORTCUT" };
          }
        }
        // Direct ID was verified and is an individual file (not a folder)
        if (meta && meta.mimeType && meta.mimeType !== "application/vnd.google-apps.folder") {
          console.log(`ℹ️ [DriveService] Direct ID "${directId}" is an individual file (MIME: ${meta.mimeType}, Name: "${meta.name}"), not a folder.`);
          return null;
        }
      } catch (e) {
        console.warn(`[DriveService] Metadata lookup for direct ID "${directId}" notice:`, e.message);
      }
    }

    // Do NOT search by folder name if cleanInput is a web URL
    if (cleanInput.startsWith("http://") || cleanInput.startsWith("https://")) {
      return null;
    }

    try {
      const auth = await googleOAuth.getAuthenticatedClient();

      // 2. Priority 2: Exact Folder Name Match (search API query)
      const safeName = cleanInput.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const exactQ = `trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${safeName}'`;
      const resExact = await auth.axiosInstance.get("https://www.googleapis.com/drive/v3/files", {
        params: {
          q: exactQ,
          fields: "files(id, name, mimeType, parents, createdTime, modifiedTime)",
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        },
      });
      const exactFolders = resExact.data?.files || [];
      if (exactFolders.length === 1) {
        console.log(`📂 [DriveService] Strategy: EXACT_NAME_MATCH | Matched exact folder "${exactFolders[0].name}" (Folder ID: ${exactFolders[0].id})`);
        return { id: exactFolders[0].id, name: exactFolders[0].name, resolutionType: "EXACT_NAME_MATCH" };
      }
      if (exactFolders.length > 1) {
        const ambiguityMsg = `Ambiguous Folder Match: Multiple Google Drive folders matched exact name "${cleanInput}": ${exactFolders.map(f => `"${f.name}" (${f.id})`).join(", ")}. Please clarify which folder to use.`;
        console.warn(`⚠️ [DriveService Ambiguity] ${ambiguityMsg}`);
        throw new Error(ambiguityMsg);
      }

      // Priority 2b: Search all accessible folders in user's Drive scope for exact normalized match
      let pageToken = null;
      let allFolders = [];
      do {
        const resFolders = await auth.axiosInstance.get("https://www.googleapis.com/drive/v3/files", {
          params: {
            q: "trashed = false and mimeType = 'application/vnd.google-apps.folder'",
            fields: "nextPageToken, files(id, name, mimeType, parents, createdTime, modifiedTime)",
            pageSize: 500,
            pageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          },
        });
        allFolders = allFolders.concat(resFolders.data?.files || []);
        pageToken = resFolders.data?.nextPageToken;
      } while (pageToken);

      const normTarget = cleanInput.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normMatches = allFolders.filter((f) => f.name.toLowerCase().replace(/[^a-z0-9]/g, "") === normTarget);
      if (normMatches.length === 1) {
        console.log(`📂 [DriveService] Strategy: EXACT_NAME_MATCH (Normalized) | Matched folder "${normMatches[0].name}" (Folder ID: ${normMatches[0].id})`);
        return { id: normMatches[0].id, name: normMatches[0].name, resolutionType: "EXACT_NAME_MATCH" };
      }
      if (normMatches.length > 1) {
        const ambiguityMsg = `Ambiguous Folder Match: Multiple Google Drive folders matched normalized name "${cleanInput}": ${normMatches.map(f => `"${f.name}" (${f.id})`).join(", ")}.`;
        console.warn(`⚠️ [DriveService Ambiguity] ${ambiguityMsg}`);
        throw new Error(ambiguityMsg);
      }

      console.warn(`❌ [DriveService] Resolution Result: UNRESOLVED | No direct ID or exact Google Drive folder match found for folder name "${cleanInput}". Loose fuzzy searching disabled.`);
    } catch (err) {
      if (err.message.includes("Ambiguous Folder Match")) throw err;
      console.warn(`[DriveService] Folder resolution notice for "${cleanInput}":`, err.message);
    }

    // Strict Rule: Return null if no exact direct ID or exact folder name matches
    return null;
  }

  /**
   * Fast validation check for Google Drive link or ID
   */
  async validateDriveLink(driveLinkOrId) {
    let fileId = this.extractFileId(driveLinkOrId);
    if (!fileId) {
      fileId = await this.resolveFileId(driveLinkOrId);
    }
    if (!fileId) {
      return {
        valid: false,
        message: "Invalid Google Drive link format. Please provide a valid file or folder link.",
      };
    }

    // Try authenticated metadata check first if OAuth is connected
    try {
      const auth = await googleOAuth.getAuthenticatedClient();
      const metaRes = await auth.axiosInstance.get(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,webViewLink,thumbnailLink&supportsAllDrives=true`
      );
      if (metaRes.data?.id) {
        return {
          valid: true,
          fileId,
          name: metaRes.data.name,
          mimeType: metaRes.data.mimeType,
          size: metaRes.data.size,
          webViewLink: metaRes.data.webViewLink,
          thumbnailLink: metaRes.data.thumbnailLink,
          message: `Google Drive asset "${metaRes.data.name}" verified via OAuth API.`,
        };
      }
    } catch (authErr) {
      // Fall back to unauthenticated public verification
    }

    const testUrl = `https://drive.google.com/file/d/${fileId}/view`;
    try {
      const res = await axios.get(testUrl, {
        timeout: 10000,
        validateStatus: () => true,
        maxRedirects: 5,
      });

      if (res.status === 404) {
        return {
          valid: false,
          fileId,
          message: "Google Drive asset not found (404). Check if the file was deleted or permissions are restricted.",
        };
      }

      return {
        valid: true,
        fileId,
        message: `Google Drive file ID (${fileId}) detected and verified.`,
      };
    } catch (err) {
      return {
        valid: true,
        fileId,
        message: `Google Drive file ID (${fileId}) parsed successfully.`,
      };
    }
  }

  /**
   * Fetch file metadata from Google Drive API
   */
  async getFileMetadata(fileIdOrUrl) {
    let fileId = this.extractFileId(fileIdOrUrl);
    if (!fileId) {
      fileId = await this.resolveFileId(fileIdOrUrl);
    }
    if (!fileId) throw new Error("Invalid Google Drive file ID or URL");

    const auth = await googleOAuth.getAuthenticatedClient();
    const res = await auth.axiosInstance.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,webViewLink,webContentLink,thumbnailLink,modifiedTime,parents&supportsAllDrives=true`
    );
    return res.data;
  }

  /**
   * List contents of a Google Drive folder and categorize items into image vs video
   */
  async listFolderContents(folderId) {
    const cleanId = this.extractFileId(folderId) || folderId;
    const { files } = await this.listFiles({ folderId: cleanId, pageSize: 100, recursive: true });
    return (files || []).map((f) => {
      const m = String(f.mimeType || "").toLowerCase();
      const n = String(f.name || "").toLowerCase();
      const isImage = m.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(n);
      const isVideo = m.startsWith("video/") || /\.(mp4|mov|avi|webm|m4v|mkv)($|\?)/i.test(n);
      return {
        fileId: f.id,
        id: f.id,
        name: f.name,
        fileName: f.name,
        mimeType: f.mimeType,
        size: f.size,
        fileSize: f.size,
        type: isVideo ? "VIDEO" : isImage ? "IMAGE" : "UNKNOWN",
        isImage,
        isVideo,
        url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
        webViewLink: f.webViewLink,
      };
    });
  }

  /**
   * List files in user's Drive or inside a specified folder, with pagination & recursive subfolder traversal.
   */
  async listFiles({ folderId = null, query = "", pageSize = 100, pageToken = null, recursive = true, maxDepth = 3, currentDepth = 0, visitedFolderIds = new Set() } = {}) {
    const auth = await googleOAuth.getAuthenticatedClient();
    let q = "trashed = false";

    if (folderId) {
      const cleanFolderId = this.extractFileId(folderId) || folderId;
      q += ` and '${cleanFolderId}' in parents`;
      visitedFolderIds.add(cleanFolderId);
    }

    if (query) {
      q += ` and (name contains '${query.replace(/'/g, "\\'")}' or fullText contains '${query.replace(/'/g, "\\'")}')`;
    }

    const allFiles = [];
    let currentPageToken = pageToken;
    let pageCount = 0;

    do {
      pageCount++;
      const params = {
        q,
        pageSize: Math.min(pageSize, 200),
        fields: "nextPageToken, files(id, name, mimeType, size, webViewLink, thumbnailLink, createdTime, modifiedTime, iconLink, shortcutDetails, parents, trashed)",
        orderBy: "modifiedTime desc",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      };

      if (currentPageToken) params.pageToken = currentPageToken;

      const res = await auth.axiosInstance.get("https://www.googleapis.com/drive/v3/files", { params });
      const rawFiles = res.data?.files || [];
      currentPageToken = res.data?.nextPageToken || null;

      for (const f of rawFiles) {
        // Resolve Shortcut
        if (f.mimeType === "application/vnd.google-apps.shortcut" && f.shortcutDetails?.targetId) {
          try {
            const targetMeta = await this.getFileMetadata(f.shortcutDetails.targetId);
            if (targetMeta) {
              allFiles.push({
                ...f,
                id: targetMeta.id,
                name: targetMeta.name || f.name,
                mimeType: targetMeta.mimeType || f.mimeType,
                size: targetMeta.size || f.size,
                isShortcutResolved: true,
              });
              continue;
            }
          } catch (sErr) {
            console.warn(`[DriveService] Shortcut target (${f.shortcutDetails.targetId}) inaccessible:`, sErr.message);
            continue;
          }
        }
        allFiles.push(f);
      }
    } while (currentPageToken);

    console.log(`[DriveService Diagnostics] listFiles for folder "${folderId}": Fetched ${allFiles.length} item(s) across ${pageCount} page(s).`);

    // Recursive subfolder inspection if enabled
    let expandedFiles = [];
    for (const item of allFiles) {
      if (item.mimeType === "application/vnd.google-apps.folder") {
        if (recursive && currentDepth < maxDepth && !visitedFolderIds.has(item.id)) {
          console.log(`📂 [DriveService] Inspecting subfolder "${item.name}" (ID: ${item.id}) at depth ${currentDepth + 1}...`);
          try {
            const subRes = await this.listFiles({
              folderId: item.id,
              pageSize,
              recursive,
              maxDepth,
              currentDepth: currentDepth + 1,
              visitedFolderIds,
            });
            expandedFiles = expandedFiles.concat(subRes.files || []);
          } catch (subErr) {
            console.warn(`[DriveService] Subfolder inspection notice for "${item.name}":`, subErr.message);
          }
        } else {
          expandedFiles.push(item);
        }
      } else {
        expandedFiles.push(item);
      }
    }

    return {
      files: expandedFiles,
      nextPageToken: null,
      pageCount,
    };
  }

  /**
   * Process a Google Drive link/ID, handling direct image files, video files, OR folders containing multiple files.
   * Returns: { isFolder: boolean, folderId: string|null, folderName: string|null, assets: Array<{ filePath, fileName, fileSize, mimeType, isImage, isVideo, fileId }> }
   */
  async processDriveLink(driveLinkOrId, expectedMediaType = null, userInstruction = "") {
    if (!driveLinkOrId || typeof driveLinkOrId !== "string") {
      return { isFolder: false, folderId: null, folderName: null, assets: [] };
    }

    const cleanInput = driveLinkOrId.trim();
    console.log(`\n[DriveService Diagnostics] Processing Drive Link / Cell Value: "${cleanInput}" | Target Media: ${expectedMediaType || "ALL"} | Instruction: "${userInstruction || "N/A"}"`);

    // Priority 1: Check for direct File/Folder ID from URL, hyperlink, or raw ID
    const directId = this.extractFileId(cleanInput);
    if (directId) {
      let meta = null;
      try {
        meta = await this.getFileMetadata(directId);
      } catch (mErr) {
        console.warn(`[DriveService] Metadata fetch for direct ID "${directId}" notice:`, mErr.message);
      }

      const isFolderMime = meta?.mimeType === "application/vnd.google-apps.folder";
      let isShortcutToFolder = false;
      if (meta?.mimeType === "application/vnd.google-apps.shortcut" && meta.shortcutDetails?.targetId) {
        try {
          const targetMeta = await this.getFileMetadata(meta.shortcutDetails.targetId);
          isShortcutToFolder = targetMeta?.mimeType === "application/vnd.google-apps.folder";
        } catch (sErr) {}
      }

      const isExplicitFolderUrl = cleanInput.includes("/folders/");
      const isFolder = isFolderMime || isShortcutToFolder || isExplicitFolderUrl;

      // --- BRANCH A: FOLDER RESOLUTION ---
      if (isFolder) {
        const folderId = directId;
        const folderName = meta?.name || "Google Drive Folder";
        const folderObj = {
          id: folderId,
          name: folderName,
          resolutionType: isFolderMime ? "EXACT_ID_FOLDER" : isShortcutToFolder ? "EXACT_ID_SHORTCUT" : "EXACT_ID_URL",
        };
        return await this._processFolderContents(folderObj, expectedMediaType, userInstruction);
      }

      // --- BRANCH B: DIRECT INDIVIDUAL FILE RESOLUTION ---
      const fileName = meta?.name || null;
      const mimeType = meta?.mimeType || "application/octet-stream";
      console.log(`🎬 [DriveService Diagnostics] Identified Direct Individual File: "${fileName || directId}" (ID: ${directId}, MIME: ${mimeType}). Downloading...`);

      const downloaded = await this.downloadFile(directId, fileName);
      if (!downloaded || !downloaded.filePath || !fs.existsSync(downloaded.filePath)) {
        throw new Error(`Failed to download file "${fileName || directId}" (${directId}) from Google Drive.`);
      }

      const stats = fs.statSync(downloaded.filePath);
      if (stats.size === 0) {
        throw new Error(`Downloaded file "${fileName || directId}" (${directId}) is empty (0 bytes).`);
      }

      const magic = this.inspectFileMagicBytes(downloaded.filePath);
      const isImage = magic.isImage || downloaded.isImage || mimeType.startsWith("image/");
      const isVideo = magic.isVideo || downloaded.isVideo || mimeType.startsWith("video/");

      if (!isImage && !isVideo) {
        throw new Error(`Downloaded file "${fileName || directId}" (${directId}) does not match a supported media type (image or video).`);
      }

      console.log(`✅ [DriveService Diagnostics] Direct File Resolution & Download: SUCCESS | File: "${downloaded.fileName}" | Size: ${(downloaded.fileSize / 1024 / 1024).toFixed(2)} MB | Type: ${isVideo ? "🎬 Video" : "🖼️ Image"}`);

      return {
        isFolder: false,
        folderId: null,
        folderName: null,
        fileId: directId,
        fileName: downloaded.fileName,
        fileSize: downloaded.fileSize,
        mimeType: downloaded.mimeType,
        isVideo,
        isImage,
        resolutionType: "EXACT_ID_FILE",
        resolutionStatus: "SUCCESS",
        assets: [downloaded],
      };
    }

    // Priority 2: Not a URL or raw ID -> input is a textual folder name or filename (Smart Chip text, label)
    // 2A: Try folder resolution by exact name
    let folderObj = await this.resolveFolder(cleanInput);
    if (folderObj) {
      return await this._processFolderContents(folderObj, expectedMediaType, userInstruction);
    }

    // 2B: Try file resolution by exact filename
    const fileId = await this.resolveFileId(cleanInput, expectedMediaType);
    if (fileId) {
      let meta = null;
      try {
        meta = await this.getFileMetadata(fileId);
      } catch (e) {}
      const downloaded = await this.downloadFile(fileId, meta?.name);
      return {
        isFolder: false,
        folderId: null,
        folderName: null,
        fileId,
        fileName: downloaded.fileName,
        fileSize: downloaded.fileSize,
        mimeType: downloaded.mimeType,
        isVideo: downloaded.isVideo,
        isImage: downloaded.isImage,
        resolutionType: "EXACT_NAME_MATCH_FILE",
        resolutionStatus: "SUCCESS",
        assets: [downloaded],
      };
    }

    throw new Error(`Invalid Google Drive link, folder ID, or Smart Chip filename: ${cleanInput}`);
  }

  /**
   * Internal helper: Process contents of a resolved Google Drive folder
   */
  async _processFolderContents(folderObj, expectedMediaType = null, userInstruction = "") {
    const folderId = folderObj.id;
    const folderName = folderObj.name;
    console.log(`📂 [DriveService Diagnostics] Processing Resolved Folder "${folderName}" (ID: ${folderId}) via ${folderObj.resolutionType || "RESOLVER"}. Listing contents...`);
    
    const { files } = await this.listFiles({ folderId, pageSize: 100, recursive: true });
    if (!files || files.length === 0) {
      throw new Error(`Google Drive folder "${folderName}" (${folderId}) is empty or inaccessible.`);
    }

    // Classify files into images vs videos vs subfolders/unsupported
    const classifiedFiles = files.map((f) => {
      const m = String(f.mimeType || "").toLowerCase();
      const n = String(f.name || "").toLowerCase();
      const isImage = m.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(n);
      const isVideo = m.startsWith("video/") || /\.(mp4|mov|avi|webm|m4v|mkv)($|\?)/i.test(n);
      return { ...f, isImage, isVideo };
    });

    const imageFiles = classifiedFiles.filter(f => f.isImage);
    const videoFiles = classifiedFiles.filter(f => f.isVideo);
    const unsupportedFiles = classifiedFiles.filter(f => !f.isImage && !f.isVideo);

    console.log(`[DriveService Diagnostics] Folder "${folderName}" Content Classification:`);
    console.log(`   - Total Items Found: ${classifiedFiles.length}`);
    console.log(`   - Images Count     : ${imageFiles.length}`);
    console.log(`   - Videos Count     : ${videoFiles.length}`);
    console.log(`   - Unsupported Count: ${unsupportedFiles.length}`);

    classifiedFiles.forEach(f => {
      console.log(`     * Item "${f.name}" (ID: ${f.id}) | MIME: ${f.mimeType} | Decision: ${f.isImage ? "IMAGE" : f.isVideo ? "VIDEO" : "SKIP"}`);
    });

    const reqTypeStr = expectedMediaType ? String(expectedMediaType).toLowerCase() : "";
    const isTargetImageReq = reqTypeStr.includes("image") || reqTypeStr.includes("static") || reqTypeStr.includes("photo");
    const isTargetVideoReq = reqTypeStr.includes("video") || reqTypeStr.includes("mp4") || reqTypeStr.includes("reel");

    let eligibleFiles = [];
    if (isTargetImageReq && !isTargetVideoReq) {
      eligibleFiles = imageFiles;
      if (eligibleFiles.length === 0) {
        throw new Error(`No supported image files (JPEG, PNG, WebP) found inside Google Drive folder "${folderName}" (${folderId}). Total files scanned: ${classifiedFiles.length} (Videos: ${videoFiles.length}, Unsupported: ${unsupportedFiles.length}).`);
      }
    } else if (isTargetVideoReq && !isTargetImageReq) {
      eligibleFiles = videoFiles;
      if (eligibleFiles.length === 0) {
        throw new Error(`No supported video files (MP4, MOV, WebM) found inside Google Drive folder "${folderName}" (${folderId}). Total files scanned: ${classifiedFiles.length} (Images: ${imageFiles.length}, Unsupported: ${unsupportedFiles.length}).`);
      }
    } else {
      eligibleFiles = classifiedFiles.filter(f => f.isImage || f.isVideo);
      if (eligibleFiles.length === 0) {
        throw new Error(`No supported image or video files found inside Google Drive folder "${folderName}" (${folderId}). Total files scanned: ${classifiedFiles.length}.`);
      }
    }

    // Selection Policy based on user instruction / request count
    let selectedFiles = [];
    const instLower = (userInstruction || "").toLowerCase();

    if (instLower.includes("all images") || instLower.includes("all creatives") || instLower.includes("process all") || instLower.includes("upload all")) {
      selectedFiles = eligibleFiles;
    } else if (instLower.includes("2 images") || instLower.includes("two images") || instLower.includes("both images")) {
      if (eligibleFiles.length < 2) {
        console.warn(`[DriveService Warning] User requested 2 images, but folder "${folderName}" contains only ${eligibleFiles.length} valid image(s). Processing available images.`);
      }
      selectedFiles = eligibleFiles.slice(0, 2);
    } else {
      // Default: Select 1 verified image/media file
      const preferred = eligibleFiles.find((f) => {
        const n = f.name.toLowerCase();
        return n.includes("1200x1200") || n.includes("square") || n.includes("1:1") || n.includes("main") || n.includes("feed");
      });
      selectedFiles = [preferred || eligibleFiles[0]];
    }

    console.log(`📂 [DriveService Diagnostics] Selected ${selectedFiles.length} asset(s) from folder "${folderName}":`, selectedFiles.map(f => `"${f.name}" (${f.id})`));

    const downloadedAssets = [];
    for (const file of selectedFiles) {
      try {
        const dl = await this.downloadFile(file.id, file.name);
        const magic = this.inspectFileMagicBytes(dl.filePath);

        console.log(`[DriveService Diagnostics] Downloaded & Validated "${file.name}" (ID: ${file.id}):`);
        console.log(`   - Saved File Path  : ${dl.filePath}`);
        console.log(`   - File Size        : ${(dl.fileSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   - MIME Type        : ${dl.mimeType}`);
        console.log(`   - Magic Byte Format: ${magic.format || "unknown"}`);
        console.log(`   - Download Source  : ${dl.source}`);

        if (isTargetImageReq && !magic.isImage && !dl.isImage) {
          throw new Error(`Downloaded file "${file.name}" is not a valid image file.`);
        }
        downloadedAssets.push(dl);
      } catch (dlErr) {
        console.warn(`[DriveService] Warning downloading folder file ${file.name} (${file.id}):`, dlErr.message);
      }
    }

    if (downloadedAssets.length === 0) {
      throw new Error(`Failed to download any valid creative assets from Google Drive folder "${folderName}" (${folderId}).`);
    }

    return {
      isFolder: true,
      folderId,
      folderName,
      resolutionType: folderObj.resolutionType || "RESOLVED_FOLDER",
      resolutionStatus: "SUCCESS",
      assets: downloadedAssets,
    };
  }

  /**
   * Download a file from Google Drive into scratch/ directory
   */
  async downloadFile(driveLinkOrId, destinationFilename = null, expectedMediaType = null) {
    // If input is explicitly a Google Drive folder link, delegate to processDriveLink
    if (typeof driveLinkOrId === "string" && driveLinkOrId.includes("/folders/")) {
      console.log(`[DriveService] downloadFile: Detected folder URL "${driveLinkOrId}". Resolving media asset via processDriveLink (expectedMediaType: ${expectedMediaType || "ALL"})...`);
      const folderRes = await this.processDriveLink(driveLinkOrId, expectedMediaType);
      if (folderRes?.assets && folderRes.assets.length > 0) {
        return folderRes.assets[0];
      }
      throw new Error(`Google Drive folder contains no accessible image or video files.`);
    }

    let fileId = this.extractFileId(driveLinkOrId);
    if (!fileId) {
      fileId = await this.resolveFileId(driveLinkOrId);
    }
    if (!fileId) {
      throw new Error(`Invalid Google Drive link, file ID, or Smart Chip filename: ${driveLinkOrId}`);
    }

    this.ensureScratchDir();

    // Check if we already have a cached copy of this file in scratch/
    try {
      const existingFiles = fs.readdirSync(this.scratchDir);
      const matched = existingFiles.find(
        (f) => f.startsWith(`${fileId}_`) || f.includes(fileId.substring(0, 10)) || (destinationFilename && f === destinationFilename)
      );
      if (matched) {
        const cachedPath = path.join(this.scratchDir, matched);
        const stats = fs.statSync(cachedPath);
        if (stats.size > 1024) {
          const magic = this.inspectFileMagicBytes(cachedPath);
          let isImage = magic.isImage;
          let isVideo = magic.isVideo;
          if (!isImage && !isVideo) {
            isVideo = /\.(mp4|mov|avi|webm|m4v|mkv)$/i.test(matched);
            isImage = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(matched);
          }
          if (magic.isImage) {
            isImage = true;
            isVideo = false;
          } else if (magic.isVideo) {
            isVideo = true;
            isImage = false;
          }
          console.log(`[DriveService] Using existing cached asset for fileId ${fileId} (${(stats.size / 1024 / 1024).toFixed(1)}MB) - Verified Type: ${isImage ? "🖼️ Image" : isVideo ? "🎬 Video" : "Unknown"}`);
          return {
            filePath: cachedPath,
            fileName: matched,
            fileSize: stats.size,
            mimeType: isImage ? "image/png" : isVideo ? "video/mp4" : "application/octet-stream",
            isVideo,
            isImage,
            fileId,
            source: "local_cache",
          };
        }
      }
    } catch (cErr) {
      // ignore cache check errors
    }

    let filename = destinationFilename;
    let mimeType = "application/octet-stream";

    // Attempt 1: Authenticated API download
    try {
      const auth = await googleOAuth.getAuthenticatedClient();
      let meta = {};
      try {
        const metaRes = await auth.axiosInstance.get(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`
        );
        meta = metaRes.data || {};
        if (meta.mimeType === "application/vnd.google-apps.folder") {
          console.log(`[DriveService] downloadFile: File ID "${fileId}" is a folder. Resolving media asset via processDriveLink...`);
          const folderRes = await this.processDriveLink(fileId);
          if (folderRes?.assets && folderRes.assets.length > 0) {
            return folderRes.assets[0];
          }
          throw new Error(`Google Drive folder "${meta.name || fileId}" contains no accessible image or video files.`);
        }
        if (!filename && meta.name) {
          filename = meta.name;
        }
        if (meta.mimeType) {
          mimeType = meta.mimeType;
        }
      } catch (mErr) {
        if (mErr.message.includes("contains no accessible")) throw mErr;
        console.warn("[DriveService] Metadata fetch warning:", mErr.message);
      }

      if (!filename) {
        const ext = mimeType.includes("video") ? ".mp4" : mimeType.includes("image") ? ".jpg" : "";
        filename = `drive_asset_${Date.now()}_${fileId.substring(0, 8)}${ext}`;
      }

      // Prefix filename with fileId to guarantee 100% isolation across rows and campaigns
      const safeBasename = filename.startsWith(`${fileId}_`) ? filename : `${fileId}_${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const savePath = path.join(this.scratchDir, safeBasename);

      const streamRes = await auth.axiosInstance.get(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          responseType: "stream",
          timeout: 300000,
        }
      );

      const writer = fs.createWriteStream(savePath);
      streamRes.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      const stats = fs.statSync(savePath);
      const magic = this.inspectFileMagicBytes(savePath);
      let isImage = magic.isImage;
      let isVideo = magic.isVideo;

      if (!isImage && !isVideo) {
        isVideo = mimeType.startsWith("video/") || /\.(mp4|mov|avi|webm|m4v|mkv)$/i.test(filename);
        isImage = mimeType.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(filename);
      }
      if (magic.isImage) {
        isImage = true;
        isVideo = false;
      } else if (magic.isVideo) {
        isVideo = true;
        isImage = false;
      }

      let finalPath = savePath;
      if (magic.isImage && !/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(filename)) {
        const ext = magic.format ? `.${magic.format}` : ".png";
        finalPath = `${savePath}${ext}`;
        try { fs.renameSync(savePath, finalPath); } catch (e) {}
      } else if (magic.isVideo && !/\.(mp4|mov|avi|webm|m4v|mkv)$/i.test(filename)) {
        finalPath = `${savePath}.mp4`;
        try { fs.renameSync(savePath, finalPath); } catch (e) {}
      }

      return {
        filePath: finalPath,
        fileName: path.basename(finalPath),
        fileSize: stats.size,
        mimeType: isImage ? "image/png" : isVideo ? "video/mp4" : mimeType,
        isVideo,
        isImage,
        fileId,
        source: "oauth_authenticated",
      };
    } catch (authDownloadErr) {
      console.warn("[DriveService] Authenticated download skipped/failed, attempting public fallback:", authDownloadErr.message);
    }

    // Attempt 2: Public download fallback
    const fallbackFilename = filename || `drive_asset_${Date.now()}_${fileId.substring(0, 8)}`;
    const fallbackPath = path.join(this.scratchDir, fallbackFilename);

    try {
      const initialUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
      let res = await axios.get(initialUrl, {
        maxRedirects: 5,
        timeout: 45000,
        validateStatus: () => true,
        responseType: "arraybuffer",
      });

      const contentType = res.headers["content-type"] || "";
      const isHtmlResponse = contentType.includes("text/html");

      if (isHtmlResponse) {
        const htmlText = Buffer.from(res.data).toString("utf8");

        if (
          htmlText.includes("download-form") ||
          htmlText.includes("uc-download-link") ||
          htmlText.includes("confirm=")
        ) {
          const confirmMatch =
            htmlText.match(/name="confirm"\s+value="([^"]+)"/i) ||
            htmlText.match(/confirm=([^&"]+)/i);
          const uuidMatch =
            htmlText.match(/name="uuid"\s+value="([^"]+)"/i) ||
            htmlText.match(/uuid=([^&"]+)/i);
          const confirmVal = confirmMatch ? confirmMatch[1] : "t";
          const uuidVal = uuidMatch ? uuidMatch[1] : "";

          const cookies = res.headers["set-cookie"] || [];
          const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ");

          let confirmUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmVal}`;
          if (uuidVal) confirmUrl += `&uuid=${uuidVal}`;

          const streamRes = await axios.get(confirmUrl, {
            headers: cookieHeader ? { Cookie: cookieHeader } : {},
            responseType: "stream",
            timeout: 300000,
          });

          const tempPath = `${fallbackPath}.tmp`;
          const writer = fs.createWriteStream(tempPath);
          streamRes.data.pipe(writer);
          await new Promise((resolve, reject) => {
            writer.on("finish", () => {
              try {
                if (fs.existsSync(fallbackPath)) fs.unlinkSync(fallbackPath);
                fs.renameSync(tempPath, fallbackPath);
                resolve();
              } catch (rErr) {
                reject(rErr);
              }
            });
            writer.on("error", (err) => {
              if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
              reject(err);
            });
          });
        } else {
          throw new Error(
            `Google Drive link (${fileId}) is Restricted or Private. Please connect Google Drive OAuth or set sharing to "Anyone with the link can view".`
          );
        }
      } else {
        fs.writeFileSync(fallbackPath, Buffer.from(res.data));
      }

      const stats = fs.statSync(fallbackPath);

      // Verify not an error HTML page
      const headBuffer = Buffer.alloc(Math.min(2048, stats.size));
      const fd = fs.openSync(fallbackPath, "r");
      fs.readSync(fd, headBuffer, 0, headBuffer.length, 0);
      fs.closeSync(fd);
      const headStr = headBuffer.toString("utf8").toLowerCase();

      if (
        headStr.includes("<!doctype html") ||
        headStr.includes("<html") ||
        headStr.includes("accounts.google.com")
      ) {
        this.cleanupTempFile(fallbackPath);
        throw new Error(
          `Google Drive file (${fileId}) requires OAuth login. Please authenticate your Google Account.`
        );
      }

      const magic = this.inspectFileMagicBytes(fallbackPath);
      let isImage = magic.isImage;
      let isVideo = magic.isVideo;

      if (!isImage && !isVideo) {
        isVideo = /\.(mp4|mov|avi|webm|m4v|mkv)$/i.test(fallbackFilename);
        isImage = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(fallbackFilename);
      }
      if (magic.isImage) {
        isImage = true;
        isVideo = false;
      } else if (magic.isVideo) {
        isVideo = true;
        isImage = false;
      }

      let finalFallbackPath = fallbackPath;
      if (magic.isImage && !/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(fallbackFilename)) {
        const ext = magic.format ? `.${magic.format}` : ".png";
        finalFallbackPath = `${fallbackPath}${ext}`;
        try { fs.renameSync(fallbackPath, finalFallbackPath); } catch (e) {}
      } else if (magic.isVideo && !/\.(mp4|mov|avi|webm|m4v|mkv)$/i.test(fallbackFilename)) {
        finalFallbackPath = `${fallbackPath}.mp4`;
        try { fs.renameSync(fallbackPath, finalFallbackPath); } catch (e) {}
      }

      return {
        filePath: finalFallbackPath,
        fileName: path.basename(finalFallbackPath),
        fileSize: stats.size,
        mimeType: isImage ? "image/png" : isVideo ? "video/mp4" : "application/octet-stream",
        isVideo,
        isImage,
        fileId,
        source: "public_export",
      };
    } catch (fallbackErr) {
      if (process.env.SIMULATION_MODE === "true" || fileId.startsWith("sim_")) {
        const dummyPath = path.join(this.scratchDir, `${fallbackFilename}_simulated.mp4`);
        fs.writeFileSync(dummyPath, Buffer.from("SIMULATED_VIDEO_BINARY_DATA"));
        return {
          filePath: dummyPath,
          fileName: path.basename(dummyPath),
          fileSize: 1024,
          mimeType: "video/mp4",
          isVideo: true,
          isImage: false,
          fileId,
          source: "simulated",
        };
      }
      throw new Error(`Failed to download Google Drive asset (${fileId}): ${fallbackErr.message}`);
    }
  }

  /**
   * Inspect file magic bytes to determine image vs video when extension/mimeType is missing or ambiguous
   */
  inspectFileMagicBytes(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return { isImage: false, isVideo: false };
    try {
      const fd = fs.openSync(filePath, "r");
      const buffer = Buffer.alloc(256);
      const bytesRead = fs.readSync(fd, buffer, 0, 256, 0);
      fs.closeSync(fd);
      if (bytesRead < 4) return { isImage: false, isVideo: false };

      // Image signatures
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return { isImage: true, isVideo: false, format: "png" };
      }
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { isImage: true, isVideo: false, format: "jpg" };
      }
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return { isImage: true, isVideo: false, format: "gif" };
      }
      if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
        return { isImage: true, isVideo: false, format: "webp" };
      }

      // Video signatures
      if (buffer.toString("ascii", 4, 8) === "ftyp") {
        return { isImage: false, isVideo: true, format: "mp4" };
      }
      if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
        return { isImage: false, isVideo: true, format: "webm" };
      }
      if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 11) === "AVI") {
        return { isImage: false, isVideo: true, format: "avi" };
      }
    } catch (e) {}
    return { isImage: false, isVideo: false };
  }

  // Alias downloadCreative for compatibility
  async downloadCreative(driveLinkOrId, destinationFilename = null, expectedMediaType = null) {
    if (typeof driveLinkOrId === "string" && driveLinkOrId.includes("/folders/")) {
      const folderRes = await this.processDriveLink(driveLinkOrId, expectedMediaType);
      if (folderRes?.assets && folderRes.assets.length > 0) {
        if (destinationFilename) {
          const cleanDest = destinationFilename.toLowerCase().trim();
          const matched = folderRes.assets.find((a) => {
            const aName = (a.fileName || "").toLowerCase().trim();
            return aName.includes(cleanDest) || cleanDest.includes(aName);
          });
          if (matched) return matched;
        }
        return folderRes.assets[0];
      }
    }
    return this.downloadFile(driveLinkOrId, destinationFilename, expectedMediaType);
  }

  cleanupTempFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn(`[DriveService] Could not delete temp file ${filePath}: ${err.message}`);
      }
    }
  }
}

export const driveService = new DriveService();
export default driveService;
