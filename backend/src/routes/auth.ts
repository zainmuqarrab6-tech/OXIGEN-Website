import { logger } from "../lib/logger";
import { Router, type IRouter } from "express";
import { getErpUrl, getErpHeaders, parseErpError, erpFetch} from "../lib/erpnext-client";
import { sendMail } from "../lib/mailer";
import * as crypto from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRateLimiter } from "../middlewares/rate-limit";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Rate Limiters (Per route)
// ---------------------------------------------------------------------------
const loginLimiter = createRateLimiter("login");
const signupLimiter = createRateLimiter("signup");
const forgotPasswordLimiter = createRateLimiter("forgotPassword");
const resetPasswordLimiter = createRateLimiter("resetPassword");
const setPasswordLimiter = createRateLimiter("setPassword");
const changePasswordLimiter = createRateLimiter("changePassword");

// ---------------------------------------------------------------------------
// File-persisted token store
// Survives server restarts so outstanding password-reset/set-password links
// remain valid across deploys / crashes.
// Key = SHA-256 hash of the raw token (O(1) lookup).
// ---------------------------------------------------------------------------
interface TokenEntry {
  email: string;
  expires: number;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../../data");
const TOKEN_FILE = resolve(DATA_DIR, "auth-tokens.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadTokenStore(): Map<string, TokenEntry> {
  try {
    ensureDataDir();
    if (!existsSync(TOKEN_FILE)) return new Map();
    const raw = readFileSync(TOKEN_FILE, "utf-8");
    const obj = JSON.parse(raw) as Record<string, TokenEntry>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveTokenStore(store: Map<string, TokenEntry>): void {
  try {
    ensureDataDir();
    const tmp = TOKEN_FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(store)), "utf-8");
    renameSync(tmp, TOKEN_FILE);
  } catch {
    // Non-fatal: tokens will work in-memory for this session
  }
}

const tokenStore = loadTokenStore();

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Cleanup expired tokens every hour (also prunes the file)
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [key, entry] of tokenStore) {
    if (entry.expires < now) { tokenStore.delete(key); changed = true; }
  }
  if (changed) saveTokenStore(tokenStore);
}, 60 * 60 * 1000);

// sendMail — imported from mailer.ts (sends email through ERPNext)

// ---------------------------------------------------------------------------
// Password validation helper (consistent across all routes)
// ---------------------------------------------------------------------------
function isValidPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
  );
}

const PASSWORD_ERROR =
  "Password must be at least 8 characters and include uppercase, lowercase, and a number.";

// ---------------------------------------------------------------------------
// Email Templates
// ---------------------------------------------------------------------------
function buildSetPasswordEmail(fullName: string, url: string): string {
  return buildEmailTemplate({
    fullName,
    heading: `Welcome, ${fullName}!`,
    body: "Your OXIGEN account has been created. Click the button below to set your password.",
    buttonText: "Set My Password",
    buttonUrl: url,
    expiry: "24 hours",
    fallbackText: "Or copy this link:",
    fallbackUrl: url,
  });
}

function buildResetPasswordEmail(fullName: string, url: string): string {
  return buildEmailTemplate({
    fullName,
    heading: "Reset your password",
    body: `Hi ${fullName}, we received a request to reset your OXIGEN password.`,
    buttonText: "Reset My Password",
    buttonUrl: url,
    expiry: "1 hour",
    fallbackText: "Or copy this link:",
    fallbackUrl: url,
  });
}

