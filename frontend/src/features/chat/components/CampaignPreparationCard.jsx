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
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle className="w-3.5 h-3.5" /> Creation Completed
        </span>
      );
    }
    if (isPartial) {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5" /> Partially Created
        </span>
      );
    }
    if (isFailed) {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <XCircle className="w-3.5 h-3.5" /> Action Required / Failed
        </span>
      );
    }
    if (isStale) {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5" /> Stale Approval (Data Changed)
        </span>
      );
    }
    if (isReadyForReview) {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
          <Sparkles className="w-3.5 h-3.5" /> Ready for User Review & Approval
        </span>
      );
    }
    if (isNeedsInput) {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5" /> Missing Fields ({missingFields.length})
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-300 border border-slate-500/20">
        <Clock className="w-3.5 h-3.5" /> Validating Source Sheet
      </span>
    );
  };

  return (
    <div className="w-full my-4 rounded-xl border border-slate-700/60 bg-slate-900/90 backdrop-blur-md overflow-hidden shadow-xl text-slate-200">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-800 bg-slate-800/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white tracking-wide">
              {campaignName || "Meta Ads Preparation"}
            </h4>
            <p className="text-xs text-slate-400">
              Ad Set: <span className="text-slate-300 font-mono">{adSetName || "Pending"}</span> • Sheet:{" "}
              <span className="text-slate-300 font-mono">{source.spreadsheetName || "Connected Sheet"}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 px-5 pt-3 border-b border-slate-800 text-xs font-medium">
        <button
          onClick={() => setActiveTab("preview")}
          className={`pb-2.5 px-3 border-b-2 transition-colors ${
            activeTab === "preview"
              ? "border-sky-500 text-sky-400 font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Preview Tables ({adDetails.length} Ads)
        </button>
        <button
          onClick={() => setActiveTab("validation")}
          className={`pb-2.5 px-3 border-b-2 transition-colors ${
            activeTab === "validation"
              ? "border-sky-500 text-sky-400 font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Validation Report ({blockingCount === 0 ? "Valid" : `${blockingCount} Issues`})
        </button>
        {missingFields.length > 0 && (
          <button
            onClick={() => setActiveTab("missing")}
            className={`pb-2.5 px-3 border-b-2 transition-colors ${
              activeTab === "missing"
                ? "border-amber-500 text-amber-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Missing Information ({missingFields.length})
          </button>
        )}
        {creationJob.status && creationJob.status !== "IDLE" && (
          <button
            onClick={() => setActiveTab("creation")}
            className={`pb-2.5 px-3 border-b-2 transition-colors ${
              activeTab === "creation"
                ? "border-emerald-500 text-emerald-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Creation Results
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="p-5">
        {/* 1. PREVIEW TAB */}
        {activeTab === "preview" && (
          <div className="space-y-6">
            {/* Table 1: Campaign Details */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Table 1: Campaign Details
                </h5>
                <span className="text-[11px] text-slate-400">
                  Version {preview.version || 1}
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800/60 text-slate-400 border-b border-slate-700/60">
                      <th className="py-2.5 px-3 font-medium">Field</th>
                      <th className="py-2.5 px-3 font-medium">Final Value</th>
                      <th className="py-2.5 px-3 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                    {(preview.campaignDetails || []).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/20">
                        <td className="py-2 px-3 font-sans font-medium text-white">{row.field}</td>
                        <td className="py-2 px-3 text-sky-300">{String(row.value)}</td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 border border-slate-700">
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
            <div>
              <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Table 2: Ad Set Details
              </h5>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800/60 text-slate-400 border-b border-slate-700/60">
                      <th className="py-2.5 px-3 font-medium">Field</th>
                      <th className="py-2.5 px-3 font-medium">Final Value</th>
                      <th className="py-2.5 px-3 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                    {(preview.adSetDetails || []).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/20">
                        <td className="py-2 px-3 font-sans font-medium text-white">{row.field}</td>
                        <td className="py-2 px-3 text-emerald-300">{String(row.value)}</td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 border border-slate-700">
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
            <div>
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Table 3: Ad Details ({adDetails.length} Eligible Creatives)
                </h5>
                <span className="text-[11px] text-slate-400">
                  Page {adPage} of {totalAdPages}
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800/60 text-slate-400 border-b border-slate-700/60">
                      <th className="py-2 px-2.5 w-12">Row</th>
                      <th className="py-2 px-3">Ad Name</th>
                      <th className="py-2 px-2.5">Format</th>
                      <th className="py-2 px-3">Headline</th>
                      <th className="py-2 px-3">Primary Text</th>
                      <th className="py-2 px-3">Destination</th>
                      <th className="py-2 px-2.5">Status</th>
                      <th className="py-2 px-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                    {displayedAds.map((ad, idx) => {
                      const isExpanded = expandedAdRow === ad.sourceRow;
                      return (
                        <React.Fragment key={idx}>
                          <tr className="hover:bg-slate-800/30">
                            <td className="py-2 px-2.5 text-slate-400">#{ad.sourceRow}</td>
                            <td className="py-2 px-3 font-sans font-medium text-white">{ad.adName}</td>
                            <td className="py-2 px-2.5">
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300">
                                {ad.creativeType}
                              </span>
                            </td>
                            <td className="py-2 px-3 truncate max-w-[140px]">{ad.headline}</td>
                            <td className="py-2 px-3 truncate max-w-[180px] text-slate-400">{ad.primaryText}</td>
                            <td className="py-2 px-3 truncate max-w-[140px] text-sky-400">{ad.destination}</td>
                            <td className="py-2 px-2.5">
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400">
                                {ad.status}
                              </span>
                            </td>
                            <td className="py-2 px-2">
                              <button
                                onClick={() => setExpandedAdRow(isExpanded ? null : ad.sourceRow)}
                                className="p-1 rounded text-slate-400 hover:text-white"
                              >
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-800/50">
                              <td colSpan={8} className="p-3 text-xs font-sans text-slate-300 space-y-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <span className="text-[11px] text-slate-400 block font-semibold">Full Primary Text:</span>
                                    <p className="mt-0.5 whitespace-pre-wrap">{ad.primaryText || "None"}</p>
                                  </div>
                                  <div>
                                    <span className="text-[11px] text-slate-400 block font-semibold">Creative Asset Reference:</span>
                                    <p className="mt-0.5 text-sky-300 break-all font-mono text-[11px]">{String(ad.creative || "N/A")}</p>
                                    <span className="text-[11px] text-slate-400 block font-semibold mt-2">Display Link, CTA & Page ID:</span>
                                    <p className="mt-0.5 font-mono text-[11px]">
                                      {ad.displayLink && <span className="text-emerald-400 font-semibold mr-2">Link: {ad.displayLink} |</span>}
                                      Button: {ad.cta} | Page ID: {ad.pageId || "Configured"}
                                    </p>
                                    <span className="text-[11px] text-slate-400 block font-semibold mt-2">Tracking & Events:</span>
                                    <p className="mt-0.5 font-mono text-[11px] text-sky-200">
                                      {ad.tracking || "Attribution Enabled"}
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
                <div className="flex items-center justify-between mt-2.5 text-xs text-slate-400">
                  <span>Showing {displayedAds.length} of {adDetails.length} ads</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={adPage <= 1}
                      onClick={() => setAdPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 text-slate-300 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="px-2">{adPage} / {totalAdPages}</span>
                    <button
                      disabled={adPage >= totalAdPages}
                      onClick={() => setAdPage((p) => Math.min(totalAdPages, p + 1))}
                      className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 text-slate-300 disabled:opacity-40"
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
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800/60 text-slate-400 border-b border-slate-700/60">
                    <th className="py-2.5 px-3 font-medium">Validation Item</th>
                    <th className="py-2.5 px-3 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {summaryTable.map((row, idx) => {
                    const isValid = row.status === "valid";
                    const isErr = row.status === "error" || row.status === "action_required";
                    return (
                      <tr key={idx} className="hover:bg-slate-800/20">
                        <td className="py-2.5 px-3 font-medium text-white">{row.item}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium ${
                              isValid
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : isErr
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            {isValid ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
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
              <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 space-y-1.5">
                <span className="font-semibold block text-rose-200">
                  ⚠️ {blockingCount} Blocking Issues Detected:
                </span>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
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
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              Please provide the missing fields below. Once submitted, your connected source sheet will be automatically updated and verified.
            </div>

            <div className="space-y-3">
              {missingFields.map((field) => (
                <div key={field.id} className="p-3.5 rounded-lg border border-slate-800 bg-slate-800/40 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{field.label}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-700/60 text-[10px] text-slate-300 uppercase">
                      {field.level} Level
                    </span>
                  </div>
                  <p className="text-slate-400">{field.description}</p>
                  {field.affectedRows?.length > 0 && (
                    <p className="text-[11px] text-slate-400">
                      Affected Rows: {field.affectedRows.map((r) => `#${r}`).join(", ")}
                    </p>
                  )}

                  {/* Input or Options */}
                  <div className="flex items-center gap-2 pt-1">
                    {field.options && field.options.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {field.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => {
                              setAnswers({ ...answers, [field.field]: opt });
                              if (typeof onAnswerField === "function") {
                                onAnswerField({ [field.field]: opt });
                              }
                            }}
                            className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-mono border border-slate-600"
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 w-full">
                        <input
                          type="text"
                          placeholder={`Enter ${field.label}...`}
                          value={answers[field.field] || ""}
                          onChange={(e) => setAnswers({ ...answers, [field.field]: e.target.value })}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                        />
                        <button
                          disabled={!answers[field.field]?.trim() || isSending}
                          onClick={() => handleAnswerSubmit(field.field)}
                          className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs flex items-center gap-1 disabled:opacity-40"
                        >
                          <Send className="w-3.5 h-3.5" /> Save
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
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-slate-800/40 border border-slate-700/60 text-xs space-y-1">
              <span className="font-semibold text-white block">Execution Summary:</span>
              <p className="text-slate-300">
                Campaign ID: <span className="font-mono text-sky-400">{creationJob.metaCampaignId || "N/A"}</span> • Ad Set ID:{" "}
                <span className="font-mono text-emerald-400">{creationJob.metaAdSetId || "N/A"}</span>
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800/60 text-slate-400 border-b border-slate-700/60">
                    <th className="py-2.5 px-3">Row</th>
                    <th className="py-2.5 px-3">Ad Name</th>
                    <th className="py-2.5 px-3">Meta Ad ID</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                  {(creationJob.adResults || []).map((res, i) => (
                    <tr key={i} className="hover:bg-slate-800/20">
                      <td className="py-2 px-3 text-slate-400">#{res.sourceRow}</td>
                      <td className="py-2 px-3 font-sans font-medium text-white">{res.adName}</td>
                      <td className="py-2 px-3 text-sky-300">{res.adId ? `\`${res.adId}\`` : "N/A"}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            res.status === "SUCCESS"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                          }`}
                        >
                          {res.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-400 font-sans">{res.error || "Created successfully"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-800 bg-slate-900/60">
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Zero Meta creation calls executed without explicit approval</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Edit Button */}
          {!isCompleted && (
            <button
              onClick={() => setIsEditingCustom(!isEditingCustom)}
              disabled={isSending}
              className="px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <Edit3 className="w-3.5 h-3.5 text-slate-400" /> Edit Details
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
              className="px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20 transition-all disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSending ? "animate-spin" : ""}`} /> Retry Creation
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
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                isReadyForReview && !isSending && blockingCount === 0 && !isStale
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
                  : "bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed"
              }`}
            >
              <Check className="w-4 h-4" /> Approve Campaign & Create Ads
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
            className="border-t border-slate-800 p-4 bg-slate-950/80"
          >
            <span className="text-xs font-semibold text-slate-300 block mb-1.5">
              What would you like to edit?
            </span>
            <p className="text-[11px] text-slate-400 mb-2">
              You can edit campaign budget, ad set targeting, headline, creative link, or individual rows.
              (e.g., *"Change campaign budget to ₹5,000"*, *"Update headline of ad 1 to 'Flat 50% Off'"*)
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Type your requested change..."
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEditSubmit()}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-sans"
              />
              <button
                disabled={!editInstruction.trim() || isSending}
                onClick={handleEditSubmit}
                className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center gap-1 disabled:opacity-40"
              >
                Apply Edit
              </button>
              <button
                onClick={() => setIsEditingCustom(false)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-xs"
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
