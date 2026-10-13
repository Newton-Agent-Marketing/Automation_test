import googleOAuth from "../auth/googleOAuth.js";
import driveService from "../google/driveService.js";
import sheetsService from "../google/sheetsService.js";
import campaignPipeline from "../workflow/campaignPipeline.js";
import AiContext from "../models/aiContextModel.js";
import SpreadsheetIngestionService from "../services/data/spreadsheetIngestionService.js";

export class DriveController {
  /**
   * 1. Get Google OAuth URL
   * GET /api/drive/auth-url or GET /auth/google
   */
  static async getAuthUrl(req, res) {
    try {
      const state = req.query.state || "google_drive_setup";
      const url = googleOAuth.getAuthUrl(state);
      return res.status(200).json({
        success: true,
        data: { url },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate Google OAuth URL",
        error: err.message,
      });
    }
  }

  /**
   * 2. Handle OAuth Callback
   * POST /api/drive/oauth-callback or GET /oauth/callback
   */
  static async handleOAuthCallback(req, res) {
    try {
      const code = req.body?.code || req.query?.code;
      if (!code) {
        return res.status(400).json({
          success: false,
          message: "Authorization code is required.",
        });
      }

      const tokens = await googleOAuth.handleCallback(code);

      // If user is authenticated in context, update warehouse node
      const userId = req.user?._id || req.user?.id;
      if (userId) {
        const context = await AiContext.findOne({ userId });
        if (context) {
          let modified = false;
          context.nodes = context.nodes.map((n) => {
            if (n.type === "data_warehouse") {
              modified = true;
              return {
                ...n,
                data: {
                  ...n.data,
                  googleDriveConnected: true,
                  googleDriveEmail: tokens.email || "Connected Google Account",
                },
              };
            }
            return n;
          });
          if (modified) {
            context.markModified("nodes");
            await context.save();
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: "Google Drive OAuth connected successfully!",
        data: {
          email: tokens.email,
          name: tokens.name,
          hasRefreshToken: Boolean(tokens.refresh_token),
          connectedAt: tokens.connectedAt,
        },
      });
    } catch (err) {
      console.error("[DriveController Callback Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to exchange Google OAuth code",
        error: err.message,
      });
    }
  }

  /**
   * 3. Get Google Drive & Sheets Connection Status
   * GET /api/drive/status
   */
  static async getStatus(req, res) {
    try {
      const status = googleOAuth.getStatus();
      return res.status(200).json({
        success: true,
        data: status,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to get Google status",
        error: err.message,
      });
    }
  }

  /**
   * 4. List files from user's Drive / folder
   * GET /api/drive/files
   */
  static async listFiles(req, res) {
    try {
      const { folderId, query, pageSize, pageToken } = req.query;
      const result = await driveService.listFiles({
        folderId,
        query,
        pageSize: Number(pageSize) || 20,
        pageToken,
      });
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to list files from Google Drive",
        error: err.message,
      });
    }
  }

  /**
   * 5. Download file to scratch directory
   * POST /api/drive/download
   */
  static async downloadFile(req, res) {
    try {
      const { fileIdOrUrl, destinationFilename } = req.body;
      if (!fileIdOrUrl) {
        return res.status(400).json({
          success: false,
          message: "Please provide a fileId or Google Drive URL link.",
        });
      }

      const result = await driveService.downloadFile(fileIdOrUrl, destinationFilename);
      return res.status(200).json({
        success: true,
        message: `File downloaded successfully to ${result.fileName}`,
        data: result,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to download file from Google Drive",
        error: err.message,
      });
    }
  }

  /**
   * 6. Validate Google Drive Link or File ID
   * POST /api/drive/validate
   */
  static async validateLink(req, res) {
    try {
      const { linkOrId } = req.body;
      if (!linkOrId) {
        return res.status(400).json({
          success: false,
          message: "Please provide a Google Drive link or ID to validate.",
        });
      }

      const check = await driveService.validateDriveLink(linkOrId);
      return res.status(200).json({
        success: check.valid,
        message: check.message,
        data: check,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to validate Google Drive link",
        error: err.message,
      });
    }
  }

  /**
   * 7. Disconnect Google Drive
   * POST /api/drive/disconnect
   */
  static async disconnect(req, res) {
    try {
      googleOAuth.disconnect();

      const userId = req.user?._id || req.user?.id;
      if (userId) {
        const context = await AiContext.findOne({ userId });
        if (context) {
          let modified = false;
          context.nodes = context.nodes.map((n) => {
            if (n.type === "data_warehouse") {
              modified = true;
              return {
                ...n,
                data: {
                  ...n.data,
                  googleDriveConnected: false,
                  googleDriveEmail: "",
                },
              };
            }
            return n;
          });
          if (modified) {
            context.markModified("nodes");
            await context.save();
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: "Google Drive disconnected successfully.",
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to disconnect Google Drive",
        error: err.message,
      });
    }
  }

  /**
   * 8. Read Google Sheet cells & rows
   * POST /api/drive/sheet-data
   */
  static async getSheetData(req, res) {
    try {
      const { sheetUrlOrId, range, gid, worksheetName } = req.body;
      const data = await SpreadsheetIngestionService.ingest({
        sheetUrlOrId,
        range,
        gid,
        worksheetName,
      });

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to read Google Sheet data",
        error: err.message,
      });
    }
  }

  /**
   * 9. Run Campaign Orchestration Pipeline
   * POST /api/drive/run-pipeline
   */
  static async runPipeline(req, res) {
    try {
      const { sheetUrlOrId, driveFolderUrl, adAccountId, channel } = req.body;
      const report = await campaignPipeline.processCampaignPipeline({
        sheetUrlOrId,
        driveFolderUrl,
        adAccountId,
        channel,
      });

      return res.status(200).json({
        success: true,
        message: "Campaign pipeline completed successfully.",
        data: report,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Pipeline execution failed",
        error: err.message,
      });
    }
  }
}

export default DriveController;
