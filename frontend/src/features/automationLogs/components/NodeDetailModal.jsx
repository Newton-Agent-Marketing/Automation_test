import React, { useState } from "react";
import { X, Copy, Check, Terminal, AlertTriangle, FileText, Info, Wrench, Database } from "lucide-react";
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
  const originalInstruction =
    node.originalInstruction ||
    node.input?.task ||
    node.input?.instruction ||
    formatNormalText(node.input);
  const execSummary = node.executionSummary || node.output?.executionSummary || null;
  const toolCalls = Array.isArray(node.toolsCalled) && node.toolsCalled.length > 0
    ? node.toolsCalled
    : Array.isArray(node.output?.toolCalls)
    ? node.output.toolCalls
    : [];
  const dataProc = node.dataProcessing || node.output?.dataProcessing || null;
  const validation = node.validation || node.output?.validation || null;

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
          maxWidth: 760,
          maxHeight: "86vh",
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
                Type: {node.nodeType} • Status: {String(node.status || "").toUpperCase()} • Duration:{" "}
                {node.durationMs ? `${(node.durationMs / 1000).toFixed(2)}s` : "0s"}
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
            flexWrap: "wrap",
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
            <Terminal size={14} /> Final Output
          </button>
          <button
            onClick={() => setActiveTab("input")}
            className={`al-tab-btn ${activeTab === "input" ? "is-active" : ""}`}
            style={{ padding: "6px 12px" }}
          >
            <FileText size={14} /> Instruction & Plan
          </button>
          <button
            onClick={() => setActiveTab("tools")}
            className={`al-tab-btn ${activeTab === "tools" ? "is-active" : ""}`}
            style={{ padding: "6px 12px" }}
          >
            <Wrench size={14} /> Tool Calls ({toolCalls.length})
          </button>
          <button
            onClick={() => setActiveTab("data")}
            className={`al-tab-btn ${activeTab === "data" ? "is-active" : ""}`}
            style={{ padding: "6px 12px" }}
          >
            <Database size={14} /> Data Processing
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
                  FINAL OUTPUT {validation ? `• ${validation.verificationStatus || (validation.verified ? "VERIFIED" : "UNVERIFIED")}` : ""}
                </span>
                <button
                  onClick={() => copyToClipboard(node.output, "output")}
                  className="al-copy-btn"
                >
                  {copiedKey === "output" ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
                  {copiedKey === "output" ? "Copied" : "Copy Output"}
                </button>
              </div>
              {validation?.reason && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: "8px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    backgroundColor: validation.verified ? "#F0FDF4" : "#FFFBEB",
                    border: `1px solid ${validation.verified ? "#BBF7D0" : "#FDE68A"}`,
                    color: validation.verified ? "#166534" : "#92400E",
                  }}
                >
                  <strong>Verification:</strong> {validation.reason}
                </div>
              )}
              <div
                style={{
                  backgroundColor: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: 8,
                  padding: 16,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "#0F172A",
                  fontWeight: 500,
                  maxHeight: 360,
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
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
                    COMPLETE NODE INSTRUCTION
                  </span>
                  <button
                    onClick={() => copyToClipboard(originalInstruction, "input")}
                    className="al-copy-btn"
                  >
                    {copiedKey === "input" ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
                    {copiedKey === "input" ? "Copied" : "Copy Instruction"}
                  </button>
                </div>
                <div
                  style={{
                    backgroundColor: "#F8FAFC",
                    border: "1px solid #E2E8F0",
                    borderRadius: 8,
                    padding: 14,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: "#0F172A",
                    fontWeight: 500,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {originalInstruction}
                </div>
              </div>

              {execSummary && (
                <div
                  style={{
                    backgroundColor: "#FAF5FF",
                    border: "1px solid #E9D5FF",
                    borderRadius: 8,
                    padding: 14,
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  <div style={{ fontWeight: 700, color: "#6B21A8", marginBottom: 6 }}>
                    AI Agent Execution Summary
                  </div>
                  <div>
                    <strong>Understood Objective:</strong> {execSummary.understoodObjective || originalInstruction}
                  </div>
                  {Array.isArray(execSummary.integrationsInvolved) && execSummary.integrationsInvolved.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <strong>Integrations Involved:</strong> {execSummary.integrationsInvolved.join(", ")}
                    </div>
                  )}
                  {Array.isArray(execSummary.executionPlan) && execSummary.executionPlan.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <strong>Execution Plan:</strong>
                      <ol style={{ margin: "4px 0 0 18px", padding: 0 }}>
                        {execSummary.executionPlan.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "tools" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {toolCalls.length === 0 ? (
                <div style={{ color: "#64748B", fontSize: 13 }}>No external tool calls recorded for this node.</div>
              ) : (
                toolCalls.map((tc, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: "1px solid #E2E8F0",
                      backgroundColor: "#F8FAFC",
                      fontSize: 12.5,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                      <span style={{ fontFamily: "monospace" }}>#{idx + 1} {tc.toolName || tc.name}</span>
                      <span style={{ color: tc.status === "error" ? "#DC2626" : "#059669" }}>
                        {String(tc.status || "success").toUpperCase()} {tc.durationMs ? `• ${(tc.durationMs / 1000).toFixed(2)}s` : ""}
                      </span>
                    </div>
                    {tc.toolArgs && (
                      <pre
                        style={{
                          margin: "8px 0 0",
                          padding: 8,
                          backgroundColor: "#FFFFFF",
                          borderRadius: 6,
                          border: "1px solid #E2E8F0",
                          fontSize: 11.5,
                          overflowX: "auto",
                        }}
                      >
                        {JSON.stringify(tc.toolArgs, null, 2)}
                      </pre>
                    )}
                    {tc.responseSummary && (
                      <div style={{ marginTop: 8, color: "#1E293B" }}>
                        <strong>Response Summary:</strong> {tc.responseSummary}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "data" && (
            <div style={{ fontSize: 13, lineHeight: 1.65 }}>
              {!dataProc ? (
                <div style={{ color: "#64748B" }}>No data processing metrics recorded for this node.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ padding: 10, borderRadius: 8, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                      <div style={{ fontSize: 11, color: "#64748B" }}>Data Fetched</div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>{dataProc.dataFetched || "None"}</div>
                    </div>
                    <div style={{ padding: 10, borderRadius: 8, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                      <div style={{ fontSize: 11, color: "#64748B" }}>Reporting Date</div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>{dataProc.reportingDate || "N/A"}</div>
                    </div>
                    <div style={{ padding: 10, borderRadius: 8, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                      <div style={{ fontSize: 11, color: "#64748B" }}>Records Processed</div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>{dataProc.recordsProcessed ?? 0}</div>
                    </div>
                    <div style={{ padding: 10, borderRadius: 8, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                      <div style={{ fontSize: 11, color: "#64748B" }}>Inserted / Updated</div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>
                        {dataProc.recordsInserted ?? 0} inserted • {dataProc.recordsUpdated ?? 0} updated
                      </div>
                    </div>
                  </div>

                  {Array.isArray(dataProc.fieldMappings) && dataProc.fieldMappings.length > 0 && (
                    <div style={{ padding: 12, borderRadius: 8, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>
                        Semantic Field Mappings ({dataProc.fieldMappings.length})
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {dataProc.fieldMappings.map((m, idx) => (
                          <span
                            key={idx}
                            style={{
                              padding: "3px 8px",
                              borderRadius: 6,
                              backgroundColor: "#EFF6FF",
                              border: "1px solid #BFDBFE",
                              fontSize: 11.5,
                              color: "#1E40AF",
                            }}
                          >
                            {m.sheetColumn} ← {m.sourceField}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(dataProc.unmappedFields) && dataProc.unmappedFields.length > 0 && (
                    <div style={{ padding: 12, borderRadius: 8, background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        Unmapped Custom Columns ({dataProc.unmappedFields.length})
                      </div>
                      <div>{dataProc.unmappedFields.map((u) => u.sheetColumn || u).join(", ")}</div>
                    </div>
                  )}
                </div>
              )}
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
