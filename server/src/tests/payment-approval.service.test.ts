import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import { Types } from "mongoose";

import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { requireRoles } from "../middleware/authentication";
import { approveAction } from "../services/payment-approval.service";
import type { AuthenticatedUser } from "../types/auth";
import type { MerchantPolicy } from "../types/domain";
import { AppError } from "../utils/AppError";

const ACTION_ID = new Types.ObjectId();
const PRODUCT_ID = new Types.ObjectId();
const APPROVER_ID = new Types.ObjectId();

const actor: AuthenticatedUser = {
  id: String(APPROVER_ID),
  email: "approver@example.test",
  role: "approver",
};

const policy: MerchantPolicy = {
  maxTransactionAmount: 500000,
  maxDiscountPercent: 10,
  requireHumanApproval: true,
  allowRefunds: false,
  allowPayouts: false,
};

function actionFixture(overrides: Record<string, unknown> = {}) {
  return {
    _id: ACTION_ID,
    action: "CREATE_PAYMENT",
    referenceId: "approval-service-test",
    proposal: {
      action: "CREATE_PAYMENT",
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      proposedAmountInPaise: 179900,
      reason: "Customer requested the product.",
      requiresApproval: true,
    },
    policyResult: { decision: "ALLOW", checks: [] },
    verifiedAmountInPaise: 179900,
    approvalRequired: true,
    approvalStatus: "PENDING",
    executionStatus: "NOT_STARTED",
    save: async () => undefined,
    ...overrides,
  };
}

function mockAuthorizationQueries(
  context: TestContext,
  currentPrice = 179900,
): void {
  context.mock.method(
    MerchantModel,
    "findOne",
    () =>
      ({
        sort: async () => ({ policy }),
      }) as never,
  );
  context.mock.method(
    OrderModel,
    "findOne",
    async () => null as never,
  );
  context.mock.method(
    ProductModel,
    "find",
    async () => [{
      _id: PRODUCT_ID,
      name: "Product",
      priceInPaise: currentPrice,
      inventory: 10,
    }] as never,
  );
}

function mockAuditCreate(
  context: TestContext,
  documents: unknown[],
  implementation?: (document: unknown) => Promise<unknown>,
): void {
  context.mock.method(
    AuditLogModel,
    "create",
    async (document: unknown) => {
      documents.push(document);
      return implementation
        ? implementation(document)
        : {} as never;
    },
  );
}

