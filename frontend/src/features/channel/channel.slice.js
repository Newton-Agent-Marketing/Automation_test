import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { channelApi } from "./service/channel.api";
import { getErrorMessage } from "../../lib/api";

const initialState = {
  status: null,
  connectedPlatforms: [],
  connectedList: [],
  connectedMap: {},
  connectedAccounts: [],
  tools: [],
  accounts: [],
  loading: false,
  connecting: false,
  error: null,
  message: null,
  oauthUrl: null,
};

export const fetchChannelStatus = createAsyncThunk(
  "channel/status",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await channelApi.status();
      return data.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to load channels"));
    }
  }
);

export const fetchConnectedAccounts = createAsyncThunk(
  "channel/fetchConnectedAccounts",
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await channelApi.getAccounts(params);
      return data.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to load connected accounts"));
    }
  }
);

export const getMetaOAuthUrl = createAsyncThunk(
  "channel/getMetaOAuthUrl",
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await channelApi.getMetaOAuthUrl(params);
      return data.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to generate Meta OAuth URL"));
    }
  }
);

export const metaOAuthCallback = createAsyncThunk(
  "channel/metaOAuthCallback",
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await channelApi.metaOAuthCallback(payload);
      dispatch(fetchChannelStatus());
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to complete Meta authorization"));
    }
  }
);

export const connectMcpServer = createAsyncThunk(
  "channel/connectMcpServer",
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await channelApi.connectMcpServer(payload);
      if (!data.requiresAuth) {
        dispatch(fetchChannelStatus());
      }
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to connect to Meta MCP server"));
    }
  }
);

export const fetchMetaAccounts = createAsyncThunk(
  "channel/fetchAccounts",
  async (accessToken, { rejectWithValue }) => {
    try {
      const { data } = await channelApi.fetchMetaAccounts({ accessToken });
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to fetch Meta accounts"));
    }
  }
);

export const connectMetaAccount = createAsyncThunk(
  "channel/connectMeta",
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await channelApi.connectMeta(payload);
      dispatch(fetchChannelStatus());
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to connect Meta"));
    }
  }
);

export const selectMetaAccount = createAsyncThunk(
  "channel/selectMetaAccount",
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await channelApi.selectMetaAccount(payload);
      dispatch(fetchChannelStatus());
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to select Meta Ad Account"));
    }
  }
);

export const disconnectMetaAccount = createAsyncThunk(
  "channel/disconnectMeta",
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await channelApi.disconnectMeta(payload);
      dispatch(fetchChannelStatus());
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to disconnect Meta"));
    }
  }
);

export const getGoogleOAuthUrl = createAsyncThunk(
  "channel/getGoogleOAuthUrl",
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await channelApi.getGoogleOAuthUrl(params);
      return data.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to generate Google OAuth URL"));
    }
  }
);

export const googleOAuthCallback = createAsyncThunk(
  "channel/googleOAuthCallback",
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await channelApi.googleOAuthCallback(payload);
      dispatch(fetchChannelStatus());
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to complete Google authorization"));
    }
  }
);

export const connectGoogleMcpServer = createAsyncThunk(
  "channel/connectGoogleMcpServer",
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await channelApi.connectGoogleMcpServer(payload);
      if (!data.requiresAuth) {
        dispatch(fetchChannelStatus());
      }
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to connect to Google MCP server"));
    }
  }
);

export const fetchGoogleAccounts = createAsyncThunk(
  "channel/fetchGoogleAccounts",
  async (accessToken, { rejectWithValue }) => {
    try {
      const { data } = await channelApi.fetchGoogleAccounts({ accessToken });
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to fetch Google accounts"));
    }
  }
);

export const selectGoogleAccount = createAsyncThunk(
  "channel/selectGoogleAccount",
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await channelApi.selectGoogleAccount(payload);
      dispatch(fetchChannelStatus());
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to select Google Ads account"));
    }
  }
);

export const connectGoogleAccount = createAsyncThunk(
  "channel/connectGoogle",
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await channelApi.connectGoogle(payload);
      dispatch(fetchChannelStatus());
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to connect Google Ads"));
    }
  }
);

export const disconnectGoogleAccount = createAsyncThunk(
  "channel/disconnectGoogle",
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await channelApi.disconnectGoogle(payload);
      dispatch(fetchChannelStatus());
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to disconnect Google Ads"));
    }
  }
);

export const connectGenericChannel = createAsyncThunk(
  "channel/connectGeneric",
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await channelApi.connectGeneric(payload);
      dispatch(fetchChannelStatus());
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to connect channel"));
    }
  }
);

export const disconnectGenericChannel = createAsyncThunk(
  "channel/disconnectGeneric",
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await channelApi.disconnectGeneric(payload);
      dispatch(fetchChannelStatus());
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to disconnect channel"));
    }
  }
);

