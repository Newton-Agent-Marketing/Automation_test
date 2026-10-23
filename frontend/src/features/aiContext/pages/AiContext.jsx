import { useEffect } from "react";
import {
  Save,
  RotateCcw,
  Sparkles,
  Network,
  Check,
  RefreshCw,
  Info,
  Plus,
} from "lucide-react";
import { useAiContext } from "../hook/useAiContext";
import { AiContextCanvas } from "../components/AiContextCanvas";
import { NodeDetailDrawer } from "../components/NodeDetailDrawer";
import { motion, AnimatePresence } from "framer-motion";

export const AiContext = () => {
  const {
    nodes,
    edges,
    selectedNodeId,
    pickerAnchorNodeId,
    drawerNodeId,
    validationAlert,
    loading,
    saving,
    error,
    successMessage,
    loadContext,
    saveCurrentContext,
    resetCurrentContext,
    selectNode,
    openPicker,
    closePicker,
    openDrawer,
    closeDrawer,
    dismissAlert,
    dismissMessages,
    moveNode,
    editNode,
    removeNode,
    addStartNode,
    addNodeToCanvas,
  } = useAiContext();

  useEffect(() => {
    loadContext();
    const params = new URLSearchParams(window.location.search);
    if (params.get("drive_connected") || params.get("drive_oauth_success")) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Auto-dismiss success notification banner after 3 seconds
  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => {
      dismissMessages();
    }, 3000);
    return () => clearTimeout(timer);
  }, [successMessage, dismissMessages]);

  // Auto-dismiss error notification banner after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      dismissMessages();
    }, 5000);
    return () => clearTimeout(timer);
  }, [error, dismissMessages]);

  const activeDrawerNode = nodes.find((n) => n.id === drawerNodeId);

  const handleSave = async () => {
    try {
      await saveCurrentContext({ nodes, edges });
    } catch (err) {
      console.error("[Save Context Error]:", err);
    }
  };

  const handleSaveNodeDetails = async (id, updatedData) => {
    // 1. Immediately update Redux store
    editNode(id, updatedData);

    // 2. Build full updated nodes list and persist to MongoDB
    const updatedNodes = nodes.map((n) => {
      if (n.id === id) {
        const nextData = {
          ...(n.data || {}),
          ...(updatedData.data || {}),
        };
        if (updatedData.contextTag !== undefined) {
          nextData.contextTag = updatedData.contextTag;
        }
        return {
          ...n,
          label: updatedData.label !== undefined ? updatedData.label : n.label,
          subtitle: updatedData.subtitle !== undefined ? updatedData.subtitle : n.subtitle,
          contextTag: updatedData.contextTag !== undefined ? updatedData.contextTag : n.contextTag,
          data: nextData,
        };
      }
      return n;
    });

    try {
      await saveCurrentContext({ nodes: updatedNodes, edges });
    } catch (err) {
      console.error("[Auto Save Node To Database Error]:", err);
    }
  };

  const handleReset = async () => {
    if (window.confirm("Reset AI Context canvas back to initial Customer START node?")) {
      await resetCurrentContext();
    }
  };

  return (
    <div
      className="page-pad ai-context-page"
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
              color: "#0F172A",
              border: "1px solid #E2E8F0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
            }}
          >
            <Network size={20} />
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
              AI Context Canvas
            </h1>
            <p
              style={{
                fontSize: "12.5px",
                color: "#64748B",
                margin: 0,
                marginTop: 2,
              }}
            >
              Build your hierarchical business, channel, and product graph for autonomous AI execution
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={addStartNode}
            disabled={loading || saving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 8,
              border: "1px solid #E2E8F0",
              backgroundColor: "#FFFFFF",
              color: "#0F172A",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#F8FAFC";
              e.currentTarget.style.borderColor = "#CBD5E1";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#FFFFFF";
              e.currentTarget.style.borderColor = "#E2E8F0";
            }}
            title="Add a new Start Context node with your registered account"
          >
            <Plus size={14} strokeWidth={2.5} />
            New Context Flow
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={loading || saving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 13px",
              borderRadius: 8,
              border: "1px solid #E2E8F0",
              backgroundColor: "#FFFFFF",
              color: "#64748B",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#F8FAFC";
              e.currentTarget.style.color = "#0F172A";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#FFFFFF";
              e.currentTarget.style.color = "#64748B";
            }}
          >
            <RotateCcw size={14} />
            Reset Flow
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 16px",
              borderRadius: 8,
              border: "none",
              backgroundColor: "#0F172A",
              color: "#FFFFFF",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(15, 23, 42, 0.12)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#1E293B";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#0F172A";
            }}
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="spin" style={{ animation: "spin 1s linear infinite" }} />
                Saving...
              </>
            ) : (
              <>
                <Save size={14} />
                Save Context Flow
              </>
            )}
          </button>
        </div>
      </header>

      {/* Info / Success / Error Banners */}
      <AnimatePresence>
        {(successMessage || error) && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              marginBottom: 10,
              fontSize: "12px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: error ? "#FEF2F2" : "#EFF6FF",
              color: error ? "#991B1B" : "#1D4ED8",
              border: `1px solid ${error ? "#FECACA" : "#BFDBFE"}`,
              overflow: "hidden",
            }}
          >
            <span>{error || successMessage}</span>
            <button
              type="button"
              onClick={dismissMessages}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "11px" }}
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Canvas Box */}
      <div
        style={{
          position: "relative",
          flex: 1,
          width: "100%",
          borderRadius: 14,
          border: "1.5px solid #E2E8F0",
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(15, 23, 42, 0.05)",
        }}
      >
        <AiContextCanvas
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          pickerAnchorNodeId={pickerAnchorNodeId}
          validationAlert={validationAlert}
          onSelectNode={selectNode}
          onOpenPicker={openPicker}
          onClosePicker={closePicker}
          onOpenDrawer={openDrawer}
          onAddNode={addNodeToCanvas}
          onMoveNode={moveNode}
          onDeleteNode={removeNode}
          onDismissAlert={dismissAlert}
        />

        {/* Settings Drawer */}
        {activeDrawerNode && (
          <NodeDetailDrawer
            node={activeDrawerNode}
            onSave={handleSaveNodeDetails}
            onDelete={removeNode}
            onClose={closeDrawer}
          />
        )}
      </div>
    </div>
  );
};

export default AiContext;
