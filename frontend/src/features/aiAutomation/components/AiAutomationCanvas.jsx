import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Plus,
  Workflow,
  X,
  AlertTriangle,
  Zap,
  Calendar,
  Play,
  Clock,
  Sparkles,
} from "lucide-react";
import {
  AiAutomationNode,
  NODE_WIDTH,
  NODE_HEIGHT,
  getNodeDimensions,
} from "./AiAutomationNode";

export const AiAutomationCanvas = ({
  nodes = [],
  edges = [],
  selectedNodeId,
  executingNodeId = null,
  executingEdgeIds = [],
  completedNodeIds = [],
  completedEdgeIds = [],
  nodeStatusMap = {},
  isWorkflowRunning = false,
  isWorkflowPaused = false,
  activeWorkflowNodeIds = [],
  isWorkflowCompleted = false,
  allNodesBlue = false,
  onTogglePauseResume,
  onRetryNode,
  onExecuteWorkflow,
  connectionAlert,
  onClearConnectionAlert,
  onInvalidConnection,
  onSelectNode,
  onOpenEdit,
  onMoveNode,
  onSaveNodePosition,
  onDeleteNode,
  onConnect,
  onDeleteEdge,
  onAddNode,
  onCursorMove,
}) => {
  const containerRef = useRef(null);
  const rafRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragNodeState, setDragNodeState] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  // Connection dragging state
  const [connectingSourceId, setConnectingSourceId] = useState(null);
  const [connectingHandle, setConnectingHandle] = useState("right");
  const [connectionMousePos, setConnectionMousePos] = useState({ x: 0, y: 0 });

  const dragRef = useRef(null);
  const isConnectingRef = useRef({
    active: false,
    sourceId: null,
    handle: "right",
    startX: 0,
    startY: 0,
    hasDragged: false,
  });

  // Auto-dismiss alert banner after 3.5 seconds
  useEffect(() => {
    if (connectionAlert) {
      const timer = setTimeout(() => {
        if (onClearConnectionAlert) {
          onClearConnectionAlert();
        }
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [connectionAlert, onClearConnectionAlert]);

  // Cancel connecting mode on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && connectingSourceId) {
        setConnectingSourceId(null);
        setConnectingHandle("right");
        isConnectingRef.current.active = false;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [connectingSourceId]);

  // Zoom controls
  const handleZoom = (delta) => {
    setZoom((prev) =>
      Math.min(Math.max(Number((prev + delta).toFixed(2)), 0.4), 1.6)
    );
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Node Drag Handler (Entire card or header)
  const handleNodeMouseDownDrag = (e, nodeId) => {
    e.stopPropagation();
    onSelectNode(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const initialX = Number(node.position?.x) || 0;
    const initialY = Number(node.position?.y) || 0;

    dragRef.current = {
      isNode: true,
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      nodeInitialX: initialX,
      nodeInitialY: initialY,
      currentX: initialX,
      currentY: initialY,
      hasMoved: false,
    };

    setDragNodeState({
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      nodeInitialX: initialX,
      nodeInitialY: initialY,
    });
  };

  // Close context menu on any outside click
  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null);
    window.addEventListener("click", handleCloseMenu);
    return () => window.removeEventListener("click", handleCloseMenu);
  }, []);

  // Track cursor position inside canvas coordinates
  const handleCanvasMouseMove = useCallback(
    (e) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const canvasX = Math.round((e.clientX - rect.left - pan.x) / zoom);
        const canvasY = Math.round((e.clientY - rect.top - pan.y) / zoom);
        if (typeof onCursorMove === "function") {
          onCursorMove({ x: canvasX, y: canvasY });
        }
      }
    },
    [pan, zoom, onCursorMove]
  );

  // Right-click context menu on empty canvas space
  const handleCanvasContextMenu = useCallback(
    (e) => {
      if (
        e.target.closest(".ai-automation-node-card") ||
        e.target.closest(".canvas-floating-controls") ||
        e.target.closest(".edge-delete-btn") ||
        e.target.closest(".connection-alert-banner")
      ) {
        return;
      }
      e.preventDefault();
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const canvasX = Math.round((e.clientX - rect.left - pan.x) / zoom);
        const canvasY = Math.round((e.clientY - rect.top - pan.y) / zoom);
        if (typeof onCursorMove === "function") {
          onCursorMove({ x: canvasX, y: canvasY });
        }
        setContextMenu({
          screenX: e.clientX,
          screenY: e.clientY,
          canvasX,
          canvasY,
        });
      }
    },
    [pan, zoom, onCursorMove]
  );

  // Canvas Pan Handler
  const handleCanvasMouseDown = (e) => {
    if (
      e.target.closest(".ai-automation-node-card") ||
      e.target.closest(".canvas-floating-controls") ||
      e.target.closest(".edge-delete-btn") ||
      e.target.closest(".connection-alert-banner")
    ) {
      return;
    }
    onSelectNode(null);

    // Record cursor position on click
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const canvasX = Math.round((e.clientX - rect.left - pan.x) / zoom);
      const canvasY = Math.round((e.clientY - rect.top - pan.y) / zoom);
      if (typeof onCursorMove === "function") {
        onCursorMove({ x: canvasX, y: canvasY });
      }
    }

    // If we were connecting and clicked empty canvas, cancel connecting
    if (connectingSourceId) {
      setConnectingSourceId(null);
      setConnectingHandle("right");
      isConnectingRef.current.active = false;
      return;
    }

    setIsPanning(true);
    dragRef.current = {
      isCanvas: true,
      startX: e.clientX,
      startY: e.clientY,
      panInitialX: pan.x,
      panInitialY: pan.y,
    };

    setDragNodeState({
      isCanvas: true,
      startX: e.clientX,
      startY: e.clientY,
      panInitialX: pan.x,
      panInitialY: pan.y,
    });
  };

  // Start connecting from source node
  const handleStartConnect = (e, sourceNodeId, handle = "right") => {
    e.stopPropagation();
    isConnectingRef.current = {
      active: true,
      sourceId: sourceNodeId,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      hasDragged: false,
    };
    setConnectingSourceId(sourceNodeId);
    setConnectingHandle(handle);

    // Set initial mouse position in canvas coordinates
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left - pan.x) / zoom;
      const canvasY = (e.clientY - rect.top - pan.y) / zoom;
      setConnectionMousePos({ x: canvasX, y: canvasY });
    }
  };

  // Helper to determine natural workflow edge direction
  // Trigger / Date / Time inputs on left -> feed INTO Start Node (arrow points to Start Node)
  // Start Node -> feeds INTO Custom Task (arrow points to Custom Task)
  const resolveEdgeEndpoints = useCallback((nodeA, nodeB) => {
    if (!nodeA || !nodeB) return { from: nodeA, to: nodeB };

    const isAStart =
      nodeA.type === "trigger" ||
      nodeA.label?.toLowerCase().includes("start");
    const isBStart =
      nodeB.type === "trigger" ||
      nodeB.label?.toLowerCase().includes("start");

    if (isAStart && !isBStart) {
      // If nodeB is date/time/action or positioned to the left of Start Node, nodeB feeds INTO Start Node!
      if (
        nodeB.type === "date" ||
        nodeB.type === "time" ||
        (nodeB.position?.x ?? 0) < (nodeA.position?.x ?? 0)
      ) {
        return { from: nodeB, to: nodeA };
      }
      return { from: nodeA, to: nodeB };
    }

    if (isBStart && !isAStart) {
      // If nodeA is date/time/action or positioned to the left of Start Node, nodeA feeds INTO Start Node!
      if (
        nodeA.type === "date" ||
        nodeA.type === "time" ||
        (nodeA.position?.x ?? 0) < (nodeB.position?.x ?? 0)
      ) {
        return { from: nodeA, to: nodeB };
      }
      return { from: nodeB, to: nodeA };
    }

    // Default flow: left-to-right flow across canvas
    if ((nodeA.position?.x ?? 0) <= (nodeB.position?.x ?? 0)) {
      return { from: nodeA, to: nodeB };
    }
    return { from: nodeB, to: nodeA };
  }, []);

  // Complete connection to target node with strict connection rules
  const handleCompleteConnect = (targetNodeId) => {
    if (!connectingSourceId) return;

    if (connectingSourceId === targetNodeId) {
      // If user just clicked source handle without dragging, keep connecting mode active
      if (!isConnectingRef.current.hasDragged) {
        return;
      }
      setConnectingSourceId(null);
      setConnectingHandle("right");
      isConnectingRef.current.active = false;
      return;
    }

    const sourceNode = nodes.find((n) => n.id === connectingSourceId);
    const targetNode = nodes.find((n) => n.id === targetNodeId);

    if (!sourceNode || !targetNode) {
      setConnectingSourceId(null);
      setConnectingHandle("right");
      isConnectingRef.current.active = false;
      return;
    }

    const { from, to } = resolveEdgeEndpoints(sourceNode, targetNode);
    const sourceId = from.id;
    const targetId = to.id;

    const resolvedSource = from;
    const resolvedTarget = to;

    const childTypes = ["date", "action", "time"];


    // Rule: Date, Action, and Time must NOT connect to one another
    if (
      childTypes.includes(resolvedSource?.type) &&
      childTypes.includes(resolvedTarget?.type)
    ) {
      if (onInvalidConnection) {
        onInvalidConnection(
          "Invalid Connection: Date, Action, and Time must NOT connect to one another. Each child node must connect directly to the Trigger node."
        );
      }
      setConnectingSourceId(null);
      setConnectingHandle("right");
      isConnectingRef.current.active = false;
      return;
    }

    // Check if edge already exists
    const exists = edges.some(
      (e) =>
        (e.source === sourceId && e.target === targetId) ||
        (e.source === targetId && e.target === sourceId)
    );
    if (exists) {
      if (onInvalidConnection) {
        onInvalidConnection("These nodes are already connected.");
      }
    } else {
      onConnect(sourceId, targetId);
    }

    setConnectingSourceId(null);
    setConnectingHandle("right");
    isConnectingRef.current.active = false;
  };

  // Mouse Move
  const handleMouseMove = useCallback(
    (e) => {
      // Record cursor coordinates whenever mouse is over canvas
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          const canvasX = Math.round((e.clientX - rect.left - pan.x) / zoom);
          const canvasY = Math.round((e.clientY - rect.top - pan.y) / zoom);
          if (typeof onCursorMove === "function") {
            onCursorMove({ x: canvasX, y: canvasY });
          }
        }
      }

      // Track connecting line
      if (connectingSourceId && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - pan.x) / zoom;
        const canvasY = (e.clientY - rect.top - pan.y) / zoom;
        setConnectionMousePos({ x: canvasX, y: canvasY });

        if (isConnectingRef.current.active) {
          const dist = Math.hypot(
            e.clientX - isConnectingRef.current.startX,
            e.clientY - isConnectingRef.current.startY
          );
          if (dist > 5) {
            isConnectingRef.current.hasDragged = true;
          }
        }
      }

      const activeDrag = dragRef.current;
      if (!activeDrag) return;

      if (activeDrag.isCanvas) {
        const dx = e.clientX - activeDrag.startX;
        const dy = e.clientY - activeDrag.startY;
        setPan({
          x: activeDrag.panInitialX + dx,
          y: activeDrag.panInitialY + dy,
        });
        return;
      }

      if (activeDrag.isNode && activeDrag.nodeId) {
        const dx = (e.clientX - activeDrag.startX) / zoom;
        const dy = (e.clientY - activeDrag.startY) / zoom;

        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          activeDrag.hasMoved = true;
        }

        const newX = Math.round(activeDrag.nodeInitialX + dx);
        const newY = Math.round(activeDrag.nodeInitialY + dy);

        activeDrag.currentX = newX;
        activeDrag.currentY = newY;

        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
        }
        rafRef.current = requestAnimationFrame(() => {
          onMoveNode(activeDrag.nodeId, newX, newY);
        });
      }
    },
    [zoom, pan, connectingSourceId, onMoveNode, onCursorMove]
  );

  // Mouse Up
  const handleMouseUp = useCallback(
    (e) => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      // If user dragged a wire across canvas and dropped it on empty space (not on any node)
      if (isConnectingRef.current.active && isConnectingRef.current.hasDragged) {
        setTimeout(() => {
          if (isConnectingRef.current.active && isConnectingRef.current.hasDragged) {
            setConnectingSourceId(null);
            setConnectingHandle("right");
            isConnectingRef.current.active = false;
          }
        }, 50);
      }

      const activeDrag = dragRef.current;
      // If we finished dragging a node and moved it, persist its final position to server
      if (activeDrag?.isNode && activeDrag?.nodeId && activeDrag?.hasMoved) {
        onSaveNodePosition(
          activeDrag.nodeId,
          activeDrag.currentX,
          activeDrag.currentY
        );
      }

      dragRef.current = null;
      setDragNodeState(null);
      setIsPanning(false);
    },
    [onSaveNodePosition]
  );

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Compute Bezier Curve path between source and target handles based on relative position
  const calculateCurvePath = (sourceNode, targetNode) => {
    if (!sourceNode || !targetNode) return "";

    const sourceX = sourceNode.position?.x ?? 0;
    const sourceY = sourceNode.position?.y ?? 0;
    const targetX = targetNode.position?.x ?? 0;
    const targetY = targetNode.position?.y ?? 0;

    const sourceDim = getNodeDimensions(sourceNode);
    const targetDim = getNodeDimensions(targetNode);

    let x1, y1, x2, y2, cx1, cy1, cx2, cy2;

    if (targetX < sourceX) {
      // Target is on the LEFT of Source: connect Source's Left Handle -> Target's Right Handle
      x1 = sourceX;
      y1 = sourceY + sourceDim.height / 2;
      x2 = targetX + targetDim.width;
      y2 = targetY + targetDim.height / 2;
      const dx = Math.max(Math.abs(x1 - x2) * 0.5, 45);
      cx1 = x1 - dx;
      cy1 = y1;
      cx2 = x2 + dx;
      cy2 = y2;
    } else {
      // Target is on the RIGHT of Source: connect Source's Right Handle -> Target's Left Handle
      x1 = sourceX + sourceDim.width;
      y1 = sourceY + sourceDim.height / 2;
      x2 = targetX;
      y2 = targetY + targetDim.height / 2;
      const dx = Math.max(Math.abs(x2 - x1) * 0.5, 45);
      cx1 = x1 + dx;
      cy1 = y1;
      cx2 = x2 - dx;
      cy2 = y2;
    }

    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  };

  // Compute mid point for edge action button
  const calculateMidPoint = (sourceNode, targetNode) => {
    if (!sourceNode || !targetNode) return { x: 0, y: 0 };
    const sourceX = sourceNode.position?.x ?? 0;
    const sourceY = sourceNode.position?.y ?? 0;
    const targetX = targetNode.position?.x ?? 0;
    const targetY = targetNode.position?.y ?? 0;

    const sourceDim = getNodeDimensions(sourceNode);
    const targetDim = getNodeDimensions(targetNode);

    const x1 = targetX < sourceX ? sourceX : sourceX + sourceDim.width;
    const y1 = sourceY + sourceDim.height / 2;
    const x2 = targetX < sourceX ? targetX + targetDim.width : targetX;
    const y2 = targetY + targetDim.height / 2;
    return {
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2,
    };
  };

  // Edge stroke color matching child target
  const getEdgeColor = (targetType) => {
    switch (targetType) {
      case "date":
        return "#2563EB";
      case "action":
        return "#059669";
      case "time":
        return "#D97706";
      default:
        return "#8B5CF6";
    }
  };

  // Live connecting drag curve
  const renderLiveConnectingPath = () => {
    if (!connectingSourceId) return null;
    const sourceNode = nodes.find((n) => n.id === connectingSourceId);
    if (!sourceNode) return null;

    const sourceDim = getNodeDimensions(sourceNode);
    const startFromLeft = connectingHandle === "left";
    const x1 =
      (sourceNode.position?.x ?? 0) + (startFromLeft ? 0 : sourceDim.width);
    const y1 = (sourceNode.position?.y ?? 0) + sourceDim.height / 2;
    const x2 = connectionMousePos.x;
    const y2 = connectionMousePos.y;

    const dx = Math.max(Math.abs(x2 - x1) * 0.5, 45);
    const cx1 = startFromLeft ? x1 - dx : x1 + dx;
    const cy1 = y1;
    const cx2 = startFromLeft ? x2 + dx : x2 - dx;
    const cy2 = y2;

    return (
      <path
        d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
        fill="none"
        stroke="#8B5CF6"
        strokeWidth={2.5}
        strokeDasharray="6,4"
        markerEnd="url(#arrow-active)"
      />
    );
  };

  return (
    <div
      ref={containerRef}
      className="ai-automation-canvas-container"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "#FAFBFD",
        backgroundImage: `radial-gradient(#CBD5E1 1.2px, transparent 1.2px)`,
        backgroundSize: "22px 22px",
        backgroundPosition: `${pan.x}px ${pan.y}px`,
        cursor: isPanning
          ? "grabbing"
          : connectingSourceId
          ? "crosshair"
          : "default",
      }}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleCanvasMouseMove}
      onContextMenu={handleCanvasContextMenu}
    >
      {/* Keyframes for flowing blue wire beam and pulsing executing glow */}
      <style>{`
        @keyframes nodeBorderLineMove {
          from {
            stroke-dashoffset: 0;
          }
          to {
            stroke-dashoffset: -100;
          }
        }
        @keyframes flowingDash {
          from {
            stroke-dashoffset: 0;
          }
          to {
            stroke-dashoffset: -32;
          }
        }
        @keyframes pulseBlueGlow {
          0%, 100% {
            box-shadow: 0 0 0 4.5px rgba(0, 129, 251, 0.4), 0 0 22px rgba(0, 129, 251, 0.45);
            border-color: #0081FB !important;
          }
          50% {
            box-shadow: 0 0 0 8px rgba(0, 129, 251, 0.65), 0 0 32px rgba(0, 129, 251, 0.65);
            border-color: #38BDF8 !important;
          }
        }
      `}</style>
      {/* Toast Alert for Connection Validation Rules */}
      {connectionAlert && (
        <div
          className="connection-alert-banner"
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#FEF2F2",
            border: "1.5px solid #F87171",
            color: "#991B1B",
            padding: "10px 18px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 10px 25px rgba(220, 38, 38, 0.15)",
            zIndex: 1000,
            maxWidth: 580,
          }}
        >
          <AlertTriangle size={18} color="#DC2626" />
          <span style={{ flex: 1 }}>{connectionAlert}</span>
          <button
            type="button"
            onClick={onClearConnectionAlert}
            style={{
              background: "none",
              border: "none",
              color: "#991B1B",
              cursor: "pointer",
              padding: 2,
              display: "flex",
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Transformable Canvas Content */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          transformOrigin: "0 0",
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          pointerEvents: "auto",
        }}
      >
        {/* SVG Bezier Connection Curves */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "6000px",
            height: "6000px",
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#64748B" />
            </marker>
            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#8B5CF6" />
            </marker>
            <marker
              id="arrow-executing"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0081FB" />
            </marker>
          </defs>


          {/* Render Persistent Edges */}
          {edges.map((edge) => {
            const rawSource = nodes.find((n) => n.id === edge.source);
            const rawTarget = nodes.find((n) => n.id === edge.target);
            if (!rawSource || !rawTarget) return null;

            // Automatically resolve endpoints so Trigger inputs on the left ALWAYS point INTO Start Node
            const { from: naturalSource, to: naturalTarget } = resolveEdgeEndpoints(rawSource, rawTarget);

            const isSelected =
              edge.source === selectedNodeId || edge.target === selectedNodeId;

            const activeExec = Array.isArray(executingEdgeIds)
              ? executingEdgeIds.find(
                  (item) =>
                    (typeof item === "string" ? item === edge.id : item?.edgeId === edge.id)
                )
              : null;
            const isEdgeActive = !!activeExec;

            // When active, ensure fromNode and toNode strictly match the active flowing step
            const fromNode = activeExec?.fromNodeId
              ? nodes.find((n) => n.id === activeExec.fromNodeId) || naturalSource
              : naturalSource;
            const toNode = activeExec?.toNodeId
              ? nodes.find((n) => n.id === activeExec.toNodeId) || naturalTarget
              : naturalTarget;

            const strokeColor = getEdgeColor(toNode.type);
            const curveD = calculateCurvePath(fromNode, toNode);

            if (isEdgeActive) {
              return (
                <g key={edge.id || `${edge.source}-${edge.target}`} className="edge-group active-executing-edge">
                  {/* Outer glowing halo beam */}
                  <path
                    d={curveD}
                    fill="none"
                    stroke="#0081FB"
                    strokeWidth={7}
                    strokeOpacity={0.35}
                    style={{
                      filter: "drop-shadow(0 0 8px #0081FB)",
                    }}
                  />
                  {/* Animated electric blue flowing beam */}
                  <path
                    d={curveD}
                    fill="none"
                    stroke="#0081FB"
                    strokeWidth={3.8}
                    strokeDasharray="10 6"
                    markerEnd="url(#arrow-executing)"
                    style={{
                      animation: "flowingDash 0.75s linear infinite",
                      filter: "drop-shadow(0 0 5px #0081FB)",
                    }}
                  />
                  {/* Intense inner electric cyan laser */}
                  <path
                    d={curveD}
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth={2}
                    strokeDasharray="10 6"
                    style={{
                      animation: "flowingDash 0.75s linear infinite",
                    }}
                  />
                </g>
              );
            }

            const isEdgeCompleted =
              (allNodesBlue && isWorkflowCompleted) ||
              (Array.isArray(completedEdgeIds) && completedEdgeIds.includes(edge.id));

            if (isEdgeCompleted) {
              return (
                <g key={edge.id || `${edge.source}-${edge.target}`} className="edge-group completed-executing-edge">
                  <path
                    d={curveD}
                    fill="none"
                    stroke="#0081FB"
                    strokeWidth={3.2}
                    markerEnd="url(#arrow-executing)"
                    style={{
                      filter: "drop-shadow(0 0 5px rgba(0, 129, 251, 0.45))",
                      transition: "stroke 0.25s ease, stroke-width 0.25s ease",
                    }}
                  />
                </g>
              );
            }

            return (
              <g key={edge.id || `${edge.source}-${edge.target}`} className="edge-group">
                <path
                  d={curveD}
                  fill="none"
                  stroke={isSelected ? strokeColor : `${strokeColor}B3`}
                  strokeWidth={isSelected ? 2.8 : 2.2}
                  markerEnd="url(#arrow)"
                  style={{
                    transition: "stroke 0.2s ease, stroke-width 0.2s ease",
                  }}
                />
              </g>
            );
          })}


          {/* Live Connecting Wire */}
          {renderLiveConnectingPath()}
        </svg>

        {/* Delete Edge Action Buttons Overlay */}
        {edges.map((edge) => {
          const rawSource = nodes.find((n) => n.id === edge.source);
          const rawTarget = nodes.find((n) => n.id === edge.target);
          if (!rawSource || !rawTarget) return null;

          const { from, to } = resolveEdgeEndpoints(rawSource, rawTarget);
          const mid = calculateMidPoint(from, to);

          return (
            <button
              key={`del-${edge.id || `${edge.source}-${edge.target}`}`}
              type="button"
              className="edge-delete-btn"
              title="Delete connection"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteEdge(edge.id);
              }}
              style={{
                position: "absolute",
                left: mid.x - 11,
                top: mid.y - 11,
                width: 22,
                height: 22,
                borderRadius: "50%",
                backgroundColor: "#FFFFFF",
                border: "1px solid #CBD5E1",
                boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#64748B",
                zIndex: 40,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#FEE2E2";
                e.currentTarget.style.color = "#EF4444";
                e.currentTarget.style.borderColor = "#FCA5A5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#FFFFFF";
                e.currentTarget.style.color = "#64748B";
                e.currentTarget.style.borderColor = "#CBD5E1";
              }}
            >
              <X size={12} />
            </button>
          );
        })}

        {/* Nodes Layer */}
        {nodes.map((node) => {
          const isDragging = dragNodeState?.nodeId === node.id;
          return (
            <AiAutomationNode
              key={node.id}
              node={node}
              isSelected={selectedNodeId === node.id}
              isDragging={isDragging}
              isConnectSource={connectingSourceId === node.id}
              isConnectTarget={Boolean(
                connectingSourceId && connectingSourceId !== node.id
              )}
              isExecuting={executingNodeId === node.id}
              isCompleted={
                Array.isArray(completedNodeIds) &&
                completedNodeIds.includes(node.id)
              }
              allNodesBlue={allNodesBlue}
              nodeExecution={nodeStatusMap?.[node.id]}
              isWorkflowRunning={isWorkflowRunning}
              isWorkflowPaused={isWorkflowPaused}
              activeWorkflowNodeIds={activeWorkflowNodeIds}
              onTogglePauseResume={onTogglePauseResume}
              onRetryNode={onRetryNode}
              onExecuteWorkflow={onExecuteWorkflow}
              onSelect={onSelectNode}
              onOpenEdit={onOpenEdit}
              onMouseDownDrag={handleNodeMouseDownDrag}
              onDelete={onDeleteNode}
              onStartConnect={handleStartConnect}
              onCompleteConnect={handleCompleteConnect}
            />
          );
        })}
      </div>

      {/* Empty State Overlay when no nodes exist */}
      {nodes.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              pointerEvents: "auto",
              textAlign: "center",
              maxWidth: 420,
              padding: "36px 28px",
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(8px)",
              borderRadius: 16,
              border: "1px solid #E2E8F0",
              boxShadow: "0 10px 30px -5px rgba(15, 23, 42, 0.08)",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                backgroundColor: "#F5F3FF",
                border: "1px solid #DDD6FE",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#7C3AED",
                marginBottom: 16,
              }}
            >
              <Zap size={26} />
            </div>
            <h3
              style={{
                margin: "0 0 8px 0",
                fontSize: 17,
                fontWeight: 700,
                color: "#0F172A",
              }}
            >
              Create Your Trigger Workflow
            </h3>
            <p
              style={{
                margin: "0 0 22px 0",
                fontSize: 13,
                color: "#64748B",
                lineHeight: 1.5,
              }}
            >
              Start by adding a <strong>Trigger</strong> node, then connect <strong>Date</strong>, <strong>Action</strong>, and <strong>Time</strong> nodes to automate your marketing tasks.
            </p>
            <button
              type="button"
              onClick={() => onAddNode("trigger")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 22px",
                fontSize: 13.5,
                fontWeight: 600,
                color: "#FFFFFF",
                backgroundColor: "#7C3AED",
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(124, 58, 237, 0.28)",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#6D28D9";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#7C3AED";
              }}
            >
              <Zap size={16} />
              Add Trigger Node
            </button>
          </div>
        </div>
      )}

      {/* Floating Canvas Controls (Zoom In, Zoom Out, Reset) */}
      <div
        className="canvas-floating-controls"
        style={{
          position: "absolute",
          bottom: 24,
          right: 24,
          display: "flex",
          alignItems: "center",
          gap: 4,
          backgroundColor: "#FFFFFF",
          padding: "4px 8px",
          borderRadius: 12,
          border: "1px solid #E2E8F0",
          boxShadow: "0 4px 16px rgba(15, 23, 42, 0.08)",
          zIndex: 100,
        }}
      >
        <button
          type="button"
          onClick={() => handleZoom(0.1)}
          title="Zoom In"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 6,
            borderRadius: 6,
            color: "#475569",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "#F1F5F9")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
        >
          <ZoomIn size={16} />
        </button>

        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#64748B",
            minWidth: 40,
            textAlign: "center",
            userSelect: "none",
          }}
        >
          {Math.round(zoom * 100)}%
        </span>

        <button
          type="button"
          onClick={() => handleZoom(-0.1)}
          title="Zoom Out"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 6,
            borderRadius: 6,
            color: "#475569",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "#F1F5F9")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
        >
          <ZoomOut size={16} />
        </button>

        <div
          style={{
            width: 1,
            height: 16,
            backgroundColor: "#E2E8F0",
            margin: "0 2px",
          }}
        />

        <button
          type="button"
          onClick={handleResetZoom}
          title="Fit Canvas / Reset View"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 6,
            borderRadius: 6,
            color: "#475569",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "#F1F5F9")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
        >
          <Maximize2 size={15} />
        </button>
      </div>

      {/* Floating Helper Toast when in connecting mode */}
      {connectingSourceId && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#0F172A",
            color: "#FFFFFF",
            padding: "8px 16px",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 500,
            boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            zIndex: 1000,
          }}
        >
          <span>Click on Date, Action, or Time port to connect</span>
          <button
            type="button"
            onClick={() => {
              setConnectingSourceId(null);
              setConnectingHandle("right");
            }}
            style={{
              background: "none",
              border: "none",
              color: "#94A3B8",
              cursor: "pointer",
              padding: 2,
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Right-click Canvas Context Menu to Add Node directly at cursor */}
      {contextMenu && (
        <div
          style={{
            position: "fixed",
            left: contextMenu.screenX,
            top: contextMenu.screenY,
            backgroundColor: "#FFFFFF",
            borderRadius: 12,
            border: "1px solid #E2E8F0",
            boxShadow: "0 10px 25px rgba(15, 23, 42, 0.16)",
            padding: "6px",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 175,
            animation: "fadeIn 0.12s ease-out",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#94A3B8",
              padding: "4px 8px 2px 8px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Add Node Here
          </div>
          <button
            type="button"
            onClick={() => {
              onAddNode("date", { x: contextMenu.canvasX, y: contextMenu.canvasY });
              setContextMenu(null);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              borderRadius: 6,
              border: "none",
              backgroundColor: "transparent",
              color: "#2563EB",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#EFF6FF")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <Calendar size={14} color="#2563EB" /> + Date Node
          </button>
          <button
            type="button"
            onClick={() => {
              onAddNode("action", { x: contextMenu.canvasX, y: contextMenu.canvasY });
              setContextMenu(null);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              borderRadius: 6,
              border: "none",
              backgroundColor: "transparent",
              color: "#059669",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#ECFDF5")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <Play size={14} color="#059669" /> + Action Node
          </button>
          <button
            type="button"
            onClick={() => {
              onAddNode("time", { x: contextMenu.canvasX, y: contextMenu.canvasY });
              setContextMenu(null);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              borderRadius: 6,
              border: "none",
              backgroundColor: "transparent",
              color: "#D97706",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#FFFBEB")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <Clock size={14} color="#D97706" /> + Time Node
          </button>
          <div style={{ height: 1, backgroundColor: "#F1F5F9", margin: "2px 0" }} />
          <button
            type="button"
            onClick={() => {
              onAddNode("generic", { x: contextMenu.canvasX, y: contextMenu.canvasY });
              setContextMenu(null);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              borderRadius: 6,
              border: "none",
              backgroundColor: "transparent",
              color: "#475569",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F8FAFC")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <Sparkles size={14} color="#6366F1" /> + Custom Task
          </button>
        </div>
      )}
    </div>
  );
};

export default AiAutomationCanvas;
