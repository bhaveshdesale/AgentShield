import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextFunction, Request, Response as ExpressResponse } from "express";
import { validate, testActor, proposal, AgentActionModel, OrderModel, approveAction, createPaymentForApprovedAction, registerPaymentServiceTestHooks } from "./payment.service.test-setup";

describe("Payment approval workflow", () => {
  registerPaymentServiceTestHooks();

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
      let callbackUrl: string | undefined;

      globalThis.fetch = async (_input, init) => {
        razorpayCalls += 1;
        const requestBody = JSON.parse(String(init?.body)) as {
          callback_url?: string;
        };
        callbackUrl = requestBody.callback_url;

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
        callbackUrl,
        `https://checkout.example.test/payments/${String(order._id)}`,
      );

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
});
