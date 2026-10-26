import React, { useState } from "react";
import {
  X,
  Play,
  Pause,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Zap,
  Calendar,
  Layers,
  Terminal,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { Link } from "react-router-dom";

export const ExecutionResultsPanel = ({
  isOpen,
  onClose,
  execution,
  isExecuting,
  isPaused,
  onPause,
  onResume,
  onRetryNode,
  onRunNow,
}) => {
  const [expandedNodes, setExpandedNodes] = useState({});

  if (!isOpen) return null;

  const toggleExpand = (nodeId) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const nodes = execution?.nodes || [];
  const status = execution?.status || (isExecuting ? "running" : "idle");
  const totalNodes = execution?.totalNodes || nodes.length || 0;
  const completedNodes =
    execution?.successfulNodes ??
    nodes.filter((n) => n.status === "completed").length;
  const failedNodes =
    execution?.failedNodes ?? nodes.filter((n) => n.status === "failed").length;

  const durationSec = execution?.durationMs
    ? (execution.durationMs / 1000).toFixed(2)
    : null;

  const getNodeIcon = (type) => {
    switch (type) {
      case "trigger":
        return <Play size={14} className="text-purple-500" />;
      case "date":
        return <Calendar size={14} className="text-blue-500" />;
      case "time":
        return <Clock size={14} className="text-amber-500" />;
      case "action":
        return <Zap size={14} className="text-emerald-500" />;
      case "generic":
      default:
        return <Sparkles size={14} className="text-blue-500" />;
    }
  };

  const getStatusBadge = (nodeStatus) => {
    switch (nodeStatus) {
      case "completed":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 9999,
              fontSize: "11px",
              fontWeight: 600,
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              color: "#059669",
              border: "1px solid rgba(16, 185, 129, 0.25)",
            }}
          >
            <CheckCircle2 size={11} /> Success
          </span>
        );
      case "running":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 9999,
              fontSize: "11px",
              fontWeight: 600,
              backgroundColor: "rgba(0, 129, 251, 0.12)",
              color: "#0081FB",
              border: "1px solid rgba(0, 129, 251, 0.3)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "#0081FB",
                animation: "pulse 1.2s infinite",
              }}
            />
            Running
          </span>
        );
      case "failed":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 9999,
              fontSize: "11px",
              fontWeight: 600,
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              color: "#DC2626",
              border: "1px solid rgba(239, 68, 68, 0.25)",
            }}
          >
            <AlertCircle size={11} /> Failed
          </span>
        );
      case "paused":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 9999,
              fontSize: "11px",
              fontWeight: 600,
              backgroundColor: "rgba(245, 158, 11, 0.12)",
              color: "#D97706",
              border: "1px solid rgba(245, 158, 11, 0.25)",
            }}
          >
            <Pause size={10} /> Paused
          </span>
        );
      case "skipped":
      case "cancelled":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 9999,
              fontSize: "11px",
              fontWeight: 500,
              backgroundColor: "#F1F5F9",
              color: "#64748B",
            }}
          >
            Skipped
          </span>
        );
      case "pending":
      default:
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 9999,
              fontSize: "11px",
              fontWeight: 500,
              backgroundColor: "#F8FAFC",
              color: "#94A3B8",
              border: "1px solid #E2E8F0",
            }}
          >
            Pending
          </span>
        );
    }
  };

  return (
    <aside
      className="execution-results-panel"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 440,
        maxWidth: "92vw",
        height: "100%",
        backgroundColor: "#FFFFFF",
        borderLeft: "1px solid #E2E8F0",
        boxShadow: "-4px 0 24px rgba(15, 23, 42, 0.08)",
        zIndex: 110,
        display: "flex",
        flexDirection: "column",
        transition: "transform 0.25s ease-in-out",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #E2E8F0",
          backgroundColor: "#F8FAFC",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: "rgba(0, 129, 251, 0.1)",
              color: "#0081FB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Terminal size={18} />
          </div>
          <div>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "#0F172A",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Execution Results
              {isExecuting && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "#0081FB",
                    backgroundColor: "rgba(0, 129, 251, 0.12)",
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      backgroundColor: "#0081FB",
                    }}
                  />
                  LIVE
                </span>
              )}
            </div>
            <div style={{ fontSize: "11px", color: "#64748B", marginTop: 1 }}>
              {execution?.executionId ? `Run: ${execution.executionId}` : "Current Workflow Run"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Pause / Resume button */}
          {isExecuting && (
            <button
              type="button"
              onClick={isPaused ? onResume : onPause}
              title={isPaused ? "Resume Workflow Execution" : "Pause Workflow Execution"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: "12px",
                fontWeight: 600,
                backgroundColor: isPaused ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)",
                color: isPaused ? "#059669" : "#D97706",
                border: `1px solid ${isPaused ? "#A7F3D0" : "#FDE68A"}`,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {isPaused ? <Play size={13} fill="#059669" /> : <Pause size={13} fill="#D97706" />}
              <span>{isPaused ? "Resume" : "Pause"}</span>
            </button>
          )}

          {/* Close Panel Button */}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#64748B",
              padding: 6,
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Close Panel"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Summary Metrics Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          padding: "12px 16px",
          borderBottom: "1px solid #E2E8F0",
          backgroundColor: "#FFFFFF",
          gap: 8,
          textAlign: "center",
        }}
      >
        <div style={{ borderRight: "1px solid #F1F5F9", paddingRight: 8 }}>
          <div style={{ fontSize: "11px", color: "#64748B", fontWeight: 500 }}>Progress</div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A", marginTop: 2 }}>
            {completedNodes} / {totalNodes}
          </div>
        </div>
        <div style={{ borderRight: "1px solid #F1F5F9", paddingRight: 8 }}>
          <div style={{ fontSize: "11px", color: "#64748B", fontWeight: 500 }}>Failed</div>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: failedNodes > 0 ? "#DC2626" : "#10B981",
              marginTop: 2,
            }}
          >
            {failedNodes}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "#64748B", fontWeight: 500 }}>Duration</div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A", marginTop: 2 }}>
            {durationSec ? `${durationSec}s` : isExecuting ? "Running..." : "—"}
          </div>
        </div>
      </div>

      {/* Node Execution List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {!nodes || nodes.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "48px 16px",
              color: "#94A3B8",
            }}
          >
            <Layers size={32} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#475569" }}>
              No Active Execution Records
            </div>
            <div style={{ fontSize: "12px", marginTop: 4 }}>
              Click the Start / Play button on your workflow to begin execution.
            </div>
          </div>
        ) : (
          nodes.map((n, idx) => {
            const isExpanded = expandedNodes[n.nodeId];
            const nodeInstruction =
              n.input?.task ||
              (typeof n.input === "string" ? n.input : n.nodeName) ||
              "Workflow step instruction";
            const nodeOutput = n.output?.result || n.output?.message || n.output;
            const nodeError = n.error?.message || (typeof n.error === "string" ? n.error : null);

            return (
              <div
                key={n.nodeId || idx}
                style={{
                  borderRadius: 12,
                  border:
                    n.status === "running"
                      ? "1.5px solid #0081FB"
                      : n.status === "completed"
                      ? "1.5px solid #10B981"
                      : n.status === "failed"
                      ? "1.5px solid #EF4444"
                      : "1px solid #E2E8F0",
                  backgroundColor: "#FFFFFF",
                  boxShadow:
                    n.status === "running"
                      ? "0 0 0 3px rgba(0, 129, 251, 0.15)"
                      : "0 1px 3px rgba(15, 23, 42, 0.04)",
                  overflow: "hidden",
                  transition: "all 0.15s ease",
                }}
              >
                {/* Node Item Header */}
                <div
                  onClick={() => toggleExpand(n.nodeId)}
                  style={{
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    backgroundColor:
                      n.status === "running"
                        ? "rgba(0, 129, 251, 0.03)"
                        : n.status === "failed"
                        ? "rgba(239, 68, 68, 0.03)"
                        : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        backgroundColor: "#F1F5F9",
                        color: "#475569",
                        fontSize: "11px",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#0F172A",
                        }}
                      >
                        {getNodeIcon(n.nodeType)}
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {n.nodeName || `Node ${idx + 1}`}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "11.5px",
                          color: "#64748B",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginTop: 1,
                        }}
                      >
                        {nodeInstruction}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {getStatusBadge(n.status)}
                    <button
                      type="button"
                      style={{
                        background: "none",
                        border: "none",
                        color: "#94A3B8",
                        padding: 0,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderTop: "1px solid #F1F5F9",
                      backgroundColor: "#FAFBFD",
                      fontSize: "12px",
                      color: "#334155",
                    }}
                  >
                    {/* Execution Timestamps */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "11px",
                        color: "#64748B",
                        marginBottom: 10,
                      }}
                    >
                      <span>
                        Started: {n.startedAt ? new Date(n.startedAt).toLocaleTimeString() : "Pending"}
                      </span>
                      {n.durationMs > 0 && <span>Duration: {(n.durationMs / 1000).toFixed(2)}s</span>}
                    </div>

                    {/* Instruction Box */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748B", marginBottom: 3 }}>
                        Instruction / Task
                      </div>
                      <div
                        style={{
                          padding: "8px 10px",
                          backgroundColor: "#FFFFFF",
                          borderRadius: 6,
                          border: "1px solid #E2E8F0",
                          fontFamily: "monospace",
                          fontSize: "11.5px",
                          color: "#000000",
                          fontWeight: 500,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {nodeInstruction}
                      </div>
                    </div>

                    {/* Output Box */}
                    {nodeOutput && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "#059669", marginBottom: 3 }}>
                          AI Agent Output / Result
                        </div>
                        <div
                          style={{
                            padding: "8px 10px",
                            backgroundColor: "#FFFFFF",
                            borderRadius: 6,
                            border: "1px solid #A7F3D0",
                            fontSize: "12px",
                            color: "#000000",
                            fontWeight: 500,
                            lineHeight: 1.45,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            maxHeight: 220,
                            overflowY: "auto",
                          }}
                        >
                          {typeof nodeOutput === "string"
                            ? nodeOutput
                            : nodeOutput?.result || nodeOutput?.message || nodeOutput?.content || JSON.stringify(nodeOutput, null, 2)}
                        </div>
                      </div>
                    )}

                    {/* Tool Calls Captured */}
                    {Array.isArray(n.output?.toolCalls) && n.output.toolCalls.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "#0081FB", marginBottom: 4 }}>
                          Tool Calls Executed ({n.output.toolCalls.length})
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {n.output.toolCalls.map((tc, tcIdx) => (
                            <div
                              key={tcIdx}
                              style={{
                                padding: "4px 8px",
                                backgroundColor: "#EFF6FF",
                                borderRadius: 4,
                                border: "1px solid #BFDBFE",
                                fontSize: "11px",
                                color: "#1D4ED8",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <span>{tc.toolName || tc.name || tc.action || "Tool"}</span>
                              <span style={{ fontSize: "10px", color: "#60A5FA" }}>SUCCESS</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Error Details if Failed */}
                    {n.status === "failed" && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "#DC2626", marginBottom: 3 }}>
                          Failure Details
                        </div>
                        <div
                          style={{
                            padding: "8px 10px",
                            backgroundColor: "#FEF2F2",
                            borderRadius: 6,
                            border: "1px solid #FCA5A5",
                            color: "#991B1B",
                            fontSize: "11.5px",
                          }}
                        >
                          {nodeError || "Execution failed at this step."}
                        </div>

                        {/* Retry Button */}
                        <button
                          type="button"
                          onClick={() => onRetryNode?.(execution?.executionId, n.nodeId)}
                          style={{
                            marginTop: 8,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "5px 12px",
                            borderRadius: 6,
                            backgroundColor: "#DC2626",
                            color: "#FFFFFF",
                            border: "none",
                            fontSize: "11.5px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <RotateCw size={12} /> Retry This Node
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer with Links and Actions */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #E2E8F0",
          backgroundColor: "#F8FAFC",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          to="/automation-logs"
          style={{
            fontSize: "12px",
            color: "#0081FB",
            fontWeight: 600,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          View Full Automation Logs <ExternalLink size={12} />
        </Link>

        {isExecuting && (
          <span style={{ fontSize: "11.5px", color: "#64748B" }}>Workflow executing...</span>
        )}
      </div>
    </aside>
  );
};

export default ExecutionResultsPanel;
