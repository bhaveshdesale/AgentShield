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
const originalRazorpayEnv = {
  NODE_ENV: process.env.NODE_ENV,
  RAZORPAY_MODE: process.env.RAZORPAY_MODE,
  RAZORPAY_TEST_WEBHOOK_SECRET: process.env.RAZORPAY_TEST_WEBHOOK_SECRET,
};
let server: Server;
let endpoint = "";

function restoreRazorpayEnv(): void {
  for (const [name, value] of Object.entries(originalRazorpayEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

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
    process.env.NODE_ENV = "test";
    process.env.RAZORPAY_MODE = "test";
    process.env.RAZORPAY_TEST_WEBHOOK_SECRET = TEST_SECRET;
    await connectDatabase(resolveTestUri());
    await startServer();
  });

  beforeEach(async () => {
    process.env.RAZORPAY_TEST_WEBHOOK_SECRET = TEST_SECRET;
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
    restoreRazorpayEnv();
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
    delete process.env.RAZORPAY_TEST_WEBHOOK_SECRET;
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
    assert.equal(duplicateBody.outcome, "PAID");
    assert.equal(await WebhookEventModel.countDocuments({ eventId: "evt-duplicate-004" }), 1);
    assert.equal(await AuditLogModel.countDocuments({ event: "ORDER_PAYMENT_CONFIRMED" }), 1);
    assert.equal(await AuditLogModel.countDocuments({
      event: "ORDER_PAYMENT_CONFIRMED",
      idempotencyKey: "razorpay:evt-duplicate-004",
    }), 1);
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

  it("claims concurrent duplicate deliveries and preserves completed dedupe across restart", async () => {
    await createAwaitingOrder("webhook-concurrent-007", "plink_concurrent_007");
    const rawBody = paymentLinkPayload("payment_link.paid", "plink_concurrent_007", "webhook-concurrent-007");
    const [first, second] = await Promise.all([
      send(rawBody, { eventId: "evt-concurrent-007" }),
      send(rawBody, { eventId: "evt-concurrent-007" }),
    ]);
    assert.ok([200, 503].includes(first.status));
    assert.ok([200, 503].includes(second.status));
    if (first.status === 503 || second.status === 503) {
      assert.equal((await send(rawBody, { eventId: "evt-concurrent-007" })).status, 200);
    }
    assert.equal((await OrderModel.findOne({ referenceId: "webhook-concurrent-007" }))?.status, "PAID");
    assert.equal(await AuditLogModel.countDocuments({
      event: "ORDER_PAYMENT_CONFIRMED",
      idempotencyKey: "razorpay:evt-concurrent-007",
    }), 1);

    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
    await startServer();
    const afterRestart = await send(rawBody, { eventId: "evt-concurrent-007" });
    assert.equal(afterRestart.status, 200);
    assert.equal((await afterRestart.json() as { duplicate: boolean }).duplicate, true);
    assert.equal(await AuditLogModel.countDocuments({
      event: "ORDER_PAYMENT_CONFIRMED",
      idempotencyKey: "razorpay:evt-concurrent-007",
    }), 1);
  });

  it("reclaims a persisted processing claim after its lease expires", async () => {
    await createAwaitingOrder("webhook-expired-lease-012", "plink_expired_lease_012");
    const eventId = "evt-expired-lease-012";
    await WebhookEventModel.create({
      eventId,
      eventName: "payment_link.paid",
      status: "PROCESSING",
      transition: "PAID",
      paymentLinkId: "plink_expired_lease_012",
      referenceId: "webhook-expired-lease-012",
      claimId: "abandoned-process-claim",
      leaseExpiresAt: new Date(Date.now() - 1_000),
      attempts: 1,
    });

    const response = await send(
      paymentLinkPayload(
        "payment_link.paid",
        "plink_expired_lease_012",
        "webhook-expired-lease-012",
      ),
      { eventId },
    );
    const event = await WebhookEventModel.findOne({ eventId });

    assert.equal(response.status, 200);
    assert.equal((await response.json() as { duplicate: boolean }).duplicate, false);
    assert.equal(event?.status, "PROCESSED");
    assert.equal(event?.attempts, 2);
    assert.equal(
      (await OrderModel.findOne({ referenceId: "webhook-expired-lease-012" }))?.status,
      "PAID",
    );
  });

  it("retries after a transient order-state write failure", async () => {
    await createAwaitingOrder("webhook-write-retry-008", "plink_write_retry_008");
    const rawBody = paymentLinkPayload("payment_link.paid", "plink_write_retry_008", "webhook-write-retry-008");
    const original = OrderModel.findOneAndUpdate;
    let failed = false;
    OrderModel.findOneAndUpdate = function (
      this: typeof OrderModel,
      ...args: Parameters<typeof original>
    ) {
      if (!failed) {
        failed = true;
        throw new Error("simulated transient order write failure");
      }
      return original.apply(this, args);
    } as typeof original;
    try {
      assert.equal((await send(rawBody, { eventId: "evt-write-retry-008" })).status, 500);
    } finally {
      OrderModel.findOneAndUpdate = original;
    }
    assert.equal((await WebhookEventModel.findOne({ eventId: "evt-write-retry-008" }))?.status, "RETRYABLE_FAILURE");
    assert.equal((await send(rawBody, { eventId: "evt-write-retry-008" })).status, 200);
    assert.equal((await OrderModel.findOne({ referenceId: "webhook-write-retry-008" }))?.status, "PAID");
  });

  it("recovers a payment transition when its first audit write fails", async () => {
    await createAwaitingOrder("webhook-audit-retry-009", "plink_audit_retry_009");
    const rawBody = paymentLinkPayload("payment_link.paid", "plink_audit_retry_009", "webhook-audit-retry-009");
    const original = AuditLogModel.updateOne;
    let failed = false;
    AuditLogModel.updateOne = function (
      this: typeof AuditLogModel,
      ...args: Parameters<typeof original>
    ) {
      const filter = args[0] as { event?: string };
      if (!failed && filter.event === "ORDER_PAYMENT_CONFIRMED") {
        failed = true;
        throw new Error("simulated audit write failure");
      }
      return original.apply(this, args);
    } as typeof original;
    try {
      assert.equal((await send(rawBody, { eventId: "evt-audit-retry-009" })).status, 500);
    } finally {
      AuditLogModel.updateOne = original;
    }
    assert.equal((await OrderModel.findOne({ referenceId: "webhook-audit-retry-009" }))?.status, "PAID");
    assert.equal((await WebhookEventModel.findOne({ eventId: "evt-audit-retry-009" }))?.status, "RETRYABLE_FAILURE");
    assert.equal((await send(rawBody, { eventId: "evt-audit-retry-009" })).status, 200);
    assert.equal(await AuditLogModel.countDocuments({
      event: "ORDER_PAYMENT_CONFIRMED",
      idempotencyKey: "razorpay:evt-audit-retry-009",
    }), 1);
    assert.equal((await WebhookEventModel.findOne({ eventId: "evt-audit-retry-009" }))?.status, "PROCESSED");
  });

  it("recovers if the successful-event state write fails", async () => {
    await createAwaitingOrder("webhook-finalize-retry-010", "plink_finalize_retry_010");
    const rawBody = paymentLinkPayload("payment_link.paid", "plink_finalize_retry_010", "webhook-finalize-retry-010");
    const original = WebhookEventModel.updateOne;
    let failed = false;
    WebhookEventModel.updateOne = function (
      this: typeof WebhookEventModel,
      ...args: unknown[]
    ) {
      const update = (args[1] ?? args[0]) as { $set?: { status?: string } };
      if (!failed && update.$set?.status === "PROCESSED") {
        failed = true;
        throw new Error("simulated final event persistence failure");
      }
      return Reflect.apply(original, this, args) as ReturnType<typeof original>;
    } as typeof original;
    try {
      assert.equal((await send(rawBody, { eventId: "evt-finalize-retry-010" })).status, 500);
    } finally {
      WebhookEventModel.updateOne = original;
    }
    assert.equal((await OrderModel.findOne({ referenceId: "webhook-finalize-retry-010" }))?.status, "PAID");
    assert.equal((await WebhookEventModel.findOne({ eventId: "evt-finalize-retry-010" }))?.status, "RETRYABLE_FAILURE");
    assert.equal((await send(rawBody, { eventId: "evt-finalize-retry-010" })).status, 200);
    assert.equal(await AuditLogModel.countDocuments({
      event: "ORDER_PAYMENT_CONFIRMED",
      idempotencyKey: "razorpay:evt-finalize-retry-010",
    }), 1);
  });

  it("retries an event whose order is not yet available", async () => {
    const unknown = await send(paymentLinkPayload("payment_link.paid", "plink_unknown_006", "webhook-unknown-006"), { eventId: "evt-unknown-006" });
    assert.equal(unknown.status, 503);
    assert.equal((await WebhookEventModel.findOne({ eventId: "evt-unknown-006" }))?.status, "RETRYABLE_FAILURE");
    await createAwaitingOrder("webhook-unknown-006", "plink_unknown_006");
    const retried = await send(paymentLinkPayload("payment_link.paid", "plink_unknown_006", "webhook-unknown-006"), { eventId: "evt-unknown-006" });
    assert.equal(retried.status, 200);
    assert.equal((await OrderModel.findOne({ referenceId: "webhook-unknown-006" }))?.status, "PAID");
    assert.equal((await WebhookEventModel.findOne({ eventId: "evt-unknown-006" }))?.status, "PROCESSED");
  });

  it("handles malformed payloads without persisting an event", async () => {
    const malformedRaw = "{not-json";
    const malformed = await send(malformedRaw, { eventId: "evt-malformed-006" });

    assert.equal(malformed.status, 400);
    assert.equal(await WebhookEventModel.countDocuments({ eventId: "evt-malformed-006" }), 0);
  });
});
