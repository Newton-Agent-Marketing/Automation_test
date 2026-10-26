import api from "../../../lib/api";

/**
 * Fallback workflow executions representation in case backend API is being built or offline.
 * Mirrors real production workflow executions with multiple runs, connected nodes, inputs, outputs, and durations.
 */
export const FALLBACK_EXECUTIONS = [
  {
    executionId: "run_dcc_92418a",
    automationName: "Daily Content Creator",
    triggerType: "schedule",
    status: "completed",
    startedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - (12 * 60 * 1000 - 8200)).toISOString(),
    durationMs: 8200,
    totalNodes: 6,
    successfulNodes: 6,
    failedNodes: 0,
    errorSummary: null,
    nodes: [
      {
        nodeId: "node_sched_1",
        nodeName: "Schedule Trigger",
        nodeType: "trigger",
        status: "completed",
        executionOrder: 1,
        startedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 12 * 60 * 1000 + 200).toISOString(),
        durationMs: 200,
        input: { triggerMode: "schedule", cron: "0 9 * * *", timezone: "Asia/Kolkata" },
        output: { status: "success", triggeredAt: "09:00:00 AM IST", message: "Triggered at configured schedule." },
      },
      {
        nodeId: "node_trend_2",
        nodeName: "Fetch Trending Topics",
        nodeType: "generic",
        status: "completed",
        executionOrder: 2,
        startedAt: new Date(Date.now() - 12 * 60 * 1000 + 250).toISOString(),
        completedAt: new Date(Date.now() - 12 * 60 * 1000 + 1650).toISOString(),
        durationMs: 1400,
        input: { method: "GET", endpoint: "https://api.marketing.insights/v1/trends", category: "E-commerce & SaaS" },
        output: {
          status: "success",
          topicsCount: 10,
          topics: [
            "AI Ad Creatives in 2026",
            "Targeting High ROAS on Meta",
            "Video First Creative Fatigue",
            "Google Performance Max Optimization",
          ],
        },
      },
      {
        nodeId: "node_gen_3",
        nodeName: "Generate Content",
        nodeType: "generic",
        status: "completed",
        executionOrder: 3,
        startedAt: new Date(Date.now() - 12 * 60 * 1000 + 1700).toISOString(),
        completedAt: new Date(Date.now() - 12 * 60 * 1000 + 6500).toISOString(),
        durationMs: 4800,
        input: {
          model: "Claude 3.7 Sonnet",
          prompt: "Generate 5 high-converting ad hooks and copy variations from trending topics received from previous node.",
        },
        output: {
          status: "completed",
          headlines: ["Stop wasting 60% of your Meta budget on fatigue creatives", "The 3-second hook framework top DTC brands use"],
          bodyText: "Scale your revenue with automated ad variations that refresh dynamically before audience burn-out.",
          tokensUsed: 485,
        },
      },
      {
        nodeId: "node_fmt_4",
        nodeName: "Format Content",
        nodeType: "generic",
        status: "completed",
        executionOrder: 4,
        startedAt: new Date(Date.now() - 12 * 60 * 1000 + 6550).toISOString(),
        completedAt: new Date(Date.now() - 12 * 60 * 1000 + 6850).toISOString(),
        durationMs: 300,
        input: { targetFormat: "application/json", schema: "marketing_asset_v2" },
        output: { status: "formatted", validJson: true, characters: 1240, payloadBytes: 1840 },
      },
      {
        nodeId: "node_sheet_5",
        nodeName: "Save to Google Sheets",
        nodeType: "action",
        status: "completed",
        executionOrder: 5,
        startedAt: new Date(Date.now() - 12 * 60 * 1000 + 6900).toISOString(),
        completedAt: new Date(Date.now() - 12 * 60 * 1000 + 8100).toISOString(),
        durationMs: 1200,
        input: { spreadsheetId: "1eB7x_Newton_Marketing_Content_2026", sheetName: "Ad_Creatives_Queue" },
        output: { status: "success", rowsAppended: 5, updatedRange: "Ad_Creatives_Queue!A42:E46" },
      },
      {
        nodeId: "node_notif_6",
        nodeName: "Send Notification",
        nodeType: "action",
        status: "completed",
        executionOrder: 6,
        startedAt: new Date(Date.now() - 12 * 60 * 1000 + 8150).toISOString(),
        completedAt: new Date(Date.now() - 12 * 60 * 1000 + 8450).toISOString(),
        durationMs: 300,
        input: { channel: "Email / In-App Notification", recipient: "Account Owner" },
        output: { delivered: true, timestamp: new Date(Date.now() - 12 * 60 * 1000 + 8450).toISOString() },
      },
    ],
    logs: [
      { timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(), level: "info", message: "Workflow started via Schedule Trigger" },
      { timestamp: new Date(Date.now() - 12 * 60 * 1000 + 200).toISOString(), level: "success", nodeName: "Schedule Trigger", message: "Schedule verified" },
      { timestamp: new Date(Date.now() - 12 * 60 * 1000 + 1650).toISOString(), level: "success", nodeName: "Fetch Trending Topics", message: "Fetched 10 trending items" },
      { timestamp: new Date(Date.now() - 12 * 60 * 1000 + 6500).toISOString(), level: "success", nodeName: "Generate Content", message: "AI copy compiled (485 tokens)" },
      { timestamp: new Date(Date.now() - 12 * 60 * 1000 + 6850).toISOString(), level: "success", nodeName: "Format Content", message: "JSON formatted" },
      { timestamp: new Date(Date.now() - 12 * 60 * 1000 + 8100).toISOString(), level: "success", nodeName: "Save to Google Sheets", message: "Appended 5 rows to Sheet" },
      { timestamp: new Date(Date.now() - 12 * 60 * 1000 + 8450).toISOString(), level: "success", nodeName: "Send Notification", message: "Notification delivered" },
      { timestamp: new Date(Date.now() - 12 * 60 * 1000 + 8500).toISOString(), level: "success", message: "Workflow execution completed in 8.2s" },
    ],
  },
  {
    executionId: "run_meta_301b4e",
    automationName: "Meta Ads Campaign Generator",
    triggerType: "manual",
    status: "failed",
    startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - (45 * 60 * 1000 - 4100)).toISOString(),
    durationMs: 4100,
    totalNodes: 5,
    successfulNodes: 2,
    failedNodes: 1,
    errorSummary: "Creative upload timed out on Meta Graph API v24 endpoint.",
    nodes: [
      {
        nodeId: "n_cfg",
        nodeName: "Campaign Configuration",
        nodeType: "generic",
        status: "completed",
        executionOrder: 1,
        startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 45 * 60 * 1000 + 500).toISOString(),
        durationMs: 500,
        input: { objective: "OUTCOME_SALES", budget: "$150/day", targeting: "US DTC Buyers 25-45" },
        output: { configValidated: true, campaignDraftId: "draft_camp_89231" },
      },
      {
        nodeId: "n_copy",
        nodeName: "Generate Ad Copy",
        nodeType: "generic",
        status: "completed",
        executionOrder: 2,
        startedAt: new Date(Date.now() - 45 * 60 * 1000 + 550).toISOString(),
        completedAt: new Date(Date.now() - 45 * 60 * 1000 + 2650).toISOString(),
        durationMs: 2100,
        input: { prompt: "Generate high urgency CTA and primary text for summer clearance" },
        output: { headlines: ["Limited Time: 40% Off Everything"], cta: "SHOP_NOW" },
      },
      {
        nodeId: "n_up",
        nodeName: "Upload Creative",
        nodeType: "action",
        status: "failed",
        executionOrder: 3,
        startedAt: new Date(Date.now() - 45 * 60 * 1000 + 2700).toISOString(),
        completedAt: new Date(Date.now() - 45 * 60 * 1000 + 4100).toISOString(),
        durationMs: 1400,
        input: { assetUrl: "https://storage.googleapis.com/assets/video_hook_01.mp4", format: "VIDEO" },
        output: null,
        error: {
          code: "ERR_META_API_TIMEOUT",
          message: "Connection timed out after 1400ms while uploading 1080x1920 video to Meta Graph API.",
          endpoint: "https://graph.facebook.com/v24.0/act_8492019/advideos",
        },
      },
      {
        nodeId: "n_create",
        nodeName: "Create Campaign",
        nodeType: "action",
        status: "skipped",
        executionOrder: 4,
        startedAt: null,
        completedAt: null,
        durationMs: 0,
        input: null,
        output: null,
      },
      {
        nodeId: "n_verify",
        nodeName: "Verify Campaign",
        nodeType: "generic",
        status: "skipped",
        executionOrder: 5,
        startedAt: null,
        completedAt: null,
        durationMs: 0,
        input: null,
        output: null,
      },
    ],
    logs: [
      { timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(), level: "info", message: "Workflow started manually by User" },
      { timestamp: new Date(Date.now() - 45 * 60 * 1000 + 500).toISOString(), level: "success", nodeName: "Campaign Configuration", message: "Configuration validated" },
      { timestamp: new Date(Date.now() - 45 * 60 * 1000 + 2650).toISOString(), level: "success", nodeName: "Generate Ad Copy", message: "Ad copy generated" },
      { timestamp: new Date(Date.now() - 45 * 60 * 1000 + 4100).toISOString(), level: "error", nodeName: "Upload Creative", message: "ERR_META_API_TIMEOUT: Connection timed out" },
      { timestamp: new Date(Date.now() - 45 * 60 * 1000 + 4150).toISOString(), level: "warn", message: "Remaining downstream nodes skipped due to error" },
      { timestamp: new Date(Date.now() - 45 * 60 * 1000 + 4200).toISOString(), level: "error", message: "Workflow stopped with status Failed" },
    ],
  },
  {
    executionId: "run_air_77a91c",
    automationName: "AI Research Assistant",
    triggerType: "webhook",
    status: "completed",
    startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - (2 * 60 * 60 * 1000 - 3600)).toISOString(),
    durationMs: 3600,
    totalNodes: 3,
    successfulNodes: 3,
    failedNodes: 0,
    errorSummary: null,
    nodes: [
      {
        nodeId: "node_src_1",
        nodeName: "Fetch Research Sources",
        nodeType: "generic",
        status: "completed",
        executionOrder: 1,
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 1100).toISOString(),
        durationMs: 1100,
        input: { query: "Competitor ad spend shifts Q4" },
        output: { sourcesFound: 8, indexedPages: 24 },
      },
      {
        nodeId: "node_ai_2",
        nodeName: "AI Analysis",
        nodeType: "generic",
        status: "completed",
        executionOrder: 2,
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 1150).toISOString(),
        completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 3100).toISOString(),
        durationMs: 1950,
        input: { contextTokens: 3200, depth: "deep_analytical" },
        output: { keyInsights: ["Shift towards UGC Reels", "Shortened attribution window to 7-day click"] },
      },
      {
        nodeId: "node_rep_3",
        nodeName: "Generate Report",
        nodeType: "action",
        status: "completed",
        executionOrder: 3,
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 3150).toISOString(),
        completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 3600).toISOString(),
        durationMs: 450,
        input: { format: "Markdown", exportTarget: "AI Context Dashboard" },
        output: { reportId: "rep_9082", title: "Competitive Landscape Summary", status: "Published" },
      },
    ],
    logs: [
      { timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), level: "info", message: "Workflow triggered via Webhook inbound" },
      { timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 1100).toISOString(), level: "success", nodeName: "Fetch Research Sources", message: "Indexed 24 pages" },
      { timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 3100).toISOString(), level: "success", nodeName: "AI Analysis", message: "Synthesized competitive insights" },
      { timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 3600).toISOString(), level: "success", nodeName: "Generate Report", message: "Report published" },
      { timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 3650).toISOString(), level: "success", message: "Completed in 3.6s" },
    ],
  },
];

export const automationLogsApi = {
  /**
   * GET /api/automation/executions
   */
  getExecutions: async (params = {}) => {
    try {
      const res = await api.get("/api/automation/executions", { params });
      return res;
    } catch (err) {
      if (err.response?.status === 404) {
        return {
          data: {
            success: true,
            total: 0,
            totalPages: 1,
            page: 1,
            data: [],
          },
        };
      }
      throw err;
    }
  },

  /**
   * GET /api/automation/executions/:executionId
   */
  getExecutionById: async (executionId) => {
    return api.get(`/api/automation/executions/${executionId}`);
  },

  /**
   * DELETE /api/automation/executions/:executionId
   */
  deleteExecution: async (executionId) => {
    return api.delete(`/api/automation/executions/${executionId}`);
  },

  /**
   * DELETE /api/automation/executions
   * Clear all executions from database
   */
  clearAllExecutions: async () => {
    return api.delete("/api/automation/executions");
  },
};

export default automationLogsApi;
