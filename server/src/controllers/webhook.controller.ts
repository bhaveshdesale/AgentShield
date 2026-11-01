import type { NextFunction, Request, Response } from "express";
import { recordAudit } from "../services/audit.service";
import { processRazorpayWebhook, verifyRazorpaySignature } from "../services/webhook.service";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

export async function receiveRazorpayWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  const eventId = req.get("x-razorpay-event-id") ?? undefined;
  const signature = req.get("x-razorpay-signature") ?? undefined;
  const rawBody = Buffer.isBuffer(req.body) ? req.body : undefined;

  try {
    if (!rawBody) {
      throw new AppError("Razorpay webhook requires a raw request body.", 400, "WEBHOOK_MALFORMED");
    }
    verifyRazorpaySignature(rawBody, signature);
    const result = await processRazorpayWebhook(rawBody, eventId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AppError && (error.code === "WEBHOOK_SIGNATURE_MISSING" || error.code === "WEBHOOK_SIGNATURE_INVALID")) {
      try {
        await recordAudit("WEBHOOK_INVALID_SIGNATURE", { reason: error.code }, null);
      } catch (auditError) {
        logger.error("Failed to record invalid webhook signature", {
          error: auditError instanceof Error ? auditError.message : "Unknown audit error",
        });
      }
    }
    next(error);
  }
}
