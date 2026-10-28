import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type {
  NextFunction,
  Request,
  Response as ExpressResponse,
} from "express";

import "../config/env";

import {
  connectDatabase,
  disconnectDatabase,
} from "../config/db";

import {
  approveAction,
  validateAction,
} from "../controllers/action.controller";

import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";

import {
  approveActionAndCreatePayment,
  createPaymentForApprovedAction,
} from "../services/payment.service";

const TEST_DB_NAME = "agentshield_payment_test";

const originalFetch = globalThis.fetch;
const originalRazorpayEnv = {
  NODE_ENV: process.env.NODE_ENV,
  RAZORPAY_MODE: process.env.RAZORPAY_MODE,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
};

let coffeeKitId = "";
const testActor = {
  id: "64b000000000000000000001",
  email: "approver@example.test",
  role: "admin" as const,
};

/**
 * Resolve a dedicated MongoDB database for this test suite.
 *
 * Example:
 * mongodb://localhost:27017/agentshield
 * becomes:
 * mongodb://localhost:27017/agentshield_payment_test
 */
function resolveTestUri(): string {
  const raw =
    process.env.MONGODB_TEST_URI ??
    process.env.MONGODB_URI ??
    "";

  if (raw.trim().length === 0) {
    throw new Error(
      "Set MONGODB_TEST_URI (or MONGODB_URI) to run payment tests.",
    );
  }

  return raw.replace(
    /\/[^/?]*(\?.*)?$/,
    `/${TEST_DB_NAME}$1`,
  );
}

function restoreRazorpayEnv(): void {
  for (const [name, value] of Object.entries(originalRazorpayEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

/**
 * Call validateAction directly without starting an HTTP server.
 */
async function validate(
  body: Record<string, unknown>,
): Promise<{
  status: number;
  body: unknown;
}> {
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

  await validateAction(
    { body } as Request,
    res as unknown as ExpressResponse,
    next,
  );

  if (forwarded) {
    throw forwarded;
  }

  return {
    status,
    body: responseBody,
  };
}

/**
 * Standard CREATE_PAYMENT proposal used throughout the tests.
 */
function proposal(
  referenceId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    action: "CREATE_PAYMENT",

    items: [
      {
        productId: coffeeKitId,
        quantity: 1,
      },
    ],

    proposedAmountInPaise: 179900,

    reason: "Customer requested the coffee kit.",

    requiresApproval: true,

    referenceId,

    ...overrides,
  };
}

/**
 * Assert an error message without relying on instanceof Error.
 *
 * AppError can cross module/runtime boundaries in test execution,
 * so checking the actual error message is more robust.
 */
function hasErrorMessage(
  pattern: RegExp,
): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    if (
      typeof error !== "object" ||
      error === null ||
      !("message" in error)
    ) {
      return false;
    }

    const message = String(
      (error as { message: unknown }).message,
    );

    return pattern.test(message);
  };
}

