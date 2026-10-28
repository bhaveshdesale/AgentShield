import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { UserModel } from "../models/User";
import { UserSessionModel } from "../models/UserSession";
import type { AuthenticatedSession, UserRole } from "../types/auth";
import { AppError } from "../utils/AppError";
import { createCsrfToken, hashSessionToken } from "../services/auth.service";
import { recordSecurityAudit } from "../services/audit.service";
import { logger } from "../utils/logger";

export const SESSION_COOKIE_NAME = "agentshield_session";

function readCookie(request: Request, name: string): string | undefined {
  const cookies = request.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) {
      continue;
    }
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isPrivilegedMutation(request: Request): boolean {
  const path = request.originalUrl.split("?")[0].replace(/^\/api/, "");
  return (
    (request.method === "POST" && /^\/actions\/approve\/?$/.test(path)) ||
    (request.method === "POST" && /^\/payments\/create\/?$/.test(path))
  );
}

export async function authenticate(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = readCookie(request, SESSION_COOKIE_NAME);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new AppError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
    }

    const session = await UserSessionModel.findOne({
      tokenHash: hashSessionToken(token),
      expiresAt: { $gt: new Date() },
    });
    if (!session) {
      throw new AppError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
    }

    const user = await UserModel.findById(session.userId);
    if (!user || user.disabled) {
      await UserSessionModel.deleteOne({ _id: session._id });
      throw new AppError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
    }

    const auth: AuthenticatedSession = {
      id: String(user._id),
      email: user.email,
      role: user.role,
      sessionId: String(session._id),
      csrfToken: createCsrfToken(token),
    };
    request.auth = auth;
    next();
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401 && isPrivilegedMutation(request)) {
      try {
        await recordSecurityAudit("AUTHENTICATION_DENIED", {
          method: request.method,
          path: request.path,
        });
      } catch (auditError) {
        logger.error("Failed to record denied authentication attempt", {
          error: auditError instanceof Error ? auditError.message : "Unknown audit error",
        });
      }
    }
    next(error);
  }
}

export function requireRoles(...roles: UserRole[]) {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    const user = request.auth;
    if (!user) {
      next(new AppError("Authentication required.", 401, "AUTHENTICATION_REQUIRED"));
      return;
    }
    if (!roles.includes(user.role)) {
      try {
        await recordSecurityAudit(
          "AUTHORIZATION_DENIED",
          { method: request.method, path: request.path, requiredRoles: roles.join(",") },
          user,
        );
      } catch (error) {
        logger.error("Failed to record denied authorization attempt", {
          error: error instanceof Error ? error.message : "Unknown audit error",
        });
      }
      next(new AppError("You do not have permission to perform this operation.", 403, "FORBIDDEN"));
      return;
    }
    next();
  };
}

export function requireCsrf(request: Request, _response: Response, next: NextFunction): void {
  const auth = request.auth;
  const token = request.get("x-csrf-token");
  if (!auth || !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    next(new AppError("A valid CSRF token is required.", 403, "CSRF_TOKEN_INVALID"));
    return;
  }

  const actual = Buffer.from(token, "utf8");
  const expected = Buffer.from(auth.csrfToken, "utf8");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    next(new AppError("A valid CSRF token is required.", 403, "CSRF_TOKEN_INVALID"));
    return;
  }
  next();
}
