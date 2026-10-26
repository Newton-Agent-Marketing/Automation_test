import React, { useState, useRef } from "react";
import {
  Pencil,
  Trash2,
  Calendar,
  Clock,
  Play,
  Pause,
  RotateCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Check,
} from "lucide-react";

export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 86;
export const CIRCULAR_NODE_SIZE = 58;

export const getNodeDimensions = (node) => {
  if (node && (node.type === "date" || node.type === "action" || node.type === "time")) {
    return { width: CIRCULAR_NODE_SIZE, height: CIRCULAR_NODE_SIZE };
  }
  return { width: NODE_WIDTH, height: NODE_HEIGHT };
};

export const AiAutomationNode = ({
  node,
  isSelected,
  isDragging,
  isConnectSource,
  isConnectTarget,
  isExecuting = false,
  isCompleted = false,
  allNodesBlue = false,
  nodeExecution = null,
  isWorkflowRunning = false,
  isWorkflowPaused = false,
  onTogglePauseResume,
  onRetryNode,
  onExecuteWorkflow,
  onSelect,
  onOpenEdit,
  onMouseDownDrag,
  onDelete,
  onStartConnect,
  onCompleteConnect,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });

  const isTrigger = node.type === "trigger";
  const isDate = node.type === "date";
  const isAction = node.type === "action";
  const isTime = node.type === "time";
  const isCircular = isDate || isAction || isTime;

  // Action node keeps running/loading indicator during the entire workflow execution
  // until all nodes have completed their tasks!
  const isActionExecuting = isAction && isWorkflowRunning && !isWorkflowPaused;

  const execStatus =
    nodeExecution?.status ||
    (isExecuting || isActionExecuting ? "running" : isCompleted ? "completed" : "pending");
  const isNodeRunning = execStatus === "running" || isActionExecuting;
  const isNodeCompleted =
    !isActionExecuting &&
    (execStatus === "completed" || (allNodesBlue && execStatus !== "failed"));
  const isNodeFailed = execStatus === "failed";
  const isNodePaused = isWorkflowPaused && (execStatus === "paused" || (isAction && isWorkflowRunning));

  // Accent colors per node type
  const getBranchAccent = () => {
    switch (node.type) {
      case "trigger":
        return "#8B5CF6";
      case "date":
        return "#2563EB";
      case "action":
        return "#059669";
      case "time":
        return "#D97706";
      default:
        return "#0081FB";
    }
  };

  const accentColor = getBranchAccent();

  // =========================================================================
  // CIRCULAR NODE DESIGN (For Date Node, Action Node, Time Node)
  // According to user requirement: Circle shape, ONLY logo inside
  // When Action Node is clicked -> Execute workflow tasks across nodes (no popup!)
  // =========================================================================
  if (isCircular) {
    const getCircularIcon = () => {
      if (isDate) {
        return <Calendar size={26} color="#2563EB" strokeWidth={2.2} />;
      }
      if (isTime) {
        return <Clock size={26} color="#D97706" strokeWidth={2.2} />;
      }
      if (isNodePaused) {
        return <Pause size={24} color="#D97706" fill="#D97706" />;
      }
      // Action node shows loading spinner as long as workflow is running until all tasks complete!
      if (isActionExecuting || isNodeRunning) {
        return <Loader2 size={24} color="#0081FB" className="animate-spin" />;
      }
      if (isNodeCompleted) {
        return <Check size={26} color="#059669" strokeWidth={3} />;
      }
      if (isNodeFailed) {
        return <AlertCircle size={24} color="#DC2626" strokeWidth={2.2} />;
      }
      return <Play size={24} fill="#059669" color="#059669" style={{ marginLeft: 2 }} />;
    };

    return (
      <div
        className={`ai-automation-node-card is-circular-node ${isSelected ? "is-selected-card" : ""} ${
          isDragging ? "is-dragging" : ""
        } ${isConnectTarget ? "is-connect-target" : ""} ${isNodeRunning ? "is-executing-node" : ""}`}
        style={{
          position: "absolute",
          left: node.position?.x ?? 100,
          top: node.position?.y ?? 100,
          width: CIRCULAR_NODE_SIZE,
          height: CIRCULAR_NODE_SIZE,
          backgroundColor: "#FFFFFF",
          borderRadius: "50%",
          border: allNodesBlue
            ? "3px solid #0081FB"
            : isNodeRunning
            ? "3px solid #0081FB"
            : isNodeCompleted
            ? "3px solid #10B981"
            : isNodeFailed
            ? "3px solid #EF4444"
            : isNodePaused
            ? "3px solid #F59E0B"
            : isConnectTarget
            ? "2.5px solid #8B5CF6"
            : isSelected
            ? `2.5px solid ${accentColor}`
            : isConnectSource
            ? `2.5px dashed ${accentColor}`
            : `2px solid ${accentColor}`,
          boxShadow: allNodesBlue
            ? "0 0 0 5px rgba(0, 129, 251, 0.4), 0 0 24px rgba(0, 129, 251, 0.4)"
            : isNodeRunning
            ? "0 0 0 5px rgba(0, 129, 251, 0.4), 0 0 24px rgba(0, 129, 251, 0.4)"
            : isNodeCompleted
            ? "0 0 0 4px rgba(16, 185, 129, 0.35), 0 0 20px rgba(16, 185, 129, 0.35)"
            : isNodeFailed
            ? "0 0 0 4px rgba(239, 68, 68, 0.35)"
            : isNodePaused
            ? "0 0 0 4px rgba(245, 158, 11, 0.35)"
            : isConnectTarget
            ? "0 0 0 4px rgba(139, 92, 246, 0.3), 0 8px 20px rgba(139, 92, 246, 0.2)"
            : isDragging
            ? "0 18px 32px rgba(15, 23, 42, 0.2)"
            : isSelected
            ? `0 0 0 3.5px ${accentColor}33, 0 8px 18px ${accentColor}26`
            : `0 4px 14px ${accentColor}1F, 0 1px 3px rgba(0, 0, 0, 0.04)`,
          cursor: isConnectTarget
            ? "crosshair"
            : isDragging
            ? "grabbing"
            : "grab",
          userSelect: "none",
          zIndex: isDragging ? 100 : isSelected ? 50 : 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          transition: isDragging
            ? "none"
            : "transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseDown={(e) => {
          if (isConnectTarget) {
            e.stopPropagation();
            onCompleteConnect(node.id);
            return;
          }
          dragStartPosRef.current = { x: e.clientX, y: e.clientY };
          onMouseDownDrag(e, node.id);
        }}
        onMouseUp={(e) => {
          if (isConnectTarget) {
            e.stopPropagation();
            onCompleteConnect(node.id);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (isConnectTarget) {
            onCompleteConnect(node.id);
            return;
          }

          // If user moved/dragged the node across the canvas, do not fire click action!
          const dist = Math.hypot(
            e.clientX - dragStartPosRef.current.x,
            e.clientY - dragStartPosRef.current.y
          );
          if (dist > 4) {
            return;
          }

          onSelect(node.id);

          // ACTION NODE: Run workflow tasks sequentially across nodes! DO NOT open popup!
          if (isAction) {
            if (isWorkflowRunning || isActionExecuting) {
              return;
            }
            if (onExecuteWorkflow) {
              onExecuteWorkflow(node.id);
            }
            return;
          }

          onOpenEdit(node.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (isAction) {
            return;
          }
          onOpenEdit(node.id);
        }}
        title={
          isAction
            ? "Drag to move • Click to run automation workflow"
            : isConnectTarget
            ? "Click or release to connect to this node"
            : `Click to configure ${node.type} node • Drag to reposition`
        }

      >
        {/* Left Connector Handle */}
        <div
          className="automation-target-handle"
          title="Left connector"
          onMouseDown={(e) => {
            e.stopPropagation();
            if (isConnectTarget) {
              onCompleteConnect(node.id);
              return;
            }
            onStartConnect(e, node.id, "left");
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (isConnectTarget) {
              onCompleteConnect(node.id);
            }
          }}
          onMouseUp={(e) => {
            e.stopPropagation();
            if (isConnectTarget) {
              onCompleteConnect(node.id);
            }
          }}
          style={{
            position: "absolute",
            left: -6,
            top: "50%",
            transform: "translateY(-50%)",
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: isConnectSource || isConnectTarget ? accentColor : "#FFFFFF",
            border: `2px solid ${isConnectSource || isConnectTarget ? accentColor : "#64748B"}`,
            cursor: "crosshair",
            zIndex: 20,
            boxShadow: isConnectSource || isConnectTarget ? `0 0 0 3px ${accentColor}33` : "none",
            transition: "all 0.15s ease",
          }}
        />

        {/* Center: ONLY THE LOGO ICON */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          {getCircularIcon()}
        </div>

        {/* Delete button badge on hover */}
        {isHovered && !isConnectTarget && (
          <button
            type="button"
            title="Delete node"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              width: 18,
              height: 18,
              borderRadius: "50%",
              backgroundColor: "#FEE2E2",
              border: "1px solid #FCA5A5",
              color: "#DC2626",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
              zIndex: 30,
              boxShadow: "0 2px 4px rgba(0,0,0,0.12)",
            }}
          >
            <Trash2 size={10} />
          </button>
        )}

        {/* Right Connector Handle */}
        <div
          className="automation-source-handle"
          title="Right connector"
          onMouseDown={(e) => {
            e.stopPropagation();
            if (isConnectTarget) {
              onCompleteConnect(node.id);
              return;
            }
            onStartConnect(e, node.id, "right");
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (isConnectTarget) {
              onCompleteConnect(node.id);
            }
          }}
          onMouseUp={(e) => {
            e.stopPropagation();
            if (isConnectTarget) {
              onCompleteConnect(node.id);
            }
          }}
          style={{
            position: "absolute",
            right: -6,
            top: "50%",
            transform: "translateY(-50%)",
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: isConnectSource || isConnectTarget ? accentColor : "#FFFFFF",
            border: `2px solid ${isConnectSource || isConnectTarget ? accentColor : "#64748B"}`,
            cursor: "crosshair",
            zIndex: 20,
            boxShadow: isConnectSource || isConnectTarget ? `0 0 0 3px ${accentColor}33` : "none",
            transition: "all 0.15s ease",
          }}
        />
      </div>
    );
  }

  // =========================================================================
  // NORMAL RECTANGULAR NODE DESIGN (With "N" emblem, 2-line text, Pencil, Delete)
  // =========================================================================
  const getTextLines = () => {
    if (node.text && node.text.trim().length > 0) {
      const parts = node.text.split("\n").filter(Boolean);
      if (parts.length >= 2) {
        return { line1: parts[0], line2: parts.slice(1).join(" ") };
      }
      return { line1: parts[0], line2: "" };
    }

    return {
      line1: node.label || "Normal Node",
      line2: "Click pencil to edit...",
    };
  };

  const { line1, line2 } = getTextLines();

  return (
    <div
      className={`ai-automation-node-card ${isSelected ? "is-selected-card" : ""} ${
        isDragging ? "is-dragging" : ""
      } ${isConnectTarget ? "is-connect-target" : ""} ${isExecuting ? "is-executing-node" : ""}`}
      style={{
        position: "absolute",
        left: node.position?.x ?? 100,
        top: node.position?.y ?? 100,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        backgroundColor: "#FFFFFF",
        borderRadius: 22,
        border: allNodesBlue
          ? "2.5px solid #0081FB"
          : isNodeRunning
          ? "2.5px solid #0081FB"
          : isNodeCompleted
          ? "2.5px solid #10B981"
          : isNodeFailed
          ? "2.5px solid #EF4444"
          : isNodePaused
          ? "2.5px solid #F59E0B"
          : isConnectTarget
          ? "2.5px solid #8B5CF6"
          : isSelected
          ? `2px solid ${accentColor}`
          : isConnectSource
          ? `2px dashed ${accentColor}`
          : "1.5px solid #E2E8F0",
        boxShadow: allNodesBlue
          ? "0 0 0 4.5px rgba(0, 129, 251, 0.4), 0 10px 28px rgba(0, 129, 251, 0.3)"
          : isNodeRunning
          ? "0 0 0 4.5px rgba(0, 129, 251, 0.35), 0 10px 28px rgba(0, 129, 251, 0.28)"
          : isNodeCompleted
          ? "0 0 0 3.5px rgba(16, 185, 129, 0.25), 0 6px 18px rgba(16, 185, 129, 0.15)"
          : isNodeFailed
          ? "0 0 0 4px rgba(239, 68, 68, 0.25), 0 6px 18px rgba(239, 68, 68, 0.18)"
          : isNodePaused
          ? "0 0 0 3.5px rgba(245, 158, 11, 0.25)"
          : isConnectTarget
          ? "0 0 0 4px rgba(139, 92, 246, 0.28), 0 8px 24px rgba(139, 92, 246, 0.16)"
          : isDragging
          ? "0 20px 38px rgba(15, 23, 42, 0.18), 0 6px 14px rgba(15, 23, 42, 0.08)"
          : isSelected
          ? `0 0 0 3px ${accentColor}26, 0 8px 20px ${accentColor}1A`
          : "0 2px 10px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(15, 23, 42, 0.03)",
        cursor: isConnectTarget
          ? "crosshair"
          : isDragging
          ? "grabbing"
          : "grab",
        userSelect: "none",
        zIndex: isDragging ? 100 : isSelected ? 50 : 10,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        transition: isDragging
          ? "none"
          : "border-color 0.15s ease, box-shadow 0.15s ease",
        boxSizing: "border-box",
      }}
      onMouseDown={(e) => {
        if (isConnectTarget) {
          e.stopPropagation();
          onCompleteConnect(node.id);
          return;
        }
        onMouseDownDrag(e, node.id);
      }}
      onMouseUp={(e) => {
        if (isConnectTarget) {
          e.stopPropagation();
          onCompleteConnect(node.id);
        }
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (isConnectTarget) {
          onCompleteConnect(node.id);
          return;
        }
        onSelect(node.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpenEdit(node.id);
      }}
      title={
        isConnectTarget
          ? "Click or release to connect to this node"
          : "Drag to move • Click pencil to write text • Click trash to delete"
      }
    >
      {/* Left Circular Connector Port */}
      <div
        className="automation-target-handle"
        title={isConnectTarget ? "Connect here" : "Left connector port"}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (isConnectTarget) {
            onCompleteConnect(node.id);
            return;
          }
          onStartConnect(e, node.id, "left");
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (isConnectTarget) {
            onCompleteConnect(node.id);
          }
        }}
        onMouseUp={(e) => {
          e.stopPropagation();
          if (isConnectTarget) {
            onCompleteConnect(node.id);
          }
        }}
        style={{
          position: "absolute",
          left: -7,
          top: "50%",
          transform: "translateY(-50%)",
          width: 14,
          height: 14,
          borderRadius: "50%",
          backgroundColor: isConnectSource || isConnectTarget ? accentColor : "#FFFFFF",
          border: `2.5px solid ${isConnectSource || isConnectTarget ? accentColor : "#64748B"}`,
          cursor: "crosshair",
          zIndex: 20,
          transition: "all 0.15s ease",
          boxShadow: isConnectSource || isConnectTarget
            ? `0 0 0 4px ${accentColor}33`
            : "none",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = accentColor;
          e.currentTarget.style.backgroundColor = accentColor;
          e.currentTarget.style.transform = "translateY(-50%) scale(1.35)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(-50%) scale(1)";
          if (!isConnectSource && !isConnectTarget) {
            e.currentTarget.style.borderColor = "#64748B";
            e.currentTarget.style.backgroundColor = "#FFFFFF";
          }
        }}
      />

      {/* Left: Newton "N" Logo Emblem */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: "#27272D",
          border: "1px solid #363640",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }}
        >
          <path
            d="M6 19V5L18 19V5"
            stroke="#FFFFFF"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Center: Text Display */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          cursor: isDragging ? "grabbing" : "grab",
        }}
      >
        <div
          style={{
            margin: 0,
            fontSize: "13px",
            fontWeight: 600,
            color: "#0F172A",
            lineHeight: 1.35,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            letterSpacing: "-0.01em",
          }}
        >
          {line1}
        </div>

        {isNodeRunning ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 3,
              padding: "2px 8px",
              borderRadius: 6,
              backgroundColor: "rgba(0, 129, 251, 0.1)",
              color: "#0081FB",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            <Loader2 size={11} className="animate-spin" />
            <span>AI Agent executing...</span>
          </div>
        ) : isNodeFailed ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 3,
              padding: "2px 8px",
              borderRadius: 6,
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "#DC2626",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            <AlertCircle size={11} />
            <span>Failed</span>
            {onRetryNode && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetryNode(node.id);
                }}
                style={{
                  background: "#DC2626",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 4,
                  padding: "1px 6px",
                  fontSize: "10px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <RotateCw size={9} /> Retry
              </button>
            )}
          </div>
        ) : isNodePaused ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginTop: 3,
              padding: "2px 8px",
              borderRadius: 6,
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              color: "#D97706",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            <Pause size={10} fill="#D97706" />
            <span>Paused</span>
          </div>
        ) : (
          <div
            style={{
              margin: 0,
              fontSize: "11.5px",
              fontWeight: 400,
              color: line2 ? "#64748B" : "#94A3B8",
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 2,
              fontFamily: "monospace, monospace",
            }}
          >
            {line2 || (
              <span style={{ fontStyle: "italic", color: "#94A3B8" }}>
                #{node.sequenceLabel || (node.stepNumber ? `node${node.stepNumber}` : "node_")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right Actions: Pencil and Delete */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
          marginLeft: 2,
        }}
      >
        {/* Pencil Edit Icon Button */}
        <button
          type="button"
          title="Edit node text in popup"
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
            e.currentTarget.style.backgroundColor = "#F1F5F9";
            e.currentTarget.style.color = "#0081FB";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "#64748B";
          }}
        >
          <Pencil size={14} />
        </button>

        {/* Delete Icon Button */}
        <button
          type="button"
          title="Delete this node"
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
          <Trash2 size={13} />
        </button>
      </div>

      {/* Right Circular Connector Port */}
      <div
        className="automation-source-handle"
        title={isConnectTarget ? "Connect here" : "Right connector port"}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (isConnectTarget) {
            onCompleteConnect(node.id);
            return;
          }
          onStartConnect(e, node.id, "right");
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (isConnectTarget) {
            onCompleteConnect(node.id);
          }
        }}
        onMouseUp={(e) => {
          e.stopPropagation();
          if (isConnectTarget) {
            onCompleteConnect(node.id);
          }
        }}
        style={{
          position: "absolute",
          right: -7,
          top: "50%",
          transform: "translateY(-50%)",
          width: 14,
          height: 14,
          borderRadius: "50%",
          backgroundColor: isConnectSource || isConnectTarget ? accentColor : "#FFFFFF",
          border: `2.5px solid ${isConnectSource || isConnectTarget ? accentColor : "#64748B"}`,
          cursor: "crosshair",
          zIndex: 20,
          transition: "all 0.15s ease",
          boxShadow: isConnectSource || isConnectTarget
            ? `0 0 0 4px ${accentColor}33`
            : "none",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = accentColor;
          e.currentTarget.style.backgroundColor = accentColor;
          e.currentTarget.style.transform = "translateY(-50%) scale(1.35)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(-50%) scale(1)";
          if (!isConnectSource && !isConnectTarget) {
            e.currentTarget.style.borderColor = "#64748B";
            e.currentTarget.style.backgroundColor = "#FFFFFF";
          }
        }}
      />
    </div>
  );
};

export default AiAutomationNode;
