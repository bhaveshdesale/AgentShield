import type { NextFunction, Request, Response } from "express";
import { recordAudit } from "../services/payment.service";
import { processRazorpayWebhook, verifyRazorpaySignature } from "../services/webhook.service";
import { AppError } from "../utils/AppError";

export async function receiveRazorpayWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  const eventId = req.get("x-razorpay-event-id") ?? undefined;
  const signature = req.get("x-razorpay-signature") ?? undefined;
  const rawBody = Buffer.isBuffer(req.body) ? req.body : undefined;

  try {
    await recordAudit("WEBHOOK_RECEIVED", { hasEventId: eventId !== undefined }, null);
    if (!rawBody) {
      throw new AppError("Razorpay webhook requires a raw request body.", 400, "WEBHOOK_MALFORMED");
    }
    verifyRazorpaySignature(rawBody, signature);
    await recordAudit("WEBHOOK_VERIFIED", { hasEventId: eventId !== undefined }, null);
    const result = await processRazorpayWebhook(rawBody, eventId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AppError && (error.code === "WEBHOOK_SIGNATURE_MISSING" || error.code === "WEBHOOK_SIGNATURE_INVALID")) {
      await recordAudit("WEBHOOK_INVALID_SIGNATURE", { reason: error.code }, null);
    }
    next(error);
  }
}
