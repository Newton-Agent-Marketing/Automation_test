import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, User as UserIcon, Check, Camera, Loader2 } from "lucide-react";
import { useAuth } from "../../features/auth/hook/useAuth";

export const ProfileSettingsModal = ({ isOpen, onClose }) => {
  const { user, updateProfile, uploadAvatar, removeAvatar } = useAuth();
  const fileInputRef = useRef(null);

  const [saving, setSaving] = useState(false);
  const [successNotice, setSuccessNotice] = useState("");
  const [errorNotice, setErrorNotice] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [avatarMarkedForRemoval, setAvatarMarkedForRemoval] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(user?.name || "");
      setEmail(user?.email || "");
      setAvatarPreview(user?.avatar || "");
      setPendingFile(null);
      setAvatarMarkedForRemoval(false);
      setSuccessNotice("");
      setErrorNotice("");
    }
  }, [isOpen, user]);

  // Clean up object URLs when unmounting or switching previews
  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  if (!isOpen) return null;

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorNotice("");

    // 1. File Type Validation
    const validMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/svg+xml",
      "image/gif",
    ];
    if (!validMimeTypes.includes(file.type)) {
      setErrorNotice("Invalid format. Please select a PNG, JPG, WebP, or SVG image.");
      e.target.value = "";
      return;
    }

    // 2. File Size Validation (Max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrorNotice("File size exceeds 5MB limit. Please choose a smaller photo or logo.");
      e.target.value = "";
      return;
    }

    // Create instant local preview
    if (avatarPreview && avatarPreview.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview);
    }
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setPendingFile(file);
    setAvatarMarkedForRemoval(false);

    e.target.value = "";
  };

  const handleRemoveAvatar = () => {
    if (avatarPreview && avatarPreview.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarPreview("");
    setPendingFile(null);
    setAvatarMarkedForRemoval(true);
    setErrorNotice("");
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (file.type === "image/svg+xml") {
          return resolve(e.target.result);
        }
        const img = new Image();
        img.onload = () => {
          const maxDim = 320;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          try {
            resolve(canvas.toDataURL("image/webp", 0.88));
          } catch {
            resolve(canvas.toDataURL("image/jpeg", 0.88));
          }
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorNotice("");
    setSuccessNotice("");

    try {
      let finalAvatar;
      if (pendingFile) {
        finalAvatar = await compressImage(pendingFile);
      } else if (avatarMarkedForRemoval) {
        finalAvatar = "";
      }

      const updatePayload = {
        name: name.trim(),
        email: email.trim(),
      };
      if (finalAvatar !== undefined) {
        updatePayload.avatar = finalAvatar;
      }

      await updateProfile(updatePayload);

      setPendingFile(null);
      setAvatarMarkedForRemoval(false);
      setSuccessNotice("Account settings updated successfully!");

      setTimeout(() => {
        setSuccessNotice("");
      }, 3500);
    } catch (err) {
      console.error("[ProfileSettingsModal Error]:", err);
      setErrorNotice(typeof err === "string" ? err : err?.message || "Failed to update profile settings.");
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
          Update your profile photo, full name, and email address.
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
          {/* Profile Photo / Logo Section (Styled directly as requested) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px",
              backgroundColor: "#F8FAFC",
              border: "1px solid #E2E8F0",
              borderRadius: 12,
              margin: "6px 0 16px 0",
            }}
          >
            {/* Circular Avatar Preview */}
            <div
              onClick={triggerFileInput}
              style={{
                position: "relative",
                width: 68,
                height: 68,
                borderRadius: "50%",
                backgroundColor: avatarPreview ? "#FFFFFF" : "#EFF6FF",
                border: "2px solid #BFDBFE",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: "pointer",
                overflow: "hidden",
                boxShadow: "0 2px 8px rgba(37, 99, 235, 0.08)",
                transition: "all 0.2s ease",
              }}
              title="Click to select image or brand logo"
            >
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar Preview"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <UserIcon size={34} color="#2563EB" strokeWidth={1.75} />
              )}

              {/* Camera Icon Overlay */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: "rgba(15, 23, 42, 0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "3px 0",
                }}
              >
                <Camera size={12} color="#FFFFFF" />
              </div>
            </div>

            {/* Photo Info & Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#1E293B" }}>
                Profile photo
              </span>
              <span style={{ fontSize: "12px", color: "#64748B", lineHeight: 1.4 }}>
                Add a photo or brand logo to personalize your account.
              </span>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={triggerFileInput}
                  disabled={saving}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "#2563EB",
                    cursor: saving ? "not-allowed" : "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Upload photo
                </button>

                {avatarPreview && (
                  <>
                    <span style={{ color: "#94A3B8", fontSize: "12px" }}>•</span>
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      disabled={saving}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        fontSize: "12.5px",
                        fontWeight: 600,
                        color: "#EF4444",
                        cursor: saving ? "not-allowed" : "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
          </div>

          <div className="settings-tab-content">
            <label className="auth-label">
              <span>Full Name</span>
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={saving}
              />
            </label>

            <label className="auth-label">
              <span>Email Address</span>
              <input
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={saving}
              />
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
            <button type="button" className="ghost-btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-btn"
              style={{
                width: "auto",
                padding: "0 22px",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
              }}
              disabled={saving}
            >
              {saving && <Loader2 size={15} className="spin" />}
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
