import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";

import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { OrderModel } from "../models/Order";
import { claimPaymentRecovery } from "../services/payment-recovery-claim.service";
import { AppError } from "../utils/AppError";

const ORDER_ID = new Types.ObjectId();
const ACTION_ID = new Types.ObjectId();
const REFERENCE_ID = "recovery-claim-test";

function orderFixture(
  status: string,
  updatedAt = new Date(),
) {
  return {
    _id: ORDER_ID,
    referenceId: REFERENCE_ID,
    status,
    updatedAt,
  };
}

function assertAppError(
  error: unknown,
  statusCode: number,
  code: string,
): boolean {
  return (
    error instanceof AppError &&
    error.statusCode === statusCode &&
    error.code === code
  );
}

describe("claimPaymentRecovery", () => {
  it("rejects invalid order IDs before querying models", async (t) => {
    const findById = t.mock.method(OrderModel, "findById", async () => null);
    const findAction = t.mock.method(AgentActionModel, "findOne", async () => null);

    await assert.rejects(
      claimPaymentRecovery("not-an-order-id"),
      (error: unknown) => assertAppError(error, 400, "INVALID_ORDER_ID"),
    );
    assert.equal(findById.mock.callCount(), 0);
    assert.equal(findAction.mock.callCount(), 0);
  });

  it("returns ORDER_NOT_FOUND when the requested order does not exist", async (t) => {
    const findAction = t.mock.method(AgentActionModel, "findOne", async () => null);
    t.mock.method(OrderModel, "findById", async () => null);

    await assert.rejects(
      claimPaymentRecovery(String(ORDER_ID)),
      (error: unknown) => assertAppError(error, 404, "ORDER_NOT_FOUND"),
    );
    assert.equal(findAction.mock.callCount(), 0);
  });

  it("rejects non-recoverable and active RECOVERING orders before claiming", async (t) => {
    const findAction = t.mock.method(AgentActionModel, "findOne", async () => null);
    const findOneAndUpdate = t.mock.method(
      OrderModel,
      "findOneAndUpdate",
      async () => null,
    );
    let order = orderFixture("AWAITING_PAYMENT");
    t.mock.method(OrderModel, "findById", async () => order as never);

    await assert.rejects(
      claimPaymentRecovery(String(ORDER_ID)),
      (error: unknown) => assertAppError(error, 409, "ORDER_NOT_UNKNOWN"),
    );

    order = orderFixture("RECOVERING", new Date(Date.now() - 119_000));
    await assert.rejects(
      claimPaymentRecovery(String(ORDER_ID)),
      (error: unknown) => assertAppError(error, 409, "ORDER_NOT_UNKNOWN"),
    );

    assert.equal(findAction.mock.callCount(), 0);
    assert.equal(findOneAndUpdate.mock.callCount(), 0);
  });

  it("claims an UNKNOWN order, records its action, and writes the recovery audit", async (t) => {
    const order = orderFixture("UNKNOWN");
    const action = { _id: ACTION_ID };
    let recoveryClaimToken = "";
    const claimed: {
      _id: Types.ObjectId;
      updatedAt: Date;
      recoveryClaimToken: string;
    } = {
      _id: ORDER_ID,
      updatedAt: new Date("2026-11-01T10:00:00.000Z"),
      recoveryClaimToken: "",
    };
    let findActionQuery: unknown;
    let claimQuery: unknown;
    let claimUpdate: unknown;
    let claimOptions: unknown;
    let auditFilter: unknown;
    let auditUpdate: unknown;
    let auditOptions: unknown;

    t.mock.method(OrderModel, "findById", async () => order as never);
    t.mock.method(AgentActionModel, "findOne", async (filter: unknown) => {
      findActionQuery = filter;
      return action as never;
    });
    t.mock.method(
      OrderModel,
      "findOneAndUpdate",
      async (filter: unknown, update: unknown, options: unknown) => {
        claimQuery = filter;
        claimUpdate = update;
        claimOptions = options;
        recoveryClaimToken = (
          update as { $set: { recoveryClaimToken: string } }
        ).$set.recoveryClaimToken;
        claimed.recoveryClaimToken = recoveryClaimToken;
        return claimed as never;
      },
    );
    t.mock.method(
      AuditLogModel,
      "updateOne",
      (filter: unknown, update: unknown, options: unknown) => {
        auditFilter = filter;
        auditUpdate = update;
        auditOptions = options;
        return Promise.resolve({ acknowledged: true }) as never;
      },
    );

    const result = await claimPaymentRecovery(String(ORDER_ID));

    assert.deepEqual(result, {
      order: claimed,
      action,
      actionId: String(ACTION_ID),
      recoveryClaimToken,
    });
    assert.deepEqual(findActionQuery, { referenceId: REFERENCE_ID });
    const query = claimQuery as {
      _id: Types.ObjectId;
      $or: Array<{
        status: string;
        updatedAt?: { $lte: Date };
      }>;
    };
    assert.equal(String(query._id), String(ORDER_ID));
    assert.equal(query.$or[0].status, "UNKNOWN");
    assert.deepEqual(query.$or[1].status, "RECOVERING");
    const cutoff = query.$or[1].updatedAt?.$lte;
    assert.ok(cutoff instanceof Date);
    assert.deepEqual(claimUpdate, {
      $set: {
        status: "RECOVERING",
        recoveryClaimToken,
      },
    });
    assert.deepEqual(claimOptions, { new: true });
    const expectedIdempotencyKey =
      `recovery:${String(ORDER_ID)}:${recoveryClaimToken}`;
    assert.deepEqual(auditFilter, {
      idempotencyKey: expectedIdempotencyKey,
      event: "RECOVERY_STARTED",
    });
    const auditDocument = (auditUpdate as {
      $setOnInsert: {
        actionId: Types.ObjectId;
        idempotencyKey: string;
        event: string;
        details: { orderId: string };
        timestamp: Date;
      };
    }).$setOnInsert;
    assert.equal(String(auditDocument.actionId), String(ACTION_ID));
    assert.equal(auditDocument.idempotencyKey, expectedIdempotencyKey);
    assert.equal(auditDocument.event, "RECOVERY_STARTED");
    assert.deepEqual(auditDocument.details, { orderId: String(ORDER_ID) });
    assert.ok(auditDocument.timestamp instanceof Date);
    assert.deepEqual(auditOptions, { upsert: true });
  });

  it("reclaims a stale RECOVERING order", async (t) => {
    const staleClaimToken = "stale-recovery-token";
    const staleOrder = {
      ...orderFixture("RECOVERING", new Date(Date.now() - 121_000)),
      recoveryClaimToken: staleClaimToken,
    };
    let claimQuery: unknown;
    let recoveryClaimToken: string | undefined;
    t.mock.method(OrderModel, "findById", async () => staleOrder as never);
    t.mock.method(AgentActionModel, "findOne", async () => null);
    t.mock.method(
      OrderModel,
      "findOneAndUpdate",
      async (filter: unknown, update: unknown) => {
        claimQuery = filter;
        recoveryClaimToken = (
          update as { $set: { recoveryClaimToken: string } }
        ).$set.recoveryClaimToken;
        return {
          _id: ORDER_ID,
          updatedAt: new Date(),
          recoveryClaimToken,
        } as never;
      },
    );
    t.mock.method(AuditLogModel, "updateOne", () =>
      Promise.resolve({ acknowledged: true }) as never,
    );

    const result = await claimPaymentRecovery(String(ORDER_ID));
    const staleCutoff = (claimQuery as {
      $or: Array<{ updatedAt?: { $lte: Date } }>;
    }).$or[1].updatedAt?.$lte;

    assert.equal(result.order.recoveryClaimToken, recoveryClaimToken);
    assert.equal(result.recoveryClaimToken, recoveryClaimToken);
    assert.notEqual(
      result.recoveryClaimToken,
      staleClaimToken,
    );
    assert.equal(result.action, null);
    assert.equal(result.actionId, null);
    assert.ok(staleCutoff instanceof Date);
    assert.ok(staleOrder.updatedAt.getTime() <= staleCutoff.getTime());
  });

  it("returns ORDER_ALREADY_RECOVERING when the atomic claim loses a race", async (t) => {
    const order = orderFixture("UNKNOWN");
    const audit = t.mock.method(AuditLogModel, "updateOne", () =>
      Promise.resolve({ acknowledged: true }) as never,
    );
    t.mock.method(OrderModel, "findById", async () => order as never);
    t.mock.method(AgentActionModel, "findOne", async () => null);
    t.mock.method(OrderModel, "findOneAndUpdate", async () => null);

    await assert.rejects(
      claimPaymentRecovery(String(ORDER_ID)),
      (error: unknown) =>
        assertAppError(error, 409, "ORDER_ALREADY_RECOVERING"),
    );
    assert.equal(audit.mock.callCount(), 0);
  });

  it("propagates recovery audit failures after a successful claim", async (t) => {
    const order = orderFixture("UNKNOWN");
    const auditError = new Error("recovery audit unavailable");
    let claimToken: string | undefined;
    let cleanupQuery: unknown;
    let cleanupUpdate: unknown;
    const claim = t.mock.method(
      OrderModel,
      "findOneAndUpdate",
      async (filter: unknown, update: unknown) => {
        if (claimToken === undefined) {
          claimToken = (
            update as { $set: { recoveryClaimToken: string } }
          ).$set.recoveryClaimToken;
          return {
            _id: ORDER_ID,
            updatedAt: new Date(),
            recoveryClaimToken: claimToken,
          } as never;
        }
        cleanupQuery = filter;
        cleanupUpdate = update;
        return null as never;
      },
    );
    t.mock.method(OrderModel, "findById", async () => order as never);
    t.mock.method(AgentActionModel, "findOne", async () => null);
    t.mock.method(AuditLogModel, "updateOne", () => {
      throw auditError;
    });

    await assert.rejects(
      claimPaymentRecovery(String(ORDER_ID)),
      (error: unknown) => error === auditError,
    );
    assert.equal(claim.mock.callCount(), 2);
    assert.equal(
      (cleanupQuery as { recoveryClaimToken: string }).recoveryClaimToken,
      claimToken,
    );
    assert.deepEqual(cleanupUpdate, {
      $set: { status: "UNKNOWN" },
      $unset: { recoveryClaimToken: 1 },
    });
  });
});
