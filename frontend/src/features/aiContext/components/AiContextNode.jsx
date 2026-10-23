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
  isConnected = false,
  isDragging = false,
  isSelected,
  onSelect,
  onOpenPicker,
  onOpenDrawer,
  onMouseDownDrag,
  onDelete,
}) => {
  const nodeIsConnected =
    isConnected ||
    Boolean(node.isRoot || node.previousNodeId || node.previousNodeLabel);

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
      className={`ai-context-node-card ${isSelected ? "is-selected-card" : ""} ${isDragging ? "is-dragging" : ""}`}
      style={{
        position: "absolute",
        left: node.position?.x || 100,
        top: node.position?.y || 200,
        width: 260,
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        border: isSelected ? "2px solid #0081FB" : "1px solid #E2E8F0",
        boxShadow: isDragging
          ? "0 16px 36px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)"
          : isSelected
          ? "0 0 0 3px rgba(0, 129, 251, 0.16), 0 8px 24px rgba(0, 129, 251, 0.10)"
          : "0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
        cursor: isDragging ? "grabbing" : "pointer",
        userSelect: "none",
        zIndex: isDragging ? 100 : isSelected ? 50 : 10,
        transition: isDragging
          ? "none"
          : "border 0.15s ease, box-shadow 0.15s ease",
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
      {/* Top Header Row with Minimal Badge, Actions */}
      <div
        onMouseDown={(e) => onMouseDownDrag(e, node.id)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px 4px 14px",
          backgroundColor: "#FFFFFF",
          borderTopLeftRadius: 15,
          borderTopRightRadius: 15,
          cursor: "grab",
        }}
        title="Double click to configure • Drag to reposition"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {node.isRoot ? (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: "99px",
                backgroundColor: "#F8FAFC",
                color: "#0F172A",
                border: "1px solid #E2E8F0",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: "#16A34A",
                  display: "inline-block",
                }}
              />
              Start Context
            </span>
          ) : (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.03em",
                textTransform: "uppercase",
                padding: "2px 7px",
                borderRadius: 6,
                backgroundColor: "#F8FAFC",
                color: "#475569",
                border: "1px solid #E2E8F0",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {nodeIsConnected && (
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    backgroundColor: "#16A34A",
                    display: "inline-block",
                  }}
                />
              )}
              {nodeInfo.badge}
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
              padding: "2px 4px",
              color: "#94A3B8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#EF4444";
              e.currentTarget.style.backgroundColor = "#FEF2F2";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#94A3B8";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            title="Delete node"
          >
            <Trash2 size={12} />
          </button>
          <Move size={12} color="#94A3B8" />
        </div>
      </div>

      {/* Main Node Body */}
      <div
        style={{
          padding: "6px 14px 14px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Sleek Platform-Style Icon Box */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: "#FFFFFF",
            border: "1px solid #E2E8F0",
            color: "#0F172A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
          }}
        >
          <Icon size={20} strokeWidth={1.9} />
        </div>

        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <strong
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 600,
              color: "#0F172A",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              letterSpacing: "-0.01em",
            }}
          >
            {node.isRoot
              ? (node.data?.registeredName || node.label || "Customer Account")
              : (node.type === "ad_channel" && node.data?.accountName
                  ? `${node.data?.channelName || "Ad Channel"}: ${node.data.accountName}`
                  : (node.label || nodeInfo.title))}
          </strong>

          {/* Subtitle / Funnel Badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
            {node.type === "ad_channel" && node.data?.funnelEvent ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#15803D",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={`Funnel Event: ${node.data?.funnelEvent}${node.data?.funnelDescription ? ` (${node.data.funnelDescription})` : ""}`}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    backgroundColor: "#16A34A",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                {node.data?.funnelEvent}
              </span>
            ) : (
              <span
                style={{
                  display: "block",
                  fontSize: "12px",
                  color: "#64748B",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontWeight: 400,
                }}
              >
                {node.isRoot
                  ? "Registered Flow Root"
                  : (node.type === "data_warehouse" && node.data?.sheets?.length > 0
                      ? (node.data.sheets.length > 1
                          ? `📊 ${node.data.sheets.length} Sheets Connected`
                          : `📊 ${node.data.sheets[0].workbookName || "1 Sheet Connected"}`)
                      : (node.type === "product" && node.data?.products?.length > 0
                          ? `📦 ${node.data.products.length} Products Catalog`
                          : (node.type === "marketing_brief" && (node.data?.metricsList?.length > 0 || node.data?.formattedPeriod || node.data?.startDate)
                              ? (node.data?.metricsList?.length > 1
                                  ? `📅 ${node.data.metricsList.length} Date Ranges Configured`
                                  : (node.data?.metricsList?.length === 1
                                      ? `📅 ${node.data.metricsList[0].formattedPeriod || (node.data.metricsList[0].startDate ? `${node.data.metricsList[0].startDate} to ${node.data.metricsList[0].endDate}` : "")}${node.data.metricsList[0].metrics ? ` • ${node.data.metricsList[0].metrics}` : ""}`
                                      : `📅 ${node.data?.formattedPeriod || (node.data?.startDate ? `${node.data.startDate} to ${node.data?.endDate || ""}` : "")}${node.data?.metrics ? ` • ${node.data.metrics}` : ""}`))
                              : (node.subtitle || node.data?.description || nodeInfo.description))))}
              </span>
            )}
          </div>
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
            bottom: -12,
            left: "50%",
            transform: "translateX(-50%)",
            width: 24,
            height: 24,
            borderRadius: "50%",
            backgroundColor: isSelected ? "#0081FB" : "#0F172A",
            color: "#FFFFFF",
            border: "2px solid #FFFFFF",
            boxShadow: isSelected
              ? "0 2px 8px rgba(0, 129, 251, 0.4)"
              : "0 2px 8px rgba(0, 0, 0, 0.25)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
          }}
          title="Add next node to workflow tree"
        >
          <Plus size={13} strokeWidth={2.5} />
        </button>
      )}

      {/* Top Center Input Handle Indicator for child nodes */}
      {!node.isRoot && (
        <div
          style={{
            position: "absolute",
            top: -5,
            left: "50%",
            transform: "translateX(-50%)",
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: isSelected ? "#0081FB" : "#CBD5E1",
            border: "2px solid #FFFFFF",
            boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
          }}
        />
      )}
    </div>
  );
};

export default AiContextNode;
