import mongoose, { Schema } from "mongoose";
import { CURRENCIES, ORDER_STATUSES, type Order, type OrderItem } from "../types/domain";

const orderItemSchema = new Schema<OrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceInPaise: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new Schema<Order>(
  {
    items: {
      type: [orderItemSchema],
      required: true,
    },
    amountInPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, enum: CURRENCIES, default: "INR" },
    status: { type: String, required: true, enum: ORDER_STATUSES, default: "CREATED" },
    referenceId: { type: String, required: true, unique: true, trim: true },
    razorpayPaymentLinkId: { type: String },
    razorpayPaymentLinkUrl: { type: String },
  },
  { timestamps: true }
);

export const OrderModel = mongoose.model<Order>("Order", orderSchema);
