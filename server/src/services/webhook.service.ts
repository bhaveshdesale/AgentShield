import { createHmac, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import { AgentActionModel } from "../models/AgentAction";
import { OrderModel } from "../models/Order";
import { WebhookEventModel } from "../models/WebhookEvent";
import { AppError } from "../utils/AppError";
import { recordAudit } from "./payment.service";

type RazorpayPayload = Record<string, unknown>;
type WebhookOutcome = "PAID" | "FAILED" | "IGNORED" | "UNKNOWN_ORDER" | "NO_CHANGE";

export function verifyRazorpaySignature(rawBody: Buffer, signature: string | undefined): void {
  if (!signature || signature.trim().length === 0) {
    throw new AppError("Missing Razorpay webhook signature.", 401, "WEBHOOK_SIGNATURE_MISSING");
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new AppError("Razorpay webhook secret is not configured.", 503, "WEBHOOK_NOT_CONFIGURED");
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.trim();
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new AppError("Invalid Razorpay webhook signature.", 401, "WEBHOOK_SIGNATURE_INVALID");
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function entity(payload: RazorpayPayload, name: string): Record<string, unknown> | undefined {
  const envelope = asRecord(payload[name]);
  return envelope ? asRecord(envelope.entity) : undefined;
}

function identifiers(payload: RazorpayPayload): { paymentLinkId: string | undefined; referenceId: string | undefined } {
  const payloadEntities = asRecord(payload.payload) ?? {};
  const paymentLink = entity(payloadEntities, "payment_link");
  const payment = entity(payloadEntities, "payment");
  const notes = payment ? asRecord(payment.notes) : undefined;
  return {
    paymentLinkId: readString(paymentLink?.id) ?? readString(payment?.payment_link_id),
    referenceId:
      readString(paymentLink?.reference_id) ??
      readString(notes?.referenceId) ??
      readString(notes?.reference_id),
  };
}

function eventTransition(eventName: string): "PAID" | "FAILED" | undefined {
  if (eventName === "payment_link.paid" || eventName === "payment.captured") {
    return "PAID";
  }
  if (eventName === "payment.failed" || eventName === "payment_link.expired") {
    return "FAILED";
  }
  return undefined;
}

async function actionIdForReference(referenceId: string): Promise<string | null> {
  const action = await AgentActionModel.findOne({ referenceId }).select("_id");
  return action ? String(action._id) : null;
}

export async function processRazorpayWebhook(rawBody: Buffer, eventId: string | undefined): Promise<{ eventName: string; outcome: WebhookOutcome; duplicate: boolean }> {
  let payload: RazorpayPayload;
  try {
    const decoded: unknown = JSON.parse(rawBody.toString("utf8"));
    const parsed = asRecord(decoded);
    if (!parsed) {
      throw new Error("Webhook payload must be an object.");
    }
    payload = parsed;
  } catch {
    await recordAudit("WEBHOOK_MALFORMED", {}, null);
    throw new AppError("Malformed Razorpay webhook payload.", 400, "WEBHOOK_MALFORMED");
  }

  const eventName = readString(payload.event);
  if (!eventName) {
    await recordAudit("WEBHOOK_MALFORMED", {}, null);
    throw new AppError("Razorpay webhook event is missing.", 400, "WEBHOOK_MALFORMED");
  }

  if (eventId) {
    try {
      await WebhookEventModel.create({ eventId, eventName });
    } catch (error) {
      if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
        await recordAudit("WEBHOOK_DUPLICATE", { eventName }, null);
        return { eventName, outcome: "NO_CHANGE", duplicate: true };
      }
      throw error;
    }
  }

  const transition = eventTransition(eventName);
  if (!transition) {
    await recordAudit("WEBHOOK_IGNORED", { eventName }, null);
    return { eventName, outcome: "IGNORED", duplicate: false };
  }

  const { paymentLinkId, referenceId } = identifiers(payload);
  const lookup = paymentLinkId ? { razorpayPaymentLinkId: paymentLinkId } : referenceId ? { referenceId } : undefined;
  if (!lookup) {
    await recordAudit("WEBHOOK_UNKNOWN_ORDER", { eventName }, null);
    return { eventName, outcome: "UNKNOWN_ORDER", duplicate: false };
  }

  const order = await OrderModel.findOne(lookup);
  if (!order) {
    await recordAudit("WEBHOOK_UNKNOWN_ORDER", { eventName }, null);
    return { eventName, outcome: "UNKNOWN_ORDER", duplicate: false };
  }

  const updated = await OrderModel.findOneAndUpdate(
    { _id: order._id, status: "AWAITING_PAYMENT" },
    { $set: { status: transition } },
    { new: true }
  );
  const actionId = await actionIdForReference(order.referenceId);
  if (!updated) {
    return { eventName, outcome: "NO_CHANGE", duplicate: false };
  }

  await recordAudit(
    transition === "PAID" ? "ORDER_PAYMENT_CONFIRMED" : "ORDER_PAYMENT_FAILED",
    { eventName, orderStatus: transition },
    actionId
  );
  return { eventName, outcome: transition, duplicate: false };
}
