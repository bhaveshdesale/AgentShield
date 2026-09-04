import { Types } from "mongoose";
import { AuditLogModel } from "../models/AuditLog";

export async function listAuditLogs(options: { actionId?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const filter = options.actionId && Types.ObjectId.isValid(options.actionId)
    ? { actionId: new Types.ObjectId(options.actionId) }
    : {};
  return AuditLogModel.find(filter).sort({ timestamp: -1 }).limit(limit).lean();
}
