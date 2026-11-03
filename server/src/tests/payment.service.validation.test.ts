import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validate, coffeeKitId, testActor, proposal, hasErrorMessage, approveActionAndCreatePayment, registerPaymentServiceTestHooks } from "./payment.service.test-setup";

describe("Payment request validation", () => {
  registerPaymentServiceTestHooks();

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
});
