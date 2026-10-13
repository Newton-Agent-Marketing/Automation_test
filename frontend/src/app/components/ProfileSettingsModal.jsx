import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, User as UserIcon, Check } from "lucide-react";
import { useAuth } from "../../features/auth/hook/useAuth";

export const ProfileSettingsModal = ({ isOpen, onClose }) => {
  const { user, updateProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [successNotice, setSuccessNotice] = useState("");
  const [errorNotice, setErrorNotice] = useState("");

  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
  });

  useEffect(() => {
    if (isOpen) {
      setUserForm({
        name: user?.name || "",
        email: user?.email || "",
      });
      setSuccessNotice("");
      setErrorNotice("");
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorNotice("");
    setSuccessNotice("");

    try {
      await updateProfile(userForm);
      setSuccessNotice("Profile updated successfully!");
      setTimeout(() => {
        setSuccessNotice("");
      }, 3000);
    } catch (err) {
      setErrorNotice(typeof err === "string" ? err : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog-card settings-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserIcon size={20} color="#2563EB" />
            <h3>Account Settings</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <p className="modal-desc">
          Update your account name and email address.
        </p>

        {successNotice && (
          <div className="form-info-banner" style={{ display: "flex", alignItems: "center", gap: 6, margin: "10px 0" }}>
            <Check size={16} />
            <span>{successNotice}</span>
          </div>
        )}

        {errorNotice && (
          <div className="form-error-box" style={{ margin: "10px 0" }}>
            <p className="form-error">{errorNotice}</p>
          </div>
        )}

        <form onSubmit={handleSave} className="settings-form">
          <div className="settings-tab-content">
            <label className="auth-label">
              <span>Full Name</span>
              <input
                name="name"
                value={userForm.name}
                onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                required
              />
            </label>

            <label className="auth-label">
              <span>Email Address</span>
              <input
                name="email"
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                required
              />
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
            <button type="button" className="ghost-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-btn" style={{ width: "auto", padding: "0 22px" }} disabled={saving}>
              {saving ? "Saving Changes..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default ProfileSettingsModal;
