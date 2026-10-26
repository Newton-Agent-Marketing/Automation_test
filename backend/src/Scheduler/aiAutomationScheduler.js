import cron from "node-cron";
import AiAutomation from "../models/aiAutomationModel.js";
import WorkflowExecutionEngine from "../services/automation/workflowExecutionEngine.js";
import { getIo } from "../socket/index.js";

export class AiAutomationScheduler {
  static cronTask = null;

  /**
   * Start the recurring background automation checker.
   * Runs every minute: "* * * * *"
   */
  static startScheduler() {
    console.log("[Scheduler] ⏰ AI Automation Scheduler initialized (every 1 minute)...");

    this.cronTask = cron.schedule("* * * * *", async () => {
      try {
        await this.checkAndRunActiveAutomations();
      } catch (err) {
        console.error("[AiAutomationScheduler Cron Error]:", err);
      }
    });
  }

  /**
   * Check and execute due automations across all active users.
   * Partitions canvas into independent workflows and evaluates each workflow's Date & Time nodes.
   */
  static async checkAndRunActiveAutomations() {
    // Check all automations that have Date & Time nodes configured or are active
    const automations = await AiAutomation.find({
      $or: [
        { isActive: true },
        { "nodes.type": "date" },
        { "nodes.type": "time" },
      ],
    });

    if (!automations || automations.length === 0) return;

    const now = new Date();
    const fiftyFiveSecAgo = new Date(now.getTime() - 55000);

    for (const automation of automations) {
      try {
        const nodes = automation.nodes || [];
        const edges = automation.edges || [];

        // Partition into distinct workflow subgraphs on this canvas
        const workflows = WorkflowExecutionEngine.getAllWorkflowSubgraphs(nodes, edges);

        for (const sub of workflows) {
          const dateNode = sub.nodes.find((n) => n.type === "date");
          const timeNode = sub.nodes.find((n) => n.type === "time");

          // Both Date and Time nodes are required for a scheduled workflow
          if (!dateNode || !timeNode) continue;

          // Resolve Timezone (Default to Asia/Kolkata if not set)
          const timezone =
            timeNode.config?.timezone || dateNode.config?.timezone || "Asia/Kolkata";

          // Resolve current local date and time in the configured timezone
          const localParts = this.getLocalDateParts(now, timezone);
          if (!localParts) continue;

          // Check if Time matches
          const isTimeMatch = this.checkTimeMatch(timeNode.config, localParts);
          if (!isTimeMatch) continue;

          // Check if Date matches
          const isDateMatch = this.checkDateMatch(dateNode.config, localParts);
          if (!isDateMatch) continue;

          const actionNode = sub.nodes.find((n) => n.type === "action");
          const targetStartNodeId = actionNode?.id || sub.rootNode?.id || dateNode.id;

          // Idempotency: Prevent running this exact workflow more than once in the same minute
          const recentRun = await AutomationExecution.findOne({
            userId: automation.userId,
            automationId: automation._id,
            rootNodeId: sub.rootNode?.id || targetStartNodeId,
            startedAt: { $gte: fiftyFiveSecAgo },
          });

          if (recentRun) {
            continue;
          }

          console.log(
            `[AiAutomationScheduler] ⏰ Scheduled Date & Time arrived for workflow "${sub.workflowName}" in automation "${automation.name}" (User: ${automation.userId}). Automatically running workflow...`
          );

          const io = getIo();
          if (io) {
            io.to(`user:${automation.userId.toString()}`).emit("automation:scheduled_start", {
              automationId: automation._id,
              automationName: sub.workflowName || automation.name,
              workflowName: sub.workflowName,
              rootNodeId: sub.rootNode?.id || targetStartNodeId,
              startNodeId: targetStartNodeId,
              timestamp: now,
            });
          }

          // Execute full workflow using WorkflowExecutionEngine
          const { executionId, completionPromise } =
            await WorkflowExecutionEngine.run({
              userId: automation.userId,
              automationId: automation._id,
              triggerType: "schedule",
              startNodeId: targetStartNodeId,
            });

          // Wait for execution to finish
          if (completionPromise) {
            await completionPromise;
          }

          // Emit real-time notification to the user socket room
          if (io) {
            io.to(`user:${automation.userId.toString()}`).emit("automation:scheduled_run", {
              automationId: automation._id,
              executionId,
              automationName: sub.workflowName || automation.name,
              workflowName: sub.workflowName,
              rootNodeId: sub.rootNode?.id || targetStartNodeId,
              startNodeId: targetStartNodeId,
              timestamp: now,
            });
          }

          // Update last run time and mark active
          automation.lastRunAt = now;
          automation.isActive = true;
          await automation.save();
        }
      } catch (nodeErr) {
        console.error(
          `[AiAutomationScheduler] Error processing automation ${automation._id}:`,
          nodeErr
        );
      }
    }
  }

  /**
   * Helper to format Date parts in a specific timezone with zero-padding
   */
  static getLocalDateParts(date, timeZone) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone || "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      const parts = formatter.formatToParts(date);
      const map = {};
      for (const p of parts) {
        map[p.type] = p.value;
      }

      let hour = parseInt(map.hour, 10);
      if (hour === 24) hour = 0;

