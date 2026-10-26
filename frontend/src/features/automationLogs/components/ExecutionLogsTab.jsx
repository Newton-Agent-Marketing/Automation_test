import React, { useState } from "react";
import { Terminal, Copy, Check, Filter } from "lucide-react";

export const ExecutionLogsTab = ({ logs = [], executionId }) => {
  const [copied, setCopied] = useState(false);
  const [levelFilter, setLevelFilter] = useState("all");

  const filteredLogs = logs.filter((log) => {
    if (levelFilter === "all") return true;
    return log.level === levelFilter;
  });

  const handleCopyLogs = () => {
    const text = logs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toISOString()}] [${(l.level || "INFO").toUpperCase()}] ${
            l.nodeName ? `[${l.nodeName}] ` : ""
          }${l.message}`
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (ts) => {
    if (!ts) return "--:--:--";
    const d = new Date(ts);
    return d.toTimeString().split(" ")[0] + "." + String(d.getMilliseconds()).padStart(3, "0");
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>
            Chronological System & Execution Events
          </span>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="al-select"
            style={{ padding: "3px 8px", fontSize: 11 }}
          >
            <option value="all">All Levels</option>
            <option value="info">Info Only</option>
            <option value="success">Success Only</option>
            <option value="warn">Warnings Only</option>
            <option value="error">Errors Only</option>
          </select>
        </div>

        <button type="button" onClick={handleCopyLogs} className="al-copy-btn">
          {copied ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
          {copied ? "Copied All Logs" : "Copy Raw Logs"}
        </button>
      </div>

      <div className="al-logs-terminal">
        {filteredLogs.length === 0 ? (
          <div style={{ color: "#64748B", padding: 20, textAlign: "center" }}>
            No logs recorded for this execution.
          </div>
        ) : (
          filteredLogs.map((log, idx) => (
            <div key={idx} className="al-log-line">
              <span className="al-log-timestamp">{formatTime(log.timestamp)}</span>
              <span className={`al-log-level level-${log.level || "info"}`}>
                {(log.level || "INFO").toUpperCase()}
              </span>
              {log.nodeName && (
                <span style={{ color: "#38BDF8", fontWeight: 600 }}>
                  [{log.nodeName}]
                </span>
              )}
              <span className="al-log-message">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ExecutionLogsTab;
