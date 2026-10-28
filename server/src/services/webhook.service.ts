import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import { AgentActionModel } from "../models/AgentAction";
import { OrderModel } from "../models/Order";
import { WebhookEventModel } from "../models/WebhookEvent";
import { getRazorpayWebhookSecret } from "../config/razorpay";
import { recordIdempotentAudit } from "./audit.service";
import { AppError } from "../utils/AppError";

type RazorpayPayload = Record<string, unknown>;
type WebhookOutcome = "PAID" | "FAILED" | "IGNORED" | "NO_CHANGE";
type PaymentTransition = "PAID" | "FAILED";

const WEBHOOK_PROCESSING_LEASE_MS = 60_000;

export function verifyRazorpaySignature(rawBody: Buffer, signature: string | undefined): void {
  if (!signature || signature.trim().length === 0) {
    throw new AppError("Missing Razorpay webhook signature.", 401, "WEBHOOK_SIGNATURE_MISSING");
  }

  const secret = getRazorpayWebhookSecret();
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

function identifiers(payload: RazorpayPayload): { paymentLinkId?: string; referenceId?: string } {
  const payloadEntities = asRecord(payload.payload) ?? {};
  const paymentLink = entity(payloadEntities, "payment_link");
  const payment = entity(payloadEntities, "payment");
  const notes = payment ? asRecord(payment.notes) : undefined;
  const paymentLinkId = readString(paymentLink?.id) ?? readString(payment?.payment_link_id);
  const referenceId =
    readString(paymentLink?.reference_id) ??
    readString(notes?.referenceId) ??
    readString(notes?.reference_id);
  return {
    ...(paymentLinkId ? { paymentLinkId } : {}),
    ...(referenceId ? { referenceId } : {}),
  };
}

function eventTransition(eventName: string): PaymentTransition | undefined {
  if (eventName === "payment_link.paid" || eventName === "payment.captured") {
    return "PAID";
  }
  if (eventName === "payment.failed" || eventName === "payment_link.expired") {
    return "FAILED";
  }
  return undefined;
}

function errorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 100);
  }
  return "WEBHOOK_PROCESSING_FAILED";
}

async function findOrder(paymentLinkId?: string, referenceId?: string) {
  if (paymentLinkId) {
    const linkedOrder = await OrderModel.findOne({
      razorpayPaymentLinkId: paymentLinkId,
    });
    if (linkedOrder) {
      return linkedOrder;
    }
  }
  if (referenceId) {
    const referencedOrder = await OrderModel.findOne({ referenceId });
    if (
      referencedOrder &&
      paymentLinkId &&
      referencedOrder.razorpayPaymentLinkId &&
      referencedOrder.razorpayPaymentLinkId !== paymentLinkId
    ) {
      throw new AppError(
        "Webhook payment link does not match the stored order reference.",
        409,
        "WEBHOOK_REFERENCE_MISMATCH",
      );
    }
    return referencedOrder;
  }
  return null;
}

async function applyPaymentTransition(
  eventId: string,
  eventName: string,
  transition: PaymentTransition,
  paymentLinkId?: string,
  referenceId?: string,
): Promise<{ outcome: WebhookOutcome; actionId?: string }> {
  const order = await findOrder(paymentLinkId, referenceId);
  if (!order) {
    throw new AppError(
      "Webhook order is not available yet; delivery should be retried.",
      503,
      "WEBHOOK_ORDER_NOT_FOUND",
    );
  }

  const allowedPriorStates =
    transition === "PAID"
      ? ["CREATED", "AWAITING_PAYMENT", "FAILED", "RECOVERED", "RECOVERING"]
      : ["CREATED", "AWAITING_PAYMENT"];
  const updated = await OrderModel.findOneAndUpdate(
    {
      _id: order._id,
      status: { $in: allowedPriorStates },
    },
    { $set: { status: transition } },
    { new: true },
  );
  const currentOrder = updated ?? await OrderModel.findById(order._id);
  if (!currentOrder) {
    throw new AppError("Webhook order disappeared during processing.", 503, "WEBHOOK_ORDER_NOT_FOUND");
  }

  const action = await AgentActionModel.findOne({ referenceId: order.referenceId }).select("_id executionStatus");
  const actionId = action ? String(action._id) : undefined;
  if (currentOrder.status === "PAID" && transition === "PAID") {
    await AgentActionModel.updateOne(
      { referenceId: order.referenceId, executionStatus: { $ne: "SUCCEEDED" } },
      { $set: { executionStatus: "SUCCEEDED" } },
    );
    await recordIdempotentAudit(
      "ORDER_PAYMENT_CONFIRMED",
      { eventName, orderStatus: "PAID", razorpayIdentifier: paymentLinkId ?? "" },
      `razorpay:${eventId}`,
      actionId,
    );
    return {
      outcome: updated ? "PAID" : "NO_CHANGE",
      ...(actionId ? { actionId } : {}),
    };
  }

  if (currentOrder.status === "FAILED" && transition === "FAILED") {
    await AgentActionModel.updateOne(
      {
        referenceId: order.referenceId,
        executionStatus: { $in: ["IN_PROGRESS", "UNKNOWN", "RECOVERING"] },
      },
      { $set: { executionStatus: "FAILED" } },
    );
    await recordIdempotentAudit(
      "ORDER_PAYMENT_FAILED",
      { eventName, orderStatus: "FAILED", razorpayIdentifier: paymentLinkId ?? "" },
      `razorpay:${eventId}`,
      actionId,
    );
    return {
      outcome: updated ? "FAILED" : "NO_CHANGE",
      ...(actionId ? { actionId } : {}),
    };
  }

  await recordIdempotentAudit(
    "PAYMENT_STATE_EVENT_IGNORED",
    { eventName, orderStatus: currentOrder.status, attemptedStatus: transition },
    `razorpay:${eventId}`,
    actionId,
  );
  return { outcome: "NO_CHANGE", ...(actionId ? { actionId } : {}) };
}

