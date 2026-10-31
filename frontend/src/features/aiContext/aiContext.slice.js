import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiContextApi } from "./service/aiContext.api";
import { getErrorMessage } from "../../lib/api";

export const ALLOWED_CONNECTIONS = {
  user_input: ["business_unit"],
  business_unit: ["ad_channel", "marketing_brief", "product", "data_warehouse"],
  ad_channel: ["marketing_brief", "product", "data_warehouse"],
  marketing_brief: ["ad_channel", "product", "data_warehouse"],
  product: ["ad_channel", "marketing_brief", "data_warehouse"],
  data_warehouse: ["ad_channel", "marketing_brief", "product"],
};

export const NODE_TYPE_INFO = {
  user_input: {
    type: "user_input",
    title: "USER INPUT",
    badge: "START",
    category: "Start",
    color: "#2563EB",
    bg: "#EFF6FF",
    border: "#BFDBFE",
    icon: "user",
    description: "Registered Customer & Workspace Owner",
    defaultNext: "business_unit",
  },
  business_unit: {
    type: "business_unit",
    title: "Business Unit",
    badge: "ORG",
    category: "Structure",
    color: "#2563EB",
    bg: "#EFF6FF",
    border: "#BFDBFE",
    icon: "building",
    description: "Core brand entity, region, or operating division",
    defaultNext: "ad_channel",
  },
  ad_channel: {
    type: "ad_channel",
    title: "Ad Channel",
    badge: "CHANNEL",
    category: "Distribution",
    color: "#2563EB",
    bg: "#EFF6FF",
    border: "#BFDBFE",
    icon: "megaphone",
    description: "Meta Ads, Google Ads, TikTok, or multi-platform network",
    defaultNext: "marketing_brief",
  },
  marketing_brief: {
    type: "marketing_brief",
    title: "Marketing Brief",
    badge: "BRIEF",
    category: "Strategy",
    color: "#2563EB",
    bg: "#EFF6FF",
    border: "#BFDBFE",
    icon: "file-text",
    description: "Target audience, value proposition, hooks & campaign objectives",
    defaultNext: "product",
  },
  product: {
    type: "product",
    title: "Product",
    badge: "OFFERING",
    category: "Inventory",
    color: "#2563EB",
    bg: "#EFF6FF",
    border: "#BFDBFE",
    icon: "package",
    description: "SKU catalog, pricing tiers, and landing page URLs",
    defaultNext: "data_warehouse",
  },
  data_warehouse: {
    type: "data_warehouse",
    title: "Data Warehouse",
    badge: "STORAGE",
    category: "Analytics",
    color: "#2563EB",
    bg: "#EFF6FF",
    border: "#BFDBFE",
    icon: "database",
    description: "Snowflake, BigQuery, PostgreSQL, or analytical metrics sink",
    defaultNext: null,
  },
};

export const ALLOWED_NEW_NODES = [
  {
    type: "business_unit",
    title: "Business Unit",
    badge: "ORG",
    desc: "Organization division, brand, or regional department",
    icon: "building",
    color: "#2563EB",
  },
  {
    type: "ad_channel",
    title: "Ad Channel",
    badge: "CHANNEL",
    desc: "Advertising network (Meta Ads, Google, TikTok)",
    icon: "megaphone",
    color: "#2563EB",
  },
  {
    type: "marketing_brief",
    title: "Marketing Brief",
    badge: "BRIEF",
    desc: "Core campaign guidelines, audience target, and value hooks",
    icon: "file-text",
    color: "#2563EB",
  },
  {
    type: "product",
    title: "Product",
    badge: "OFFERING",
    desc: "Catalog item, service tier, product landing page",
    icon: "package",
    color: "#2563EB",
  },
  {
    type: "data_warehouse",
    title: "Data Warehouse",
    badge: "STORAGE",
    desc: "Cloud analytical storage, BigQuery, or reporting database",
    icon: "database",
    color: "#2563EB",
  },
];

export const fetchAiContext = createAsyncThunk(
  "aiContext/fetch",
  async (_, { rejectWithValue }) => {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await aiContextApi.getContext();
        return response.data.data;
      } catch (err) {
        lastError = err;
        const isNetworkErr =
          !err.response ||
          err.code === "ERR_NETWORK" ||
          err.code === "ECONNABORTED" ||
          String(err.message || "").toLowerCase().includes("network") ||
          String(err.message || "").toLowerCase().includes("lost");
        if (isNetworkErr && attempt < 3) {
          await new Promise((res) => setTimeout(res, 1200 * attempt));
          continue;
        }
        break;
      }
    }
    return rejectWithValue(getErrorMessage(lastError, "Failed to load AI Context"));
  }
);

