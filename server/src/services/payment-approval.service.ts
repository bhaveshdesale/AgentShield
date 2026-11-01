import { HydratedDocument, Types } from "mongoose";
import { AgentActionModel } from "../models/AgentAction";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import {
  recordAudit,
  recordSecurityAudit,
} from "./audit.service";
import { revalidatePersistedPaymentAction } from "./payment-authorization.service";
import type { AuthenticatedUser } from "../types/auth";
import type {
  AgentAction,
  PolicyEvaluationResult,
} from "../types/domain";

export interface ActionApprovalResult {
  success: true;
  actionId: string;
  approvalStatus: "APPROVED";
  executionStatus: "NOT_STARTED";
}

/**
 * Re-evaluates an action against current policy and catalog data,
 * persisting the existing rejection and approval-required states.
 */
export async function revalidateAction(
  action: HydratedDocument<AgentAction>,
  actor?: AuthenticatedUser,
  options: { requireApproval?: boolean } = {},
): Promise<PolicyEvaluationResult> {
  const result =
    await revalidatePersistedPaymentAction(action);

  if (
    result.decision !== "ALLOW" ||
    result.verifiedAmountInPaise !==
      action.verifiedAmountInPaise
  ) {
    action.policyResult = {
      decision: result.decision,
      checks: result.checks,
    };

    action.approvalStatus = "REJECTED";
    action.executionStatus = "BLOCKED";

    await action.save();

    await recordAudit(
      "ACTION_BLOCKED",
      {
        policyDecision: result.decision,
        verifiedAmountInPaise:
          result.verifiedAmountInPaise,
      },
      String(action._id),
      actor,
    );

    throw new AppError(
      "Action no longer satisfies current merchant policy.",
      409,
      "ACTION_REVALIDATION_FAILED"
    );
  }

  if (!result.approvalRequired) {
    action.approvalRequired = false;
    action.approvalStatus = "NOT_REQUIRED";
    await action.save();
    return result;
  }

  action.approvalRequired = true;
  if (
    options.requireApproval &&
    (action.approvalStatus !== "APPROVED" || !action.approval?.approvedBy)
  ) {
    action.approvalStatus = "PENDING";
    await action.save();
    throw new AppError(
      "Current merchant policy requires human approval before payment creation.",
      409,
      "APPROVAL_REQUIRED",
    );
  }
  await action.save();
  return result;
}

export async function approveAction(
  options: {
    actionId: string;
    actor: AuthenticatedUser;
  }
): Promise<ActionApprovalResult> {
  const deny = async (reason: string, statusCode: number, code: string): Promise<never> => {
    await recordSecurityAudit(
      "ACTION_APPROVAL_DENIED",
      { outcome: "DENIED", actionId: options.actionId, reason: code },
      options.actor,
      Types.ObjectId.isValid(options.actionId) ? options.actionId : undefined,
    );
    throw new AppError(reason, statusCode, code);
  };

  if (!Types.ObjectId.isValid(options.actionId)) {
    return deny(
      "Invalid action ID.",
      400,
      "INVALID_ACTION_ID"
    );
  }

  const action =
    await AgentActionModel.findById(
      options.actionId
    );

  if (!action) {
    return deny(
      "Agent action was not found.",
      404,
      "ACTION_NOT_FOUND"
    );
  }

  if (
    action.action !== "CREATE_PAYMENT" ||
    action.policyResult?.decision !== "ALLOW"
  ) {
    return deny(
      "Only policy-allowed payment actions can be approved.",
      409,
      "ACTION_NOT_ALLOWED"
    );
  }

  if (!action.approvalRequired) {
    return deny(
      "This action does not require human approval.",
      409,
      "APPROVAL_NOT_REQUIRED",
    );
  }

  if (
    action.approvalStatus !== "PENDING" ||
    action.executionStatus !== "NOT_STARTED"
  ) {
    return deny(
      "This action has already been approved or processed.",
      409,
      "ACTION_ALREADY_PROCESSED"
    );
  }

  let reevaluation: PolicyEvaluationResult;
  try {
    reevaluation = await revalidateAction(action, options.actor);
  } catch (error) {
    await recordSecurityAudit(
      "ACTION_APPROVAL_DENIED",
      {
        outcome: "DENIED",
        actionId: options.actionId,
        reason: error instanceof AppError ? error.code : "REVALIDATION_FAILED",
      },
      options.actor,
      options.actionId,
    );
    throw error;
  }
  if (!reevaluation.approvalRequired) {
    return deny(
      "Current merchant policy does not require human approval for this action.",
      409,
      "APPROVAL_NOT_REQUIRED",
    );
  }

  const claimedAction =
    await AgentActionModel.findOneAndUpdate(
      {
        _id: action._id,
        approvalStatus: "PENDING",
        executionStatus: "NOT_STARTED",
      },
      {
        $set: {
          approvalStatus: "APPROVED",
          executionStatus: "NOT_STARTED",
            approval: {
              approvedBy: new Types.ObjectId(options.actor.id),
              approverEmail: options.actor.email,
              approvedAt: new Date(),
            },

          policyResult: {
            decision: reevaluation.decision,
            checks: reevaluation.checks,
          },

          verifiedAmountInPaise:
            reevaluation.verifiedAmountInPaise,
        },
      },
      {
        new: true,
      }
    );

  if (!claimedAction) {
    return deny(
      "This action is already being processed.",
      409,
      "ACTION_ALREADY_PROCESSED"
    );
  }

  try {
    await recordAudit(
      "ACTION_APPROVED",
      {
        approvalState: "APPROVED",
        executionState: "NOT_STARTED",
      },
      String(claimedAction._id),
      options.actor,
    );
  } catch (error) {
    try {
      const rollback = await AgentActionModel.updateOne(
        {
          _id: claimedAction._id,
          approvalStatus: "APPROVED",
          executionStatus: "NOT_STARTED",
          "approval.approvedBy": new Types.ObjectId(options.actor.id),
        },
        {
          $set: { approvalStatus: "PENDING" },
          $unset: { approval: "" },
        },
      );
      if (rollback.modifiedCount !== 1) {
        logger.error("Approval audit failed and action rollback did not match", {
          actionId: String(claimedAction._id),
        });
      }
    } catch (rollbackError) {
      logger.error("Approval audit and rollback failed", {
        actionId: String(claimedAction._id),
        auditError: error instanceof Error ? error.message : "Unknown audit error",
        rollbackError:
          rollbackError instanceof Error
            ? rollbackError.message
            : "Unknown rollback error",
      });
    }
    throw error;
  }

  return {
    success: true,
    actionId: String(claimedAction._id),
    approvalStatus: "APPROVED",
    executionStatus: "NOT_STARTED",
  };
}
