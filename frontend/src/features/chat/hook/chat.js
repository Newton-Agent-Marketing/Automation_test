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
  setActiveConversation,
  setChatError,
  setSocketConnected,
  setToolStatus,
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

  const handleEvent = (event) => {
    console.log("[AI Agent Chat Hook] Received Event:", event);
    if (event.type === "text_delta") dispatch(appendStreamText(event.content || ""));
    if (event.type === "tool_status") dispatch(setToolStatus(event.status || event.toolName));
    if (event.type === "progress_update") dispatch(updateJobProgress(event));
    if (event.type === "preparation_update") dispatch(setPreparationData(event.session));
    if (event.type === "error") dispatch(setChatError(event.message));
    if (event.type === "done") {
      dispatch(finishStream());
      dispatch(fetchConversations());
      const convId = activeConvIdRef.current || chat.activeId;
      if (convId) {
        dispatch(fetchHistory(convId));
      }
    }
  };

  const sendMessage = async (userMessage, options = {}) => {
    const conversationId = chat.activeId || crypto.randomUUID();
    activeConvIdRef.current = conversationId;
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
      aiContextMetaAccountId,
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
