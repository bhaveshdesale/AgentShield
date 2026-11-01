import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AgentActionModel } from "../models/AgentAction";
import { MerchantModel } from "../models/Merchant";
import { createPaymentForApprovedAction } from "../services/payment.service";
import { proposal, setupPaymentTestSuite, testActor, validate } from "./reconciliation.test-helpers";

describe("Payment creation and approval policy", () => {
  setupPaymentTestSuite();


    it(
      "creates a payment without human approval when current policy does not require it",
      async () => {
        await MerchantModel.updateOne(
          {},
          { $set: { "policy.requireHumanApproval": false } },
        );
        let calls = 0;
        globalThis.fetch = async () => {
          calls += 1;
          return new Response(
            JSON.stringify({
              id: "plink_no_approval",
              short_url: "https://rzp.test/plink_no_approval",
              status: "created",
            }),
            { status: 200 },
          );
        };

        const validated = await validate(proposal("m8-no-approval-001"));
        const actionId = (validated.body as { actionId: string }).actionId;
        assert.equal((validated.body as { approvalRequired: boolean }).approvalRequired, false);
        assert.equal(
          (await AgentActionModel.findById(actionId))?.approvalStatus,
          "NOT_REQUIRED",
        );

        const result = await createPaymentForApprovedAction({
          actionId,
          actor: testActor,
        });
        assert.equal(result.paymentLinkId, "plink_no_approval");
        assert.equal(calls, 1);
      },
    );

    it(
      "honors a current policy change that removes the approval requirement",
      async () => {
        let calls = 0;
        globalThis.fetch = async () => {
          calls += 1;
          return new Response(
            JSON.stringify({
              id: "plink_policy_changed",
              short_url: "https://rzp.test/plink_policy_changed",
              status: "created",
            }),
            { status: 200 },
          );
        };
        const validated = await validate(proposal("m8-policy-change-002"));
        const actionId = (validated.body as { actionId: string }).actionId;
        assert.equal((validated.body as { approvalRequired: boolean }).approvalRequired, true);

        await MerchantModel.updateOne(
          {},
          { $set: { "policy.requireHumanApproval": false } },
        );
        const result = await createPaymentForApprovedAction({
          actionId,
          actor: testActor,
        });
        const action = await AgentActionModel.findById(actionId);
        assert.equal(result.paymentLinkId, "plink_policy_changed");
        assert.equal(action?.approvalRequired, false);
        assert.equal(action?.approvalStatus, "NOT_REQUIRED");
        assert.equal(calls, 1);
      },
    );
});
