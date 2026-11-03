import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRODUCT_PRICE_IN_PAISE, productId, approverId, users, signIn, getProposal, validateProposal, approveAction, createPayment, setProviderMock, mockPaymentLink, sendWebhook, AgentActionModel, AuditLogModel, MerchantModel, OrderModel, registerTrustWorkflowTestHooks } from "./trust-workflow.integration.test-setup";

describe("Authenticated approval and payment workflow", () => {
  registerTrustWorkflowTestHooks();

  it("requires authenticated approval, ignores client-authoritative fields, and records payment/webhook attribution", async () => {
    const approver = await signIn(users.approver);
    const proposal = await getProposal(approver);
    assert.equal(proposal.items[0].productId, productId);

    const forgedValidation = await validateProposal(approver, proposal, {
      approved: true,
      approvedBy: "forged@example.test",
      executionStatus: "SUCCEEDED",
      proposedAmountInPaise: 1,
      requiresApproval: false,
    });
    assert.equal(forgedValidation.decision, "BLOCK");
    assert.equal(forgedValidation.approvalRequired, true);

    const validProposal = await getProposal(approver);
    const validation = await validateProposal(approver, validProposal);
    assert.equal(validation.decision, "ALLOW");
    assert.equal(validation.approvalRequired, true);

    const actionBeforeApproval = await AgentActionModel.findById(validation.actionId).lean();
    assert.ok(actionBeforeApproval);
    assert.equal(actionBeforeApproval.approvalStatus, "PENDING");
    assert.equal(actionBeforeApproval.approval?.approvedBy, undefined);
    assert.notEqual(actionBeforeApproval.executionStatus, "SUCCEEDED");

    const viewer = await signIn(users.viewer);
    const viewerApproval = await approveAction(viewer, validation.actionId);
    assert.equal(viewerApproval.status, 403);
    const blockedPayment = await createPayment(approver, validation.actionId);
    assert.equal(blockedPayment.status, 409);

    const approvalResponse = await approveAction(approver, validation.actionId);
    assert.equal(approvalResponse.status, 200);
    assert.equal((await approveAction(approver, validation.actionId)).status, 409);

    const provider = mockPaymentLink();
    const paymentResponse = await createPayment(approver, validation.actionId, {
      amountInPaise: 1,
      approved: false,
      executionStatus: "FAILED",
    });
    assert.equal(paymentResponse.status, 200);
    const providerRequest = provider.calls.find((call) => call.method === "POST");
    assert.ok(providerRequest);
    assert.equal(
      (JSON.parse(providerRequest.body) as { amount: number }).amount,
      PRODUCT_PRICE_IN_PAISE,
      "the provider amount is recalculated from the catalog rather than client input",
    );
    assert.equal((await createPayment(approver, validation.actionId)).status, 409);
    assert.equal(provider.calls.filter((call) => call.method === "POST").length, 1);

    const webhook = await sendWebhook("phase9-paid-event", "paid", validProposal.referenceId);
    assert.equal(webhook.status, 200);
    assert.equal((await sendWebhook("phase9-paid-event", "paid", validProposal.referenceId)).status, 200);
    assert.equal((await sendWebhook("phase9-late-failure", "failed", validProposal.referenceId)).status, 200);

    const order = await OrderModel.findOne({ referenceId: validProposal.referenceId }).lean();
    assert.ok(order);
    assert.equal(order.status, "PAID");
    const action = await AgentActionModel.findById(validation.actionId).lean();
    assert.ok(action);
    assert.equal(action.executionStatus, "SUCCEEDED");

    const paymentAudit = await AuditLogModel.findOne({
      event: "PAYMENT_LINK_CREATED",
      actionId: validation.actionId,
    }).lean();
    assert.ok(paymentAudit);
    assert.equal(String(paymentAudit.actorId), approverId);
    assert.equal(paymentAudit.actorEmail, users.approver);
    assert.equal(
      await AuditLogModel.countDocuments({
        event: "ORDER_PAYMENT_CONFIRMED",
        idempotencyKey: "razorpay:phase9-paid-event",
      }),
      1,
    );
    const webhookAudit = await AuditLogModel.findOne({
      event: "ORDER_PAYMENT_CONFIRMED",
      idempotencyKey: "razorpay:phase9-paid-event",
    }).lean();
    assert.ok(webhookAudit);
    assert.equal(webhookAudit.actorId, undefined, "system-generated webhook audit must not impersonate a user");
  });
  it("allows a policy-approved payment without human approval when the current policy permits it", async () => {
    await MerchantModel.updateOne({}, { $set: { "policy.requireHumanApproval": false } });
    const approver = await signIn(users.approver);
    const proposal = await getProposal(approver);
    const validation = await validateProposal(approver, proposal);

    assert.equal(validation.decision, "ALLOW");
    assert.equal(validation.approvalRequired, false);
    const action = await AgentActionModel.findById(validation.actionId).lean();
    assert.ok(action);
    assert.equal(action.approvalStatus, "NOT_REQUIRED");

    mockPaymentLink();
    const response = await createPayment(approver, validation.actionId);
    assert.equal(response.status, 200);
    const audit = await AuditLogModel.findOne({
      event: "PAYMENT_LINK_CREATED",
      actionId: validation.actionId,
    }).lean();
    assert.ok(audit);
    assert.equal(String(audit.actorId), approverId);
  });
  it("allows only one concurrent approval and payment creation for an action", async () => {
    const approver = await signIn(users.approver);
    const proposal = await getProposal(approver);
    const validation = await validateProposal(approver, proposal);

    const approvals = await Promise.all([
      approveAction(approver, validation.actionId),
      approveAction(approver, validation.actionId),
    ]);
    assert.deepEqual(approvals.map((response) => response.status).sort(), [200, 409]);
    assert.equal(
      await AuditLogModel.countDocuments({
        event: "ACTION_APPROVED",
        actionId: validation.actionId,
      }),
      1,
    );

    let providerStarted!: () => void;
    let releaseProvider!: () => void;
    const providerRequestStarted = new Promise<void>((resolve) => {
      providerStarted = resolve;
    });
    const providerResponseReleased = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const provider = setProviderMock(async (_url, init) => {
      assert.equal(init?.method, "POST");
      providerStarted();
      await providerResponseReleased;
      const requestBody = JSON.parse(String(init?.body)) as {
        amount: number;
        reference_id: string;
      };
      return Response.json({
        id: "plink_concurrent_action",
        short_url: "https://rzp.io/i/concurrent-action",
        status: "created",
        amount: requestBody.amount,
        reference_id: requestBody.reference_id,
      });
    });

    const firstPayment = createPayment(approver, validation.actionId);
    await providerRequestStarted;
    const duplicatePayment = await createPayment(approver, validation.actionId);
    assert.equal(duplicatePayment.status, 409);
    releaseProvider();

    const paymentResponse = await firstPayment;
    assert.equal(paymentResponse.status, 200);
    assert.equal(provider.calls.filter((call) => call.method === "POST").length, 1);
    assert.equal(
      await AuditLogModel.countDocuments({
        event: "PAYMENT_LINK_CREATED",
        actionId: validation.actionId,
      }),
      1,
    );
    assert.equal(
      (await AgentActionModel.findById(validation.actionId))?.executionStatus,
      "SUCCEEDED",
    );
    assert.equal(
      (await OrderModel.findOne({ referenceId: proposal.referenceId }))?.status,
      "AWAITING_PAYMENT",
    );
  });
  it("blocks denied proposals and revalidates approval against changed policy before payment", async () => {
    const approver = await signIn(users.approver);
    const proposal = await getProposal(approver);
    const denied = await validateProposal(approver, proposal, {
      proposedAmountInPaise: PRODUCT_PRICE_IN_PAISE + 1,
    });
    assert.equal(denied.decision, "BLOCK");
    const deniedPayment = await createPayment(approver, denied.actionId);
    assert.equal(deniedPayment.status, 409);
    const deniedAction = await AgentActionModel.findById(denied.actionId).lean();
    assert.ok(deniedAction);
    assert.equal(deniedAction.executionStatus, "BLOCKED");

    const validProposal = await getProposal(approver);
    const valid = await validateProposal(approver, validProposal);
    assert.equal(valid.decision, "ALLOW");
    await MerchantModel.updateOne({}, { $set: { "policy.maxTransactionAmount": 10_000 } });
    const approvalAfterPolicyChange = await approveAction(approver, valid.actionId);
    assert.equal(approvalAfterPolicyChange.status, 409);
    const invalidatedAction = await AgentActionModel.findById(valid.actionId).lean();
    assert.ok(invalidatedAction);
    assert.equal(invalidatedAction.executionStatus, "BLOCKED");

    const provider = setProviderMock(async () => {
      throw new Error("A policy-denied action must not call the payment provider.");
    });
    assert.equal((await createPayment(approver, valid.actionId)).status, 409);
    assert.equal(provider.calls.length, 0);
  });
});
