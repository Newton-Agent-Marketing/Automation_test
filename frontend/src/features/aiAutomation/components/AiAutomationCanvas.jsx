import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Plus,
  Workflow,
  X,
  Trash2,
} from "lucide-react";
import {
  AiAutomationNode,
  NODE_WIDTH,
  NODE_HEIGHT,
} from "./AiAutomationNode";

export const AiAutomationCanvas = ({
  nodes = [],
  edges = [],
  selectedNodeId,
  onSelectNode,
  onOpenEdit,
  onMoveNode,
  onSaveNodePosition,
  onDeleteNode,
  onConnect,
  onDeleteEdge,
  onAddNode,
}) => {
  const containerRef = useRef(null);
  const rafRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragNodeState, setDragNodeState] = useState(null);

  // Connection dragging state
  const [connectingSourceId, setConnectingSourceId] = useState(null);
  const [connectionMousePos, setConnectionMousePos] = useState({ x: 0, y: 0 });

  const dragRef = useRef(null);

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

  // Canvas Pan Handler
  const handleCanvasMouseDown = (e) => {
    if (
      e.target.closest(".ai-automation-node-card") ||
      e.target.closest(".canvas-floating-controls") ||
      e.target.closest(".edge-delete-btn")
    ) {
      return;
    }
    onSelectNode(null);

    // If we were connecting and clicked empty canvas, cancel connecting
    if (connectingSourceId) {
      setConnectingSourceId(null);
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
  const handleStartConnect = (e, sourceNodeId) => {
    e.stopPropagation();
    setConnectingSourceId(sourceNodeId);

    // Set initial mouse position in canvas coordinates
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left - pan.x) / zoom;
      const canvasY = (e.clientY - rect.top - pan.y) / zoom;
      setConnectionMousePos({ x: canvasX, y: canvasY });
    }
  };

  // Complete connection to target node
  const handleCompleteConnect = (targetNodeId) => {
    if (!connectingSourceId) return;
    if (connectingSourceId === targetNodeId) {
      // Cannot connect node to itself
      setConnectingSourceId(null);
      return;
    }

    // Check if edge already exists
    const exists = edges.some(
      (e) => e.source === connectingSourceId && e.target === targetNodeId
    );
    if (!exists) {
      onConnect(connectingSourceId, targetNodeId);
    }
    setConnectingSourceId(null);
  };

  // Mouse Move
  const handleMouseMove = useCallback(
    (e) => {
      // Track connecting line
      if (connectingSourceId && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - pan.x) / zoom;
        const canvasY = (e.clientY - rect.top - pan.y) / zoom;
        setConnectionMousePos({ x: canvasX, y: canvasY });
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
    [zoom, pan, connectingSourceId, onMoveNode]
  );

  // Mouse Up
  const handleMouseUp = useCallback(
    (e) => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
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

  // Compute Bezier Curve path between source (right-center) and target (left-center)
  const calculateCurvePath = (sourceNode, targetNode) => {
    if (!sourceNode || !targetNode) return "";

    const x1 = (sourceNode.position?.x ?? 0) + NODE_WIDTH;
    const y1 = (sourceNode.position?.y ?? 0) + NODE_HEIGHT / 2;

    const x2 = targetNode.position?.x ?? 0;
    const y2 = (targetNode.position?.y ?? 0) + NODE_HEIGHT / 2;

    const dx = Math.max(Math.abs(x2 - x1) * 0.5, 45);
    const cx1 = x1 + dx;
    const cy1 = y1;
    const cx2 = x2 - dx;
    const cy2 = y2;

    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  };

  // Compute mid point for edge action button
  const calculateMidPoint = (sourceNode, targetNode) => {
    if (!sourceNode || !targetNode) return { x: 0, y: 0 };
    const x1 = (sourceNode.position?.x ?? 0) + NODE_WIDTH;
    const y1 = (sourceNode.position?.y ?? 0) + NODE_HEIGHT / 2;
    const x2 = targetNode.position?.x ?? 0;
    const y2 = (targetNode.position?.y ?? 0) + NODE_HEIGHT / 2;
    return {
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2,
    };
  };

  // Live connecting drag curve
  const renderLiveConnectingPath = () => {
    if (!connectingSourceId) return null;
    const sourceNode = nodes.find((n) => n.id === connectingSourceId);
    if (!sourceNode) return null;

    const x1 = (sourceNode.position?.x ?? 0) + NODE_WIDTH;
    const y1 = (sourceNode.position?.y ?? 0) + NODE_HEIGHT / 2;
    const x2 = connectionMousePos.x;
    const y2 = connectionMousePos.y;

    const dx = Math.max(Math.abs(x2 - x1) * 0.5, 45);
    const cx1 = x1 + dx;
    const cy1 = y1;
    const cx2 = x2 - dx;
    const cy2 = y2;

    return (
      <path
        d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
        fill="none"
        stroke="#0081FB"
        strokeWidth={2}
        strokeDasharray="5,5"
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
        backgroundImage: `radial-gradient(#E2E8F0 1.2px, transparent 1.2px)`,
        backgroundSize: "20px 20px",
        backgroundPosition: `${pan.x}px ${pan.y}px`,
        cursor: isPanning
          ? "grabbing"
          : connectingSourceId
          ? "crosshair"
          : "default",
      }}
      onMouseDown={handleCanvasMouseDown}
    >
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
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#64748B" />
            </marker>
            <marker
              id="arrow-selected"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0081FB" />
            </marker>
            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0081FB" />
            </marker>
          </defs>

          {/* Render Persistent Edges */}
          {edges.map((edge) => {
            const sourceNode = nodes.find((n) => n.id === edge.source);
            const targetNode = nodes.find((n) => n.id === edge.target);
            if (!sourceNode || !targetNode) return null;

            const isSelected =
              edge.source === selectedNodeId || edge.target === selectedNodeId;
            const mid = calculateMidPoint(sourceNode, targetNode);

            return (
              <g key={edge.id || `${edge.source}-${edge.target}`} className="edge-group">
                <path
                  d={calculateCurvePath(sourceNode, targetNode)}
                  fill="none"
                  stroke={isSelected ? "#0081FB" : "#94A3B8"}
                  strokeWidth={isSelected ? 2.5 : 1.8}
                  markerEnd={isSelected ? "url(#arrow-selected)" : "url(#arrow)"}
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
          const sourceNode = nodes.find((n) => n.id === edge.source);
          const targetNode = nodes.find((n) => n.id === edge.target);
          if (!sourceNode || !targetNode) return null;

          const mid = calculateMidPoint(sourceNode, targetNode);
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
              maxWidth: 380,
              padding: "32px 24px",
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              backdropFilter: "blur(6px)",
              borderRadius: 16,
              border: "1px solid #E2E8F0",
              boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.08)",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: "#EFF6FF",
                border: "1px solid #DBEAFE",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#0081FB",
                marginBottom: 16,
              }}
            >
              <Workflow size={24} />
            </div>
            <h3
              style={{
                margin: "0 0 6px 0",
                fontSize: 16,
                fontWeight: 600,
                color: "#0F172A",
              }}
            >
              Empty Automation Canvas
            </h3>
            <p
              style={{
                margin: "0 0 20px 0",
                fontSize: 13,
                color: "#64748B",
                lineHeight: 1.45,
              }}
            >
              There are no nodes on the canvas. Add your first generic node to
              get started building your automation flow.
            </p>
            <button
              type="button"
              onClick={onAddNode}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                fontSize: 13.5,
                fontWeight: 600,
                color: "#FFFFFF",
                backgroundColor: "#0081FB",
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0, 129, 251, 0.25)",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#006FD0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#0081FB";
              }}
            >
              <Plus size={16} />
              Add First Node
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
          title="Reset View"
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
          <span>Click on target node or handle to connect</span>
          <button
            type="button"
            onClick={() => setConnectingSourceId(null)}
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
    </div>
  );
};

export default AiAutomationCanvas;
