import fs from "fs";
import path from "path";

class TokenStore {
  constructor() {
    this.tokenDir = process.env.TOKEN_STORAGE_DIR
      ? path.resolve(process.cwd(), process.env.TOKEN_STORAGE_DIR)
      : path.resolve(process.cwd(), ".tokens");
    this.ensureTokenDir();
  }

  ensureTokenDir() {
    if (!fs.existsSync(this.tokenDir)) {
      try {
        fs.mkdirSync(this.tokenDir, { recursive: true });
      } catch (err) {
        console.error(`[TokenStore] Failed to create token directory: ${err.message}`);
      }
    }
  }

  getFilePath(provider = "google") {
    this.ensureTokenDir();
    const safeProvider = provider.replace(/[^a-zA-Z0-9_-]/g, "");
    return path.join(this.tokenDir, `${safeProvider}_tokens.json`);
  }

  /**
   * Save tokens to .tokens/<provider>_tokens.json
   */
  saveTokens(provider = "google", tokens = {}) {
    try {
      this.ensureTokenDir();
      const filePath = this.getFilePath(provider);
      const existing = this.loadTokens(provider) || {};
      const payload = {
        ...existing,
        ...tokens,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
      return payload;
    } catch (err) {
      console.error(`[TokenStore] Failed to save tokens for ${provider}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Load tokens from .tokens/<provider>_tokens.json
   */
  loadTokens(provider = "google") {
    try {
      const filePath = this.getFilePath(provider);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const raw = fs.readFileSync(filePath, "utf8");
      if (!raw || !raw.trim()) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[TokenStore] Failed to read tokens for ${provider}: ${err.message}`);
      return null;
    }
  }

  /**
   * Clear saved tokens
   */
  clearTokens(provider = "google") {
    try {
      const filePath = this.getFilePath(provider);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return true;
    } catch (err) {
      console.error(`[TokenStore] Failed to clear tokens for ${provider}: ${err.message}`);
      return false;
    }
  }

  /**
   * Check if tokens exist and are valid or have a refresh_token
   */
  hasValidTokens(provider = "google") {
    const tokens = this.loadTokens(provider);
    if (!tokens) return false;
    if (tokens.refresh_token) return true;
    if (tokens.access_token) {
      if (tokens.expiry_date && Date.now() < tokens.expiry_date - 60000) {
        return true;
      }
      return true;
    }
    return false;
  }
}

export const tokenStore = new TokenStore();
export default tokenStore;
