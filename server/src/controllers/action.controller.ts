import type { NextFunction, Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { AgentActionModel } from "../models/AgentAction";
import { MerchantModel } from "../models/Merchant";
import { approveAction as approveActionService, recordAudit } from "../services/payment.service";
import { evaluateAction } from "../services/policy.service";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import type { ActionProposalInput, PolicyEvaluationResult } from "../types/domain";

interface ValidateActionRequestBody {
  action?: unknown;
  items?: unknown;
  proposedAmountInPaise?: unknown;
  reason?: unknown;
  requiresApproval?: unknown;
  referenceId?: unknown;
  discountPercent?: unknown;
  conversationId?: unknown;
}

/**
 * Minimal structural validation of the externally supplied proposal body.
 * The policy engine performs the semantic/financial validation.
 */
export function parseProposalInput(body: ValidateActionRequestBody): ActionProposalInput {
  const action = typeof body.action === "string" ? body.action : "";
  const referenceId =
    typeof body.referenceId === "string" && body.referenceId.trim().length > 0
      ? body.referenceId.trim()
      : "";
  const reason = typeof body.reason === "string" ? body.reason : "";
  const proposedAmountInPaise =
    typeof body.proposedAmountInPaise === "number" &&
    Number.isInteger(body.proposedAmountInPaise) &&
    body.proposedAmountInPaise >= 0
      ? body.proposedAmountInPaise
      : -1;
  const requiresApproval = body.requiresApproval === true;
  const discountPercent =
    typeof body.discountPercent === "number" && Number.isFinite(body.discountPercent)
      ? body.discountPercent
      : undefined;

  let items: ActionProposalInput["items"] = [];
  if (Array.isArray(body.items)) {
    items = body.items.map((item) => {
      if (typeof item !== "object" || item === null) {
        throw new AppError("Each item must be an object with a valid productId and quantity.", 400, "INVALID_PROPOSAL");
      }
      const record = item as Record<string, unknown>;
      const productId =
        typeof record.productId === "string" && Types.ObjectId.isValid(record.productId)
          ? new Types.ObjectId(record.productId)
          : null;
      const quantity =
        typeof record.quantity === "number" &&
        Number.isInteger(record.quantity) &&
        record.quantity > 0
          ? record.quantity
          : null;

      if (productId === null || quantity === null) {
        throw new AppError("Each item must have a valid productId and positive integer quantity.", 400, "INVALID_PROPOSAL");
      }
      return { productId, quantity };
    });
  }

  if (
    action.length === 0 ||
    referenceId.length === 0 ||
    proposedAmountInPaise < 0 ||
    items.length === 0
  ) {
    throw new AppError(
      "Invalid proposal: action, referenceId, proposedAmountInPaise (integer paise >= 0) " +
        "and at least one item with a valid productId and positive integer quantity are required.",
      400,
      "INVALID_PROPOSAL"
    );
  }

  return {
    action: action as ActionProposalInput["action"],
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
    const proposal = parseProposalInput(req.body as ValidateActionRequestBody);

    const merchant = await MerchantModel.findOne().sort({ createdAt: 1 });
    if (!merchant) {
      throw new AppError(
        "Demo merchant not found. Run the seed script (npm run seed) before validating actions.",
        503,
        "MERCHANT_NOT_FOUND"
      );
    }

    const result: PolicyEvaluationResult = await evaluateAction(proposal, merchant.policy);
    const body = req.body as ValidateActionRequestBody;
    const conversationId =
      typeof body.conversationId === "string" && body.conversationId.trim().length > 0
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
    const actionId = typeof req.body?.actionId === "string" ? req.body.actionId.trim() : "";
    if (!actionId) {
      throw new AppError("actionId is required.", 400, "INVALID_ACTION_ID");
    }
    const result = await approveActionService({ actionId });
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      next(new AppError("An action with this reference already exists.", 409, "DUPLICATE_REFERENCE"));
      return;
    }
    next(error);
  }
}
