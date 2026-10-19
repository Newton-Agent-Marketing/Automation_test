import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  Search,
  TrendingUp,
  BarChart2,
  Palette,
  Bot,
  Sparkles,
  Trash2,
  X,
  Radio,
  Globe,
  Users,
  MoreVertical,
  Pencil,
  Check,
  Lock,
  Clock,
  FileSpreadsheet,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LogoMark } from "../../../app/LogoMark";
import { useAuth } from "../../auth/hook/useAuth";
import { useChat } from "../hook/chat";
import { useChannel } from "../../channel/hook/channel";
import { BrandIcon } from "../../channel/components/BrandIcon";
import { MarkdownMessage } from "../components/MarkdownMessage";
import { RowProgressTracker } from "../components/RowProgressTracker";
import { CampaignPreparationCard } from "../components/CampaignPreparationCard";
import { chatApi } from "../service/chat.api";
import { aiContextApi } from "../../aiContext/service/aiContext.api";
import { fetchAiContext } from "../../aiContext/aiContext.slice";
import { useDispatch } from "react-redux";
import { firstName, formatDate, greetingForNow } from "../../../lib/format";

const ALLOWED_CHANNEL_IDS = ["meta", "google"];

const PLATFORMS_META = [
  { id: "meta", name: "Meta Ads", iconType: "meta", color: "#0081FB" },
  { id: "google", name: "Google Ads", iconType: "google", color: "#4285F4" },
  { id: "spotify", name: "Spotify", iconType: "spotify", color: "#1DB954" },
  { id: "linkedin", name: "LinkedIn", iconType: "linkedin", color: "#0A66C2" },
  { id: "taboola", name: "Taboola", iconType: "taboola", color: "#0073FF" },
];

const ACTION_MODES = [
  {
    id: "performance",
    label: "Performance Marketing",
    icon: TrendingUp,
    color: "#3B82F6",
    prompt: "Generate a 30-day performance media plan for our brand",
  },
  {
    id: "report",
    label: "Generate Report",
    icon: BarChart2,
    color: "#10B981",
    prompt: "Generate an advertising performance and ROI report for our active campaigns",
  },
  {
    id: "competitor",
    label: "Research Competitor",
    icon: Search,
    color: "#6366F1",
    prompt: "Analyze top competitor creative strategies and high-converting ad angles",
  },
  {
    id: "creative",
    label: "Generate Creative",
    icon: Palette,
    color: "#EC4899",
    prompt: "Write 5 high-converting ad creative hooks and primary copy variants",
  },
  {
    id: "autonomous",
    label: "Autonomous Agent",
    icon: Bot,
    color: "#F59E0B",
    prompt: "Run autonomous campaign audit and optimize target ROAS and budget pacing",
  },
];

const ALL_CHANNELS_CATALOG = [
  { id: "meta", name: "Meta Ads", iconType: "meta", color: "#0081FB", desc: "Facebook, Instagram & WhatsApp Ads" },
  { id: "google", name: "Google Ads", iconType: "google", color: "#4285F4", desc: "Search & Display Network" },
  { id: "spotify", name: "Spotify", iconType: "spotify", color: "#1DB954", desc: "Audio & Podcast Ads" },
  { id: "linkedin", name: "LinkedIn", iconType: "linkedin", color: "#0A66C2", desc: "B2B & Professional Network" },
  { id: "taboola", name: "Taboola", iconType: "taboola", color: "#0073FF", desc: "Native Discovery Network" },
  { id: "tiktok", name: "TikTok", iconType: "tiktok", color: "#000000", desc: "Short-form Video Ads" },
  { id: "snapchat", name: "Snapchat", iconType: "snapchat", color: "#FFFC00", desc: "AR & Video Story Ads" },
  { id: "twitter", name: "Twitter / X", iconType: "twitter", color: "#0F1419", desc: "Real-time Engagement" },
  { id: "microsoft", name: "Microsoft Ads", iconType: "microsoft", color: "#00A4EF", desc: "Bing & Copilot Network" },
  { id: "apple-music", name: "Apple Music", iconType: "apple", color: "#FA2D48", desc: "Streaming Audio Ads" },
  { id: "jiosaavn", name: "JioSaavn", iconType: "jiosaavn", color: "#2BB0ED", desc: "Music Advertising India" },
  { id: "outbrain", name: "Outbrain", iconType: "outbrain", color: "#EE5220", desc: "Content Recommendation" },
];

