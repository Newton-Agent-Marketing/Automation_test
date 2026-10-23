import React, { useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Workflow,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  fetchAutomation,
  createNode,
  updateNodeText,
  updateNodePosition,
  deleteNode,
  addEdge,
  removeEdge,
  moveNodeLocal,
  setSelectedNode,
  openEditModal,
  closeEditModal,
  clearError,
} from "../aiAutomation.slice";
import { AiAutomationCanvas } from "../components/AiAutomationCanvas";
import { NodeTextEditorModal } from "../components/NodeTextEditorModal";

export const AiAutomation = () => {
  const dispatch = useDispatch();
  const {
    nodes,
    edges,
    loading,
    saving,
    saveStatus,
    error,
    selectedNodeId,
    isEditingModalOpen,
    isEditModalOpen,
    editingNodeId,
    activeEditingNodeId,
  } = useSelector((state) => state.aiAutomation);

  const modalOpen = Boolean(isEditingModalOpen || isEditModalOpen);
  const currentEditId = editingNodeId || activeEditingNodeId;

  // Fetch automation canvas data on mount
  useEffect(() => {
    dispatch(fetchAutomation());
  }, [dispatch]);

  // Handle adding a new generic node with sensible positioning
  const handleAddNode = useCallback(() => {
    // Calculate a sensible starting position
    const nodeCount = nodes.length;
    const col = nodeCount % 3;
    const row = Math.floor(nodeCount / 3);
    const startX = 140 + col * 320;
    const startY = 120 + row * 180;

    dispatch(
      createNode({
        text: "",
        position: { x: startX, y: startY },
      })
    );
  }, [dispatch, nodes.length]);

  // Handle live node movement (synchronous in Redux for smooth rendering)
  const handleMoveNode = useCallback(
    (id, x, y) => {
      dispatch(moveNodeLocal({ id, nodeId: id, x, y, position: { x, y } }));
    },
    [dispatch]
  );

  // Handle persisting final node position to server
  const handleSaveNodePosition = useCallback(
    (id, x, y) => {
      dispatch(updateNodePosition({ id, nodeId: id, position: { x, y } }));
    },
    [dispatch]
  );

  // Handle node selection
  const handleSelectNode = useCallback(
    (id) => {
      dispatch(setSelectedNode(id));
    },
    [dispatch]
  );

  // Handle opening node text editor
  const handleOpenEdit = useCallback(
    (id) => {
      dispatch(openEditModal(id));
    },
    [dispatch]
  );

  // Handle closing node text editor
  const handleCloseEdit = useCallback(() => {
    dispatch(closeEditModal());
  }, [dispatch]);

  // Handle saving node text
  const handleSaveNodeText = useCallback(
    async (id, text) => {
      await dispatch(updateNodeText({ id, text })).unwrap();
    },
    [dispatch]
  );

  // Handle deleting a node
  const handleDeleteNode = useCallback(
    (id) => {
      dispatch(deleteNode(id));
    },
    [dispatch]
  );

  // Handle connecting two nodes
  const handleConnect = useCallback(
    (source, target) => {
      dispatch(addEdge({ source, target }));
    },
    [dispatch]
  );

  // Handle deleting a connection
  const handleDeleteEdge = useCallback(
    (edgeId) => {
      dispatch(removeEdge(edgeId));
    },
    [dispatch]
  );

  const activeEditingNode = nodes.find((n) => n.id === currentEditId);

  return (
    <div
      className="page-pad ai-automation-page"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: "calc(100vh - 40px)",
        padding: "16px 20px 20px 20px",
        overflow: "hidden",
      }}
    >
      {/* Top Header Bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: "#FFFFFF",
              color: "#0081FB",
              border: "1px solid #E2E8F0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow:
                "0 2px 6px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
            }}
          >
            <Workflow size={20} />
          </div>
          <div>
            <h1
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#0F172A",
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              AI Automation
            </h1>
            <p
              style={{
                fontSize: "12.5px",
                color: "#64748B",
                margin: 0,
                marginTop: 2,
              }}
            >
              Create, arrange, and connect custom automation nodes on an open canvas
            </p>
          </div>
        </div>

        {/* Action Controls & Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Node & Connection Counts */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "#64748B",
              backgroundColor: "#FFFFFF",
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #E2E8F0",
            }}
          >
            <span>
              <strong style={{ color: "#0F172A" }}>{nodes.length}</strong>{" "}
              {nodes.length === 1 ? "Node" : "Nodes"}
            </span>
            <span style={{ color: "#CBD5E1" }}>•</span>
            <span>
              <strong style={{ color: "#0F172A" }}>{edges.length}</strong>{" "}
              {edges.length === 1 ? "Connection" : "Connections"}
            </span>
          </div>

          {/* Sync / Save Status Indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color:
                saveStatus === "saving"
                  ? "#0081FB"
                  : saveStatus === "error"
                  ? "#EF4444"
                  : "#10B981",
              backgroundColor: "#FFFFFF",
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #E2E8F0",
            }}
          >
            {saveStatus === "saving" ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : saveStatus === "error" ? (
              <>
                <AlertCircle size={13} />
                <span>Sync Error</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={13} />
                <span>Saved to cloud</span>
              </>
            )}
          </div>

          {/* Add Node Button */}
          <button
            type="button"
            onClick={handleAddNode}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              backgroundColor: "#0081FB",
              color: "#FFFFFF",
              fontSize: "13px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(0, 129, 251, 0.25)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = "#006FD0";
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = "#0081FB";
            }}
          >
            <Plus size={16} />
            Add Node
          </button>
        </div>
      </header>

      {/* Main Canvas Area */}
      <div
        style={{
          flex: 1,
          position: "relative",
          borderRadius: 14,
          border: "1px solid #E2E8F0",
          backgroundColor: "#FFFFFF",
          overflow: "hidden",
          boxShadow:
            "0 1px 3px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03)",
        }}
      >
        {loading && nodes.length === 0 ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              backgroundColor: "#FAFBFD",
              zIndex: 50,
            }}
          >
            <Loader2 size={28} className="animate-spin" color="#0081FB" />
            <span style={{ fontSize: 13, color: "#64748B" }}>
              Loading AI Automation Canvas...
            </span>
          </div>
        ) : (
          <AiAutomationCanvas
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
            onOpenEdit={handleOpenEdit}
            onMoveNode={handleMoveNode}
            onSaveNodePosition={handleSaveNodePosition}
            onDeleteNode={handleDeleteNode}
            onConnect={handleConnect}
            onDeleteEdge={handleDeleteEdge}
            onAddNode={handleAddNode}
          />
        )}
      </div>

      {/* Node Text Editing Modal */}
      <NodeTextEditorModal
        isOpen={modalOpen}
        node={activeEditingNode}
        isSaving={saving || saveStatus === "saving"}
        onClose={handleCloseEdit}
        onSave={handleSaveNodeText}
      />
    </div>
  );
};

export default AiAutomation;
