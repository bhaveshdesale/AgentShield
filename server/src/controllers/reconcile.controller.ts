import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { createPaymentForApprovedAction, getPaymentStatusByOrderId, reconcilePayment } from "../services/payment.service";
import { AppError } from "../utils/AppError";

export async function reconcilePaymentController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderId = req.params.orderId;
    if (!orderId || typeof orderId !== "string") {
      throw new AppError("Order ID is required.", 400, "INVALID_ORDER_ID");
    }

    const result = await reconcilePayment({ orderId });
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      next(new AppError("A concurrent reconciliation conflict occurred.", 409, "CONCURRENT_RECONCILIATION"));
      return;
    }
    next(error);
  }
}


export async function createPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const actionId = typeof req.body?.actionId === "string" ? req.body.actionId.trim() : "";
    if (!actionId) throw new AppError("actionId is required.", 400, "INVALID_ACTION_ID");
    res.status(200).json(await createPaymentForApprovedAction({ actionId }));
  } catch (error) { next(error); }
}

export async function getPaymentStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(await getPaymentStatusByOrderId({ orderId: req.params.id }));
  } catch (error) { next(error); }
}
