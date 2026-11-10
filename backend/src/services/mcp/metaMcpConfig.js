// backend/src/services/mcp/metaMcpConfig.js

export const OFFICIAL_META_MCP_ENDPOINT = "https://mcp.facebook.com/ads";

/**
 * Returns the configured official Meta Ads MCP endpoint.
 * Defaults to "https://mcp.facebook.com/ads".
 * Ignores any environment variable pointing to localhost or private/unreachable paths.
 */
export function getOfficialMetaMcpEndpoint() {
  const envUrl = process.env.META_MCP_SERVER_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim() !== "") {
    const trimmed = envUrl.trim();
    if (!isLocalhostOrPrivateUrl(trimmed)) {
      return trimmed;
    }
  }
  return OFFICIAL_META_MCP_ENDPOINT;
}

/**
 * Checks whether a URL points to localhost, loopback, private IP, http, or stale /sse.
 * @param {string} urlStr
 * @returns {boolean}
 */
export function isLocalhostOrPrivateUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return false;
  const lower = urlStr.trim().toLowerCase();
  return (
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    lower.includes("0.0.0.0") ||
    lower.includes("::1") ||
    /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)(:\d+)?(\/.*)?$/i.test(lower) ||
    /^(https?:\/\/)?(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/i.test(lower) ||
    lower.endsWith("/sse") ||
    lower.includes("/sse?") ||
    lower.includes("/sse/") ||
    lower.startsWith("http://") // Official Meta MCP is strictly HTTPS
  );
}

/**
 * Centralized resolver and sanitizer for Meta MCP Server URLs.
 * Ensures official Meta Ads MCP OAuth accounts always resolve to the official endpoint
 * (https://mcp.facebook.com/ads or process.env.META_MCP_SERVER_URL).
 * Rejects and overrides localhost, private IPs, and stale database URLs.
 *
 * @param {string} candidateUrl
 * @param {Object} [options]
 * @param {string} [options.accountId]
 * @param {string} [options.logContext]
 * @returns {string}
 */
export function resolveOfficialMetaMcpUrl(candidateUrl, options = {}) {
  const officialEndpoint = getOfficialMetaMcpEndpoint();
  const { accountId, logContext = "MetaMcpConfig" } = options;
  const cleanAcc = accountId ? `act_${String(accountId).replace(/^act_/, "").trim()}` : "unknown";

  if (!candidateUrl || typeof candidateUrl !== "string" || candidateUrl.trim() === "") {
    return officialEndpoint;
  }

  const trimmed = candidateUrl.trim();

  // If candidate is localhost, loopback, private IP, http, or stale /sse, override immediately
  if (isLocalhostOrPrivateUrl(trimmed)) {
    console.warn(
      `[${logContext}] Stale/invalid Meta MCP URL detected "${trimmed}" for account ${cleanAcc}. Overriding with official endpoint: "${officialEndpoint}"`
    );
    return officialEndpoint;
  }

  // Validate URL structure
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:" && parsed.protocol !== "in-memory:") {
      console.warn(
        `[${logContext}] Invalid protocol "${parsed.protocol}" in Meta MCP URL "${trimmed}" for ${cleanAcc}. Using official endpoint: "${officialEndpoint}"`
      );
      return officialEndpoint;
    }
    return trimmed;
  } catch (err) {
    console.warn(
      `[${logContext}] Unparseable Meta MCP URL "${trimmed}" for ${cleanAcc}. Using official endpoint: "${officialEndpoint}"`
    );
    return officialEndpoint;
  }
}

/**
 * Resolves transport type for Meta MCP:
 * If URL is the official Meta Ads MCP endpoint, transport must be STREAMABLE_HTTP.
 *
 * @param {string} serverUrl
 * @param {string} [candidateTransport]
 * @returns {string} "STREAMABLE_HTTP" | "STDIO" | "SSE"
 */
export function resolveMetaMcpTransport(serverUrl, candidateTransport) {
  const upper = String(candidateTransport || "").toUpperCase();
  if (upper === "STDIO") {
    return "STDIO";
  }
  const resolvedUrl = resolveOfficialMetaMcpUrl(serverUrl);
  if (resolvedUrl.includes("mcp.facebook.com") || !upper || upper === "SSE") {
    return "STREAMABLE_HTTP";
  }
  return upper || "STREAMABLE_HTTP";
}
