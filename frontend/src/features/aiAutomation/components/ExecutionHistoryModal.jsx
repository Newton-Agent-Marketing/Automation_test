import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  X,
  History,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Clock,
  Zap,
  Play,
} from "lucide-react";
import { fetchExecutionHistory } from "../aiAutomation.slice";

export const ExecutionHistoryModal = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const { executionHistory, loading } = useSelector((state) => state.aiAutomation);

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchExecutionHistory());
    }
  }, [isOpen, dispatch]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 680,
          backgroundColor: "#FFFFFF",
          borderRadius: 16,
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.15)",
          border: "1px solid #E2E8F0",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "85vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 24px",
            borderBottom: "1px solid #F1F5F9",
            backgroundColor: "#FAFBFD",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: "#EFF6FF",
                color: "#0081FB",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <History size={18} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#0F172A",
                  margin: 0,
                }}
              >
                Automation Execution History
              </h2>
              <p
                style={{
                  fontSize: 12,
                  color: "#64748B",
                  margin: 0,
                  marginTop: 2,
                }}
              >
                Real-time logs of manual and scheduled workflow executions
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => dispatch(fetchExecutionHistory())}
              disabled={loading}
              title="Refresh logs"
              style={{
                background: "none",
                border: "1px solid #E2E8F0",
                cursor: "pointer",
                padding: "6px 10px",
                borderRadius: 8,
                color: "#64748B",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
                backgroundColor: "#FFFFFF",
              }}
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 6,
                borderRadius: 6,
                color: "#64748B",
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 24px",
          }}
        >
          {(!executionHistory || executionHistory.length === 0) ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 20px",
                textAlign: "center",
                color: "#64748B",
              }}
            >
              <Clock size={36} color="#CBD5E1" style={{ marginBottom: 12 }} />
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "#334155", margin: 0 }}>
                No executions recorded yet
              </h3>
              <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 6, maxWidth: 360 }}>
                Click &ldquo;Run Now&rdquo; on the canvas or activate the automation to start receiving execution logs.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {executionHistory.map((item, index) => {
                const isSuccess = item.status === "success";
                const isRunning = item.status === "running";
                const isFailed = item.status === "failed";
                const dateStr = item.executedAt
                  ? new Date(item.executedAt).toLocaleString()
                  : "N/A";

                return (
                  <div
                    key={item.id || item._id || index}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: `1px solid ${
                        isSuccess ? "#DCFCE7" : isFailed ? "#FEE2E2" : "#E2E8F0"
                      }`,
                      backgroundColor: isSuccess
                        ? "#F0FDF4"
                        : isFailed
                        ? "#FEF2F2"
                        : "#FAFBFD",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isSuccess && <CheckCircle2 size={16} color="#16A34A" />}
                        {isFailed && <XCircle size={16} color="#DC2626" />}
                        {isRunning && (
                          <Loader2 size={16} color="#0081FB" className="animate-spin" />
                        )}

                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            color: isSuccess
                              ? "#166534"
                              : isFailed
                              ? "#991B1B"
                              : "#0081FB",
                          }}
                        >
                          {item.status}
                        </span>

                        <span style={{ color: "#CBD5E1" }}>•</span>

                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#475569",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Zap size={12} color="#7C3AED" />
                          {item.triggerType || "schedule"}
                        </span>

                        <span style={{ color: "#CBD5E1" }}>•</span>

                        <span
                          style={{
                            fontSize: 12,
                            color: "#64748B",
                          }}
                        >
                          {item.actionType || "notification"}
                        </span>
                      </div>

                      <span
                        style={{
                          fontSize: 11,
                          color: "#94A3B8",
                          fontFamily: "monospace",
                        }}
                      >
                        {dateStr}
                      </span>
                    </div>

                    {/* Result or Error Details */}
                    {item.result && (
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "#334155",
                          backgroundColor: "#FFFFFF",
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid #E2E8F0",
                          lineHeight: 1.45,
                        }}
                      >
                        <strong>Output:</strong> {item.result.message || JSON.stringify(item.result)}
                      </div>
                    )}

                    {item.errorMessage && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#991B1B",
                          backgroundColor: "#FEF2F2",
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid #FCA5A5",
                        }}
                      >
                        <strong>Error:</strong> {item.errorMessage}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid #F1F5F9",
            backgroundColor: "#FAFBFD",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid #CBD5E1",
              backgroundColor: "#FFFFFF",
              color: "#334155",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExecutionHistoryModal;
