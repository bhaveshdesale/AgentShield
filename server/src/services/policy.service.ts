import { Types } from "mongoose";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import type {
  ActionProposalInput,
  MerchantPolicy,
  PolicyCheck,
  PolicyDecision,
  PolicyEvaluationResult,
} from "../types/domain";

const CHECK_NAMES = {
  VALID_PROPOSAL: "VALID_PROPOSAL",
  ACTION_PERMISSION: "ACTION_PERMISSION",
  DUPLICATE_PROTECTION: "DUPLICATE_PROTECTION",
  PRODUCT_EXISTS: "PRODUCT_EXISTS",
  INVENTORY: "INVENTORY",
  PRICE_MISMATCH: "PRICE_MISMATCH",
  TRANSACTION_LIMIT: "TRANSACTION_LIMIT",
  DISCOUNT_LIMIT: "DISCOUNT_LIMIT",
} as const;

/**
 * Deterministic policy engine for financial action proposals.
 *
 * The AI proposes. This service authorizes. Razorpay executes.
 * It must NEVER call an LLM and NEVER call Razorpay.
 */
export async function evaluateAction(
  proposal: ActionProposalInput,
  policy: MerchantPolicy
): Promise<PolicyEvaluationResult> {
  const checks: PolicyCheck[] = [];

  const structureCheck = validateProposalStructure(proposal);
  checks.push(structureCheck);

  const permissionCheck = checkActionPermission(proposal.action, policy);
  checks.push(permissionCheck);

  const duplicateCheck = await checkDuplicate(proposal);
  checks.push(duplicateCheck);

  const canEvaluateProducts =
    structureCheck.passed && permissionCheck.passed && duplicateCheck.passed;

  let verifiedAmountInPaise = 0;

  if (canEvaluateProducts) {
    const productCheck = await checkProducts(proposal);
    checks.push(...productCheck.checks);
    verifiedAmountInPaise = productCheck.verifiedAmountInPaise;

    // Authoritative amount is computed server-side; never trust the AI amount.
    if (verifiedAmountInPaise !== proposal.proposedAmountInPaise) {
      checks.push({
        name: CHECK_NAMES.PRICE_MISMATCH,
        passed: false,
        message:
          `Proposed amount ${proposal.proposedAmountInPaise} paise does not match ` +
          `server-verified amount ${verifiedAmountInPaise} paise.`,
      });
    } else {
      checks.push({
        name: CHECK_NAMES.PRICE_MISMATCH,
        passed: true,
        message: `Proposed amount matches server-verified amount (${verifiedAmountInPaise} paise).`,
      });
    }

    checks.push(checkTransactionLimit(verifiedAmountInPaise, policy));
    checks.push(checkDiscountLimit(proposal, policy));
  }

  const failedChecks = checks.filter((check) => !check.passed);
  const decision: PolicyDecision = failedChecks.length === 0 ? "ALLOW" : "BLOCK";

  const reason =
    failedChecks.length === 0
      ? "All policy checks passed."
      : `Blocked by failed policy checks: ${failedChecks.map((c) => c.name).join(", ")}.`;

  // Approval is a policy requirement flag only. It is NOT user approval,
  // and an AI decision/confidence can never satisfy it.
  const approvalRequired = policy.requireHumanApproval;

  return {
    decision,
    reason,
    checks,
    verifiedAmountInPaise,
    approvalRequired,
  };
}

function validateProposalStructure(proposal: ActionProposalInput): PolicyCheck {
  const hasAction = typeof proposal.action === "string" && proposal.action.length > 0;
  const hasReason = typeof proposal.reason === "string" && proposal.reason.trim().length > 0;
  const hasReference =
    typeof proposal.referenceId === "string" && proposal.referenceId.trim().length > 0;
  const proposedAmountIsInteger =
    Number.isInteger(proposal.proposedAmountInPaise) && proposal.proposedAmountInPaise >= 0;

  if (!hasAction || !hasReason || !hasReference || !proposedAmountIsInteger) {
    return {
      name: CHECK_NAMES.VALID_PROPOSAL,
      passed: false,
      message: "Proposal is missing required fields or contains invalid values.",
    };
  }

  if (proposal.items.length === 0) {
    return {
      name: CHECK_NAMES.VALID_PROPOSAL,
      passed: false,
      message: "Proposal must contain at least one item.",
    };
  }

  const itemsValid = proposal.items.every(
    (item) =>
      Types.ObjectId.isValid(String(item.productId)) &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0
  );

  if (!itemsValid) {
    return {
      name: CHECK_NAMES.VALID_PROPOSAL,
      passed: false,
      message: "Proposal items must have valid product IDs and positive integer quantities.",
    };
  }

  return {
    name: CHECK_NAMES.VALID_PROPOSAL,
    passed: true,
    message: "Proposal structure is valid.",
  };
}

