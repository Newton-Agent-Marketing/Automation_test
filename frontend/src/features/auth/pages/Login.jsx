import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { LogoMark } from "../../../app/LogoMark";
import { useAuth } from "../hook/useAuth";

const Login = () => {
  const navigate = useNavigate();
  const { login, status, error, company } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [localError, setLocalError] = useState("");

  const onChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setLocalError("");
    try {
      await login(form);
      navigate("/agent", { replace: true });
    } catch (err) {
      setLocalError(err || "Invalid email or password");
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-brand">
        <LogoMark size={64} />
        <h1 className="brand-title">Newton</h1>
        <p className="brand-subtitle">AI-Powered Marketing Campaigns</p>
      </div>

      <form className="auth-card" onSubmit={onSubmit}>
        <h2 className="auth-heading">Sign In</h2>

        <label className="auth-label">
          <span>Email</span>
          <input
            name="email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={onChange}
            autoComplete="email"
            required
          />
        </label>

        <label className="auth-label">
          <span>Password</span>
          <div className="password-field">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={form.password}
              onChange={onChange}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="icon-btn password-toggle"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        {(localError || error) && (
          <div className="form-error-box">
            <p className="form-error">{localError || error}</p>
          </div>
        )}

        <button className="primary-btn submit-btn" type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Signing In..." : "Sign In"}
        </button>

        <p className="auth-switch">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </div>
  );
};

export default Login;
