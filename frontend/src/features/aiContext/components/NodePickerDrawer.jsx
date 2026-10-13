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
          width: 320,
          backgroundColor: "#FFFFFF",
          borderRadius: 12,
          boxShadow: "0 14px 40px rgba(15, 23, 42, 0.16), 0 2px 8px rgba(15, 23, 42, 0.08)",
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
            padding: "10px 14px",
            backgroundColor: "#FAFBFD",
          }}
        >
          <span
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "#2563EB",
              letterSpacing: "0.01em",
            }}
          >
            Nodes
          </span>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#94A3B8",
              padding: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Search Input */}
        <div style={{ padding: "10px 12px 6px 12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              backgroundColor: "#F8FAFC",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              padding: "6px 10px",
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
                fontSize: "12px",
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
            padding: "4px 14px 6px 14px",
            fontSize: "11px",
            color: "#64748B",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Sparkles size={11} color="#6366F1" />
          <span>Connecting from <strong>{anchorNode.label}</strong></span>
        </div>

        {/* Nodes List */}
        <div style={{ maxHeight: 280, overflowY: "auto", padding: "4px 8px 10px 8px" }}>
          {filteredNodes.map((item) => {
            const Icon = NODE_ICONS[item.icon] || Sparkles;
            return (
              <button
                key={item.type}
                type="button"
                onClick={() => onSelectNode(anchorNode.id, item.type)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    backgroundColor: `${item.color}15`,
                    color: item.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <Icon size={16} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <strong style={{ fontSize: "12.5px", color: "#0F172A" }}>{item.title}</strong>
                    <span
                      style={{
                        fontSize: "9.5px",
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 4,
                        backgroundColor: "#F1F5F9",
                        color: "#64748B",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: "2px 0 0 0",
                      fontSize: "11px",
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
