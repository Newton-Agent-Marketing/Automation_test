import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { chatApi } from "./service/chat.api";
import { getErrorMessage } from "../../lib/api";

const initialState = {
  conversations: [],
  messages: [],
  activeId: null,
  activeExecutionId: null,
  completedExecutionIds: [],
  streaming: false,
  streamText: "",
  toolStatus: "",
  jobProgress: null,
  preparationData: null,
  connected: false,
  error: null,
};

export const fetchConversations = createAsyncThunk(
  "chat/conversations",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await chatApi.conversations();
      return data.data || [];
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to load chats"));
    }
  }
);

export const fetchHistory = createAsyncThunk(
  "chat/history",
  async (conversationId, { rejectWithValue }) => {
    try {
      const { data } = await chatApi.history(conversationId);
      return { conversationId, messages: data.data || [] };
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to load history"));
    }
  }
);

export const renameConversationThunk = createAsyncThunk(
  "chat/renameConversation",
  async ({ conversationId, title }, { rejectWithValue }) => {
    try {
      await chatApi.renameConversation(conversationId, title);
      return { conversationId, title };
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to rename conversation"));
    }
  }
);

export const deleteConversationThunk = createAsyncThunk(
  "chat/deleteConversation",
  async (conversationId, { rejectWithValue }) => {
    try {
      await chatApi.deleteConversation(conversationId);
      return conversationId;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to delete conversation"));
    }
  }
);

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setSocketConnected: (state, action) => {
      state.connected = action.payload;
    },
    setActiveConversation: (state, action) => {
      state.activeId = action.payload;
      state.streamText = "";
      state.toolStatus = "";
      state.jobProgress = null;
    },
    addLocalUserMessage: (state, action) => {
      const msg = action.payload;
      state.messages.push(msg);
      state.activeExecutionId = msg?.executionId || null;
      state.streaming = true;
      state.streamText = "";
      state.toolStatus = "";
      state.jobProgress = null;
      state.error = null;

      // Instantly show the new conversation in the sidebar with the first message as title
      if (msg?.conversationId) {
        const existing = state.conversations.find((c) => c.conversationId === msg.conversationId);
        if (!existing) {
          const autoTitle =
            msg.content?.trim().replace(/[\r\n\t]+/g, " ").slice(0, 52) || "New Chat";
          state.conversations.unshift({
            conversationId: msg.conversationId,
            title: autoTitle,
            lastMessage: msg.content,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    },
    startExecution: (state, action) => {
      const execId = action.payload;
      if (execId && !state.completedExecutionIds.includes(execId)) {
        state.activeExecutionId = execId;
      }
    },
    resetStreamText: (state, action) => {
      const execId = action.payload;
      if (!execId || !state.activeExecutionId || execId === state.activeExecutionId) {
        state.streamText = "";
      }
    },
    appendStreamText: (state, action) => {
      const payload = action.payload;
      const chunk = typeof payload === "object" && payload !== null ? payload.content || "" : String(payload || "");
      const execId = typeof payload === "object" && payload !== null ? payload.executionId || null : null;

      if (execId && state.completedExecutionIds.includes(execId)) {
        return;
      }
      if (execId && state.activeExecutionId && execId !== state.activeExecutionId) {
        return;
      }
      state.streamText += chunk;
    },
    setToolStatus: (state, action) => {
      state.toolStatus = action.payload;
    },
    updateJobProgress: (state, action) => {
      const event = action.payload;
      if (!event) return;
      const jobId = event.jobId || `job-${Date.now()}`;

      if (!state.jobProgress || state.jobProgress.jobId !== jobId) {
        state.jobProgress = {
          jobId,
          campaignName: event.campaignName || null,
          adSetName: event.adSetName || null,
          totalRows: event.totalRows || 1,
          completedRows: 0,
          failedRows: 0,
          status: event.status || "Processing",
          stage: event.stage || 1,
          stageName: event.stageName || "Understanding request",
          stagesList: event.stagesList || [],
          filterColumn: event.filterColumn || null,
          filterValue: event.filterValue || null,
          matchingRowIndices: event.matchingRowIndices || [],
          skippedRowsCount: event.skippedRowsCount || 0,
          rowsList: [],
          logs: event.logs || [],
        };
      }

      const jp = state.jobProgress;
      if (event.campaignName) jp.campaignName = event.campaignName;
      if (event.adSetName) jp.adSetName = event.adSetName;
      if (event.totalRows) jp.totalRows = event.totalRows;
      if (event.completedRows !== undefined) jp.completedRows = event.completedRows;
      if (event.failedRows !== undefined) jp.failedRows = event.failedRows;
      if (event.stage !== undefined) jp.stage = event.stage;
      if (event.stageName) jp.stageName = event.stageName;
      if (event.stagesList) jp.stagesList = event.stagesList;
      if (event.filterColumn !== undefined) jp.filterColumn = event.filterColumn;
      if (event.filterValue !== undefined) jp.filterValue = event.filterValue;
      if (event.matchingRowIndices) jp.matchingRowIndices = event.matchingRowIndices;
      if (event.skippedRowsCount !== undefined) jp.skippedRowsCount = event.skippedRowsCount;
      if (event.status) jp.status = event.status;

      if (event.logs && Array.isArray(event.logs)) {
        jp.logs = [...new Set([...(jp.logs || []), ...event.logs])];
      } else if (event.logMessage) {
        jp.logs = [...(jp.logs || []), event.logMessage];
      }

      if (event.status === "Job Completed" || event.status === "Completed") {
        jp.status = "Completed";
      }

      if (event.rowIndex || event.rowNumber) {
        const rIndex = event.rowIndex || 1;
        const rNum = event.rowNumber || rIndex;
        let existingIndex = jp.rowsList.findIndex((r) => r.rowIndex === rIndex || r.rowNumber === rNum);

        const rowObj = {
          rowIndex: rIndex,
          rowNumber: rNum,
          adName: event.adName || `Row ${rNum}`,
          assetName: event.assetName || null,
          driveUrl: event.driveUrl || null,
          adId: event.adId || null,
          step: event.step || "Processing...",
          status: event.status || "Processing",
          error: event.error || null,
          details: event.details || [],
        };

        if (existingIndex >= 0) {
          jp.rowsList[existingIndex] = {
            ...jp.rowsList[existingIndex],
            ...rowObj,
          };
        } else {
          jp.rowsList.push(rowObj);
        }
        jp.rowsList.sort((a, b) => (a.rowIndex || 0) - (b.rowIndex || 0));
      }
    },
    finishStream: (state, action) => {
      const execId = action.payload || state.activeExecutionId || null;
      if (execId && state.completedExecutionIds.includes(execId)) {
        state.streaming = false;
        state.streamText = "";
        state.toolStatus = "";
        return;
      }

      if (state.streamText || state.preparationData) {
        const alreadyExists =
          execId && state.messages.some((m) => m.role === "assistant" && m.executionId === execId);
        if (!alreadyExists) {
          state.messages.push({
            _id: execId ? `assistant-${execId}` : `assistant-${Date.now()}`,
            executionId: execId,
            role: "assistant",
            content: state.streamText || "Campaign details updated:",
            jobProgress: state.jobProgress ? JSON.parse(JSON.stringify(state.jobProgress)) : null,
            preparationData: state.preparationData ? JSON.parse(JSON.stringify(state.preparationData)) : null,
          });
        }
      }

      if (execId) {
        state.completedExecutionIds = [...state.completedExecutionIds.slice(-99), execId];
      }
      state.activeExecutionId = null;
      state.streaming = false;
      state.streamText = "";
      state.toolStatus = "";
      state.jobProgress = null;
    },
    setPreparationData: (state, action) => {
      state.preparationData = action.payload;
      if (action.payload && state.messages.length > 0) {
        const lastAssistant = [...state.messages].reverse().find((m) => m.role === "assistant");
        if (lastAssistant) {
          lastAssistant.preparationData = JSON.parse(JSON.stringify(action.payload));
        }
      }
    },
    setChatError: (state, action) => {
      state.error = action.payload;
      state.streaming = false;
    },
    clearMessages: (state) => {
      state.messages = [];
      state.streamText = "";
      state.toolStatus = "";
      state.jobProgress = null;
      state.preparationData = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.conversations = action.payload;
      })
      .addCase(fetchHistory.fulfilled, (state, action) => {
        state.activeId = action.payload.conversationId;
        const seenExecIds = new Set();
        const dedupedMessages = [];
        for (const m of action.payload.messages || []) {
          if (m.role === "assistant" && m.executionId) {
            if (seenExecIds.has(m.executionId)) continue;
            seenExecIds.add(m.executionId);
          }
          dedupedMessages.push(m);
        }
        state.messages = dedupedMessages;
        const lastWithPrep = [...dedupedMessages].reverse().find((m) => m.preparationData);
        state.preparationData = lastWithPrep?.preparationData || null;
      })
      .addCase(renameConversationThunk.fulfilled, (state, action) => {
        const { conversationId, title } = action.payload;
        state.conversations = state.conversations.map((item) =>
          item.conversationId === conversationId ? { ...item, title } : item
        );
      })
      .addCase(deleteConversationThunk.fulfilled, (state, action) => {
        const deletedId = action.payload;
        state.conversations = state.conversations.filter(
          (item) => item.conversationId !== deletedId
        );
        if (state.activeId === deletedId) {
          state.activeId = null;
          state.messages = [];
          state.streamText = "";
          state.toolStatus = "";
          state.jobProgress = null;
          state.preparationData = null;
        }
      });
  },
});

export const {
  setSocketConnected,
  setActiveConversation,
  addLocalUserMessage,
  startExecution,
  resetStreamText,
  appendStreamText,
  setToolStatus,
  updateJobProgress,
  setPreparationData,
  finishStream,
  setChatError,
  clearMessages,
} = chatSlice.actions;

export default chatSlice.reducer;
