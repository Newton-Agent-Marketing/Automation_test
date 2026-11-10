/**
 * McpExecutionLogger - Structured Audit and Observability for Official MCP Executions
 *
 * Enforces token sanitization and structured logging across Meta and Google MCP tools.
 */

export class McpExecutionLogger {
  /**
   * Deep sanitize objects to prevent leaking tokens or secrets into logs
   */
  static sanitize(data) {
    if (!data || typeof data !== "object") return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitize(item));
    }

    const sanitized = {};
    const sensitiveKeys = [
      "access_token",
      "accesstoken",
      "token",
      "authorization",
      "secret",
      "client_secret",
      "appsecret_proof",
      "refresh_token",
      "password",
    ];

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((s) => lowerKey.includes(s))) {
        sanitized[key] = "[REDACTED]";
      } else if (value && typeof value === "object") {
        sanitized[key] = this.sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Log an MCP execution event
   */
  static async logExecution({
    userId,
    accountId,
    provider = "META",
    executionSource = "OFFICIAL_META_MCP",
    toolName,
    status, // "SUCCESS" | "FAILED"
    durationMs,
    args = {},
    result = null,
    error = null,
  }) {
    const cleanAccountId = accountId
      ? String(accountId).startsWith("act_")
        ? accountId
        : `act_${accountId}`
      : "N/A";

    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: userId ? String(userId) : "anonymous",
      accountId: cleanAccountId,
      provider: provider.toUpperCase(),
      executionSource,
      toolName,
      status: status === "SUCCESS" ? "SUCCESS" : "FAILED",
      durationMs: typeof durationMs === "number" ? durationMs : 0,
      args: this.sanitize(args),
      error: error ? (error.message || String(error)) : null,
    };

    const statusBadge = status === "SUCCESS" ? "✓" : "✗";
    console.log(
      `[MCP_AUDIT] ${statusBadge} [${logEntry.provider}] [${logEntry.executionSource}] Tool: "${toolName}" Account: ${cleanAccountId} (${logEntry.durationMs}ms)`
    );

    if (error) {
      console.error(
        `[MCP_AUDIT ERROR] Tool: "${toolName}" Account: ${cleanAccountId} -> ${logEntry.error}`
      );
    }

    // Persist to dbLoggerService if active
    try {
      const dbLoggerModule = await import("../logger/dbLoggerService.js");
      const dbLogger = dbLoggerModule.default;
      if (dbLogger && typeof dbLogger.log === "function") {
        dbLogger.log(
          status === "SUCCESS" ? "info" : "error",
          `[MCP_AUDIT] ${statusBadge} ${toolName} on ${cleanAccountId}: ${status}`,
          logEntry
        );
      }
    } catch (_) {
      // Non-fatal if DB logger is offline
    }

    return logEntry;
  }
}

export default McpExecutionLogger;

