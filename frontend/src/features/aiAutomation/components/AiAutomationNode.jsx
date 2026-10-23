import React from "react";
import { Edit3, Trash2, Move, ArrowDownCircle, Circle } from "lucide-react";

export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 100;

export const AiAutomationNode = ({
  node,
  isSelected,
  isDragging,
  isConnectSource,
  onSelect,
  onOpenEdit,
  onMouseDownDrag,
  onDelete,
  onStartConnect,
  onCompleteConnect,
}) => {
  const hasText = Boolean(node.text && node.text.trim().length > 0);

  return (
    <div
      className={`ai-automation-node-card ${isSelected ? "is-selected-card" : ""} ${isDragging ? "is-dragging" : ""}`}
      style={{
        position: "absolute",
        left: node.position?.x ?? 100,
        top: node.position?.y ?? 100,
        width: NODE_WIDTH,
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        border: isSelected
          ? "2px solid #0081FB"
          : isConnectSource
          ? "2px dashed #0081FB"
          : "1.5px solid #E2E8F0",
        boxShadow: isDragging
          ? "0 18px 36px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(15, 23, 42, 0.08)"
          : isSelected
          ? "0 0 0 3px rgba(0, 129, 251, 0.16), 0 8px 24px rgba(0, 129, 251, 0.12)"
          : "0 2px 8px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.02)",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        zIndex: isDragging ? 100 : isSelected ? 50 : 10,
        transition: isDragging
          ? "none"
          : "border-color 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseDown={(e) => onMouseDownDrag(e, node.id)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpenEdit(node.id);
      }}
      title="Drag anywhere to move • Double-click or click pencil to edit"
    >
      {/* Left Target Connector Port */}
      <div
        className="automation-target-handle"
        title="Target connection port (drop connection here)"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onCompleteConnect(node.id);
        }}
        onMouseUp={(e) => {
          e.stopPropagation();
          onCompleteConnect(node.id);
        }}
        style={{
          position: "absolute",
          left: -7,
          top: "50%",
          transform: "translateY(-50%)",
          width: 14,
          height: 14,
          borderRadius: "50%",
          backgroundColor: "#FFFFFF",
          border: "2.5px solid #64748B",
          cursor: "crosshair",
          zIndex: 20,
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "#0081FB";
          e.currentTarget.style.transform = "translateY(-50%) scale(1.35)";
          e.currentTarget.style.backgroundColor = "#EFF6FF";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "#64748B";
          e.currentTarget.style.transform = "translateY(-50%) scale(1)";
          e.currentTarget.style.backgroundColor = "#FFFFFF";
        }}
      />

      {/* Node Header Row: Drag Handle + Node ID + Edit & Delete actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          backgroundColor: isSelected ? "#F0F7FF" : "#F8FAFC",
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottom: "1px solid #F1F5F9",
          cursor: isDragging ? "grabbing" : "grab",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Move size={13} color="#94A3B8" />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: node.stepNumber ? "#0081FB" : "#64748B",
              fontFamily: "monospace",
              letterSpacing: "0.03em",
            }}
          >
            NODE #{node.sequenceLabel || (node.stepNumber ? `node${node.stepNumber}` : "node_")}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {/* Edit Button */}
          <button
            type="button"
            title="Edit node text"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpenEdit(node.id);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              borderRadius: 6,
              color: "#64748B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#E2E8F0";
              e.currentTarget.style.color = "#0081FB";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "#64748B";
            }}
          >
            <Edit3 size={14} />
          </button>

          {/* Delete Button */}
          <button
            type="button"
            title="Delete node"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              borderRadius: 6,
              color: "#94A3B8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#FEE2E2";
              e.currentTarget.style.color = "#EF4444";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "#94A3B8";
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Node Content Body */}
      <div
        style={{
          padding: "12px 14px",
          minHeight: 52,
          maxHeight: 120,
          overflowY: "auto",
          cursor: isDragging ? "grabbing" : "grab",
        }}
      >
        {hasText ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.45,
              color: "#1E293B",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
            }}
          >
            {node.text}
          </p>
        ) : (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontStyle: "italic",
              color: "#94A3B8",
            }}
          >
            Click to add node text...
          </p>
        )}
      </div>

      {/* Right Source Connector Port */}
      <div
        className="automation-source-handle"
        title="Drag or click to connect to another node"
        onMouseDown={(e) => {
          e.stopPropagation();
          onStartConnect(e, node.id);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onStartConnect(e, node.id);
        }}
        style={{
          position: "absolute",
          right: -7,
          top: "50%",
          transform: "translateY(-50%)",
          width: 14,
          height: 14,
          borderRadius: "50%",
          backgroundColor: isConnectSource ? "#0081FB" : "#FFFFFF",
          border: "2.5px solid #0081FB",
          cursor: "crosshair",
          zIndex: 20,
          transition: "all 0.15s ease",
          boxShadow: isConnectSource
            ? "0 0 0 4px rgba(0, 129, 251, 0.25)"
            : "none",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-50%) scale(1.35)";
          e.currentTarget.style.backgroundColor = "#EFF6FF";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(-50%) scale(1)";
          if (!isConnectSource) {
            e.currentTarget.style.backgroundColor = "#FFFFFF";
          }
        }}
      />
    </div>
  );
};

export default AiAutomationNode;
