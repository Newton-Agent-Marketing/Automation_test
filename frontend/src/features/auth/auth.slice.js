import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { authApi } from "./service/auth.api";
import { getErrorMessage } from "../../lib/api";

const initialState = {
  user: null,
  token: typeof window !== "undefined" ? localStorage.getItem("token") : null,
  hydrated: false,
  status: "idle",
  error: null,
};

const applySession = (state, payload = {}) => {
  state.user = payload.user || null;
  if (payload.token) {
    state.token = payload.token;
    localStorage.setItem("token", payload.token);
  }
  state.status = payload.user ? "authenticated" : "unauthenticated";
  state.error = null;
};

export const hydrateUser = createAsyncThunk(
  "auth/hydrate",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await authApi.me();
      return data;
    } catch (error) {
      if (typeof window !== "undefined") {
        if (error?.response?.status === 401) {
          localStorage.removeItem("token");
        }
      }
      return rejectWithValue(getErrorMessage(error, "Session expired"));
    }
  }
);

export const registerUser = createAsyncThunk(
  "auth/register",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await authApi.register(payload);
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to register"));
    }
  }
);

export const loginUser = createAsyncThunk(
  "auth/login",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await authApi.login(payload);
      if (data.token) {
        localStorage.setItem("token", data.token);
      }
      return data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to login"));
    }
  }
);

export const logoutUser = createAsyncThunk("auth/logout", async () => {
  try {
    await authApi.logout();
  } catch {
    // Cookie clear is best-effort
  } finally {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
    }
  }
});

export const updateUserProfile = createAsyncThunk(
  "auth/updateProfile",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await authApi.updateProfile(payload);
      return data.user;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to update profile"));
    }
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearAuthError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(hydrateUser.pending, (state) => {
        state.status = "loading";
      })
      .addCase(hydrateUser.fulfilled, (state, action) => {
        applySession(state, action.payload);
        state.hydrated = true;
      })
      .addCase(hydrateUser.rejected, (state) => {
        state.user = null;
        state.token = null;
        state.status = "unauthenticated";
        state.hydrated = true;
      })
      .addCase(registerUser.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state) => {
        state.status = "unauthenticated";
        state.hydrated = true;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.status = "unauthenticated";
        state.error = action.payload;
      })
      .addCase(loginUser.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        applySession(state, action.payload);
        state.hydrated = true;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = "unauthenticated";
        state.error = action.payload;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        Object.assign(state, { ...initialState, token: null, hydrated: true, status: "unauthenticated" });
      })
      .addCase(logoutUser.rejected, (state) => {
        Object.assign(state, { ...initialState, token: null, hydrated: true, status: "unauthenticated" });
      })
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        state.user = { ...state.user, ...action.payload };
        state.error = null;
      });
  },
});

export const { clearAuthError } = authSlice.actions;
export default authSlice.reducer;
