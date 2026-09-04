import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { OrderModel } from "../models/Order";

export async function getDashboardStats() {
  const [evaluated, approved, blocked, escalated, recovered, failed, unknown, paid, awaitingPayment, recentAudit] = await Promise.all([
    AgentActionModel.countDocuments({}),
    AgentActionModel.countDocuments({ approvalStatus: "APPROVED" }),
    AgentActionModel.countDocuments({ "policyResult.decision": "BLOCK" }),
    AgentActionModel.countDocuments({ "policyResult.decision": "ESCALATE" }),
    AgentActionModel.countDocuments({ executionStatus: "RECOVERED" }),
    AgentActionModel.countDocuments({ executionStatus: "FAILED" }),
    AgentActionModel.countDocuments({ executionStatus: "UNKNOWN" }),
    OrderModel.countDocuments({ status: "PAID" }),
    OrderModel.countDocuments({ status: "AWAITING_PAYMENT" }),
    AuditLogModel.countDocuments({}),
  ]);
  return {
    actions: { evaluated, approved, blocked, escalated, recovered, failed, unknown },
    orders: { paid, awaitingPayment },
    auditEvents: recentAudit,
  };
}
