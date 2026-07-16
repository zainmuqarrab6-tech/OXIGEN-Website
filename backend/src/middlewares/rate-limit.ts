import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Different limits for different route types
const LIMITS = {
  login:          { max: 10, windowMs: 15 * 60 * 1000 }, // 10 attempts / 15 min
  signup:         { max: 5,  windowMs: 60 * 60 * 1000 }, // 5 attempts / hour
  forgotPassword: { max: 5,  windowMs: 60 * 60 * 1000 }, // 5 attempts / hour
  resetPassword:  { max: 5,  windowMs: 60 * 60 * 1000 }, // 5 attempts / hour
  setPassword:    { max: 10, windowMs: 60 * 60 * 1000 }, // 10 attempts / hour
  changePassword: { max: 5,  windowMs: 15 * 60 * 1000 }, // 5 attempts / 15 min
  contact:        { max: 5,  windowMs: 60 * 60 * 1000 }, // 5 submissions / hour
  default:        { max: 100, windowMs: 60 * 1000 },      // 100 requests / min
} as const;

// Cleanup old entries every 30 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 30 * 60 * 1000);

export function createRateLimiter(type: keyof typeof LIMITS) {
  const { max, windowMs } = LIMITS[type];

  return function rateLimitHandler(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    // Identifier = IP + email (if available) — more precise than IP alone
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const email = (
      (req.body as Record<string, string> | undefined)?.["email"] ??
      (req.body as Record<string, string> | undefined)?.["usr"] ??
      ""
    ).toLowerCase().trim();

    const identifier = `${type}:${ip}${email ? `:${email}` : ""}`;
    const now = Date.now();

    let entry = store.get(identifier);

    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      store.set(identifier, entry);
      next();
      return;
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "Too many attempts. Please try again later.",
      });
      return;
    }

    next();
  };
}

// General rate limiter — applied globally in app.ts
// General rate limiter — applied globally except SSE endpoint
export const rateLimitMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // SSE connections are long-lived — do not apply rate limiting
  if (req.path === "/webhooks/events") {
    next();
    return;
  }
  createRateLimiter("default")(req, res, next);
};