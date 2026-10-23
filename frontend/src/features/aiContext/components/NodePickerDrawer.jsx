import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Megaphone,
  FileText,
  Package,
  Database,
  Search,
  X,
  Sparkles,
} from "lucide-react";
import { ALLOWED_NEW_NODES, ALLOWED_CONNECTIONS } from "../aiContext.slice";

const NODE_ICONS = {
  building: Building2,
  megaphone: Megaphone,
  "file-text": FileText,
  package: Package,
  database: Database,
};

export const NodePickerDrawer = ({
  anchorNode,
  position,
  onSelectNode,
  onClose,
}) => {
  const [search, setSearch] = useState("");

  const allowedTypes = useMemo(() => {
    return ALLOWED_CONNECTIONS[anchorNode?.type] || [];
  }, [anchorNode]);

  const filteredNodes = useMemo(() => {
    let list = ALLOWED_NEW_NODES;
    if (allowedTypes.length > 0) {
      list = ALLOWED_NEW_NODES.filter((n) => allowedTypes.includes(n.type));
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.desc.toLowerCase().includes(q) ||
        n.badge.toLowerCase().includes(q)
    );
  }, [search, allowedTypes]);

  if (!anchorNode) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: -4 }}
        transition={{ duration: 0.16 }}
        className="node-picker-popup"
        style={{
          position: "absolute",
          left: (position?.x || 200) + 30,
          top: (position?.y || 200) - 20,
          zIndex: 1000,
          width: 330,
          backgroundColor: "#FFFFFF",
          borderRadius: 18,
          boxShadow: "0 20px 48px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.04)",
          border: "1px solid #E2E8F0",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #F1F5F9",
            padding: "13px 16px",
            backgroundColor: "#FFFFFF",
          }}
        >
          <span
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: "#0F172A",
              letterSpacing: "-0.01em",
            }}
          >
            Add Context Node
          </span>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              cursor: "pointer",
              color: "#64748B",
              width: 26,
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 7,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#0F172A";
              e.currentTarget.style.backgroundColor = "#F8FAFC";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#64748B";
              e.currentTarget.style.backgroundColor = "#FFFFFF";
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Search Input */}
        <div style={{ padding: "12px 14px 6px 14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              backgroundColor: "#F8FAFC",
              border: "1px solid #E2E8F0",
              borderRadius: 10,
              padding: "7px 11px",
            }}
          >
            <Search size={14} color="#94A3B8" />
            <input
              type="text"
              placeholder="Search context nodes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              style={{
                border: "none",
                background: "transparent",
                fontSize: "12.5px",
                width: "100%",
                outline: "none",
                color: "#0F172A",
              }}
            />
          </div>
        </div>

        {/* Anchor Node Hint */}
        <div
          style={{
            padding: "4px 16px 8px 16px",
            fontSize: "11px",
            color: "#64748B",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Sparkles size={11} color="#0F172A" />
          <span>Connecting from <strong style={{ color: "#0F172A" }}>{anchorNode.label}</strong></span>
        </div>

        {/* Nodes List */}
        <div style={{ maxHeight: 290, overflowY: "auto", padding: "4px 8px 12px 8px" }}>
          {filteredNodes.map((item) => {
            const Icon = NODE_ICONS[item.icon] || Sparkles;
            return (
              <button
                key={item.type}
                type="button"
                onClick={() => onSelectNode(anchorNode.id, item.type)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "9px 11px",
                  borderRadius: 10,
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #E2E8F0",
                    color: "#0F172A",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
                  }}
                >
                  <Icon size={18} strokeWidth={1.9} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <strong style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A" }}>{item.title}</strong>
                    <span
                      style={{
                        fontSize: "9.5px",
                        fontWeight: 600,
                        padding: "1px 6px",
                        borderRadius: 4,
                        backgroundColor: "#F1F5F9",
                        color: "#475569",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: "2px 0 0 0",
                      fontSize: "11.5px",
                      color: "#64748B",
                      lineHeight: 1.3,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.desc}
                  </p>
                </div>
              </button>
            );
          })}

          {filteredNodes.length === 0 && (
            <div style={{ padding: "16px", textAlign: "center", color: "#94A3B8", fontSize: "12px" }}>
              No matching context nodes found.
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NodePickerDrawer;
