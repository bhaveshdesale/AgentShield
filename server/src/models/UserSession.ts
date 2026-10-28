import mongoose, { Schema } from "mongoose";
import type { UserSession } from "../types/auth";

const userSessionSchema = new Schema<UserSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const UserSessionModel = mongoose.model<UserSession>("UserSession", userSessionSchema);
