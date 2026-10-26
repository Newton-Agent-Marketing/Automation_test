import React, { useState, useEffect } from "react";
import {
  X,
  Calendar as CalendarIcon,
  Clock,
  Play,
  Zap,
  ChevronLeft,
  ChevronRight,
  Check,
  Trash2,
  Save,
  Globe,
  Bell,
  Sparkles,
  ListTodo,
  BarChart3,
} from "lucide-react";

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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTH_LIST = [
  { id: 1, name: "January", short: "Jan" },
  { id: 2, name: "February", short: "Feb" },
  { id: 3, name: "March", short: "Mar" },
  { id: 4, name: "April", short: "Apr" },
  { id: 5, name: "May", short: "May" },
  { id: 6, name: "June", short: "Jun" },
  { id: 7, name: "July", short: "Jul" },
  { id: 8, name: "August", short: "Aug" },
  { id: 9, name: "September", short: "Sep" },
  { id: 10, name: "October", short: "Oct" },
  { id: 11, name: "November", short: "Nov" },
  { id: 12, name: "December", short: "Dec" },
];

const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export const RECURRENCE_OPTIONS = [
  {
    value: "once",
    label: "Run Once",
    description: "Automation sirf ek baar execute hoga.",
  },
  {
    value: "every_day",
    label: "Run Every Day",
    description: "Har din ek fixed time par run hoga.",
  },
  {
    value: "every_week",
    label: "Run Every Week",
    description: "Selected day, jaise Monday, ko run hoga.",
  },
  {
    value: "every_month",
    label: "Run Every Month",
    description: "Har month selected date par run hoga.",
  },
  {
    value: "regular_interval",
    label: "Run at Regular Intervals",
    description: "Har 5 minutes, 30 minutes, 2 hours ya custom interval par.",
  },
];

