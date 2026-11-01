import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";

import { OrderModel } from "../models/Order";
import { reconcilePayment } from "../services/reconciliation.service";
import { getCoffeeKitId, hasErrorMessage, setupPaymentTestSuite } from "./reconciliation.test-helpers";

describe("Payment recovery eligibility and concurrency", () => {
  setupPaymentTestSuite();

it(
      "protects against concurrent recovery",
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
            "m7-concurrent-007",

          razorpayPaymentLinkId:
            "plink_concurrent_007",

          razorpayPaymentLinkUrl:
            "https://rzp.test/plink_concurrent_007",
        });

        globalThis.fetch =
          async () =>
            new Response(
              JSON.stringify({
                id:
                  "plink_concurrent_007",

                short_url:
                  "https://rzp.test/plink_concurrent_007",

                status: "created",
              }),
              {
                status: 200,
              },
            );

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-concurrent-007",
          });

        const orderId =
          String(order!._id);

        const first =
          await           reconcilePayment({
            orderId,
          });

        assert.equal(
          first.status,
          "RECOVERED",
        );

        await assert.rejects(
          () =>
            reconcilePayment({
              orderId,
            }),

          hasErrorMessage(
            /UNKNOWN state/i,
          ),
        );
      },
    )

it(
      "allows only one active recovery while provider reconciliation is pending",
      async () => {
        await OrderModel.create({
          items: [
            {
              productId: new Types.ObjectId(getCoffeeKitId()),
              quantity: 1,
              unitPriceInPaise: 179900,
            },
          ],
          amountInPaise: 179900,
          currency: "INR",
          status: "UNKNOWN",
          referenceId: "m7-active-recovery-013",
          razorpayPaymentLinkId: "plink_active_recovery_013",
          razorpayPaymentLinkUrl: "https://rzp.test/plink_active_recovery_013",
        });

        let providerLookupStarted!: () => void;
        let completeProviderLookup!: () => void;
        const lookupStarted = new Promise<void>((resolve) => {
          providerLookupStarted = resolve;
        });
        const providerResponse = new Promise<void>((resolve) => {
          completeProviderLookup = resolve;
        });
        globalThis.fetch = async () => {
          providerLookupStarted();
          await providerResponse;
          return new Response(
            JSON.stringify({
              id: "plink_active_recovery_013",
              short_url: "https://rzp.test/plink_active_recovery_013",
              status: "created",
            }),
            { status: 200 },
          );
        };

        const order = await OrderModel.findOne({
          referenceId: "m7-active-recovery-013",
        });
        const orderId = String(order!._id);
        const firstRecovery = reconcilePayment({ orderId });
        await lookupStarted;

        await assert.rejects(
          () => reconcilePayment({ orderId }),
          hasErrorMessage(/UNKNOWN state or stale RECOVERING claims/i),
        );
        assert.equal(
          (await OrderModel.findById(orderId))?.status,
          "RECOVERING",
        );

        completeProviderLookup();
        assert.equal((await firstRecovery).status, "RECOVERED");
      },
    )

it(
      "reclaims a recovery claim after its lease expires",
      async () => {
        await OrderModel.create({
          items: [
            {
              productId: new Types.ObjectId(getCoffeeKitId()),
              quantity: 1,
              unitPriceInPaise: 179900,
            },
          ],
          amountInPaise: 179900,
          currency: "INR",
          status: "RECOVERING",
          referenceId: "m7-stale-recovery-014",
          razorpayPaymentLinkId: "plink_stale_recovery_014",
          razorpayPaymentLinkUrl: "https://rzp.test/plink_stale_recovery_014",
        });
        const staleOrder = await OrderModel.findOne({
          referenceId: "m7-stale-recovery-014",
        });
        await OrderModel.updateOne(
          { _id: staleOrder!._id },
          { $set: { updatedAt: new Date(Date.now() - 121_000) } },
          { timestamps: false },
        );

        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              id: "plink_stale_recovery_014",
              short_url: "https://rzp.test/plink_stale_recovery_014",
              status: "created",
            }),
            { status: 200 },
          );

        const recovered = await reconcilePayment({
          orderId: String(staleOrder!._id),
        });
        assert.equal(recovered.status, "RECOVERED");
        assert.equal(
          (await OrderModel.findById(staleOrder!._id))?.status,
          "RECOVERED",
        );
      },
    )

it(
      "rejects reconciliation for non-UNKNOWN orders",
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
          status: "AWAITING_PAYMENT",

          referenceId:
            "m7-non-unknown-008",
        });

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-non-unknown-008",
          });

        await assert.rejects(
          () =>
            reconcilePayment({
              orderId:
                String(order!._id),
            }),

          hasErrorMessage(
            /UNKNOWN state/i,
          ),
        );
      },
    )
});
