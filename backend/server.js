import "dotenv/config";
import http from "http";
import app from "./src/app.js";
import dbConnect from "./src/config/db.js";
import { MetaSyncScheduler } from "./src/Scheduler/metaSyncInsight.js";
import { AiAutomationScheduler } from "./src/Scheduler/aiAutomationScheduler.js";
import SpreadsheetSyncService from "./src/services/data/spreadsheetSyncService.js";
import { initSocket } from "./src/socket/index.js";
import dbLoggerService from "./src/services/logger/dbLoggerService.js";

const PORT = process.env.PORT || 3000;

// Initialize terminal console log interceptor to save logs to MongoDB
dbLoggerService.init();

dbConnect();
MetaSyncScheduler.startCronJob();
AiAutomationScheduler.startScheduler();
SpreadsheetSyncService.startPolling(60);

const server = http.createServer(app);
initSocket(server);

// Keep-alive timeouts for reverse proxies (Nginx / Cloudflare) to prevent socket drops & "The network connection was lost"
server.keepAliveTimeout = 65000; // 65 seconds (must be higher than Nginx keepalive_timeout 60s)
server.headersTimeout = 66000;   // 66 seconds (must be higher than keepAliveTimeout)

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
