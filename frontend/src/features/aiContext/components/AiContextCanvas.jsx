import { useState, useRef, useEffect, useCallback } from "react";
import { ZoomIn, ZoomOut, Maximize2, RefreshCw } from "lucide-react";
import { AiContextNode } from "./AiContextNode";
import { NodePickerDrawer } from "./NodePickerDrawer";
import { ConnectionAlert } from "./ConnectionAlert";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 90;

export const AiContextCanvas = ({
  nodes,
  edges,
  selectedNodeId,
  pickerAnchorNodeId,
  validationAlert,
  onSelectNode,
  onOpenPicker,
  onClosePicker,
  onOpenDrawer,
  onAddNode,
  onMoveNode,
  onDeleteNode,
  onDismissAlert,
}) => {
  const containerRef = useRef(null);
  const rafRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragNodeState, setDragNodeState] = useState(null);
  const [pickerPos, setPickerPos] = useState({ x: 0, y: 0 });

  const activeAnchorNode = nodes.find((n) => n.id === pickerAnchorNodeId);

  // Handle canvas zoom
  const handleZoom = (delta) => {
    setZoom((prev) => Math.min(Math.max(Number((prev + delta).toFixed(2)), 0.4), 1.6));
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (containerRef.current && nodes.length > 0) {
      const rect = containerRef.current.getBoundingClientRect();
      const rootNode = nodes.find((n) => n.isRoot || n.type === "user_input");
      if (rootNode) {
        const targetMidX = Math.round(Math.max((rect.width - NODE_WIDTH) / 2, 80));
        onMoveNode(rootNode.id, targetMidX, 50);
      }
    }
  };

  // Ensure Root Node is centered at top-middle of the canvas
  useEffect(() => {
    if (containerRef.current && nodes.length > 0) {
      const rect = containerRef.current.getBoundingClientRect();
      const rootNode = nodes.find((n) => n.isRoot || n.type === "user_input");
      if (rootNode) {
        const targetMidX = Math.round(Math.max((rect.width - NODE_WIDTH) / 2, 80));
        // If root node is at old left coordinates or not at top mid
        if (rootNode.position?.x === 120 || (rootNode.position?.x || 0) < 220 || (rootNode.position?.y || 0) > 120) {
          onMoveNode(rootNode.id, targetMidX, 50);
        }
      }
    }
  }, [nodes.length, onMoveNode]);

  // Node Drag Handler
  const handleNodeMouseDownDrag = (e, nodeId) => {
    e.stopPropagation();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    setDragNodeState({
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      nodeInitialX: node.position?.x || 0,
      nodeInitialY: node.position?.y || 0,
    });
  };

  // Canvas Pan Handler
  const handleCanvasMouseDown = (e) => {
    if (e.target.closest(".ai-context-node-card") || e.target.closest(".node-picker-popup")) {
      return;
    }
    onSelectNode(null);
    onClosePicker();
    setIsPanning(true);
    setDragNodeState({
      isCanvas: true,
      startX: e.clientX,
      startY: e.clientY,
      panInitialX: pan.x,
      panInitialY: pan.y,
    });
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!dragNodeState) return;

      if (dragNodeState.isCanvas) {
        const dx = e.clientX - dragNodeState.startX;
        const dy = e.clientY - dragNodeState.startY;
        setPan({
          x: dragNodeState.panInitialX + dx,
          y: dragNodeState.panInitialY + dy,
        });
        return;
      }

      if (dragNodeState.nodeId) {
        const dx = (e.clientX - dragNodeState.startX) / zoom;
        const dy = (e.clientY - dragNodeState.startY) / zoom;
        const newX = Math.round(dragNodeState.nodeInitialX + dx);
        const newY = Math.round(dragNodeState.nodeInitialY + dy);

        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
        }
        rafRef.current = requestAnimationFrame(() => {
          onMoveNode(dragNodeState.nodeId, newX, newY);
        });
      }
    },
    [dragNodeState, zoom, onMoveNode]
  );

  const handleMouseUp = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    setDragNodeState(null);
    setIsPanning(false);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Compute Bezier Curve path between source (bottom-center) and target (top-center) nodes for Tree structure
  const calculateCurvePath = (edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (!sourceNode || !targetNode) return "";

    const x1 = (sourceNode.position?.x || 0) + NODE_WIDTH / 2;
    const y1 = (sourceNode.position?.y || 0) + 90; // bottom center of connector handle

    const x2 = (targetNode.position?.x || 0) + NODE_WIDTH / 2;
    const y2 = (targetNode.position?.y || 0); // top center of target node

    const dy = Math.max(Math.abs(y2 - y1) * 0.55, 35);
    const cx1 = x1;
    const cy1 = y1 + dy;
    const cx2 = x2;
    const cy2 = y2 - dy;

    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  };

  const handleOpenPickerWithPos = (nodeId, pos) => {
    setPickerPos(pos);
    onOpenPicker(nodeId);
  };

  return (
    <div
      ref={containerRef}
      className="ai-context-canvas-container"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "#FAFBFD",
        backgroundImage: `radial-gradient(#E2E8F0 1.2px, transparent 1.2px)`,
        backgroundSize: "20px 20px",
        backgroundPosition: `${pan.x}px ${pan.y}px`,
        cursor: isPanning ? "grabbing" : "default",
      }}
      onMouseDown={handleCanvasMouseDown}
    >
      {/* Pop Warning Alert Toast for Invalid Connections */}
      <ConnectionAlert alert={validationAlert} onDismiss={onDismissAlert} />

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
            width: "5000px",
            height: "5000px",
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
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0F172A" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const isConnectedToSelected =
              edge.source === selectedNodeId || edge.target === selectedNodeId;
            return (
              <path
                key={edge.id}
                d={calculateCurvePath(edge)}
                fill="none"
                stroke={isConnectedToSelected ? "#0081FB" : "#CBD5E1"}
                strokeWidth={isConnectedToSelected ? 2.2 : 1.6}
                strokeDasharray="none"
                style={{ transition: "stroke 0.2s ease, stroke-width 0.2s ease" }}
              />
            );
          })}
        </svg>

        {/* Nodes Layer */}
        {nodes.map((node) => {
          const isConnected =
            node.isRoot ||
            Boolean(node.previousNodeId || node.previousNodeLabel) ||
            edges.some((e) => e.target === node.id || e.source === node.id);
          const isDragging = dragNodeState?.nodeId === node.id;
          return (
            <AiContextNode
              key={node.id}
              node={node}
              isConnected={isConnected}
              isDragging={isDragging}
              isSelected={selectedNodeId === node.id}
              onSelect={onSelectNode}
              onOpenPicker={handleOpenPickerWithPos}
              onOpenDrawer={onOpenDrawer}
              onMouseDownDrag={handleNodeMouseDownDrag}
              onDelete={onDeleteNode}
            />
          );
        })}

        {/* Floating Node Picker Menu */}
        {activeAnchorNode && (
          <NodePickerDrawer
            anchorNode={activeAnchorNode}
            position={pickerPos}
            onSelectNode={onAddNode}
            onClose={onClosePicker}
          />
        )}
      </div>

      {/* Floating Canvas Controls (Zoom / Center) */}
      <div
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
          onClick={() => handleZoom(-0.15)}
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            padding: 4,
            color: "#64748B",
            display: "flex",
            alignItems: "center",
          }}
          title="Zoom out"
        >
          <ZoomOut size={15} />
        </button>

        <span
          style={{
            fontSize: "12px",
            fontWeight: 700,
            color: "#334155",
            minWidth: 42,
            textAlign: "center",
          }}
        >
          {Math.round(zoom * 100)}%
        </span>

        <button
          type="button"
          onClick={() => handleZoom(0.15)}
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            padding: 4,
            color: "#64748B",
            display: "flex",
            alignItems: "center",
          }}
          title="Zoom in"
        >
          <ZoomIn size={15} />
        </button>

        <div style={{ width: 1, height: 16, backgroundColor: "#E2E8F0", margin: "0 4px" }} />

        <button
          type="button"
          onClick={handleResetZoom}
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            padding: 4,
            color: "#64748B",
            display: "flex",
            alignItems: "center",
          }}
          title="Reset canvas view"
        >
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
};

export default AiContextCanvas;
