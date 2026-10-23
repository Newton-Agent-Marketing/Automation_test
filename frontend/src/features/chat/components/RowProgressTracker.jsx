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
        backgroundColor: "#FFFFFF",
        borderRadius: "14px",
        border: `1px solid ${isJobFailed ? "#FECACA" : isJobPartial ? "#FDE68A" : "#E2E8F0"}`,
        padding: "18px 20px",
        margin: "14px 0 20px 0",
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)",
        color: "#0F172A",
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
          borderBottom: "1px solid #EDF2F7",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              backgroundColor: isJobFailed ? "#FEF2F2" : isJobPartial ? "#FFFBEB" : "#EEF4FF",
              border: `1px solid ${isJobFailed ? "#FECACA" : isJobPartial ? "#FDE68A" : "#BFDBFE"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isJobFailed ? "#DC2626" : isJobPartial ? "#D97706" : "#2563EB",
            }}
          >
            <Megaphone size={18} />
          </div>
          <div>
            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.6px", color: "#64748B", fontWeight: 700 }}>
              Meta Ads Campaign & Ad Set
            </div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span>{campaignName || "Dynamic Campaign"}</span>
              <span style={{ color: "#CBD5E1", fontSize: "12px" }}>•</span>
              <span style={{ color: "#475569", fontWeight: 500, fontSize: "13px" }}>{adSetName || "Ad Set"}</span>
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
                ? "#ECFDF5"
                : isJobFailed
                ? "#FEF2F2"
                : isJobPartial
                ? "#FFFBEB"
                : "#EEF4FF",
              color: isJobComplete ? "#059669" : isJobFailed ? "#DC2626" : isJobPartial ? "#D97706" : "#2563EB",
              border: `1px solid ${
                isJobComplete
                  ? "#A7F3D0"
                  : isJobFailed
                  ? "#FECACA"
                  : isJobPartial
                  ? "#FDE68A"
                  : "#BFDBFE"
              }`,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {!isJobComplete && !isJobFailed && !isJobPartial && <Loader2 size={13} className="sparkle-spin" />}
            {isJobComplete ? (
              <>
                <Check size={13} strokeWidth={2.5} /> Campaign Live & Verified
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
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "12px",
            padding: "12px 16px",
            marginBottom: "16px",
            boxShadow: "0 1px 2px rgba(220, 38, 38, 0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "#DC2626", marginBottom: "6px", fontSize: "13px" }}>
            <AlertCircle size={16} />
            <span>Ad Creation Issue Alert</span>
          </div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, color: "#991B1B", fontSize: "12.5px", fontFamily: "inherit" }}>
            {alertText}
          </div>
        </div>
      )}

      {/* 2. 10 Live Processing Stages Grid */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
          <Sparkles size={14} style={{ color: "#2563EB" }} />
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

            let badgeBg = "#F8FAFC";
            let badgeBorder = "#E2E8F0";
            let textColor = "#64748B";

            if (isFailedStage) {
              badgeBg = "#FEF2F2";
              badgeBorder = "#FECACA";
              textColor = "#DC2626";
            } else if (isFinished) {
              badgeBg = "#ECFDF5";
              badgeBorder = "#A7F3D0";
              textColor = "#059669";
            } else if (isCurrent) {
              badgeBg = "#EEF4FF";
              badgeBorder = "#93C5FD";
              textColor = "#1D4ED8";
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
                  fontSize: "11.5px",
                  fontWeight: isCurrent ? 700 : 600,
                  color: textColor,
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ flexShrink: 0 }}>
                  {isFinished ? (
                    <Check size={13} strokeWidth={2.5} style={{ color: "#10B981" }} />
                  ) : isFailedStage ? (
                    <AlertCircle size={13} style={{ color: "#DC2626" }} />
                  ) : isCurrent ? (
                    <Loader2 size={13} className="sparkle-spin" style={{ color: "#2563EB" }} />
                  ) : (
                    <span style={{ fontSize: "10px", color: "#94A3B8" }}>{s.id}.</span>
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
            backgroundColor: "#F8FAFC",
            borderRadius: "12px",
            border: "1px solid #E2E8F0",
            padding: "14px 16px",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <FileSpreadsheet size={16} style={{ color: "#10B981" }} />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>
                Spreadsheet Filter Evaluation
              </span>
            </div>
            {filterColumn && (
              <span style={{ fontSize: "11px", backgroundColor: "#ECFDF5", color: "#047857", padding: "2px 8px", borderRadius: "12px", border: "1px solid #A7F3D0", fontWeight: 600 }}>
                Filter: <code>{filterColumn}</code> = <strong>"{filterValue}"</strong>
              </span>
            )}
          </div>

          <div style={{ fontSize: "12px", color: "#475569", display: "flex", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <span style={{ color: "#64748B" }}>Total Evaluated: </span>
              <strong style={{ color: "#0F172A" }}>{totalRows || (rowsList.length + skippedRowsCount)} rows</strong>
            </div>
            <div>
              <span style={{ color: "#64748B" }}>Matching Rows: </span>
              <strong style={{ color: "#059669" }}>
                {matchingRowIndices.length > 0 ? `Rows #${matchingRowIndices.join(", #")}` : `${rowsList.length} rows`}
              </strong>
            </div>
            <div>
              <span style={{ color: "#64748B" }}>Skipped Rows: </span>
              <strong style={{ color: "#334155" }}>{skippedRowsCount} rows</strong>
            </div>
          </div>
        </div>
      )}

      {/* 4. Row-Level Ad Creation Cards */}
      {rowsList.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
            <ImageIcon size={14} style={{ color: "#7C3AED" }} />
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
                    backgroundColor: isRowDone ? "#F0FDF4" : isRowFailed ? "#FEF2F2" : "#FFFFFF",
                    border: `1px solid ${isRowDone ? "#BBF7D0" : isRowFailed ? "#FECACA" : "#E2E8F0"}`,
                    borderRadius: "10px",
                    padding: "10px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A" }}>
                        Excel Row #{r.rowNumber || r.rowIndex}: {r.adName}
                      </span>
                      {r.assetName && (
                        <span style={{ fontSize: "11px", backgroundColor: "#F5F3FF", color: "#6D28D9", padding: "1px 6px", borderRadius: "4px", border: "1px solid #DDD6FE" }}>
                          📁 Asset: {r.assetName}
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: "11px", fontWeight: 700, color: isRowDone ? "#059669" : isRowFailed ? "#DC2626" : "#2563EB", display: "flex", alignItems: "center", gap: "4px" }}>
                      {isRowActive && <Loader2 size={11} className="sparkle-spin" />}
                      {isRowDone ? "🟢 Verified & Live" : isRowFailed ? "🔴 Failed" : `⏳ ${r.status}`}
                    </span>
                  </div>

                  <div style={{ fontSize: "11px", color: "#475569" }}>
                    {r.step || "Processing..."}
                    {r.adId && <span style={{ marginLeft: "8px", color: "#2563EB", fontWeight: 600 }}>• Verified Ad ID: <code>{r.adId}</code></span>}
                  </div>

                  {r.error && (
                    <div style={{ fontSize: "11px", color: "#DC2626", backgroundColor: "#FEF2F2", padding: "4px 8px", borderRadius: "6px", border: "1px solid #FECACA" }}>
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
      <div style={{ paddingTop: "8px", borderTop: "1px solid #EDF2F7" }}>
        <button
          type="button"
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "transparent",
            border: "none",
            color: "#64748B",
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
                  backgroundColor: "#0F172A",
                  borderRadius: "8px",
                  border: "1px solid #334155",
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
