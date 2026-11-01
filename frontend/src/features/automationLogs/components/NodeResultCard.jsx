import React, { useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Zap,
  Calendar,
  Send,
  Sliders,
  Wrench,
  Database,
  BrainCircuit,
} from "lucide-react";
import { formatNormalText } from "../utils/formatLogContent";

const STATUS_LABEL_MAP = {
  completed: "SUCCESS",
  running: "RUNNING",
  verifying: "VERIFYING",
  failed: "FAILED",
  waiting_for_input: "WAITING FOR INPUT",
  skipped: "SKIPPED",
  blocked: "SKIPPED",
  pending: "PENDING",
  paused: "PAUSED",
  cancelled: "CANCELLED",
};

export const NodeResultCard = ({ node, executionId, onOpenDetail }) => {
  const [showFullOutput, setShowFullOutput] = useState(false);
  const [showFullInput, setShowFullInput] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  const status = node.status || "pending";
  const statusDisplay = STATUS_LABEL_MAP[status] || String(status).toUpperCase();
  const duration = node.durationMs ? `${(node.durationMs / 1000).toFixed(2)}s` : "0s";

  const copyToClipboard = (e, text, key) => {
    e.stopPropagation();
    const str = formatNormalText(text);
    navigator.clipboard.writeText(str);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const getNodeIcon = () => {
    switch (node.nodeType) {
      case "trigger":
        return <Zap size={15} color="#8B5CF6" />;
      case "date":
        return <Calendar size={15} color="#2563EB" />;
      case "time":
        return <Clock size={15} color="#D97706" />;
      case "action":
        return <Send size={15} color="#059669" />;
      default:
        return <Sliders size={15} color="#0081FB" />;
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "completed":
        return <CheckCircle2 size={16} color="#10B981" />;
      case "running":
        return <Loader2 size={16} color="#0081FB" className="animate-spin" />;
      case "verifying":
        return <Loader2 size={16} color="#D97706" className="animate-spin" />;
      case "failed":
        return <AlertCircle size={16} color="#EF4444" />;
      case "waiting_for_input":
        return <Clock size={16} color="#8B5CF6" />;
      case "skipped":
      case "blocked":
        return <AlertCircle size={16} color="#64748B" />;
      case "pending":
      default:
        return <Clock size={15} color="#64748B" />;
    }
  };

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

  const outputString = formatNormalText(node.output);
  const errorString = formatNormalText(node.error);
  const isLongOutput = outputString.length > 260 || outputString.split("\n").length > 7;
  const isLongInput = originalInstruction.length > 260 || originalInstruction.split("\n").length > 6;

  return (
    <div className={`al-node-card node-${status}`}>
      {/* Node Card Header */}
      <div className="al-node-header">
        <div className="al-node-title-group">
          <div className="al-node-index-badge">{node.executionOrder || 1}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {getNodeIcon()}
            <span className="al-node-name">{node.nodeName || `${node.nodeType} Node`}</span>
            <span className="al-node-type-tag">{node.nodeType}</span>
          </div>
        </div>

        <div className="al-node-header-right">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {getStatusIcon()}
            <span
              className={`al-badge badge-${status}`}
              style={{ fontSize: 11, padding: "2px 8px", fontWeight: 700 }}
            >
              {statusDisplay}
            </span>
          </div>

          <div className="al-node-duration">
            <Clock size={12} />
            <span>{duration}</span>
          </div>

          <button
            type="button"
            className="al-copy-btn"
            onClick={() => onOpenDetail(node)}
            title="Inspect full node telemetry"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* 5 Mandatory Structured Node Log Sections */}
      <div className="al-node-sections">
        {/* 1. Node Instruction */}
        {originalInstruction && (
          <div className="al-content-block">
            <div className="al-content-header">
              <span>1. Node Instruction</span>
              <button
                type="button"
                className="al-copy-btn"
                onClick={(e) => copyToClipboard(e, originalInstruction, "input")}
              >
                {copiedKey === "input" ? <Check size={11} color="#10B981" /> : <Copy size={11} />}
                {copiedKey === "input" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className={`al-content-body ${showFullInput ? "is-expanded" : ""}`}>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, lineHeight: 1.6, color: "#0F172A", fontWeight: 500 }}>
                {originalInstruction}
              </div>
            </div>
            {isLongInput && (
              <div className="al-show-more-bar">
                <button
                  type="button"
                  className="al-show-more-btn"
                  onClick={() => setShowFullInput(!showFullInput)}
                >
                  {showFullInput ? (
                    <>
                      <ChevronUp size={12} /> Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} /> Show More
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 2. AI Agent Execution Summary */}
        {execSummary && (
          <div className="al-content-block">
            <div className="al-content-header" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <BrainCircuit size={13} color="#7C3AED" /> 2. AI Agent Execution Summary
              </span>
              {Array.isArray(execSummary.integrationsInvolved) && execSummary.integrationsInvolved.length > 0 && (
                <span style={{ fontSize: 11, color: "#6D28D9", fontWeight: 600 }}>
                  Integrations: {execSummary.integrationsInvolved.join(" • ")}
                </span>
              )}
            </div>
            <div className="al-content-body is-expanded" style={{ fontSize: 12.5, lineHeight: 1.55, color: "#1E293B" }}>
              <div>
                <strong>Understood Objective:</strong> {execSummary.understoodObjective || originalInstruction}
              </div>
              {Array.isArray(execSummary.executionPlan) && execSummary.executionPlan.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <strong>Execution Plan:</strong>
                  <ol style={{ margin: "4px 0 0 18px", padding: 0 }}>
                    {execSummary.executionPlan.map((step, idx) => (
                      <li key={idx} style={{ marginBottom: 2 }}>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. Tool Calls */}
        {toolCalls.length > 0 && (
          <div className="al-content-block">
            <div className="al-content-header">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Wrench size={13} color="#0081FB" /> 3. Tool Calls ({toolCalls.length})
              </span>
            </div>
            <div className="al-content-body is-expanded" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {toolCalls.map((tc, idx) => {
                const tcStatus = String(tc.status || "success").toUpperCase();
                const isErr = tcStatus === "ERROR" || tcStatus === "FAILED";
                return (
                  <div
                    key={idx}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: `1px solid ${isErr ? "#FECACA" : "#BFDBFE"}`,
                      backgroundColor: isErr ? "#FEF2F2" : "#F8FAFC",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 600 }}>
                      <span style={{ fontFamily: "monospace", color: "#0F172A" }}>
                        {tc.toolName || tc.name || "tool"}
                      </span>
                      <span style={{ color: isErr ? "#DC2626" : "#059669", fontSize: 11 }}>
                        {tcStatus} {tc.durationMs ? `(${(tc.durationMs / 1000).toFixed(2)}s)` : ""}
                      </span>
                    </div>
                    {tc.toolArgs && Object.keys(tc.toolArgs).length > 0 && (
                      <div style={{ marginTop: 4, fontSize: 11.5, color: "#475569", fontFamily: "monospace", wordBreak: "break-word" }}>
                        Params: {JSON.stringify(tc.toolArgs)}
                      </div>
                    )}
                    {tc.responseSummary && (
                      <div style={{ marginTop: 4, fontSize: 12, color: "#1E293B" }}>
                        {tc.responseSummary}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Data Processing */}
        {dataProc && (
          <div className="al-content-block">
            <div className="al-content-header">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Database size={13} color="#059669" /> 4. Data Processing
              </span>
            </div>
            <div className="al-content-body is-expanded" style={{ fontSize: 12.5, lineHeight: 1.55, color: "#1E293B" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
                <span><strong>Data Fetched:</strong> {dataProc.dataFetched || "None"}</span>
                <span><strong>Records Processed:</strong> {dataProc.recordsProcessed ?? 0}</span>
                <span><strong>Records Inserted:</strong> {dataProc.recordsInserted ?? 0}</span>
                <span><strong>Records Updated:</strong> {dataProc.recordsUpdated ?? 0}</span>
                {dataProc.reportingDate && (
                  <span><strong>Reporting Date:</strong> {dataProc.reportingDate}</span>
                )}
              </div>
              {Array.isArray(dataProc.fieldMappings) && dataProc.fieldMappings.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#334155" }}>
                  <strong>Field Mapping ({dataProc.fieldMappings.length}):</strong>{" "}
                  {dataProc.fieldMappings.map((m) => `${m.sheetColumn} ← ${m.sourceField}`).join(", ")}
                </div>
              )}
              {Array.isArray(dataProc.unmappedFields) && dataProc.unmappedFields.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 11.5, color: "#B45309" }}>
                  <strong>Unmapped Custom Columns ({dataProc.unmappedFields.length}):</strong>{" "}
                  {dataProc.unmappedFields.map((u) => u.sheetColumn || u).join(", ")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. Final Output & Verification */}
        {(node.output || validation) && (
          <div className="al-content-block">
            <div className="al-content-header">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span>5. Final Output</span>
                {validation && (
                  <span
                    style={{
                      padding: "1px 7px",
                      borderRadius: 10,
                      fontSize: 10.5,
                      fontWeight: 700,
                      backgroundColor: validation.verified ? "#DCFCE7" : "#FEF3C7",
                      color: validation.verified ? "#15803D" : "#B45309",
                    }}
                  >
                    {validation.verificationStatus || (validation.verified ? "VERIFIED" : "UNVERIFIED")}
                  </span>
                )}
              </span>
              <button
                type="button"
                className="al-copy-btn"
                onClick={(e) => copyToClipboard(e, node.output, "output")}
              >
                {copiedKey === "output" ? <Check size={11} color="#10B981" /> : <Copy size={11} />}
                {copiedKey === "output" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className={`al-content-body ${showFullOutput ? "is-expanded" : ""}`}>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, lineHeight: 1.6, color: "#0F172A", fontWeight: 500 }}>
                {outputString}
              </div>
            </div>
            {isLongOutput && (
              <div className="al-show-more-bar">
                <button
                  type="button"
                  className="al-show-more-btn"
                  onClick={() => setShowFullOutput(!showFullOutput)}
                >
                  {showFullOutput ? (
                    <>
                      <ChevronUp size={12} /> Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} /> Show More
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error Details if Failed or Skipped */}
        {node.error && (
          <div className="al-content-block is-error">
            <div className="al-content-header" style={{ color: status === "skipped" ? "#64748B" : "#EF4444" }}>
              <span>{status === "skipped" ? "Skipped Reason" : "Error Details"}</span>
              <button
                type="button"
                className="al-copy-btn"
                onClick={(e) => copyToClipboard(e, node.error, "error")}
              >
                {copiedKey === "error" ? <Check size={11} color="#10B981" /> : <Copy size={11} />}
                {copiedKey === "error" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="al-content-body" style={{ color: status === "skipped" ? "#475569" : "#DC2626" }}>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, lineHeight: 1.6 }}>
                {errorString}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeResultCard;