export async function processRazorpayWebhook(
  rawBody: Buffer,
  eventIdHeader: string | undefined,
): Promise<{ eventName: string; outcome: WebhookOutcome; duplicate: boolean }> {
  const eventId = readString(eventIdHeader);
  if (!eventId || eventId.length > 255) {
    throw new AppError("A valid Razorpay event ID is required.", 400, "WEBHOOK_EVENT_ID_MISSING");
  }

  let payload: RazorpayPayload;
  try {
    const decoded: unknown = JSON.parse(rawBody.toString("utf8"));
    const parsed = asRecord(decoded);
    if (!parsed) {
      throw new Error("Webhook payload must be an object.");
    }
    payload = parsed;
  } catch {
    throw new AppError("Malformed Razorpay webhook payload.", 400, "WEBHOOK_MALFORMED");
  }

  const eventName = readString(payload.event);
  if (!eventName) {
    throw new AppError("Razorpay webhook event is missing.", 400, "WEBHOOK_MALFORMED");
  }

  const transition = eventTransition(eventName);
  const refs = identifiers(payload);
  if (transition && !refs.paymentLinkId && !refs.referenceId) {
    throw new AppError(
      "Razorpay payment event has no usable payment reference.",
      400,
      "WEBHOOK_REFERENCE_MISSING",
    );
  }

  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  try {
    await WebhookEventModel.create({
      eventId,
      eventName,
      status: "PENDING",
      transition: transition ?? "IGNORED",
      ...(refs.paymentLinkId ? { paymentLinkId: refs.paymentLinkId } : {}),
      ...(refs.referenceId ? { referenceId: refs.referenceId } : {}),
      payloadHash,
      attempts: 0,
    });
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) {
      throw error;
    }
  }

  const existing = await WebhookEventModel.findOne({ eventId });
  if (!existing) {
    throw new AppError("Webhook event could not be persisted.", 503, "WEBHOOK_STORAGE_FAILED");
  }
  if (
    existing.eventName !== eventName ||
    (existing.payloadHash && existing.payloadHash !== payloadHash)
  ) {
    throw new AppError(
      "Razorpay event ID was reused with a different payload.",
      409,
      "WEBHOOK_EVENT_CONFLICT",
    );
  }
  if (!existing.status || existing.status === "PROCESSED") {
    return {
      eventName: existing.eventName,
      outcome: (existing.outcome as WebhookOutcome | undefined) ?? "NO_CHANGE",
      duplicate: true,
    };
  }

  const now = new Date();
  const claimId = randomUUID();
  const claimed = await WebhookEventModel.findOneAndUpdate(
    {
      eventId,
      $or: [
        { status: { $in: ["PENDING", "RETRYABLE_FAILURE"] } },
        { status: "PROCESSING", leaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: "PROCESSING",
        claimId,
        leaseExpiresAt: new Date(now.getTime() + WEBHOOK_PROCESSING_LEASE_MS),
        lastErrorCode: undefined,
      },
      $inc: { attempts: 1 },
    },
    { new: true },
  );

  if (!claimed) {
    const latest = await WebhookEventModel.findOne({ eventId });
    if (latest?.status === "PROCESSED") {
      return {
        eventName: latest.eventName,
        outcome: (latest.outcome as WebhookOutcome | undefined) ?? "NO_CHANGE",
        duplicate: true,
      };
    }
    throw new AppError(
      "Razorpay event is already being processed; delivery should be retried.",
      503,
      "WEBHOOK_PROCESSING",
    );
  }

  try {
    await recordIdempotentAudit("WEBHOOK_VERIFIED", { eventName }, `razorpay:${eventId}`);
    let outcome: WebhookOutcome = "IGNORED";
    if (claimed.transition === "PAID" || claimed.transition === "FAILED") {
      const applied = await applyPaymentTransition(
        eventId,
        eventName,
        claimed.transition,
        claimed.paymentLinkId,
        claimed.referenceId,
      );
      outcome = applied.outcome;
    } else {
      await recordIdempotentAudit("WEBHOOK_IGNORED", { eventName }, `razorpay:${eventId}`);
    }

    const completed = await WebhookEventModel.updateOne(
      { eventId, status: "PROCESSING", claimId },
      {
        $set: { status: "PROCESSED", outcome, processedAt: new Date() },
        $unset: { claimId: "", leaseExpiresAt: "", lastErrorCode: "" },
      },
    );
    if (completed.modifiedCount !== 1) {
      throw new AppError(
        "Webhook processing lease was lost before completion.",
        503,
        "WEBHOOK_LEASE_LOST",
      );
    }
    return { eventName, outcome, duplicate: false };
  } catch (error) {
    await WebhookEventModel.updateOne(
      { eventId, status: "PROCESSING", claimId },
      {
        $set: {
          status: "RETRYABLE_FAILURE",
          lastErrorCode: errorCode(error),
        },
        $unset: { claimId: "", leaseExpiresAt: "" },
      },
    );
    throw error;
  }
}
