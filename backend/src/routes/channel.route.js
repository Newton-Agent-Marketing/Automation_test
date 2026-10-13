import express from "express";
import { ChannelController } from "../controller/channelController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

// 1. Overall Channel Status
router.get("/status", ChannelController.getChannelStatus);
router.get("/accounts", ChannelController.getConnectedAccounts);

// 2. Meta OAuth & MCP Server Connection
router.get("/meta/oauth-url", ChannelController.getMetaOAuthUrl);
router.get("/meta/oauth/initiate", ChannelController.getMetaOAuthUrl);
router.post("/meta/oauth-callback", ChannelController.handleMetaOAuthCallback);
router.post("/oauth/callback", ChannelController.handleMetaOAuthCallback);
router.post("/meta/mcp-connect", ChannelController.connectMcpServer);

// 3. Fetch accessible Meta Ad Accounts with token
router.post("/meta/fetch-accounts", ChannelController.fetchMetaAdAccounts);

// 4. Connect, Select & Save Meta Ad Account
router.post("/meta/connect", ChannelController.connectMetaAccount);
router.post("/meta/accounts/select", ChannelController.selectMetaAccount);
router.post("/meta/select-account", ChannelController.selectMetaAccount);
router.post("/meta/select", ChannelController.selectMetaAccount);

// 5. Disconnect Meta Channel
router.post("/meta/disconnect", ChannelController.disconnectMetaAccount);

// 6. Google Ads OAuth & MCP Server Connection
router.get("/google/oauth-url", ChannelController.getGoogleOAuthUrl);
router.get("/google/oauth/initiate", ChannelController.getGoogleOAuthUrl);
router.post("/google/oauth-callback", ChannelController.handleGoogleOAuthCallback);
router.get("/google/status", ChannelController.getGoogleStatus);
router.get("/google/accounts", ChannelController.getGoogleAccounts);
router.post("/google/accounts/select", ChannelController.selectGoogleAccount);
router.post("/google/select-account", ChannelController.selectGoogleAccount);
router.post("/google/select", ChannelController.selectGoogleAccount);
router.post("/google/mcp-connect", ChannelController.connectGoogleMcpServer);
router.post("/google/fetch-accounts", ChannelController.fetchGoogleAdAccounts);
router.post("/google/connect", ChannelController.connectGoogleAccount);
router.post("/google/disconnect", ChannelController.disconnectGoogleAccount);

// Direct / Google-ads route aliases
router.get("/accounts/select", ChannelController.getGoogleAccounts);
router.post("/accounts/select", ChannelController.selectGoogleAccount);

// 7. Connect & Disconnect Any Marketing Channel (Spotify, LinkedIn, TikTok, etc.)
router.post("/connect", ChannelController.connectGenericChannel);
router.post("/disconnect", ChannelController.disconnectGenericChannel);

// 8. Get available MCP tools for connected channel
router.get("/tools", ChannelController.getChannelTools);

// 9. Manual Sync & Resync triggers
router.post("/sync", ChannelController.triggerAccountSync);
router.post("/:id/resync", ChannelController.triggerAccountSync);
router.post("/connected-channels/:id/resync", ChannelController.triggerAccountSync);

export default router;
