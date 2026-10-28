import AutomationExecution from "../models/automationExecutionModel.js";
import AiAutomation from "../models/aiAutomationModel.js";
import WorkflowExecutionEngine from "../services/automation/workflowExecutionEngine.js";

export class AutomationExecutionController {
  /**
   * GET /api/automation/executions
   * List workflow execution history with search, filters, pagination.
   */
  static async getExecutions(req, res) {
    try {
      const userId = req.user._id;
      const {
        search = "",
        status = "all",
        dateRange = "all",
        startDate = null,
        endDate = null,
        sortBy = "newest",
        page = 1,
        limit = 10,
      } = req.query;

      const query = { userId };

      // Filter by search (Automation name, Workflow name, or Run ID)
      if (search && search.trim()) {
        const cleanSearch = search.trim();
        query.$or = [
          { executionId: { $regex: cleanSearch, $options: "i" } },
          { automationName: { $regex: cleanSearch, $options: "i" } },
          { workflowName: { $regex: cleanSearch, $options: "i" } },
        ];
      }

      // Filter by status
      if (status && status !== "all") {
        query.status = status;
      }

      // Filter by date range
      const now = new Date();
      if (dateRange === "today") {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query.startedAt = { $gte: startOfToday };
      } else if (dateRange === "7d") {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query.startedAt = { $gte: sevenDaysAgo };
      } else if (dateRange === "30d") {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        query.startedAt = { $gte: thirtyDaysAgo };
      } else if (startDate || endDate) {
        query.startedAt = {};
        if (startDate) query.startedAt.$gte = new Date(startDate);
        if (endDate) query.startedAt.$lte = new Date(endDate);
      }

      const sortOrder = sortBy === "oldest" ? 1 : -1;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
      const skip = (pageNum - 1) * limitNum;

      const [total, executions] = await Promise.all([
        AutomationExecution.countDocuments(query),
        AutomationExecution.find(query)
          .sort({ startedAt: sortOrder })
          .skip(skip)
          .limit(limitNum)
          .lean(),
      ]);

      return res.status(200).json({
        success: true,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        limit: limitNum,
        data: executions,
      });
    } catch (err) {
      console.error("[AutomationExecutionController getExecutions Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve automation execution logs",
        error: err.message,
      });
    }
  }

  /**
   * GET /api/automation/executions/:executionId
   * Retrieve single execution with all node results and logs.
   */
  static async getExecutionById(req, res) {
    try {
      const userId = req.user._id;
      const { executionId } = req.params;

      const execution = await AutomationExecution.findOne({
        executionId,
        userId,
      }).lean();

      if (!execution) {
        return res.status(404).json({
          success: false,
          message: "Execution record not found or access denied.",
        });
      }

      return res.status(200).json({
        success: true,
        data: execution,
      });
    } catch (err) {
      console.error("[AutomationExecutionController getExecutionById Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to load execution details",
        error: err.message,
      });
    }
  }

  /**
   * POST /api/automation/executions/run
   * Start a new workflow execution asynchronously and return execution immediately.
   */
  static async startExecution(req, res) {
    try {
      const userId = req.user._id;
      const { startNodeId = null, nodes = null, edges = null } = req.body || {};

      let automation = await AiAutomation.findOne({ userId });

      // Automatically sync latest canvas state from frontend so newly added workflows are immediately isolated
      if (Array.isArray(nodes) && nodes.length > 0) {
        if (!automation) {
          automation = new AiAutomation({ userId, nodes, edges: Array.isArray(edges) ? edges : [] });
        } else {
          automation.nodes = nodes;
          if (Array.isArray(edges)) {
            automation.edges = edges;
          }
        }
        await automation.save();
      }

      if (!automation || !automation.nodes || automation.nodes.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No workflow nodes configured to execute.",
        });
      }

      const { executionId, execution } = await WorkflowExecutionEngine.run({
        userId,
        automationId: automation._id,
        triggerType: "manual",
        startNodeId,
      });

      return res.status(200).json({
        success: true,
        message: "Workflow execution started successfully.",
        executionId,
        execution,
      });
    } catch (err) {
      console.error("[AutomationExecutionController startExecution Error]:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Failed to start workflow execution",
      });
    }
  }

  /**
   * DELETE /api/automation/executions/:executionId
   * Delete single execution log record.
   */
  static async deleteExecution(req, res) {
    try {
      const userId = req.user._id;
      const { executionId } = req.params;

      const deleted = await AutomationExecution.findOneAndDelete({
        executionId,
        userId,
      });

      // Also clean from legacy AiAutomation executionHistory if present
      await Promise.all([
        AiAutomation.updateMany(
          { userId },
          { $pull: { executionHistory: { id: executionId } } }
        ),
        AiAutomation.updateMany(
          { userId },
          { $pull: { executionHistory: { executionId: executionId } } }
        ),
      ]).catch(() => null);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Execution record not found or already deleted from database.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Automation execution record deleted from database successfully.",
        executionId,
      });
    } catch (err) {
      console.error("[AutomationExecutionController deleteExecution Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to delete execution record",
        error: err.message,
      });
    }
  }

  /**
   * DELETE /api/automation/executions
   * Clear all execution logs for the user.
   */
  static async clearAllExecutions(req, res) {
    try {
      const userId = req.user._id;

      await Promise.all([
        AutomationExecution.deleteMany({ userId }),
        AiAutomation.updateMany({ userId }, { $set: { executionHistory: [] } }),
      ]);

      return res.status(200).json({
        success: true,
        message: "All automation execution logs deleted from database successfully.",
      });
    } catch (err) {
      console.error("[AutomationExecutionController clearAllExecutions Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to clear all execution records",
        error: err.message,
      });
    }
  }

  /**
   * POST /api/automation/executions/:executionId/pause
   * Pause a currently running workflow.
   */
  static async pauseExecution(req, res) {
    try {
      const { executionId } = req.params;
      const paused = WorkflowExecutionEngine.pause(executionId);

      return res.status(200).json({
        success: true,
        message: paused ? "Execution pause requested." : "Execution not actively running or already paused.",
        executionId,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to pause execution",
        error: err.message,
      });
    }
  }

  /**
   * POST /api/automation/executions/:executionId/resume
   * Resume a paused workflow.
   */
  static async resumeExecution(req, res) {
    try {
      const { executionId } = req.params;
      const resumed = WorkflowExecutionEngine.resume(executionId);

      return res.status(200).json({
        success: true,
        message: resumed ? "Execution resumed successfully." : "Execution not in a paused state.",
        executionId,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to resume execution",
        error: err.message,
      });
    }
  }

  /**
   * POST /api/automation/executions/:executionId/cancel
   * Cancel an active or paused workflow.
   */
  static async cancelExecution(req, res) {
    try {
      const { executionId } = req.params;
      const cancelled = WorkflowExecutionEngine.cancel(executionId);

      return res.status(200).json({
        success: true,
        message: cancelled ? "Execution cancelled successfully." : "Execution not actively running.",
        executionId,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to cancel execution",
        error: err.message,
      });
    }
  }

  /**
   * POST /api/automation/executions/:executionId/retry/:nodeId
   * Retry execution from a failed node.
   */
  static async retryNodeExecution(req, res) {
    try {
      const userId = req.user._id;
      const { executionId, nodeId } = req.params;

      const result = await WorkflowExecutionEngine.retryNode({
        executionId,
        nodeId,
        userId,
      });

      return res.status(200).json({
        success: true,
        message: `Retry initiated for node "${nodeId}".`,
        data: result.execution,
      });
    } catch (err) {
      console.error("[AutomationExecutionController retryNodeExecution Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to retry node execution",
        error: err.message,
      });
    }
  }
}

export default AutomationExecutionController;
