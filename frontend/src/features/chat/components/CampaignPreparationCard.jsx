import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Edit3,
  Check,
  Send,
  RefreshCw,
  Layers,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

export const CampaignPreparationCard = ({
  session,
  onApprove,
  onEdit,
  onAnswerField,
  isSending = false,
}) => {
  if (!session) return null;

  const {
    sessionId,
    status = "VALIDATING",
    campaignName = "",
    adSetName = "",
    campaignType = "WEBSITE",
    objective = "OUTCOME_SALES",
    source = {},
    validationReport = {},
    missingFields = [],
    preview = {},
    creationJob = {},
  } = session;

  const [activeTab, setActiveTab] = useState("preview"); // "validation" | "preview" | "missing" | "creation"
  const [adPage, setAdPage] = useState(1);
  const [expandedAdRow, setExpandedAdRow] = useState(null);
  const [answers, setAnswers] = useState({});
  const [isEditingCustom, setIsEditingCustom] = useState(false);
  const [editInstruction, setEditInstruction] = useState("");

  const summaryTable = validationReport.summaryTable || [];
  const blockingCount = validationReport.blockingCount || 0;
  const warningCount = validationReport.warningCount || 0;
  const isReadyForReview = status === "READY_FOR_REVIEW";
  const isApproved = status === "APPROVED" || status === "CREATING" || status === "COMPLETED";
  const isCompleted = status === "COMPLETED";
  const isPartial = creationJob.status === "PARTIAL";
  const isFailed = status === "FAILED" || creationJob.status === "FAILED";
  const isStale = status === "STALE_APPROVAL";
  const isNeedsInput = status === "NEEDS_USER_INPUT" || blockingCount > 0;

  const adDetails = preview.adDetails || [];
  const pageSize = 5;
  const totalAdPages = Math.ceil(adDetails.length / pageSize) || 1;
  const displayedAds = adDetails.slice((adPage - 1) * pageSize, adPage * pageSize);

  const handleAnswerSubmit = (fieldId) => {
    const val = answers[fieldId];
    if (!val || !val.trim()) return;
    if (typeof onAnswerField === "function") {
      onAnswerField({ [fieldId]: val.trim() });
    }
  };

  const handleEditSubmit = () => {
    if (!editInstruction.trim()) return;
    if (typeof onEdit === "function") {
      onEdit(editInstruction.trim());
      setIsEditingCustom(false);
      setEditInstruction("");
    }
  };

  // Status Badge Helper
  const getStatusBadge = () => {
    if (isCompleted) {
      return (
        <span className="prep-badge prep-badge-success">
          <CheckCircle size={13} /> Creation Completed
        </span>
      );
    }
    if (isPartial) {
      return (
        <span className="prep-badge prep-badge-warning">
          <AlertTriangle size={13} /> Partially Created
        </span>
      );
    }
    if (isFailed) {
      return (
        <span className="prep-badge prep-badge-error">
          <XCircle size={13} /> Action Required / Failed
        </span>
      );
    }
    if (isStale) {
      return (
        <span className="prep-badge prep-badge-warning">
          <AlertTriangle size={13} /> Stale Approval (Data Changed)
        </span>
      );
    }
    if (isReadyForReview) {
      return (
        <span className="prep-badge prep-badge-info">
          <Sparkles size={13} /> Ready for User Review & Approval
        </span>
      );
    }
    if (isNeedsInput) {
      return (
        <span className="prep-badge prep-badge-warning">
          <AlertTriangle size={13} /> Missing Fields ({missingFields.length})
        </span>
      );
    }
    return (
      <span className="prep-badge prep-badge-neutral">
        <Clock size={13} /> Validating Source Sheet
      </span>
    );
  };

  return (
    <div className="campaign-prep-card">
      {/* Top Header */}
      <div className="prep-card-header">
        <div className="prep-header-left">
          <div className="prep-header-icon">
            <Layers size={18} />
          </div>
          <div>
            <h4 className="prep-header-title">
              {campaignName || "Meta Ads Preparation"}
            </h4>
            <p className="prep-header-sub">
              Ad Set: <strong style={{ color: "var(--ink)", fontFamily: "monospace" }}>{adSetName || "Pending"}</strong> • Sheet:{" "}
              <strong style={{ color: "var(--ink)" }}>{source.spreadsheetName || "Connected Sheet"}</strong>
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {getStatusBadge()}
        </div>
      </div>

      {/* Tabs */}
      <div className="prep-card-tabs">
        <button
          onClick={() => setActiveTab("preview")}
          className={`prep-tab-btn ${activeTab === "preview" ? "active" : ""}`}
        >
          Preview Tables ({adDetails.length} Ads)
        </button>
        <button
          onClick={() => setActiveTab("validation")}
          className={`prep-tab-btn ${activeTab === "validation" ? "active" : ""}`}
        >
          Validation Report ({blockingCount === 0 ? "Valid" : `${blockingCount} Issues`})
        </button>
        {missingFields.length > 0 && (
          <button
            onClick={() => setActiveTab("missing")}
            className={`prep-tab-btn ${activeTab === "missing" ? "active" : ""}`}
          >
            Missing Information ({missingFields.length})
          </button>
        )}
        {creationJob.status && creationJob.status !== "IDLE" && (
          <button
            onClick={() => setActiveTab("creation")}
            className={`prep-tab-btn ${activeTab === "creation" ? "active" : ""}`}
          >
            Creation Results
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="prep-card-body">
        {/* 1. PREVIEW TAB */}
        {activeTab === "preview" && (
          <div>
            {/* Table 1: Campaign Details */}
            <div className="prep-table-section">
              <div className="prep-section-heading">
                <h5 className="prep-section-title">
                  Table 1: Campaign Details
                </h5>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                  Version {preview.version || 1}
                </span>
              </div>
              <div className="prep-table-container">
                <table className="prep-data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "35%" }}>Field</th>
                      <th style={{ width: "45%" }}>Final Value</th>
                      <th style={{ width: "20%" }}>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.campaignDetails || []).map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{row.field}</td>
                        <td style={{ color: "var(--blue)", fontWeight: 500 }}>{String(row.value)}</td>
                        <td>
                          <span style={{ padding: "2px 6px", borderRadius: "4px", backgroundColor: "#F1F5F9", fontSize: "11px", color: "#475569" }}>
                            {row.source}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 2: Ad Set Details */}
            <div className="prep-table-section">
              <div className="prep-section-heading">
                <h5 className="prep-section-title">
                  Table 2: Ad Set Details
                </h5>
              </div>
              <div className="prep-table-container">
                <table className="prep-data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "35%" }}>Field</th>
                      <th style={{ width: "45%" }}>Final Value</th>
                      <th style={{ width: "20%" }}>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.adSetDetails || []).map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{row.field}</td>
                        <td style={{ color: "#059669", fontWeight: 500 }}>{String(row.value)}</td>
                        <td>
                          <span style={{ padding: "2px 6px", borderRadius: "4px", backgroundColor: "#F1F5F9", fontSize: "11px", color: "#475569" }}>
                            {row.source}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 3: Ad Details */}
            <div className="prep-table-section">
              <div className="prep-section-heading">
                <h5 className="prep-section-title">
                  Table 3: Ad Details ({adDetails.length} Eligible Creatives)
                </h5>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                  Page {adPage} of {totalAdPages}
                </span>
              </div>
              <div className="prep-table-container">
                <table className="prep-data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "45px" }}>Row</th>
                      <th>Ad Name</th>
                      <th>Format</th>
                      <th>Headline</th>
                      <th>Primary Text</th>
                      <th>Destination</th>
                      <th>Status</th>
                      <th style={{ width: "30px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedAds.map((ad, idx) => {
                      const isExpanded = expandedAdRow === ad.sourceRow;
                      return (
                        <React.Fragment key={idx}>
                          <tr>
                            <td style={{ color: "var(--muted)", fontWeight: 600 }}>#{ad.sourceRow}</td>
                            <td style={{ fontWeight: 600, color: "var(--ink)" }}>{ad.adName}</td>
                            <td>
                              <span style={{ padding: "2px 6px", borderRadius: "4px", backgroundColor: "#EEF2FF", color: "#4F46E5", fontSize: "10.5px", fontWeight: 600 }}>
                                {ad.creativeType}
                              </span>
                            </td>
                            <td style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {ad.headline}
                            </td>
                            <td style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--muted)" }}>
                              {ad.primaryText}
                            </td>
                            <td style={{ maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--blue)" }}>
                              {ad.destination}
                            </td>
                            <td>
                              <span className="prep-badge prep-badge-success" style={{ fontSize: "10px", padding: "2px 7px" }}>
                                {ad.status}
                              </span>
                            </td>
                            <td>
                              <button
                                onClick={() => setExpandedAdRow(isExpanded ? null : ad.sourceRow)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr style={{ backgroundColor: "#F8FAFC" }}>
                              <td colSpan={8} style={{ padding: "12px 16px", fontSize: "12px" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                  <div>
                                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 3 }}>Full Primary Text:</span>
                                    <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--ink)", lineHeight: 1.5 }}>{ad.primaryText || "None"}</p>
                                  </div>
                                  <div>
                                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 3 }}>Creative Asset:</span>
                                    <p style={{ margin: 0, color: "var(--blue)", wordBreak: "break-all", fontFamily: "monospace", fontSize: "11px" }}>{String(ad.creative || "N/A")}</p>
                                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", display: "block", marginTop: 8, marginBottom: 3 }}>Button & Settings:</span>
                                    <p style={{ margin: 0, fontSize: "11.5px", color: "var(--ink)" }}>
                                      CTA: <strong>{ad.cta || "LEARN_MORE"}</strong> | Page ID: <code>{ad.pageId || "Configured"}</code>
                                    </p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalAdPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "10px", fontSize: "12px", color: "var(--muted)" }}>
                  <span>Showing {displayedAds.length} of {adDetails.length} ads</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      disabled={adPage <= 1}
                      onClick={() => setAdPage((p) => Math.max(1, p - 1))}
                      className="prep-btn-secondary"
                      style={{ padding: "4px 10px", fontSize: "11.5px" }}
                    >
                      Previous
                    </button>
                    <span style={{ padding: "0 6px" }}>{adPage} / {totalAdPages}</span>
                    <button
                      disabled={adPage >= totalAdPages}
                      onClick={() => setAdPage((p) => Math.min(totalAdPages, p + 1))}
                      className="prep-btn-secondary"
                      style={{ padding: "4px 10px", fontSize: "11.5px" }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. VALIDATION REPORT TAB */}
        {activeTab === "validation" && (
          <div>
            <div className="prep-table-container">
              <table className="prep-data-table">
                <thead>
                  <tr>
                    <th>Validation Item</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryTable.map((row, idx) => {
                    const isValid = row.status === "valid";
                    const isErr = row.status === "error" || row.status === "action_required";
                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{row.item}</td>
                        <td>
                          <span className={`prep-badge ${isValid ? "prep-badge-success" : isErr ? "prep-badge-error" : "prep-badge-warning"}`}>
                            {isValid ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
                            {row.result}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Issues Breakdown */}
            {blockingCount > 0 && (
              <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: "8px", backgroundColor: "#FEF2F2", border: "1px solid #FECACA", fontSize: "12px", color: "#DC2626" }}>
                <strong style={{ display: "block", marginBottom: 6 }}>
                  ⚠️ {blockingCount} Blocking Issues Detected:
                </strong>
                <ul style={{ margin: 0, paddingLeft: "18px", color: "#B91C1C", lineHeight: 1.6 }}>
                  {(validationReport.campaignIssues || []).map((iss, i) => (
                    <li key={`c-${i}`}>Campaign: {iss.message}</li>
                  ))}
                  {(validationReport.adSetIssues || []).map((iss, i) => (
                    <li key={`as-${i}`}>Ad Set: {iss.message}</li>
                  ))}
                  {(validationReport.adIssues || []).map((iss, i) => (
                    <li key={`ad-${i}`}>Row #{iss.rowNumber}: {iss.message}</li>
                  ))}
                  {(validationReport.mediaIssues || []).map((iss, i) => (
                    <li key={`m-${i}`}>Media Row #{iss.rowNumber}: {iss.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 3. MISSING INFORMATION TAB */}
        {activeTab === "missing" && (
          <div>
            <div style={{ padding: "12px 16px", borderRadius: "8px", backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", fontSize: "12.5px", color: "#B45309", marginBottom: 14 }}>
              Please provide the missing fields below. Once submitted, your connected source sheet will be automatically updated and verified.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {missingFields.map((field) => (
                <div key={field.id} style={{ padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--line)", backgroundColor: "#F8FAFC" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <strong style={{ fontSize: "13px", color: "var(--ink)" }}>{field.label}</strong>
                    <span style={{ fontSize: "10px", textTransform: "uppercase", padding: "2px 6px", borderRadius: "4px", backgroundColor: "#E2E8F0", color: "#475569" }}>
                      {field.level} Level
                    </span>
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--muted)", margin: "0 0 10px 0" }}>{field.description}</p>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {field.options && field.options.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {field.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => {
                              setAnswers({ ...answers, [field.field]: opt });
                              if (typeof onAnswerField === "function") {
                                onAnswerField({ [field.field]: opt });
                              }
                            }}
                            className="prep-btn-secondary"
                            style={{ fontSize: "11px", padding: "4px 8px" }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                        <input
                          type="text"
                          placeholder={`Enter ${field.label}...`}
                          value={answers[field.field] || ""}
                          onChange={(e) => setAnswers({ ...answers, [field.field]: e.target.value })}
                          style={{ flex: 1, padding: "7px 10px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "12px", outline: "none" }}
                        />
                        <button
                          disabled={!answers[field.field]?.trim() || isSending}
                          onClick={() => handleAnswerSubmit(field.field)}
                          className="prep-btn-primary"
                          style={{ padding: "7px 12px", fontSize: "11.5px" }}
                        >
                          <Send size={12} /> Save
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. CREATION RESULTS TAB */}
        {activeTab === "creation" && (
          <div>
            <div style={{ padding: "12px 16px", borderRadius: "8px", backgroundColor: "#EEF4FF", border: "1px solid #BFDBFE", fontSize: "12.5px", marginBottom: 14 }}>
              <strong style={{ color: "var(--blue)", display: "block", marginBottom: 3 }}>Execution Summary:</strong>
              <span style={{ color: "var(--ink)" }}>
                Campaign ID: <code>{creationJob.metaCampaignId || "N/A"}</code> • Ad Set ID: <code>{creationJob.metaAdSetId || "N/A"}</code>
              </span>
            </div>

            <div className="prep-table-container">
              <table className="prep-data-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Ad Name</th>
                    <th>Meta Ad ID</th>
                    <th>Status</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {(creationJob.adResults || []).map((res, i) => (
                    <tr key={i}>
                      <td style={{ color: "var(--muted)", fontWeight: 600 }}>#{res.sourceRow}</td>
                      <td style={{ fontWeight: 600, color: "var(--ink)" }}>{res.adName}</td>
                      <td><code>{res.adId || "N/A"}</code></td>
                      <td>
                        <span className={`prep-badge ${res.status === "SUCCESS" ? "prep-badge-success" : "prep-badge-error"}`}>
                          {res.status}
                        </span>
                      </td>
                      <td style={{ color: "var(--muted)" }}>{res.error || "Created successfully"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Action Footer */}
      <div className="prep-card-footer">
        <div style={{ fontSize: "12px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "6px" }}>
          <ShieldCheck size={16} style={{ color: "#10B981" }} />
          <span>Zero Meta creation calls executed without explicit approval</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Edit Button */}
          {!isCompleted && (
            <button
              onClick={() => setIsEditingCustom(!isEditingCustom)}
              disabled={isSending}
              className="prep-btn-secondary"
            >
              <Edit3 size={13} /> Edit Details
            </button>
          )}

          {/* Retry Button if Failed */}
          {isFailed && !isCompleted && (
            <button
              onClick={() => {
                if (typeof onApprove === "function") {
                  onApprove();
                }
              }}
              disabled={isSending}
              className="prep-btn-warning"
            >
              <RefreshCw size={13} className={isSending ? "spin" : ""} /> Retry Creation
            </button>
          )}

          {/* Approve Button */}
          {!isFailed && (
            <button
              onClick={() => {
                if (typeof onApprove === "function") {
                  onApprove();
                }
              }}
              disabled={!isReadyForReview || isSending || blockingCount > 0 || isStale}
              className="prep-btn-primary"
            >
              <Check size={14} /> Approve Campaign & Create Ads
            </button>
          )}
        </div>
      </div>

      {/* Inline Edit Form Overlay */}
      <AnimatePresence>
        {isEditingCustom && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", borderTop: "1px solid var(--line)", padding: "16px 20px", backgroundColor: "#F8FAFC" }}
          >
            <strong style={{ fontSize: "12.5px", color: "var(--ink)", display: "block", marginBottom: 4 }}>
              What would you like to edit?
            </strong>
            <p style={{ fontSize: "11.5px", color: "var(--muted)", margin: "0 0 10px 0" }}>
              You can edit campaign budget, ad set targeting, headline, creative link, or individual rows (e.g. *"Change budget to ₹5,000"*, *"Update headline of ad 1"*).
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="text"
                placeholder="Type your requested change..."
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEditSubmit()}
                style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "12.5px", outline: "none" }}
              />
              <button
                disabled={!editInstruction.trim() || isSending}
                onClick={handleEditSubmit}
                className="prep-btn-primary"
              >
                Apply Edit
              </button>
              <button
                onClick={() => setIsEditingCustom(false)}
                className="prep-btn-secondary"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CampaignPreparationCard;
