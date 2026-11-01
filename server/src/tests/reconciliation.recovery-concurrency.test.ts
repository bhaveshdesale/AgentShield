import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";

import { OrderModel } from "../models/Order";
import { claimPaymentRecovery } from "../services/payment-recovery-claim.service";
import { reconcilePayment } from "../services/reconciliation.service";
import { AppError } from "../utils/AppError";
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
        "replaces the token when an expired recovery lease is reclaimed",
        async () => {
          const order = await OrderModel.create({
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
            referenceId: "m7-recovery-token-reclaim-015",
          });

          const firstClaim = await claimPaymentRecovery(String(order._id));
          assert.ok(firstClaim.recoveryClaimToken.length > 0);
          assert.equal(
            (await OrderModel.findById(order._id))?.recoveryClaimToken,
            firstClaim.recoveryClaimToken,
          );

          await OrderModel.updateOne(
            { _id: order._id },
            { $set: { updatedAt: new Date(Date.now() - 121_000) } },
            { timestamps: false },
          );

          const secondClaim = await claimPaymentRecovery(String(order._id));
          assert.notEqual(
            secondClaim.recoveryClaimToken,
            firstClaim.recoveryClaimToken,
          );
          assert.equal(
            (await OrderModel.findById(order._id))?.recoveryClaimToken,
            secondClaim.recoveryClaimToken,
          );
        },
      )

it(
        "allows only one concurrent recovery claim to own an UNKNOWN order",
        async () => {
          const order = await OrderModel.create({
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
            referenceId: "m7-recovery-token-concurrent-016",
          });
          const claims = await Promise.allSettled([
            claimPaymentRecovery(String(order._id)),
            claimPaymentRecovery(String(order._id)),
          ]);
          const owners = claims.filter(
            (claim): claim is PromiseFulfilledResult<
              Awaited<ReturnType<typeof claimPaymentRecovery>>
            > => claim.status === "fulfilled",
          );

          assert.equal(owners.length, 1);
          const persisted = await OrderModel.findById(order._id);
          assert.equal(
            persisted?.recoveryClaimToken,
            owners[0].value.recoveryClaimToken,
          );
        },
      )

it(
        "fences stale recovery finalization and cleanup from the new claim owner",
        async () => {
          const referenceId = "m7-recovery-token-fencing-017";
          const order = await OrderModel.create({
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
            referenceId,
            razorpayPaymentLinkId: "plink_recovery_token_fencing_017",
            razorpayPaymentLinkUrl:
              "https://rzp.test/plink_recovery_token_fencing_017",
          });

          let firstLookupStarted!: () => void;
          let secondLookupStarted!: () => void;
          const firstLookup = new Promise<void>((resolve) => {
            firstLookupStarted = resolve;
          });
          const secondLookup = new Promise<void>((resolve) => {
            secondLookupStarted = resolve;
          });
          const completeLookups: Array<(response: Response) => void> = [];
          let lookupCount = 0;
          globalThis.fetch = async () => {
            const index = lookupCount;
            lookupCount += 1;
            return new Promise<Response>((resolve) => {
              completeLookups[index] = resolve;
              if (index === 0) {
                firstLookupStarted();
              } else if (index === 1) {
                secondLookupStarted();
              }
            });
          };

          const orderId = String(order._id);
          const staleRecovery = reconcilePayment({ orderId });
          await firstLookup;
          const staleToken = (
            await OrderModel.findById(order._id)
          )?.recoveryClaimToken;
          assert.ok(staleToken);

          await OrderModel.updateOne(
            { _id: order._id },
            { $set: { updatedAt: new Date(Date.now() - 121_000) } },
            { timestamps: false },
          );
          const currentRecovery = reconcilePayment({ orderId });
          await secondLookup;
          const currentToken = (
            await OrderModel.findById(order._id)
          )?.recoveryClaimToken;
          assert.ok(currentToken);
          assert.notEqual(currentToken, staleToken);

          const providerLink = {
            id: "plink_recovery_token_fencing_017",
            short_url: "https://rzp.test/plink_recovery_token_fencing_017",
            reference_id: referenceId,
            status: "created",
          };
          completeLookups[0](
            new Response(JSON.stringify(providerLink), { status: 200 }),
          );
          await assert.rejects(
            staleRecovery,
            (error: unknown) =>
              error instanceof AppError &&
              error.code === "RECOVERY_STATE_CHANGED",
          );

          const whileCurrentOwns = await OrderModel.findById(order._id);
          assert.equal(whileCurrentOwns?.status, "RECOVERING");
          assert.equal(whileCurrentOwns?.recoveryClaimToken, currentToken);

          completeLookups[1](
            new Response(JSON.stringify(providerLink), { status: 200 }),
          );
          const result = await currentRecovery;
          assert.equal(result.status, "RECOVERED");

          const finalized = await OrderModel.findById(order._id);
          assert.equal(finalized?.status, "RECOVERED");
          assert.equal(finalized?.recoveryClaimToken, undefined);
        },
      )

