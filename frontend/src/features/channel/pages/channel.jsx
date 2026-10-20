import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Globe,
  Radio,
  Users,
  X,
  Check,
  Server,
  ShieldCheck,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Clock,
  Lock,
  ArrowLeft,
  Trash2,
  Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useChannel } from "../hook/channel";
import { BrandIcon } from "../components/BrandIcon";
import { channelApi } from "../service/channel.api";

const ALLOWED_CHANNEL_IDS = ["meta", "google"];

const META_REDIRECT_URI = import.meta.env.VITE_META_REDIRECT_URI || "https://automation-test-97z6.onrender.com/oauth/callback";
const GOOGLE_REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI || "https://automation-test-97z6.onrender.com/oauth/callback";
  

const TABS = [
  "All Channels", 
  "CTV Advertising",
  "Social Media",
  "Audio Advertising",
  "D-COM",
  "In-App",
  "Web",
];

const CATALOG = [
  {
    group: "Audio",
    countLabel: "3 platforms available",
    category: "Audio Advertising",
    iconTone: "green",
    items: [
      {
        id: "spotify",
        name: "Spotify",
        blurb: "Audio and podcast advertising on Spotify",
        formats: ["audio", "video", "display"],
        color: "#1DB954",
        iconType: "spotify",
      },
      {
        id: "jiosaavn",
        name: "JioSaavn",
        blurb: "Music streaming advertising in India",
        formats: ["audio", "display"],
        color: "#2BB0ED",
        iconType: "jiosaavn",
      },
      {
        id: "apple-music",
        name: "Apple Music",
        blurb: "Audio advertising on Apple Music",
        formats: ["audio"],
        color: "#FC3C44",
        iconType: "apple",
      },
    ],
  },
  {
    group: "Social",
    countLabel: "5 platforms available",
    category: "Social Media",
    iconTone: "pink",
    items: [
      {
        id: "meta",
        name: "Meta Ads",
        blurb: "Advertise on Facebook, Instagram, Messenger, and WhatsApp via MCP Server & OAuth",
        formats: ["image", "video", "carousel", "+2"],
        color: "#0081FB",
        iconType: "meta",
      },
      {
        id: "linkedin",
        name: "LinkedIn",
        blurb: "Professional network advertising",
        formats: ["image", "video", "carousel", "+1"],
        color: "#0A66C2",
        iconType: "linkedin",
      },
      {
        id: "twitter",
        name: "Twitter/X",
        blurb: "Real-time social media advertising",
        formats: ["image", "video", "carousel"],
        color: "#1DA1F2",
        iconType: "twitter",
      },
      {
        id: "tiktok",
        name: "TikTok",
        blurb: "Short-form video advertising on TikTok",
        formats: ["video", "spark ads"],
        color: "#111111",
        iconType: "tiktok",
      },
      {
        id: "snapchat",
        name: "Snapchat",
        blurb: "Augmented reality and video ads on Snapchat",
        formats: ["video", "story", "ar lens"],
        color: "#EAB308",
        iconType: "snapchat",
      },
    ],
  },
  {
    group: "Web",
    countLabel: "4 platforms available",
    category: "Web",
    iconTone: "orange",
    items: [
      {
        id: "google",
        name: "Google Ads",
        blurb: "Search and display advertising on Google network",
        formats: ["text", "image", "video", "+1"],
        color: "#4285F4",
        iconType: "google",
      },
      {
        id: "taboola",
        name: "Taboola",
        blurb: "Native advertising and content discovery",
        formats: ["native", "image"],
        color: "#0073FF",
        iconType: "taboola",
      },
      {
        id: "microsoft",
        name: "Microsoft Advertising",
        blurb: "Search advertising on Bing network",
        formats: ["text", "image"],
        color: "#00A4EF",
        iconType: "microsoft",
      },
      {
        id: "outbrain",
        name: "Outbrain",
        blurb: "Native advertising platform",
        formats: ["native"],
        color: "#EE1B24",
        iconType: "outbrain",
      },
    ],
  },
];

export const ChannelIcon = ({ type, color, size = 36 }) => {
  return (
    <div className="brand-logo-badge" style={{ width: size, height: size }}>
      <BrandIcon type={type} size={size * 0.72} />
    </div>
  );
};

