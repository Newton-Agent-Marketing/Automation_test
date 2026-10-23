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
  async ({ text = "", position }, { rejectWithValue }) => {
    try {
      const payload = {
        text,
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
      const res = await aiAutomationApi.deleteNode(nodeId);
      return { nodeId, data: res.data.data };
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to delete node"));
    }
  }
);

export const addEdge = createAsyncThunk(
  "aiAutomation/addEdge",
  async ({ source, target, sourceHandle, targetHandle }, { rejectWithValue }) => {
    try {
      const payload = { source, target, sourceHandle, targetHandle };
      const res = await aiAutomationApi.createEdge(payload);
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
      const res = await aiAutomationApi.deleteEdge(edgeId);
      return { edgeId, data: res.data.data };
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to remove connection"));
    }
  }
);

const initialState = {
  loading: false,
  saving: false,
  automationId: null,
  name: "AI Automation Workspace",
  nodes: [], // Zero predefined nodes!
  edges: [],
  selectedNodeId: null,
  editingNodeId: null,
  activeEditingNodeId: null,
  editingNodeText: "",
  isEditingModalOpen: false,
  isEditModalOpen: false,
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
        state.nodes = action.payload?.nodes || [];
        state.edges = action.payload?.edges || [];
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
        }
      })
      .addCase(saveAutomation.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload;
      });

    // createNode
    builder
      .addCase(createNode.fulfilled, (state, action) => {
        if (action.payload?.node) {
          state.nodes.push(action.payload.node);
        } else if (action.payload?.data?.nodes) {
          state.nodes = action.payload.data.nodes;
        }
        state.successMessage = "Node added to canvas";
      })
      .addCase(createNode.rejected, (state, action) => {
        state.error = action.payload;
      });

    // updateNodeText
    builder
      .addCase(updateNodeText.pending, (state) => {
        state.saving = true;
      })
      .addCase(updateNodeText.fulfilled, (state, action) => {
        state.saving = false;
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
      })
      .addCase(updateNodeText.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload;
      });

    // updateNodePosition
    builder
      .addCase(updateNodePosition.fulfilled, (state, action) => {
        const { nodeId, position } = action.payload;
        const node = state.nodes.find((n) => n.id === nodeId);
        if (node && position) {
          node.position = position;
        }
      })
      .addCase(updateNodePosition.rejected, (state, action) => {
        state.error = action.payload;
      });

    // deleteNode
    builder
      .addCase(deleteNode.fulfilled, (state, action) => {
        const { nodeId } = action.payload;
        state.nodes = state.nodes.filter((n) => n.id !== nodeId);
        state.edges = state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
        if (state.selectedNodeId === nodeId) {
          state.selectedNodeId = null;
        }
        if (state.editingNodeId === nodeId) {
          state.isEditingModalOpen = false;
          state.editingNodeId = null;
        }
        state.successMessage = "Node removed";
      })
      .addCase(deleteNode.rejected, (state, action) => {
        state.error = action.payload;
      });

    // addEdge
    builder
      .addCase(addEdge.fulfilled, (state, action) => {
        if (action.payload?.edge) {
          state.edges.push(action.payload.edge);
        } else if (action.payload?.data?.edges) {
          state.edges = action.payload.data.edges;
        }
        state.successMessage = "Nodes connected";
      })
      .addCase(addEdge.rejected, (state, action) => {
        state.error = action.payload;
      });

    // removeEdge
    builder
      .addCase(removeEdge.fulfilled, (state, action) => {
        const { edgeId } = action.payload;
        state.edges = state.edges.filter((e) => e.id !== edgeId);
        state.successMessage = "Connection removed";
      })
      .addCase(removeEdge.rejected, (state, action) => {
        state.error = action.payload;
      });
  },
});

export const {
  moveNodeLocal,
  selectNode,
  openEditModal,
  closeEditModal,
  setEditingNodeText,
  clearError,
  clearSuccess,
} = aiAutomationSlice.actions;

export const setSelectedNode = selectNode;

export default aiAutomationSlice.reducer;
