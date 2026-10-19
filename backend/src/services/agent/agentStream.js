// Frontend par text ko typing animation aur Tool Execution Badges 
export class AgentStreamHandler {
  /**
   * Express Response ko Server-Sent Events (SSE) format mein configure karta hai
   */
  static initSSE(res) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
  }

  // Token ya text chunk bhejna
  static sendChunk(res, text) {
    res.write(`data: ${JSON.stringify({ type: "text_delta", content: text })}\n\n`);
  }

  // UI par badge dikhana (e.g., "⚡ Calling Meta MCP...")
  static sendToolStatus(res, toolName, status) {
    res.write(`data: ${JSON.stringify({ type: "tool_status", toolName, status })}\n\n`);
  }

  // Stream progress update events (for live pipeline tracking UI)
  static sendProgressUpdate(res, payload = {}) {
    if (res && typeof res.write === "function") {
      res.write(`data: ${JSON.stringify({ type: "progress_update", ...payload })}\n\n`);
    }
  }

  // Preparation session update (for live campaign detail sheet preview)
  static sendPreparationUpdate(res, session) {
    if (res && typeof res.write === "function") {
      res.write(`data: ${JSON.stringify({ type: "preparation_update", session })}\n\n`);
    }
  }

  // Stream finish
  static endStream(res) {
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  }
}
