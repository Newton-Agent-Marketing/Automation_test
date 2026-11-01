import ChatMessage from "../../models/chatMessage.js";

/**
 * ConversationMemoryService
 * Loads and structures recent conversation history, active Google Sheets context,
 * and active Meta Ads context (account ID, campaigns, video entries) for follow-up turns.
 */
export class ConversationMemoryService {
  /**
   * Load structured session memory for a conversation.
   * @param {string} conversationId
   * @param {object} options
   * @param {string|object} [options.excludeMessageId] - Optional newly-created user message _id to exclude from history
   * @param {number} [options.limit=12]
   */
  static async loadSessionMemory(conversationId, { excludeMessageId = null, limit = 12 } = {}) {
    if (!conversationId) {
      return {
        recentMessages: [],
        lastSheetContext: null,
        lastMetaContext: null,
      };
    }

    try {
      const query = { conversationId };
      if (excludeMessageId) {
        query._id = { $ne: excludeMessageId };
      }

      const docs = await ChatMessage.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      const chronological = docs.reverse();

      let lastSheetContext = null;
      let lastMetaContext = null;

      // Scan from newest to oldest to capture most recent active sheet & Meta contexts
      for (let i = chronological.length - 1; i >= 0; i--) {
        const msg = chronological[i];

        if (!lastSheetContext && msg.contextMetadata?.sheetContext) {
          lastSheetContext = msg.contextMetadata.sheetContext;
        }
        if (!lastMetaContext && msg.contextMetadata?.metaContext) {
          lastMetaContext = msg.contextMetadata.metaContext;
        }

        // Reconstruct from toolCalls if contextMetadata wasn't populated (e.g., ClaudeAgentService MCP calls)
        if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
          for (let tIdx = msg.toolCalls.length - 1; tIdx >= 0; tIdx--) {
            const tc = msg.toolCalls[tIdx];
            const res = tc?.toolResult;
            if (!res || typeof res !== "object") continue;

            if (!lastSheetContext && (res.spreadsheetId || res.sheetUrl || res.worksheetTab)) {
              lastSheetContext = {
                sheetIndex: res.sheetIndex || tc?.toolArgs?.sheetIndex || null,
                sheetId: res.sheetId || null,
                spreadsheetId: res.spreadsheetId || null,
                sheetName: res.sheetName || null,
                sheetUrl: res.sheetUrl || tc?.toolArgs?.sheetUrl || null,
                worksheetTab: res.worksheetTab || res.tabUsed || tc?.toolArgs?.tabName || null,
                availableTabs: res.availableTabs || [],
                headers: res.headers || [],
                detectedColumns: res.detectedColumns || null,
                videoEntries: Array.isArray(res.entries) ? res.entries.slice(0, 50) : null,
              };
            }

            if (
              !lastMetaContext &&
              (res.accountId || res.campaigns || res.allCampaignsPerformance || res.topCampaignsBySpend)
            ) {
              const rawCampaigns =
                res.campaigns ||
                res.allCampaignsPerformance ||
                res.topCampaignsBySpend ||
                [];
              if (res.accountId) {
                lastMetaContext = {
                  accountId: String(res.accountId).startsWith("act_")
                    ? String(res.accountId)
                    : `act_${String(res.accountId).replace(/^act_/, "")}`,
                  accountName: res.accountName || null,
                  currency: res.currency || null,
                  datePreset: res.datePreset || tc?.toolArgs?.datePreset || "maximum",
                  campaigns: Array.isArray(rawCampaigns)
                    ? rawCampaigns.slice(0, 100).map((c) => ({
                        id: c.id || c.campaignId || null,
                        name: c.name || c.campaignName || null,
                        status: c.status || c.effective_status || null,
                      }))
                    : [],
                  campaignIds: Array.isArray(rawCampaigns)
                    ? rawCampaigns.map((c) => c.id || c.campaignId).filter(Boolean)
                    : [],
                };
              }
            }
          }
        }

        if (lastSheetContext && lastMetaContext) break;
      }

      const recentMessages = chronological
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-10)
        .map((m) => ({
          role: m.role,
          content: String(m.content || "").slice(0, 2500),
          metaAccountId: m.metaAccountId || null,
          createdAt: m.createdAt,
        }));

      return {
        recentMessages,
        lastSheetContext,
        lastMetaContext,
      };
    } catch (err) {
      console.warn("[ConversationMemoryService] Failed to load session memory:", err.message);
      return {
        recentMessages: [],
        lastSheetContext: null,
        lastMetaContext: null,
      };
    }
  }

  /**
   * Format session memory into a prompt block for LLM context awareness.
   */
  static formatPromptMemoryBlock(memory) {
    if (!memory) return "";
    const parts = [];

    if (memory.lastSheetContext) {
      const sc = memory.lastSheetContext;
      parts.push(
        `ACTIVE SPREADSHEET CONTEXT FROM PREVIOUS TURN:\n` +
          `- Sheet #${sc.sheetIndex || 1}: "${sc.sheetName || "Connected Sheet"}" (Spreadsheet ID: ${sc.spreadsheetId || "N/A"})\n` +
          `- Active Worksheet Tab: "${sc.worksheetTab || "Default"}"\n` +
          (Array.isArray(sc.headers) && sc.headers.length > 0
            ? `- Discovered Columns (${sc.headers.length}): ${sc.headers.slice(0, 25).join(", ")}\n`
            : "") +
          (Array.isArray(sc.videoEntries) && sc.videoEntries.length > 0
            ? `- Previously Extracted Video Rows: ${sc.videoEntries.length} video entry(s) in "${sc.worksheetTab}"\n`
            : "")
      );
    }

    if (memory.lastMetaContext) {
      const mc = memory.lastMetaContext;
      const sampleNames = (mc.campaigns || [])
        .slice(0, 10)
        .map((c) => `${c.name} (${c.id})`)
        .join(", ");
      parts.push(
        `ACTIVE META ADS CONTEXT FROM PREVIOUS TURN:\n` +
          `- Meta Ad Account ID: ${mc.accountId}${mc.accountName ? ` (${mc.accountName})` : ""}\n` +
          `- Campaigns in Context: ${(mc.campaigns || []).length} campaign(s)${sampleNames ? ` [e.g. ${sampleNames}]` : ""}\n`
      );
    }

    if (Array.isArray(memory.recentMessages) && memory.recentMessages.length > 0) {
      const transcript = memory.recentMessages
        .slice(-6)
        .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 700)}`)
        .join("\n\n");
      parts.push(`RECENT CONVERSATION HISTORY:\n${transcript}`);
    }

    return parts.join("\n\n");
  }
}

export default ConversationMemoryService;

