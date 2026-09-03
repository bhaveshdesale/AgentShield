import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { MerchantModel } from "../models/Merchant";
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
}

/**
 * Minimal structural validation of the externally supplied proposal body.
 * The policy engine performs the semantic/financial validation.
 */
function parseProposalInput(body: ValidateActionRequestBody): ActionProposalInput {
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
    items = body.items.flatMap((item) => {
      if (typeof item !== "object" || item === null) {
        return [];
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
        return [];
      }
      return [{ productId, quantity }];
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

    logger.info("Policy evaluation completed", {
      action: proposal.action,
      referenceId: proposal.referenceId,
      decision: result.decision,
      verifiedAmountInPaise: result.verifiedAmountInPaise,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
