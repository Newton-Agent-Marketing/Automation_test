import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  GitBranch,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Network,
  Settings,
  Zap,
} from "lucide-react";
import { useDispatch } from "react-redux";
import { LogoMark } from "./LogoMark";
import { useAuth } from "../features/auth/hook/useAuth";
import { ProfileSettingsModal } from "./components/ProfileSettingsModal";
import { fetchChannelStatus } from "../features/channel/channel.slice";
import {
  appendStreamText,
  fetchConversations,
  finishStream,
  setChatError,
  setSocketConnected,
  setToolStatus,
  updateJobProgress,
} from "../features/chat/chat.slice";
import {
  connectChatSocket,
  disconnectChatSocket,
} from "../features/chat/service/chat.socket";

const NAV = [
  { to: "/agent", label: "AI Agent", icon: MessageSquare },
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/autonomous-actions", label: "Autonomous Actions", icon: Zap },
  { to: "/ad-preview", label: "Ad Preview", icon: Eye },
  { to: "/channels", label: "Channels", icon: GitBranch },
  { to: "/ai-context", label: "AI Context", icon: Network },
];

const AppShell = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const isChat = location.pathname === "/agent";

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatar]);

  useEffect(() => {
    dispatch(fetchChannelStatus());
  }, [dispatch]);

  useEffect(() => {
    if (!user) return undefined;

    connectChatSocket({
      onStatus: (connected) => dispatch(setSocketConnected(connected)),
      onEvent: (event) => {
        if (event.type === "text_delta") dispatch(appendStreamText(event.content || ""));
        if (event.type === "tool_status") {
          dispatch(setToolStatus(event.status || event.toolName));
        }
        if (event.type === "progress_update") dispatch(updateJobProgress(event));
        if (event.type === "error") dispatch(setChatError(event.message));
        if (event.type === "done") {
          dispatch(finishStream());
          dispatch(fetchConversations());
        }
      },
    });

    return () => disconnectChatSocket();
  }, [dispatch, user]);

  const userName = user?.name || "User";
  const userInitial = userName.charAt(0).toUpperCase() || "U";
  const userEmail = user?.email || "";
  const userRole = "Account Owner";

  return (
    <div className={`app-shell ${isChat ? "chat-mode" : ""} ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="app-sidebar">
        <div className="brand-row">
          <div className="brand-info">
            <LogoMark size={32} />
            {!collapsed && (
              <div className="brand-text">
                <strong>Newton</strong>
                <span>AI Marketing</span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="collapse-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={18} className="nav-icon" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div
            className="sidebar-user-card"
            onClick={() => setSettingsOpen(true)}
            style={{ cursor: "pointer" }}
            title="Click to edit user & company details"
          >
            <div className="user-avatar" style={{ overflow: "hidden", padding: 0 }}>
              {user?.avatar && !avatarError ? (
                <img
                  src={user.avatar}
                  alt={userName}
                  onError={() => setAvatarError(true)}
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}
                />
              ) : (
                userInitial
              )}
            </div>
            {!collapsed && (
              <div className="user-details">
                <div className="user-name-row">
                  <strong className="user-name">{userName}</strong>
                  <button
                    type="button"
                    className="user-settings-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingsOpen(true);
                    }}
                    aria-label="Settings"
                  >
                    <Settings size={14} />
                  </button>
                </div>
                <span className="user-email" title={userEmail}>
                  {userEmail}
                </span>
                <span className="user-role">{userRole}</span>
              </div>
            )}
          </div>

          <button className="signout-btn" onClick={() => logout()}>
            <LogOut size={16} />
            {!collapsed && <span>Sign Out</span>}
          </button>

          {!collapsed && (
            <div className="sidebar-version">
              <span>v1.0.07 - a5364ec</span>
            </div>
          )}
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>

      {/* User / Company Profile Details Edit Modal */}
      <ProfileSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
};

export default AppShell;
