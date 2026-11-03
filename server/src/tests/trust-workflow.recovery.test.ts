import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JsonResponse, users, signIn, getProposal, validateProposal, approveAction, createPayment, setProviderMock, AgentActionModel, AuditLogModel, OrderModel, registerTrustWorkflowTestHooks } from "./trust-workflow.integration.test-setup";

describe("Authenticated payment recovery workflow", () => {
  registerTrustWorkflowTestHooks();

  it("recovers an uncertain provider result through the existing reference lookup before retrying creation", async () => {
    const approver = await signIn(users.approver);
    const proposal = await getProposal(approver);
    const validation = await validateProposal(approver, proposal);
    assert.equal((await approveAction(approver, validation.actionId)).status, 200);

    let firstCreate = true;
    const provider = setProviderMock(async (url, init) => {
      if (init?.method === "POST" && url.pathname === "/v1/payment_links") {
        if (firstCreate) {
          firstCreate = false;
          throw new Error("simulated network timeout after uncertain provider outcome");
        }
        return Response.json({
          id: "plink_phase9_recovered",
          short_url: "https://rzp.io/i/phase9-recovered",
          status: "created",
        });
      }
      if (init?.method === "GET" && url.pathname === "/v1/payment_links") {
        assert.equal(url.searchParams.get("reference_id"), proposal.referenceId);
        return Response.json({ payment_links: [] });
      }
      throw new Error(`Unexpected mocked provider request: ${init?.method} ${url.pathname}`);
    });

    const uncertainResponse = await createPayment(approver, validation.actionId);
    assert.equal(uncertainResponse.status, 502);
    const uncertainBody = await uncertainResponse.json() as JsonResponse;
    assert.equal(uncertainBody.code, "RAZORPAY_OUTCOME_UNKNOWN");
    const unknownAction = await AgentActionModel.findById(validation.actionId).lean();
    assert.ok(unknownAction);
    assert.equal(unknownAction.executionStatus, "UNKNOWN");

    const recovered = await createPayment(approver, validation.actionId);
    assert.equal(recovered.status, 200);
    assert.deepEqual(provider.calls.map((call) => call.method), ["POST", "GET", "POST"]);
    const recoveredOrder = await OrderModel.findOne({ referenceId: proposal.referenceId }).lean();
    assert.ok(recoveredOrder);
    assert.equal(recoveredOrder.status, "AWAITING_PAYMENT");
    const recoveryAudit = await AuditLogModel.findOne({
      event: "RECOVERY_SAFE_RETRY",
      actionId: validation.actionId,
    }).lean();
    assert.ok(recoveryAudit);
  });
  it("finds a payment link by reference after an uncertain create without creating another", async () => {
    const approver = await signIn(users.approver);
    const proposal = await getProposal(approver);
    const validation = await validateProposal(approver, proposal);
    assert.equal((await approveAction(approver, validation.actionId)).status, 200);

    const provider = setProviderMock(async (url, init) => {
      if (init?.method === "POST" && url.pathname === "/v1/payment_links") {
        throw new Error("response lost after provider created the link");
      }
      if (init?.method === "GET" && url.pathname === "/v1/payment_links") {
        assert.equal(url.searchParams.get("reference_id"), proposal.referenceId);
        return Response.json({
          payment_links: [{
            id: "plink_found_by_reference",
            short_url: "https://rzp.io/i/found-by-reference",
            status: "created",
            reference_id: proposal.referenceId,
          }],
        });
      }
      throw new Error(`Unexpected mocked provider request: ${init?.method} ${url.pathname}`);
    });

    const firstAttempt = await createPayment(approver, validation.actionId);
    assert.equal(firstAttempt.status, 502);
    const recovered = await createPayment(approver, validation.actionId);
    assert.equal(recovered.status, 200);
    assert.deepEqual(provider.calls.map((call) => call.method), ["POST", "GET"]);

    const action = await AgentActionModel.findById(validation.actionId).lean();
    const order = await OrderModel.findOne({
      referenceId: proposal.referenceId,
    }).lean();
    assert.ok(action);
    assert.equal(action.executionStatus, "RECOVERED");
    assert.ok(order);
    assert.equal(order.status, "RECOVERED");
    assert.equal(order.razorpayPaymentLinkId, "plink_found_by_reference");
  });
});