export const TriggerNodeConfigModal = ({
  isOpen,
  node,
  isSaving,
  onClose,
  onSave,
  onDelete,
}) => {
  if (!isOpen || !node) return null;

  const nodeType = node.type || "date";
  const isDate = nodeType === "date";
  const isTime = nodeType === "time";
  const isAction = nodeType === "action";

  // Date State
  const initialDateStr = node.config?.specificDate || new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(initialDateStr);
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date(initialDateStr);
    return isNaN(d.getTime()) ? new Date() : d;
  });
  const [dateType, setDateType] = useState(node.config?.dateType || "specific");
  const [recurrencePattern, setRecurrencePattern] = useState(node.config?.recurrencePattern || "every_day");
  const [selectedDaysOfWeek, setSelectedDaysOfWeek] = useState(() => {
    if (Array.isArray(node.config?.selectedDaysOfWeek) && node.config.selectedDaysOfWeek.length > 0) {
      return node.config.selectedDaysOfWeek;
    }
    if (node.config?.selectedDayOfWeek) {
      return [node.config.selectedDayOfWeek];
    }
    return ["Monday"];
  });
  const [dayOfMonth, setDayOfMonth] = useState(node.config?.dayOfMonth || 1);
  const [selectedMonths, setSelectedMonths] = useState(() => {
    if (Array.isArray(node.config?.selectedMonths) && node.config.selectedMonths.length > 0) {
      return node.config.selectedMonths;
    }
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  });
  const [regularInterval, setRegularInterval] = useState(node.config?.regularInterval || "30m");

  // Toggle day of week selection (supports 1 or multiple days)
  const toggleDayOfWeek = (day) => {
    setSelectedDaysOfWeek((prev) => {
      if (prev.includes(day)) {
        if (prev.length === 1) return prev; // keep at least 1 day selected
        return prev.filter((d) => d !== day);
      } else {
        return [...prev, day];
      }
    });
  };

  // Toggle all days of the week
  const selectAllDays = () => {
    if (selectedDaysOfWeek.length === 7) {
      setSelectedDaysOfWeek(["Monday"]);
    } else {
      setSelectedDaysOfWeek([
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ]);
    }
  };

  // Toggle month selection (supports 1, multiple, or all months)
  const toggleMonth = (mId) => {
    setSelectedMonths((prev) => {
      if (prev.includes(mId)) {
        if (prev.length === 1) return prev; // keep at least 1
        return prev.filter((id) => id !== mId);
      } else {
        return [...prev, mId].sort((a, b) => a - b);
      }
    });
  };

  // Toggle All Months
  const selectAllMonths = () => {
    if (selectedMonths.length === 12) {
      setSelectedMonths([new Date().getMonth() + 1]);
    } else {
      setSelectedMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    }
  };

  // Time State
  const [time, setTime] = useState(node.config?.time || "09:00");
  const [timezone, setTimezone] = useState(node.config?.timezone || "Asia/Kolkata");
  const [recurrence, setRecurrence] = useState(node.config?.recurrence || "daily");

  // Action State
  const [actionType, setActionType] = useState(node.config?.actionType || "send_notification");
  const [message, setMessage] = useState(node.config?.message || node.text || "");
  const [priority, setPriority] = useState(node.config?.priority || "medium");

  // Sync on node change
  useEffect(() => {
    if (node) {
      if (node.type === "date") {
        const dStr = node.config?.specificDate || new Date().toISOString().split("T")[0];
        setSelectedDate(dStr);
        const d = new Date(dStr);
        setViewDate(isNaN(d.getTime()) ? new Date() : d);
        setDateType(node.config?.dateType || "specific");
        setRecurrencePattern(node.config?.recurrencePattern || "every_day");
        if (Array.isArray(node.config?.selectedDaysOfWeek) && node.config.selectedDaysOfWeek.length > 0) {
          setSelectedDaysOfWeek(node.config.selectedDaysOfWeek);
        } else if (node.config?.selectedDayOfWeek) {
          setSelectedDaysOfWeek([node.config.selectedDayOfWeek]);
        } else {
          setSelectedDaysOfWeek(["Monday"]);
        }
        setDayOfMonth(node.config?.dayOfMonth || 1);
        if (Array.isArray(node.config?.selectedMonths) && node.config.selectedMonths.length > 0) {
          setSelectedMonths(node.config.selectedMonths);
        } else {
          setSelectedMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        }
        setRegularInterval(node.config?.regularInterval || "30m");
      } else if (node.type === "time") {
        setTime(node.config?.time || "09:00");
        setTimezone(node.config?.timezone || "Asia/Kolkata");
        setRecurrence(node.config?.recurrence || "daily");
      } else if (node.type === "action") {
        setActionType(node.config?.actionType || "send_notification");
        setMessage(node.config?.message || node.text || "");
        setPriority(node.config?.priority || "medium");
      }
    }
  }, [node?.id, node?.updatedAt]);

  // Calendar calculations
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleSelectDay = (day) => {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const formatted = `${year}-${mm}-${dd}`;
    setSelectedDate(formatted);
  };

  const handleSave = () => {
    if (isDate) {
      const activePatternObj =
        RECURRENCE_OPTIONS.find((o) => o.value === recurrencePattern) ||
        RECURRENCE_OPTIONS[1];

      onSave(
        node.id,
        {
          dateType,
          dateMode: dateType,
          specificDate: selectedDate,
          recurrencePattern,
          recurringPattern: recurrencePattern,
          selectedDaysOfWeek,
          selectedDayOfWeek: selectedDaysOfWeek[0] || "Monday",
          dayOfMonth,
          selectedMonths,
          regularInterval,
          timezone,
        },
        dateType === "specific" ? `Date: ${selectedDate}` : activePatternObj.label
      );
    } else if (isTime) {
      onSave(node.id, {
        time,
        timezone,
        recurrence,
      }, `Time: ${time}`);
    } else if (isAction) {
      onSave(node.id, {
        actionType,
        message,
        priority,
      }, message || "Action Node");
    }
  };

  // Header configs
  const getHeaderInfo = () => {
    if (isDate) {
      return {
        title: "Date Node",
        subtitle: "Select calendar date or schedule for automation",
        icon: <CalendarIcon size={20} color="#2563EB" />,
        themeColor: "#2563EB",
        badgeBg: "#EFF6FF",
      };
    }
    if (isTime) {
      return {
        title: "Time Node",
        subtitle: "Configure daily execution time and timezone",
        icon: <Clock size={20} color="#D97706" />,
        themeColor: "#D97706",
        badgeBg: "#FFFBEB",
      };
    }
    return {
      title: "Action Node",
      subtitle: "Configure action instructions to execute",
      icon: <Play size={20} fill="#059669" color="#059669" />,
      themeColor: "#059669",
      badgeBg: "#ECFDF5",
    };
  };

  const header = getHeaderInfo();

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
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          backgroundColor: "#FFFFFF",
          borderRadius: 20,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid #E2E8F0",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: "scaleIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: header.badgeBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1px solid ${header.themeColor}33`,
              }}
            >
              {header.icon}
            </div>
            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#0F172A",
                  lineHeight: 1.2,
                }}
              >
                {header.title}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#64748B",
                  marginTop: 2,
                }}
              >
                {header.subtitle}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "none",
              backgroundColor: "transparent",
              color: "#64748B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#F1F5F9";
              e.currentTarget.style.color = "#0F172A";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "#64748B";
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* ===================== DATE NODE CALENDAR ===================== */}
          {isDate && (
            <div>
              {/* Type Switcher */}
              <div
                style={{
                  display: "flex",
                  backgroundColor: "#F1F5F9",
                  borderRadius: 10,
                  padding: 3,
                  marginBottom: 16,
                }}
              >
                <button
                  type="button"
                  onClick={() => setDateType("specific")}
                  style={{
                    flex: 1,
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: dateType === "specific" ? "#FFFFFF" : "transparent",
                    color: dateType === "specific" ? "#0F172A" : "#64748B",
                    fontWeight: dateType === "specific" ? 600 : 500,
                    fontSize: 12.5,
                    cursor: "pointer",
                    boxShadow: dateType === "specific" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  Specific Date
                </button>
                <button
                  type="button"
                  onClick={() => setDateType("recurring")}
                  style={{
                    flex: 1,
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: dateType === "recurring" ? "#FFFFFF" : "transparent",
                    color: dateType === "recurring" ? "#0F172A" : "#64748B",
                    fontWeight: dateType === "recurring" ? 600 : 500,
                    fontSize: 12.5,
                    cursor: "pointer",
                    boxShadow: dateType === "recurring" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  Recurring Schedule
                </button>
              </div>

              {dateType === "specific" ? (
                <div>
                  {/* Interactive Monthly Calendar */}
                  <div
                    style={{
                      border: "1px solid #E2E8F0",
                      borderRadius: 14,
                      padding: "14px",
                      backgroundColor: "#FAFAFC",
                    }}
                  >
                    {/* Month / Year Navigation */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 12,
                      }}
                    >
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: "1px solid #CBD5E1",
                          backgroundColor: "#FFFFFF",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: "#334155",
                        }}
                      >
                        <ChevronLeft size={16} />
                      </button>

                      <span style={{ fontSize: 13.5, fontWeight: 700, color: "#0F172A" }}>
                        {MONTH_NAMES[month]} {year}
                      </span>

                      <button
                        type="button"
                        onClick={handleNextMonth}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: "1px solid #CBD5E1",
                          backgroundColor: "#FFFFFF",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: "#334155",
                        }}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    {/* Weekday headers */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(7, 1fr)",
                        textAlign: "center",
                        marginBottom: 6,
                      }}
                    >
                      {WEEK_DAYS.map((wd) => (
                        <div
                          key={wd}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#94A3B8",
                            padding: "4px 0",
                          }}
                        >
                          {wd}
                        </div>
                      ))}
                    </div>

                    {/* Days grid */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(7, 1fr)",
                        gap: 3,
                      }}
                    >
                      {/* Empty cells before 1st of month */}
                      {Array.from({ length: firstDayIndex }).map((_, i) => (
                        <div key={`empty-${i}`} />
                      ))}

                      {/* Day cells */}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const dayNum = i + 1;
                        const mm = String(month + 1).padStart(2, "0");
                        const dd = String(dayNum).padStart(2, "0");
                        const thisDateStr = `${year}-${mm}-${dd}`;
                        const isChosen = thisDateStr === selectedDate;

                        return (
                          <button
                            key={dayNum}
                            type="button"
                            onClick={() => handleSelectDay(dayNum)}
                            style={{
                              aspectRatio: "1",
                              borderRadius: 8,
                              border: isChosen ? "none" : "1px solid transparent",
                              backgroundColor: isChosen ? "#2563EB" : "transparent",
                              color: isChosen ? "#FFFFFF" : "#0F172A",
                              fontSize: 12.5,
                              fontWeight: isChosen ? 700 : 500,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              transition: "all 0.12s ease",
                            }}
                            onMouseEnter={(e) => {
                              if (!isChosen) {
                                e.currentTarget.style.backgroundColor = "#EFF6FF";
                                e.currentTarget.style.color = "#2563EB";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isChosen) {
                                e.currentTarget.style.backgroundColor = "transparent";
                                e.currentTarget.style.color = "#0F172A";
                              }
                            }}
                          >
                            {dayNum}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selected Date Summary */}
                  <div
                    style={{
                      marginTop: 12,
                      padding: "10px 14px",
                      borderRadius: 10,
                      backgroundColor: "#EFF6FF",
                      border: "1px solid #BFDBFE",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#1E40AF" }}>Selected Date:</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1E3A8A" }}>
                      {selectedDate}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#334155",
                        marginBottom: 6,
                      }}
                    >
                      Recurrence Pattern
                    </label>
                    <select
                      value={recurrencePattern}
                      onChange={(e) => setRecurrencePattern(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: 8,
                        border: "1px solid #CBD5E1",
                        fontSize: 13,
                        fontWeight: 500,
                        color: "#0F172A",
                        backgroundColor: "#FFFFFF",
                        boxSizing: "border-box",
                      }}
                    >
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Additional parameters according to selected pattern */}
                  {recurrencePattern === "every_week" && (
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 6,
                        }}
                      >
                        <label
                          style={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: "#475569",
                          }}
                        >
                          Select Day(s) of Week ({selectedDaysOfWeek.length === 7 ? "All Days" : `${selectedDaysOfWeek.length} Selected`})
                        </label>
                        <button
                          type="button"
                          onClick={selectAllDays}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#2563EB",
                            fontSize: 11.5,
                            fontWeight: 600,
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          {selectedDaysOfWeek.length === 7 ? "Select Mon Only" : "Select All Days"}
                        </button>
                      </div>

                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {[
                          "Monday",
                          "Tuesday",
                          "Wednesday",
                          "Thursday",
                          "Friday",
                          "Saturday",
                          "Sunday",
                        ].map((d) => {
                          const isSel = selectedDaysOfWeek.includes(d);
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => toggleDayOfWeek(d)}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 7,
                                border: isSel
                                  ? "1.5px solid #2563EB"
                                  : "1px solid #CBD5E1",
                                backgroundColor: isSel ? "#EFF6FF" : "#FFFFFF",
                                color: isSel ? "#1D4ED8" : "#334155",
                                fontSize: 11.5,
                                fontWeight: isSel ? 700 : 500,
                                cursor: "pointer",
                                transition: "all 0.12s ease",
                              }}
                            >
                              {d.slice(0, 3)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {recurrencePattern === "every_month" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {/* 1. Month Multi-Selection (Select 1, multiple, or all months) */}
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 6,
                          }}
                        >
                          <label
                            style={{
                              fontSize: 11.5,
                              fontWeight: 600,
                              color: "#475569",
                            }}
                          >
                            Select Month(s) ({selectedMonths.length === 12 ? "All Months" : `${selectedMonths.length} Selected`})
                          </label>
                          <button
                            type="button"
                            onClick={selectAllMonths}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#2563EB",
                              fontSize: 11.5,
                              fontWeight: 600,
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            {selectedMonths.length === 12 ? "Select Current Only" : "Select All Months"}
                          </button>
                        </div>

                        {/* 12 Months Grid */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, 1fr)",
                            gap: 5,
                          }}
                        >
                          {MONTH_LIST.map((m) => {
                            const isChosen = selectedMonths.includes(m.id);
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => toggleMonth(m.id)}
                                style={{
                                  padding: "6px 4px",
                                  borderRadius: 7,
                                  border: isChosen
                                    ? "1.5px solid #2563EB"
                                    : "1px solid #CBD5E1",
                                  backgroundColor: isChosen ? "#EFF6FF" : "#FFFFFF",
                                  color: isChosen ? "#1D4ED8" : "#334155",
                                  fontSize: 11.5,
                                  fontWeight: isChosen ? 700 : 500,
                                  cursor: "pointer",
                                  textAlign: "center",
                                  transition: "all 0.12s ease",
                                }}
                              >
                                {m.short}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 2. Date of Month Selection */}
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: "#475569",
                            marginBottom: 6,
                          }}
                        >
                          Select Date of Month (1 - 31)
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="number"
                            min={1}
                            max={31}
                            value={dayOfMonth}
                            onChange={(e) =>
                              setDayOfMonth(
                                Math.min(31, Math.max(1, Number(e.target.value) || 1))
                              )
                            }
                            style={{
                              width: 80,
                              padding: "7px 10px",
                              borderRadius: 6,
                              border: "1px solid #CBD5E1",
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#0F172A",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {recurrencePattern === "regular_interval" && (
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: "#475569",
                          marginBottom: 6,
                        }}
                      >
                        Select Interval
                      </label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {[
                          { label: "5 Min", val: "5m" },
                          { label: "15 Min", val: "15m" },
                          { label: "30 Min", val: "30m" },
                          { label: "1 Hour", val: "1h" },
                          { label: "2 Hours", val: "2h" },
                          { label: "6 Hours", val: "6h" },
                        ].map((inv) => {
                          const isSel = regularInterval === inv.val;
                          return (
                            <button
                              key={inv.val}
                              type="button"
                              onClick={() => setRegularInterval(inv.val)}
                              style={{
                                padding: "5px 10px",
                                borderRadius: 6,
                                border: isSel
                                  ? "1.5px solid #2563EB"
                                  : "1px solid #CBD5E1",
                                backgroundColor: isSel ? "#EFF6FF" : "#FFFFFF",
                                color: isSel ? "#1D4ED8" : "#334155",
                                fontSize: 11.5,
                                fontWeight: isSel ? 600 : 500,
                                cursor: "pointer",
                              }}
                            >
                              {inv.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ===================== TIME NODE PICKER ===================== */}
          {isTime && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                  Execution Time (HH:MM)
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #CBD5E1",
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#0F172A",
                    boxSizing: "border-box",
                    backgroundColor: "#FAFBFD",
                  }}
                />
              </div>

              {/* Quick Preset Chips */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", marginBottom: 6 }}>
                  Quick Time Presets
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[
                    { label: "09:00 AM", val: "09:00" },
                    { label: "12:00 PM", val: "12:00" },
                    { label: "03:00 PM", val: "15:00" },
                    { label: "06:00 PM", val: "18:00" },
                    { label: "09:00 PM", val: "21:00" },
                  ].map((p) => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => setTime(p.val)}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        border: time === p.val ? "1px solid #D97706" : "1px solid #E2E8F0",
                        backgroundColor: time === p.val ? "#FFFBEB" : "#FFFFFF",
                        color: time === p.val ? "#B45309" : "#475569",
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timezone */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid #CBD5E1",
                    fontSize: 13,
                    color: "#0F172A",
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  backgroundColor: "#FFFBEB",
                  border: "1px solid #FDE68A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 12, color: "#92400E" }}>Scheduled Time:</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#78350F" }}>
                  {time} ({timezone.split("/")[1] || timezone})
                </span>
              </div>
            </div>
          )}

          {/* ===================== ACTION NODE CONFIG ===================== */}
          {isAction && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                  Action Type
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { id: "send_notification", label: "Notification", icon: <Bell size={14} /> },
                    { id: "ai_agent_task", label: "AI Agent Task", icon: <Sparkles size={14} /> },
                    { id: "create_reminder", label: "Task / Reminder", icon: <ListTodo size={14} /> },
                    { id: "generate_report", label: "Generate Report", icon: <BarChart3 size={14} /> },
                  ].map((act) => {
                    const isPicked = actionType === act.id;
                    return (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => setActionType(act.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: isPicked ? "1.5px solid #059669" : "1px solid #E2E8F0",
                          backgroundColor: isPicked ? "#ECFDF5" : "#FFFFFF",
                          color: isPicked ? "#065F46" : "#334155",
                          fontSize: 12,
                          fontWeight: isPicked ? 600 : 500,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {act.icon}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {act.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                  Action Message / Instructions
                </label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="e.g. Audit daily performance and notify if CPA exceeds target"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid #CBD5E1",
                    fontSize: 13,
                    color: "#0F172A",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    resize: "none",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                  Priority
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  {["low", "medium", "high", "urgent"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      style={{
                        flex: 1,
                        padding: "5px 8px",
                        borderRadius: 6,
                        border: priority === p ? "1px solid #059669" : "1px solid #E2E8F0",
                        backgroundColor: priority === p ? "#ECFDF5" : "#FFFFFF",
                        color: priority === p ? "#047857" : "#475569",
                        fontSize: 11.5,
                        fontWeight: 600,
                        textTransform: "capitalize",
                        cursor: "pointer",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderTop: "1px solid #F1F5F9",
            backgroundColor: "#FAFBFD",
          }}
        >
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(node.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                backgroundColor: "#FEE2E2",
                color: "#DC2626",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Trash2 size={14} />
              Delete
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #CBD5E1",
                backgroundColor: "#FFFFFF",
                color: "#475569",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 18px",
                borderRadius: 8,
                border: "none",
                backgroundColor: header.themeColor,
                color: "#FFFFFF",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: isSaving ? "not-allowed" : "pointer",
                boxShadow: `0 2px 8px ${header.themeColor}33`,
              }}
            >
              <Save size={14} />
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
