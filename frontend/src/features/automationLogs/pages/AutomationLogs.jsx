import React from "react";
import {
  History,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { useAutomationLogs } from "../hook/useAutomationLogs";
import ExecutionCard from "../components/ExecutionCard";
import NodeDetailModal from "../components/NodeDetailModal";
import "../styles/automationLogs.css";

export const AutomationLogs = () => {
  const {
    executions,
    loading,
    error,
    filters,
    expandedRunIds,
    selectedNodeDetail,
    onSearchChange,
    onStatusChange,
    onDateChange,
    onSortChange,
    onPageChange,
    onToggleExpand,
    onOpenNodeDetail,
    onCloseNodeDetail,
    onClearError,
    onDeleteExecution,
    onClearAllExecutions,
  } = useAutomationLogs();

  const expandedRunSet = new Set(expandedRunIds);

  // Stats calculation
  const totalRuns = filters.totalCount || executions.length;
  const completedRuns = executions.filter((e) => e.status === "completed").length;
  const failedRuns = executions.filter(
    (e) => e.status === "failed" || e.status === "partially_failed"
  ).length;
  const successRate =
    executions.length > 0
      ? Math.round((completedRuns / executions.length) * 100)
      : 100;

  return (
    <div className="automation-logs-page">
      {/* Page Header */}
      <div className="al-header">
        <div className="al-title-area">
          <div className="al-title-row">
            <h1 className="al-title">Automation Logs</h1>
            <div className="al-live-badge">
              <div className="al-live-dot" />
              <span>Live Engine Connected</span>
            </div>
          </div>
          <p className="al-subtitle">
            Complete workflow execution history, individual node diagnostics, inputs, outputs, and live events.
          </p>
        </div>

        {executions.length > 0 && (
          <button
            type="button"
            className="al-btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              backgroundColor: "#FEE2E2",
              color: "#DC2626",
              border: "1px solid #FCA5A5",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onClick={async () => {
              if (
                window.confirm(
                  "Are you sure you want to permanently delete ALL automation execution logs from the database?"
                )
              ) {
                await onClearAllExecutions();
              }
            }}
          >
            <Trash2 size={14} /> Clear All Logs
          </button>
        )}
      </div>

      {/* Stats Ribbon */}
      <div className="al-stats-ribbon">
        <div className="al-stat-card">
          <span className="al-stat-label">Total Recorded Runs</span>
          <span className="al-stat-value">{totalRuns}</span>
        </div>
        <div className="al-stat-card">
          <span className="al-stat-label">Successful Executions</span>
          <span className="al-stat-value" style={{ color: "#34D399" }}>
            {completedRuns}
          </span>
        </div>
        <div className="al-stat-card">
          <span className="al-stat-label">Failed / Partial</span>
          <span
            className="al-stat-value"
            style={{ color: failedRuns > 0 ? "#F87171" : "#94A3B8" }}
          >
            {failedRuns}
          </span>
        </div>
        <div className="al-stat-card">
          <span className="al-stat-label">Success Rate</span>
          <span className="al-stat-value" style={{ color: "#38BDF8" }}>
            {successRate}%
          </span>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="al-filters-bar">
        <div className="al-search-box">
          <Search size={15} color="#64748B" />
          <input
            type="text"
            placeholder="Search by workflow name or Run ID..."
            value={filters.searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="al-filter-group">
          <select
            value={filters.status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="al-select"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
            <option value="partially_failed">Partially Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={filters.dateRange}
            onChange={(e) => onDateChange(e.target.value)}
            className="al-select"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>

          <select
            value={filters.sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="al-select"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#FCA5A5",
            padding: "12px 16px",
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={onClearError}
            style={{
              background: "transparent",
              border: "none",
              color: "#FCA5A5",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Runs List */}
      {loading && executions.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)" }}>
            <Loader2 size={20} className="animate-spin" />
            <span>Loading workflow execution history...</span>
          </div>
        </div>
      ) : executions.length === 0 ? (
        <div className="al-empty-state">
          <div className="al-empty-icon">
            <History size={28} />
          </div>
          <div className="al-empty-title">No Automation Runs Found</div>
          <div className="al-empty-desc">
            {filters.searchTerm || filters.status !== "all" || filters.dateRange !== "all"
              ? "No execution runs match your active search or filter criteria. Try resetting filters."
              : "No workflow executions have been recorded yet. Triggered executions and scheduled runs will appear here in real time."}
          </div>
        </div>
      ) : (
        <div className="al-runs-list">
          {executions.map((exec) => (
            <ExecutionCard
              key={exec.executionId || exec._id}
              execution={exec}
              isExpanded={expandedRunSet.has(exec.executionId)}
              onToggleExpand={onToggleExpand}
              onOpenNodeDetail={(node) => onOpenNodeDetail(node, exec.executionId)}
              onDelete={onDeleteExecution}
            />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {filters.totalPages > 1 && (
        <div className="al-pagination">
          <span>
            Page {filters.page} of {filters.totalPages} ({filters.totalCount} total executions)
          </span>
          <div className="al-pagination-controls">
            <button
              type="button"
              className="al-btn al-btn-secondary"
              style={{ padding: "6px 12px" }}
              disabled={filters.page <= 1}
              onClick={() => onPageChange(Math.max(1, filters.page - 1))}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              type="button"
              className="al-btn al-btn-secondary"
              style={{ padding: "6px 12px" }}
              disabled={filters.page >= filters.totalPages}
              onClick={() => onPageChange(Math.min(filters.totalPages, filters.page + 1))}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Node Detail Modal */}
      {selectedNodeDetail && (
        <NodeDetailModal
          node={selectedNodeDetail.node}
          executionId={selectedNodeDetail.executionId}
          onClose={onCloseNodeDetail}
        />
      )}
    </div>
  );
};

export default AutomationLogs;
