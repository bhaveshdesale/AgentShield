import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";

import { AuditLogModel } from "../models/AuditLog";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { reconcilePayment } from "../services/reconciliation.service";
import { getCoffeeKitId, setupPaymentTestSuite } from "./reconciliation.test-helpers";

describe("Successful payment recovery paths", () => {
  setupPaymentTestSuite();

it(
      "recovers an UNKNOWN order with an existing paid payment link",
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
            "m7-recover-003",

          razorpayPaymentLinkId:
            "plink_existing_003",

          razorpayPaymentLinkUrl:
            "https://rzp.test/plink_existing_003",
        });

        globalThis.fetch =
          async () =>
            new Response(
              JSON.stringify({
                id:
                  "plink_existing_003",

                short_url:
                  "https://rzp.test/plink_existing_003",

                status: "paid",
              }),
              {
                status: 200,
              },
            );

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-recover-003",
          });

        const result =
          await reconcilePayment({
            orderId:
              String(order!._id),
          });

        assert.equal(
          result.status,
          "PAID",
        );

        assert.equal(
          result.paymentLinkId,
          "plink_existing_003",
        );

        const updated =
          await OrderModel.findOne({
            referenceId:
              "m7-recover-003",
          });

        assert.equal(
          updated?.status,
          "PAID",
        );

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_STARTED",
          }),
        );

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_PAYMENT_FOUND",
          }),
        );

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_PAYMENT_CONFIRMED",
          }),
        );
      },
    )

it(
      "reuses the existing payment link when found",
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
            "m7-reuse-004",

          razorpayPaymentLinkId:
            "plink_reuse_004",

          razorpayPaymentLinkUrl:
            "https://rzp.test/plink_reuse_004",
        });

        globalThis.fetch =
          async () =>
            new Response(
              JSON.stringify({
                id:
                  "plink_reuse_004",

                short_url:
                  "https://rzp.test/plink_reuse_004",

                status: "created",
              }),
              {
                status: 200,
              },
            );

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-reuse-004",
          });

        const result =
          await           reconcilePayment({
            orderId:
              String(order!._id),
          });

        assert.equal(
          result.status,
          "RECOVERED",
        );

        assert.equal(
          result.paymentLinkId,
          "plink_reuse_004",
        );

        const updated =
          await OrderModel.findOne({
            referenceId:
              "m7-reuse-004",
          });

        assert.equal(
          updated?.razorpayPaymentLinkId,
          "plink_reuse_004",
        );
      },
    )

it(
      "performs safe retry only after successful empty lookup",
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
            "m7-safe-retry-006",
        });

        let fetchCalls = 0;
        let callbackUrl: string | undefined;

        globalThis.fetch =
          async (input: unknown, init?: RequestInit) => {
            fetchCalls += 1;

            const urlStr =
              typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.toString()
                  : "";

            if (
              urlStr.includes(
                "/payment_links?reference_id=",
              )
            ) {
              return new Response(
                JSON.stringify({
                  payment_links: [],
                }),
                {
                  status: 200,
                },
              );
            }

            const requestBody = JSON.parse(String(init?.body)) as {
              callback_url?: string;
            };
            callbackUrl = requestBody.callback_url;

            return new Response(
              JSON.stringify({
                id:
                  "plink_retry_006",

                short_url:
                  "https://rzp.test/plink_retry_006",

                status: "created",
              }),
              {
                status: 200,
              },
            );
          };

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-safe-retry-006",
          });

        const result =
          await           reconcilePayment({
            orderId:
              String(order!._id),
          });

        assert.equal(
          result.status,
          "AWAITING_PAYMENT",
        );

        assert.equal(
          result.paymentLinkId,
          "plink_retry_006",
        );

        assert.equal(
          fetchCalls,
          2,
        );
        assert.equal(
          callbackUrl,
          `https://checkout.example.test/payments/${String(order!._id)}`,
        );

        const updated =
          await OrderModel.findOne({
            referenceId:
              "m7-safe-retry-006",
          });

        assert.equal(
          updated?.status,
          "AWAITING_PAYMENT",
        );

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_SAFE_RETRY",
          }),
        );
      },
    )

it(
      "records recovery audit events",
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
            "m7-audit-009",

          razorpayPaymentLinkId:
            "plink_audit_009",

          razorpayPaymentLinkUrl:
            "https://rzp.test/plink_audit_009",
        });

        globalThis.fetch =
          async () =>
            new Response(
              JSON.stringify({
                id:
                  "plink_audit_009",

                short_url:
                  "https://rzp.test/plink_audit_009",

                status: "created",
              }),
              {
                status: 200,
              },
            );

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-audit-009",
          });

        await reconcilePayment({
          orderId:
            String(order!._id),
        });

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_STARTED",
          }),
        );

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_PAYMENT_FOUND",
          }),
        );
      },
    )

it(
      "recalculates authoritative amount before safe retry",
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
            "m7-amount-010",
        });

        await ProductModel.findByIdAndUpdate(
          getCoffeeKitId(),
          {
            priceInPaise: 99900,
          },
        );

        globalThis.fetch =
          async (input: unknown) => {
            const urlStr =
              typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.toString()
                  : "";

            if (
              urlStr.includes(
                "/payment_links?reference_id=",
              )
            ) {
              return new Response(
                JSON.stringify({
                  payment_links: [],
                }),
                {
                  status: 200,
                },
              );
            }

            return new Response(
              JSON.stringify({
                id:
                  "plink_amount_010",

                short_url:
                  "https://rzp.test/plink_amount_010",

                status: "created",
              }),
              {
                status: 200,
              },
            );
          };

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-amount-010",
          });

        const result =
          await           reconcilePayment({
            orderId:
              String(order!._id),
          });

        assert.equal(
          result.status,
          "AWAITING_PAYMENT",
        );

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_SAFE_RETRY",

            "details.verifiedAmountInPaise":
              99900,
          }),
        );
      },
    )
});
