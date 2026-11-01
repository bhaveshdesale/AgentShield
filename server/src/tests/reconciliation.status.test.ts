import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";

import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { OrderModel } from "../models/Order";
import { createRazorpayPaymentLink } from "../services/razorpay.client";
import { getPaymentStatusByOrderId } from "../services/reconciliation.service";
import { getCoffeeKitId, setupPaymentTestSuite } from "./reconciliation.test-helpers";

describe("Payment provider status reconciliation", () => {
  setupPaymentTestSuite();

it("uses configured test credentials for link creation and status reconciliation", async () => {
    const requests: Array<{ url: string; authorization: string | undefined }> = [];
    globalThis.fetch = async (input, init) => {
      const url = input instanceof URL ? input.toString() : String(input);
      const headers = new Headers(init?.headers);
      requests.push({ url, authorization: headers.get("Authorization") ?? undefined });
      const payload = url.endsWith("/payment_links")
        ? {
            id: "plink_test_mode",
            short_url: "https://rzp.test/plink_test_mode",
            status: "created",
          }
        : {
            id: "plink_test_mode",
            short_url: "https://rzp.test/plink_test_mode",
            reference_id: "mode-reconcile-001",
            status: "created",
          };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const link = await createRazorpayPaymentLink({
      amountInPaise: 10000,
      referenceId: "mode-create-001",
      description: "Test mode configuration check",
    });
    assert.equal(link.id, "plink_test_mode");

    const order = await OrderModel.create({
      items: [{ productId: new Types.ObjectId(getCoffeeKitId()), quantity: 1, unitPriceInPaise: 179900 }],
      amountInPaise: 179900,
      currency: "INR",
      status: "AWAITING_PAYMENT",
      referenceId: "mode-reconcile-001",
      razorpayPaymentLinkId: "plink_test_mode",
      razorpayPaymentLinkUrl: "https://rzp.test/plink_test_mode",
    });
    const status = await getPaymentStatusByOrderId({
      orderId: String(order._id),
    });

    assert.equal(status.razorpayStatus, "created");
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.match(request.url, /^https:\/\/api\.razorpay\.com\/v1\/payment_links/);
      assert.ok(request.authorization?.startsWith("Basic "));
      assert.equal(
        Buffer.from(request.authorization!.slice("Basic ".length), "base64").toString("utf8"),
        "rzp_test_dummy_key_id:dummy-test-api-secret",
      );
    }
  });

it("reconciles provider status idempotently without regressing a paid order", async () => {
    const referenceId = "status-reconcile-paid-001";
    const action = await AgentActionModel.create({
      conversationId: "status-reconcile-test",
      referenceId,
      action: "CREATE_PAYMENT",
      proposal: {
        action: "CREATE_PAYMENT",
        items: [],
        proposedAmountInPaise: 179900,
        reason: "Reconciliation regression test",
        requiresApproval: false,
      },
      reason: "Reconciliation regression test",
      verifiedAmountInPaise: 179900,
      approvalRequired: false,
      approvalStatus: "NOT_REQUIRED",
      executionStatus: "IN_PROGRESS",
    });
    const order = await OrderModel.create({
      items: [{ productId: new Types.ObjectId(getCoffeeKitId()), quantity: 1, unitPriceInPaise: 179900 }],
      amountInPaise: 179900,
      currency: "INR",
      status: "RECOVERING",
      recoveryClaimToken: "status-reconcile-claim-token",
      referenceId,
      razorpayPaymentLinkId: "plink_status_reconcile_001",
      razorpayPaymentLinkUrl: "https://rzp.test/plink_status_reconcile_001",
    });

    let remoteStatus = "paid";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          id: "plink_status_reconcile_001",
          short_url: "https://rzp.test/plink_status_reconcile_001",
          reference_id: referenceId,
          status: remoteStatus,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const paid = await getPaymentStatusByOrderId({ orderId: String(order._id) });
    assert.equal(paid.status, "PAID");
    assert.equal(
      (await OrderModel.findById(order._id))?.recoveryClaimToken,
      undefined,
    );
    assert.equal((await AgentActionModel.findById(action._id))?.executionStatus, "SUCCEEDED");
    assert.equal(
      await AuditLogModel.countDocuments({
        event: "ORDER_PAYMENT_CONFIRMED",
        idempotencyKey: `reconcile:${String(order._id)}:PAID`,
      }),
      1,
    );

    remoteStatus = "failed";
    const lateFailure = await getPaymentStatusByOrderId({ orderId: String(order._id) });
    assert.equal(lateFailure.status, "PAID");
    assert.equal((await AgentActionModel.findById(action._id))?.executionStatus, "SUCCEEDED");
    assert.equal(await AuditLogModel.countDocuments({ event: "ORDER_PAYMENT_FAILED" }), 0);

    remoteStatus = "paid";
    await getPaymentStatusByOrderId({ orderId: String(order._id) });
    assert.equal(
      await AuditLogModel.countDocuments({
        event: "ORDER_PAYMENT_CONFIRMED",
        idempotencyKey: `reconcile:${String(order._id)}:PAID`,
      }),
      1,
    );
  });

it("ignores unknown provider statuses and leaves local state unchanged on lookup errors", async () => {
    const order = await OrderModel.create({
      items: [{ productId: new Types.ObjectId(getCoffeeKitId()), quantity: 1, unitPriceInPaise: 179900 }],
      amountInPaise: 179900,
      currency: "INR",
      status: "AWAITING_PAYMENT",
      referenceId: "status-reconcile-unknown-002",
      razorpayPaymentLinkId: "plink_status_reconcile_002",
      razorpayPaymentLinkUrl: "https://rzp.test/plink_status_reconcile_002",
    });
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          id: "plink_status_reconcile_002",
          short_url: "https://rzp.test/plink_status_reconcile_002",
          reference_id: "status-reconcile-unknown-002",
          status: "pending_review",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const unknown = await getPaymentStatusByOrderId({ orderId: String(order._id) });
    assert.equal(unknown.status, "AWAITING_PAYMENT");
    assert.equal(await AuditLogModel.countDocuments({ event: "ORDER_PAYMENT_CONFIRMED" }), 0);
    assert.equal(await AuditLogModel.countDocuments({ event: "ORDER_PAYMENT_FAILED" }), 0);

    globalThis.fetch = async () => {
      throw new Error("simulated Razorpay lookup failure");
    };
    await assert.rejects(() =>
      getPaymentStatusByOrderId({ orderId: String(order._id) }),
    );
    assert.equal(
      (await OrderModel.findById(order._id))?.status,
      "AWAITING_PAYMENT",
    );
  });
});
