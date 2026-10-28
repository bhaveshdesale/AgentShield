import mongoose, { Schema } from "mongoose";
import { USER_ROLES, type User } from "../types/auth";

const userSchema = new Schema<User>(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: USER_ROLES },
    disabled: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

export const UserModel = mongoose.model<User>("User", userSchema);
