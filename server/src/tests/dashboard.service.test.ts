import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { OrderModel } from "../models/Order";
import { getDashboardStats } from "../services/dashboard.service";

describe("getDashboardStats", () => {
  it("aggregates counts for each dashboard statistic", async (t) => {
    const actionFilters: unknown[] = [];
    const orderFilters: unknown[] = [];

    t.mock.method(AgentActionModel, "countDocuments", (filter: unknown) => {
      actionFilters.push(filter);
      const counts: Record<string, number> = {
        "{}": 18,
        '{"approvalStatus":"APPROVED"}': 6,
        '{"policyResult.decision":"BLOCK"}': 4,
        '{"policyResult.decision":"ESCALATE"}': 3,
        '{"executionStatus":"RECOVERED"}': 2,
        '{"executionStatus":"FAILED"}': 1,
        '{"executionStatus":"UNKNOWN"}': 2,
      };
      return Promise.resolve(counts[JSON.stringify(filter)] ?? 0);
    });
    t.mock.method(OrderModel, "countDocuments", (filter: unknown) => {
      orderFilters.push(filter);
      return Promise.resolve(
        JSON.stringify(filter) === '{"status":"PAID"}' ? 5 : 7,
      );
    });
    t.mock.method(AuditLogModel, "countDocuments", () => Promise.resolve(23));

    const stats = await getDashboardStats();

    assert.deepEqual(stats, {
      actions: {
        evaluated: 18,
        approved: 6,
        blocked: 4,
        escalated: 3,
        recovered: 2,
        failed: 1,
        unknown: 2,
      },
      orders: {
        paid: 5,
        awaitingPayment: 7,
      },
      auditEvents: 23,
    });
    assert.deepEqual(actionFilters, [
      {},
      { approvalStatus: "APPROVED" },
      { "policyResult.decision": "BLOCK" },
      { "policyResult.decision": "ESCALATE" },
      { executionStatus: "RECOVERED" },
      { executionStatus: "FAILED" },
      { executionStatus: "UNKNOWN" },
    ]);
    assert.deepEqual(orderFilters, [
      { status: "PAID" },
      { status: "AWAITING_PAYMENT" },
    ]);
  });

  it("returns explicit zero counts when all collections are empty", async (t) => {
    t.mock.method(AgentActionModel, "countDocuments", () => Promise.resolve(0));
    t.mock.method(OrderModel, "countDocuments", () => Promise.resolve(0));
    t.mock.method(AuditLogModel, "countDocuments", () => Promise.resolve(0));

    assert.deepEqual(await getDashboardStats(), {
      actions: {
        evaluated: 0,
        approved: 0,
        blocked: 0,
        escalated: 0,
        recovered: 0,
        failed: 0,
        unknown: 0,
      },
      orders: {
        paid: 0,
        awaitingPayment: 0,
      },
      auditEvents: 0,
    });
  });

  it("propagates database count errors", async (t) => {
    const databaseError = new Error("count failed");
    t.mock.method(AgentActionModel, "countDocuments", () =>
      Promise.reject(databaseError),
    );
    t.mock.method(OrderModel, "countDocuments", () => Promise.resolve(0));
    t.mock.method(AuditLogModel, "countDocuments", () => Promise.resolve(0));

    await assert.rejects(getDashboardStats(), (error: unknown) => error === databaseError);
  });
});