describe("M5 approval and Razorpay execution", () => {
  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.RAZORPAY_MODE = "test";
    process.env.RAZORPAY_KEY_ID = "rzp_test_dummy_key_id";
    process.env.RAZORPAY_KEY_SECRET = "dummy-test-api-secret";
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
    restoreRazorpayEnv();
  });




  it(
    "persists validation, requires approval, and never calls Razorpay before approval",
    async () => {
      let calls = 0;

      globalThis.fetch = async () => {
        calls += 1;

        throw new Error(
          "Razorpay must not be called during validation",
        );
      };

      const result = await validate(
        proposal("m5-validate-001"),
      );

      const response = result.body as {
        actionId: string;
        decision: string;
      };

      const action =
        await AgentActionModel.findById(
          response.actionId,
        );

      assert.equal(result.status, 200);
      assert.equal(response.decision, "ALLOW");

      assert.ok(action);

      assert.equal(
        action?.approvalStatus,
        "PENDING",
      );

      assert.equal(
        action?.executionStatus,
        "NOT_STARTED",
      );

      assert.equal(
        action?.verifiedAmountInPaise,
        179900,
      );

      assert.equal(calls, 0);
    },
  );

  it(
    "approves an ALLOW action without executing Razorpay",
    async () => {
      let razorpayCalls = 0;

      globalThis.fetch = async () => {
        razorpayCalls += 1;

        throw new Error(
          "Razorpay must not be called during approval",
        );
      };

      const validated = await validate(
        proposal(
          "m5-explicit-approval-001",
        ),
      );

      const actionId = (
        validated.body as {
          actionId: string;
        }
      ).actionId;

      let status = 200;
      let responseBody: unknown;

      const req = {
        body: {
          actionId,
        },
        auth: {
          ...testActor,
          sessionId: "test-session",
          csrfToken: "test-csrf-token",
        },
      } as Request;

      const res = {
        status(code: number) {
          status = code;
          return this;
        },

        json(payload: unknown) {
          responseBody = payload;
          return this;
        },
      } as unknown as ExpressResponse;

      let forwarded: unknown;

      const next: NextFunction = (
        error?: unknown,
      ) => {
        forwarded = error;
      };

      await approveAction(
        req,
        res,
        next,
      );

      if (forwarded) {
        throw forwarded;
      }

      assert.equal(status, 200);

      const action =
        await AgentActionModel.findById(
          actionId,
        );

      assert.equal(
        action?.approvalStatus,
        "APPROVED",
      );

      assert.equal(
        action?.executionStatus,
        "NOT_STARTED",
      );

      assert.equal(
        razorpayCalls,
        0,
      );

      assert.ok(responseBody);
    },
  );

  it(
    "rejects payment creation when human approval has not happened",
    async () => {
      let razorpayCalls = 0;

      globalThis.fetch = async () => {
        razorpayCalls += 1;

        throw new Error(
          "Razorpay must not be called",
        );
      };

      const validated = await validate(
        proposal("m5-no-approval-002"),
      );

      const actionId = (
        validated.body as {
          actionId: string;
        }
      ).actionId;

      await assert.rejects(
  () =>
    createPaymentForApprovedAction({
      actionId,
      actor: testActor,
    }),
  /requires human approval before payment creation/,
);

      const action =
        await AgentActionModel.findById(
          actionId,
        );

      assert.equal(
        action?.approvalStatus,
        "PENDING",
      );

      assert.equal(
        action?.executionStatus,
        "NOT_STARTED",
      );

      assert.equal(
        razorpayCalls,
        0,
      );

      assert.equal(
        await OrderModel.countDocuments(),
        0,
      );
    },
  );

  it(
    "executes payment only after explicit approval",
    async () => {
      let razorpayCalls = 0;

      globalThis.fetch = async () => {
        razorpayCalls += 1;

        return new Response(
          JSON.stringify({
            id: "plink_explicit_003",
            short_url:
              "https://rzp.test/plink_explicit_003",
            status: "created",
          }),
          {
            status: 200,
            headers: {
              "content-type":
                "application/json",
            },
          },
        );
      };

      // STEP 1 — validate

      const validated = await validate(
        proposal(
          "m5-explicit-flow-003",
        ),
      );

      const actionId = (
        validated.body as {
          actionId: string;
        }
      ).actionId;

      const beforeApproval =
        await AgentActionModel.findById(
          actionId,
        );

      assert.equal(
        beforeApproval?.approvalStatus,
        "PENDING",
      );

      assert.equal(
        beforeApproval?.executionStatus,
        "NOT_STARTED",
      );

      assert.equal(
        razorpayCalls,
        0,
      );

      // STEP 2 — explicit human approval

      let approvalStatus = 200;
      let approvalBody: unknown;

      const req = {
        body: {
          actionId,
        },
        auth: {
          ...testActor,
          sessionId: "test-session",
          csrfToken: "test-csrf-token",
        },
      } as Request;

      const res = {
        status(code: number) {
          approvalStatus = code;
          return this;
        },

        json(payload: unknown) {
          approvalBody = payload;
          return this;
        },
      } as unknown as ExpressResponse;

      let forwarded: unknown;

      const next: NextFunction = (
        error?: unknown,
      ) => {
        forwarded = error;
      };

      await approveAction(
        req,
        res,
        next,
      );

      if (forwarded) {
        throw forwarded;
      }

      assert.equal(
        approvalStatus,
        200,
      );

      assert.ok(approvalBody);

      const afterApproval =
        await AgentActionModel.findById(
          actionId,
        );

      assert.equal(
        afterApproval?.approvalStatus,
        "APPROVED",
      );

      assert.equal(
        afterApproval?.executionStatus,
        "NOT_STARTED",
      );

      // STEP 3 — payment execution

      const payment =
        await createPaymentForApprovedAction({
          actionId,
          actor: testActor,
        });

      assert.equal(
        payment.success,
        true,
      );

      assert.equal(
        payment.paymentLinkId,
        "plink_explicit_003",
      );

      assert.equal(
        razorpayCalls,
        1,
      );

      const finalAction =
        await AgentActionModel.findById(
          actionId,
        );

      assert.equal(
        finalAction?.approvalStatus,
        "APPROVED",
      );

      assert.equal(
        finalAction?.executionStatus,
        "SUCCEEDED",
      );

      const order =
        await OrderModel.findOne({
          referenceId:
            "m5-explicit-flow-003",
        });

      assert.ok(order);

      assert.equal(
        order?.status,
        "AWAITING_PAYMENT",
      );

      assert.equal(
        order?.amountInPaise,
        179900,
      );
    },
  );

  it(
    "blocks malformed mixed item input instead of silently dropping it",
    async () => {
      await assert.rejects(
        () =>
          validate(
            proposal(
              "m5-invalid-items-002",
              {
                items: [
                  {
                    productId:
                      coffeeKitId,
                    quantity: 1,
                  },
                  {
                    productId: "bad",
                    quantity: 1,
                  },
                ],
              },
            ),
          ),

        hasErrorMessage(
          /Each item/i,
        ),
      );
    },
  );

  it(
    "rejects a missing action and a blocked action",
    async () => {
      await assert.rejects(
        () =>
          approveActionAndCreatePayment({
            actionId:
              "507f1f77bcf86cd799439011",
            actor: testActor,
          }),

        hasErrorMessage(/not found/i),
      );

      const blocked = await validate(
        proposal(
          "m5-blocked-003",
          {
            proposedAmountInPaise: 1,
          },
        ),
      );

      const actionId = (
        blocked.body as {
          actionId: string;
        }
      ).actionId;

      await assert.rejects(
        () =>
          approveActionAndCreatePayment({
            actionId,
            actor: testActor,
          }),

        hasErrorMessage(
          /policy-allowed/i,
        ),
      );
    },
  );

  it(
    "recomputes price, creates one payment link, and stores authoritative order prices",
    async () => {
      let calls = 0;

      globalThis.fetch = async () => {
        calls += 1;

        return new Response(
          JSON.stringify({
            id: "plink_m5",
            short_url:
              "https://rzp.test/plink_m5",
            status: "created",
          }),
          {
            status: 200,
          },
        );
      };

      const validated = await validate(
        proposal("m5-approved-004"),
      );

      const actionId = (
        validated.body as {
          actionId: string;
        }
      ).actionId;

      const approved =
        await approveActionAndCreatePayment({
          actionId,
          actor: testActor,
        });

      const order =
        await OrderModel.findById(
          approved.orderId,
        );

      assert.equal(calls, 1);

      assert.equal(
        approved.paymentLinkId,
        "plink_m5",
      );

      assert.equal(
        order?.status,
        "AWAITING_PAYMENT",
      );

      assert.equal(
        order?.amountInPaise,
        179900,
      );

      assert.equal(
        order?.items[0]
          .unitPriceInPaise,
        179900,
      );

      await assert.rejects(
        () =>
          approveActionAndCreatePayment({
            actionId,
            actor: testActor,
          }),
      );

      await assert.rejects(
        () =>
          validate(
            proposal(
              "m5-approved-004",
            ),
          ),
      );

      assert.equal(
        await OrderModel.countDocuments({
          referenceId:
            "m5-approved-004",
        }),
        1,
      );

      assert.equal(calls, 1);
    },
  );

  it(
    "re-evaluates the persisted allowed proposal and executes against unchanged policy and catalog",
    async () => {
      let calls = 0;

      globalThis.fetch = async () => {
        calls += 1;

        return new Response(
          JSON.stringify({
            id:
              "plink_m5_regression",
            short_url:
              "https://rzp.test/plink_m5_regression",
            status: "created",
          }),
          {
            status: 200,
          },
        );
      };

      const validated = await validate(
        proposal(
          "m5-revalidation-regression-005",
        ),
      );

      const actionId = (
        validated.body as {
          actionId: string;
        }
      ).actionId;

      const persisted =
        await AgentActionModel.findById(
          actionId,
        );

      assert.equal(
        persisted?.policyResult?.decision,
        "ALLOW",
      );

      assert.equal(
        persisted?.proposal
          .proposedAmountInPaise,
        179900,
      );

      assert.equal(
        String(
          persisted?.proposal.items[0]
            .productId,
        ),
        coffeeKitId,
      );

      const approved =
        await approveActionAndCreatePayment({
          actionId,
          actor: testActor,
        });

      assert.equal(
        calls,
        1,
      );

      assert.equal(
        approved.paymentLinkId,
        "plink_m5_regression",
      );

      assert.equal(
        (
          await AgentActionModel.findById(
            actionId,
          )
        )?.executionStatus,
        "SUCCEEDED",
      );
    },
  );

  it(
    "fails safely when Razorpay rejects the request",
    async () => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            error: {
              description: "declined",
            },
          }),
          {
            status: 500,
          },
        );

      const validated = await validate(
        proposal(
          "m5-failure-005",
        ),
      );

      const actionId = (
        validated.body as {
          actionId: string;
        }
      ).actionId;

      await assert.rejects(
        () =>
          approveActionAndCreatePayment({
            actionId,
            actor: testActor,
          }),
      );

      const [
        action,
        order,
      ] = await Promise.all([
        AgentActionModel.findById(
          actionId,
        ),

        OrderModel.findOne({
          referenceId:
            "m5-failure-005",
        }),
      ]);

      assert.equal(
        action?.executionStatus,
        "FAILED",
      );

      assert.equal(
        order?.status,
        "FAILED",
      );

      assert.ok(
        await AuditLogModel.exists({
          actionId,
          event:
            "PAYMENT_EXECUTION_FAILED",
        }),
      );
    },
  );
});
