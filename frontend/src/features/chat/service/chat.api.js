import api, { API_URL } from "../../../lib/api";

export const chatApi = {
  conversations: () => api.get("/api/agent/conversations"),
  history: (conversationId) => api.get(`/api/agent/history/${conversationId}`),
  renameConversation: (conversationId, title) =>
    api.patch(`/api/agent/conversation/${conversationId}`, { title }),
  deleteConversation: (conversationId) =>
    api.delete(`/api/agent/conversation/${conversationId}`),
  getPreparation: (conversationId) =>
    api.get(`/api/agent/preparation/${conversationId}`),
  preparationAction: ({ conversationId, action, payload, metaAccountId }) =>
    api.post("/api/agent/preparation/action", { conversationId, action, payload, metaAccountId }),
  stream: async ({
    conversationId,
    userMessage,
    accountId,
    metaAccountId,
    googleAccountId,
    startRow,
    endRow,
    rowRange,
    rangeSelector,
    onEvent,
  }) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}/api/agent/chat`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({
        conversationId,
        userMessage,
        accountId,
        metaAccountId,
        googleAccountId,
        startRow,
        endRow,
        rowRange,
        rangeSelector,
      }),
    });

    if (!response.ok || !response.body) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || "Failed to stream chat");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";
      for (const chunk of chunks) {
        const line = chunk.replace(/^data:\s*/, "").trim();
        if (!line) continue;
        try {
          onEvent(JSON.parse(line));
        } catch {
          onEvent({ type: "text_delta", content: line });
        }
      }
    }
  },
};

export default chatApi;
