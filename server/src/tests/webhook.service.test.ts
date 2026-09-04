import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { Types } from "mongoose";
import "../config/env";
import { createApp } from "../app";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { OrderModel } from "../models/Order";
import { WebhookEventModel } from "../models/WebhookEvent";

const TEST_DB_NAME = "agentshield_webhook_test";
const TEST_SECRET = "dummy-webhook-secret-for-local-tests";
let server: Server;
let endpoint = "";

function resolveTestUri(): string {
  const raw = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI ?? "";
  if (raw.trim().length === 0) {
    throw new Error("Set MONGODB_TEST_URI (or MONGODB_URI) to run webhook tests.");
  }
  return raw.replace(/\/[^/?]*(\?.*)?$/, `/${TEST_DB_NAME}$1`);
}

function signature(rawBody: string): string {
  return createHmac("sha256", TEST_SECRET).update(rawBody).digest("hex");
}

async function startServer(): Promise<void> {
  server = createApp().listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address.");
  }
  endpoint = `http://127.0.0.1:${address.port}/api/webhooks/razorpay`;
}

async function send(rawBody: string, options: { eventId?: string; signatureValue?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.signatureValue !== undefined) {
    headers["x-razorpay-signature"] = options.signatureValue;
  } else {
    headers["x-razorpay-signature"] = signature(rawBody);
  }
  if (options.eventId !== undefined) {
    headers["x-razorpay-event-id"] = options.eventId;
  }
  return fetch(endpoint, { method: "POST", headers, body: rawBody });
}

async function createAwaitingOrder(referenceId: string, paymentLinkId: string): Promise<void> {
  await OrderModel.create({
    items: [{ productId: new Types.ObjectId(), quantity: 1, unitPriceInPaise: 179900 }],
    amountInPaise: 179900,
    currency: "INR",
    status: "AWAITING_PAYMENT",
    referenceId,
    razorpayPaymentLinkId: paymentLinkId,
    razorpayPaymentLinkUrl: `https://rzp.test/${paymentLinkId}`,
  });
}

function paymentLinkPayload(event: string, paymentLinkId: string, referenceId: string): string {
  return JSON.stringify({ event, payload: { payment_link: { entity: { id: paymentLinkId, reference_id: referenceId } } } });
}

describe("M6 Razorpay webhook verification and idempotency", () => {
  before(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = TEST_SECRET;
    await connectDatabase(resolveTestUri());
    await startServer();
  });

  beforeEach(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = TEST_SECRET;
    await Promise.all([
      AgentActionModel.deleteMany({}),
      AuditLogModel.deleteMany({}),
      OrderModel.deleteMany({}),
      WebhookEventModel.deleteMany({}),
    ]);
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await disconnectDatabase();
  });

  it("accepts a valid signature over the original raw body and confirms payment", async () => {
    await createAwaitingOrder("webhook-success-001", "plink_success_001");
    const rawBody = `{\n  "event": "payment_link.paid",\n  "payload": { "payment_link": { "entity": { "id": "plink_success_001", "reference_id": "webhook-success-001" } } }\n}`;

    const response = await send(rawBody, { eventId: "evt-success-001" });
    const body = await response.json() as { outcome: string; duplicate: boolean };
    const order = await OrderModel.findOne({ referenceId: "webhook-success-001" });

    assert.equal(response.status, 200);
    assert.equal(body.outcome, "PAID");
    assert.equal(body.duplicate, false);
    assert.equal(order?.status, "PAID");
    assert.ok(await AuditLogModel.exists({ event: "WEBHOOK_VERIFIED" }));
    assert.ok(await AuditLogModel.exists({ event: "ORDER_PAYMENT_CONFIRMED" }));
  });

  it("rejects invalid and missing signatures", async () => {
    const rawBody = paymentLinkPayload("payment_link.paid", "plink_invalid_002", "webhook-invalid-002");
    const invalid = await send(rawBody, { eventId: "evt-invalid-002", signatureValue: "not-a-valid-signature" });
    const missing = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: rawBody });

    assert.equal(invalid.status, 401);
    assert.equal(missing.status, 401);
    assert.equal(await WebhookEventModel.countDocuments(), 0);
    assert.equal(await AuditLogModel.countDocuments({ event: "WEBHOOK_INVALID_SIGNATURE" }), 2);
  });

  it("returns a configuration error when the webhook secret is missing", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const response = await send(paymentLinkPayload("payment_link.paid", "plink-secret-003", "webhook-secret-003"), { eventId: "evt-secret-003" });

    assert.equal(response.status, 503);
    assert.equal(await WebhookEventModel.countDocuments(), 0);
  });

  it("uses the event ID unique index to make duplicate success delivery idempotent", async () => {
    await createAwaitingOrder("webhook-duplicate-004", "plink_duplicate_004");
    const rawBody = paymentLinkPayload("payment_link.paid", "plink_duplicate_004", "webhook-duplicate-004");

    const first = await send(rawBody, { eventId: "evt-duplicate-004" });
    const duplicate = await send(rawBody, { eventId: "evt-duplicate-004" });
    const duplicateBody = await duplicate.json() as { duplicate: boolean; outcome: string };

    assert.equal(first.status, 200);
    assert.equal(duplicate.status, 200);
    assert.equal(duplicateBody.duplicate, true);
    assert.equal(duplicateBody.outcome, "NO_CHANGE");
    assert.equal(await WebhookEventModel.countDocuments({ eventId: "evt-duplicate-004" }), 1);
    assert.equal(await AuditLogModel.countDocuments({ event: "ORDER_PAYMENT_CONFIRMED" }), 1);
    assert.ok(await AuditLogModel.exists({ event: "WEBHOOK_DUPLICATE" }));
  });

  it("moves failed payments to FAILED but never moves a PAID order backward", async () => {
    await createAwaitingOrder("webhook-failed-005", "plink_failed_005");
    const failed = await send(paymentLinkPayload("payment.failed", "plink_failed_005", "webhook-failed-005"), { eventId: "evt-failed-005" });
    const failedOrder = await OrderModel.findOne({ referenceId: "webhook-failed-005" });

    await createAwaitingOrder("webhook-paid-005", "plink_paid_005");
    await send(paymentLinkPayload("payment_link.paid", "plink_paid_005", "webhook-paid-005"), { eventId: "evt-paid-005" });
    const lateFailure = await send(paymentLinkPayload("payment.failed", "plink_paid_005", "webhook-paid-005"), { eventId: "evt-late-failure-005" });
    const paidOrder = await OrderModel.findOne({ referenceId: "webhook-paid-005" });

    assert.equal(failed.status, 200);
    assert.equal(failedOrder?.status, "FAILED");
    assert.ok(await AuditLogModel.exists({ event: "ORDER_PAYMENT_FAILED" }));
    assert.equal(lateFailure.status, 200);
    assert.equal(paidOrder?.status, "PAID");
  });

  it("handles unknown orders and malformed payloads safely", async () => {
    const unknown = await send(paymentLinkPayload("payment_link.paid", "plink_unknown_006", "webhook-unknown-006"), { eventId: "evt-unknown-006" });
    const malformedRaw = "{not-json";
    const malformed = await send(malformedRaw, { eventId: "evt-malformed-006" });

    assert.equal(unknown.status, 200);
    assert.equal((await unknown.json() as { outcome: string }).outcome, "UNKNOWN_ORDER");
    assert.equal(malformed.status, 400);
    assert.ok(await AuditLogModel.exists({ event: "WEBHOOK_UNKNOWN_ORDER" }));
    assert.ok(await AuditLogModel.exists({ event: "WEBHOOK_MALFORMED" }));
  });
});