it(
        "checks recovery ownership immediately before creating a retry link",
        async () => {
          const order = await OrderModel.create({
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
            referenceId: "m7-recovery-token-retry-fencing-018",
          });

          let firstLookupStarted!: () => void;
          let secondLookupStarted!: () => void;
          const firstLookup = new Promise<void>((resolve) => {
            firstLookupStarted = resolve;
          });
          const secondLookup = new Promise<void>((resolve) => {
            secondLookupStarted = resolve;
          });
          const completeLookups: Array<(response: Response) => void> = [];
          let lookupCount = 0;
          let createRequests = 0;
          globalThis.fetch = async (_input, init) => {
            if (init?.method === "POST") {
              createRequests += 1;
              return new Response(
                JSON.stringify({
                  id: "plink_unexpected_retry",
                  short_url: "https://rzp.test/plink_unexpected_retry",
                  status: "created",
                }),
                { status: 200 },
              );
            }

            const index = lookupCount;
            lookupCount += 1;
            return new Promise<Response>((resolve) => {
              completeLookups[index] = resolve;
              if (index === 0) {
                firstLookupStarted();
              } else if (index === 1) {
                secondLookupStarted();
              }
            });
          };

          const orderId = String(order._id);
          const staleRecovery = reconcilePayment({ orderId });
          await firstLookup;
          const staleToken = (
            await OrderModel.findById(order._id)
          )?.recoveryClaimToken;
          assert.ok(staleToken);

          await OrderModel.updateOne(
            { _id: order._id },
            { $set: { updatedAt: new Date(Date.now() - 121_000) } },
            { timestamps: false },
          );
          const currentRecovery = reconcilePayment({ orderId });
          await secondLookup;
          const currentToken = (
            await OrderModel.findById(order._id)
          )?.recoveryClaimToken;
          assert.ok(currentToken);
          assert.notEqual(currentToken, staleToken);

          completeLookups[0](
            new Response(JSON.stringify({ payment_links: [] }), {
              status: 200,
            }),
          );
          await assert.rejects(
            staleRecovery,
            (error: unknown) =>
              error instanceof AppError &&
              error.code === "RECOVERY_STATE_CHANGED",
          );
          const whileCurrentOwns = await OrderModel.findById(order._id);
          assert.equal(whileCurrentOwns?.status, "RECOVERING");
          assert.equal(whileCurrentOwns?.recoveryClaimToken, currentToken);
          assert.equal(createRequests, 0);

          completeLookups[1](
            new Response(
              JSON.stringify({
                payment_links: [
                  {
                    id: "plink_recovery_token_retry_fencing_018",
                    short_url:
                      "https://rzp.test/plink_recovery_token_retry_fencing_018",
                    reference_id: "m7-recovery-token-retry-fencing-018",
                    status: "created",
                  },
                ],
              }),
              { status: 200 },
            ),
          );
          const result = await currentRecovery;
          assert.equal(result.status, "RECOVERED");
          assert.equal(
            (await OrderModel.findById(order._id))?.recoveryClaimToken,
            undefined,
          );
          assert.equal(createRequests, 0);
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
