import mongoose, { Schema } from "mongoose";
import type { AuditLog } from "../types/domain";

const auditLogSchema = new Schema<AuditLog>(
  {
    actionId: { type: Schema.Types.ObjectId, ref: "AgentAction", index: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    actorEmail: { type: String, trim: true },
    idempotencyKey: { type: String, trim: true },
    event: { type: String, required: true, trim: true },
    details: { type: Schema.Types.Mixed, required: true, default: {} },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: false,
  }
);

auditLogSchema.index(
  { idempotencyKey: 1, event: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);

export const AuditLogModel = mongoose.model<AuditLog>("AuditLog", auditLogSchema);
