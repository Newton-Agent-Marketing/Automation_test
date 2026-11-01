import { useRef } from "react";
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
  resetStreamText,
  setActiveConversation,
  setChatError,
  setSocketConnected,
  setToolStatus,
  startExecution,
  updateJobProgress,
  setPreparationData,
} from "../chat.slice";
import { chatApi } from "../service/chat.api";
import { sendChatOverSocket } from "../service/chat.socket";

export const useChat = () => {
  const dispatch = useDispatch();
  const chat = useSelector((state) => state.chat);
  const activeConvIdRef = useRef(chat.activeId);
  activeConvIdRef.current = chat.activeId;
  const { metaAccountId, googleAccountId, accountId, aiContextMetaAccountId } = useSelector((state) => {
    // 1. Read directly from AI Context Channel Node (Strict Source of Truth)
    const aiNodes = state.aiContext?.nodes || [];
    const channelNodes = aiNodes.filter((n) => n.type === "ad_channel");
    const metaChannelNode =
      channelNodes.find((n) => {
        const cName = (n.data?.channelName || n.data?.channel || n.label || "").toLowerCase();
        return cName.includes("meta") || cName.includes("facebook");
      }) || (channelNodes.length === 1 ? channelNodes[0] : null);

    const contextSelectedMetaAcc = metaChannelNode?.data?.adAccountId?.trim() || null;

    const dashboardChannel = state.dashboard?.filters?.channel;
    const dashboardAcc = state.dashboard?.filters?.accountId;
    const userPrefAcc = state.auth?.user?.dashboardSettings?.accountId;
    const metaActiveAcc = state.channel.status?.channels?.metaAds?.activeAccount?.accountId;
    const googleActiveAcc =
      state.channel.status?.channels?.googleAds?.selectedCustomerId ||
      state.channel.status?.channels?.googleAds?.activeAccount?.accountId;

    // Strict Account Lock: If an account is selected in AI Context Channel Node, it is strictly locked!
    const resolvedMetaAcc =
      contextSelectedMetaAcc ||
      metaActiveAcc ||
      (dashboardChannel === "meta" ? dashboardAcc : null) ||
      (userPrefAcc && String(userPrefAcc).startsWith("act_") ? userPrefAcc : null);

    const resolvedGoogleAcc =
      googleActiveAcc ||
      (dashboardChannel === "google" ? dashboardAcc : null) ||
      (userPrefAcc && !String(userPrefAcc).startsWith("act_") ? userPrefAcc : null);

    return {
      aiContextMetaAccountId: contextSelectedMetaAcc,
      metaAccountId: resolvedMetaAcc || null,
      googleAccountId: resolvedGoogleAcc || null,
      accountId:
        contextSelectedMetaAcc ||
        (dashboardChannel === "meta" ? resolvedMetaAcc : resolvedGoogleAcc) ||
        resolvedMetaAcc ||
        resolvedGoogleAcc ||
        dashboardAcc ||
        userPrefAcc ||
        null,
    };
  });

  const lastSentRef = useRef({ text: "", ts: 0 });

  const handleEvent = (event) => {
    if (event.type === "execution_start") dispatch(startExecution(event.executionId));
    if (event.type === "stream_reset") dispatch(resetStreamText(event.executionId));
    if (event.type === "text_delta") {
      dispatch(appendStreamText({ content: event.content || "", executionId: event.executionId || null }));
    }
    if (event.type === "tool_status") dispatch(setToolStatus(event.status || event.toolName));
    if (event.type === "progress_update") dispatch(updateJobProgress(event));
    if (event.type === "preparation_update") dispatch(setPreparationData(event.session));
    if (event.type === "error") dispatch(setChatError(event.message));
    if (event.type === "done") {
      dispatch(finishStream(event.executionId || null));
      dispatch(fetchConversations());
      const convId = activeConvIdRef.current || chat.activeId;
      if (convId) {
        dispatch(fetchHistory(convId));
      }
    }
  };

  const sendMessage = async (userMessage, options = {}) => {
    const trimmed = String(userMessage || "").trim();
    if (!trimmed) return;

    // Guard against unintended rapid double-click (<400ms) while streaming
    const now = Date.now();
    if (chat.streaming && lastSentRef.current.text === trimmed && now - lastSentRef.current.ts < 800) {
      return;
    }
    lastSentRef.current = { text: trimmed, ts: now };

    const conversationId = chat.activeId || crypto.randomUUID();
    const executionId = `exec_${now}_${Math.random().toString(36).slice(2, 8)}`;
    activeConvIdRef.current = conversationId;
    if (!chat.activeId) dispatch(setActiveConversation(conversationId));
    dispatch(
      addLocalUserMessage({
        _id: `user-${now}`,
        executionId,
        role: "user",
        content: userMessage,
        conversationId,
      })
    );

    const payload = {
      conversationId,
      userMessage,
      executionId,
      accountId,
      metaAccountId,
      googleAccountId,
      aiContextMetaAccountId,
      ...(options?.startRow !== undefined ? { startRow: options.startRow } : {}),
      ...(options?.endRow !== undefined ? { endRow: options.endRow } : {}),
      ...(options?.rowRange ? { rowRange: options.rowRange } : {}),
      ...(options?.rangeSelector ? { rangeSelector: options.rangeSelector } : {}),
    };

    try {
      sendChatOverSocket(payload);
    } catch (socketErr) {
      console.warn("[AI Agent Chat Hook] Socket fallback to HTTP stream:", socketErr?.message);
      try {
        await chatApi.stream({ ...payload, onEvent: handleEvent });
      } catch (err) {
        console.error("[AI Agent Chat Hook] Error sending chat message:", err);
        handleEvent({ type: "error", message: err.message || "Failed to send message", executionId });
        handleEvent({ type: "done", executionId });
      }
    }
  };

  return {
    ...chat,
    accountId,
    metaAccountId,
    aiContextMetaAccountId,
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
    updatePreparationData: (data) => dispatch(setPreparationData(data)),
    sendMessage,
  };
};
