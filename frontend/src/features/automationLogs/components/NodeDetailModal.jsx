import React, { useState } from "react";
import { X, Copy, Check, Terminal, AlertTriangle, FileText, Info } from "lucide-react";
import { formatNormalText } from "../utils/formatLogContent";

export const NodeDetailModal = ({ node, executionId, onClose }) => {
  const [activeTab, setActiveTab] = useState("output");
  const [copiedKey, setCopiedKey] = useState(null);

  if (!node) return null;

  const copyToClipboard = (text, key) => {
    const str = formatNormalText(text);
    navigator.clipboard.writeText(str);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const hasError = !!node.error;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E2E8F0",
          borderRadius: 14,
          width: "100%",
          maxWidth: 680,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px -10px rgba(15, 23, 42, 0.15)",
          color: "#0F172A",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#FFFFFF",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                backgroundColor: "#F1F5F9",
                color: "#334155",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              #{node.executionOrder || 1}
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#0F172A" }}>
                {node.nodeName || `${node.nodeType} Node`}
              </h3>
              <span style={{ fontSize: 12, color: "#64748B" }}>
                Type: {node.nodeType} • Status: {node.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#64748B",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Controls */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 20px",
            borderBottom: "1px solid #E2E8F0",
            background: "#F8FAFC",
          }}
        >
          <button
            onClick={() => setActiveTab("output")}
            className={`al-tab-btn ${activeTab === "output" ? "is-active" : ""}`}
            style={{ padding: "6px 12px" }}
          >
            <Terminal size={14} /> Output
          </button>
          <button
            onClick={() => setActiveTab("input")}
            className={`al-tab-btn ${activeTab === "input" ? "is-active" : ""}`}
            style={{ padding: "6px 12px" }}
          >
            <FileText size={14} /> Input
          </button>
          {hasError && (
            <button
              onClick={() => setActiveTab("error")}
              className={`al-tab-btn ${activeTab === "error" ? "is-active" : ""}`}
              style={{ padding: "6px 12px", color: "#EF4444" }}
            >
              <AlertTriangle size={14} /> Error
            </button>
          )}
          <button
            onClick={() => setActiveTab("metadata")}
            className={`al-tab-btn ${activeTab === "metadata" ? "is-active" : ""}`}
            style={{ padding: "6px 12px" }}
          >
            <Info size={14} /> Metadata
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: 20, overflowY: "auto", flex: 1, background: "#FFFFFF" }}>
          {activeTab === "output" && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>
                  RESOLVED OUTPUT
                </span>
                <button
                  onClick={() => copyToClipboard(node.output, "output")}
                  className="al-copy-btn"
                >
                  {copiedKey === "output" ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
                  {copiedKey === "output" ? "Copied" : "Copy Output"}
                </button>
              </div>
              <div
                style={{
                  backgroundColor: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: 8,
                  padding: 16,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "#000000",
                  fontWeight: 500,
                  maxHeight: 340,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {formatNormalText(node.output)}
              </div>
            </div>
          )}

          {activeTab === "input" && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>
                  INPUT / INSTRUCTIONS
                </span>
                <button
                  onClick={() => copyToClipboard(node.input, "input")}
                  className="al-copy-btn"
                >
                  {copiedKey === "input" ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
                  {copiedKey === "input" ? "Copied" : "Copy Input"}
                </button>
              </div>
              <div
                style={{
                  backgroundColor: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: 8,
                  padding: 16,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "#000000",
                  fontWeight: 500,
                  maxHeight: 340,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {formatNormalText(node.input)}
              </div>
            </div>
          )}

          {hasError && activeTab === "error" && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: "#EF4444" }}>
                  ERROR DETAILS
                </span>
                <button
                  onClick={() => copyToClipboard(node.error, "error")}
                  className="al-copy-btn"
                >
                  {copiedKey === "error" ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
                  {copiedKey === "error" ? "Copied" : "Copy Error"}
                </button>
              </div>
              <div
                style={{
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: 8,
                  padding: 16,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "#DC2626",
                  maxHeight: 340,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {formatNormalText(node.error)}
              </div>
            </div>
          )}

          {activeTab === "metadata" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: "#F8FAFC", padding: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 11, color: "#64748B" }}>Node ID</div>
                <div style={{ fontSize: 13, fontFamily: "monospace", color: "#0F172A", marginTop: 4 }}>
                  {node.nodeId}
                </div>
              </div>
              <div style={{ background: "#F8FAFC", padding: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 11, color: "#64748B" }}>Execution ID</div>
                <div style={{ fontSize: 13, fontFamily: "monospace", color: "#0F172A", marginTop: 4 }}>
                  {executionId}
                </div>
              </div>
              <div style={{ background: "#F8FAFC", padding: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 11, color: "#64748B" }}>Duration</div>
                <div style={{ fontSize: 13, color: "#0F172A", marginTop: 4 }}>
                  {node.durationMs ? `${(node.durationMs / 1000).toFixed(2)}s` : "0s"}
                </div>
              </div>
              <div style={{ background: "#F8FAFC", padding: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 11, color: "#64748B" }}>Attempt Number</div>
                <div style={{ fontSize: 13, color: "#0F172A", marginTop: 4 }}>
                  #{node.attemptNumber || 1}
                </div>
              </div>
              <div style={{ background: "#F8FAFC", padding: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 11, color: "#64748B" }}>Started At</div>
                <div style={{ fontSize: 12, color: "#0F172A", marginTop: 4 }}>
                  {node.startedAt ? new Date(node.startedAt).toLocaleString() : "Pending"}
                </div>
              </div>
              <div style={{ background: "#F8FAFC", padding: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 11, color: "#64748B" }}>Completed At</div>
                <div style={{ fontSize: 12, color: "#0F172A", marginTop: 4 }}>
                  {node.completedAt ? new Date(node.completedAt).toLocaleString() : "—"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NodeDetailModal;
