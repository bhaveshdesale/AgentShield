import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";

import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { OrderModel } from "../models/Order";
import { approveActionAndCreatePayment } from "../services/payment.service";
import { reconcilePayment } from "../services/reconciliation.service";
import { getCoffeeKitId, proposal, setupPaymentTestSuite, testActor, validate } from "./reconciliation.test-helpers";

describe("Payment execution and recovery failures", () => {
  setupPaymentTestSuite();

it(
      "sets order to UNKNOWN when Razorpay call times out",
      async () => {
        globalThis.fetch = async () => {
          const error =
            new Error(
              "The operation was aborted.",
            );

          error.name =
            "AbortError";

          throw error;
        };

        const validated = await validate(
          proposal(
            "m7-timeout-001",
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
              "m7-timeout-001",
          }),
        ]);

        assert.equal(
          action?.executionStatus,
          "UNKNOWN",
        );

        assert.equal(
          order?.status,
          "UNKNOWN",
        );

        assert.ok(
          await AuditLogModel.exists({
            actionId,
            event:
              "PAYMENT_EXECUTION_UNKNOWN",
          }),
        );
      },
    )

it(
      "sets order to FAILED for known Razorpay rejection",
      async () => {
        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "BAD_REQUEST_ERROR",
                field: "amount",
                description:
                  "declined",
              },
            }),
            {
              status: 400,
            },
          );

        const validated =
          await validate(
            proposal(
              "m7-rejection-002",
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
              "m7-rejection-002",
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
      },
    )

it(
      "keeps the order and action UNKNOWN after a server error without retrying creation",
      async () => {
        let createCalls = 0;
        globalThis.fetch = async () => {
          createCalls += 1;
          return new Response(
            JSON.stringify({
              error: { code: "SERVER_ERROR" },
            }),
            { status: 500 },
          );
        };

        const validated = await validate(
          proposal("m7-server-error-uncertain-006"),
        );
        const actionId = (
          validated.body as { actionId: string }
        ).actionId;

        await assert.rejects(
          () =>
            approveActionAndCreatePayment({
              actionId,
              actor: testActor,
            }),
          (error: unknown) =>
            error instanceof Error &&
            "code" in error &&
            error.code === "RAZORPAY_OUTCOME_UNKNOWN",
        );

        const [action, order] = await Promise.all([
          AgentActionModel.findById(actionId),
          OrderModel.findOne({
            referenceId: "m7-server-error-uncertain-006",
          }),
        ]);
        assert.equal(createCalls, 1);
        assert.equal(action?.executionStatus, "UNKNOWN");
        assert.equal(order?.status, "UNKNOWN");
        assert.ok(
          await AuditLogModel.exists({
            actionId,
            event: "PAYMENT_EXECUTION_UNKNOWN",
          }),
        );
      },
    )

it(
      "returns UNKNOWN when lookup fails and does not retry",
      async () => {
        await OrderModel.create({
          items: [
            {
              productId:
                new Types.ObjectId(
                  getCoffeeKitId(),
                ),
              quantity: 1,
              unitPriceInPaise:
                179900,
            },
          ],

          amountInPaise: 179900,
          currency: "INR",
          status: "UNKNOWN",

          referenceId:
            "m7-unresolved-005",
        });

        globalThis.fetch =
          async () => {
            const error =
              new Error(
                "Network connection lost.",
              );

            error.name =
              "TypeError";

            throw error;
          };

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-unresolved-005",
          });

        await assert.rejects(
          () =>
            reconcilePayment({
              orderId:
                String(order!._id),
            }),
        );

        const updated =
          await OrderModel.findOne({
            referenceId:
              "m7-unresolved-005",
          });

        assert.equal(
          updated?.status,
          "UNKNOWN",
        );

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_UNRESOLVED",
          }),
        );
      },
    )
});
