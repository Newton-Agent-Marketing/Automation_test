import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { dashboardApi } from "./service/UserDashboard";
import { getErrorMessage } from "../../lib/api";
import { defaultDateRange } from "../../lib/format";

const range = defaultDateRange();

const initialState = {
  stats: null,
  daily: [],
  campaigns: [],
  loading: false,
  error: null,
  filters: {
    startDate: range.startDate,
    endDate: range.endDate,
    channel: "Meta Ads",
    accountId: "",
  },
};

export const fetchDashboard = createAsyncThunk(
  "dashboard/fetch",
  async (_, { getState, rejectWithValue }) => {
    try {
      const { filters } = getState().dashboard;
      const params = {
        startDate: filters.startDate,
        endDate: filters.endDate,
        channel: filters.channel || "Meta Ads",
      };
      if (filters.accountId) params.accountId = filters.accountId;
      const [stats, daily, campaigns] = await Promise.all([
        dashboardApi.stats(params),
        dashboardApi.daily(params),
        dashboardApi.campaigns(params),
      ]);
      return {
        stats: stats.data.data,
        daily: daily.data.data,
        campaigns: campaigns.data.data,
      };
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to load dashboard"));
    }
  }
);

export const loadDashboardPreferences = createAsyncThunk(
  "dashboard/loadPreferences",
  async (_, { rejectWithValue }) => {
    try {
      const res = await dashboardApi.getPreferences();
      return res.data.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to load preferences"));
    }
  }
);

export const saveDashboardPreferences = createAsyncThunk(
  "dashboard/savePreferences",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await dashboardApi.savePreferences(payload);
      return res.data.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to save preferences"));
    }
  }
);

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {
    setDashboardFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboard.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.loading = false;
        state.stats = action.payload.stats;
        state.daily = action.payload.daily || [];
        state.campaigns = action.payload.campaigns || [];
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(loadDashboardPreferences.fulfilled, (state, action) => {
        if (action.payload) {
          const { startDate, endDate, channel, accountId } = action.payload;
          if (startDate && endDate) {
            state.filters.startDate = startDate;
            state.filters.endDate = endDate;
          }
          if (channel) state.filters.channel = channel;
          if (accountId) state.filters.accountId = accountId;
        }
      });
  },
});

export const { setDashboardFilters } = dashboardSlice.actions;
export default dashboardSlice.reducer;