export const saveAiContext = createAsyncThunk(
  "aiContext/save",
  async (payload, { rejectWithValue }) => {
    try {
      const response = await aiContextApi.saveContext(payload);
      return response.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to save AI Context"));
    }
  }
);

export const resetAiContext = createAsyncThunk(
  "aiContext/reset",
  async (_, { rejectWithValue }) => {
    try {
      const response = await aiContextApi.resetContext();
      return response.data.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to reset AI Context"));
    }
  }
);

export const deleteNodeAsync = createAsyncThunk(
  "aiContext/deleteNodeAsync",
  async (nodeId, { getState, rejectWithValue }) => {
    try {
      const state = getState().aiContext;
      const response = await aiContextApi.deleteNode(nodeId, {
        nodes: state.nodes,
        edges: state.edges,
      });
      return response.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to delete node"));
    }
  }
);

const initialState = {
  contextId: null,
  name: "Primary AI Context Workflow",
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedNodeId: null,
  pickerAnchorNodeId: null,
  drawerNodeId: null,
  loading: false,
  saving: false,
  error: null,
  successMessage: null,
  validationAlert: null, // { message: string, sourceLabel: string, targetLabel: string }
};

const aiContextSlice = createSlice({
  name: "aiContext",
  initialState,
  reducers: {
    setSelectedNodeId: (state, action) => {
      state.selectedNodeId = action.payload;
    },
    setPickerAnchorNodeId: (state, action) => {
      state.pickerAnchorNodeId = action.payload;
    },
    setDrawerNodeId: (state, action) => {
      state.drawerNodeId = action.payload;
    },
    clearValidationAlert: (state) => {
      state.validationAlert = null;
    },
    clearMessages: (state) => {
      state.successMessage = null;
      state.error = null;
    },
    updateViewport: (state, action) => {
      state.viewport = { ...state.viewport, ...action.payload };
    },
    updateNodePosition: (state, action) => {
      const { id, x, y } = action.payload;
      const node = state.nodes.find((n) => n.id === id);
      if (node) {
        node.position = { x, y };
      }
    },
    updateNodeData: (state, action) => {
      const { id, label, subtitle, contextTag, data } = action.payload;
      const node = state.nodes.find((n) => n.id === id);
      if (node) {
        if (label !== undefined) node.label = label;
        if (subtitle !== undefined) node.subtitle = subtitle;
        if (contextTag !== undefined) {
          node.contextTag = contextTag;
          if (!node.data) node.data = {};
          node.data.contextTag = contextTag;
        }
        if (data !== undefined) node.data = { ...node.data, ...data };
      }
    },
    deleteNode: (state, action) => {
      const nodeId = action.payload;
      const nodeToDelete = state.nodes.find((n) => n.id === nodeId);
      const rootCount = state.nodes.filter((n) => n.isRoot || n.type === "user_input").length;
      if (nodeToDelete && (nodeToDelete.isRoot || nodeToDelete.type === "user_input") && rootCount <= 1) {
        return; // Cannot delete the only remaining root node
      }

      // Find incoming parents and outgoing children of the deleted node
      const parentEdges = state.edges.filter((e) => e.target === nodeId);
      const childEdges = state.edges.filter((e) => e.source === nodeId);

      // Create bridge edges reconnecting parents directly to children
      const bridgeEdges = [];
      parentEdges.forEach((pe) => {
        childEdges.forEach((ce) => {
          if (pe.source !== ce.target) {
            bridgeEdges.push({
              id: `edge-${pe.source}-${ce.target}`,
              source: pe.source,
              target: ce.target,
              sourceHandle: "right",
              targetHandle: "left",
              label: "",
            });
          }
        });
      });

      // Filter out node and direct connected edges, then append bridge edges
      const remainingEdges = state.edges
        .filter((e) => e.source !== nodeId && e.target !== nodeId)
        .concat(bridgeEdges);

      // Deduplicate edges
      const edgeSet = new Set();
      const cleanEdges = [];
      for (const e of remainingEdges) {
        const key = `${e.source}->${e.target}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          cleanEdges.push(e);
        }
      }

      state.nodes = state.nodes.filter((n) => n.id !== nodeId);
      state.edges = cleanEdges;

      // Re-synchronize lineage on remaining nodes
      const nodeMap = new Map();
      state.nodes.forEach((n) => nodeMap.set(n.id, n));

      state.nodes.forEach((n) => {
        const incomingEdge = cleanEdges.find((e) => e.target === n.id);
        const parent = incomingEdge ? nodeMap.get(incomingEdge.source) : null;
        n.previousNodeId = parent ? parent.id : null;
        n.previousNodeLabel = parent ? (parent.label || parent.data?.name || parent.type) : null;
        n.previousNodeType = parent ? parent.type : null;
        n.stepIndex = parent ? (parent.stepIndex || 1) + 1 : 1;
        if (n.data) {
          n.data.previousNode = parent
            ? { id: parent.id, type: parent.type, label: parent.label || parent.data?.name || parent.type }
            : null;
        }
      });

      if (state.selectedNodeId === nodeId) state.selectedNodeId = null;
      if (state.drawerNodeId === nodeId) state.drawerNodeId = null;
    },
    addStartContextNode: (state, action) => {
      const userName = action.payload?.userName || "Customer User";
      const startNodes = state.nodes.filter((n) => n.isRoot || n.type === "user_input");
      const contextIndex = startNodes.length + 1;
      const lastNode = state.nodes[state.nodes.length - 1];
      const nextX = lastNode ? (lastNode.position?.x || 100) + 320 : 100 + startNodes.length * 320;
      const nextY = 50;

      const newRootId = `root-node-${Date.now().toString().slice(-6)}`;
      const newRoot = {
        id: newRootId,
        type: "user_input",
        label: userName,
        subtitle: `Context Flow #${contextIndex}`,
        contextTag: `Context #${contextIndex}`,
        isRoot: true,
        stepIndex: 1,
        position: { x: nextX, y: nextY },
        data: {
          name: userName,
          contextTag: `Context #${contextIndex}`,
          description: `Marketing Context Flow #${contextIndex} for ${userName}`,
        },
      };

      state.nodes.push(newRoot);
      state.selectedNodeId = newRootId;
    },
    addNodeFromPicker: (state, action) => {
      const { sourceNodeId, nodeType } = action.payload;
      const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);

      if (!sourceNode) return;

      const allowedTargets = ALLOWED_CONNECTIONS[sourceNode.type] || [];
      const sourceInfo = NODE_TYPE_INFO[sourceNode.type] || { title: sourceNode.type };
      const targetInfo = NODE_TYPE_INFO[nodeType] || { title: nodeType };

      // Flow Validation Rule Enforcement
      if (!allowedTargets.includes(nodeType)) {
        const expectedNext = allowedTargets
          .map((t) => NODE_TYPE_INFO[t]?.title || t)
          .join(" or ") || "No further connections allowed";

        state.validationAlert = {
          message: `Invalid Connection Flow: "${sourceInfo.title}" can only connect to "${expectedNext}". Connecting directly to "${targetInfo.title}" is not allowed.`,
          sourceLabel: sourceInfo.title,
          targetLabel: targetInfo.title,
          timestamp: Date.now(),
        };
        state.pickerAnchorNodeId = null;
        return;
      }

      // Calculate new node position nicely spaced downwards in vertical tree structure
      const siblingEdges = state.edges.filter((e) => e.source === sourceNodeId);
      const siblingCount = siblingEdges.length;
      const horizontalSpread = 280;
      const verticalSpacing = 160;

      // Tree branching: first child directly below, subsequent siblings spread left/right
      let offsetX = 0;
      if (siblingCount > 0) {
        const isRight = siblingCount % 2 === 1;
        const multiplier = Math.ceil(siblingCount / 2);
        offsetX = (isRight ? 1 : -1) * multiplier * horizontalSpread;
      }

      const newX = (sourceNode.position?.x || 300) + offsetX;
      const newY = (sourceNode.position?.y || 100) + verticalSpacing;

      const parentTag =
        sourceNode.contextTag ||
        sourceNode.data?.contextTag ||
        state.name ||
        "Primary Marketing Context";
      const parentStep = sourceNode.stepIndex || 1;

      const defaultDataForType = {
        user_input: {},
        business_unit: { division: "E-Commerce", region: "Global" },
        ad_channel: { channel: "Meta Ads", objective: "OUTCOME_SALES" },
        marketing_brief: {
          objective: "OUTCOME_SALES",
          dailyBudget: 500,
          targetAudience: "",
          description: "",
        },
        product: {
          productName: "Featured Product",
          productPrice: 999,
          productUrl: "https://example.com/item",
          products: [],
          catalogCount: 0,
        },
        data_warehouse: { databasePlatform: "BigQuery" },
      };

      const newNodeId = `node-${nodeType}-${Date.now().toString().slice(-5)}`;
      const newNode = {
        id: newNodeId,
        type: nodeType,
        label: targetInfo.title,
        subtitle: targetInfo.description,
        contextTag: parentTag,
        previousNodeId: sourceNode.id,
        previousNodeLabel: sourceNode.label || sourceNode.data?.name || sourceInfo.title,
        previousNodeType: sourceNode.type,
        stepIndex: parentStep + 1,
        isRoot: false,
        position: { x: newX, y: newY },
        data: {
          name: `${targetInfo.title} ${state.nodes.filter((n) => n.type === nodeType).length + 1}`,
          description: targetInfo.description,
          contextTag: parentTag,
          channel: "Meta Ads",
          objective: "OUTCOME_SALES",
          dailyBudget: 500,
          ...(defaultDataForType[nodeType] || {}),
          config: {},
        },
      };

      const newEdge = {
        id: `edge-${sourceNodeId}-${newNodeId}`,
        source: sourceNodeId,
        target: newNodeId,
        sourceHandle: "right",
        targetHandle: "left",
        label: "",
      };

      state.nodes.push(newNode);
      state.edges.push(newEdge);
      state.selectedNodeId = newNodeId;
      state.pickerAnchorNodeId = null;
      state.validationAlert = null;
    },
    connectNodes: (state, action) => {
      const { sourceId, targetId } = action.payload;
      if (sourceId === targetId) return;

      const sourceNode = state.nodes.find((n) => n.id === sourceId);
      const targetNode = state.nodes.find((n) => n.id === targetId);
      if (!sourceNode || !targetNode) return;

      const allowedTargets = ALLOWED_CONNECTIONS[sourceNode.type] || [];
      const sourceInfo = NODE_TYPE_INFO[sourceNode.type] || { title: sourceNode.type };
      const targetInfo = NODE_TYPE_INFO[targetNode.type] || { title: targetNode.type };

      if (!allowedTargets.includes(targetNode.type)) {
        const expectedNext = allowedTargets
          .map((t) => NODE_TYPE_INFO[t]?.title || t)
          .join(" or ") || "None";

        state.validationAlert = {
          message: `Invalid Connection: "${sourceInfo.title}" cannot connect to "${targetInfo.title}". Expected "${expectedNext}".`,
          sourceLabel: sourceInfo.title,
          targetLabel: targetInfo.title,
          timestamp: Date.now(),
        };
        return;
      }

      // Update target node previous lineage
      targetNode.previousNodeId = sourceNode.id;
      targetNode.previousNodeLabel = sourceNode.label || sourceNode.data?.name || sourceInfo.title;
      targetNode.previousNodeType = sourceNode.type;
      targetNode.stepIndex = (sourceNode.stepIndex || 1) + 1;
      targetNode.contextTag =
        sourceNode.contextTag || sourceNode.data?.contextTag || targetNode.contextTag;

      // Check if edge already exists
      const existing = state.edges.find((e) => e.source === sourceId && e.target === targetId);
      if (!existing) {
        state.edges.push({
          id: `edge-${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          sourceHandle: "right",
          targetHandle: "left",
          label: "",
        });
      }
    },
    removeEdge: (state, action) => {
      const edgeId = action.payload;
      state.edges = state.edges.filter((e) => e.id !== edgeId);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAiContext.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAiContext.fulfilled, (state, action) => {
        state.loading = false;
        state.contextId = action.payload?._id;
        state.name = action.payload?.name || "Primary AI Context Workflow";
        state.nodes = action.payload?.nodes || [];
        state.edges = action.payload?.edges || [];
        state.viewport = action.payload?.viewport || { x: 0, y: 0, zoom: 1 };
      })
      .addCase(fetchAiContext.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(saveAiContext.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(saveAiContext.fulfilled, (state, action) => {
        state.saving = false;
        state.successMessage = action.payload?.message || "AI Context saved successfully!";
      })
      .addCase(saveAiContext.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload;
      })
      .addCase(resetAiContext.fulfilled, (state, action) => {
        state.nodes = action.payload?.nodes || [];
        state.edges = action.payload?.edges || [];
        state.selectedNodeId = null;
        state.drawerNodeId = null;
        state.pickerAnchorNodeId = null;
        state.successMessage = "AI Context reset to default root node";
      })
      .addCase(deleteNodeAsync.pending, (state, action) => {
        const nodeId = action.meta.arg;
        const nodeToDelete = state.nodes.find((n) => n.id === nodeId);
        const rootCount = state.nodes.filter((n) => n.isRoot || n.type === "user_input").length;
        if (nodeToDelete && (nodeToDelete.isRoot || nodeToDelete.type === "user_input") && rootCount <= 1) {
          return;
        }

        const parentEdges = state.edges.filter((e) => e.target === nodeId);
        const childEdges = state.edges.filter((e) => e.source === nodeId);

        const bridgeEdges = [];
        parentEdges.forEach((pe) => {
          childEdges.forEach((ce) => {
            if (pe.source !== ce.target) {
              bridgeEdges.push({
                id: `edge-${pe.source}-${ce.target}`,
                source: pe.source,
                target: ce.target,
                sourceHandle: "right",
                targetHandle: "left",
                label: "",
              });
            }
          });
        });

        const remainingEdges = state.edges
          .filter((e) => e.source !== nodeId && e.target !== nodeId)
          .concat(bridgeEdges);

        const edgeSet = new Set();
        const cleanEdges = [];
        for (const e of remainingEdges) {
          const key = `${e.source}->${e.target}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            cleanEdges.push(e);
          }
        }

        state.nodes = state.nodes.filter((n) => n.id !== nodeId);
        state.edges = cleanEdges;

        const nodeMap = new Map();
        state.nodes.forEach((n) => nodeMap.set(n.id, n));

        state.nodes.forEach((n) => {
          const incomingEdge = cleanEdges.find((e) => e.target === n.id);
          const parent = incomingEdge ? nodeMap.get(incomingEdge.source) : null;
          n.previousNodeId = parent ? parent.id : null;
          n.previousNodeLabel = parent ? (parent.label || parent.data?.name || parent.type) : null;
          n.previousNodeType = parent ? parent.type : null;
          n.stepIndex = parent ? (parent.stepIndex || 1) + 1 : 1;
          if (n.data) {
            n.data.previousNode = parent
              ? { id: parent.id, type: parent.type, label: parent.label || parent.data?.name || parent.type }
              : null;
          }
        });

        if (state.selectedNodeId === nodeId) state.selectedNodeId = null;
        if (state.drawerNodeId === nodeId) state.drawerNodeId = null;
        state.error = null;
      })
      .addCase(deleteNodeAsync.fulfilled, (state, action) => {
        const deletedId = action.payload?.data?.nodeId || action.meta.arg;
        const incomingNodes = action.payload?.data?.nodes;
        const incomingEdges = action.payload?.data?.edges;

        if (Array.isArray(incomingNodes) && incomingNodes.length > 0) {
          state.nodes = incomingNodes;
        } else {
          state.nodes = state.nodes.filter((n) => n.id !== deletedId);
        }

        if (Array.isArray(incomingEdges)) {
          state.edges = incomingEdges;
        }
        if (state.selectedNodeId === deletedId) state.selectedNodeId = null;
        if (state.drawerNodeId === deletedId) state.drawerNodeId = null;
        state.error = null;
      })
      .addCase(deleteNodeAsync.rejected, (state, action) => {
        // Clear errors gracefully
        state.error = null;
      });
  },
});

export const {
  setSelectedNodeId,
  setPickerAnchorNodeId,
  setDrawerNodeId,
  clearValidationAlert,
  clearMessages,
  updateViewport,
  updateNodePosition,
  updateNodeData,
  deleteNode,
  addStartContextNode,
  addNodeFromPicker,
  connectNodes,
  removeEdge,
} = aiContextSlice.actions;

export default aiContextSlice.reducer;
