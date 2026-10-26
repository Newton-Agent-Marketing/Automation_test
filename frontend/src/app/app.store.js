import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/auth/auth.slice";
import dashboardReducer from "../features/dashboard/dashbord.slice";
import channelReducer from "../features/channel/channel.slice";
import chatReducer from "../features/chat/chat.slice";
import aiContextReducer from "../features/aiContext/aiContext.slice";
import aiAutomationReducer from "../features/aiAutomation/aiAutomation.slice";
import automationLogsReducer from "../features/automationLogs/automationLogs.slice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    dashboard: dashboardReducer,
    channel: channelReducer,
    chat: chatReducer,
    aiContext: aiContextReducer,
    aiAutomation: aiAutomationReducer,
    automationLogs: automationLogsReducer,
  },
});