function buildPasswordSetConfirmationEmail(fullName: string, loginUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#16a34a;padding:28px 40px;text-align:center;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;">&#9728; OXIGEN</span>
        </td></tr>
        <tr><td style="padding:40px 40px 32px;">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827;">Password Set Successfully</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            Hi ${fullName}, your OXIGEN account password has been set successfully. You can now log in to your account.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${loginUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:100px;text-decoration:none;">Login to OXIGEN</a>
          </div>
          <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">
            If you did not set this password, please contact our support immediately.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} OXIGEN. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildEmailTemplate({
  fullName: _fullName,
  heading,
  body,
  buttonText,
  buttonUrl,
  expiry,
  fallbackText,
  fallbackUrl,
}: {
  fullName: string;
  heading: string;
  body: string;
  buttonText: string;
  buttonUrl: string;
  expiry: string;
  fallbackText: string;
  fallbackUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#16a34a;padding:28px 40px;text-align:center;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;">&#9728; OXIGEN</span>
        </td></tr>
        <tr><td style="padding:40px 40px 32px;">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827;">${heading}</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">${body}</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${buttonUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:100px;text-decoration:none;">${buttonText}</a>
          </div>
          <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">
            This link will expire in <strong>${expiry}</strong>. If you did not make this request, ignore this email.
          </p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
          <p style="margin:0;font-size:12px;color:#d1d5db;">
            ${fallbackText}<br/>
            <a href="${fallbackUrl}" style="color:#6b7280;word-break:break-all;font-size:11px;">${fallbackUrl}</a>
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} OXIGEN. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post("/auth/login", loginLimiter, async (req, res) => {
  const { usr, pwd } = req.body as { usr?: string; pwd?: string };

  if (!usr || !pwd) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  try {
    const erpRes = await erpFetch(getErpUrl("/api/method/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usr, pwd }),
    });

    const data = await erpRes.json() as { message?: string; full_name?: string };

    if (!erpRes.ok) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const setCookie = erpRes.headers.get("set-cookie");
    if (setCookie) res.setHeader("Set-Cookie", setCookie);

    res.json({ message: data.message, full_name: data.full_name });
  } catch (err) {
    logger.error({ err: err }, "[auth/login]");
    res.status(500).json({ error: "Internal server error." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
router.post("/auth/logout", async (req, res) => {
  try {
    await erpFetch(getErpUrl("/api/method/logout"), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: req.headers.cookie ?? "",
      },
    });

    res.setHeader("Set-Cookie", "sid=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
    res.json({ message: "Logged out successfully." });
  } catch (err) {
    logger.error({ err: err }, "[auth/logout]");
    res.setHeader("Set-Cookie", "sid=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
    res.json({ message: "Logged out." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
router.get("/auth/me", async (req, res) => {
  try {
    const erpRes = await erpFetch(
      getErpUrl("/api/method/frappe.auth.get_logged_user"),
      {
        headers: {
          "Content-Type": "application/json",
          Cookie: req.headers.cookie ?? "",
        },
      }
    );

    const data = await erpRes.json() as { message?: string };
    const email = data.message;

    if (!email || email === "Guest") {
      res.json({ user: null });
      return;
    }

    let fullName: string | undefined;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const userRes = await erpFetch(
        getErpUrl(
          `/api/resource/User/${encodeURIComponent(email)}?fields=${encodeURIComponent(JSON.stringify(["full_name"]))}`
        ),
        { headers: getErpHeaders(), signal: controller.signal }
      );
      clearTimeout(timer);
      if (userRes.ok) {
        const userData = await userRes.json() as { data?: { full_name?: string } };
        fullName = userData.data?.full_name || undefined;
      }
    } catch {
      // fullName is optional — if it fails, just return the email
    }

    res.json({ user: { email, fullName } });
  } catch (err) {
    logger.error({ err: err }, "[auth/me]");
    res.json({ user: null });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/signup
// ---------------------------------------------------------------------------
router.post("/auth/signup", signupLimiter, async (req, res) => {
  const { email, full_name, company_name } = req.body as {
    email?: string;
    full_name?: string;
    company_name?: string;
  };

  if (!email || !full_name) {
    res.status(400).json({ error: "Email and full name are required." });
    return;
  }

  try {
    const checkRes = await erpFetch(
      getErpUrl(`/api/resource/User/${encodeURIComponent(email)}`),
      { headers: getErpHeaders() }
    );

    if (checkRes.ok) {
      res.status(409).json({ error: "This email is already registered." });
      return;
    }

    const createRes = await erpFetch(getErpUrl("/api/resource/User"), {
      method: "POST",
      headers: getErpHeaders(),
      body: JSON.stringify({
        email,
        first_name: full_name,
        send_welcome_email: 0,
        user_type: "Website User",
        roles: [{ role: "Customer" }],
        source: "OXIGEN Website",
        company_name: company_name?.trim() || email,
      }),
    });

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({})) as { _server_messages?: string };
      res.status(400).json({ error: parseErpError(errData) || "Failed to create user." });
      return;
    }

    // Generate token — SHA-256 hash stored as key (O(1) lookup, no loop needed)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = hashToken(rawToken);

    tokenStore.set(hashedToken, {
      email,
      expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });
    saveTokenStore(tokenStore);

    const frontendUrl = (process.env["FRONTEND_URL"] ?? "http://localhost:5173").replace(/\/$/, "");
    const setPasswordUrl = `${frontendUrl}/set-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

    try {
      await sendMail({
        to: email,
        subject: "Set your OXIGEN password",
        html: buildSetPasswordEmail(full_name, setPasswordUrl),
        erp: { referenceDoctype: "User", referenceName: email },
      });
    } catch (mailErr) {
      // Email failed — token aur ERPNext user dono clean up karo
      // taake user dobara signup kar sake
      tokenStore.delete(hashedToken);
      saveTokenStore(tokenStore);
      try {
        await erpFetch(getErpUrl(`/api/resource/User/${encodeURIComponent(email)}`), {
          method: "DELETE",
          headers: getErpHeaders(),
        });
      } catch {
        // cleanup best-effort
      }
      logger.error({ err: mailErr }, "[auth/signup] email failed:");
      res.status(500).json({ error: "Signup failed: confirmation email could not be sent. Please try again." });
      return;
    }

    res.json({ success: true, message: "Signup successful. Please check your email to set your password." });
  } catch (err) {
    logger.error({ err: err }, "[auth/signup]");
    res.status(500).json({ error: "Internal server error." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/set-password
// ---------------------------------------------------------------------------
router.post("/auth/set-password", setPasswordLimiter, async (req, res) => {
  const { token, email, password } = req.body as {
    token?: string;
    email?: string;
    password?: string;
  };

  if (!token || !email || !password) {
    res.status(400).json({ error: "Token, email, and password are required." });
    return;
  }

  if (!isValidPassword(password)) {
    res.status(400).json({ error: PASSWORD_ERROR });
    return;
  }

  // O(1) lookup — hash the incoming token and find directly
  const hashedToken = hashToken(token);
  const entry = tokenStore.get(hashedToken);

  if (!entry || entry.email !== email || entry.expires < Date.now()) {
    res.status(400).json({ error: "This link is invalid or has expired. Please sign up again." });
    return;
  }

  try {
    const updateRes = await erpFetch(
      getErpUrl(`/api/resource/User/${encodeURIComponent(email)}`),
      {
        method: "PUT",
        headers: getErpHeaders(),
        body: JSON.stringify({ new_password: password }),
      }
    );

    if (!updateRes.ok) {
      const errData = await updateRes.json().catch(() => ({})) as { _server_messages?: string };
      res.status(updateRes.status).json({ error: parseErpError(errData) || "Failed to set password." });
      return;
    }

    tokenStore.delete(hashedToken);
    saveTokenStore(tokenStore);

    // Send "password set" confirmation email (NOT "password changed" security alert)
    const frontendUrl = (process.env["FRONTEND_URL"] ?? "http://localhost:5173").replace(/\/$/, "");
    const loginUrl = `${frontendUrl}/login`;

    // Fetch user's full name for the email
    let fullName = email.split("@")[0];
    try {
      const userRes = await erpFetch(
        getErpUrl(`/api/resource/User/${encodeURIComponent(email)}`),
        { headers: getErpHeaders() }
      );
      if (userRes.ok) {
        const userData = await userRes.json() as { data?: { full_name?: string; first_name?: string } };
        fullName = userData.data?.full_name ?? userData.data?.first_name ?? fullName;
      }
    } catch {
      // fallback to email prefix
    }

    void sendMail({
      to: email,
      subject: "Your OXIGEN password has been set",
      html: buildPasswordSetConfirmationEmail(fullName, loginUrl),
      erp: { referenceDoctype: "User", referenceName: email },
    });

    res.json({ success: true, message: "Password set successfully. You can now log in." });
  } catch (err) {
    logger.error({ err: err }, "[auth/set-password]");
    res.status(500).json({ error: "Internal server error." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------
router.post("/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body as { email?: string };

  if (!email) {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  // Always return same response — don't reveal if email exists (security)
  const genericResponse = {
    message: "If this email is registered, a reset link has been sent.",
  };

  try {
    const checkRes = await erpFetch(
      getErpUrl(`/api/resource/User/${encodeURIComponent(email)}`),
      { headers: getErpHeaders() }
    );

    if (!checkRes.ok) {
      res.json(genericResponse);
      return;
    }

    const userData = await checkRes.json() as { data?: { full_name?: string; first_name?: string } };
    const fullName =
      userData.data?.full_name ??
      userData.data?.first_name ??
      email.split("@")[0];

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = hashToken(rawToken);

    tokenStore.set(hashedToken, {
      email,
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });
    saveTokenStore(tokenStore);

    const frontendUrl = (process.env["FRONTEND_URL"] ?? "http://localhost:5173").replace(/\/$/, "");
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

    void sendMail({
      to: email,
      subject: "Reset your OXIGEN password",
      html: buildResetPasswordEmail(fullName, resetUrl),
      erp: { referenceDoctype: "User", referenceName: email },
    });

    res.json(genericResponse);
  } catch (err) {
    logger.error({ err: err }, "[auth/forgot-password]");
    res.json(genericResponse);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------
router.post("/auth/reset-password", resetPasswordLimiter, async (req, res) => {
  const { token, email, password } = req.body as {
    token?: string;
    email?: string;
    password?: string;
  };

  if (!token || !email || !password) {
    res.status(400).json({ error: "Token, email, and password are required." });
    return;
  }

  if (!isValidPassword(password)) {
    res.status(400).json({ error: PASSWORD_ERROR });
    return;
  }

  // O(1) lookup
  const hashedToken = hashToken(token);
  const entry = tokenStore.get(hashedToken);

  if (!entry || entry.email !== email || entry.expires < Date.now()) {
    res.status(400).json({ error: "This link is invalid or has expired. Please request a new one." });
    return;
  }

  try {
    const updateRes = await erpFetch(
      getErpUrl(`/api/resource/User/${encodeURIComponent(email)}`),
      {
        method: "PUT",
        headers: getErpHeaders(),
        body: JSON.stringify({ new_password: password }),
      }
    );

    if (!updateRes.ok) {
      const errData = await updateRes.json().catch(() => ({})) as { _server_messages?: string };
      res.status(updateRes.status).json({ error: parseErpError(errData) || "Failed to reset password." });
      return;
    }

    tokenStore.delete(hashedToken);
    saveTokenStore(tokenStore);
    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    logger.error({ err: err }, "[auth/reset-password]");
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;