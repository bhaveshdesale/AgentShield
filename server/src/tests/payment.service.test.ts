import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";
import "../config/env";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { validateAction } from "../controllers/action.controller";
import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { approveActionAndCreatePayment } from "../services/payment.service";

const TEST_DB_NAME = "agentshield_payment_test";
const originalFetch = globalThis.fetch;
let coffeeKitId = "";

function resolveTestUri(): string {
  const raw = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI ?? "";
  if (raw.trim().length === 0) {
    throw new Error("Set MONGODB_TEST_URI (or MONGODB_URI) to run payment tests.");
  }
  return raw.replace(/\/[^/?]*(\?.*)?$/, `/${TEST_DB_NAME}$1`);
}

async function validate(body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  let status = 200;
  let responseBody: unknown;
  let forwarded: unknown;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: unknown) {
      responseBody = payload;
      return this;
    },
  };
  const next: NextFunction = (error?: unknown) => {
    forwarded = error;
  };
  await validateAction({ body } as Request, res as unknown as Response, next);
  if (forwarded) {
    throw forwarded;
  }
  return { status, body: responseBody };
}

function proposal(referenceId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "CREATE_PAYMENT",
    items: [{ productId: coffeeKitId, quantity: 1 }],
    proposedAmountInPaise: 179900,
    reason: "Customer requested the coffee kit.",
    requiresApproval: true,
    referenceId,
    ...overrides,
  };
}

describe("M5 approval and Razorpay execution", () => {
  before(async () => {
    await connectDatabase(resolveTestUri());
  });

  beforeEach(async () => {
    await Promise.all([
      AgentActionModel.deleteMany({}),
      AuditLogModel.deleteMany({}),
      MerchantModel.deleteMany({}),
      OrderModel.deleteMany({}),
      ProductModel.deleteMany({}),
    ]);
    await MerchantModel.create({
      name: "Payment Test Store",
      policy: {
        maxTransactionAmount: 500000,
        maxDiscountPercent: 10,
        requireHumanApproval: true,
        allowRefunds: false,
        allowPayouts: false,
      },
    });
    const coffeeKit = await ProductModel.create({
      name: "Artisan Coffee Kit",
      description: "Test product",
      priceInPaise: 179900,
      currency: "INR",
      category: "coffee",
      tags: ["coffee"],
      inventory: 5,
      frequentlyBoughtWith: [],
    });
    coffeeKitId = String(coffeeKit._id);
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await disconnectDatabase();
  });

  it("persists validation, requires approval, and never calls Razorpay before approval", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("Razorpay must not be called during validation");
    };
    const result = await validate(proposal("m5-validate-001"));
    const response = result.body as { actionId: string; decision: string };
    const action = await AgentActionModel.findById(response.actionId);

    assert.equal(result.status, 200);
    assert.equal(response.decision, "ALLOW");
    assert.ok(action);
    assert.equal(action?.approvalStatus, "PENDING");
    assert.equal(action?.executionStatus, "NOT_STARTED");
    assert.equal(action?.verifiedAmountInPaise, 179900);
    assert.equal(calls, 0);
  });

  it("blocks malformed mixed item input instead of silently dropping it", async () => {
    await assert.rejects(
      () => validate(proposal("m5-invalid-items-002", { items: [{ productId: coffeeKitId, quantity: 1 }, { productId: "bad", quantity: 1 }] })),
      (error: unknown) => error instanceof Error && error.message.includes("Each item")
    );
  });

  it("rejects a missing action and a blocked action", async () => {
    await assert.rejects(
      () => approveActionAndCreatePayment({ actionId: "507f1f77bcf86cd799439011" }),
      (error: unknown) => error instanceof Error && error.message.includes("not found")
    );
    const blocked = await validate(proposal("m5-blocked-003", { proposedAmountInPaise: 1 }));
    const actionId = (blocked.body as { actionId: string }).actionId;
    await assert.rejects(
      () => approveActionAndCreatePayment({ actionId }),
      (error: unknown) => error instanceof Error && error.message.includes("policy-allowed")
    );
  });

  it("recomputes price, creates one payment link, and stores authoritative order prices", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ id: "plink_m5", short_url: "https://rzp.test/plink_m5", status: "created" }), { status: 200 });
    };
    const validated = await validate(proposal("m5-approved-004"));
    const actionId = (validated.body as { actionId: string }).actionId;
    const approved = await approveActionAndCreatePayment({ actionId, credentials: { keyId: "test_id", keySecret: "test_secret" } });
    const order = await OrderModel.findById(approved.orderId);

    assert.equal(calls, 1);
    assert.equal(approved.paymentLinkId, "plink_m5");
    assert.equal(order?.status, "AWAITING_PAYMENT");
    assert.equal(order?.amountInPaise, 179900);
    assert.equal(order?.items[0].unitPriceInPaise, 179900);
    await assert.rejects(() => approveActionAndCreatePayment({ actionId, credentials: { keyId: "test_id", keySecret: "test_secret" } }));
    await assert.rejects(() => validate(proposal("m5-approved-004")));
    assert.equal(await OrderModel.countDocuments({ referenceId: "m5-approved-004" }), 1);
    assert.equal(calls, 1);
  });

  it("re-evaluates the persisted allowed proposal and executes against unchanged policy and catalog", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ id: "plink_m5_regression", short_url: "https://rzp.test/plink_m5_regression", status: "created" }), { status: 200 });
    };
    const validated = await validate(proposal("m5-revalidation-regression-005"));
    const actionId = (validated.body as { actionId: string }).actionId;
    const persisted = await AgentActionModel.findById(actionId);

    assert.equal(persisted?.policyResult?.decision, "ALLOW");
    assert.equal(persisted?.proposal.proposedAmountInPaise, 179900);
    assert.equal(String(persisted?.proposal.items[0].productId), coffeeKitId);

    const approved = await approveActionAndCreatePayment({ actionId, credentials: { keyId: "test_id", keySecret: "test_secret" } });

    assert.equal(calls, 1);
    assert.equal(approved.paymentLinkId, "plink_m5_regression");
    assert.equal((await AgentActionModel.findById(actionId))?.executionStatus, "SUCCEEDED");
  });

  it("fails safely when Razorpay rejects the request", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { description: "declined" } }), { status: 500 });
    const validated = await validate(proposal("m5-failure-005"));
    const actionId = (validated.body as { actionId: string }).actionId;
    await assert.rejects(() => approveActionAndCreatePayment({ actionId, credentials: { keyId: "test_id", keySecret: "test_secret" } }));
    const [action, order] = await Promise.all([
      AgentActionModel.findById(actionId),
      OrderModel.findOne({ referenceId: "m5-failure-005" }),
    ]);
    assert.equal(action?.executionStatus, "FAILED");
    assert.equal(order?.status, "FAILED");
    assert.ok(await AuditLogModel.exists({ actionId, event: "PAYMENT_EXECUTION_FAILED" }));
  });
});