function checkActionPermission(action: string, policy: MerchantPolicy): PolicyCheck {
  switch (action) {
    case "CREATE_PAYMENT":
      return {
        name: CHECK_NAMES.ACTION_PERMISSION,
        passed: true,
        message: "CREATE_PAYMENT is permitted by merchant policy.",
      };
    case "CREATE_REFUND":
      return {
        name: CHECK_NAMES.ACTION_PERMISSION,
        passed: policy.allowRefunds,
        message: policy.allowRefunds
          ? "CREATE_REFUND is permitted by merchant policy."
          : "CREATE_REFUND is not permitted by merchant policy.",
      };
    case "CREATE_PAYOUT":
      return {
        name: CHECK_NAMES.ACTION_PERMISSION,
        passed: policy.allowPayouts,
        message: policy.allowPayouts
          ? "CREATE_PAYOUT is permitted by merchant policy."
          : "CREATE_PAYOUT is not permitted by merchant policy.",
      };
    default:
      return {
        name: CHECK_NAMES.ACTION_PERMISSION,
        passed: false,
        message: `Unknown action "${action}" is blocked.`,
      };
  }
}

async function checkDuplicate(proposal: ActionProposalInput): Promise<PolicyCheck> {
  if (proposal.action !== "CREATE_PAYMENT") {
    return {
      name: CHECK_NAMES.DUPLICATE_PROTECTION,
      passed: true,
      message: "Duplicate check not applicable for non-payment actions.",
    };
  }

  const existingOrder = await OrderModel.findOne({
    referenceId: proposal.referenceId,
    status: { $in: ["CREATED", "AWAITING_PAYMENT", "PAID", "UNKNOWN", "RECOVERED"] },
  });

  if (existingOrder) {
    return {
      name: CHECK_NAMES.DUPLICATE_PROTECTION,
      passed: false,
      message:
        `An order with reference "${proposal.referenceId}" already exists with status ` +
        `${existingOrder.status}. Duplicate execution is blocked.`,
    };
  }

  return {
    name: CHECK_NAMES.DUPLICATE_PROTECTION,
    passed: true,
    message: "No existing order for this reference. Duplicate check passed.",
  };
}

async function checkProducts(
  proposal: ActionProposalInput
): Promise<{ checks: PolicyCheck[]; verifiedAmountInPaise: number }> {
  const checks: PolicyCheck[] = [];

  // Aggregate quantities per product so repeated items are validated once.
  const quantitiesByProductId = new Map<string, number>();
  for (const item of proposal.items) {
    const key = String(item.productId);
    quantitiesByProductId.set(key, (quantitiesByProductId.get(key) ?? 0) + item.quantity);
  }

  const productIds = Array.from(quantitiesByProductId.keys());
  const products = await ProductModel.find({ _id: { $in: productIds } });
  const productById = new Map(products.map((p) => [String(p._id), p]));

  // 1. PRODUCT EXISTS
  const missing = productIds.filter((id) => !productById.has(id));
  checks.push({
    name: CHECK_NAMES.PRODUCT_EXISTS,
    passed: missing.length === 0,
    message:
      missing.length === 0
        ? "All requested products exist."
        : `Products not found in catalog: ${missing.join(", ")}.`,
  });

  if (missing.length > 0) {
    return { checks, verifiedAmountInPaise: 0 };
  }

  // 2. INVENTORY
  const inventoryIssues: string[] = [];
  for (const [id, quantity] of quantitiesByProductId) {
    const product = productById.get(id);
    if (product && quantity > product.inventory) {
      inventoryIssues.push(
        `${product.name}: requested ${quantity}, available ${product.inventory}.`
      );
    }
  }
  checks.push({
    name: CHECK_NAMES.INVENTORY,
    passed: inventoryIssues.length === 0,
    message:
      inventoryIssues.length === 0
        ? "All requested quantities are available."
        : `Insufficient inventory: ${inventoryIssues.join(" ")}`,
  });

  // 3. AUTHORITATIVE PRICE — computed entirely from database values.
  let verifiedAmountInPaise = 0;
  for (const [id, quantity] of quantitiesByProductId) {
    const product = productById.get(id);
    if (product) {
      verifiedAmountInPaise += product.priceInPaise * quantity;
    }
  }

  return { checks, verifiedAmountInPaise };
}

function checkTransactionLimit(
  verifiedAmountInPaise: number,
  policy: MerchantPolicy
): PolicyCheck {
  const passed = verifiedAmountInPaise <= policy.maxTransactionAmount;
  return {
    name: CHECK_NAMES.TRANSACTION_LIMIT,
    passed,
    message: passed
      ? `Verified amount ${verifiedAmountInPaise} paise is within the merchant limit of ` +
        `${policy.maxTransactionAmount} paise.`
      : `Verified amount ${verifiedAmountInPaise} paise exceeds the merchant limit of ` +
        `${policy.maxTransactionAmount} paise.`,
  };
}

function checkDiscountLimit(proposal: ActionProposalInput, policy: MerchantPolicy): PolicyCheck {
  const discountPercent = proposal.discountPercent ?? 0;

  if (discountPercent === 0) {
    return {
      name: CHECK_NAMES.DISCOUNT_LIMIT,
      passed: true,
      message: "No discount requested.",
    };
  }

  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    return {
      name: CHECK_NAMES.DISCOUNT_LIMIT,
      passed: false,
      message: `Invalid discount percent: ${discountPercent}.`,
    };
  }

  const passed = discountPercent <= policy.maxDiscountPercent;
  return {
    name: CHECK_NAMES.DISCOUNT_LIMIT,
    passed,
    message: passed
      ? `Requested discount ${discountPercent}% is within the allowed ${policy.maxDiscountPercent}%.`
      : `Requested discount ${discountPercent}% exceeds the allowed maximum of ` +
        `${policy.maxDiscountPercent}%.`,
  };
}
