import mongoose, { Types } from "mongoose";
import { AuditLogModel } from "../models/AuditLog";
import type { AuthenticatedUser } from "../types/auth";

export async function listAuditLogs(options: { actionId?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const filter = options.actionId && Types.ObjectId.isValid(options.actionId)
    ? { actionId: new Types.ObjectId(options.actionId) }
    : {};
  return AuditLogModel.find(filter).sort({ timestamp: -1 }).limit(limit).lean();
}

export async function recordSecurityAudit(
  event: string,
  details: Record<string, string | number | boolean | undefined>,
  actor?: AuthenticatedUser,
  actionId?: string,
): Promise<void> {
  await AuditLogModel.create({
    ...(actionId && Types.ObjectId.isValid(actionId)
      ? { actionId: new Types.ObjectId(actionId) }
      : {}),
    ...(actor
      ? { actorId: new Types.ObjectId(actor.id), actorEmail: actor.email }
      : {}),
    event,
    details,
    timestamp: new Date(),
  });
}

export async function recordIdempotentAudit(
  event: string,
  details: Record<string, string | number | boolean | undefined>,
  idempotencyKey: string,
  actionId?: string,
): Promise<void> {
  const filter = { idempotencyKey, event };
  try {
    await AuditLogModel.updateOne(
      filter,
      {
        $setOnInsert: {
          ...(actionId && Types.ObjectId.isValid(actionId)
            ? { actionId: new Types.ObjectId(actionId) }
            : {}),
          idempotencyKey,
          event,
          details,
          timestamp: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (
      !(error instanceof mongoose.mongo.MongoServerError) ||
      error.code !== 11000 ||
      !(await AuditLogModel.exists(filter))
    ) {
      throw error;
    }
  }
}
