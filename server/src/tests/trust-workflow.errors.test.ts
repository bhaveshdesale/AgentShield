import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRODUCT_PRICE_IN_PAISE, INTERNAL_ERROR_MARKER, QUERY_SECRET_MARKER, PROVIDER_ERROR_MARKER, JsonResponse, originalFetch, productId, users, request, signIn, getProposal, validateProposal, approveAction, createPayment, setProviderMock, OrderModel, logger, registerTrustWorkflowTestHooks } from "./trust-workflow.integration.test-setup";

describe("Authenticated workflow error handling", () => {
  registerTrustWorkflowTestHooks();

  it("returns a generic server error and omits unexpected internal error text from request logs", async () => {
    const admin = await signIn(users.admin);
    const originalFind = OrderModel.find;
    const originalLoggerError = logger.error;
    const logEntries: string[] = [];

    Object.defineProperty(OrderModel, "find", {
      configurable: true,
      value: () => {
        throw new Error(INTERNAL_ERROR_MARKER);
      },
    });
    logger.error = (message, context) => {
      logEntries.push(`${message} ${JSON.stringify(context)}`);
    };

    try {
      const response = await request("/api/payments", {}, admin);
      assert.equal(response.status, 500);
      const body = await response.json() as JsonResponse;
      assert.equal(body.code, "INTERNAL_ERROR");
      assert.equal(body.message, "An unexpected error occurred. The request was not completed.");
      assert.equal(JSON.stringify(body).includes(INTERNAL_ERROR_MARKER), false);
      assert.equal(logEntries.length, 1);
      assert.equal(logEntries[0].includes(INTERNAL_ERROR_MARKER), false);
      assert.match(logEntries[0], /"errorType":"Error"/);
    } finally {
      Object.defineProperty(OrderModel, "find", {
        configurable: true,
        value: originalFind,
      });
      logger.error = originalLoggerError;
    }
  });
  it("does not echo or log query-string values for unknown routes", async () => {
    const originalLoggerInfo = logger.info;
    const originalLoggerWarn = logger.warn;
    const entries: string[] = [];
    logger.info = (message, context) => {
      entries.push(`${message} ${JSON.stringify(context)}`);
    };
    logger.warn = (message, context) => {
      entries.push(`${message} ${JSON.stringify(context)}`);
    };

    try {
      const response = await request(`/missing-route?token=${QUERY_SECRET_MARKER}`);
      const body = await response.json() as JsonResponse;

      assert.equal(response.status, 404);
      assert.equal(JSON.stringify(body).includes(QUERY_SECRET_MARKER), false);
      assert.ok(entries.some((entry) => entry.includes('"path":"/missing-route"')));
      assert.equal(entries.some((entry) => entry.includes(QUERY_SECRET_MARKER)), false);
    } finally {
      logger.info = originalLoggerInfo;
      logger.warn = originalLoggerWarn;
    }
  });
  it("does not expose payment provider rejection details to the client or routine logs", async () => {
    const approver = await signIn(users.approver);
    const proposal = await getProposal(approver);
    const validation = await validateProposal(approver, proposal);
    assert.equal(validation.decision, "ALLOW");
    assert.equal((await approveAction(approver, validation.actionId)).status, 200);

    const originalLoggerError = logger.error;
    const logEntries: string[] = [];
    logger.error = (message, context) => {
      logEntries.push(`${message} ${JSON.stringify(context)}`);
    };
    setProviderMock(async () => Response.json({
      error: {
        code: "BAD_REQUEST_ERROR",
        field: "amount",
        description: PROVIDER_ERROR_MARKER,
      },
    }, { status: 400 }));

    try {
      const response = await createPayment(approver, validation.actionId);
      const body = await response.json() as JsonResponse;

      assert.equal(response.status, 502);
      assert.equal(body.code, "RAZORPAY_ERROR");
      assert.equal(body.message, "Payment provider rejected the payment link request.");
      assert.equal(JSON.stringify(body).includes(PROVIDER_ERROR_MARKER), false);
      assert.equal(logEntries.some((entry) => entry.includes(PROVIDER_ERROR_MARKER)), false);
    } finally {
      globalThis.fetch = originalFetch;
      logger.error = originalLoggerError;
    }
  });
  it("does not expose provider lookup details when refreshing payment status", async () => {
    const approver = await signIn(users.approver);
    const order = await OrderModel.create({
      items: [{ productId, quantity: 1, unitPriceInPaise: PRODUCT_PRICE_IN_PAISE }],
      amountInPaise: PRODUCT_PRICE_IN_PAISE,
      currency: "INR",
      status: "AWAITING_PAYMENT",
      referenceId: "phase11-lookup-error",
      razorpayPaymentLinkId: "plink_phase11_lookup",
      razorpayPaymentLinkUrl: "https://rzp.io/i/phase11-lookup",
    });
    setProviderMock(async () => Response.json({
      error: { description: PROVIDER_ERROR_MARKER },
    }, { status: 500 }));

    const response = await request(
      `/api/payments/${String(order._id)}/status`,
      {},
      approver,
    );
    const body = await response.json() as JsonResponse;

    assert.equal(response.status, 502);
    assert.equal(body.code, "RAZORPAY_ERROR");
    assert.equal(body.message, "Payment provider lookup failed.");
    assert.equal(JSON.stringify(body).includes(PROVIDER_ERROR_MARKER), false);
    globalThis.fetch = originalFetch;
  });
});
