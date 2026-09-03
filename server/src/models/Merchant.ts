import mongoose, { Schema } from "mongoose";
import type { Merchant, MerchantPolicy } from "../types/domain";

const merchantPolicySchema = new Schema<MerchantPolicy>(
  {
    maxTransactionAmount: { type: Number, required: true, min: 0 },
    maxDiscountPercent: { type: Number, required: true, min: 0, max: 100 },
    requireHumanApproval: { type: Boolean, required: true },
    allowRefunds: { type: Boolean, required: true },
    allowPayouts: { type: Boolean, required: true },
  },
  { _id: false }
);

const merchantSchema = new Schema<Merchant>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    policy: { type: merchantPolicySchema, required: true },
  },
  { timestamps: true }
);

export const MerchantModel = mongoose.model<Merchant>("Merchant", merchantSchema);
