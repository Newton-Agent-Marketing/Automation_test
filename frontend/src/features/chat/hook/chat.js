import { useDispatch, useSelector } from "react-redux";
import {
  addLocalUserMessage,
  appendStreamText,
  clearMessages,
  deleteConversationThunk,
  fetchConversations,
  fetchHistory,
  finishStream,
  renameConversationThunk,
  setActiveConversation,
  setChatError,
  setSocketConnected,
  setToolStatus,
  updateJobProgress,
} from "../chat.slice";
import { chatApi } from "../service/chat.api";
import { sendChatOverSocket } from "../service/chat.socket";

export const useChat = () => {
  const dispatch = useDispatch();
  const chat = useSelector((state) => state.chat);
  const { metaAccountId, googleAccountId, accountId } = useSelector((state) => {
    const dashboardChannel = state.dashboard?.filters?.channel;
    const dashboardAcc = state.dashboard?.filters?.accountId;
    const userPrefAcc = state.auth?.user?.dashboardSettings?.accountId;
    const metaActiveAcc = state.channel.status?.channels?.metaAds?.activeAccount?.accountId;
    const googleActiveAcc =
      state.channel.status?.channels?.googleAds?.selectedCustomerId ||
      state.channel.status?.channels?.googleAds?.activeAccount?.accountId;

    const resolvedMetaAcc =
      metaActiveAcc ||
      (dashboardChannel === "meta" ? dashboardAcc : null) ||
      (userPrefAcc && String(userPrefAcc).startsWith("act_") ? userPrefAcc : null);

    const resolvedGoogleAcc =
      googleActiveAcc ||
      (dashboardChannel === "google" ? dashboardAcc : null) ||
      (userPrefAcc && !String(userPrefAcc).startsWith("act_") ? userPrefAcc : null);

    return {
      metaAccountId: resolvedMetaAcc || null,
      googleAccountId: resolvedGoogleAcc || null,
      accountId:
        (dashboardChannel === "meta" ? resolvedMetaAcc : resolvedGoogleAcc) ||
        resolvedMetaAcc ||
        resolvedGoogleAcc ||
        dashboardAcc ||
        userPrefAcc ||
        null,
    };
  });

  const handleEvent = (event) => {
    console.log("[AI Agent Chat Hook] Received Event:", event);
    if (event.type === "text_delta") dispatch(appendStreamText(event.content || ""));
    if (event.type === "tool_status") dispatch(setToolStatus(event.status || event.toolName));
    if (event.type === "progress_update") dispatch(updateJobProgress(event));
    if (event.type === "error") dispatch(setChatError(event.message));
    if (event.type === "done") {
      dispatch(finishStream());
      dispatch(fetchConversations());
    }
  };

  const sendMessage = async (userMessage, options = {}) => {
    const conversationId = chat.activeId || crypto.randomUUID();
    if (!chat.activeId) dispatch(setActiveConversation(conversationId));
    dispatch(
      addLocalUserMessage({
        _id: `user-${Date.now()}`,
        role: "user",
        content: userMessage,
        conversationId,
      })
    );

    const payload = {
      conversationId,
      userMessage,
      accountId,
      metaAccountId,
      googleAccountId,
      ...(options?.startRow !== undefined ? { startRow: options.startRow } : {}),
      ...(options?.endRow !== undefined ? { endRow: options.endRow } : {}),
      ...(options?.rowRange ? { rowRange: options.rowRange } : {}),
      ...(options?.rangeSelector ? { rangeSelector: options.rangeSelector } : {}),
    };
    console.log("[AI Agent Chat Hook] Sending Chat Payload:", payload);

    try {
      sendChatOverSocket(payload);
    } catch (socketErr) {
      console.warn("[AI Agent Chat Hook] Socket fallback to HTTP stream:", socketErr?.message);
      try {
        await chatApi.stream({ ...payload, onEvent: handleEvent });
      } catch (err) {
        console.error("[AI Agent Chat Hook] Error sending chat message:", err);
        handleEvent({ type: "error", message: err.message || "Failed to send message" });
        handleEvent({ type: "done" });
      }
    }
  };

  return {
    ...chat,
    accountId,
    handleEvent,
    setConnected: (value) => dispatch(setSocketConnected(value)),
    loadConversations: () => dispatch(fetchConversations()),
    openConversation: (id) => dispatch(fetchHistory(id)),
    renameConversation: (id, title) =>
      dispatch(renameConversationThunk({ conversationId: id, title })).unwrap(),
    deleteConversation: (id) => dispatch(deleteConversationThunk(id)).unwrap(),
    startNewChat: () => {
      dispatch(clearMessages());
      dispatch(setActiveConversation(null));
    },
    sendMessage,
  };
};
