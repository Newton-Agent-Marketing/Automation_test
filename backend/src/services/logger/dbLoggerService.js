import mongoose from "mongoose";

class DbLoggerService {
  constructor() {
    this.originalLog = console.log.bind(console);
    this.originalInfo = console.info.bind(console);
    this.originalWarn = console.warn.bind(console);
    this.originalError = console.error.bind(console);
    
    this.logQueue = [];
    this.isFlushing = false;
    this.isInitialized = false;
    this.flushInterval = null;
  }

  /**
   * Format arguments into clean message string + metadata object
   */
  formatArgs(args) {
    if (!args || args.length === 0) return { message: "", meta: null };

    const formatted = args.map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ""}`;
      if (typeof arg === "object") {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    });

    const message = formatted.join(" ");
    let meta = null;

    if (args.length === 1 && typeof args[0] === "object" && !(args[0] instanceof Error)) {
      meta = args[0];
    } else if (args.length > 1) {
      const last = args[args.length - 1];
      if (typeof last === "object" && !(last instanceof Error)) {
        meta = last;
      }
    }

    return { message, meta };
  }

  /**
   * Queue a log entry for DB persistence
   */
  enqueueLog(level, args) {
    if (this.isFlushing) return; // Prevent recursion loops during DB flush

    const { message, meta } = this.formatArgs(args);
    if (!message || !message.trim()) return;

    // Filter out redundant noise logs if necessary
    if (message.includes("SystemLog.insertMany") || message.includes("[DbLoggerService]")) {
      return;
    }

    this.logQueue.push({
      level,
      message: message.trim().slice(0, 5000), // Max message length 5KB
      meta: meta ? JSON.parse(JSON.stringify(meta)) : null,
      source: "backend",
      createdAt: new Date(),
    });

    // Flush immediately if queue is getting large
    if (this.logQueue.length >= 25) {
      this.flushQueue();
    }
  }

  /**
   * Flush queued log entries to MongoDB
   */
  async flushQueue() {
    if (this.isFlushing || this.logQueue.length === 0) return;
    if (mongoose.connection.readyState !== 1) return; // DB not connected yet

    this.isFlushing = true;
    const batch = [...this.logQueue];
    this.logQueue = [];

    try {
      const SystemLog = (await import("../../models/systemLogModel.js")).default;
      await SystemLog.insertMany(batch, { ordered: false });
    } catch (err) {
      this.originalError("❌ [DbLoggerService] Failed to insert log batch into MongoDB:", err.message);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Initialize console interceptors and periodic flush timer
   */
  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const self = this;

    console.log = function (...args) {
      self.originalLog(...args);
      self.enqueueLog("log", args);
    };

    console.info = function (...args) {
      self.originalInfo(...args);
      self.enqueueLog("info", args);
    };

    console.warn = function (...args) {
      self.originalWarn(...args);
      self.enqueueLog("warn", args);
    };

    console.error = function (...args) {
      self.originalError(...args);
      self.enqueueLog("error", args);
    };

    // Periodically flush logs to MongoDB every 2 seconds
    this.flushInterval = setInterval(() => {
      this.flushQueue();
    }, 2000);

    this.originalLog("✅ [DbLoggerService] Terminal console logs successfully hooked to MongoDB!");
  }

  /**
   * Retrieve recent logs from database
   */
  async getRecentLogs({ limit = 50, level = null } = {}) {
    try {
      const SystemLog = (await import("../../models/systemLogModel.js")).default;
      const query = {};
      if (level) query.level = level;

      return await SystemLog.find(query)
        .sort({ createdAt: -1 })
        .limit(Math.min(limit, 200))
        .lean();
    } catch (err) {
      return [];
    }
  }
}

export const dbLoggerService = new DbLoggerService();
export default dbLoggerService;
