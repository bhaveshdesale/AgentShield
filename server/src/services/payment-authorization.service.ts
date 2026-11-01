import { MerchantModel } from "../models/Merchant";
import { AppError } from "../utils/AppError";
import { evaluateAction } from "./policy.service";
import type {
  AgentAction,
  ActionProposalInput,
  PolicyEvaluationResult,
} from "../types/domain";

type PersistedPaymentAction = Pick<
  AgentAction,
  "proposal" | "referenceId" | "discountPercent"
>;

function buildPersistedProposal(
  action: PersistedPaymentAction,
): ActionProposalInput {
  return {
    action: action.proposal.action,
    items: action.proposal.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
    proposedAmountInPaise:
      action.proposal.proposedAmountInPaise,
    reason: action.proposal.reason,
    requiresApproval:
      action.proposal.requiresApproval,
    referenceId: action.referenceId,
    ...(action.discountPercent === undefined
      ? {}
      : {
          discountPercent:
            action.discountPercent,
        }),
  };
}

/**
 * Re-evaluates a persisted action against the current
 * merchant policy and product catalog.
 */
export async function revalidatePersistedPaymentAction(
  action: PersistedPaymentAction,
): Promise<PolicyEvaluationResult> {
  const merchant = await MerchantModel.findOne().sort({
    createdAt: 1,
  });

  if (!merchant) {
    throw new AppError(
      "Merchant policy was not found.",
      503,
      "MERCHANT_NOT_FOUND"
    );
  }

  return evaluateAction(
    buildPersistedProposal(action),
    merchant.policy,
  );
}