const Chat = () => {
  const { user } = useAuth();
  const {
    conversations,
    messages,
    activeId,
    streaming,
    streamText,
    toolStatus,
    jobProgress,
    connected,
    error,
    loadConversations,
    openConversation,
    renameConversation,
    deleteConversation,
    startNewChat,
    sendMessage,
    preparationData,
    updatePreparationData,
    aiContextMetaAccountId,
  } = useChat();

  const dispatch = useDispatch();

  const {
    status,
    accounts,
    loading: channelLoading,
    connecting: channelConnecting,
    loadStatus,
    fetchAccounts,
    connectMeta,
    disconnectMeta,
    connectGeneric,
    disconnectGeneric,
  } = useChannel();

  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [prepActionLoading, setPrepActionLoading] = useState(false);

  const handlePreparationAction = async (action, payload = {}) => {
    if (!activeId) return;
    setPrepActionLoading(true);
    try {
      const activeMetaAcc =
        aiContextMetaAccountId ||
        status?.channels?.metaAds?.activeAccount?.accountId ||
        user?.metaAds?.activeAccount?.accountId;
      const res = await chatApi.preparationAction({
        conversationId: activeId,
        action,
        payload,
        metaAccountId: activeMetaAcc,
        aiContextMetaAccountId,
      });
      const updatedSession =
        res?.data?.session ||
        res?.data?.preparationSession ||
        res?.data?.data?.session ||
        res?.data?.data?.preparationSession ||
        res?.session ||
        res?.preparationSession;
      if (updatedSession) {
        updatePreparationData(updatedSession);
      }
      await openConversation(activeId);
    } catch (err) {
      console.error("Preparation action error:", err);
    } finally {
      setPrepActionLoading(false);
    }
  };
  const [activeModalChannel, setActiveModalChannel] = useState(null);
  const [channelsHubModalOpen, setChannelsHubModalOpen] = useState(false);
  const [performanceMenuOpen, setPerformanceMenuOpen] = useState(false);
  const [selectedActionLabel, setSelectedActionLabel] = useState("Performance Marketing");
  const [activeConvMenuId, setActiveConvMenuId] = useState(null);
  const [editingConvId, setEditingConvId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [genericForm, setGenericForm] = useState({
    accountName: "",
    accountId: "",
    apiKey: "",
    currency: "INR",
  });
  const [modalNotice, setModalNotice] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [sheetSyncInfo, setSheetSyncInfo] = useState(null);
  const [isSyncingSheetDirect, setIsSyncingSheetDirect] = useState(false);
  const messagesEndRef = useRef(null);
  const menuRef = useRef(null);
  const textareaRef = useRef(null);

  const fetchSheetSyncStatus = async () => {
    try {
      const res = await aiContextApi.getSheetSyncStatus();
      if (res.data?.success && res.data.data?.connected) {
        setSheetSyncInfo(res.data.data);
      } else {
        setSheetSyncInfo(null);
      }
    } catch (e) {}
  };

  const handleManualSyncInChat = async () => {
    if (isSyncingSheetDirect) return;
    try {
      setIsSyncingSheetDirect(true);
      const res = await aiContextApi.syncSheet();
      if (res.data?.success) {
        const d = res.data.data || {};
        setSheetSyncInfo((prev) => ({
          ...(prev || {}),
          ...d,
          connected: true,
          syncStatus: "SYNCED",
        }));
        setToastMessage(
          `Spreadsheet Synced: Data through Row #${d.lastRowNumber || d.totalSheetRows || 9} (${d.totalDataRows || d.totalRows || 0} data rows, ${d.eligibleAdRowsCount || 0} eligible for ads, +${d.newRowsCount || 0} new, +${d.updatedRowsCount || 0} updated)`
        );
        setTimeout(() => setToastMessage(""), 5000);
      } else {
        setToastMessage(`Sync Warning: ${res.data?.message || "Failed to sync"}`);
        setTimeout(() => setToastMessage(""), 4000);
      }
    } catch (err) {
      setToastMessage(`Sync Failed: ${err.response?.data?.message || err.message}`);
      setTimeout(() => setToastMessage(""), 4000);
    } finally {
      setIsSyncingSheetDirect(false);
    }
  };

  // Auto-resize input textarea dynamically like ChatGPT
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 220;
      textareaRef.current.style.height = `${Math.min(Math.max(26, scrollHeight), maxHeight)}px`;
    }
  }, [draft]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamText, toolStatus]);

  useEffect(() => {
    loadConversations().then((res) => {
      const convList = res.payload || [];
      if (convList.length > 0 && !activeId) {
        openConversation(convList[0].conversationId);
      }
    });
    loadStatus();
    fetchSheetSyncStatus();
    dispatch(fetchAiContext());
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setPerformanceMenuOpen(false);
      }
      if (activeConvMenuId && !event.target.closest(".conv-dropdown-menu") && !event.target.closest(".conv-options-btn")) {
        setActiveConvMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [performanceMenuOpen, activeConvMenuId]);

  const metaConnected = Boolean(status?.channels?.metaAds?.isConnected);
  const connectedMap = status?.connectedMap || {};
  const connectedList = status?.connectedList || (metaConnected ? [{ id: "meta", name: "Meta Ads", icon: "meta" }] : []);

  const connectedPlatforms = useMemo(() => {
    if (Array.isArray(status?.connectedPlatforms) && status.connectedPlatforms.length > 0) {
      return status.connectedPlatforms;
    }
    const map = new Map();
    (connectedList || []).forEach((ch) => {
      const pKey = (ch.channelId || ch.id || ch.icon || ch.name || "").toLowerCase();
      const normalizedKey = pKey.includes("meta") || pKey.includes("facebook") ? "meta" : pKey.includes("google") ? "google" : pKey;
      if (normalizedKey && !map.has(normalizedKey)) {
        map.set(normalizedKey, {
          id: normalizedKey,
          channelId: normalizedKey,
          name: normalizedKey === "meta" ? "Meta Ads" : normalizedKey === "google" ? "Google Ads" : ch.name || "Platform",
          icon: normalizedKey,
        });
      }
    });
    return Array.from(map.values());
  }, [status?.connectedPlatforms, connectedList]);

  const isChannelConnected = (id) => {
    if (id === "meta") return metaConnected;
    return Boolean(connectedMap[id]?.isConnected);
  };

  const filtered = useMemo(
    () =>
      conversations.filter((item) =>
        (item.title || "").toLowerCase().includes(query.toLowerCase())
      ),
    [conversations, query]
  );

  const showWelcome = messages.length === 0 && !streamText;

  const handleStartNewChat = () => {
    startNewChat();
    setDraft("");
    setToastMessage("Started a new conversation");
    setTimeout(() => setToastMessage(""), 2500);
  };

  const handleToggleConvMenu = (e, convId) => {
    e.stopPropagation();
    setActiveConvMenuId((prev) => (prev === convId ? null : convId));
  };

  const handleStartRename = (item, e) => {
    e.stopPropagation();
    setEditingConvId(item.conversationId);
    setEditingTitle(item.title || "New Chat");
    setActiveConvMenuId(null);
  };

  const handleSaveRename = async (e, convId) => {
    e?.stopPropagation();
    if (!editingTitle.trim()) return;
    try {
      await renameConversation(convId, editingTitle.trim());
      setEditingConvId(null);
      setToastMessage("Conversation renamed successfully");
      setTimeout(() => setToastMessage(""), 2000);
    } catch (err) {
      setToastMessage("Failed to rename conversation");
      setTimeout(() => setToastMessage(""), 2000);
    }
  };

  const handleCancelRename = (e) => {
    e?.stopPropagation();
    setEditingConvId(null);
  };

  const handleDeleteConversation = async (e, convId) => {
    e.stopPropagation();
    setActiveConvMenuId(null);
    try {
      await deleteConversation(convId);
      setToastMessage("Conversation deleted successfully");
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      setToastMessage("Failed to delete conversation");
      setTimeout(() => setToastMessage(""), 2500);
    }
  };

  const handleSelectActionMode = (mode) => {
    setSelectedActionLabel(mode.label);
    setDraft(mode.prompt);
    setPerformanceMenuOpen(false);
    setToastMessage(`Selected: ${mode.label}`);
    setTimeout(() => setToastMessage(""), 2000);
  };

  const handleDisconnectFromHub = async (id) => {
    try {
      if (id === "meta") {
        await disconnectMeta({});
      } else {
        await disconnectGeneric({ channelId: id });
      }
      await loadStatus();
      setToastMessage("Channel disconnected");
      setTimeout(() => setToastMessage(""), 2000);
    } catch (err) {
      setToastMessage("Failed to disconnect channel");
      setTimeout(() => setToastMessage(""), 2000);
    }
  };

  const submit = async (event) => {
    event?.preventDefault();
    if (!draft.trim() || streaming) return;
    const text = draft.trim();
    setDraft("");
    await sendMessage(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handlePlatformClick = (platform) => {
    if (!ALLOWED_CHANNEL_IDS.includes(platform.id)) {
      setToastMessage(`${platform.name} integration is coming soon. Currently only Meta Ads & Google Ads are active.`);
      setTimeout(() => setToastMessage(""), 3000);
      return;
    }
    if (isChannelConnected(platform.id)) {
      setToastMessage(`${platform.name} is connected and active`);
      setTimeout(() => setToastMessage(""), 2500);
    } else {
      openConnectModal(platform);
    }
  };

  const openConnectModal = (platform) => {
    if (!ALLOWED_CHANNEL_IDS.includes(platform.id)) return;
    setActiveModalChannel(platform);
    setModalNotice("");
    setAccessToken("");
    setSelectedAccount("");
    setGenericForm({
      accountName: `${platform.name} Account`,
      accountId: "",
      apiKey: "",
      currency: "INR",
    });
  };

  const closeConnectModal = () => {
    setActiveModalChannel(null);
    setModalNotice("");
  };

  const onFetchMetaAccounts = async (event) => {
    event.preventDefault();
    try {
      const result = await fetchAccounts(accessToken);
      if (result.data?.[0]) setSelectedAccount(result.data[0].fullAccountId || result.data[0].id);
    } catch (err) {
      setModalNotice(err);
    }
  };

  const onConnectMeta = async () => {
    const account = accounts.find(
      (item) => item.fullAccountId === selectedAccount || item.id === selectedAccount
    );
    if (!account) {
      setModalNotice("Please fetch and select an ad account first.");
      return;
    }
    try {
      await connectMeta({
        accountId: account.fullAccountId || account.id,
        accessToken,
        accountName: account.name,
        currency: account.currency,
        timezoneName: account.timezoneName,
      });
      closeConnectModal();
      await loadStatus();
      setToastMessage("Meta Ads connected successfully!");
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      setModalNotice(err);
    }
  };

  const onConnectGeneric = async (event) => {
    event.preventDefault();
    if (!activeModalChannel) return;

    try {
      await connectGeneric({
        channelId: activeModalChannel.id,
        channelName: activeModalChannel.name,
        accountId: genericForm.accountId || `${activeModalChannel.id}-act-${Date.now().toString().slice(-4)}`,
        accountName: genericForm.accountName || `${activeModalChannel.name} Account`,
        apiKey: genericForm.apiKey,
        accessToken: genericForm.apiKey,
        currency: genericForm.currency,
      });
      closeConnectModal();
      await loadStatus();
      setToastMessage(`${activeModalChannel.name} connected successfully!`);
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      setModalNotice(err);
    }
  };

  const userName = firstName(user?.name || "Ayush");

  return (
    <div className={`chat-layout ${drawerCollapsed ? "drawer-collapsed" : ""}`}>
      {/* Left Chat History Drawer */}
      <aside className="chat-list-drawer">
        <div className="chat-drawer-header">
          <h3 className="drawer-title">Chats</h3>
          <div className="chat-drawer-header-actions">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="new-chat-btn"
              onClick={handleStartNewChat}
              aria-label="New chat"
              title="Start new chat"
            >
              <Plus size={16} />
            </motion.button>
            <button
              type="button"
              className="chat-drawer-collapse-btn"
              onClick={() => setDrawerCollapsed(true)}
              aria-label="Collapse chats sidebar"
              title="Hide chats sidebar"
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        </div>

        <div className="chat-search-wrapper">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="Search chats..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="chat-search-input"
          />
        </div>

        <div className="conversation-scroll-list">
          <AnimatePresence>
            {filtered.map((item) => (
              <motion.div
                key={item.conversationId}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                className={`conversation-item ${activeId === item.conversationId ? "active" : ""}`}
                onClick={() => {
                  if (editingConvId !== item.conversationId) {
                    openConversation(item.conversationId);
                  }
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (editingConvId !== item.conversationId && (e.key === "Enter" || e.key === " ")) {
                    openConversation(item.conversationId);
                  }
                }}
              >
                <FileText size={15} className="conv-icon" />

                {editingConvId === item.conversationId ? (
                  <div className="conv-rename-wrapper" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      className="conv-rename-input"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRename(e, item.conversationId);
                        if (e.key === "Escape") handleCancelRename(e);
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="conv-rename-action-btn save"
                      title="Save (Enter)"
                      onClick={(e) => handleSaveRename(e, item.conversationId)}
                    >
                      <Check size={12} />
                    </button>
                    <button
                      type="button"
                      className="conv-rename-action-btn cancel"
                      title="Cancel (Esc)"
                      onClick={handleCancelRename}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="conv-content">
                      <strong className="conv-title">{item.title || "New Chat"}</strong>
                      <span className="conv-date">{formatDate(item.updatedAt || item.createdAt)}</span>
                    </div>

                    <button
                      type="button"
                      className={`conv-options-btn ${activeConvMenuId === item.conversationId ? "active" : ""}`}
                      title="Conversation options"
                      aria-label="Options"
                      onClick={(e) => handleToggleConvMenu(e, item.conversationId)}
                    >
                      <MoreVertical size={14} />
                    </button>

                    <AnimatePresence>
                      {activeConvMenuId === item.conversationId && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -4 }}
                          transition={{ duration: 0.12, ease: "easeOut" }}
                          className="conv-dropdown-menu"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="conv-dropdown-item"
                            onClick={(e) => handleStartRename(item, e)}
                          >
                            <Pencil size={13} color="#64748B" />
                            <span>Rename</span>
                          </button>
                          <button
                            type="button"
                            className="conv-dropdown-item danger"
                            onClick={(e) => {
                              setActiveConvMenuId(null);
                              handleDeleteConversation(e, item.conversationId);
                            }}
                          >
                            <Trash2 size={13} color="#DC2626" />
                            <span>Delete</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <div className="empty-chats-hint">No chats found. Click + to start a new chat.</div>
          )}
        </div>
      </aside>

      {/* Main Chat Stage */}
      <section className="chat-main-stage">
        <header className="chat-top-bar">
          <div className="chat-header-info">
            {drawerCollapsed && (
              <button
                type="button"
                className="chat-drawer-expand-btn"
                onClick={() => setDrawerCollapsed(false)}
                aria-label="Expand chats sidebar"
                title="Show chats sidebar"
              >
                <ChevronRight size={15} />
              </button>
            )}
            <div className="chat-header-titles">
              <h2>Newton AI Agent</h2>
              <p>Ask me anything about your marketing campaigns</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {sheetSyncInfo && sheetSyncInfo.connected && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "4px 10px",
                  borderRadius: 18,
                  backgroundColor: sheetSyncInfo.syncStatus === "FAILED" ? "#FEF2F2" : "#F0FDF4",
                  border: sheetSyncInfo.syncStatus === "FAILED" ? "1px solid #FECACA" : "1px solid #BBF7D0",
                  fontSize: "11px",
                  color: sheetSyncInfo.syncStatus === "FAILED" ? "#991B1B" : "#166534",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                <FileSpreadsheet size={13} color={sheetSyncInfo.syncStatus === "FAILED" ? "#DC2626" : "#16A34A"} />
                <span
                  style={{ fontWeight: 700, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={`${sheetSyncInfo.spreadsheetName} (${sheetSyncInfo.worksheetName})`}
                >
                  {sheetSyncInfo.spreadsheetName}
                </span>
                <span style={{ color: "#64748B", fontSize: "10.5px" }}>({sheetSyncInfo.worksheetName})</span>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: 8,
                    backgroundColor: sheetSyncInfo.syncStatus === "FAILED" ? "#FEE2E2" : "#DCFCE7",
                    color: sheetSyncInfo.syncStatus === "FAILED" ? "#B91C1C" : "#15803D",
                  }}
                  title={`Sheet data through Row #${sheetSyncInfo.lastRowNumber || (sheetSyncInfo.totalSheetRows || 9)} (${sheetSyncInfo.totalSheetRows || ((sheetSyncInfo.totalDataRows || sheetSyncInfo.totalRows || 0) + 1)} total rows with data). Header at Row #${sheetSyncInfo.headerRowNumber || 1}. ${sheetSyncInfo.totalDataRows || sheetSyncInfo.totalRows || 0} data rows.`}
                >
                  {isSyncingSheetDirect ? "Syncing..." : sheetSyncInfo.syncStatus === "FAILED" ? "Failed" : `${sheetSyncInfo.totalDataRows || sheetSyncInfo.totalRows || 0} data rows (through Row #${sheetSyncInfo.lastRowNumber || sheetSyncInfo.totalSheetRows || 9})`}
                </span>
                <button
                  type="button"
                  disabled={isSyncingSheetDirect}
                  onClick={handleManualSyncInChat}
                  title="Sync latest rows from Google Sheets"
                  style={{
                    background: "none",
                    border: "none",
                    padding: "2px 4px",
                    cursor: isSyncingSheetDirect ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    color: sheetSyncInfo.syncStatus === "FAILED" ? "#DC2626" : "#16A34A",
                    borderRadius: 4,
                  }}
                >
                  <RefreshCw size={11} style={isSyncingSheetDirect ? { animation: "spin 1s linear infinite" } : {}} />
                </button>
              </div>
            )}
            <div className={`chat-status-indicator ${connected ? "online" : ""}`}>
              <span className="status-dot" />
              <span>{connected ? "Live" : "Connecting"}</span>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="form-info-banner"
              style={{ margin: "12px 28px 0" }}
            >
              {toastMessage}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="chat-body-area">
          {showWelcome ? (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="welcome-hero-state"
            >
              <LogoMark size={56} />
              <h1 className="welcome-greeting">
                {greetingForNow()}, {userName}
              </h1>
              <p className="welcome-desc">
                Connect with 100s of marketing platforms to run campaigns and acquire users and drive sales
              </p>

              {/* Platform Badges with Smooth Spring Interactivity */}
              <div className="platform-badges-row">
                {PLATFORMS_META.map((p, idx) => {
                  const isConn = isChannelConnected(p.id);
                  const isAvailable = ALLOWED_CHANNEL_IDS.includes(p.id);
                  return (
                    <motion.div
                      key={`platform-hero-${p.id || idx}`}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.06, duration: 0.2 }}
                      whileHover={isAvailable ? { y: -3, scale: 1.05 } : {}}
                      whileTap={isAvailable ? { scale: 0.94 } : {}}
                      className={`platform-icon-circle ${isConn ? "is-connected" : ""} ${!isAvailable ? "is-coming-soon" : ""}`}
                      title={isConn ? `${p.name} (Connected)` : isAvailable ? `Click to connect ${p.name}` : `${p.name} (Coming Soon)`}
                      onClick={() => handlePlatformClick(p)}
                      style={{ cursor: isAvailable ? "pointer" : "default", position: "relative" }}
                    >
                      <BrandIcon type={p.iconType} size={30} />
                      {isConn && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: -2,
                            right: -2,
                            backgroundColor: "#16A34A",
                            borderRadius: "50%",
                            width: 12,
                            height: 12,
                            border: "2px solid #FFFFFF",
                            zIndex: 3,
                          }}
                        />
                      )}
                      {!isAvailable && (
                        <div className="platform-hero-overlay">
                          <Lock size={10} color="#64748B" />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            <div className="chat-messages-container">
              <AnimatePresence initial={false}>
                {messages.map((message) => (
                  <motion.article
                    key={message._id || message.createdAt}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className={`chat-bubble ${message.role}`}
                  >
                    <MarkdownMessage
                      content={message.content}
                      role={message.role}
                      id={message._id}
                      toolCalls={message.toolCalls}
                      tokenUsage={message.tokenUsage}
                    />
                    {message.preparationData && (
                      <div className="mt-4 w-full">
                        <CampaignPreparationCard
                          session={message.preparationData}
                          onApprove={() => handlePreparationAction("APPROVE")}
                          onEdit={(instructions) => handlePreparationAction("EDIT", { instructions })}
                          onAnswerField={(answers) => handlePreparationAction("ANSWER", { answers })}
                          isSending={prepActionLoading}
                        />
                      </div>
                    )}
                    {message.jobProgress && <RowProgressTracker jobProgress={message.jobProgress} />}
                  </motion.article>
                ))}
              </AnimatePresence>

              {/* Active preparation session if newer or not attached to the last message */}
              {preparationData &&
                (!messages.length ||
                  !messages[messages.length - 1]?.preparationData ||
                  messages[messages.length - 1]?.preparationData?.sessionId !== preparationData?.sessionId ||
                  messages[messages.length - 1]?.preparationData?.status !== preparationData?.status ||
                  messages[messages.length - 1]?.preparationData?.updatedAt !== preparationData?.updatedAt ||
                  messages[messages.length - 1]?.preparationData?.preview?.version !== preparationData?.preview?.version) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full my-4"
                  >
                    <CampaignPreparationCard
                      session={preparationData}
                      onApprove={() => handlePreparationAction("APPROVE")}
                      onEdit={(instructions) => handlePreparationAction("EDIT", { instructions })}
                      onAnswerField={(answers) => handlePreparationAction("ANSWER", { answers })}
                      isSending={prepActionLoading}
                    />
                  </motion.div>
                )}

              {streamText && (
                <motion.article
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="chat-bubble assistant streaming"
                >
                  <MarkdownMessage
                    content={streamText}
                    role="assistant"
                    id="streaming-msg"
                  />
                  {jobProgress && <RowProgressTracker jobProgress={jobProgress} />}
                </motion.article>
              )}

              {!streamText && jobProgress && <RowProgressTracker jobProgress={jobProgress} />}

              {toolStatus && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="tool-status-pill"
                >
                  <Sparkles size={14} className="sparkle-spin" />
                  <span>{toolStatus}</span>
                </motion.div>
              )}
              <div ref={messagesEndRef} style={{ height: 1 }} />
            </div>
          )}
        </div>

        {error && <div className="chat-error-banner">{error}</div>}

        {/* Floating Composer */}
        <div className="composer-outer-wrapper">
          <form className="floating-composer-card" onSubmit={submit}>
            <div className="composer-input-area">
              <textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Newton to create a media plan or launch a campaign..."
                className="composer-textarea"
              />
            </div>

            <div className="composer-bottom-row">
              <div className="composer-bottom-left">
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  type="button"
                  className="composer-action-btn"
                  onClick={handleStartNewChat}
                  title="Create New Chat"
                  aria-label="New Chat"
                >
                  <Plus size={15} />
                </motion.button>

                {/* Performance Marketing Modes Popover */}
                <div className="performance-menu-wrapper" ref={menuRef}>
                  <button
                    type="button"
                    className="performance-pill-btn"
                    onClick={() => setPerformanceMenuOpen(!performanceMenuOpen)}
                    title="Choose AI action mode"
                    aria-label="Action Mode"
                  >
                    <TrendingUp size={13} color="#3B82F6" />
                    <span>{selectedActionLabel}</span>
                    <ChevronDown
                      size={13}
                      style={{
                        transform: performanceMenuOpen ? "rotate(180deg)" : "none",
                        transition: "transform 0.15s ease",
                      }}
                    />
                  </button>

                  <AnimatePresence>
                    {performanceMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="action-modes-popup"
                      >
                        {ACTION_MODES.map((mode) => {
                          const IconComp = mode.icon;
                          const isActive = selectedActionLabel === mode.label;
                          return (
                            <button
                              key={mode.id}
                              type="button"
                              className={`action-mode-item ${isActive ? "active" : ""}`}
                              onClick={() => handleSelectActionMode(mode)}
                            >
                              <IconComp size={15} color={mode.color} className="action-mode-icon" />
                              <span>{mode.label}</span>
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Dynamic Connected Platforms Info & Popover Trigger */}
                <div className="connected-platforms-meta">
                  <span
                    className="platform-label"
                    style={{ cursor: "pointer" }}
                    onClick={() => setChannelsHubModalOpen(true)}
                    title="Click to view all channels"
                  >
                    Platforms:
                  </span>
                  {connectedPlatforms.length > 0 ? (
                    connectedPlatforms.map((ch, idx) => (
                      <span
                        key={`conn-platform-${ch.id || ch.channelId || idx}`}
                        className="platform-mini-badge"
                        title={`${ch.name || 'Platform'} (Connected - click to manage)`}
                        style={{ cursor: "pointer" }}
                        onClick={() => setChannelsHubModalOpen(true)}
                      >
                        {(ch.id === "meta" || ch.channelId === "meta")
                          ? "∞"
                          : (ch.id === "google" || ch.channelId === "google")
                          ? "G"
                          : (ch.name ? ch.name.slice(0, 1) : "P")}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "#94A3B8" }}>None</span>
                  )}
                  <button
                    type="button"
                    className="add-more-link"
                    onClick={() => setChannelsHubModalOpen(true)}
                    title="Open Channels Hub"
                  >
                    + Add
                  </button>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.92 }}
                type="submit"
                className="send-circle-btn"
                disabled={streaming || !draft.trim()}
                aria-label="Send message"
              >
                <ArrowUp size={16} />
              </motion.button>
            </div>
          </form>

          <p className="chat-disclaimer-text">
            Newton may make mistakes. Verify important marketing and budget decisions.
          </p>
        </div>
      </section>

      {/* Channels Hub Modal Triggered from "+ Add more" or "Connected platforms" */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {channelsHubModalOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="modal-backdrop"
                onClick={() => setChannelsHubModalOpen(false)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="modal-dialog-card"
                  style={{ maxWidth: 640, width: "95%" }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="modal-header">
                    <div>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Marketing Channels Hub</h3>
                      <p className="modal-desc" style={{ margin: "4px 0 0", fontSize: 12.5 }}>
                        Connect and synchronize your active marketing and advertising accounts.
                      </p>
                    </div>
                    <button className="modal-close-btn" onClick={() => setChannelsHubModalOpen(false)}>
                      <X size={18} />
                    </button>
                  </div>

                  <div className="channels-hub-grid">
                    {ALL_CHANNELS_CATALOG.map((item) => {
                      const isConn = isChannelConnected(item.id);
                      const isAvailable = ALLOWED_CHANNEL_IDS.includes(item.id);
                      return (
                        <div
                          key={item.id}
                          className={`channel-hub-card ${isConn ? "connected" : ""} ${!isAvailable ? "is-coming-soon" : ""}`}
                        >
                          {/* Frosted Transparent Overlay for Inactive Platforms */}
                          {!isAvailable && (
                            <div className="channel-hub-overlay">
                              <div className="channel-hub-overlay-pill">
                                <Lock size={10} />
                                <span>Coming Soon</span>
                              </div>
                            </div>
                          )}

                          <div className="channel-hub-info">
                            <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <BrandIcon type={item.iconType} size={26} />
                            </div>
                            <div>
                              <div className="channel-hub-name">{item.name}</div>
                              <div style={{ fontSize: 11, color: isConn ? "#16A34A" : !isAvailable ? "#94A3B8" : "#64748B" }}>
                                {isConn ? "● Active" : !isAvailable ? "Coming Soon" : "Disconnected"}
                              </div>
                            </div>
                          </div>

                          <div>
                            {!isAvailable ? (
                              <button
                                type="button"
                                className="channel-hub-btn disabled"
                                disabled
                              >
                                Coming Soon
                              </button>
                            ) : isConn ? (
                              <button
                                type="button"
                                className="channel-hub-btn disconnect"
                                onClick={() => handleDisconnectFromHub(item.id)}
                              >
                                Disconnect
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="channel-hub-btn connect"
                                onClick={() => {
                                  setChannelsHubModalOpen(false);
                                  openConnectModal(item);
                                }}
                              >
                                Connect
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Pop-up Modal to Connect Channel from Chat */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {activeModalChannel && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="modal-backdrop"
                onClick={closeConnectModal}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="modal-dialog-card"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="modal-header">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <BrandIcon type={activeModalChannel.iconType} size={30} />
                      <h3>Connect {activeModalChannel.name}</h3>
                    </div>
                    <button className="modal-close-btn" onClick={closeConnectModal}>
                      <X size={18} />
                    </button>
                  </div>

                  <p className="modal-desc">
                    {activeModalChannel.id === "meta"
                      ? "Paste your Meta Access Token to fetch and link your advertising account directly."
                      : activeModalChannel.id === "google"
                      ? "Connect your Google Ads account to synchronize Search, Display, and Performance Max campaigns with Newton AI Agent."
                      : `Enter your ${activeModalChannel.name} credentials to connect and synchronize ad campaigns.`}
                  </p>

                  {modalNotice && (
                    <div className="form-error-box">
                      <p className="form-error">{modalNotice}</p>
                    </div>
                  )}

                  {activeModalChannel.id === "meta" ? (
                    <div>
                      <form onSubmit={onFetchMetaAccounts} className="modal-form">
                        <label className="auth-label">
                          <span>Meta Access Token</span>
                          <input
                            type="text"
                            placeholder="EAAB..."
                            value={accessToken}
                            onChange={(event) => setAccessToken(event.target.value)}
                            required
                          />
                        </label>
                        <button className="primary-btn" type="submit" disabled={channelLoading}>
                          {channelLoading ? "Verifying Token..." : "Fetch Ad Accounts"}
                        </button>
                      </form>

                      {accounts.length > 0 && (
                        <div className="modal-accounts-section">
                          <label className="auth-label">
                            <span>Select Ad Account</span>
                            <select
                              value={selectedAccount}
                              onChange={(event) => setSelectedAccount(event.target.value)}
                              className="filter-control"
                            >
                              {accounts.map((account) => (
                                <option key={account.id} value={account.fullAccountId || account.id}>
                                  {account.name} ({account.currency})
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="primary-btn"
                            onClick={onConnectMeta}
                            disabled={channelConnecting}
                            style={{ marginTop: 12 }}
                          >
                            {channelConnecting ? "Connecting..." : "Confirm & Connect Account"}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={onConnectGeneric} className="modal-form">
                      <label className="auth-label">
                        <span>Account / Profile Name</span>
                        <input
                          type="text"
                          placeholder={activeModalChannel.id === "google" ? "e.g. Acme Google Ads Main" : "e.g. Acme Marketing"}
                          value={genericForm.accountName}
                          onChange={(e) => setGenericForm({ ...genericForm, accountName: e.target.value })}
                          required
                        />
                      </label>

                      <div className="form-grid">
                        <label className="auth-label">
                          <span>{activeModalChannel.id === "google" ? "Google Customer ID (XXX-XXX-XXXX)" : "Account / Client ID"}</span>
                          <input
                            type="text"
                            placeholder={activeModalChannel.id === "google" ? "e.g. 123-456-7890" : "e.g. 123-456-7890"}
                            value={genericForm.accountId}
                            onChange={(e) => setGenericForm({ ...genericForm, accountId: e.target.value })}
                          />
                        </label>

                        <label className="auth-label">
                          <span>Currency</span>
                          <select
                            value={genericForm.currency}
                            onChange={(e) => setGenericForm({ ...genericForm, currency: e.target.value })}
                            className="auth-select"
                          >
                            <option value="INR">INR (₹)</option>
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (€)</option>
                            <option value="GBP">GBP (£)</option>
                          </select>
                        </label>
                      </div>

                      <label className="auth-label">
                        <span>{activeModalChannel.id === "google" ? "Developer Token / API Key" : "API Key / Access Token"}</span>
                        <input
                          type="password"
                          placeholder={activeModalChannel.id === "google" ? "Enter Google Ads API / Developer token" : "Enter API key or Token"}
                          value={genericForm.apiKey}
                          onChange={(e) => setGenericForm({ ...genericForm, apiKey: e.target.value })}
                        />
                      </label>

                      <button className="primary-btn" type="submit" disabled={channelConnecting}>
                        {channelConnecting ? "Connecting..." : `Connect ${activeModalChannel.name}`}
                      </button>
                    </form>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};

export default Chat;

