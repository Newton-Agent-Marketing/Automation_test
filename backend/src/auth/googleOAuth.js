import axios from "axios";
import tokenStore from "./tokenStore.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export const DEFAULT_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
];

class GoogleOAuthService {
  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID || "";
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    this.redirectUri =
      process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth/callback";
  }

  getClientCredentials() {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID || this.clientId,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || this.clientSecret,
      redirectUri: process.env.GOOGLE_REDIRECT_URI || this.redirectUri,
    };
  }

  /**
   * Generates Google OAuth 2.0 Consent URL
   */
  getAuthUrl(customState = "google_drive_auth", scopes = DEFAULT_GOOGLE_SCOPES) {
    const { clientId, redirectUri } = this.getClientCredentials();
    if (!clientId) {
      throw new Error("GOOGLE_CLIENT_ID is not configured in .env");
    }

    const statePayload =
      typeof customState === "object"
        ? Buffer.from(JSON.stringify(customState)).toString("base64")
        : customState;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: "consent", // Ensures refresh_token is returned
      include_granted_scopes: "true",
      state: statePayload,
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchanges authorization code for tokens, retrieves user profile, and persists to tokenStore
   */
  async handleCallback(code, customRedirectUri = null) {
    if (!code) throw new Error("Missing authorization code from Google OAuth");
    const { clientId, clientSecret, redirectUri } = this.getClientCredentials();
    const effectiveRedirectUri = customRedirectUri || redirectUri;

    try {
      const tokenResponse = await axios.post(
        GOOGLE_TOKEN_URL,
        new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: effectiveRedirectUri,
          grant_type: "authorization_code",
        }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 15000,
        }
      );

      const data = tokenResponse.data;
      const expiryDate = Date.now() + (data.expires_in || 3600) * 1000;

      let userInfo = {};
      try {
        const userRes = await axios.get(GOOGLE_USERINFO_URL, {
          headers: { Authorization: `Bearer ${data.access_token}` },
          timeout: 10000,
        });
        userInfo = userRes.data || {};
      } catch (uErr) {
        console.warn("[GoogleOAuth] Could not fetch userinfo:", uErr.message);
      }

      const existing = tokenStore.loadTokens("google") || {};
      const tokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || existing.refresh_token || null,
        scope: data.scope,
        token_type: data.token_type || "Bearer",
        expiry_date: expiryDate,
        email: userInfo.email || existing.email || "",
        name: userInfo.name || existing.name || "",
        picture: userInfo.picture || existing.picture || "",
        connectedAt: new Date().toISOString(),
      };

      tokenStore.saveTokens("google", tokens);
      return tokens;
    } catch (err) {
      const details = err.response?.data || err.message;
      console.error("[GoogleOAuth] Code exchange failed:", details);
      throw new Error(`Google OAuth code exchange failed: ${JSON.stringify(details)}`);
    }
  }

  /**
   * Refreshes access token using stored refresh_token
   */
  async refreshAccessToken(tokens = null) {
    const stored = tokens || tokenStore.loadTokens("google");
    if (!stored?.refresh_token) {
      throw new Error("No refresh token available. User must re-authenticate with Google.");
    }

    const { clientId, clientSecret } = this.getClientCredentials();

    try {
      const response = await axios.post(
        GOOGLE_TOKEN_URL,
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: stored.refresh_token,
          grant_type: "refresh_token",
        }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 15000,
        }
      );

      const data = response.data;
      const updated = {
        ...stored,
        access_token: data.access_token,
        expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
        scope: data.scope || stored.scope,
        refreshedAt: new Date().toISOString(),
      };

      if (data.refresh_token) {
        updated.refresh_token = data.refresh_token;
      }

      tokenStore.saveTokens("google", updated);
      return updated;
    } catch (err) {
      const details = err.response?.data || err.message;
      console.error("[GoogleOAuth] Token refresh failed:", details);
      throw new Error(`Google token refresh failed: ${JSON.stringify(details)}`);
    }
  }

  /**
   * Returns a valid access token, auto-refreshing if expired
   */
  async getAccessToken() {
    let tokens = tokenStore.loadTokens("google");
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      return null;
    }

    const isExpired = !tokens.expiry_date || Date.now() >= tokens.expiry_date - 60000;
    if (isExpired && tokens.refresh_token) {
      tokens = await this.refreshAccessToken(tokens);
    }

    return tokens.access_token || null;
  }

  /**
   * Returns authenticated client helper (Axios instance configured with Bearer token)
   */
  async getAuthenticatedClient() {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      throw new Error("Google account is not connected. Please connect Google Drive first.");
    }

    const instance = axios.create({
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 60000,
    });

    return {
      accessToken,
      axiosInstance: instance,
      tokens: tokenStore.loadTokens("google"),
    };
  }

  /**
   * Get current connection status and profile
   */
  getStatus() {
    const tokens = tokenStore.loadTokens("google");
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      return {
        connected: false,
        email: null,
        name: null,
        picture: null,
        hasRefreshToken: false,
        expiresAt: null,
        message: "Google Drive not connected",
      };
    }

    const isExpired = tokens.expiry_date ? Date.now() >= tokens.expiry_date : false;
    return {
      connected: true,
      email: tokens.email || "Connected Google Account",
      name: tokens.name || "",
      picture: tokens.picture || "",
      hasRefreshToken: Boolean(tokens.refresh_token),
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      isExpired,
      connectedAt: tokens.connectedAt || tokens.updatedAt || null,
      message: "Google Drive OAuth connected and active",
    };
  }

  /**
   * Clear Google tokens
   */
  disconnect() {
    return tokenStore.clearTokens("google");
  }
}

export const googleOAuth = new GoogleOAuthService();
export default googleOAuth;
