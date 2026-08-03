import type { Request, Response } from "express";
import { authService } from "../services/auth.service";
import { logger } from "../lib/logger";
import { frappeService } from "../services/frappe.service";
import { authTokenService } from "../services/auth-token.service";
import emailService from "../services/email.service";
import { sendMail } from "../lib/mailer";

/**
 * AuthController — handles HTTP request/response for auth routes.
 * Delegates business logic to authService.
 */
export const authController = {
  // ── POST /api/auth/signup ──────────────────────────────────────────────────

  async signup(req: Request, res: Response): Promise<void> {
    // Support both first_name+last_name and full_name from the frontend
    let { email, first_name, last_name, full_name, mobile_no } = req.body as {
      email?: string;
      first_name?: string;
      last_name?: string;
      full_name?: string;
      mobile_no?: string;
    };

    // If first_name is not provided, derive it from full_name
    if (!first_name && full_name) {
      const parts = full_name.trim().split(/\s+/);
      first_name = parts[0];
      last_name = parts.slice(1).join(" ") || undefined;
    }

    if (!email || !first_name) {
      res.status(400).json({ error: "Email and first name are required." });
      return;
    }

    try {
      // 1) Check if user already exists
      const exists = await authService.userExists(email);
      if (exists) {
        res.status(409).json({ error: "This email is already registered." });
        return;
      }

      // 2) Create Frappe User
      const userResult = await authService.createUser(email, first_name, last_name, mobile_no);
      if (!userResult.success) {
        res.status(400).json({ error: userResult.error || "Failed to create user." });
        return;
      }

      // 3) Create Customer + Contact
      const fullName = [first_name, last_name].filter(Boolean).join(" ");
      const customerName = await frappeService.createCustomerForEmail(email, fullName);
      if (!customerName) {
        logger.warn({ email }, "[auth/signup] Customer auto-creation failed, will be created on first order");
      }

      // 4) Generate set-password token & send email
      const rawToken = authTokenService.generateToken(email, 24 * 60 * 60 * 1000);
      if (!rawToken) {
        res.status(500).json({ error: "Failed to generate password token." });
        return;
      }

      // 5) Send set-password email
      const frontendUrl = (process.env["FRONTEND_URL"] ?? "http://localhost:5173").replace(/\/$/, "");
      const setPasswordUrl = `${frontendUrl}/set-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

      try {
        await emailService.sendSetPasswordEmail(email, fullName, setPasswordUrl);
      } catch (mailErr) {
        // Email failed — rollback user and customer creation
        authTokenService.deleteToken(rawToken);
        authService.deleteUser(email).catch(() => {});
        logger.error({ err: mailErr }, "[auth/signup] email failed, rolled back user");
        res.status(500).json({ error: "Signup failed: confirmation email could not be sent. Please try again." });
        return;
      }

      res.json({
        success: true,
        message: "Signup successful. Please check your email to set your password.",
      });
    } catch (err) {
      logger.error({ err }, "[authController.signup]");
      res.status(500).json({ error: "Internal server error." });
    }
  },

  // ── POST /api/auth/login ───────────────────────────────────────────────────

  async login(req: Request, res: Response): Promise<void> {
    const { usr, pwd } = req.body as { usr?: string; pwd?: string };

    if (!usr || !pwd) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }

    try {
      const result = await authService.login(usr, pwd);

      if (!result.success) {
        res.status(401).json({ success: false, error: result.error });
        return;
      }

      // Forward the ERPNext session cookie to the browser
      if (result.cookie) {
        res.setHeader("Set-Cookie", result.cookie);
      }

      // Fetch user's full name for the response
      const fullName = await authService.getUserFullName(usr);

      res.json({
        success: true,
        message: result.message,
        user: {
          email: usr,
          name: fullName || usr,
        },
      });
    } catch (err) {
      logger.error({ err }, "[authController.login]");
      res.status(500).json({ success: false, error: "Internal server error." });
    }
  },

  // ── POST /api/auth/logout ──────────────────────────────────────────────────

  async logout(req: Request, res: Response): Promise<void> {
    await authService.logout(req.headers.cookie);
    const isSecure = (process.env["FRONTEND_ORIGIN"] ?? "").startsWith("https://");
    res.setHeader("Set-Cookie", `sid=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${isSecure ? "; Secure" : ""}`);
    res.json({ message: "Logged out successfully." });
  },

  // ── GET /api/auth/me ───────────────────────────────────────────────────────

  async me(req: Request, res: Response): Promise<void> {
    try {
      const email = await authService.getLoggedInEmail(req.headers.cookie);

      if (!email) {
        res.json({ success: false, user: null });
        return;
      }

      // Fetch user's full name
      const fullName = await authService.getUserFullName(email);

      res.json({
        success: true,
        user: {
          email,
          name: fullName || email,
        },
      });
    } catch (err) {
      logger.error({ err }, "[authController.me]");
      res.json({ success: false, user: null });
    }
  },

  // ── POST /api/auth/set-password ─────────────────────────────────────────────

  async setPassword(req: Request, res: Response): Promise<void> {
    logger.info({ body: req.body }, "[authController.setPassword] Route hit");
    const { token, email, password } = req.body as {
      token?: string;
      email?: string;
      password?: string;
    };

    if (!token || !email || !password) {
      res.status(400).json({ error: "Token, email, and password are required." });
      return;
    }

    if (!(await authService.isValidPassword(password))) {
      res.status(400).json({ error: "Password must be at least 8 characters and include uppercase, lowercase, and a number." });
      return;
    }

    // Verify the token
    if (!authTokenService.verifyToken(token, email)) {
      res.status(400).json({ error: "This link is invalid or has expired. Please sign up again." });
      return;
    }

    try {
      const success = await authService.setUserPassword(email, password);
      if (!success) {
        res.status(400).json({ error: "Failed to set password." });
        return;
      }

      // Send confirmation email
      const frontendUrl = (process.env["FRONTEND_URL"] ?? "http://localhost:5173").replace(/\/$/, "");
      const loginUrl = `${frontendUrl}/login`;

      let fullName = email.split("@")[0];
      const name = await authService.getUserFullName(email);
      if (name) fullName = name;

      void sendMail({
        to: email,
        subject: "Your OXIGEN password has been set",
        html: `<!DOCTYPE html>
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
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
        erp: { referenceDoctype: "User", referenceName: email },
      });

      res.json({ success: true, message: "Password set successfully. You can now log in." });
    } catch (err) {
      logger.error({ err }, "[authController.setPassword] Caught unexpected error");
      res.status(500).json({ error: "Internal server error." });
    }
  },

  // ── POST /api/auth/forgot-password ──────────────────────────────────────────

  async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = req.body as { email?: string };

    if (!email) {
      res.status(400).json({ error: "Email is required." });
      return;
    }

    // Always return same response — don't reveal if email exists
    const genericResponse = {
      message: "If this email is registered, a reset link has been sent.",
    };

    try {
      const exists = await authService.userExists(email);
      if (!exists) {
        res.json(genericResponse);
        return;
      }

      const rawToken = authTokenService.generateToken(email, 60 * 60 * 1000);
      if (!rawToken) {
        res.json(genericResponse);
        return;
      }

      const frontendUrl = (process.env["FRONTEND_URL"] ?? "http://localhost:5173").replace(/\/$/, "");
      const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

      let fullName = email.split("@")[0];
      const name = await authService.getUserFullName(email);
      if (name) fullName = name;

      void emailService.sendResetPasswordEmail(email, fullName, resetUrl);

      res.json(genericResponse);
    } catch (err) {
      logger.error({ err }, "[authController.forgotPassword]");
      res.json(genericResponse);
    }
  },

  // ── POST /api/auth/reset-password ───────────────────────────────────────────

  async resetPassword(req: Request, res: Response): Promise<void> {
    const { token, email, password } = req.body as {
      token?: string;
      email?: string;
      password?: string;
    };

    if (!token || !email || !password) {
      res.status(400).json({ error: "Token, email, and password are required." });
      return;
    }

    if (!(await authService.isValidPassword(password))) {
      res.status(400).json({ error: "Password must be at least 8 characters and include uppercase, lowercase, and a number." });
      return;
    }

    // Verify the token
    if (!authTokenService.verifyToken(token, email)) {
      res.status(400).json({ error: "This link is invalid or has expired. Please request a new one." });
      return;
    }

    try {
      const success = await authService.setUserPassword(email, password);
      if (!success) {
        res.status(400).json({ error: "Failed to reset password." });
        return;
      }

      res.json({ message: "Password reset successfully. You can now log in." });
    } catch (err) {
      logger.error({ err }, "[authController.resetPassword]");
      res.status(500).json({ error: "Internal server error." });
    }
  },
};