const channelSlice = createSlice({
  name: "channel",
  initialState,
  reducers: {
    clearChannelMessage: (state) => {
      state.message = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchChannelStatus.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchChannelStatus.fulfilled, (state, action) => {
        state.loading = false;
        state.status = action.payload;
        state.connectedPlatforms = action.payload?.connectedPlatforms || [];
        state.connectedList = action.payload?.connectedList || [];
        state.connectedMap = action.payload?.connectedMap || {};
        state.tools = [
          ...(action.payload?.channels?.metaAds?.availableTools || []),
          ...(action.payload?.channels?.googleAds?.availableTools || []),
        ];
      })
      .addCase(fetchConnectedAccounts.fulfilled, (state, action) => {
        state.connectedAccounts = action.payload || [];
      })
      .addCase(fetchChannelStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(getMetaOAuthUrl.fulfilled, (state, action) => {
        state.oauthUrl = action.payload?.oauthUrl;
      })
      .addCase(metaOAuthCallback.pending, (state) => {
        state.connecting = true;
      })
      .addCase(metaOAuthCallback.fulfilled, (state, action) => {
        state.connecting = false;
        state.message = action.payload.message;
        state.error = null;
      })
      .addCase(metaOAuthCallback.rejected, (state, action) => {
        state.connecting = false;
        state.error = action.payload;
      })
      .addCase(connectMcpServer.pending, (state) => {
        state.connecting = true;
      })
      .addCase(connectMcpServer.fulfilled, (state, action) => {
        state.connecting = false;
        state.message = action.payload.message;
        state.error = null;
      })
      .addCase(connectMcpServer.rejected, (state, action) => {
        state.connecting = false;
        state.error = action.payload;
      })
      .addCase(fetchMetaAccounts.fulfilled, (state, action) => {
        state.accounts = action.payload.data || [];
        state.message = action.payload.message;
        state.error = null;
      })
      .addCase(fetchMetaAccounts.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(connectMetaAccount.pending, (state) => {
        state.connecting = true;
      })
      .addCase(connectMetaAccount.fulfilled, (state, action) => {
        state.connecting = false;
        state.message = action.payload.message;
      })
      .addCase(connectMetaAccount.rejected, (state, action) => {
        state.connecting = false;
        state.error = action.payload;
      })
      .addCase(selectMetaAccount.fulfilled, (state, action) => {
        state.connecting = false;
        state.message = action.payload?.message || "Meta Ad Account updated";
      })
      .addCase(selectMetaAccount.rejected, (state, action) => {
        state.connecting = false;
        state.error = action.payload;
      })
      .addCase(connectGenericChannel.pending, (state) => {
        state.connecting = true;
      })
      .addCase(connectGenericChannel.fulfilled, (state, action) => {
        state.connecting = false;
        state.message = action.payload.message;
      })
      .addCase(connectGenericChannel.rejected, (state, action) => {
        state.connecting = false;
        state.error = action.payload;
      })
      .addCase(getGoogleOAuthUrl.fulfilled, (state, action) => {
        state.oauthUrl = action.payload?.oauthUrl;
      })
      .addCase(googleOAuthCallback.pending, (state) => {
        state.connecting = true;
      })
      .addCase(googleOAuthCallback.fulfilled, (state, action) => {
        state.connecting = false;
        state.message = action.payload.message;
        state.error = null;
      })
      .addCase(googleOAuthCallback.rejected, (state, action) => {
        state.connecting = false;
        state.error = action.payload;
      })
      .addCase(connectGoogleMcpServer.pending, (state) => {
        state.connecting = true;
      })
      .addCase(connectGoogleMcpServer.fulfilled, (state, action) => {
        state.connecting = false;
        state.message = action.payload.message;
        state.error = null;
      })
      .addCase(connectGoogleMcpServer.rejected, (state, action) => {
        state.connecting = false;
        state.error = action.payload;
      })
      .addCase(fetchGoogleAccounts.fulfilled, (state, action) => {
        state.accounts = action.payload.data || [];
        state.message = action.payload.message;
        state.error = null;
      })
      .addCase(fetchGoogleAccounts.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(selectGoogleAccount.fulfilled, (state, action) => {
        state.connecting = false;
        state.message = action.payload?.message || "Google Ads active account updated";
      })
      .addCase(selectGoogleAccount.rejected, (state, action) => {
        state.connecting = false;
        state.error = action.payload;
      })
      .addCase(connectGoogleAccount.pending, (state) => {
        state.connecting = true;
      })
      .addCase(connectGoogleAccount.fulfilled, (state, action) => {
        state.connecting = false;
        state.message = action.payload.message;
      })
      .addCase(connectGoogleAccount.rejected, (state, action) => {
        state.connecting = false;
        state.error = action.payload;
      });
  },
});

export const { clearChannelMessage } = channelSlice.actions;
export default channelSlice.reducer;