describe("approveAction", () => {
  it("revalidates, records the authenticated approver, and does not execute payment", async (context) => {
    const action = actionFixture();
    const claimedAction = actionFixture();
    let claimFilter: unknown;
    let claimUpdate: unknown;
    const auditDocuments: unknown[] = [];
    let providerCalls = 0;
    let orderCreates = 0;

    context.mock.method(globalThis, "fetch", async () => {
      providerCalls += 1;
      return new Response();
    });
    context.mock.method(OrderModel, "create", async () => {
      orderCreates += 1;
      return {} as never;
    });
    context.mock.method(
      AgentActionModel,
      "findById",
      async () => action as never,
    );
    context.mock.method(
      AgentActionModel,
      "findOneAndUpdate",
      async (filter: unknown, update: unknown) => {
        claimFilter = filter;
        claimUpdate = update;
        return claimedAction as never;
      },
    );
    mockAuthorizationQueries(context);
    mockAuditCreate(context, auditDocuments);

    const result = await approveAction({
      actionId: String(ACTION_ID),
      actor,
    });

    assert.deepEqual(result, {
      success: true,
      actionId: String(ACTION_ID),
      approvalStatus: "APPROVED",
      executionStatus: "NOT_STARTED",
    });
    assert.deepEqual(claimFilter, {
      _id: ACTION_ID,
      approvalStatus: "PENDING",
      executionStatus: "NOT_STARTED",
    });
    const update = claimUpdate as {
      $set: {
        approvalStatus: string;
        executionStatus: string;
        approval: {
          approvedBy: Types.ObjectId;
          approverEmail: string;
          approvedAt: Date;
        };
        verifiedAmountInPaise: number;
      };
    };
    assert.equal(update.$set.approvalStatus, "APPROVED");
    assert.equal(update.$set.executionStatus, "NOT_STARTED");
    assert.equal(String(update.$set.approval.approvedBy), actor.id);
    assert.equal(update.$set.approval.approverEmail, actor.email);
    assert.ok(update.$set.approval.approvedAt instanceof Date);
    assert.equal(update.$set.verifiedAmountInPaise, 179900);
    assert.equal(providerCalls, 0);
    assert.equal(orderCreates, 0);
    assert.equal(auditDocuments.length, 1);
    const approvalAudit = auditDocuments[0] as {
      actionId: Types.ObjectId;
      actorId: Types.ObjectId;
      actorEmail: string;
      event: string;
      details: Record<string, string>;
      timestamp: Date;
    };
    assert.equal(String(approvalAudit.actionId), String(ACTION_ID));
    assert.equal(String(approvalAudit.actorId), actor.id);
    assert.equal(approvalAudit.actorEmail, actor.email);
    assert.equal(approvalAudit.event, "ACTION_APPROVED");
    assert.deepEqual(approvalAudit.details, {
      approvalState: "APPROVED",
      executionState: "NOT_STARTED",
    });
    assert.ok(approvalAudit.timestamp instanceof Date);
  });

  it("keeps viewer roles from reaching approval through the existing role guard", async (context) => {
    const auditDocuments: unknown[] = [];
    mockAuditCreate(context, auditDocuments);
    let forwardedError: unknown;
    const middleware = requireRoles("admin", "approver");

    await middleware(
      {
        auth: { ...actor, role: "viewer" },
        method: "POST",
        path: "/actions/approve",
      } as never,
      {} as never,
      (error?: unknown) => {
        forwardedError = error;
      },
    );

    assert.ok(forwardedError instanceof AppError);
    assert.equal(forwardedError.statusCode, 403);
    assert.equal(forwardedError.code, "FORBIDDEN");
    assert.equal(
      (auditDocuments[0] as { event: string }).event,
      "AUTHORIZATION_DENIED",
    );
  });

  it("audits and rejects an invalid action ID without looking up an action", async (context) => {
    let lookups = 0;
    const auditDocuments: unknown[] = [];
    context.mock.method(AgentActionModel, "findById", async () => {
      lookups += 1;
      return null as never;
    });
    mockAuditCreate(context, auditDocuments);

    await assert.rejects(
      approveAction({ actionId: "invalid-id", actor }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 400 &&
        error.code === "INVALID_ACTION_ID",
    );
    assert.equal(lookups, 0);
    assert.equal(
      (auditDocuments[0] as { event: string }).event,
      "ACTION_APPROVAL_DENIED",
    );
  });

  it("audits and rejects an action that no longer exists", async (context) => {
    const auditDocuments: unknown[] = [];
    context.mock.method(
      AgentActionModel,
      "findById",
      async () => null as never,
    );
    mockAuditCreate(context, auditDocuments);

    await assert.rejects(
      approveAction({ actionId: String(ACTION_ID), actor }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 404 &&
        error.code === "ACTION_NOT_FOUND",
    );
    assert.equal(
      (auditDocuments[0] as { details: { reason: string } }).details.reason,
      "ACTION_NOT_FOUND",
    );
  });

  it("rejects an action already approved or processed", async (context) => {
    const auditDocuments: unknown[] = [];
    const action = actionFixture({ approvalStatus: "APPROVED" });
    const claim = context.mock.method(
      AgentActionModel,
      "findOneAndUpdate",
      async () => {
        throw new Error("Already-processed action must not be claimed");
      },
    );
    context.mock.method(
      AgentActionModel,
      "findById",
      async () => action as never,
    );
    mockAuditCreate(context, auditDocuments);

    await assert.rejects(
      approveAction({ actionId: String(ACTION_ID), actor }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        error.code === "ACTION_ALREADY_PROCESSED",
    );
    assert.equal(claim.mock.callCount(), 0);
    assert.equal(
      (auditDocuments[0] as { event: string }).event,
      "ACTION_APPROVAL_DENIED",
    );
  });

  it("rejects a proposal when current catalog pricing no longer matches and persists the blocked state", async (context) => {
    const action = actionFixture();
    const auditDocuments: unknown[] = [];
    let claims = 0;
    context.mock.method(
      AgentActionModel,
      "findById",
      async () => action as never,
    );
    context.mock.method(
      AgentActionModel,
      "findOneAndUpdate",
      async () => {
        claims += 1;
        return null as never;
      },
    );
    mockAuthorizationQueries(context, 180000);
    mockAuditCreate(context, auditDocuments);

    await assert.rejects(
      approveAction({ actionId: String(ACTION_ID), actor }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        error.code === "ACTION_REVALIDATION_FAILED",
    );
    assert.equal(action.approvalStatus, "REJECTED");
    assert.equal(action.executionStatus, "BLOCKED");
    assert.equal(claims, 0);
    assert.deepEqual(
      auditDocuments.map(
        (document) => (document as { event: string }).event,
      ),
      ["ACTION_BLOCKED", "ACTION_APPROVAL_DENIED"],
    );
  });

  it("rolls approval back when the approval audit cannot be persisted", async (context) => {
    const action = actionFixture();
    const claimedAction = actionFixture({ approvalStatus: "APPROVED" });
    const auditError = new Error("Approval audit unavailable");
    let rollbackFilter: unknown;
    let rollbackUpdate: unknown;
    context.mock.method(
      AgentActionModel,
      "findById",
      async () => action as never,
    );
    context.mock.method(
      AgentActionModel,
      "findOneAndUpdate",
      async () => claimedAction as never,
    );
    context.mock.method(
      AgentActionModel,
      "updateOne",
      async (filter: unknown, update: unknown) => {
        rollbackFilter = filter;
        rollbackUpdate = update;
        return { modifiedCount: 1 } as never;
      },
    );
    mockAuthorizationQueries(context);
    mockAuditCreate(context, [], async () => {
      throw auditError;
    });

    await assert.rejects(
      approveAction({ actionId: String(ACTION_ID), actor }),
      (error: unknown) => error === auditError,
    );
    assert.deepEqual(rollbackFilter, {
      _id: ACTION_ID,
      approvalStatus: "APPROVED",
      executionStatus: "NOT_STARTED",
      "approval.approvedBy": APPROVER_ID,
    });
    assert.deepEqual(rollbackUpdate, {
      $set: { approvalStatus: "PENDING" },
      $unset: { approval: "" },
    });
  });

  it("rejects when a concurrent approval wins the conditional state update", async (context) => {
    const action = actionFixture();
    const auditDocuments: unknown[] = [];
    context.mock.method(
      AgentActionModel,
      "findById",
      async () => action as never,
    );
    context.mock.method(
      AgentActionModel,
      "findOneAndUpdate",
      async () => null as never,
    );
    mockAuthorizationQueries(context);
    mockAuditCreate(context, auditDocuments);

    await assert.rejects(
      approveAction({ actionId: String(ACTION_ID), actor }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        error.code === "ACTION_ALREADY_PROCESSED",
    );
    assert.equal(
      (auditDocuments[auditDocuments.length - 1] as { event: string }).event,
      "ACTION_APPROVAL_DENIED",
    );
  });
});
