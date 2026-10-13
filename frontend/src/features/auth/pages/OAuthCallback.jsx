import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

const OAuthCallback = () => {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const error_description = searchParams.get("error_description");

  useEffect(() => {
    console.log("[OAuthCallback Page] Component mounted with params:", { code: code ? `${code.slice(0, 10)}...` : null, state, error });
    let channel = "meta";
    let isDrive = false;
    let isGoogle = false;

    if (state) {
      try {
        const decoded = JSON.parse(atob(state));
        if (decoded.channel === "google_drive" || decoded.channel === "drive" || decoded.type === "drive") {
          channel = "google_drive";
          isDrive = true;
        } else if (decoded.channel === "google" || decoded.channelId === "google") {
          channel = "google";
          isGoogle = true;
        }
      } catch (e) {
        if (state.includes("drive") || state.includes("google_drive")) {
          channel = "google_drive";
          isDrive = true;
        } else if (state.includes("google")) {
          channel = "google";
          isGoogle = true;
        }
      }
    }

    const channelName = isDrive ? "Google Drive & Sheets" : isGoogle ? "Google Ads" : "Meta Ads";
    const successType = isDrive ? "GOOGLE_DRIVE_OAUTH_SUCCESS" : isGoogle ? "GOOGLE_OAUTH_SUCCESS" : "META_OAUTH_SUCCESS";
    const errorType = isDrive ? "GOOGLE_DRIVE_OAUTH_ERROR" : isGoogle ? "GOOGLE_OAUTH_ERROR" : "META_OAUTH_ERROR";

    if (window.opener) {
      console.log(`[OAuthCallback Page] window.opener detected! Sending ${successType} postMessage to main application...`);
      if (code) {
        window.opener.postMessage({ type: successType, code, state, channel, connected: true }, '*');
        window.opener.postMessage('oauth-success', '*');
      } else if (error) {
        window.opener.postMessage({ type: errorType, error, channel }, '*');
      }
      setTimeout(() => window.close(), 1000);
    } else {
      console.log("[OAuthCallback Page] No window.opener present. Navigating to main channels page...");
      if (isDrive) {
        window.location.href = '/ai-context?drive_connected=true';
      } else {
        window.location.href = '/channels' + window.location.search;
      }
    }
  }, [code, state, error]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0f172a", color: "#f8fafc", textAlign: "center", fontFamily: "sans-serif" }}>
      <div style={{ background: "#1e293b", padding: "2rem", borderRadius: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.5)", maxWidth: "400px" }}>
        <h3 style={{ margin: "0 0 1rem" }}>{error ? "Authorization Failed" : "Authorization Successful!"}</h3>
        <p style={{ margin: 0, opacity: 0.8 }}>{error ? (error_description || error) : `Finalizing connection and returning to dashboard...`}</p>
      </div>
    </div>
  );
};

export default OAuthCallback;
