import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import automationLogsApi from "./service/automationLogs.api";
import { getErrorMessage } from "../../lib/api";

const initialState = {
  executions: [],
  selectedExecution: null,
  loading: false,
  actionLoading: false,
  error: null,
  filters: {
    searchTerm: "",
    status: "all",
    dateRange: "all",
    sortBy: "newest",
    page: 1,
    limit: 10,
    totalPages: 1,
    totalCount: 0,
  },
  expandedRunIds: [],
  selectedNodeDetail: null,
};

/**
 * Async Thunks
 */
export const fetchExecutions = createAsyncThunk(
  "automationLogs/fetchExecutions",
  async (_, { getState, rejectWithValue }) => {
    try {
      const { filters } = getState().automationLogs;
      const params = {
        search: filters.searchTerm,
        status: filters.status,
        dateRange: filters.dateRange,
        sortBy: filters.sortBy,
        page: filters.page,
        limit: filters.limit,
      };

      const res = await automationLogsApi.getExecutions(params);
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to load automation logs"));
    }
  }
);

export const fetchExecutionById = createAsyncThunk(
  "automationLogs/fetchExecutionById",
  async (executionId, { rejectWithValue }) => {
    try {
      const res = await automationLogsApi.getExecutionById(executionId);
      return res.data?.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to load execution details"));
    }
  }
);

export const deleteExecution = createAsyncThunk(
  "automationLogs/deleteExecution",
  async (executionId, { rejectWithValue }) => {
    try {
      await automationLogsApi.deleteExecution(executionId);
      return executionId;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to delete execution record"));
    }
  }
);

export const clearAllExecutions = createAsyncThunk(
  "automationLogs/clearAllExecutions",
  async (_, { rejectWithValue }) => {
    try {
      await automationLogsApi.clearAllExecutions();
      return true;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to clear all execution records"));
    }
  }
);

export const automationLogsSlice = createSlice({
  name: "automationLogs",
  initialState,
  reducers: {
    setSearchTerm: (state, action) => {
      state.filters.searchTerm = action.payload;
      state.filters.page = 1;
    },
    setStatusFilter: (state, action) => {
      state.filters.status = action.payload;
      state.filters.page = 1;
    },
    setDateFilter: (state, action) => {
      state.filters.dateRange = action.payload;
      state.filters.page = 1;
    },
    setSortBy: (state, action) => {
      state.filters.sortBy = action.payload;
      state.filters.page = 1;
    },
    setPage: (state, action) => {
      state.filters.page = action.payload;
    },
    toggleExpandRun: (state, action) => {
      const runId = action.payload;
      const idx = state.expandedRunIds.indexOf(runId);
      if (idx === -1) {
        state.expandedRunIds.push(runId);
      } else {
        state.expandedRunIds.splice(idx, 1);
      }
    },
    setSelectedNodeDetail: (state, action) => {
      state.selectedNodeDetail = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    // Real-time Socket.IO handler
    handleSocketExecutionUpdate: (state, action) => {
      const payload = action.payload;
      if (!payload?.executionId) return;

      const existingIdx = state.executions.findIndex(
        (e) => e.executionId === payload.executionId
      );

      if (existingIdx === -1 && payload.execution) {
        // Prepend new run and auto-expand
        state.executions.unshift(payload.execution);
        if (!state.expandedRunIds.includes(payload.executionId)) {
          state.expandedRunIds.unshift(payload.executionId);
        }
        state.filters.totalCount += 1;
      } else if (existingIdx !== -1) {
        if (payload.execution) {
          state.executions[existingIdx] = payload.execution;
        } else {
          const current = state.executions[existingIdx];
          if (payload.event === "node_started" && payload.node) {
            const nodes = [...(current.nodes || [])];
            const nIdx = nodes.findIndex((n) => n.nodeId === payload.nodeId);
            if (nIdx !== -1) nodes[nIdx] = { ...nodes[nIdx], ...payload.node };
            current.nodes = nodes;
          } else if (payload.event === "node_completed" && payload.node) {
            const nodes = [...(current.nodes || [])];
            const nIdx = nodes.findIndex((n) => n.nodeId === payload.nodeId);
            if (nIdx !== -1) nodes[nIdx] = { ...nodes[nIdx], ...payload.node };
            current.nodes = nodes;
            current.successfulNodes = (current.successfulNodes || 0) + 1;
          } else if (payload.event === "node_failed" && payload.node) {
            const nodes = [...(current.nodes || [])];
            const nIdx = nodes.findIndex((n) => n.nodeId === payload.nodeId);
            if (nIdx !== -1) nodes[nIdx] = { ...nodes[nIdx], ...payload.node };
            current.nodes = nodes;
            current.failedNodes = (current.failedNodes || 0) + 1;
          }
          state.executions[existingIdx] = current;
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchExecutions
      .addCase(fetchExecutions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchExecutions.fulfilled, (state, action) => {
        state.loading = false;
        const list = action.payload?.data || [];
        state.executions = list;
        state.filters.totalPages = action.payload?.totalPages || 1;
        state.filters.totalCount = action.payload?.total || list.length;
        if (list.length > 0 && state.expandedRunIds.length === 0) {
          state.expandedRunIds = [list[0].executionId];
        }
      })
      .addCase(fetchExecutions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // fetchExecutionById
      .addCase(fetchExecutionById.fulfilled, (state, action) => {
        state.selectedExecution = action.payload;
      })

      // deleteExecution
      .addCase(deleteExecution.fulfilled, (state, action) => {
        const deletedId = action.payload;
        state.executions = state.executions.filter((e) => e.executionId !== deletedId);
        state.filters.totalCount = Math.max(0, state.filters.totalCount - 1);
        state.expandedRunIds = state.expandedRunIds.filter((id) => id !== deletedId);
      })
      .addCase(deleteExecution.rejected, (state, action) => {
        state.error = action.payload;
      })

      // clearAllExecutions
      .addCase(clearAllExecutions.fulfilled, (state) => {
        state.executions = [];
        state.filters.totalCount = 0;
        state.filters.totalPages = 1;
        state.expandedRunIds = [];
      })
      .addCase(clearAllExecutions.rejected, (state, action) => {
        state.error = action.payload;
      });
  },
});

export const {
  setSearchTerm,
  setStatusFilter,
  setDateFilter,
  setSortBy,
  setPage,
  toggleExpandRun,
  setSelectedNodeDetail,
  clearError,
  handleSocketExecutionUpdate,
} = automationLogsSlice.actions;

export default automationLogsSlice.reducer;
