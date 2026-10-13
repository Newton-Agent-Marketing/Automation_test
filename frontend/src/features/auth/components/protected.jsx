import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hook/useAuth";
import LogoMark from "../../../app/LogoMark";

const RouteSplash = () => (
  <div className="auth-screen">
    <div className="auth-brand">
      <LogoMark size={64} />
      <h1>Newton</h1>
      <p>Loading your workspace...</p>
    </div>
  </div>
);

export const GuestOnly = () => {
  const { user, hydrated } = useAuth();
  if (!hydrated) return <RouteSplash />;
  if (user) return <Navigate to="/agent" replace />;
  return <Outlet />;
};

export const RequireAuth = () => {
  const { user, hydrated } = useAuth();
  const location = useLocation();
  if (!hydrated) return <RouteSplash />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
};

export const RequireOnboarded = () => {
  const { user, hydrated } = useAuth();
  const location = useLocation();
  if (!hydrated) return <RouteSplash />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
};
