// backend/src/Scheduler/aiAutomationScheduler.js
import cron from "node-cron";
import AiAutomation from "../models/aiAutomationModel.js";
import AutomationExecution from "../models/automationExecutionModel.js";
import WorkflowExecutionEngine, { getAllWorkflowSubgraphs } from "../services/automation/workflowExecutionEngine.js";
import { getIo } from "../socket/index.js";

/**
 * AI Automation Background Scheduler
 *
 * Supports:
 * - Daily 12:00 AM (00:00) and arbitrary HH:MM schedules in configured workflow timezone (e.g., Asia/Kolkata)
 * - Specific-date, daily, weekly, and monthly recurrences
 * - Strict respect for pause/disable state (`isActive === true`)
 * - Deterministic duplicate prevention per scheduled occurrence (`scheduledOccurrenceKey`)
 * - Safe missed-occurrence recovery across server restarts (within recovery window)
 */
export class AiAutomationScheduler {
  static cronTask = null;
  static isChecking = false;
  static inFlightOccurrenceKeys = new Set();

  /**
   * Parse time configuration into 24-hour { hour, minute } supporting:
   * - "00:00" (24h midnight)
   * - "12:00 AM" / { time: "12:00", ampm: "AM" } -> { hour: 0, minute: 0 }
   * - "12:00 PM" / { time: "12:00", ampm: "PM" } -> { hour: 12, minute: 0 }
   */
  static parseTargetTime(timeConfig = {}) {
    const rawTime = String(timeConfig?.time ?? "").trim();
    if (!rawTime) return null;

    let ampm = timeConfig?.ampm ? String(timeConfig.ampm).trim().toUpperCase() : null;
    let cleanTime = rawTime;
    if (/pm$/i.test(cleanTime)) {
      ampm = "PM";
      cleanTime = cleanTime.replace(/pm$/i, "").trim();
    } else if (/am$/i.test(cleanTime)) {
      ampm = "AM";
      cleanTime = cleanTime.replace(/am$/i, "").trim();
    }

    const parts = cleanTime.split(":");
    if (parts.length < 2) return null;
    let hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    if (Number.isNaN(hour) || Number.isNaN(minute) || minute < 0 || minute > 59) return null;

    // Note: If rawTime is already "00:00" or >12 (24h format), preserve 24h semantics accurately
    if (hour === 0 && ampm === "AM") {
      hour = 0;
    } else if (hour > 12) {
      // Explicit 24-hour string (e.g., "15:30") ignores stale ampm field
    } else if (ampm === "PM" && hour < 12) {
      hour += 12;
    } else if (ampm === "AM" && hour === 12) {
      hour = 0;
    }

    if (hour < 0 || hour > 23) return null;
    return {
      hour,
      minute,
      padded: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    };
  }

