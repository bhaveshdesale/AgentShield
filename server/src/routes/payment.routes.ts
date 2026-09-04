import { Router } from "express";
import {
  createPayment,
  getPaymentHistory,
  getPaymentStatus,
} from "../controllers/reconcile.controller";

const paymentRouter = Router();

/**
 * Create a Razorpay payment link.
 */
paymentRouter.post("/create", createPayment);

/**
 * Get persisted payment/order history.
 *
 * GET /api/payments
 *
 * Keep this before /:id/status.
 */
paymentRouter.get("/", getPaymentHistory);

/**
 * Get current status of a specific order.
 *
 * GET /api/payments/:id/status
 */
paymentRouter.get("/:id/status", getPaymentStatus);

export { paymentRouter };