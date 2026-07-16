import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import { doubleCsrf } from "csrf-csrf";
import router from "./routes";
import { logger } from "./lib/logger";
import { rateLimitMiddleware } from "./middlewares/rate-limit";
import { getQueueStats } from "./lib/order-queue";

const app: Express = express();
// app.set('trust proxy', 1);
app.set('trust proxy', 1);

// Request ID Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers["x-request-id"] as string) || randomUUID();
  req.headers["x-request-id"] = reqId;
  res.setHeader("x-request-id", reqId);
  next();
});

// ====================== SECURITY MIDDLEWARES ======================

// 1. Helmet — Security Headers (XSS, Clickjacking, HSTS, etc.)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
    hsts: process.env.NODE_ENV === "production",
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

// 2. CORS — Strict Configuration
const allowedOrigin = process.env["FRONTEND_ORIGIN"] ?? "http://localhost:5173";

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-CSRF-Token",
    ],
    exposedHeaders: ["Set-Cookie"],
    maxAge: 86400, // 24 hours preflight cache
  })
);

// 3. Request Logging with Sensitive Data Redaction
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.headers["x-request-id"],
          method: req.method,
          url: req.url?.split("?")[0],
          ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
    redact: [
      "req.headers.authorization",
      "req.body.password",
      "req.body.pwd",
      "req.body.token",
      "req.body.secret",
      "req.body.new_password",
      "req.body.old_password",
    ],
  })
);

// 4. Body Parser with Size Limits (protection against large payload attacks)
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// 5. Cookie Parser with secure defaults
app.use(cookieParser());

// ====================== CSRF PROTECTION ======================
// Only set the Secure flag when the frontend is served over HTTPS.
// When running locally over HTTP the browser would silently drop a
// Secure cookie, making every CSRF-protected request fail with 403.
const csrfCookieSecure =
  (process.env["FRONTEND_ORIGIN"] ?? "").startsWith("https://") ||
  (process.env["FRONTEND_URL"] ?? "").startsWith("https://");

const {
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => process.env["WEBHOOK_SECRET"] ?? "csrf-secret",
  getSessionIdentifier: (req) =>
    // Use the ERPNext session cookie as the stable session identifier.
    // For unauthenticated requests (signup, contact) fall back to IP.
    req.headers["cookie"]?.match(/sid=([^;]+)/)?.[1] ||
    req.socket.remoteAddress ||
    "unknown",
  cookieName: "__oxigen-csrf",
  cookieOptions: {
    sameSite: "lax",
    secure: csrfCookieSecure,
    httpOnly: true,
    path: "/",
  },
  size: 64,
});

// Expose CSRF token endpoint (unguarded — called before login)
app.get("/api/csrf-token", (req: Request, res: Response) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});

// CSRF middleware — protects all state-changing routes except webhooks (non-browser)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (
    req.method === "GET" ||
    req.path.startsWith("/api/auth/") ||
    req.path.startsWith("/api/webhooks") ||
    req.path === "/health"
  ) {
    next();
    return;
  }
  doubleCsrfProtection(req, res, next);
});

// 6. General Rate Limiting
app.use(rateLimitMiddleware);

// ====================== ROUTES ======================
app.use("/api", router);

// ====================== HEALTH CHECK ======================
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    queue: getQueueStats(),
  });
});

// ====================== GLOBAL ERROR HANDLER ======================
app.use((err: Error & { statusCode?: number; status?: number }, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, reqId: req.headers["x-request-id"] }, "Unhandled error occurred");

  const statusCode = (err as { statusCode?: number }).statusCode
    || (err as { status?: number }).status
    || 500;

  res.status(statusCode).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal Server Error"
        : err.message || "Something went wrong",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

export default app;
