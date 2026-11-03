import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validate, coffeeKitId, testActor, proposal, AgentActionModel, AuditLogModel, OrderModel, approveActionService, approveActionAndCreatePayment, createPaymentForApprovedAction, registerPaymentServiceTestHooks } from "./payment.service.test-setup";

describe("Payment execution behavior", () => {
  registerPaymentServiceTestHooks();

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
    "allows only one concurrent execution of the same approved action",
    async () => {
      let providerCalls = 0;
      globalThis.fetch = async () => {
        providerCalls += 1;
        return new Response(
          JSON.stringify({
            id: "plink_concurrent_execution",
            short_url: "https://rzp.test/plink_concurrent_execution",
            status: "created",
          }),
          { status: 200 },
        );
      };

      const validated = await validate(
        proposal("m5-concurrent-execution-001"),
      );
      const actionId = (
        validated.body as { actionId: string }
      ).actionId;
      await approveActionService({
        actionId,
        actor: testActor,
      });

      const originalFindOneAndUpdate =
        AgentActionModel.findOneAndUpdate;
      let claimArrivals = 0;
      let signalBothClaims!: () => void;
      let releaseClaims!: () => void;
      const bothClaimsArrived = new Promise<void>((resolve) => {
        signalBothClaims = resolve;
      });
      const claimsReleased = new Promise<void>((resolve) => {
        releaseClaims = resolve;
      });

      AgentActionModel.findOneAndUpdate = function (
        this: typeof AgentActionModel,
        ...args: Parameters<typeof originalFindOneAndUpdate>
      ) {
        const filter = args[0] as {
          approvalStatus?: string;
          executionStatus?: string;
        };
        if (
          filter.approvalStatus === "APPROVED" &&
          filter.executionStatus === "NOT_STARTED"
        ) {
          claimArrivals += 1;
          if (claimArrivals === 2) {
            signalBothClaims();
          }
          return claimsReleased.then(() =>
            originalFindOneAndUpdate.apply(this, args),
          );
        }

        return originalFindOneAndUpdate.apply(this, args);
      } as typeof originalFindOneAndUpdate;

      const executions = [
        createPaymentForApprovedAction({
          actionId,
          actor: testActor,
        }),
        createPaymentForApprovedAction({
          actionId,
          actor: testActor,
        }),
      ];
      const settledExecutions = Promise.allSettled(executions);
      let barrierFailed = false;
      let barrierError: unknown;
      let results: PromiseSettledResult<
        Awaited<ReturnType<typeof createPaymentForApprovedAction>>
      >[];
      try {
        const prematureCompletion = Promise.race(
          executions.map((execution) =>
            execution.then(
              () => {
                throw new Error(
                  "An execution completed before both claim attempts arrived.",
                );
              },
              (error: unknown) => {
                throw error;
              },
            ),
          ),
        );
        await Promise.race([
          bothClaimsArrived,
          prematureCompletion,
        ]);
      } catch (error) {
        barrierFailed = true;
        barrierError = error;
      } finally {
        releaseClaims();
      }

      try {
        results = await settledExecutions;
      } finally {
        AgentActionModel.findOneAndUpdate =
          originalFindOneAndUpdate;
      }
      if (barrierFailed) {
        throw barrierError;
      }
      assert.equal(claimArrivals, 2);

      const successful = results.filter(
        (result) => result.status === "fulfilled",
      );
      const rejected = results.filter(
        (result) => result.status === "rejected",
      );
      assert.equal(successful.length, 1);
      assert.equal(rejected.length, 1);
      if (rejected[0].status !== "rejected") {
        assert.fail("Expected one execution to lose the atomic claim.");
      }
      assert.equal(
        (rejected[0].reason as { code?: string }).code,
        "ACTION_ALREADY_PROCESSED",
      );

      const [action, orders] = await Promise.all([
        AgentActionModel.findById(actionId),
        OrderModel.find({ referenceId: "m5-concurrent-execution-001" }),
      ]);
      assert.equal(providerCalls, 1);
      assert.equal(orders.length, 1);
      assert.equal(action?.executionStatus, "SUCCEEDED");
      assert.equal(orders[0].status, "AWAITING_PAYMENT");
      assert.equal(
        orders[0].razorpayPaymentLinkId,
        "plink_concurrent_execution",
      );
      assert.equal(
        await AuditLogModel.countDocuments({
          actionId,
          event: "PAYMENT_LINK_CREATED",
        }),
        1,
      );
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
              code: "BAD_REQUEST_ERROR",
              description: "declined",
              field: "amount",
            },
          }),
          {
            status: 400,
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
