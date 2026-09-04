import type {
  NextFunction,
  Request,
  Response,
} from "express";
import mongoose from "mongoose";

import {
  createPaymentForApprovedAction,
  getPaymentHistoryFromDatabase,
  getPaymentStatusByOrderId,
  reconcilePayment,
} from "../services/payment.service";

import { AppError } from "../utils/AppError";

/**
 * Reconcile an UNKNOWN payment.
 *
 * This endpoint is intended for internal recovery
 * flows and should only be used for orders in UNKNOWN state.
 */
export async function reconcilePaymentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const orderId = req.params.orderId;

    if (
      !orderId ||
      typeof orderId !== "string"
    ) {
      throw new AppError(
        "Order ID is required.",
        400,
        "INVALID_ORDER_ID"
      );
    }

    const result = await reconcilePayment({
      orderId,
    });

    res.status(200).json(result);
  } catch (error) {
    if (
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000
    ) {
      next(
        new AppError(
          "A concurrent reconciliation conflict occurred.",
          409,
          "CONCURRENT_RECONCILIATION"
        )
      );
      return;
    }

    next(error);
  }
}

/**
 * Create a Razorpay TEST-MODE payment link
 * for an explicitly approved AgentShield action.
 */
export async function createPayment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const actionId =
      typeof req.body?.actionId === "string"
        ? req.body.actionId.trim()
        : "";

    if (!actionId) {
      throw new AppError(
        "actionId is required.",
        400,
        "INVALID_ACTION_ID"
      );
    }

    const result =
      await createPaymentForApprovedAction({
        actionId,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Get persisted payment/order history.
 *
 * GET /api/payments
 *
 * MongoDB is the source of truth for the history screen.
 */
export async function getPaymentHistory(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result =
      await getPaymentHistoryFromDatabase();

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Get the current status of a specific order.
 *
 * GET /api/payments/:id/status
 *
 * The payment service may also query Razorpay
 * to reconcile the latest Payment Link state.
 */
export async function getPaymentStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const orderId = req.params.id;

    if (
      !orderId ||
      typeof orderId !== "string"
    ) {
      throw new AppError(
        "Order ID is required.",
        400,
        "INVALID_ORDER_ID"
      );
    }

    const result =
      await getPaymentStatusByOrderId({
        orderId,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}