import {
  Building2,
  Megaphone,
  FileText,
  Package,
  Database,
  User,
  Plus,
  Move,
  Trash2,
} from "lucide-react";
import { NODE_TYPE_INFO, ALLOWED_CONNECTIONS } from "../aiContext.slice";

const ICONS = {
  user_input: User,
  business_unit: Building2,
  ad_channel: Megaphone,
  marketing_brief: FileText,
  product: Package,
  data_warehouse: Database,
};

export const AiContextNode = ({
  node,
  isSelected,
  onSelect,
  onOpenPicker,
  onOpenDrawer,
  onMouseDownDrag,
  onDelete,
}) => {
  const nodeInfo = NODE_TYPE_INFO[node.type] || {
    title: node.label || "Node",
    badge: "CONTEXT",
    color: "#475569",
    bg: "#F8FAFC",
    border: "#CBD5E1",
  };

  const Icon = ICONS[node.type] || User;
  const canAddNext = (ALLOWED_CONNECTIONS[node.type] || []).length > 0;

  return (
    <div
      className={`ai-context-node-card ${isSelected ? "is-selected-green" : ""}`}
      style={{
        position: "absolute",
        left: node.position?.x || 100,
        top: node.position?.y || 200,
        width: 250,
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        border: isSelected ? "2.5px solid #16A34A" : "1.5px solid #E2E8F0",
        boxShadow: isSelected
          ? "0 0 0 4px rgba(22, 163, 74, 0.18), 0 10px 24px rgba(15, 23, 42, 0.12)"
          : "0 4px 14px rgba(15, 23, 42, 0.06)",
        cursor: "pointer",
        userSelect: "none",
        zIndex: isSelected ? 50 : 10,
        transition: "border 0.18s ease, box-shadow 0.18s ease",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
        if (!node.isRoot) {
          onOpenDrawer(node.id);
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!node.isRoot) {
          onOpenDrawer(node.id);
        }
      }}
    >
      {/* Top Header Row with Badge, Delete Button & Drag Handle */}
      <div
        onMouseDown={(e) => onMouseDownDrag(e, node.id)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          borderBottom: "1px solid #F1F5F9",
          backgroundColor: "#FAFBFD",
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          cursor: "grab",
        }}
        title="Double click to configure • Drag to reposition"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: node.isRoot ? "#059669" : nodeInfo.color,
            }}
          >
            {node.isRoot ? "START CONTEXT" : nodeInfo.badge}
          </span>

          {node.contextTag && !node.isRoot && (
            <span
              style={{
                fontSize: "9px",
                fontWeight: 600,
                color: "#64748B",
                backgroundColor: "#F1F5F9",
                padding: "1px 5px",
                borderRadius: 4,
                maxWidth: 90,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={`Context Tag: ${node.contextTag}`}
            >
              #{node.contextTag}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px",
              color: "#94A3B8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#EF4444")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
            title="Delete node from canvas & database"
          >
            <Trash2 size={12} />
          </button>
          <Move size={12} color="#94A3B8" />
        </div>
      </div>

      {/* Main Node Body */}
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: node.isRoot ? "rgba(5, 150, 105, 0.12)" : `${nodeInfo.color}15`,
            color: node.isRoot ? "#059669" : nodeInfo.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={17} />
        </div>

        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <strong
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 700,
              color: "#0F172A",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {node.isRoot
              ? (node.data?.registeredName || node.label || "Customer Account")
              : (node.label || nodeInfo.title)}
          </strong>

          {/* Lineage Info: Connected from previous node */}
          {node.previousNodeLabel ? (
            <span
              style={{
                display: "block",
                fontSize: "10px",
                fontWeight: 600,
                color: "#2563EB",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                marginTop: 1,
              }}
              title={`Connected from: ${node.previousNodeLabel}`}
            >
              ← from {node.previousNodeLabel}
            </span>
          ) : (
            <span
              style={{
                display: "block",
                fontSize: "11px",
                color: node.isRoot ? "#059669" : "#64748B",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                marginTop: 1,
                fontWeight: node.isRoot ? 600 : 400,
              }}
            >
              {node.isRoot
                ? "Registered Flow Root"
                : (node.type === "product" && node.data?.products?.length > 0
                    ? `📦 ${node.data.products.length} Products Catalog`
                    : (node.subtitle || node.data?.description || nodeInfo.description))}
            </span>
          )}
        </div>
      </div>

      {/* Bottom Center Connector Handle with "+" Add Button */}
      {canAddNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenPicker(node.id, {
              x: (node.position?.x || 100) - 35,
              y: (node.position?.y || 200) + 95,
            });
          }}
          className="node-add-handle-btn"
          style={{
            position: "absolute",
            bottom: -13,
            left: "50%",
            transform: "translateX(-50%)",
            width: 25,
            height: 25,
            borderRadius: "50%",
            backgroundColor: isSelected ? "#16A34A" : "#2563EB",
            color: "#FFFFFF",
            border: "2px solid #FFFFFF",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.15)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
          }}
          title="Add next node to workflow tree"
        >
          <Plus size={14} strokeWidth={2.5} />
        </button>
      )}

      {/* Top Center Input Handle Indicator for child nodes */}
      {!node.isRoot && (
        <div
          style={{
            position: "absolute",
            top: -6,
            left: "50%",
            transform: "translateX(-50%)",
            width: 11,
            height: 11,
            borderRadius: "50%",
            backgroundColor: isSelected ? "#16A34A" : "#94A3B8",
            border: "2px solid #FFFFFF",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        />
      )}
    </div>
  );
};

export default AiContextNode;