const Channel = () => {
  const {
    status,
    accounts,
    loading,
    connecting,
    error,
    message,
    loadStatus,
    getOAuthUrl,
    handleOAuthCallback,
    connectMcpServer,
    fetchAccounts,
    connectMeta,
    selectMetaAccount,
    disconnectMeta,
    getGoogleOAuthUrl,
    handleGoogleOAuthCallback,
    connectGoogleMcpServer,
    fetchGoogleAccounts,
    selectGoogleAccount,
    connectGoogle,
    disconnectGoogle,
    connectGeneric,
    disconnectGeneric,
  } = useChannel();

  const [tab, setTab] = useState("All Channels");
  const [activeModalChannel, setActiveModalChannel] = useState(null);
  const [metaConnectMode, setMetaConnectMode] = useState("mcp_oauth"); // "mcp_oauth" | "token"
  const [mcpServerUrl, setMcpServerUrl] = useState("http://localhost:8000/sse");
  const [accessToken, setAccessToken] = useState("");
  const [developerToken, setDeveloperToken] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [oauthStepStatus, setOauthStepStatus] = useState("");
  const [modalMode, setModalMode] = useState("connect"); // "manage" | "connect"
  const [genericForm, setGenericForm] = useState({
    accountName: "",
    accountId: "",
    apiKey: "",
    currency: "INR",
  });
  const [customAccountId, setCustomAccountId] = useState("");
  const [customAccountName, setCustomAccountName] = useState("");
  const [notice, setNotice] = useState("");

  // Check URL query parameters for Meta/Google OAuth callback & popup handshake
  useEffect(() => {
    loadStatus();

    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (code) {
      let isGoogle = false;
      let isDrive = false;
      if (state) {
        try {
          const parsed = JSON.parse(atob(state));
          if (parsed.channel === "google_drive" || parsed.channel === "drive" || parsed.type === "drive") {
            isDrive = true;
          } else if (parsed.channel === "google") {
            isGoogle = true;
          }
        } catch (e) {
          if (typeof state === "string" && (state.includes("drive") || state.includes("google_drive"))) {
            isDrive = true;
          } else if (typeof state === "string" && state.includes("google")) {
            isGoogle = true;
          }
        }
      }

      // If we are running inside the popup window opened by parent
      if (window.opener && window.opener !== window) {
        try {
          const type = isDrive
            ? "GOOGLE_DRIVE_OAUTH_SUCCESS"
            : isGoogle
            ? "GOOGLE_OAUTH_SUCCESS"
            : "META_OAUTH_SUCCESS";
          window.opener.postMessage(
            { type, code, state, channel: isDrive ? "google_drive" : isGoogle ? "google" : "meta", connected: true },
            window.location.origin
          );
          window.opener.postMessage("oauth-success", window.location.origin);
        } catch (e) {
          console.warn("[OAuth Popup postMessage]:", e);
        }
        window.close();
        return;
      }

      // If this was a Google Drive OAuth callback in main window, redirect directly to /ai-context
      if (isDrive) {
        window.location.href = "/ai-context?drive_connected=true";
        return;
      }

      // If redirected directly in the main browser window
      const processCallback = async () => {
        try {
          if (isGoogle) {
            setNotice("Processing Google Ads OAuth authorization callback...");
            const res = await handleGoogleOAuthCallback({
              code,
              state,
            });
            setNotice(res.message || "Google Ads connected successfully!");
            window.history.replaceState({}, document.title, window.location.pathname);
            try {
              await channelApi.resyncChannel("google");
            } catch (syncErr) {
              console.warn("[Post-Connect Sync]:", syncErr.message);
            }
          } else {
            setNotice("Processing Meta OAuth authorization callback...");
            const res = await handleOAuthCallback({
              code,
              state,
              redirectUri: META_REDIRECT_URI,
            });
            setNotice(res.message || "Meta Ads connected successfully!");
            window.history.replaceState({}, document.title, window.location.pathname);
            try {
              await channelApi.resyncChannel("meta");
            } catch (syncErr) {
              console.warn("[Post-Connect Sync]:", syncErr.message);
            }
          }
          await loadStatus();
        } catch (err) {
          setNotice(`OAuth Error: ${err}`);
        }
      };
      processCallback();
    }
  }, []);

  const metaConnected = Boolean(status?.channels?.metaAds?.isConnected);
  const googleConnected = Boolean(status?.channels?.googleAds?.isConnected);
  const connectedMap = status?.connectedMap || {};
  const activeMetaAccount = status?.channels?.metaAds?.activeAccount;
  const activeGoogleAccount = status?.channels?.googleAds?.activeAccount;

  const isChannelConnected = (id) => {
    if (id === "meta") return metaConnected;
    if (id === "google") return googleConnected;
    return Boolean(connectedMap[id]?.isConnected);
  };

  const groups = useMemo(() => {
    if (tab === "All Channels") return CATALOG;
    return CATALOG.filter((group) => group.category === tab);
  }, [tab]);

  const openConnectModal = (item, preferredMode) => {
    if (!ALLOWED_CHANNEL_IDS.includes(item.id)) return;
    setActiveModalChannel(item);
    setNotice("");
    setOauthStepStatus("");
    setAccessToken("");
    setSelectedAccount("");
    setMetaConnectMode("mcp_oauth");
    const isConn = isChannelConnected(item.id);
    setModalMode(preferredMode || (isConn ? "manage" : "connect"));
    setGenericForm({
      accountName: `${item.name} Main`,
      accountId: "",
      apiKey: "",
      currency: "INR",
    });
  };

  const closeConnectModal = () => {
    setActiveModalChannel(null);
    setNotice("");
    setOauthStepStatus("");
  };

  // Step 1 - 12: Meta MCP Server & OAuth Connection Trigger
  const onInitiateMetaMcpOAuth = async (event) => {
    if (event) event.preventDefault();
    setNotice("");
    setOauthStepStatus("Generating Meta OAuth 2.0 authorization dialog...");

    try {
      console.log("[Meta OAuth Init Redirect URI]:", META_REDIRECT_URI);
      // Step 1: Generate Meta OAuth authorization URL
      const oauthData = await getOAuthUrl({
        mcpServerUrl: mcpServerUrl,
        redirectUri: META_REDIRECT_URI,
      });

      const authUrl = oauthData?.oauthUrl;
      if (!authUrl) {
        throw new Error("Unable to obtain Meta OAuth URL. Please check your configuration.");
      }

      console.log("[Meta OAuth Full Auth URL]:", authUrl);
      setOauthStepStatus(`Opening Meta login window with redirect_uri: ${META_REDIRECT_URI}...`);

      // Step 2: Open Meta authorization dialog in a popup window
      const popupWidth = 620;
      const popupHeight = 720;
      const left = window.screenX + (window.outerWidth - popupWidth) / 2;
      const top = window.screenY + (window.outerHeight - popupHeight) / 2;

      const authPopup = window.open(
        authUrl,
        "MetaAdsOAuthWindow",
        `width=${popupWidth},height=${popupHeight},left=${left},top=${top},status=no,toolbar=no,menubar=no`
      );

      if (!authPopup || authPopup.closed || typeof authPopup.closed === "undefined") {
        setOauthStepStatus("Redirecting to Meta authorization page...");
        window.location.href = authUrl;
        return;
      }

      setOauthStepStatus("Awaiting user login & permission approval on Meta...");

      // Complete OAuth token exchange & sync helper
      const completeOAuthExchange = async (authCode, authState) => {
        console.log("[Frontend Meta OAuth] completeOAuthExchange triggered with Code:", authCode ? `${authCode.slice(0, 15)}...` : null);
        setOauthStepStatus("Exchanging authorization code for Meta token & ad accounts...");
        try {
          const result = await handleOAuthCallback({
            code: authCode,
            state: authState,
            mcpServerUrl: mcpServerUrl,
            redirectUri: META_REDIRECT_URI,
          });

          console.log("[Frontend Meta OAuth] Backend exchange successful result:", result);

          // Post-connect sync ensure
          try {
            await channelApi.resyncChannel("meta");
          } catch (syncErr) {
            console.warn("[Post-Connect Sync Warning]:", syncErr.message);
          }

          setNotice(result.message || "Meta Ads connected successfully!");
          closeConnectModal();
          await loadStatus();
        } catch (err) {
          console.error("[Frontend Meta OAuth Error]:", err);
          setNotice(err?.message || String(err));
          setOauthStepStatus("");
        }
      };

      // Step 3: Listen for OAuth code message from popup window
      const onMessageReceived = async (event) => {
        if (event.data?.type === "META_OAUTH_SUCCESS" && event.data.code) {
          console.log("[Frontend Meta OAuth] postMessage received from OAuth popup window!", event.data);
          window.removeEventListener("message", onMessageReceived);
          if (authPopup && !authPopup.closed) authPopup.close();
          await completeOAuthExchange(event.data.code, event.data.state);
        }
      };
      window.addEventListener("message", onMessageReceived);

      // Step 4: Fallback polling if postMessage blocked by cross-origin
      const pollTimer = setInterval(async () => {
        try {
          if (!authPopup || authPopup.closed) {
            clearInterval(pollTimer);
            window.removeEventListener("message", onMessageReceived);
            setOauthStepStatus("");
            return;
          }

          const currentUrl = authPopup.location?.href;
          if (currentUrl && currentUrl.includes("code=")) {
            clearInterval(pollTimer);
            window.removeEventListener("message", onMessageReceived);
            const popupParams = new URLSearchParams(authPopup.location.search);
            const authCode = popupParams.get("code");
            const authState = popupParams.get("state");
            authPopup.close();

            if (authCode) {
              await completeOAuthExchange(authCode, authState);
            }
          }
        } catch (crossOriginErr) {
          // Cross-origin read is blocked until redirected back to our origin; ignore
        }
      }, 750);
    } catch (error) {
      setNotice(error?.message || "Failed to start Meta OAuth dialog");
      setOauthStepStatus("");
    }
  };

  const onConnectMcpDirectOnly = async (e) => {
    if (e) e.preventDefault();
    setNotice("");
    setOauthStepStatus("Connecting Meta MCP Server directly...");
    try {
      const result = await connectMcpServer({
        mcpServerUrl,
        channelId: "meta",
        accountId: customAccountId || undefined,
        accountName: customAccountName || undefined,
      });
      setNotice(result.message || "Meta MCP Server connected!");
      closeConnectModal();
      await loadStatus();
    } catch (err) {
      setNotice(err?.message || String(err));
      setOauthStepStatus("");
    }
  };

  const onFetchMetaAccounts = async (event) => {
    event.preventDefault();
    setNotice("");
    try {
      const res = await fetchAccounts(accessToken);
      const list = res?.data || (Array.isArray(res) ? res : []);
      if (list && list.length > 0) {
        setSelectedAccount(list[0].fullAccountId || list[0].id || list[0].accountId);
      }
    } catch (err) {
      setNotice(err);
    }
  };

  const onConnectMetaDirect = async () => {
    const account = accounts.find((item) => (item.fullAccountId || item.id) === selectedAccount) || accounts[0];
    if (!account) return;

    try {
      await connectMeta({
        accountId: account.fullAccountId || account.id,
        accessToken,
        accountName: account.name,
        currency: account.currency,
        timezoneName: account.timezoneName,
        mcpServerUrl,
      });
      closeConnectModal();
      await loadStatus();
    } catch (err) {
      setNotice(err);
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
    } catch (err) {
      setNotice(err);
    }
  };

  // Google Ads MCP Server & OAuth Connection Trigger
  const onInitiateGoogleMcpOAuth = async (event) => {
    if (event) event.preventDefault();
    setNotice("");
    setOauthStepStatus("Generating Google Ads OAuth 2.0 authorization dialog...");

    try {
      const oauthData = await getGoogleOAuthUrl({
        mcpServerUrl: mcpServerUrl,
        redirectUri: GOOGLE_REDIRECT_URI,
      });

      const authUrl = oauthData?.oauthUrl;
      if (!authUrl) {
        throw new Error("Unable to obtain Google OAuth URL.");
      }

      setOauthStepStatus("Opening Google authorization window...");

      const popupWidth = 620;
      const popupHeight = 720;
      const left = window.screenX + (window.outerWidth - popupWidth) / 2;
      const top = window.screenY + (window.outerHeight - popupHeight) / 2;

      const authPopup = window.open(
        authUrl,
        "GoogleAdsOAuthWindow",
        `width=${popupWidth},height=${popupHeight},left=${left},top=${top},status=no,toolbar=no,menubar=no`
      );

      if (!authPopup || authPopup.closed || typeof authPopup.closed === "undefined") {
        setOauthStepStatus("Redirecting to Google authorization page...");
        window.location.href = authUrl;
        return;
      }

      setOauthStepStatus("Awaiting user login & permission approval on Google...");

      const completeOAuthExchange = async (authCode, authState) => {
        setOauthStepStatus("Exchanging authorization code for Google token & ad accounts...");
        try {
          const result = await handleGoogleOAuthCallback({
            code: authCode,
            state: authState,
            mcpServerUrl: mcpServerUrl,
            redirectUri: GOOGLE_REDIRECT_URI,
          });

          try {
            await channelApi.resyncChannel("google");
          } catch (syncErr) {
            console.warn("[Post-Connect Sync Warning]:", syncErr.message);
          }

          setNotice(result.message || "Google Ads connected successfully!");
          closeConnectModal();
          await loadStatus();
        } catch (err) {
          setNotice(err?.message || String(err));
          setOauthStepStatus("");
        }
      };

      const onMessageReceived = async (event) => {
        if (event.data?.type === "GOOGLE_OAUTH_SUCCESS" && event.data.code) {
          window.removeEventListener("message", onMessageReceived);
          if (authPopup && !authPopup.closed) authPopup.close();
          await completeOAuthExchange(event.data.code, event.data.state);
        }
      };
      window.addEventListener("message", onMessageReceived);

      const pollTimer = setInterval(async () => {
        try {
          if (!authPopup || authPopup.closed) {
            clearInterval(pollTimer);
            window.removeEventListener("message", onMessageReceived);
            setOauthStepStatus("");
            return;
          }

          const currentUrl = authPopup.location?.href;
          if (currentUrl && currentUrl.includes("code=")) {
            clearInterval(pollTimer);
            window.removeEventListener("message", onMessageReceived);
            const popupParams = new URLSearchParams(authPopup.location.search);
            const authCode = popupParams.get("code");
            const authState = popupParams.get("state");
            authPopup.close();

            if (authCode) {
              await completeOAuthExchange(authCode, authState);
            }
          }
        } catch (crossOriginErr) {
          // Cross-origin read blocked; ignore
        }
      }, 750);
    } catch (error) {
      setNotice(error?.message || "Failed to start Google OAuth dialog");
      setOauthStepStatus("");
    }
  };

  const onConnectGoogleMcpDirectOnly = async () => {
    setNotice("");
    setOauthStepStatus("Connecting Google MCP Server directly...");
    try {
      const result = await connectGoogleMcpServer({
        mcpServerUrl,
        channelId: "google",
      });
      setNotice(result.message || "Google MCP Server connected!");
      closeConnectModal();
      await loadStatus();
    } catch (err) {
      setNotice(err?.message || String(err));
      setOauthStepStatus("");
    }
  };

  const onFetchGoogleAccountsList = async (event) => {
    event.preventDefault();
    setNotice("");
    try {
      const res = await fetchGoogleAccounts(accessToken);
      const list = res?.data || (Array.isArray(res) ? res : []);
      if (list && list.length > 0) {
        setSelectedAccount(list[0].fullAccountId || list[0].id || list[0].accountId);
      }
    } catch (err) {
      setNotice(err);
    }
  };

  const onConnectGoogleDirect = async () => {
    const account = accounts.find((item) => (item.fullAccountId || item.id) === selectedAccount) || accounts[0];
    if (!account) return;

    try {
      await connectGoogle({
        accountId: account.fullAccountId || account.id,
        accessToken,
        accountName: account.name,
        currency: account.currency || "INR",
        timezoneName: account.timezoneName || "Asia/Kolkata",
        developerToken,
        mcpServerUrl,
      });
      closeConnectModal();
      await loadStatus();
    } catch (err) {
      setNotice(err);
    }
  };

  const onDisconnectChannel = async (id, accountId = null) => {
    if (id === "meta") {
      await disconnectMeta({ accountId });
    } else if (id === "google") {
      await disconnectGoogle({ accountId });
    } else {
      await disconnectGeneric({ channelId: id, accountId });
    }
    await loadStatus();
  };

  const getChannelAccounts = (id) => {
    if (id === "meta") return status?.channels?.metaAds?.accounts || [];
    if (id === "google") return status?.channels?.googleAds?.accounts || [];
    return status?.channels?.[id]?.accounts || (connectedMap[id] ? [connectedMap[id]] : []);
  };

  return (
    <div className="page-pad channels-page">
      <header className="page-header compact">
        <div>
          <h1>Marketing Channels</h1>
          <p>Connect Meta Ads MCP Server, Google Ads, and multi-platform marketing tools for your AI Agent</p>
        </div>
      </header>

      {/* Tabs Row */}
      <div className="channels-filter-tabs">
        {TABS.map((item) => (
          <button
            key={item}
            className={`tab-pill-btn ${tab === item ? "active" : ""}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {(notice || error || message) && (
        <div className={error ? "form-error-banner" : "form-info-banner"}>
          {notice || error || message}
        </div>
      )}

      {/* Group Sections */}
      {groups.map((group) => (
        <section key={group.group} className="channel-group-section">
          <div className="channel-group-header">
            <div className="group-title-with-icon">
              <span className={`group-icon-bullet ${group.iconTone}`}>
                {group.group === "Audio" && <Radio size={14} />}
                {group.group === "Social" && <Users size={14} />}
                {group.group === "Web" && <Globe size={14} />}
              </span>
              <h3 className="group-heading">{group.group}</h3>
            </div>
            <span className="group-count-label">{group.countLabel}</span>
          </div>

          <div className="channels-cards-grid">
            {group.items.map((item, idx) => {
              const connected = isChannelConnected(item.id);
              const isAvailable = ALLOWED_CHANNEL_IDS.includes(item.id);
              const channelAccounts = getChannelAccounts(item.id);

              return (
                <motion.article
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.2 }}
                  whileHover={isAvailable ? { y: -3, boxShadow: "0 8px 20px rgba(0, 0, 0, 0.07)" } : {}}
                  className={`channel-card-item ${connected ? "is-connected" : ""} ${!isAvailable ? "is-coming-soon" : ""}`}
                >
                  {/* Top Status Badge */}
                  {!isAvailable ? (
                    <span className="coming-soon-top-badge">
                      <Clock size={10} style={{ display: "inline-block", marginRight: 4 }} />
                      Coming Soon
                    </span>
                  ) : !connected ? (
                    <span className="coming-soon-badge">Available</span>
                  ) : (
                    <span
                      className="coming-soon-badge active"
                      style={{
                        color: "#16A34A",
                        backgroundColor: "#DCFCE7",
                        fontWeight: 600,
                        border: "1px solid #BBF7D0",
                      }}
                    >
                      <Check size={11} style={{ display: "inline-block", marginRight: 3 }} />
                      {channelAccounts.length > 1
                        ? `${channelAccounts.length} Accounts Connected`
                        : "Connected"}
                    </span>
                  )}

                  {/* Transparent Glassmorphism Overlay for Inactive / Coming Soon Platforms */}
                  {!isAvailable && (
                    <div className="channel-card-overlay-layer">
                      <div className="coming-soon-pill-overlay">
                        <Lock size={12} />
                        <span>Coming Soon</span>
                      </div>
                    </div>
                  )}

                  <div className="channel-card-head">
                    <ChannelIcon type={item.iconType} color={item.color} />
                    <div className="channel-head-text">
                      <h4 className="channel-title">{item.name}</h4>
                      <p className="channel-desc">{item.blurb}</p>
                    </div>
                  </div>

                  {/* Connected Accounts List */}
                  {connected && channelAccounts.length > 0 && (
                    <div
                      style={{
                        margin: "8px 0",
                        padding: "8px 10px",
                        background: "#F8FAFC",
                        borderRadius: "6px",
                        border: "1px solid #E2E8F0",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#64748B",
                          display: "block",
                          marginBottom: 4,
                        }}
                      >
                        Connected Accounts ({channelAccounts.length}):
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 90, overflowY: "auto" }}>
                        {channelAccounts.map((acc) => (
                          <div
                            key={acc.accountId}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              fontSize: "11.5px",
                              color: "#1E293B",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  backgroundColor: "#16A34A",
                                  flexShrink: 0,
                                }}
                              />
                              <strong style={{ fontWeight: 500 }}>{acc.accountName || acc.accountId}</strong>
                              <span style={{ color: "#94A3B8", fontSize: "10px" }}>({acc.accountId})</span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDisconnectChannel(item.id, acc.accountId);
                              }}
                              style={{
                                border: "none",
                                background: "none",
                                color: "#EF4444",
                                fontSize: "10.5px",
                                cursor: "pointer",
                                padding: "0 4px",
                                fontWeight: 600,
                              }}
                              title="Disconnect this account"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="formats-section">
                    <span className="formats-label">Supported Formats & Tools</span>
                    <div className="formats-pill-list">
                      {item.formats.map((format) => (
                        <span key={format} className="format-tag-pill">
                          {format}
                        </span>
                      ))}
                      {item.id === "meta" && (
                        <span
                          className="format-tag-pill"
                          style={{
                            backgroundColor: "#EFF6FF",
                            color: "#1D4ED8",
                            borderColor: "#DBEAFE",
                            fontWeight: 600,
                          }}
                        >
                          MCP Agent Tools
                        </span>
                      )}
                      {item.id === "google" && (
                        <span
                          className="format-tag-pill"
                          style={{
                            backgroundColor: "#EFF6FF",
                            color: "#2563EB",
                            borderColor: "#DBEAFE",
                            fontWeight: 600,
                          }}
                        >
                          Google Ads Network
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="channel-card-footer">
                    <div className="connection-status-dot">
                      <span className={`status-indicator-circle ${!isAvailable ? "coming-soon" : connected ? "connected" : "disconnected"}`} />
                      <span
                        className="status-indicator-text"
                        style={!isAvailable ? { color: "#94A3B8" } : connected ? { color: "#16A34A", fontWeight: 600 } : {}}
                      >
                        {!isAvailable
                          ? "Coming Soon"
                          : connected
                          ? `${channelAccounts.length} Active Account${channelAccounts.length > 1 ? "s" : ""}`
                          : "Disconnected"}
                      </span>
                    </div>

                    {!isAvailable ? (
                      <button
                        type="button"
                        className="connect-action-btn disabled-btn"
                        disabled
                      >
                        Coming Soon
                      </button>
                    ) : connected ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.95 }}
                          className="connect-action-btn connected-green"
                          onClick={() => openConnectModal(item)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: "12px",
                            cursor: "pointer",
                          }}
                        >
                          <Check size={13} />
                          Connected
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          className="disconnect-action-btn"
                          onClick={() => onDisconnectChannel(item.id)}
                        >
                          Disconnect
                        </motion.button>
                      </div>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.95 }}
                        className="connect-action-btn primary"
                        onClick={() => openConnectModal(item)}
                      >
                        Connect
                      </motion.button>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </div>
        </section>
      ))}

      {/* Universal Channel Connect Modal */}
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
                  style={{ maxWidth: 520 }}
                >
                  <div className="modal-header">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <ChannelIcon type={activeModalChannel.iconType} color={activeModalChannel.color} size={30} />
                      <div>
                        <h3 style={{ margin: 0, fontSize: "16px" }}>
                          {modalMode === "manage" && isChannelConnected(activeModalChannel.id)
                            ? `Manage ${activeModalChannel.name}`
                            : `Connect ${activeModalChannel.name}`}
                        </h3>
                        {isChannelConnected(activeModalChannel.id) && (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#16A34A" }} />
                            <span style={{ fontSize: "11px", color: "#16A34A", fontWeight: 600 }}>Active & Connected</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button className="modal-close-btn" onClick={closeConnectModal}>
                      <X size={18} />
                    </button>
                  </div>

                  {modalMode !== "manage" && (
                    <p className="modal-desc">
                      {activeModalChannel.id === "meta"
                        ? "Connect your Meta Ads account via MCP Server & OAuth to empower the AI Agent with real-time campaign creation & optimization tools."
                        : activeModalChannel.id === "google"
                        ? "Connect your Google Ads account to synchronize Search, Display, and Performance Max campaigns with Newton AI Agent."
                        : `Enter your ${activeModalChannel.name} credentials to connect and synchronize ad campaigns.`}
                    </p>
                  )}

                  {notice && (
                    <div className="form-error-box">
                      <p className="form-error">{notice}</p>
                    </div>
                  )}

                  {oauthStepStatus && (
                    <div
                      style={{
                        padding: "10px 14px",
                        backgroundColor: "#F0FDF4",
                        border: "1px solid #BBF7D0",
                        borderRadius: "8px",
                        color: "#15803D",
                        fontSize: "12.5px",
                        marginBottom: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <RefreshCw size={14} className="spin" style={{ animation: "spin 1.5s linear infinite" }} />
                      <span>{oauthStepStatus}</span>
                    </div>
                  )}

                  {modalMode === "manage" && isChannelConnected(activeModalChannel.id) ? (
                    <div style={{ marginTop: 10 }}>
                      <div
                        style={{
                          background: "#F0FDF4",
                          border: "1px solid #BBF7D0",
                          borderRadius: 8,
                          padding: "10px 14px",
                          marginBottom: 14,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <ShieldCheck size={18} color="#16A34A" />
                          <div>
                            <strong style={{ fontSize: "12.5px", color: "#166534", display: "block" }}>
                              Integration Active
                            </strong>
                            <span style={{ fontSize: "11px", color: "#15803D" }}>
                              AI Agent tools & real-time sync active.
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            setOauthStepStatus(`Resyncing ${activeModalChannel.name} data...`);
                            try {
                              await channelApi.resyncChannel(activeModalChannel.id);
                              await loadStatus();
                              setNotice("Channel resynced successfully!");
                            } catch (e) {
                              setNotice(e?.message || "Resync failed");
                            } finally {
                              setOauthStepStatus("");
                            }
                          }}
                          style={{
                            padding: "6px 10px",
                            fontSize: "11px",
                            fontWeight: 600,
                            borderRadius: 6,
                            border: "1px solid #86EFAC",
                            background: "#FFFFFF",
                            color: "#166534",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <RefreshCw size={12} />
                          Resync
                        </button>
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: 8 }}>
                          Connected Ad Accounts:
                        </span>                        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                          {(
                            activeModalChannel.id === "meta"
                              ? (status?.channels?.metaAds?.accounts || (status?.channels?.metaAds?.activeAccount ? [status.channels.metaAds.activeAccount] : []))
                              : activeModalChannel.id === "google"
                              ? (status?.channels?.googleAds?.accounts || (status?.channels?.googleAds?.activeAccount ? [status.channels.googleAds.activeAccount] : []))
                              : (status?.connectedList?.filter((c) => c.channelId === activeModalChannel.id || c.id === activeModalChannel.id) || [])
                          ).map((acc) => {
                            const isGoogleActive =
                              activeModalChannel.id === "google" &&
                              (status?.channels?.googleAds?.selectedCustomerId === acc.accountId ||
                               (!status?.channels?.googleAds?.selectedCustomerId && status?.channels?.googleAds?.activeAccount?.accountId === acc.accountId));

                            const isMetaActive =
                              activeModalChannel.id === "meta" &&
                              status?.channels?.metaAds?.activeAccount?.accountId === acc.accountId;

                            const isCurrentActive = isGoogleActive || isMetaActive;

                            return (
                              <div
                                key={acc.accountId || acc.id}
                                style={{
                                  background: isCurrentActive ? "#F0FDF4" : "#F8FAFC",
                                  border: isCurrentActive ? "1px solid #86EFAC" : "1px solid #E2E8F0",
                                  borderRadius: 8,
                                  padding: "10px 12px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span
                                      style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: "50%",
                                        backgroundColor: acc.syncStatus === "FAILED" ? "#EF4444" : acc.syncStatus === "SYNCING" ? "#F59E0B" : "#16A34A",
                                      }}
                                    />
                                    <strong style={{ fontSize: "13px", color: "#0F172A" }}>
                                      {acc.accountName || acc.name || acc.accountId}
                                    </strong>
                                    {acc.isManager ? (
                                      <span
                                        style={{
                                          fontSize: "10px",
                                          backgroundColor: "#EFF6FF",
                                          color: "#2563EB",
                                          border: "1px solid #BFDBFE",
                                          padding: "1px 5px",
                                          borderRadius: 4,
                                          fontWeight: 600,
                                        }}
                                      >
                                        Manager (MCC)
                                      </span>
                                    ) : (
                                      <span
                                        style={{
                                          fontSize: "10px",
                                          backgroundColor: "#F0FDF4",
                                          color: "#16A34A",
                                          border: "1px solid #BBF7D0",
                                          padding: "1px 5px",
                                          borderRadius: 4,
                                          fontWeight: 600,
                                        }}
                                      >
                                        Ad Account
                                      </span>
                                    )}
                                    {(isGoogleActive || isMetaActive) && (
                                      <span
                                        style={{
                                          fontSize: "10px",
                                          backgroundColor: "#DCFCE7",
                                          color: "#15803D",
                                          border: "1px solid #86EFAC",
                                          padding: "1px 6px",
                                          borderRadius: 4,
                                          fontWeight: 700,
                                        }}
                                      >
                                        ✓ Active
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: "11px", color: "#64748B", marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                                    <span>ID: {acc.accountId || acc.id}</span>
                                    {acc.currency && <span>Currency: {acc.currency}</span>}
                                    {acc.timezoneName && <span>TZ: {acc.timezoneName}</span>}
                                    <span style={{ color: acc.syncStatus === "FAILED" ? "#EF4444" : acc.syncStatus === "SYNCING" ? "#D97706" : "#16A34A" }}>
                                      ● {acc.syncStatus === "FAILED" ? "Sync Warning" : acc.syncStatus === "SYNCING" ? "Syncing..." : "Ready"}
                                    </span>
                                  </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                  {activeModalChannel.id === "meta" && !isMetaActive && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          setOauthStepStatus(`Selecting ad account ${acc.accountId}...`);
                                          await selectMetaAccount({ accountId: acc.accountId });
                                          setNotice(`Active Meta Ad Account set to ${acc.accountName || acc.accountId}`);
                                        } catch (e) {
                                          setNotice(e?.message || "Failed to switch active account");
                                        } finally {
                                          setOauthStepStatus("");
                                        }
                                      }}
                                      style={{
                                        border: "1px solid #93C5FD",
                                        background: "#EFF6FF",
                                        color: "#1D4ED8",
                                        borderRadius: 6,
                                        padding: "4px 8px",
                                        fontSize: "11px",
                                        cursor: "pointer",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Set Active
                                    </button>
                                  )}
                                  {activeModalChannel.id === "google" && !acc.isManager && !isGoogleActive && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          setOauthStepStatus(`Selecting ad account ${acc.accountId}...`);
                                          await selectGoogleAccount({ customerId: acc.accountId });
                                          setNotice(`Active Google Ads account set to ${acc.accountName || acc.accountId}`);
                                        } catch (e) {
                                          setNotice(e?.message || "Failed to switch active account");
                                        } finally {
                                          setOauthStepStatus("");
                                        }
                                      }}
                                      style={{
                                        border: "1px solid #93C5FD",
                                        background: "#EFF6FF",
                                        color: "#1D4ED8",
                                        borderRadius: 6,
                                        padding: "4px 8px",
                                        fontSize: "11px",
                                        cursor: "pointer",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Set Active
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await onDisconnectChannel(activeModalChannel.id, acc.accountId || acc.id);
                                    }}
                                    style={{
                                      border: "none",
                                      background: "#FEE2E2",
                                      color: "#DC2626",
                                      borderRadius: 6,
                                      padding: "5px 8px",
                                      fontSize: "11px",
                                      cursor: "pointer",
                                      fontWeight: 600,
                                    }}
                                    title="Disconnect this account"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                        <button
                          type="button"
                          onClick={() => setModalMode("connect")}
                          style={{
                            flex: 1,
                            padding: "9px 12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            borderRadius: 8,
                            border: "1px solid #CBD5E1",
                            background: "#FFFFFF",
                            color: "#0F172A",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                          }}
                        >
                          <Plus size={14} />
                          Connect Another / Reconnect
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await onDisconnectChannel(activeModalChannel.id);
                            closeConnectModal();
                          }}
                          style={{
                            padding: "9px 14px",
                            fontSize: "12px",
                            fontWeight: 600,
                            borderRadius: 8,
                            border: "none",
                            background: "#FEE2E2",
                            color: "#DC2626",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Trash2 size={14} />
                          Disconnect All
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {isChannelConnected(activeModalChannel.id) && (
                        <button
                          type="button"
                          onClick={() => setModalMode("manage")}
                          style={{
                            border: "none",
                            background: "none",
                            color: "#3B82F6",
                            fontSize: "11.5px",
                            fontWeight: 600,
                            cursor: "pointer",
                            marginBottom: 12,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: 0,
                          }}
                        >
                          <ArrowLeft size={13} />
                          Back to Active Accounts
                        </button>
                      )}

                      {activeModalChannel.id === "meta" ? (
                    <div>
                      {/* Meta Connect Mode Switcher */}
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          marginBottom: 16,
                          background: "#F1F5F9",
                          padding: 4,
                          borderRadius: 8,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setMetaConnectMode("mcp_oauth")}
                          style={{
                            flex: 1,
                            padding: "7px 12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            borderRadius: 6,
                            border: "none",
                            cursor: "pointer",
                            background: metaConnectMode === "mcp_oauth" ? "#FFFFFF" : "transparent",
                            color: metaConnectMode === "mcp_oauth" ? "#0F172A" : "#64748B",
                            boxShadow: metaConnectMode === "mcp_oauth" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                          }}
                        >
                          <Server size={14} color="#0081FB" />
                          MCP Server & OAuth (Recommended)
                        </button>
                        <button
                          type="button"
                          onClick={() => setMetaConnectMode("token")}
                          style={{
                            flex: 1,
                            padding: "7px 12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            borderRadius: 6,
                            border: "none",
                            cursor: "pointer",
                            background: metaConnectMode === "token" ? "#FFFFFF" : "transparent",
                            color: metaConnectMode === "token" ? "#0F172A" : "#64748B",
                            boxShadow: metaConnectMode === "token" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                          }}
                        >
                          Direct Access Token
                        </button>
                      </div>

                      {metaConnectMode === "mcp_oauth" ? (
                        <form onSubmit={onInitiateMetaMcpOAuth} className="modal-form">
                          <label className="auth-label">
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Server size={14} color="#0081FB" />
                              Meta Ads MCP Server URL
                            </span>
                            <input
                              type="text"
                              placeholder="e.g. https://mcp.facebook.com/ads or http://localhost:8000/sse"
                              value={mcpServerUrl}
                              onChange={(e) => setMcpServerUrl(e.target.value)}
                              required
                            />
                            <small style={{ color: "#64748B", fontSize: "11px", marginTop: 4 }}>
                              Enter your Meta MCP Server SSE/HTTP endpoint. Facebook OAuth dialog will launch to verify and fetch all your real ad accounts.
                            </small>
                          </label>

                          <div
                            style={{
                              background: "#F8FAFC",
                              border: "1px solid #E2E8F0",
                              borderRadius: 8,
                              padding: "12px 14px",
                              marginTop: 10,
                              marginBottom: 14,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                              <ShieldCheck size={16} color="#16A34A" />
                              <strong style={{ fontSize: "12.5px", color: "#0F172A" }}>Real Facebook OAuth + MCP Flow:</strong>
                            </div>
                            <ol style={{ fontSize: "11.5px", color: "#475569", margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                              <li>Opens Facebook OAuth popup $\rightarrow$ click <strong>"Continue as [Name]"</strong>.</li>
                              <li>Backend securely exchanges code for long-lived Meta access token.</li>
                              <li>Automatically fetches all your <strong>real Facebook Ad Accounts</strong> from Meta Graph API.</li>
                              <li>Enables live campaign creation and insights for the Newton AI Agent.</li>
                            </ol>
                          </div>

                          <button
                            className="primary-btn"
                            type="submit"
                            disabled={connecting}
                            style={{
                              backgroundColor: "#0081FB",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 8,
                              width: "100%",
                              padding: "11px 16px",
                              fontSize: "13px",
                              fontWeight: 600,
                            }}
                          >
                            {connecting ? (
                              <>
                                <RefreshCw size={15} className="spin" style={{ animation: "spin 1.5s linear infinite" }} />
                                Opening Facebook Authorization...
                              </>
                            ) : (
                              <>
                                <Sparkles size={15} />
                                Authorize with Facebook & Connect MCP
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={onConnectMcpDirectOnly}
                            disabled={connecting}
                            style={{
                              marginTop: 10,
                              background: "none",
                              border: "1px solid #CBD5E1",
                              borderRadius: 8,
                              padding: "8px 12px",
                              fontSize: "12px",
                              color: "#475569",
                              cursor: "pointer",
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                            }}
                          >
                            <Server size={13} color="#64748B" />
                            Or connect MCP server directly (without Facebook popup)
                          </button>
                        </form>
                      ) : (
                        <div>
                          <form onSubmit={onFetchMetaAccounts} className="modal-form">
                            <label className="auth-label">
                              <span>Meta User Access Token</span>
                              <input
                                type="text"
                                placeholder="EAAB..."
                                value={accessToken}
                                onChange={(event) => setAccessToken(event.target.value)}
                                required
                              />
                            </label>
                            <button className="primary-btn" type="submit" disabled={loading}>
                              {loading ? "Verifying Token..." : "Fetch Ad Accounts"}
                            </button>
                          </form>

                          {accounts.length > 0 && (
                            <div className="modal-accounts-section" style={{ marginTop: 14 }}>
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
                                onClick={onConnectMetaDirect}
                                disabled={connecting}
                                style={{ marginTop: 12, backgroundColor: "#16A34A" }}
                              >
                                {connecting ? "Connecting..." : "Confirm & Connect Account"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : activeModalChannel.id === "google" ? (
                    <div>
                      {/* Google Connect Mode Switcher */}
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          marginBottom: 16,
                          background: "#F1F5F9",
                          padding: 4,
                          borderRadius: 8,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setMetaConnectMode("mcp_oauth")}
                          style={{
                            flex: 1,
                            padding: "7px 12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            borderRadius: 6,
                            border: "none",
                            cursor: "pointer",
                            background: metaConnectMode === "mcp_oauth" ? "#FFFFFF" : "transparent",
                            color: metaConnectMode === "mcp_oauth" ? "#0F172A" : "#64748B",
                            boxShadow: metaConnectMode === "mcp_oauth" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                          }}
                        >
                          <Server size={14} color="#4285F4" />
                          MCP Server & OAuth (Recommended)
                        </button>
                        <button
                          type="button"
                          onClick={() => setMetaConnectMode("token")}
                          style={{
                            flex: 1,
                            padding: "7px 12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            borderRadius: 6,
                            border: "none",
                            cursor: "pointer",
                            background: metaConnectMode === "token" ? "#FFFFFF" : "transparent",
                            color: metaConnectMode === "token" ? "#0F172A" : "#64748B",
                            boxShadow: metaConnectMode === "token" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                          }}
                        >
                          Direct Access / Dev Token
                        </button>
                      </div>

                      {metaConnectMode === "mcp_oauth" ? (
                        <form onSubmit={onInitiateGoogleMcpOAuth} className="modal-form">
                          <label className="auth-label">
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Server size={14} color="#4285F4" />
                              Google Ads MCP Server URL
                            </span>
                            <input
                              type="text"
                              placeholder="e.g. http://localhost:8000/sse or built-in"
                              value={mcpServerUrl}
                              onChange={(e) => setMcpServerUrl(e.target.value)}
                              required
                            />
                            <small style={{ color: "#64748B", fontSize: "11px", marginTop: 4 }}>
                              Enter your Google Ads MCP Server endpoint. Google OAuth will automatically launch if needed.
                            </small>
                          </label>

                          <div
                            style={{
                              background: "#F8FAFC",
                              border: "1px solid #E2E8F0",
                              borderRadius: 8,
                              padding: "12px 14px",
                              marginTop: 10,
                              marginBottom: 14,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                              <ShieldCheck size={16} color="#16A34A" />
                              <strong style={{ fontSize: "12.5px", color: "#0F172A" }}>Google Ads OAuth 2.0 Flow:</strong>
                            </div>
                            <ol style={{ fontSize: "11.5px", color: "#475569", margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                              <li>Connects to Google MCP Server & verifies credentials.</li>
                              <li>Authorizes Google Ads campaign management & insights access.</li>
                              <li>Links customer ad accounts and enables live Google MCP tools.</li>
                            </ol>
                          </div>

                          <button
                            className="primary-btn"
                            type="submit"
                            disabled={connecting}
                            style={{
                              backgroundColor: "#4285F4",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 8,
                            }}
                          >
                            {connecting ? (
                              <>
                                <RefreshCw size={15} className="spin" style={{ animation: "spin 1.5s linear infinite" }} />
                                Opening Google Authorization...
                              </>
                            ) : (
                              <>
                                <Sparkles size={15} />
                                Authorize via Google OAuth & Connect
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={onConnectGoogleMcpDirectOnly}
                            disabled={connecting}
                            style={{
                              marginTop: 10,
                              background: "none",
                              border: "1px solid #CBD5E1",
                              borderRadius: 8,
                              padding: "8px 12px",
                              fontSize: "12px",
                              color: "#475569",
                              cursor: "pointer",
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                            }}
                          >
                            <Server size={13} color="#64748B" />
                            Or link MCP server directly (skip OAuth)
                          </button>
                        </form>
                      ) : (
                        <div>
                          <form onSubmit={onFetchGoogleAccountsList} className="modal-form">
                            <label className="auth-label">
                              <span>Google Access Token / Bearer Token</span>
                              <input
                                type="text"
                                placeholder="ya29.a0..."
                                value={accessToken}
                                onChange={(event) => setAccessToken(event.target.value)}
                                required
                              />
                            </label>

                            <label className="auth-label">
                              <span>Developer Token (Optional)</span>
                              <input
                                type="text"
                                placeholder="Google Ads Developer Token"
                                value={developerToken}
                                onChange={(event) => setDeveloperToken(event.target.value)}
                              />
                            </label>

                            <button className="primary-btn" type="submit" disabled={loading}>
                              {loading ? "Verifying Token..." : "Fetch Google Ad Accounts"}
                            </button>
                          </form>

                          {accounts.length > 0 && (
                            <div className="modal-accounts-section" style={{ marginTop: 14 }}>
                              <label className="auth-label">
                                <span>Select Google Ad Account</span>
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
                                onClick={onConnectGoogleDirect}
                                disabled={connecting}
                                style={{ marginTop: 12, backgroundColor: "#16A34A" }}
                              >
                                {connecting ? "Connecting..." : "Confirm & Connect Google Account"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={onConnectGeneric} className="modal-form">
                      <label className="auth-label">
                        <span>Account / Profile Name</span>
                        <input
                          type="text"
                          placeholder="e.g. Acme Marketing"
                          value={genericForm.accountName}
                          onChange={(e) => setGenericForm({ ...genericForm, accountName: e.target.value })}
                          required
                        />
                      </label>

                      <div className="form-grid">
                        <label className="auth-label">
                          <span>Account / Client ID</span>
                          <input
                            type="text"
                            placeholder="e.g. 123-456-7890"
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
                        <span>API Key / Access Token</span>
                        <input
                          type="password"
                          placeholder="Enter API key or Token"
                          value={genericForm.apiKey}
                          onChange={(e) => setGenericForm({ ...genericForm, apiKey: e.target.value })}
                        />
                      </label>

                      <button className="primary-btn" type="submit" disabled={connecting}>
                        {connecting ? "Connecting..." : `Connect ${activeModalChannel.name}`}
                      </button>
                    </form>
                  )}
                    </div>
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

export default Channel;
