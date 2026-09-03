import mongoose, { Schema } from "mongoose";
import type { AuditLog } from "../types/domain";

const auditLogSchema = new Schema<AuditLog>(
  {
    actionId: { type: Schema.Types.ObjectId, ref: "AgentAction", index: true },
    event: { type: String, required: true, trim: true },
    details: { type: Schema.Types.Mixed, required: true, default: {} },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: false,
  }
);

export const AuditLogModel = mongoose.model<AuditLog>("AuditLog", auditLogSchema);
