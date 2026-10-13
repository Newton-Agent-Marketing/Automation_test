import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, Check, Clock } from "lucide-react";

// Helpers for calculating preset dates
const toIso = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const PRESET_OPTIONS = [
  {
    id: "last_7d",
    label: "Last 7 Days",
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 7);
      return { startDate: toIso(start), endDate: toIso(end) };
    },
  },
  {
    id: "last_14d",
    label: "Last 14 Days",
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 14);
      return { startDate: toIso(start), endDate: toIso(end) };
    },
  },
  {
    id: "last_30d",
    label: "Last 30 Days",
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      return { startDate: toIso(start), endDate: toIso(end) };
    },
  },
  {
    id: "this_month",
    label: "This Month",
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      return { startDate: toIso(start), endDate: toIso(end) };
    },
  },
  {
    id: "last_month",
    label: "Last Month",
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: toIso(start), endDate: toIso(end) };
    },
  },
  {
    id: "today",
    label: "Today",
    getRange: () => {
      const now = new Date();
      return { startDate: toIso(now), endDate: toIso(now) };
    },
  },
  {
    id: "yesterday",
    label: "Yesterday",
    getRange: () => {
      const now = new Date();
      now.setDate(now.getDate() - 1);
      return { startDate: toIso(now), endDate: toIso(now) };
    },
  },
  {
    id: "custom",
    label: "Custom Range",
    getRange: null,
  },
];

const DateRangePicker = ({ startDate, endDate, onApply, activePreset = "last_7d" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempStart, setTempStart] = useState(startDate || toIso(new Date(Date.now() - 7 * 86400000)));
  const [tempEnd, setTempEnd] = useState(endDate || toIso(new Date()));
  const [selectedPreset, setSelectedPreset] = useState(activePreset);
  const [saveToDb, setSaveToDb] = useState(true);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (startDate) setTempStart(startDate);
    if (endDate) setTempEnd(endDate);
  }, [startDate, endDate]);

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectPreset = (preset) => {
    setSelectedPreset(preset.id);
    if (preset.getRange) {
      const range = preset.getRange();
      setTempStart(range.startDate);
      setTempEnd(range.endDate);
      // Auto apply preset
      onApply({
        startDate: range.startDate,
        endDate: range.endDate,
        preset: preset.id,
        saveToDb,
      });
      setIsOpen(false);
    }
  };

  const handleApplyCustom = (e) => {
    e.preventDefault();
    if (!tempStart || !tempEnd) return;
    if (new Date(tempStart) > new Date(tempEnd)) {
      alert("Start date cannot be after end date");
      return;
    }
    onApply({
      startDate: tempStart,
      endDate: tempEnd,
      preset: selectedPreset,
      saveToDb,
    });
    setIsOpen(false);
  };

  const displayString = `${tempStart || startDate || "Start"} - ${tempEnd || endDate || "End"}`;

  return (
    <div className="date-picker-wrapper" ref={popoverRef}>
      <span className="filter-label">Date Range</span>
      
      <button
        type="button"
        className={`date-picker-trigger ${isOpen ? "active" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <Calendar size={14} className="date-trigger-icon" />
        <span className="date-display-text">{displayString}</span>
        <ChevronDown size={14} className={`date-chevron ${isOpen ? "rotate" : ""}`} />
      </button>

      {isOpen && (
        <div className="date-picker-popover">
          <div className="date-picker-grid">
            {/* Presets Sidebar */}
            <div className="date-presets-column">
              <div className="presets-title">
                <Clock size={12} />
                <span>Quick Presets</span>
              </div>
              <div className="presets-list">
                {PRESET_OPTIONS.map((preset) => {
                  const isActive = selectedPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`preset-btn ${isActive ? "active" : ""}`}
                      onClick={() => handleSelectPreset(preset)}
                    >
                      <span>{preset.label}</span>
                      {isActive && <Check size={12} className="preset-check" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Range Inputs & Confirmation */}
            <div className="date-custom-column">
              <h4 className="custom-title">Custom Date Range</h4>
              <form onSubmit={handleApplyCustom} className="custom-form">
                <div className="custom-inputs-row">
                  <div className="date-input-field">
                    <label>From Date</label>
                    <input
                      type="date"
                      value={tempStart}
                      max={tempEnd || undefined}
                      onChange={(e) => {
                        setTempStart(e.target.value);
                        setSelectedPreset("custom");
                      }}
                      className="picker-input"
                      required
                    />
                  </div>
                  <div className="date-input-field">
                    <label>To Date</label>
                    <input
                      type="date"
                      value={tempEnd}
                      min={tempStart || undefined}
                      onChange={(e) => {
                        setTempEnd(e.target.value);
                        setSelectedPreset("custom");
                      }}
                      className="picker-input"
                      required
                    />
                  </div>
                </div>

                <div className="date-save-preference">
                  <label className="save-db-toggle">
                    <input
                      type="checkbox"
                      checked={saveToDb}
                      onChange={(e) => setSaveToDb(e.target.checked)}
                    />
                    <span>Save selection to account in Database</span>
                  </label>
                </div>

                <div className="picker-footer-actions">
                  <button
                    type="button"
                    className="picker-btn-cancel"
                    onClick={() => setIsOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="picker-btn-apply">
                    Apply Filter
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
