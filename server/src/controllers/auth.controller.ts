import type { NextFunction, Request, Response } from "express";
import {
  authenticatePassword,
  createSession,
  revokeSession,
} from "../services/auth.service";
import { SESSION_COOKIE_NAME } from "../middleware/authentication";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

const COOKIE_PATH = "/api";
const COOKIE_SAME_SITE = "strict" as const;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: COOKIE_SAME_SITE,
    path: COOKIE_PATH,
  };
}

function userResponse(user: { id: string; email: string; role: string }) {
  return { id: user.id, email: user.email, role: user.role };
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) {
      throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }

    const user = await authenticatePassword(email, password);
    if (!user) {
      logger.warn("Authentication failed", { method: req.method, path: req.path });
      throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }

    const session = await createSession(user);
    res.cookie(SESSION_COOKIE_NAME, session.sessionId, {
      ...cookieOptions(),
      maxAge: session.expiresAt.getTime() - Date.now(),
    });
    res.status(200).json({
      user: userResponse(user),
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) {
      throw new AppError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
    }
    res.status(200).json({
      user: userResponse(req.auth),
      csrfToken: req.auth.csrfToken,
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cookie = req.get("cookie")?.split(";").find((entry) =>
      entry.trim().startsWith(`${SESSION_COOKIE_NAME}=`),
    );
    if (cookie) {
      await revokeSession(decodeURIComponent(cookie.trim().slice(SESSION_COOKIE_NAME.length + 1)));
    }
    res.clearCookie(SESSION_COOKIE_NAME, cookieOptions());
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
