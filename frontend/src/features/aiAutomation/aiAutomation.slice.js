import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiAutomationApi } from "./service/aiAutomation.api";
import { getErrorMessage } from "../../lib/api";

export const fetchAutomation = createAsyncThunk(
  "aiAutomation/fetchAutomation",
  async (_, { rejectWithValue }) => {
    try {
      const res = await aiAutomationApi.getAutomation();
      return res.data.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to load automation canvas"));
    }
  }
);

export const saveAutomation = createAsyncThunk(
  "aiAutomation/saveAutomation",
  async (payload, { getState, rejectWithValue }) => {
    try {
      const state = getState().aiAutomation;
      const dataToSave = payload || {
        name: state.name,
        nodes: state.nodes,
        edges: state.edges,
      };
      const res = await aiAutomationApi.saveAutomation(dataToSave);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to save automation canvas"));
    }
  }
);

export const createNode = createAsyncThunk(
  "aiAutomation/createNode",
  async ({ type = "generic", label, text = "", config, position }, { rejectWithValue }) => {
    try {
      const payload = {
        type,
        label,
        text,
        config,
        position: position || { x: 300, y: 180 },
      };
      const res = await aiAutomationApi.addNode(payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to add node"));
    }
  }
);

export const updateNodeText = createAsyncThunk(
  "aiAutomation/updateNodeText",
  async ({ nodeId, id, text }, { rejectWithValue }) => {
    const targetId = nodeId || id;
    try {
      const res = await aiAutomationApi.updateNode(targetId, { text });
      return { nodeId: targetId, text, data: res.data.data };
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to update node text"));
    }
  }
);

export const updateNodeConfig = createAsyncThunk(
  "aiAutomation/updateNodeConfig",
  async ({ nodeId, id, config, label, status = "configured" }, { rejectWithValue }) => {
    const targetId = nodeId || id;
    try {
      const res = await aiAutomationApi.updateNode(targetId, { config, label, status });
      return { nodeId: targetId, config, label, status, data: res.data.data };
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to update node configuration"));
    }
  }
);

export const updateNodePosition = createAsyncThunk(
  "aiAutomation/updateNodePosition",
  async ({ nodeId, id, position }, { rejectWithValue }) => {
    const targetId = nodeId || id;
    try {
      const res = await aiAutomationApi.updateNode(targetId, { position });
      return { nodeId: targetId, position, data: res.data.data };
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to update node position"));
    }
  }
);

export const deleteNode = createAsyncThunk(
  "aiAutomation/deleteNode",
  async (nodeId, { rejectWithValue }) => {
    try {
      await aiAutomationApi.deleteNode(nodeId);
      return { nodeId };
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to delete node"));
    }
  }
);

export const addEdge = createAsyncThunk(
  "aiAutomation/addEdge",
  async ({ source, target, sourceHandle, targetHandle }, { rejectWithValue }) => {
    try {
      const res = await aiAutomationApi.createEdge({
        source,
        target,
        sourceHandle: sourceHandle || "right",
        targetHandle: targetHandle || "left",
      });
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to create connection"));
    }
  }
);

export const removeEdge = createAsyncThunk(
  "aiAutomation/removeEdge",
  async (edgeId, { rejectWithValue }) => {
    try {
      await aiAutomationApi.deleteEdge(edgeId);
      return { edgeId };
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to delete connection"));
    }
  }
);

export const validateAutomation = createAsyncThunk(
  "aiAutomation/validateAutomation",
  async (_, { rejectWithValue }) => {
    try {
      const res = await aiAutomationApi.validate();
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Validation failed"));
    }
  }
);

export const toggleActiveAutomation = createAsyncThunk(
  "aiAutomation/toggleActiveAutomation",
  async (_, { rejectWithValue }) => {
    try {
      const res = await aiAutomationApi.toggleActive();
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to toggle activation status"));
    }
  }
);

export const runNowAutomation = createAsyncThunk(
  "aiAutomation/runNowAutomation",
  async (_, { rejectWithValue }) => {
    try {
      const res = await aiAutomationApi.runNow();
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Run failed"));
    }
  }
);

export const fetchExecutionHistory = createAsyncThunk(
  "aiAutomation/fetchExecutionHistory",
  async (_, { rejectWithValue }) => {
    try {
      const res = await aiAutomationApi.getHistory();
      return res.data.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to load history"));
    }
  }
);

export function computeNodeSequences(nodes, edges) {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes;

  const rootNode = nodes.find((n) => n.type === "trigger") || nodes[0];
  const stepMap = new Map();
  stepMap.set(rootNode.id, 1);

  const queue = [rootNode.id];
  const visited = new Set([rootNode.id]);

  while (queue.length > 0) {
    const currentId = queue.shift();
    const currentStep = stepMap.get(currentId);

    const outgoing = (edges || []).filter((e) => e.source === currentId);
    for (const edge of outgoing) {
      if (!visited.has(edge.target)) {
        visited.add(edge.target);
        stepMap.set(edge.target, currentStep + 1);
        queue.push(edge.target);
      }
    }
  }

  for (const node of nodes) {
    const step = stepMap.get(node.id);
    if (step !== undefined) {
      node.stepNumber = step;
      node.sequenceLabel = `node${step}`;
    } else {
      node.stepNumber = null;
      node.sequenceLabel = "node_";
    }
  }

  return nodes;
}

const initialState = {
  loading: false,
  saving: false,
  isRunning: false,
  automationId: null,
  name: "AI Automation Workspace",
  isActive: false,
  lastRunAt: null,
  nextRunAt: null,
  nodes: [],
  edges: [],
  executionHistory: [],
  validationErrors: [],
  connectionAlert: null,
  selectedNodeId: null,
  editingNodeId: null,
  activeEditingNodeId: null,
  editingNodeText: "",
  isEditingModalOpen: false,
  isEditModalOpen: false,
  isDetailsDrawerOpen: false,
  activeDetailsNodeId: null,
  error: null,
  successMessage: null,
};

const aiAutomationSlice = createSlice({
  name: "aiAutomation",
  initialState,
  reducers: {
    moveNodeLocal: (state, action) => {
      const targetId = action.payload.id || action.payload.nodeId;
      const x =
        action.payload.x !== undefined
          ? action.payload.x
          : action.payload.position?.x;
      const y =
        action.payload.y !== undefined
          ? action.payload.y
          : action.payload.position?.y;

      if (typeof x === "number" && typeof y === "number" && !isNaN(x) && !isNaN(y)) {
        const node = state.nodes.find((n) => n.id === targetId);
        if (node) {
          node.position = { x: Math.round(x), y: Math.round(y) };
        }
      }
    },
    selectNode: (state, action) => {
      state.selectedNodeId = action.payload;
    },
    openEditModal: (state, action) => {
      const nodeId = action.payload;
      const node = state.nodes.find((n) => n.id === nodeId);
      if (node) {
        state.selectedNodeId = nodeId;
        state.editingNodeId = nodeId;
        state.activeEditingNodeId = nodeId;
        state.editingNodeText = node.text || "";
        state.isEditingModalOpen = true;
        state.isEditModalOpen = true;
      }
    },
    closeEditModal: (state) => {
      state.isEditingModalOpen = false;
      state.isEditModalOpen = false;
      state.editingNodeId = null;
      state.activeEditingNodeId = null;
      state.editingNodeText = "";
    },
    openDetailsDrawer: (state, action) => {
      const nodeId = action.payload;
      state.activeDetailsNodeId = nodeId;
      state.selectedNodeId = nodeId;
      state.isDetailsDrawerOpen = true;
    },
    closeDetailsDrawer: (state) => {
      state.isDetailsDrawerOpen = false;
      state.activeDetailsNodeId = null;
    },
    setConnectionAlert: (state, action) => {
      state.connectionAlert = action.payload;
    },
    clearConnectionAlert: (state) => {
      state.connectionAlert = null;
    },
    setEditingNodeText: (state, action) => {
      state.editingNodeText = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    clearSuccess: (state) => {
      state.successMessage = null;
    },
  },
  extraReducers: (builder) => {
    // fetchAutomation
    builder
      .addCase(fetchAutomation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAutomation.fulfilled, (state, action) => {
        state.loading = false;
        state.automationId = action.payload?._id || null;
        state.name = action.payload?.name || "AI Automation Workspace";
        state.isActive = Boolean(action.payload?.isActive);
        state.lastRunAt = action.payload?.lastRunAt || null;
        state.nextRunAt = action.payload?.nextRunAt || null;
        state.nodes = action.payload?.nodes || [];
        state.edges = action.payload?.edges || [];
        state.executionHistory = action.payload?.executionHistory || [];
        computeNodeSequences(state.nodes, state.edges);
      })
      .addCase(fetchAutomation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // saveAutomation
    builder
      .addCase(saveAutomation.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(saveAutomation.fulfilled, (state, action) => {
        state.saving = false;
        state.successMessage = "Automation saved successfully";
        if (action.payload) {
          state.nodes = action.payload.nodes || state.nodes;
          state.edges = action.payload.edges || state.edges;
          state.isActive = Boolean(action.payload.isActive);
          computeNodeSequences(state.nodes, state.edges);
        }
      })
      .addCase(saveAutomation.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload;
      });

    // createNode
    builder
      .addCase(createNode.fulfilled, (state, action) => {
        if (action.payload?.data?.nodes) {
          state.nodes = action.payload.data.nodes;
          state.edges = action.payload.data.edges || state.edges;
        } else if (action.payload?.node) {
          state.nodes.push(action.payload.node);
        }
        computeNodeSequences(state.nodes, state.edges);
        state.successMessage = "Node added to canvas";
      })
      .addCase(createNode.rejected, (state, action) => {
        state.error = action.payload;
      });

    // updateNodeConfig
    builder
      .addCase(updateNodeConfig.fulfilled, (state, action) => {
        const { nodeId, config, label, status } = action.payload;
        const node = state.nodes.find((n) => n.id === nodeId);
        if (node) {
          if (config) node.config = { ...(node.config || {}), ...config };
          if (label) node.label = label;
          if (status) node.status = status;
        }
        state.successMessage = "Configuration saved";
      })
      .addCase(updateNodeConfig.rejected, (state, action) => {
        state.error = action.payload;
      });

    // updateNodeText
    builder
      .addCase(updateNodeText.fulfilled, (state, action) => {
        const { nodeId, text } = action.payload;
        const node = state.nodes.find((n) => n.id === nodeId);
        if (node) {
          node.text = text;
        }
        state.isEditingModalOpen = false;
        state.isEditModalOpen = false;
        state.editingNodeId = null;
        state.activeEditingNodeId = null;
        state.editingNodeText = "";
        state.successMessage = "Node text updated";
      });

    // updateNodePosition
    builder.addCase(updateNodePosition.fulfilled, (state, action) => {
      const { nodeId, position } = action.payload;
      const node = state.nodes.find((n) => n.id === nodeId);
      if (node && position) {
        node.position = position;
      }
    });

    // deleteNode
    builder
      .addCase(deleteNode.fulfilled, (state, action) => {
        const { nodeId } = action.payload;
        state.nodes = state.nodes.filter((n) => n.id !== nodeId);
        state.edges = state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
        computeNodeSequences(state.nodes, state.edges);
        if (state.selectedNodeId === nodeId) {
          state.selectedNodeId = null;
        }
        if (state.activeDetailsNodeId === nodeId) {
          state.isDetailsDrawerOpen = false;
          state.activeDetailsNodeId = null;
        }
        state.successMessage = "Node removed";
      })
      .addCase(deleteNode.rejected, (state, action) => {
        state.error = action.payload;
      });

    // addEdge
    builder
      .addCase(addEdge.fulfilled, (state, action) => {
        if (action.payload?.data?.edges) {
          state.edges = action.payload.data.edges;
        } else if (action.payload?.edge) {
          const edge = action.payload.edge;
          const exists = state.edges.some(
            (e) => (e.id && e.id === edge.id) ||
                   (e.source === edge.source && e.target === edge.target) ||
                   (e.source === edge.target && e.target === edge.source)
          );
          if (!exists) {
            state.edges.push(edge);
          }
        }

        if (action.payload?.data?.nodes) {
          state.nodes = action.payload.data.nodes;
        }

        computeNodeSequences(state.nodes, state.edges);
        state.connectionAlert = null;
        state.successMessage = "Nodes connected";
      })
      .addCase(addEdge.rejected, (state, action) => {
        state.error = action.payload;
        state.connectionAlert = action.payload;
      });

    // removeEdge
    builder
      .addCase(removeEdge.fulfilled, (state, action) => {
        const { edgeId } = action.payload;
        state.edges = state.edges.filter((e) => e.id !== edgeId);
        computeNodeSequences(state.nodes, state.edges);
        state.successMessage = "Connection removed";
      })
      .addCase(removeEdge.rejected, (state, action) => {
        state.error = action.payload;
      });

    // validateAutomation
    builder
      .addCase(validateAutomation.fulfilled, (state, action) => {
        state.validationErrors = action.payload.errors || [];
      })
      .addCase(validateAutomation.rejected, (state, action) => {
        state.error = action.payload;
      });

    // toggleActiveAutomation
    builder
      .addCase(toggleActiveAutomation.fulfilled, (state, action) => {
        state.isActive = Boolean(action.payload.isActive);
        state.successMessage = action.payload.message;
        state.validationErrors = [];
      })
      .addCase(toggleActiveAutomation.rejected, (state, action) => {
        state.error = action.payload;
        if (action.meta?.arg?.errors) {
          state.validationErrors = action.meta.arg.errors;
        }
      });

    // runNowAutomation
    builder
      .addCase(runNowAutomation.pending, (state) => {
        state.isRunning = true;
        state.error = null;
      })
      .addCase(runNowAutomation.fulfilled, (state, action) => {
        state.isRunning = false;
        state.successMessage = action.payload.message || "Action executed successfully";
        if (action.payload.data?.executionHistory) {
          state.executionHistory = action.payload.data.executionHistory;
          state.lastRunAt = action.payload.data.lastRunAt;
        }
      })
      .addCase(runNowAutomation.rejected, (state, action) => {
        state.isRunning = false;
        state.error = action.payload;
      });

    // fetchExecutionHistory
    builder.addCase(fetchExecutionHistory.fulfilled, (state, action) => {
      state.executionHistory = action.payload || [];
    });
  },
});

export const {
  moveNodeLocal,
  selectNode,
  openEditModal,
  closeEditModal,
  openDetailsDrawer,
  closeDetailsDrawer,
  setConnectionAlert,
  clearConnectionAlert,
  setEditingNodeText,
  clearError,
  clearSuccess,
} = aiAutomationSlice.actions;

export const setSelectedNode = selectNode;

export default aiAutomationSlice.reducer;
