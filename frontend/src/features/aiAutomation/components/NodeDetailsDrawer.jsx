import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  X,
  Zap,
  Calendar,
  Clock,
  Play,
  CheckCircle,
  AlertCircle,
  Clock3,
  HelpCircle,
  Save,
  Trash2,
  Sliders,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import {
  updateNodeConfig,
  closeDetailsDrawer,
  deleteNode,
} from "../aiAutomation.slice";

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST +5:30)" },
  { value: "UTC", label: "UTC (GMT +0:00)" },
  { value: "America/New_York", label: "America/New_York (EST/EDT -5:00)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT -8:00)" },
  { value: "America/Chicago", label: "America/Chicago (CST/CDT -6:00)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST +1:00)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET/CEST +2:00)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST +4:00)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT +8:00)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST +9:00)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST/AEDT +10:00)" },
];

export const NodeDetailsDrawer = () => {
  const dispatch = useDispatch();
  const {
    nodes,
    edges,
    isDetailsDrawerOpen,
    activeDetailsNodeId,
    saving,
  } = useSelector((state) => state.aiAutomation);

  const activeNode = nodes.find((n) => n.id === activeDetailsNodeId);

  // Local form state
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [nodeType, setNodeType] = useState("generic");
  const [config, setConfig] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);

  // Sync state whenever activeDetailsNodeId or activeNode changes
  useEffect(() => {
    if (activeNode) {
      setLabel(activeNode.label || "");
      setText(activeNode.text || "");
      setNodeType(activeNode.type || "generic");
      setConfig(activeNode.config ? JSON.parse(JSON.stringify(activeNode.config)) : {});
      setHasChanges(false);
      setValidationErrors([]);
    }
  }, [activeNode?.id, activeNode?.updatedAt]);

  if (!isDetailsDrawerOpen || !activeNode) {
    return null;
  }

  // Determine connection status
  const isTrigger = activeNode.type === "trigger";
  const incomingEdge = edges.find((e) => e.target === activeNode.id);
  const outgoingEdges = edges.filter((e) => e.source === activeNode.id);
  const connectedToTrigger = isTrigger
    ? outgoingEdges.length > 0
    : Boolean(incomingEdge);

  const updateConfigField = (field, value) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
    setHasChanges(true);
  };

  const validateConfig = () => {
    const errors = [];
    if (nodeType === "trigger") {
      const mode = config.mode || "schedule";
      if (!mode) errors.push("Trigger mode is required");
    } else if (nodeType === "date") {
      const dateType = config.dateType || "specific";
      if (dateType === "specific" && !config.specificDate) {
        errors.push("Please select a specific date");
      }
      if (dateType === "recurring") {
        const pattern = config.recurrencePattern || "every_day";
        if (pattern === "every_n_days" && (!config.intervalDays || Number(config.intervalDays) < 1)) {
          errors.push("Interval days must be at least 1");
        }
      }
    } else if (nodeType === "action") {
      if (!config.actionType) {
        errors.push("Action type is required");
      }
      if (!config.message || !config.message.trim()) {
        errors.push("Action message or instructions are required");
      }
    } else if (nodeType === "time") {
      if (!config.time) {
        errors.push("Time is required (e.g. 09:30 AM)");
      }
      if (!config.timezone) {
        errors.push("Timezone is required");
      }
      if (config.recurrence === "every_n_days" && (!config.intervalDays || Number(config.intervalDays) < 1)) {
        errors.push("Interval days must be at least 1");
      }
    }
    return errors;
  };

  const handleSave = async () => {
    const errors = validateConfig();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);
    await dispatch(
      updateNodeConfig({
        nodeId: activeNode.id,
        label: label.trim() || undefined,
        config,
        status: "configured",
      })
    ).unwrap();
    setHasChanges(false);
  };

  const handleClose = () => {
    dispatch(closeDetailsDrawer());
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this node?")) {
      dispatch(deleteNode(activeNode.id));
      dispatch(closeDetailsDrawer());
    }
  };

  // Node type visual helpers
  const getTypeBadge = () => {
    switch (activeNode.type) {
      case "trigger":
        return {
          icon: <Zap size={14} />,
          bg: "#F5F3FF",
          color: "#7C3AED",
          border: "#DDD6FE",
          label: "Trigger Node",
        };
      case "date":
        return {
          icon: <Calendar size={14} />,
          bg: "#EFF6FF",
          color: "#2563EB",
          border: "#BFDBFE",
          label: "Date Node",
        };
      case "action":
        return {
          icon: <Play size={14} />,
          bg: "#ECFDF5",
          color: "#059669",
          border: "#A7F3D0",
          label: "Action Node",
        };
      case "time":
        return {
          icon: <Clock size={14} />,
          bg: "#FFFBEB",
          color: "#D97706",
          border: "#FDE68A",
          label: "Time Node",
        };
      default:
        return {
          icon: <Sliders size={14} />,
          bg: "#F8FAFC",
          color: "#475569",
          border: "#E2E8F0",
          label: "Generic Node",
        };
    }
  };

  const badge = getTypeBadge();

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 380,
        backgroundColor: "#FFFFFF",
        borderLeft: "1px solid #E2E8F0",
        boxShadow: "-8px 0 24px rgba(15, 23, 42, 0.08)",
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
        animation: "drawerSlideIn 0.22s ease-out",
      }}
    >
      <style>{`
        @keyframes drawerSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {/* Drawer Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid #F1F5F9",
          backgroundColor: "#FAFBFD",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: badge.bg,
              color: badge.color,
              border: `1px solid ${badge.border}`,
            }}
          >
            {badge.icon}
            {badge.label}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#94A3B8",
              fontFamily: "monospace",
            }}
          >
            #{activeNode.sequenceLabel || (activeNode.stepNumber ? `node${activeNode.stepNumber}` : "node_")}
          </span>
        </div>

        <button
          type="button"
          onClick={handleClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 6,
            borderRadius: 6,
            color: "#64748B",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F1F5F9")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <X size={18} />
        </button>
      </div>

      {/* Connection & Validation Status Banner */}
      <div
        style={{
          padding: "10px 20px",
          backgroundColor: connectedToTrigger ? "#F0FDF4" : "#FEF2F2",
          borderBottom: `1px solid ${connectedToTrigger ? "#DCFCE7" : "#FEE2E2"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {connectedToTrigger ? (
            <>
              <CheckCircle size={14} color="#16A34A" />
              <span style={{ color: "#166534", fontWeight: 500 }}>
                {isTrigger ? `Connected to ${outgoingEdges.length} child nodes` : "Connected to Trigger"}
              </span>
            </>
          ) : (
            <>
              <AlertCircle size={14} color="#DC2626" />
              <span style={{ color: "#991B1B", fontWeight: 500 }}>
                {isTrigger ? "No child nodes connected" : "Not connected to Trigger"}
              </span>
            </>
          )}
        </div>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            backgroundColor: activeNode.status === "configured" ? "#DCFCE7" : "#FEF3C7",
            color: activeNode.status === "configured" ? "#166534" : "#92400E",
          }}
        >
          {activeNode.status === "configured" ? "Configured" : "Incomplete"}
        </span>
      </div>

      {/* Validation Errors alert if any */}
      {validationErrors.length > 0 && (
        <div
          style={{
            margin: "12px 20px 0 20px",
            padding: "10px 14px",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: 8,
            fontSize: 12,
            color: "#991B1B",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldAlert size={14} /> Validation Required:
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Scrollable Form Body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Node Name / Label */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
            Node Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setHasChanges(true);
            }}
            placeholder={`e.g. ${badge.label}`}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #CBD5E1",
              fontSize: 13,
              color: "#0F172A",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* ----------------- TRIGGER CONFIGURATION ----------------- */}
        {nodeType === "trigger" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                Trigger Mode
              </label>
              <select
                value={config.mode || "schedule"}
                onChange={(e) => updateConfigField("mode", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: 13,
                  color: "#0F172A",
                  backgroundColor: "#FFFFFF",
                }}
              >
                <option value="schedule">Schedule (Run automatically on date & time)</option>
                <option value="manual">Manual (Run only when user clicks Run Now)</option>
                <option value="webhook">Webhook (Triggered via API call)</option>
              </select>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 8,
                backgroundColor: "#F8FAFC",
                border: "1px solid #E2E8F0",
                fontSize: 12,
                color: "#64748B",
                lineHeight: 1.5,
              }}
            >
              {(config.mode || "schedule") === "schedule" && (
                <p style={{ margin: 0 }}>
                  <strong>Scheduled Mode:</strong> The automation will run according to connected <strong>Date</strong> and <strong>Time</strong> nodes. Both must be configured and connected to the Trigger.
                </p>
              )}
              {config.mode === "manual" && (
                <p style={{ margin: 0 }}>
                  <strong>Manual Mode:</strong> This workflow executes immediately whenever you click the <strong>Run Now</strong> button.
                </p>
              )}
              {config.mode === "webhook" && (
                <p style={{ margin: 0 }}>
                  <strong>Webhook Mode:</strong> Can be triggered via backend endpoint:
                  <code style={{ display: "block", marginTop: 4, padding: "4px 8px", background: "#EDF2F7", borderRadius: 4, color: "#2D3748" }}>
                    POST /api/automation/run
                  </code>
                </p>
              )}
            </div>
          </div>
        )}

        {/* ----------------- DATE CONFIGURATION ----------------- */}
        {nodeType === "date" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                Date Schedule Type
              </label>
              <select
                value={config.dateType || "specific"}
                onChange={(e) => updateConfigField("dateType", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: 13,
                  color: "#0F172A",
                }}
              >
                <option value="specific">Specific Calendar Date</option>
                <option value="recurring">Recurring Schedule</option>
              </select>
            </div>

            {/* Specific Date Picker */}
            {(config.dateType || "specific") === "specific" && (
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                  Select Date
                </label>
                <input
                  type="date"
                  value={config.specificDate || ""}
                  onChange={(e) => updateConfigField("specificDate", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #CBD5E1",
                    fontSize: 13,
                    color: "#0F172A",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}

            {/* Recurring Date Settings */}
            {config.dateType === "recurring" && (
              <>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                    Recurrence Pattern
                  </label>
                  <select
                    value={config.recurrencePattern || "every_day"}
                    onChange={(e) => updateConfigField("recurrencePattern", e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #CBD5E1",
                      fontSize: 13,
                      color: "#0F172A",
                    }}
                  >
                    <option value="every_day">Run every day</option>
                    <option value="specific_day_of_month">Specific day of each month (e.g. 25th)</option>
                    <option value="every_n_days">Every N days interval</option>
                  </select>
                </div>

                {config.recurrencePattern === "specific_day_of_month" && (
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                      Day of Month (1 - 31)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={config.dayOfMonth || 1}
                      onChange={(e) => updateConfigField("dayOfMonth", Number(e.target.value))}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #CBD5E1",
                        fontSize: 13,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                )}

                {config.recurrencePattern === "every_n_days" && (
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                      Interval (Every N Days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={config.intervalDays || 7}
                      onChange={(e) => updateConfigField("intervalDays", Number(e.target.value))}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #CBD5E1",
                        fontSize: 13,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                )}

                {/* Start Date & End Date */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={config.startDate || ""}
                      onChange={(e) => updateConfigField("startDate", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        borderRadius: 6,
                        border: "1px solid #CBD5E1",
                        fontSize: 12,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                      End Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={config.endDate || ""}
                      onChange={(e) => updateConfigField("endDate", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        borderRadius: 6,
                        border: "1px solid #CBD5E1",
                        fontSize: 12,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Timezone */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                Timezone
              </label>
              <select
                value={config.timezone || "Asia/Kolkata"}
                onChange={(e) => updateConfigField("timezone", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: 13,
                  color: "#0F172A",
                }}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ----------------- ACTION CONFIGURATION ----------------- */}
        {nodeType === "action" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                Action Type
              </label>
              <select
                value={config.actionType || "send_notification"}
                onChange={(e) => updateConfigField("actionType", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: 13,
                  color: "#0F172A",
                }}
              >
                <option value="send_notification">Send In-App Notification</option>
                <option value="create_reminder">Create Reminder / Task</option>
                <option value="ai_agent_task">Execute AI Agent Task</option>
                <option value="generate_report">Generate Marketing / Ads Report</option>
                <option value="meta_ads_sheet_sync">Sync Meta Ads Data to Google Sheet (Daily Reporting)</option>
              </select>
            </div>

            {config.actionType === "meta_ads_sheet_sync" && (
              <div
                style={{
                  backgroundColor: "#F0FDF4",
                  border: "1px solid #BBF7D0",
                  borderRadius: 8,
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#166534" }}>
                  📊 Daily Meta Ads Reporting Setup
                </div>
                <div style={{ fontSize: "11px", color: "#15803D", lineHeight: 1.4 }}>
                  Automatically queries Meta Marketing API for yesterday (Asia/Kolkata), matches Google Sheet headers dynamically, protects against duplicates, and appends rows.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                  <button
                    type="button"
                    onClick={() => {
                      updateConfigField("worksheetName", "BGMI");
                      updateConfigField("message", "Fetch Meta Ads performance data and append it to the BGMI worksheet.");
                    }}
                    style={{
                      fontSize: "10.5px",
                      padding: "4px 8px",
                      borderRadius: 6,
                      backgroundColor: "#DCFCE7",
                      border: "1px solid #86EFAC",
                      color: "#166534",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    + BGMI Template
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateConfigField("worksheetName", "Free Fire");
                      updateConfigField("message", "Fetch Meta Ads performance data and append it to the Free Fire worksheet.");
                    }}
                    style={{
                      fontSize: "10.5px",
                      padding: "4px 8px",
                      borderRadius: 6,
                      backgroundColor: "#DCFCE7",
                      border: "1px solid #86EFAC",
                      color: "#166534",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    + Free Fire Template
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateConfigField("worksheetName", "GPRC");
                      updateConfigField("message", "Fetch Meta Ads performance data and append it to the GPRC worksheet.");
                    }}
                    style={{
                      fontSize: "10.5px",
                      padding: "4px 8px",
                      borderRadius: 6,
                      backgroundColor: "#DCFCE7",
                      border: "1px solid #86EFAC",
                      color: "#166534",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    + GPRC Template
                  </button>
                </div>
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                Action Message / Instructions *
              </label>
              <textarea
                rows={4}
                value={config.message || ""}
                onChange={(e) => updateConfigField("message", e.target.value)}
                placeholder="e.g. Generate my daily Meta Ads performance summary and audit high CPA campaigns"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: 13,
                  color: "#0F172A",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                Priority
              </label>
              <select
                value={config.priority || "medium"}
                onChange={(e) => updateConfigField("priority", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: 13,
                  color: "#0F172A",
                }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
        )}

        {/* ----------------- TIME CONFIGURATION ----------------- */}
        {nodeType === "time" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                Execution Time (24h or HH:mm) *
              </label>
              <input
                type="time"
                value={config.time || "09:00"}
                onChange={(e) => updateConfigField("time", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: 13,
                  color: "#0F172A",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                Timezone (IANA) *
              </label>
              <select
                value={config.timezone || "Asia/Kolkata"}
                onChange={(e) => updateConfigField("timezone", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: 13,
                  color: "#0F172A",
                }}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                Recurrence Option
              </label>
              <select
                value={config.recurrence || "daily"}
                onChange={(e) => updateConfigField("recurrence", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: 13,
                  color: "#0F172A",
                }}
              >
                <option value="daily">Daily — Run every day at selected time</option>
                <option value="monthly">Monthly — Run on configured days of month</option>
                <option value="last_day_of_month">Last day of month — Run on final calendar day</option>
                <option value="custom_days">Custom — Select specific days of month</option>
                <option value="every_n_days">Every N days interval</option>
              </select>
            </div>

            {config.recurrence === "custom_days" && (
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                  Select Days of Month (e.g. 1, 10, 20, 28)
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                    const selectedDays = Array.isArray(config.daysOfMonth) ? config.daysOfMonth : [];
                    const isSelected = selectedDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          const updated = isSelected
                            ? selectedDays.filter((d) => d !== day)
                            : [...selectedDays, day].sort((a, b) => a - b);
                          updateConfigField("daysOfMonth", updated);
                        }}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          border: isSelected ? "1.5px solid #0081FB" : "1px solid #E2E8F0",
                          backgroundColor: isSelected ? "#EFF6FF" : "#FFFFFF",
                          color: isSelected ? "#0081FB" : "#475569",
                          fontSize: 11,
                          fontWeight: isSelected ? 700 : 500,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {config.recurrence === "every_n_days" && (
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                  Interval (Every N Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={config.intervalDays || 20}
                  onChange={(e) => updateConfigField("intervalDays", Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #CBD5E1",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drawer Footer Actions */}
      <div
        style={{
          padding: "16px 20px",
          borderTop: "1px solid #F1F5F9",
          backgroundColor: "#FAFBFD",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <button
          type="button"
          onClick={handleDelete}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "8px 12px",
            borderRadius: 6,
            color: "#EF4444",
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#FEE2E2")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <Trash2 size={14} /> Delete
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={handleClose}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #CBD5E1",
              backgroundColor: "#FFFFFF",
              color: "#475569",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              backgroundColor: "#0081FB",
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 2px 6px rgba(0, 129, 251, 0.25)",
            }}
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NodeDetailsDrawer;
