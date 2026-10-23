import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, FileText, Check, AlertCircle, Loader2 } from "lucide-react";

export const NodeTextEditorModal = ({
  isOpen,
  node,
  isSaving,
  onClose,
  onSave,
}) => {
  const [text, setText] = useState("");
  const [savedFeedback, setSavedFeedback] = useState(false);
  const textareaRef = useRef(null);

  // Synchronize incoming node text whenever the active node or open state changes
  useEffect(() => {
    if (isOpen && node) {
      setText(node.text || "");
      setSavedFeedback(false);
      // Auto-focus the textarea
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(
            textareaRef.current.value.length,
            textareaRef.current.value.length
          );
        }
      }, 50);
    }
  }, [isOpen, node]);

  // Handle keyboard shortcuts (Escape to close, Cmd/Ctrl + Enter to save)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !isSaving) {
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isSaving) {
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, text, node]);

  const handleSave = async () => {
    if (!node || isSaving) return;
    try {
      await onSave(node.id, text);
      setSavedFeedback(true);
      setTimeout(() => {
        onClose();
      }, 250);
    } catch (err) {
      console.error("Failed to save node text:", err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && node && (
        <div
          style={{
            position: "fixed",
            inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(15, 23, 42, 0.45)",
          backdropFilter: "blur(4px)",
          padding: 16,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isSaving) {
            onClose();
          }
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 14 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            width: "100%",
            maxWidth: 540,
            boxShadow:
              "0 20px 40px -8px rgba(15, 23, 42, 0.2), 0 1px 3px rgba(0,0,0,0.06)",
            border: "1px solid #E2E8F0",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              borderBottom: "1px solid #F1F5F9",
              backgroundColor: "#FAFAFC",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: "#EFF6FF",
                  border: "1px solid #DBEAFE",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0081FB",
                }}
              >
                <FileText size={16} />
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#0F172A",
                    lineHeight: 1.2,
                  }}
                >
                  Edit Node Content
                </h3>
                <span
                  style={{
                    fontSize: 11,
                    color: "#64748B",
                    fontFamily: "monospace",
                  }}
                >
                  Step: #{node.sequenceLabel || (node.stepNumber ? `node${node.stepNumber}` : "node_")}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                background: "none",
                border: "none",
                cursor: isSaving ? "not-allowed" : "pointer",
                padding: 6,
                borderRadius: 8,
                color: "#94A3B8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F1F5F9";
                e.currentTarget.style.color = "#0F172A";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "#94A3B8";
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "#475569",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Node Text
            </label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter text or description for this node..."
              rows={6}
              disabled={isSaving}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                fontSize: 14,
                lineHeight: 1.5,
                color: "#0F172A",
                backgroundColor: "#FFFFFF",
                border: "1.5px solid #CBD5E1",
                borderRadius: 10,
                outline: "none",
                resize: "vertical",
                minHeight: 120,
                maxHeight: 320,
                fontFamily: "inherit",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#0081FB";
                e.target.style.boxShadow = "0 0 0 3px rgba(0, 129, 251, 0.15)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#CBD5E1";
                e.target.style.boxShadow = "none";
              }}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 8,
                fontSize: 11,
                color: "#94A3B8",
              }}
            >
              <span>Press <kbd style={{ padding: "2px 4px", background: "#F1F5F9", borderRadius: 4, border: "1px solid #E2E8F0" }}>⌘/Ctrl + Enter</kbd> to save</span>
              <span>{text.length} characters</span>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
              padding: "14px 20px",
              backgroundColor: "#FAFAFC",
              borderTop: "1px solid #F1F5F9",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                color: "#475569",
                backgroundColor: "#FFFFFF",
                border: "1px solid #CBD5E1",
                borderRadius: 8,
                cursor: isSaving ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!isSaving) e.currentTarget.style.backgroundColor = "#F1F5F9";
              }}
              onMouseLeave={(e) => {
                if (!isSaving) e.currentTarget.style.backgroundColor = "#FFFFFF";
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              style={{
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 600,
                color: "#FFFFFF",
                backgroundColor: savedFeedback ? "#10B981" : "#0081FB",
                border: "none",
                borderRadius: 8,
                cursor: isSaving ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 6px rgba(0, 129, 251, 0.25)",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!isSaving && !savedFeedback) {
                  e.currentTarget.style.backgroundColor = "#006FD0";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSaving && !savedFeedback) {
                  e.currentTarget.style.backgroundColor = "#0081FB";
                }
              }}
            >
              {isSaving ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Saving...
                </>
              ) : savedFeedback ? (
                <>
                  <Check size={15} />
                  Saved!
                </>
              ) : (
                <>
                  <Save size={15} />
                  Save
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
};

export default NodeTextEditorModal;
