import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  Calendar,
  ListOrdered,
  Terminal,
  Zap,
  Trash2,
} from "lucide-react";
import NodeResultCard from "./NodeResultCard";
import ExecutionLogsTab from "./ExecutionLogsTab";

export const ExecutionCard = ({
  execution,
  isExpanded = false,
  onToggleExpand,
  onOpenNodeDetail,
  onDelete,
}) => {
  const [activeTab, setActiveTab] = useState("tasks"); // "tasks" | "logs"
  const [copiedId, setCopiedId] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const status = execution.status || "completed";
  const duration = execution.durationMs
    ? `${(execution.durationMs / 1000).toFixed(1)}s`
    : execution.completedAt && execution.startedAt
    ? `${((new Date(execution.completedAt) - new Date(execution.startedAt)) / 1000).toFixed(1)}s`
    : "—";

  const totalNodes = execution.totalNodes || execution.nodes?.length || 0;
  const successfulNodes =
    execution.successfulNodes !== undefined
      ? execution.successfulNodes
      : execution.nodes?.filter((n) => n.status === "completed").length || 0;
  const failedNodes =
    execution.failedNodes !== undefined
      ? execution.failedNodes
      : execution.nodes?.filter((n) => n.status === "failed").length || 0;

  const handleCopyId = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(execution.executionId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1800);
  };

  const handleDeleteClick = async (e) => {
    e.stopPropagation();
    if (deleting) return;
    if (window.confirm(`Are you sure you want to delete execution "${execution.executionId}"?`)) {
      setDeleting(true);
      try {
        if (onDelete) {
          await onDelete(execution.executionId);
        }
      } finally {
        setDeleting(false);
      }
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return "—";
    const d = new Date(isoString);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getRelativeTime = (isoString) => {
    if (!isoString) return "";
    const ms = Date.now() - new Date(isoString).getTime();
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // Sort nodes in executionOrder
  const sortedNodes = [...(execution.nodes || [])].sort(
    (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
  );

  return (
    <div className={`al-run-card ${isExpanded ? "is-expanded" : ""}`}>
      {/* Execution Card Header */}
      <div className="al-run-header" onClick={() => onToggleExpand(execution.executionId)}>
        <div className="al-run-main-info">
          <div className={`al-run-status-indicator status-dot-${status}`} />

          <div className="al-run-title-group">
            <div className="al-run-name-row">
              <span className="al-run-workflow-name">
                {execution.workflowName || execution.automationName || "Automation Workflow"}
              </span>

              {execution.workflowName &&
                execution.automationName &&
                execution.workflowName !== execution.automationName && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "#94A3B8",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      padding: "2px 7px",
                      borderRadius: 4,
                    }}
                  >
                    Canvas: {execution.automationName}
                  </span>
                )}

              <button
                type="button"
                className="al-run-id-pill"
                onClick={handleCopyId}
                title="Click to copy Run ID"
              >
                <span>{execution.executionId}</span>
                {copiedId ? <Check size={11} color="#10B981" /> : <Copy size={11} />}
              </button>

              <span className={`al-badge badge-${status}`}>
                {status === "running" && <Loader2 size={11} className="animate-spin" />}
                {status.replace("_", " ")}
              </span>

              <span
                style={{
                  fontSize: 11,
                  background: "rgba(255, 255, 255, 0.06)",
                  padding: "2px 8px",
                  borderRadius: 4,
                  color: "#94A3B8",
                  textTransform: "capitalize",
                }}
              >
                <Zap size={11} style={{ display: "inline", marginRight: 4 }} />
                {execution.triggerType || "manual"}
              </span>
            </div>

            <div className="al-run-meta-row">
              <span className="al-run-meta-item">
                <Calendar size={12} />
                {formatDate(execution.startedAt)} ({getRelativeTime(execution.startedAt)})
              </span>
              <span className="al-run-meta-item">
                <Clock size={12} />
                Duration: <strong style={{ color: "#F8FAFC" }}>{duration}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right Info & Controls */}
        <div className="al-run-header-right">
          <div className="al-run-stats-pill">
            <span className="al-run-stat-total">{totalNodes} Nodes</span>
            <span style={{ color: "#334155" }}>•</span>
            <span className="al-run-stat-success">{successfulNodes} ok</span>
            {failedNodes > 0 && (
              <>
                <span style={{ color: "#334155" }}>•</span>
                <span className="al-run-stat-failed">{failedNodes} failed</span>
              </>
            )}
          </div>


          <button
            type="button"
            className="al-btn al-btn-delete"
            onClick={handleDeleteClick}
            disabled={deleting}
            title="Delete this execution record"
          >
            {deleting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
            <span>{deleting ? "Deleting..." : "Delete"}</span>
          </button>

          <button
            type="button"
            className="al-expand-btn"
            aria-label={isExpanded ? "Collapse run details" : "Expand run details"}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded Details Panel */}
      {isExpanded && (
        <div className="al-run-details-panel">
          {/* Tabs bar: Task List and Logs */}
          <div className="al-tabs-bar">
            <button
              type="button"
              className={`al-tab-btn ${activeTab === "tasks" ? "is-active" : ""}`}
              onClick={() => setActiveTab("tasks")}
            >
              <ListOrdered size={14} />
              <span>Task List</span>
              <span className="al-tab-badge">{sortedNodes.length}</span>
            </button>

            <button
              type="button"
              className={`al-tab-btn ${activeTab === "logs" ? "is-active" : ""}`}
              onClick={() => setActiveTab("logs")}
            >
              <Terminal size={14} />
              <span>Logs</span>
              <span className="al-tab-badge">{execution.logs?.length || 0}</span>
            </button>
          </div>

          {/* Task List Tab */}
          {activeTab === "tasks" && (
            <div className="al-nodes-flow">
              {sortedNodes.length === 0 ? (
                <div style={{ color: "#64748B", padding: "20px 0", textAlign: "center" }}>
                  No node tasks recorded for this run.
                </div>
              ) : (
                sortedNodes.map((node) => (
                  <NodeResultCard
                    key={node.nodeId || node.id || node._id}
                    node={node}
                    executionId={execution.executionId}
                    onOpenDetail={onOpenNodeDetail}
                  />
                ))
              )}
            </div>
          )}

          {/* Logs Tab */}
          {activeTab === "logs" && (
            <ExecutionLogsTab
              logs={execution.logs || []}
              executionId={execution.executionId}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default ExecutionCard;
