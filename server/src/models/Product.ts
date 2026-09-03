import mongoose, { Schema, Types } from "mongoose";
import { CURRENCIES, type Product } from "../types/domain";

const productSchema = new Schema<Product>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    priceInPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, enum: CURRENCIES, default: "INR" },
    category: { type: String, required: true, trim: true },
    tags: { type: [String], required: true, default: [] },
    inventory: { type: Number, required: true, min: 0 },
    frequentlyBoughtWith: {
      type: [{ type: Schema.Types.ObjectId, ref: "Product" }],
      required: true,
      default: (): Types.ObjectId[] => [],
    },
  },
  { timestamps: true }
);

export const ProductModel = mongoose.model<Product>("Product", productSchema);
