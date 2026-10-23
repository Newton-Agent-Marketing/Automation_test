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
  Link2,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useChannel } from "../hook/channel";
import { BrandIcon } from "../components/BrandIcon";
import { LogoMark } from "../../../app/LogoMark";
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
    setOauthStepStatus("Redirecting to Meta...");

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
      setOauthStepStatus("Redirecting to Meta...");

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
        setOauthStepStatus("Redirecting to Meta...");
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
    setOauthStepStatus("Redirecting to Google...");

    try {
      const oauthData = await getGoogleOAuthUrl({
        mcpServerUrl: mcpServerUrl,
        redirectUri: GOOGLE_REDIRECT_URI,
      });

      const authUrl = oauthData?.oauthUrl;
      if (!authUrl) {
        throw new Error("Unable to obtain Google OAuth URL.");
      }

      setOauthStepStatus("Redirecting to Google...");

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
        setOauthStepStatus("Redirecting to Google...");
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
                  ) : (
                    <span className="coming-soon-badge">Available</span>
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
                        style={!isAvailable ? { color: "#94A3B8" } : connected ? { color: "#059669", fontWeight: 600 } : {}}
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
                  style={{
                    maxWidth: 460,
                    width: "100%",
                    borderRadius: 20,
                    padding: "32px 24px 20px",
                    position: "relative",
                    textAlign: "center",
                  }}
                >
                  {/* Top Right Close Button */}
                  <button
                    className="modal-close-btn"
                    onClick={closeConnectModal}
                    style={{
                      position: "absolute",
                      top: 16,
                      right: 16,
                      width: 30,
                      height: 30,
                      background: "#FFFFFF",
                      border: "1px solid #E2E8F0",
                      color: "#64748B",
                      cursor: "pointer",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <X size={16} />
                  </button>

                  {/* Dual Logos (Website & Channel) Connected */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: 8,
                      marginBottom: 24,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 18,
                        marginBottom: 22,
                      }}
                    >
                      {/* Left: Our Website Logo (Newton) */}
                      <div
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 18,
                          backgroundColor: "#FFFFFF",
                          border: "1px solid #E2E8F0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)",
                        }}
                      >
                        <LogoMark size={44} />
                      </div>

                      {/* Center: Link Connection Icon */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#0F172A",
                        }}
                      >
                        <Link2 size={24} strokeWidth={2.4} />
                      </div>

                      {/* Right: Target Channel Logo */}
                      <div
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 18,
                          backgroundColor: "#FFFFFF",
                          border: "1px solid #E2E8F0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)",
                        }}
                      >
                        <BrandIcon type={activeModalChannel.iconType} size={44} />
                      </div>
                    </div>

                    <h3
                      style={{
                        margin: 0,
                        fontSize: "22px",
                        fontWeight: 700,
                        color: "#0F172A",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      Connect {activeModalChannel.name} to Newton
                    </h3>

                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: "13.5px",
                        color: "#64748B",
                        lineHeight: 1.5,
                        maxWidth: 340,
                      }}
                    >
                      Install directly from Newton Apps module
                    </p>

                    {isChannelConnected(activeModalChannel.id) && (
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 12,
                          color: "#10B981",
                          fontSize: "13px",
                          fontWeight: 500,
                        }}
                      >
                        <Check size={14} strokeWidth={2.5} />
                        Connected & Active
                      </div>
                    )}
                  </div>

                  {/* Feedback / Error Notice */}
                  {notice && (
                    <div
                      style={{
                        padding: "10px 14px",
                        backgroundColor: "#FEF2F2",
                        border: "1px solid #FECACA",
                        borderRadius: 8,
                        color: "#DC2626",
                        fontSize: "12.5px",
                        marginBottom: 16,
                        textAlign: "left",
                      }}
                    >
                      <p style={{ margin: 0 }}>{notice}</p>
                    </div>
                  )}

                  {/* OAuth Step Progress Status (Minimal & Clean matching reference) */}
                  {oauthStepStatus && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        padding: "8px 0",
                        marginBottom: 12,
                        color: "#334155",
                        fontSize: "14px",
                        fontWeight: 450,
                      }}
                    >
                      <Loader2
                        size={17}
                        className="spin"
                        style={{
                          color: "#94A3B8",
                          animation: "spin 1s linear infinite",
                          flexShrink: 0,
                        }}
                      />
                      <span>{oauthStepStatus}</span>
                    </div>
                  )}

                  {/* Bottom Footer Row: 'How it works ?' on left, 'Cancel' + 'Connect' on right */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 24,
                      paddingTop: 16,
                      borderTop: "1px solid #F1F5F9",
                    }}
                  >
                    {/* Left: How it works? */}
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        color: "#64748B",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <HelpCircle size={15} strokeWidth={2} />
                      <span>Connection & permissions</span>
                    </div>

                    {/* Right: Cancel & Connect buttons */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button
                        type="button"
                        onClick={closeConnectModal}
                        style={{
                          backgroundColor: "#FFFFFF",
                          color: "#334155",
                          border: "1px solid #E2E8F0",
                          padding: "8px 18px",
                          borderRadius: 8,
                          fontSize: "13px",
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F8FAFC")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#FFFFFF")}
                      >
                        Cancel
                      </button>

                      {activeModalChannel.id === "meta" ? (
                        <button
                          type="button"
                          onClick={onInitiateMetaMcpOAuth}
                          disabled={connecting}
                          style={{
                            backgroundColor: "#000000",
                            color: "#FFFFFF",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            padding: "8px 20px",
                            fontSize: "13px",
                            fontWeight: 600,
                            borderRadius: 8,
                            border: "none",
                            cursor: connecting ? "not-allowed" : "pointer",
                            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.18)",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {connecting ? (
                            <>
                              <RefreshCw size={13} className="spin" style={{ animation: "spin 1.5s linear infinite" }} />
                              Connecting...
                            </>
                          ) : (
                            "Connect"
                          )}
                        </button>
                      ) : activeModalChannel.id === "google" ? (
                        <button
                          type="button"
                          onClick={onInitiateGoogleMcpOAuth}
                          disabled={connecting}
                          style={{
                            backgroundColor: "#000000",
                            color: "#FFFFFF",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            padding: "8px 20px",
                            fontSize: "13px",
                            fontWeight: 600,
                            borderRadius: 8,
                            border: "none",
                            cursor: connecting ? "not-allowed" : "pointer",
                            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.18)",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {connecting ? (
                            <>
                              <RefreshCw size={13} className="spin" style={{ animation: "spin 1.5s linear infinite" }} />
                              Connecting...
                            </>
                          ) : (
                            "Connect"
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onConnectGenericSubmit}
                          disabled={connecting}
                          style={{
                            backgroundColor: "#000000",
                            color: "#FFFFFF",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            padding: "8px 20px",
                            fontSize: "13px",
                            fontWeight: 600,
                            borderRadius: 8,
                            border: "none",
                            cursor: connecting ? "not-allowed" : "pointer",
                            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.18)",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {connecting ? "Connecting..." : "Connect"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Disconnect Option if currently connected */}
                  {isChannelConnected(activeModalChannel.id) && (
                    <div style={{ marginTop: 12, textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={async () => {
                          await onDisconnectChannel(activeModalChannel.id);
                          closeConnectModal();
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#EF4444",
                          fontSize: "12px",
                          fontWeight: 500,
                          cursor: "pointer",
                          padding: "4px 8px",
                          borderRadius: 6,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <Trash2 size={13} />
                        Disconnect {activeModalChannel.name}
                      </button>
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
