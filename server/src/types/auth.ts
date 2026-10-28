import type { Types } from "mongoose";

export const USER_ROLES = ["admin", "approver", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedSession extends AuthenticatedUser {
  sessionId: string;
  csrfToken: string;
}

export interface User {
  email: string;
  passwordHash: string;
  role: UserRole;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSession {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}
