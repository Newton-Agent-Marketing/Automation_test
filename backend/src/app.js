import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import metaDashboardRoutes from "./routes/Dashboard.route.js";
import chatAgentRoutes from "./routes/Chat.route.js";
import authRoutes from "./routes/Auth.route.js";
import channelRoutes from "./routes/channel.route.js";
import googleOAuth from "./auth/googleOAuth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, "../../frontend/dist");

// App entry point - OAuth Callback configured for http://localhost:3000/oauth/callback
const app = express();

import { corsOptions, isOriginAllowed } from "./config/cors.js";

// Serve built frontend assets
app.use(express.static(frontendDist));

// Middleware
app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});

app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));

import aiContextRoutes from "./routes/aiContext.route.js";
import aiAutomationRoutes from "./routes/aiAutomation.route.js";
import driveRoutes from "./routes/drive.route.js";
import { DriveController } from "./controller/driveController.js";
import dbLoggerService from "./services/logger/dbLoggerService.js";

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/channel", channelRoutes);
app.use("/api/google", channelRoutes);
app.use("/api/google-ads", channelRoutes);
app.use("/api/meta", channelRoutes);
app.use("/api/connected-channels", channelRoutes);
app.use("/api/oauth", channelRoutes);
app.use("/api/meta-dashboard", metaDashboardRoutes);
app.use("/api/dashboard", metaDashboardRoutes);
app.use("/api/agent", chatAgentRoutes);
app.use("/api/ai-context", aiContextRoutes);
app.use("/api/automation", aiAutomationRoutes);
app.use("/api/drive", driveRoutes);

// Terminal Logs API (Fetch recent console logs stored in MongoDB)
app.get(["/api/logs", "/api/system-logs"], async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const level = req.query.level || null;
    const logs = await dbLoggerService.getRecentLogs({ limit, level });
    return res.status(200).json({
      success: true,
      total: logs.length,
      data: logs,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch system logs",
      error: err.message,
    });
  }
});

// Direct alias for /auth/google
app.get("/auth/google", (req, res) => {
  return DriveController.getAuthUrl(req, res);
});

// Root & OAuth callback handler for popup windows
app.get(["/", "/channels", "/oauth/callback"], async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (code || error) {
    console.log("\n==========================================");
    console.log("[Backend Express Router] GET /oauth/callback Received!");
    console.log("-> Code Present:", Boolean(code));
    console.log("-> Error Present:", error || "None");
    console.log("-> Query State:", state);
    console.log("==========================================\n");
    let channel = "meta";
    let isDrive = false;
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
        if (decoded.channel === "google_drive" || decoded.channel === "drive" || decoded.type === "drive") {
          channel = "google_drive";
          isDrive = true;
        } else if (decoded.channel === "google" || decoded.channelId === "google") {
          channel = "google";
        }
      } catch (e) {
        if (typeof state === "string" && (state.includes("drive") || state.includes("google_drive"))) {
          channel = "google_drive";
          isDrive = true;
        } else if (typeof state === "string" && state.includes("google")) {
          channel = "google";
        }
      }
    }

    if (code && isDrive) {
      try {
        await googleOAuth.handleCallback(code);
      } catch (tokenErr) {
        console.warn("[Google Drive Callback Auto-Exchange Warning]:", tokenErr.message);
      }
    }

    const isGoogle = channel === "google";
    const channelName = isDrive ? "Google Drive & Sheets" : isGoogle ? "Google Ads" : "Meta Ads";
    const successType = isDrive ? "GOOGLE_DRIVE_OAUTH_SUCCESS" : isGoogle ? "GOOGLE_OAUTH_SUCCESS" : "META_OAUTH_SUCCESS";
    const errorType = isDrive ? "GOOGLE_DRIVE_OAUTH_ERROR" : isGoogle ? "GOOGLE_OAUTH_ERROR" : "META_OAUTH_ERROR";

    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${channelName} Authorization</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }
          .card { background: #1e293b; padding: 2rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 400px; }
          .spinner { border: 3px solid rgba(255,255,255,0.1); border-top-color: ${isDrive ? "#10b981" : isGoogle ? "#4285F4" : "#38bdf8"}; border-radius: 50%; width: 32px; height: 32px; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="spinner"></div>
          <h3>${error ? "Authorization Failed" : "Authorization Successful!"}</h3>
          <p>${error ? (error_description || error) : `Finalizing ${channelName} connection and returning to dashboard...`}</p>
        </div>
        <script>
          const code = ${JSON.stringify(code || null)};
          const state = ${JSON.stringify(state || null)};
          const error = ${JSON.stringify(error || null)};
          const successType = ${JSON.stringify(successType)};
          const errorType = ${JSON.stringify(errorType)};
          const isDrive = ${JSON.stringify(isDrive)};
          const frontendUrl = ${JSON.stringify(process.env.FRONTEND_URL || "http://localhost:5173")};
          
          if (window.opener) {
            if (code) {
              window.opener.postMessage({ type: successType, code, state, channel: ${JSON.stringify(channel)}, connected: true }, '*');
              window.opener.postMessage('oauth-success', '*');
            } else if (error) {
              window.opener.postMessage({ type: errorType, error, channel: ${JSON.stringify(channel)} }, '*');
            }
            setTimeout(() => window.close(), 1000);
          } else {
            if (isDrive) {
              window.location.href = frontendUrl + '/ai-context?drive_connected=true';
            } else {
              window.location.href = frontendUrl + '/channels' + window.location.search;
            }
          }
        </script>
      </body>
      </html>
    `);
  }

  if (req.path === "/oauth/callback") {
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAuth Callback Service</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }
          .card { background: #1e293b; padding: 2.5rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 440px; }
          h2 { color: #38bdf8; margin-top: 0; }
          p { color: #94a3b8; line-height: 1.5; font-size: 0.95rem; }
          .badge { display: inline-block; padding: 0.35rem 0.8rem; border-radius: 9999px; background: rgba(16, 185, 129, 0.2); color: #10b981; font-weight: 600; font-size: 0.85rem; margin-top: 1rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>OAuth Callback Endpoint</h2>
          <p>This endpoint is active and listening for OAuth 2.0 redirects from Meta Ads and Google.</p>
          <div class="badge">● Status: Active & Ready</div>
        </div>
      </body>
      </html>
    `);
  }

  const query = new URLSearchParams(req.query).toString();
  const frontendUrl = (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes("vercel.app")) 
    ? process.env.FRONTEND_URL 
    : "http://34.131.40.86";
  res.redirect(`${frontendUrl}/channels${query ? `?${query}` : ""}`);
});

export default app;