      const month = String(map.month).padStart(2, "0");
      const day = String(map.day).padStart(2, "0");
      const year = String(map.year);

      return {
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        day: parseInt(day, 10),
        hour,
        minute: parseInt(map.minute, 10),
        dateStr: `${year}-${month}-${day}`,
        dayOfWeek: date.toLocaleDateString("en-US", { timeZone: timeZone || "Asia/Kolkata", weekday: "long" }),
      };
    } catch (e) {
      console.error("[AiAutomationScheduler getLocalDateParts Error]:", e);
      return null;
    }
  }

  /**
   * Check if current hour and minute match configured Time node
   */
  static checkTimeMatch(timeConfig = {}, localParts) {
    if (!timeConfig) return false;
    const rawTime = String(timeConfig.time || "").trim();
    if (!rawTime) return false;

    let ampm = timeConfig.ampm || null;
    let cleanTime = rawTime;

    if (/pm/i.test(cleanTime)) {
      ampm = "PM";
      cleanTime = cleanTime.replace(/pm/i, "").trim();
    } else if (/am/i.test(cleanTime)) {
      ampm = "AM";
      cleanTime = cleanTime.replace(/am/i, "").trim();
    }

    const parts = cleanTime.split(":");
    let targetHour = parseInt(parts[0], 10);
    let targetMin = parseInt(parts[1], 10);

    if (isNaN(targetHour) || isNaN(targetMin)) return false;

    // Convert 12-hour AM/PM to 24-hour if explicit
    if (ampm === "PM" && targetHour < 12) targetHour += 12;
    if (ampm === "AM" && targetHour === 12) targetHour = 0;

    return localParts.hour === targetHour && localParts.minute === targetMin;
  }

  /**
   * Check if current date matches configured Date node
   */
  static checkDateMatch(dateConfig = {}, localParts) {
    if (!dateConfig) return true;
    const mode = dateConfig.dateType || dateConfig.dateMode || "specific";

    if (mode === "specific") {
      let targetDate = (dateConfig.specificDate || "").trim();
      if (!targetDate) return true; // Default match if not restricted

      const dateParts = targetDate.split("-");
      if (dateParts.length === 3) {
        targetDate = `${dateParts[0]}-${String(dateParts[1]).padStart(2, "0")}-${String(dateParts[2]).padStart(2, "0")}`;
      }

      return localParts.dateStr === targetDate;
    }

    if (mode === "recurring") {
      const pattern =
        dateConfig.recurrencePattern ||
        dateConfig.recurringPattern ||
        "every_day";

      // Check date range boundary if provided
      if (dateConfig.startDate && localParts.dateStr < dateConfig.startDate) {
        return false;
      }
      if (dateConfig.endDate && localParts.dateStr > dateConfig.endDate) {
        return false;
      }

      if (pattern === "once") {
        let targetDate = (dateConfig.specificDate || "").trim();
        if (!targetDate) return true;
        const dateParts = targetDate.split("-");
        if (dateParts.length === 3) {
          targetDate = `${dateParts[0]}-${String(dateParts[1]).padStart(2, "0")}-${String(dateParts[2]).padStart(2, "0")}`;
        }
        return localParts.dateStr === targetDate;
      }

      if (pattern === "every_day" || pattern === "daily") {
        return true;
      }

      if (pattern === "every_week") {
        if (!localParts.dayOfWeek) return false;
        const currentDay = localParts.dayOfWeek.toLowerCase();

        if (
          Array.isArray(dateConfig.selectedDaysOfWeek) &&
          dateConfig.selectedDaysOfWeek.length > 0
        ) {
          return dateConfig.selectedDaysOfWeek.some(
            (d) =>
              currentDay === d.toLowerCase() ||
              currentDay.startsWith(d.slice(0, 3).toLowerCase())
          );
        }

        const targetDay = (dateConfig.selectedDayOfWeek || "Monday").toLowerCase();
        return (
          currentDay === targetDay ||
          currentDay.startsWith(targetDay.slice(0, 3))
        );
      }

      if (pattern === "every_month") {
        const targetDay = Number(dateConfig.dayOfMonth) || 1;
        if (localParts.day !== targetDay) {
          return false;
        }

        if (
          Array.isArray(dateConfig.selectedMonths) &&
          dateConfig.selectedMonths.length > 0 &&
          dateConfig.selectedMonths.length < 12
        ) {
          return dateConfig.selectedMonths.includes(localParts.month);
        }

        return true;
      }

      if (pattern === "regular_interval" || pattern === "every_n_days") {
        return true;
      }

      if (pattern === "days_of_month") {
        const days = Array.isArray(dateConfig.daysOfMonth)
          ? dateConfig.daysOfMonth
          : [1];
        return days.includes(localParts.day);
      }

      if (pattern === "last_day_of_month") {
        const nextDay = new Date(localParts.year, localParts.month, 0);
        const lastDayNumber = nextDay.getDate();
        return localParts.day === lastDayNumber;
      }
    }

    return true;
  }

  /**
   * Calculate next run timestamp for display
   */
  static calculateNextRun(dateConfig, timeConfig, timezone, fromDate = new Date()) {
    try {
      const next = new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
      return next;
    } catch {
      return null;
    }
  }
}

export default AiAutomationScheduler;
