import mongoose from "mongoose";
import { NotificationService } from "../notificationService.js";
import User from "../../models/authModel.js";
import MetaAccount from "../../models/metaAccount.js";
import GoogleAccount from "../../models/googleAccountModel.js";

export class ActionExecutor {
  /**
   * Execute a configured Action node.
   * @param {Object} actionNode - The action node with config
   * @param {string} userId - ID of the user owning the automation
   * @param {string} triggerSource - "manual" | "schedule" | "webhook"
   */
  static async execute(actionNode, userId, triggerSource = "manual") {
    const startTime = Date.now();
    const config = actionNode?.config || {};
    const actionType = config.actionType || "send_notification";
    const message = config.message || actionNode?.text || "Scheduled Automation Triggered";

    let userEmail = "user@newton.ai";
    let userName = "Marketing User";
    try {
      if (mongoose.connection.readyState === 1 && User?.findById && userId) {
        const user = await User.findById(userId).select("name email").lean();
        if (user) {
          userEmail = user.email || userEmail;
          userName = user.name || userName;
        }
      }
    } catch {
      // Degrades gracefully to fallback marketing recipient
    }

    let result = null;
    let error = null;
    let status = "success";

    try {
      switch (actionType) {
        case "send_notification": {
          const notificationPayload = {
            campaignName: `AI Automation [${triggerSource.toUpperCase()}]`,
            accountName: "Newton Marketing Engine",
            platform: "Automation Notification",
            assetCount: 1,
            recipient: userEmail,
            message: message,
            timestamp: new Date().toISOString(),
          };

          try {
            await NotificationService.sendAssetResolutionNotification(
              notificationPayload,
              { userEmail }
            );
          } catch (notifErr) {
            console.warn("[ActionExecutor Notification Warn]:", notifErr.message);
          }

          result = {
            action: "send_notification",
            recipient: userEmail,
            messageDispatched: message,
            deliveredAt: new Date().toISOString(),
          };
          break;
        }

        case "create_reminder": {
          result = {
            action: "create_reminder",
            taskTitle: `Reminder: ${message.slice(0, 60)}`,
            priority: config.priority || "Medium",
            assignedTo: userName,
            createdAt: new Date().toISOString(),
          };
          break;
        }

        case "ai_agent_task":
        case "generate_report": {
          const AiAgentOrchestrator = (await import("../agent/aiAgentOrchestrator.js")).default;
          const effectiveInstruction = String(
            message ||
              config.aiPrompt ||
              config.taskDescription ||
              node.taskDescription ||
              node.label ||
              ""
          ).trim();
          if (!effectiveInstruction) {
            throw new Error("Action node has no task instruction configured.");
          }
          const agentRes = await AiAgentOrchestrator.executeNodeTask({
            userId,
            instruction: effectiveInstruction,
            node,
            workflowId: context?.workflowId || context?.automationId || null,
            executionId: context?.executionId || null,
            sharedWorkflowContext: context?.sharedContext || {},
          });
          result = {
            action: actionType,
            taskInstruction: effectiveInstruction,
            status: agentRes.status === "WAITING_FOR_INPUT" ? "waiting_for_input" : "completed",
            summary: agentRes.response,
            toolCalls: agentRes.toolCalls,
            executionSummary: agentRes.executionSummary,
            dataProcessing: agentRes.dataProcessing,
            structuredData: agentRes.structuredData,
            executedAt: new Date().toISOString(),
          };
          break;
        }

        default: {
          result = {
            action: actionType,
            message: message,
            executedAt: new Date().toISOString(),
          };
        }
      }
    } catch (err) {
      status = "failed";
      error = err.message || "Failed to execute action";
      console.error("[ActionExecutor Error]:", err);
    }

    const durationMs = Date.now() - startTime;

    return {
      status,
      actionType,
      message,
      result,
      error,
      durationMs,
    };
  }
}

export default ActionExecutor;
