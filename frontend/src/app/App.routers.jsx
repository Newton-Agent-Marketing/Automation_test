import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { hydrateUser } from "../features/auth/auth.slice";
import { GuestOnly, RequireAuth, RequireOnboarded } from "../features/auth/components/protected";
import Login from "../features/auth/pages/Login";
import Register from "../features/auth/pages/Register";
import Chat from "../features/chat/pages/Chat";
import Dashboard from "../features/dashboard/pages/Dashboard";
import Channel from "../features/channel/pages/channel";
import AiContext from "../features/aiContext/pages/AiContext";
import AiAutomation from "../features/aiAutomation/pages/AiAutomation";
import AutomationLogs from "../features/automationLogs/pages/AutomationLogs";
import OAuthCallback from "../features/auth/pages/OAuthCallback";
import { LogoMark } from "./LogoMark";
import AppShell from "./AppShell";
import AutonomousActions from "./pages/AutonomousActions";
import AdPreview from "./pages/AdPreview";

import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#090D16",
          color: "#F8FAFC",
          fontFamily: "Inter, sans-serif",
          padding: "24px"
        }}>
          <div style={{
            maxWidth: 520,
            background: "#111827",
            border: "1px solid #1F2937",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)"
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "#EF4444" }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: 14, color: "#9CA3AF", marginBottom: 20, lineHeight: 1.5 }}>
              The application encountered an unexpected error while rendering this view.
            </p>
            {this.state.error && (
              <pre style={{
                background: "#030712",
                color: "#FCA5A5",
                fontSize: 12,
                padding: 12,
                borderRadius: 8,
                textAlign: "left",
                overflowX: "auto",
                marginBottom: 20
              }}>
                {this.state.error.message || String(this.state.error)}
              </pre>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{
                background: "#4F46E5",
                color: "#FFF",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const Splash = () => (
  <div className="auth-screen">
    <div className="auth-brand">
      <LogoMark size={64} />
      <h1>Newton</h1>
      <p>Loading your workspace...</p>
    </div>
  </div>
);

const AppRouters = () => {
  const dispatch = useDispatch();
  const hydrated = useSelector((state) => state.auth.hydrated);

  useEffect(() => {
    dispatch(hydrateUser());
  }, [dispatch]);

  if (!hydrated) return <Splash />;

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>
          <Route path="/company-details" element={<Navigate to="/agent" replace />} />
          <Route element={<RequireOnboarded />}>
            <Route element={<AppShell />}>
              <Route path="/agent" element={<Chat />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/autonomous-actions" element={<AutonomousActions />} />
              <Route path="/ad-preview" element={<AdPreview />} />
              <Route path="/channels" element={<Channel />} />
              <Route path="/ai-context" element={<AiContext />} />
              <Route path="/ai-automation" element={<AiAutomation />} />
              <Route path="/automation-logs" element={<AutomationLogs />} />
            </Route>

          </Route>
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route path="*" element={<Navigate to="/agent" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default AppRouters;
