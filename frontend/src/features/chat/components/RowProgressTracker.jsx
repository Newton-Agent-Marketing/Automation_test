import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, AlertCircle, Sparkles, Megaphone, ChevronDown, ChevronUp, Terminal, FileSpreadsheet, Image as ImageIcon, Database } from "lucide-react";

const PIPELINE_STAGES = [
  { id: 1, label: "Understanding request" },
  { id: 2, label: "Connecting to spreadsheet" },
  { id: 3, label: "Detecting column headers" },
  { id: 4, label: "Applying exact filter" },
  { id: 5, label: "Showing matching & skipped rows" },
  { id: 6, label: "Resolving Google Drive folders" },
  { id: 7, label: "Downloading & validating assets" },
  { id: 8, label: "Uploading media to Meta" },
  { id: 9, label: "Creating & verifying Meta Ads" },
  { id: 10, label: "Displaying final summary" },
];

function sanitizeSecrets(text) {
  if (!text) return "";
  let str = typeof text === "string" ? text : JSON.stringify(text);
  str = str.replace(/EAA[A-Za-z0-9]+/g, "[REDACTED_TOKEN]");
  str = str.replace(/bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED_TOKEN]");
  str = str.replace(/access_token=[^&"\s]+/gi, "access_token=[REDACTED_TOKEN]");
  str = str.replace(/app_secret=[^&"\s]+/gi, "app_secret=[REDACTED_SECRET]");
  str = str.replace(/"client_secret"\s*:\s*"[^"]+"/gi, '"client_secret":"[REDACTED_SECRET]"');
  return str;
}

export const RowProgressTracker = ({ jobProgress }) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  if (!jobProgress) return null;

  const {
    campaignName,
    adSetName,
    rowsList = [],
    totalRows,
    completedRows: completedRowsProp,
    failedRows: failedRowsProp,
    status = "Processing",
    stage = 1,
    stageName,
    filterColumn,
    filterValue,
    matchingRowIndices = [],
    skippedRowsCount = 0,
    errorNotice,
    logs = [],
  } = jobProgress;

  if (rowsList.length === 0 && !stageName) {
    return null;
  }

  const currentStageId = typeof stage === "number" ? stage : 1;
  const completedCount = completedRowsProp ?? rowsList.filter((r) => r.status === "SUCCESS" || r.status === "Completed").length;
  const failedCount = failedRowsProp ?? rowsList.filter((r) => r.status === "Failed" || Boolean(r.error)).length;

  const isJobFailed = status === "Failed" || status === "ERROR" || (completedCount === 0 && failedCount > 0);
  const isJobPartial = status === "Partial" || (completedCount > 0 && failedCount > 0);
  const isJobComplete = (status === "Completed" || status === "SUCCESS" || currentStageId >= 10) && !isJobFailed && !isJobPartial;

  // Extract explicit error text if present
  const alertText =
    errorNotice ||
    (rowsList.some((r) => r.error)
      ? rowsList
          .filter((r) => r.error)
          .map((r) => `• Row ${r.rowNumber || r.rowIndex}: ${r.error}`)
          .join("\n")
      : null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="job-progress-container"
      style={{
        backgroundColor: "rgba(15, 23, 42, 0.85)",
        backdropFilter: "blur(14px)",
        borderRadius: "16px",
        border: `1px solid ${isJobFailed ? "rgba(239, 68, 68, 0.5)" : isJobPartial ? "rgba(245, 158, 11, 0.5)" : "rgba(51, 65, 85, 0.7)"}`,
        padding: "18px 20px",
        margin: "14px 0 20px 0",
        boxShadow: "0 12px 28px -6px rgba(0, 0, 0, 0.4)",
        color: "#F8FAFC",
      }}
    >
      {/* 1. Campaign & Ad Set Header Info */}
      <div
        className="job-progress-header"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          paddingBottom: "14px",
          borderBottom: "1px solid rgba(51, 65, 85, 0.5)",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              backgroundColor: isJobFailed ? "rgba(239, 68, 68, 0.15)" : isJobPartial ? "rgba(245, 158, 11, 0.15)" : "rgba(59, 130, 246, 0.15)",
              border: `1px solid ${isJobFailed ? "rgba(239, 68, 68, 0.35)" : isJobPartial ? "rgba(245, 158, 11, 0.35)" : "rgba(59, 130, 246, 0.35)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isJobFailed ? "#F87171" : isJobPartial ? "#FBBF24" : "#3B82F6",
            }}
          >
            <Megaphone size={18} />
          </div>
          <div>
            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.6px", color: "#94A3B8", fontWeight: 700 }}>
              Meta Ads Campaign & Ad Set
            </div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#F8FAFC", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span>{campaignName || "Dynamic Campaign"}</span>
              <span style={{ color: "#64748B", fontSize: "12px" }}>•</span>
              <span style={{ color: "#CBD5E1", fontWeight: 500, fontSize: "13px" }}>{adSetName || "Ad Set"}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: "20px",
              backgroundColor: isJobComplete
                ? "rgba(34, 197, 94, 0.15)"
                : isJobFailed
                ? "rgba(239, 68, 68, 0.18)"
                : isJobPartial
                ? "rgba(245, 158, 11, 0.18)"
                : "rgba(59, 130, 246, 0.15)",
              color: isJobComplete ? "#4ADE80" : isJobFailed ? "#F87171" : isJobPartial ? "#FBBF24" : "#60A5FA",
              border: `1px solid ${
                isJobComplete
                  ? "rgba(34, 197, 94, 0.35)"
                  : isJobFailed
                  ? "rgba(239, 68, 68, 0.4)"
                  : isJobPartial
                  ? "rgba(245, 158, 11, 0.4)"
                  : "rgba(59, 130, 246, 0.35)"
              }`,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {!isJobComplete && !isJobFailed && !isJobPartial && <Loader2 size={13} className="sparkle-spin" />}
            {isJobComplete ? (
              <>
                <Check size={13} /> Campaign Live & Verified
              </>
            ) : isJobPartial ? (
              <>
                <AlertCircle size={13} strokeWidth={2.5} /> Partial Success ({completedCount} Live, {failedCount} Failed)
              </>
            ) : isJobFailed ? (
              <>
                <AlertCircle size={13} strokeWidth={2.5} /> Ad Creation Issue
              </>
            ) : (
              `Stage ${currentStageId}/10 — ${stageName || "Processing..."}`
            )}
          </span>
        </div>
      </div>

      {/* Prominent Error Notice Box inside Progress Tracker */}
      {alertText && (
        <div
          style={{
            backgroundColor: "rgba(220, 38, 38, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.45)",
            borderRadius: "12px",
            padding: "12px 16px",
            marginBottom: "16px",
            boxShadow: "0 4px 12px rgba(220, 38, 38, 0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "#F87171", marginBottom: "6px", fontSize: "13px" }}>
            <AlertCircle size={16} />
            <span>Ad Creation Issue Alert</span>
          </div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, color: "#FECACA", fontSize: "12.5px", fontFamily: "inherit" }}>
            {alertText}
          </div>
        </div>
      )}

      {/* 2. 10 Live Processing Stages Grid */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 700, color: "#CBD5E1", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
          <Sparkles size={14} style={{ color: "#3B82F6" }} />
          <span>Live Processing Pipeline (10 Backend Verification Stages)</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "8px",
          }}
        >
          {PIPELINE_STAGES.map((s) => {
            const isFailedStage = (isJobFailed && s.id >= 9) || (isJobFailed && currentStageId === s.id);
            const isFinished = !isFailedStage && (isJobComplete || currentStageId > s.id);
            const isCurrent = !isJobComplete && !isJobFailed && !isJobPartial && currentStageId === s.id;

            let badgeBg = "rgba(30, 41, 59, 0.5)";
            let badgeBorder = "rgba(51, 65, 85, 0.4)";
            let textColor = "#64748B";

            if (isFailedStage) {
              badgeBg = "rgba(239, 68, 68, 0.12)";
              badgeBorder = "rgba(239, 68, 68, 0.35)";
              textColor = "#F87171";
            } else if (isFinished) {
              badgeBg = "rgba(34, 197, 94, 0.1)";
              badgeBorder = "rgba(34, 197, 94, 0.3)";
              textColor = "#4ADE80";
            } else if (isCurrent) {
              badgeBg = "rgba(59, 130, 246, 0.15)";
              badgeBorder = "rgba(59, 130, 246, 0.4)";
              textColor = "#60A5FA";
            }

            return (
              <div
                key={`stage-${s.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 10px",
                  borderRadius: "8px",
                  backgroundColor: badgeBg,
                  border: `1px solid ${badgeBorder}`,
                  fontSize: "11px",
                  fontWeight: 600,
                  color: textColor,
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ flexShrink: 0 }}>
                  {isFinished ? (
                    <Check size={13} strokeWidth={2.5} style={{ color: "#22C55E" }} />
                  ) : isFailedStage ? (
                    <AlertCircle size={13} style={{ color: "#EF4444" }} />
                  ) : isCurrent ? (
                    <Loader2 size={13} className="sparkle-spin" style={{ color: "#3B82F6" }} />
                  ) : (
                    <span style={{ fontSize: "10px", opacity: 0.5 }}>{s.id}.</span>
                  )}
                </div>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Dynamic Filter & Row Matching Card */}
      {(filterColumn || matchingRowIndices.length > 0 || rowsList.length > 0) && (
        <div
          style={{
            backgroundColor: "rgba(30, 41, 59, 0.6)",
            borderRadius: "12px",
            border: "1px solid rgba(51, 65, 85, 0.5)",
            padding: "14px 16px",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <FileSpreadsheet size={16} style={{ color: "#10B981" }} />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#F8FAFC" }}>
                Spreadsheet Filter Evaluation
              </span>
            </div>
            {filterColumn && (
              <span style={{ fontSize: "11px", backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#34D399", padding: "2px 8px", borderRadius: "12px", border: "1px solid rgba(16, 185, 129, 0.3)", fontWeight: 600 }}>
                Filter: <code>{filterColumn}</code> = <strong>"{filterValue}"</strong>
              </span>
            )}
          </div>

          <div style={{ fontSize: "12px", color: "#CBD5E1", display: "flex", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <span style={{ color: "#94A3B8" }}>Total Evaluated: </span>
              <strong>{totalRows || (rowsList.length + skippedRowsCount)} rows</strong>
            </div>
            <div>
              <span style={{ color: "#94A3B8" }}>Matching Rows: </span>
              <strong style={{ color: "#4ADE80" }}>
                {matchingRowIndices.length > 0 ? `Rows #${matchingRowIndices.join(", #")}` : `${rowsList.length} rows`}
              </strong>
            </div>
            <div>
              <span style={{ color: "#94A3B8" }}>Skipped Rows: </span>
              <strong style={{ color: "#CBD5E1" }}>{skippedRowsCount} rows</strong>
            </div>
          </div>
        </div>
      )}

      {/* 4. Row-Level Ad Creation Cards */}
      {rowsList.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#CBD5E1", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
            <ImageIcon size={14} style={{ color: "#8B5CF6" }} />
            <span>Matched Rows & Creative Verification Status</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {rowsList.map((r) => {
              const isRowDone = r.status === "Completed" || r.status === "SUCCESS";
              const isRowFailed = r.status === "Failed" || Boolean(r.error);
              const isRowActive = !isRowDone && !isRowFailed && r.status !== "Waiting";

              return (
                <div
                  key={`row-card-${r.rowIndex || r.rowNumber}`}
                  style={{
                    backgroundColor: isRowDone ? "rgba(22, 163, 74, 0.08)" : isRowFailed ? "rgba(220, 38, 38, 0.08)" : "rgba(30, 41, 59, 0.5)",
                    border: `1px solid ${isRowDone ? "rgba(34, 197, 94, 0.3)" : isRowFailed ? "rgba(239, 68, 68, 0.3)" : "rgba(59, 130, 246, 0.3)"}`,
                    borderRadius: "10px",
                    padding: "10px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#F8FAFC" }}>
                        Excel Row #{r.rowNumber || r.rowIndex}: {r.adName}
                      </span>
                      {r.assetName && (
                        <span style={{ fontSize: "11px", backgroundColor: "rgba(139, 92, 246, 0.15)", color: "#C4B5FD", padding: "1px 6px", borderRadius: "4px", border: "1px solid rgba(139, 92, 246, 0.3)" }}>
                          📁 Asset: {r.assetName}
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: "11px", fontWeight: 700, color: isRowDone ? "#4ADE80" : isRowFailed ? "#F87171" : "#60A5FA", display: "flex", alignItems: "center", gap: "4px" }}>
                      {isRowActive && <Loader2 size={11} className="sparkle-spin" />}
                      {isRowDone ? "🟢 Verified & Live" : isRowFailed ? "🔴 Failed" : `⏳ ${r.status}`}
                    </span>
                  </div>

                  <div style={{ fontSize: "11px", color: "#CBD5E1" }}>
                    {r.step || "Processing..."}
                    {r.adId && <span style={{ marginLeft: "8px", color: "#60A5FA", fontWeight: 600 }}>• Verified Ad ID: <code>{r.adId}</code></span>}
                  </div>

                  {r.error && (
                    <div style={{ fontSize: "11px", color: "#F87171", backgroundColor: "rgba(220, 38, 38, 0.12)", padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                      ❌ Error: {r.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Collapsible Technical Details (Raw logs hidden by default) */}
      <div style={{ paddingTop: "8px", borderTop: "1px solid rgba(51, 65, 85, 0.4)" }}>
        <button
          type="button"
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "transparent",
            border: "none",
            color: "#94A3B8",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            padding: "4px 0",
          }}
        >
          <Terminal size={14} />
          <span>Technical details (Logs & Event Trace)</span>
          {showTechnicalDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        <AnimatePresence>
          {showTechnicalDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: "hidden", marginTop: "8px" }}
            >
              <div
                style={{
                  backgroundColor: "#090D16",
                  borderRadius: "8px",
                  border: "1px solid rgba(51, 65, 85, 0.6)",
                  padding: "10px 12px",
                  maxHeight: "180px",
                  overflowY: "auto",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  color: "#94A3B8",
                  lineHeight: 1.5,
                }}
              >
                {logs.length > 0 ? (
                  logs.map((l, idx) => (
                    <div key={`log-${idx}`} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                      {sanitizeSecrets(l)}
                    </div>
                  ))
                ) : (
                  <div>No raw terminal log events captured yet. Executing backend pipeline steps...</div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default RowProgressTracker;
