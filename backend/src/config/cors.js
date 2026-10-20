const staticAllowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:3000",
  "http://34.131.40.86",
  "https://34.131.40.86",
];

export const isOriginAllowed = (origin) => {
  // Allow requests with no origin (like mobile apps, curl, server-to-server)
  if (!origin) return true;

  const cleanOrigin = origin.trim().replace(/\/$/, "");

  // Read environment variable(s) - support comma separated list
  const envOrigins = (process.env.FRONTEND_URL || "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);

  const allAllowed = [...staticAllowedOrigins, ...envOrigins];

  // Exact match in whitelist
  if (allAllowed.includes(cleanOrigin)) {
    return true;
  }

  // Allow localhost or 127.0.0.1 with any port
  if (/^http:\/\/localhost(:\d+)?$/.test(cleanOrigin)) return true;
  if (/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(cleanOrigin)) return true;

  // Allow VM / Server IP 34.131.40.86 with any port
  if (/^https?:\/\/34\.131\.40\.86(:\d+)?$/.test(cleanOrigin)) return true;

  // Allow Vercel deployments (*.vercel.app)
  if (/^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(cleanOrigin)) return true;

  // Allow Render deployments (*.onrender.com)
  if (/^https:\/\/[a-zA-Z0-9_-]+\.onrender\.com$/.test(cleanOrigin)) return true;

  return false;
};

export const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS Blocked] Origin not allowed: ${origin}`);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "ngrok-skip-browser-warning",
    "X-Requested-With",
    "Accept",
  ],
};