  /**
   * Format a Date object into calendar + clock components in the workflow's timezone.
   */
  static getLocalTimeParts(dateObj = new Date(), timezone = "Asia/Kolkata") {
    let tz = timezone || "Asia/Kolkata";
    try {
      Intl.DateTimeFormat("en-US", { timeZone: tz });
    } catch (_) {
      tz = "Asia/Kolkata";
    }

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long",
      hourCycle: "h23",
    });

    const parts = formatter.formatToParts(dateObj);
    const map = {};
    for (const part of parts) {
      map[part.type] = part.value;
    }

    let hourNum = parseInt(map.hour, 10);
    if (hourNum === 24) hourNum = 0;

    return {
      timezone: tz,
      year: parseInt(map.year, 10),
      month: parseInt(map.month, 10),
      day: parseInt(map.day, 10),
      dateStr: `${map.year}-${map.month}-${map.day}`,
      hour: hourNum,
      minute: parseInt(map.minute, 10),
      weekday: (map.weekday || "").toLowerCase(),
    };
  }

  /**
   * Check whether the workflow's Date/Time recurrence matches a given local date.
   */
  static doesDateMatchSchedule({ dateNode, timeNode, localParts }) {
    const timeRecurrence = String(timeNode?.config?.recurrence || "daily").toLowerCase();

    if (!dateNode?.config) {
      if (timeRecurrence === "weekdays") {
        return !["saturday", "sunday"].includes(localParts.weekday);
      }
      return true;
    }

    const dateMode = dateNode.config.dateType || dateNode.config.dateMode || "recurring";
    const recurringPattern =
      dateNode.config.recurrencePattern || dateNode.config.recurringPattern || "every_day";

    // If user configured a specific one-off date AND time node is "once", enforce exact date match.
    // If timeNode recurrence is "daily", run daily starting on or after specificDate (if set).
    if (dateMode === "specific") {
      const rawTarget = String(dateNode.config.specificDate || "").trim();
      if (rawTarget) {
        const dParts = rawTarget.split("-");
        if (dParts.length === 3) {
          const normalizedTarget = `${dParts[0]}-${String(dParts[1]).padStart(2, "0")}-${String(
            dParts[2]
          ).padStart(2, "0")}`;
          if (timeRecurrence === "daily") {
            return localParts.dateStr >= normalizedTarget;
          }
          return localParts.dateStr === normalizedTarget;
        }
      }
      return true;
    }

    if (dateMode === "recurring") {
      if (recurringPattern === "every_day") {
        return true;
      }
      if (recurringPattern === "every_week") {
        const days = Array.isArray(dateNode.config.selectedDaysOfWeek)
          ? dateNode.config.selectedDaysOfWeek
          : [dateNode.config.selectedDayOfWeek || "Monday"];
        return days.some((d) => d && String(d).toLowerCase() === localParts.weekday);
      }
      if (recurringPattern === "every_month") {
        const targetDay = parseInt(dateNode.config.dayOfMonth, 10);
        if (!Number.isNaN(targetDay)) {
          return localParts.day === targetDay;
        }
      }
    }

    return true;
  }

  /**
   * Compute the next scheduled execution Date for UI display & persistence.
   */
  static calculateNextRun(nodes = [], referenceDate = new Date()) {
    const timeNode = (nodes || []).find((n) => n.type === "time" && n.config?.time);
    const triggerNode = (nodes || []).find((n) => n.type === "trigger" && n.config?.scheduleTime);
    const effectiveTimeConfig = timeNode?.config || (triggerNode?.config?.scheduleTime ? { time: triggerNode.config.scheduleTime, timezone: triggerNode.config.timezone } : null);
    if (!effectiveTimeConfig) return null;

    const target = this.parseTargetTime(effectiveTimeConfig);
    if (!target) return null;

    const dateNode = (nodes || []).find((n) => n.type === "date") || null;
    const timezone =
      effectiveTimeConfig.timezone || dateNode?.config?.timezone || "Asia/Kolkata";

    // Scan minute-by-minute / hour-by-hour up to 35 days ahead to find exact next matching instant in timezone
    const baseMs = Math.ceil(referenceDate.getTime() / 60000) * 60000;
    for (let dayOffset = 0; dayOffset <= 35; dayOffset++) {
      // Sample midday of candidate offset day to obtain local Y-M-D, then locate exact target hour:minute
      const probe = new Date(baseMs + dayOffset * 86400000);
      const probeParts = this.getLocalTimeParts(probe, timezone);
      const deltaMinutes =
        (target.hour - probeParts.hour) * 60 + (target.minute - probeParts.minute);
      const candidate = new Date(probe.getTime() + deltaMinutes * 60000);
      candidate.setUTCSeconds(0, 0);

      if (candidate.getTime() <= referenceDate.getTime()) continue;

      const candidateParts = this.getLocalTimeParts(candidate, timezone);
      if (
        candidateParts.hour === target.hour &&
        candidateParts.minute === target.minute &&
        this.doesDateMatchSchedule({ dateNode, timeNode, localParts: candidateParts })
      ) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Start background minute-level cron scheduler + startup missed-occurrence recovery.
   */
  static start() {
    if (this.cronTask) return;

    console.log("⏰ [AiAutomationScheduler] Initialized background cron watcher (* * * * *).");

    this.cronTask = cron.schedule("* * * * *", async () => {
      await this.checkAndRunDueAutomations(new Date(), { allowStartupCatchUp: false });
    });

    // Startup check (handles server restart around 12:00 AM safely without duplicating runs)
    setTimeout(() => {
      this.checkAndRunDueAutomations(new Date(), { allowStartupCatchUp: true }).catch((err) => {
        console.warn("[AiAutomationScheduler Startup Check Warning]:", err.message);
      });
    }, 3000);
  }

  static startScheduler() {
    return this.start();
  }

  static stop() {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
    }
  }

  /**
   * Inspect all active scheduled automations and execute any workflow due at `referenceDate`.
   * Returns a summary array of triggered / skipped runs for observability & testing.
   */
  static async checkAndRunDueAutomations(
    referenceDate = new Date(),
    { allowStartupCatchUp = false, catchUpWindowMinutes = 60 } = {}
  ) {
    if (this.isChecking) return [];
    this.isChecking = true;
    const triggeredRuns = [];

    try {
      // Strictly respect pause/disable: ONLY inspect automations where isActive === true
      const activeAutomations = await AiAutomation.find({
        isActive: true,
        "nodes.0": { $exists: true },
      });

      for (const automation of activeAutomations) {
        try {
          const nodes = automation.nodes || [];
          const edges = automation.edges || [];
          if (!nodes.length) continue;

          const subgraphs = getAllWorkflowSubgraphs(nodes, edges);

          for (const sub of subgraphs) {
            const dateNode = sub.nodes.find((n) => n.type === "date") || null;
            const timeNode = sub.nodes.find((n) => n.type === "time") || null;
            const triggerNode = sub.nodes.find((n) => n.type === "trigger") || null;

            const timeConfig =
              timeNode?.config?.time
                ? timeNode.config
                : triggerNode?.config?.scheduleTime
                ? {
                    time: triggerNode.config.scheduleTime,
                    ampm: triggerNode.config.ampm,
                    timezone: triggerNode.config.timezone,
                    recurrence: triggerNode.config.recurrence || "daily",
                  }
                : null;

            if (!timeConfig) continue;

            // Ensure there is at least one executable task node in this subgraph
            const hasExecutableTask = sub.nodes.some(
              (n) =>
                n.type === "generic" ||
                n.type === "action" ||
                (n.type === "trigger" &&
                  n.text &&
                  !["start workflow", "trigger node", "trigger", "start"].includes(
                    n.text.trim().toLowerCase()
                  ))
            );
            if (!hasExecutableTask) continue;

            const targetTime = this.parseTargetTime(timeConfig);
            if (!targetTime) continue;

            const timezone =
              timeConfig.timezone || dateNode?.config?.timezone || "Asia/Kolkata";
            const localParts = this.getLocalTimeParts(referenceDate, timezone);

            if (!this.doesDateMatchSchedule({ dateNode, timeNode, localParts })) {
              continue;
            }

            const nowMinutesOfDay = localParts.hour * 60 + localParts.minute;
            const targetMinutesOfDay = targetTime.hour * 60 + targetTime.minute;
            const exactMinuteMatch = nowMinutesOfDay === targetMinutesOfDay;

            let missedCatchUpMatch = false;
            if (
              !exactMinuteMatch &&
              allowStartupCatchUp &&
              nowMinutesOfDay > targetMinutesOfDay &&
              nowMinutesOfDay - targetMinutesOfDay <= catchUpWindowMinutes
            ) {
              // Recover missed scheduled run if server was restarting at target time,
              // provided the automation existed before today's scheduled minute.
              const scheduledApproxMs =
                referenceDate.getTime() - (nowMinutesOfDay - targetMinutesOfDay) * 60000;
              const createdMs = automation.createdAt ? new Date(automation.createdAt).getTime() : 0;
              if (createdMs <= scheduledApproxMs + 60000) {
                missedCatchUpMatch = true;
              }
            }

            if (!exactMinuteMatch && !missedCatchUpMatch) {
              continue;
            }

            const rootId =
              sub.rootTaskNode?.id ||
              sub.rootNode?.id ||
              sub.actionNode?.id ||
              sub.nodes[0]?.id ||
              "root";
            const startId =
              sub.actionNode?.id ||
              sub.directTaskNode?.id ||
              sub.rootTaskNode?.id ||
              sub.rootNode?.id ||
              sub.nodes[0]?.id;

            const occurrenceKey = `sched:${automation._id}:${rootId}:${localParts.dateStr}:${targetTime.padded}`;

            if (this.inFlightOccurrenceKeys.has(occurrenceKey)) {
              continue;
            }

            // Persistent duplicate prevention check in MongoDB
            const existingOccurrence = await AutomationExecution.findOne({
              automationId: automation._id,
              scheduledOccurrenceKey: occurrenceKey,
            })
              .select("executionId status")
              .lean();

            if (existingOccurrence) {
              continue;
            }

            this.inFlightOccurrenceKeys.add(occurrenceKey);

            try {
              const workflowNodeIds = sub.nodes.map((n) => n.id);
              console.log(
                `🚀 [AiAutomationScheduler] Triggering scheduled workflow "${
                  sub.workflowName || automation.name
                }" [Occurrence: ${occurrenceKey}, Timezone: ${timezone}]`
              );

              const runRes = await WorkflowExecutionEngine.run({
                automationId: automation._id,
                userId: automation.userId,
                triggerType: "schedule",
                startNodeId: startId,
                workflowNodeIds,
                scheduledOccurrenceKey: occurrenceKey,
                scheduledDate: localParts.dateStr,
                timezone,
              });

              const nextRunAt = this.calculateNextRun(nodes, referenceDate);
              await AiAutomation.updateOne(
                { _id: automation._id },
                { $set: { nextRunAt, lastScheduledOccurrenceKey: occurrenceKey } }
              ).catch(() => {});

              try {
                const io = getIo();
                if (io && automation.userId) {
                  const eventPayload = {
                    executionId: runRes.executionId,
                    automationId: automation._id,
                    workflowName: sub.workflowName || automation.name,
                    scheduledTime: targetTime.padded,
                    scheduledDate: localParts.dateStr,
                    timezone,
                    startNodeId: startId,
                  };
                  io.to(`user:${automation.userId.toString()}`).emit("automation:scheduled_start", eventPayload);
                  io.to(`user:${automation.userId.toString()}`).emit("automation:scheduled_run", eventPayload);
                }
              } catch (_) {}

              triggeredRuns.push({
                automationId: String(automation._id),
                executionId: runRes.executionId,
                scheduledOccurrenceKey: occurrenceKey,
                scheduledDate: localParts.dateStr,
                scheduledTime: targetTime.padded,
                timezone,
                completionPromise: runRes.completionPromise,
              });
            } finally {
              this.inFlightOccurrenceKeys.delete(occurrenceKey);
            }
          }
        } catch (autoErr) {
          console.error(`[AiAutomationScheduler Error for ${automation._id}]:`, autoErr.message);
        }
      }
    } catch (err) {
      console.error("[AiAutomationScheduler Global Check Error]:", err.message);
    } finally {
      this.isChecking = false;
    }

    return triggeredRuns;
  }
}

export default AiAutomationScheduler;
