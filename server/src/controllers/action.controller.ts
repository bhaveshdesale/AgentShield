import type { NextFunction, Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { AgentActionModel } from "../models/AgentAction";
import { MerchantModel } from "../models/Merchant";
import { approveAction as approveActionService } from "../services/payment.service";
import { recordAudit } from "../services/audit.service";
import { evaluateAction } from "../services/policy.service";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { recordPolicyDecision } from "../utils/metrics";
import {
  AGENT_ACTION_TYPES,
  type ActionProposalInput,
  type AgentActionType,
  type PolicyEvaluationResult,
} from "../types/domain";
import { isRecord } from "../utils/request-validation";

function isAgentActionType(value: string): value is AgentActionType {
  return AGENT_ACTION_TYPES.some((action) => action === value);
}

/**
 * Minimal structural validation of the externally supplied proposal body.
 * The policy engine performs the semantic/financial validation.
 */
export function parseProposalInput(value: unknown): ActionProposalInput {
  if (!isRecord(value)) {
    throw new AppError("Request body must be an object.", 400, "INVALID_PROPOSAL");
  }

  const body = value;
  const action =
    typeof body.action === "string" && isAgentActionType(body.action)
      ? body.action
      : undefined;
  const referenceId =
    typeof body.referenceId === "string" && body.referenceId.trim().length > 0
      ? body.referenceId.trim()
      : undefined;
  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason
      : undefined;
  const proposedAmountInPaise =
    typeof body.proposedAmountInPaise === "number" &&
    Number.isInteger(body.proposedAmountInPaise) &&
    body.proposedAmountInPaise >= 0
      ? body.proposedAmountInPaise
      : undefined;
  const requiresApproval =
    typeof body.requiresApproval === "boolean"
      ? body.requiresApproval
      : undefined;
  const hasDiscount = body.discountPercent !== undefined;
  const discountPercent =
    hasDiscount && typeof body.discountPercent === "number"
      ? body.discountPercent
      : undefined;

  let items: ActionProposalInput["items"] = [];
  if (Array.isArray(body.items)) {
    items = body.items.map((item) => {
      if (!isRecord(item)) {
        throw new AppError("Each item must be an object with a valid productId and quantity.", 400, "INVALID_PROPOSAL");
      }
      const productId =
        typeof item.productId === "string" && Types.ObjectId.isValid(item.productId)
          ? new Types.ObjectId(item.productId)
          : null;
      const quantity =
        typeof item.quantity === "number" &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0
          ? item.quantity
          : null;

      if (productId === null || quantity === null) {
        throw new AppError("Each item must have a valid productId and positive integer quantity.", 400, "INVALID_PROPOSAL");
      }
      return { productId, quantity };
    });
  }

  if (
    action === undefined ||
    referenceId === undefined ||
    reason === undefined ||
    proposedAmountInPaise === undefined ||
    requiresApproval === undefined ||
    items.length === 0 ||
    (hasDiscount &&
      (discountPercent === undefined || !Number.isFinite(discountPercent))) ||
    (body.conversationId !== undefined &&
      typeof body.conversationId !== "string")
  ) {
    throw new AppError(
      "Invalid proposal: required fields must be valid and optional fields must have the expected types.",
      400,
      "INVALID_PROPOSAL"
    );
  }

  return {
    action,
    items,
    proposedAmountInPaise,
    reason,
    requiresApproval,
    referenceId,
    ...(discountPercent !== undefined ? { discountPercent } : {}),
  };
}

export async function validateAction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body;
    const proposal = parseProposalInput(body);

    const merchant = await MerchantModel.findOne().sort({ createdAt: 1 });
    if (!merchant) {
      throw new AppError(
        "Demo merchant not found. Run the seed script (npm run seed) before validating actions.",
        503,
        "MERCHANT_NOT_FOUND"
      );
    }

    const result: PolicyEvaluationResult = await evaluateAction(proposal, merchant.policy);
    recordPolicyDecision(result.decision);
    const conversationId =
      isRecord(body) &&
      typeof body.conversationId === "string" &&
      body.conversationId.trim().length > 0
        ? body.conversationId.trim()
        : "external-validation";
    const action = await AgentActionModel.create({
      conversationId,
      referenceId: proposal.referenceId,
      action: proposal.action,
      proposal: {
        action: proposal.action,
        items: proposal.items,
        proposedAmountInPaise: proposal.proposedAmountInPaise,
        reason: proposal.reason,
        requiresApproval: proposal.requiresApproval,
      },
      reason: proposal.reason,
      policyResult: { decision: result.decision, checks: result.checks },
      verifiedAmountInPaise: result.verifiedAmountInPaise,
      approvalRequired: result.approvalRequired,
      ...(proposal.discountPercent === undefined ? {} : { discountPercent: proposal.discountPercent }),
      approvalStatus: result.approvalRequired ? "PENDING" : "NOT_REQUIRED",
      executionStatus: result.decision === "ALLOW" ? "NOT_STARTED" : "BLOCKED",
    });
    await recordAudit(
      result.decision === "ALLOW" ? "ACTION_VALIDATED" : "ACTION_BLOCKED",
      {
        actionType: proposal.action,
        proposedAmountInPaise: proposal.proposedAmountInPaise,
        verifiedAmountInPaise: result.verifiedAmountInPaise,
        policyDecision: result.decision,
        approvalState: action.approvalStatus,
        executionState: action.executionStatus,
      },
      String(action._id)
    );

    logger.info("Policy evaluation completed", {
      action: proposal.action,
      referenceId: proposal.referenceId,
      decision: result.decision,
      verifiedAmountInPaise: result.verifiedAmountInPaise,
    });

    res.status(200).json({ actionId: String(action._id), ...result });
  } catch (error) {
    next(error);
  }
}

export async function approveAction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isRecord(req.body)) {
      throw new AppError("actionId is required.", 400, "INVALID_ACTION_ID");
    }
    const actionId = typeof req.body.actionId === "string" ? req.body.actionId.trim() : "";
    if (!actionId) {
      throw new AppError("actionId is required.", 400, "INVALID_ACTION_ID");
    }
    if (!req.auth) {
      throw new AppError("Authentication is required.", 401, "AUTHENTICATION_REQUIRED");
    }
    const result = await approveActionService({ actionId, actor: req.auth });
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      next(new AppError("An action with this reference already exists.", 409, "DUPLICATE_REFERENCE"));
      return;
    }
    next(error);
  }
}
