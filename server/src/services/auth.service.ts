import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { UserModel } from "../models/User";
import { UserSessionModel } from "../models/UserSession";
import { USER_ROLES, type AuthenticatedUser, type UserRole } from "../types/auth";
import { AppError } from "../utils/AppError";

const scrypt = promisify(scryptCallback);
const PASSWORD_KEY_LENGTH = 64;
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashSessionToken(token: string): string {
  return hashToken(token);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createCsrfToken(sessionToken: string): string {
  return createHmac("sha256", sessionToken)
    .update("agentshield:csrf:v1")
    .digest("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 256) {
    throw new AppError("Password must be between 12 and 256 characters.", 400, "INVALID_PASSWORD");
  }

  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (password.length > 256) {
    return false;
  }
  const [algorithm, saltHex, keyHex, extra] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltHex || !keyHex || extra !== undefined) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  if (salt.length !== 16 || expected.length !== PASSWORD_KEY_LENGTH) {
    return false;
  }

  const actual = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  return timingSafeEqual(actual, expected);
}

const dummyPasswordHash = hashPassword("invalid-login-timing-password").then((hash) => hash);

export async function authenticatePassword(
  email: string,
  password: string,
): Promise<{ id: string; email: string; role: UserRole } | undefined> {
  const user = await UserModel.findOne({ email: normalizeEmail(email) }).select("+passwordHash");
  const matches = await verifyPassword(
    password,
    user?.passwordHash ?? (await dummyPasswordHash),
  );

  if (!user || user.disabled || !matches) {
    return undefined;
  }

  return { id: String(user._id), email: user.email, role: user.role };
}

export async function createProvisionedUser(options: {
  email: string;
  password: string;
  role: UserRole;
}): Promise<AuthenticatedUser> {
  const email = normalizeEmail(options.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new AppError("A valid email address is required.", 400, "INVALID_EMAIL");
  }
  if (!(USER_ROLES as readonly string[]).includes(options.role)) {
    throw new AppError("A valid user role is required.", 400, "INVALID_ROLE");
  }

  const user = await UserModel.create({
    email,
    passwordHash: await hashPassword(options.password),
    role: options.role,
    disabled: false,
  });
  return { id: String(user._id), email: user.email, role: user.role };
}

export async function createSession(user: AuthenticatedUser): Promise<{
  sessionId: string;
  csrfToken: string;
  expiresAt: Date;
}> {
  const sessionId = randomBytes(32).toString("base64url");
  const csrfToken = createCsrfToken(sessionId);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await UserSessionModel.create({
    userId: user.id,
    tokenHash: hashToken(sessionId),
    expiresAt,
  });

  return { sessionId, csrfToken, expiresAt };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await UserSessionModel.deleteOne({ tokenHash: hashToken(sessionId) });
}
