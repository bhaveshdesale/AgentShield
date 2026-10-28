import mongoose, { HydratedDocument, Types } from "mongoose";
import { AuditLogModel } from "../models/AuditLog";
import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { AgentActionModel } from "../models/AgentAction";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { getRazorpayCredentials } from "../config/razorpay";
import { evaluateAction } from "./policy.service";
import {
  recordAudit,
  recordSecurityAudit,
} from "./audit.service";
import { createRazorpayPaymentLink } from "./razorpay.client";
import {
  calculateAuthoritativeAmount,
  reconcilePayment,
} from "./reconciliation.service";
import type { AuthenticatedUser } from "../types/auth";
import type {
  ActionProposalInput,
  AgentAction,
  Order,
  OrderStatus,
} from "../types/domain";

export { createRazorpayPaymentLink, getRazorpayCredentials };
export { calculateAuthoritativeAmount, reconcilePayment };
export { getPaymentStatusByOrderId } from "./reconciliation.service";
export { recordAudit } from "./audit.service";
export type { RazorpayPaymentLink, RazorpayPaymentLinkDetail } from "./razorpay.client";

/**
 * Payment approval and execution orchestration.
 *
 * Core principle:
 * AI can propose. AgentShield authorizes. Razorpay executes.
 *
 * - The AI never calls Razorpay.
 * - Amounts are always recomputed server-side from MongoDB.
 * - Client input can never supply amounts, Razorpay IDs or approval state.
 */
export interface ApprovalResult {
  success: true;
  actionId: string;
  orderId: string;
  paymentLinkId: string;
  paymentLink: string;
  status: string;
}

/**
 * Creates an immutable order snapshot using
 * authoritative MongoDB prices.
 */
async function createOrderSnapshot(
  proposal: {
    referenceId: string;
    items: {
      productId: Types.ObjectId;
      quantity: number;
    }[];
  },
  amountInPaise: number
): Promise<HydratedDocument<Order>> {
  const existing = await OrderModel.findOne({
    referenceId: proposal.referenceId,
  });

  if (existing) {
    return existing;
  }

  const products = await ProductModel.find({
    _id: {
      $in: proposal.items.map(
        (item) => item.productId
      ),
    },
  });

  const prices = new Map(
    products.map((product) => [
      String(product._id),
      product.priceInPaise,
    ])
  );

  const items = proposal.items.map((item) => {
    const unitPriceInPaise = prices.get(
      String(item.productId)
    );

    if (unitPriceInPaise === undefined) {
      throw new AppError(
        "Product changed before order creation.",
        409,
        "PRODUCT_CHANGED"
      );
    }

    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPriceInPaise,
    };
  });

  try {
    return await OrderModel.create({
      items,
      amountInPaise,
      currency: "INR",
      status: "CREATED",
      referenceId: proposal.referenceId,
    });
  } catch (error) {
    if (
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000
    ) {
      const concurrentOrder =
        await OrderModel.findOne({
          referenceId: proposal.referenceId,
        });

      if (concurrentOrder) {
        return concurrentOrder;
      }
    }

    throw error;
  }
}

/**
 * Builds the persisted proposal back into the
 * policy-engine input format.
 */
function buildPersistedProposal(
  action: HydratedDocument<AgentAction>
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
 * Re-evaluates the action against the CURRENT
 * merchant policy and CURRENT catalog.
 */
async function revalidateAction(
  action: HydratedDocument<AgentAction>,
  actor?: AuthenticatedUser,
  options: { requireApproval?: boolean } = {},
) {
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

  const proposal =
    buildPersistedProposal(action);

  const result = await evaluateAction(
    proposal,
    merchant.policy
  );

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

/**
 * Explicit human approval.
 *
 * Approval NEVER calls Razorpay.
 */
export interface ActionApprovalResult {
  success: true;
  actionId: string;
  approvalStatus: "APPROVED";
  executionStatus: "NOT_STARTED";
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

  if (
    !Types.ObjectId.isValid(options.actionId)
  ) {
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

  let reevaluation: Awaited<ReturnType<typeof revalidateAction>>;
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

/**
 * Executes an explicitly approved action or one that does not require approval.
 *
 * THIS is the only path that calls Razorpay.
 */
export async function createPaymentForApprovedAction(
  options: {
    actionId: string;
    actor: AuthenticatedUser;
  }
): Promise<ApprovalResult> {
  if (
    !Types.ObjectId.isValid(options.actionId)
  ) {
    throw new AppError(
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
    throw new AppError(
      "Agent action was not found.",
      404,
      "ACTION_NOT_FOUND"
    );
  }

  if (
    action.action !== "CREATE_PAYMENT" ||
    action.policyResult?.decision !== "ALLOW"
  ) {
    throw new AppError(
      "Only policy-allowed payment actions can create a payment.",
      409,
      "ACTION_NOT_ALLOWED"
    );
  }

  if (
    action.approvalRequired &&
    action.approvalStatus === "APPROVED" &&
    action.approval?.approvedBy
  ) {
    const approvalAudit = await AuditLogModel.exists({
      actionId: action._id,
      actorId: action.approval.approvedBy,
      event: "ACTION_APPROVED",
    });
    if (!approvalAudit) {
      throw new AppError(
        "Approval cannot be used until its audit record is persisted.",
        503,
        "APPROVAL_AUDIT_UNAVAILABLE",
      );
    }
  }

  /**
   * Recovery path for previously UNKNOWN executions.
   */
  if (action.executionStatus === "UNKNOWN") {
    if (
      action.approvalRequired &&
      (action.approvalStatus !== "APPROVED" || !action.approval?.approvedBy)
    ) {
      throw new AppError(
        "Action must be explicitly approved before payment recovery.",
        409,
        "APPROVAL_REQUIRED",
      );
    }
    if (!action.approvalRequired && action.approvalStatus !== "NOT_REQUIRED") {
      throw new AppError(
        "Action approval state does not match the current merchant policy.",
        409,
        "APPROVAL_STATE_INVALID",
      );
    }
    const unknownOrder =
      await OrderModel.findOne({
        referenceId: action.referenceId,
      });

    if (!unknownOrder) {
      throw new AppError(
        "Unknown payment state has no associated order.",
        409,
        "RECOVERY_ORDER_NOT_FOUND"
      );
    }

    return reconcilePayment({
      orderId: String(unknownOrder._id),
    }).then((result) => ({
      success: true as const,
      actionId: String(action._id),
      orderId: result.orderId,
      paymentLinkId:
        result.paymentLinkId ?? "",
      paymentLink:
        result.paymentLink ?? "",
      status: result.status,
    }));
  }

  if (
    action.executionStatus !== "NOT_STARTED"
  ) {
    throw new AppError(
      "This action has already been approved or processed.",
      409,
      "ACTION_ALREADY_PROCESSED"
    );
  }

  const reevaluation =
    await revalidateAction(action, options.actor, { requireApproval: true });

  getRazorpayCredentials();

  const claimedAction =
    await AgentActionModel.findOneAndUpdate(
      {
        _id: action._id,
        approvalStatus: reevaluation.approvalRequired ? "APPROVED" : "NOT_REQUIRED",
        executionStatus: "NOT_STARTED",
      },
      {
        $set: {
          executionStatus: "IN_PROGRESS",

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
    throw new AppError(
      "This action is already being processed.",
      409,
      "ACTION_ALREADY_PROCESSED"
    );
  }

  let order:
    | HydratedDocument<Order>
    | undefined;

  try {
    /**
     * MongoDB becomes the source of truth for
     * the order amount and item prices.
     */
    order = await createOrderSnapshot(
      {
        referenceId:
          claimedAction.referenceId,

        items:
          claimedAction.proposal.items,
      },
      reevaluation.verifiedAmountInPaise
    );

    /**
     * If the payment link already exists,
     * do not create a duplicate Razorpay link.
     */
    if (
      order.razorpayPaymentLinkId &&
      order.razorpayPaymentLinkUrl
    ) {
      claimedAction.executionStatus =
        "SUCCEEDED";

      await claimedAction.save();

      return {
        success: true,
        actionId: String(
          claimedAction._id
        ),
        orderId: String(order._id),
        paymentLinkId:
          order.razorpayPaymentLinkId,
        paymentLink:
          order.razorpayPaymentLinkUrl,
        status: order.status,
      };
    }

    await recordAudit(
      "PAYMENT_LINK_CREATION_STARTED",
      {
        verifiedAmountInPaise:
          reevaluation.verifiedAmountInPaise,

        executionState: "IN_PROGRESS",
      },
      String(claimedAction._id),
      options.actor,
    );

    const frontendUrl = (
      process.env.CLIENT_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:5173"
    ).replace(/\/$/, "");

    /**
     * Razorpay callback returns the user to
     * the frontend payment detail page.
     */
    const paymentLink =
      await createRazorpayPaymentLink({
        amountInPaise:
          reevaluation.verifiedAmountInPaise,

        referenceId:
          claimedAction.referenceId,

        description:
          `AgentShield order ${claimedAction.referenceId}`,

        callbackUrl:
          `${frontendUrl}/payments/${String(
            order._id
          )}`,
      });

    const awaitingOrder = await OrderModel.findOneAndUpdate(
      { _id: order._id, status: "CREATED" },
      {
        $set: {
          razorpayPaymentLinkId: paymentLink.id,
          razorpayPaymentLinkUrl: paymentLink.short_url,
          status: "AWAITING_PAYMENT",
        },
      },
      { new: true },
    );
    if (awaitingOrder) {
      order = awaitingOrder;
    } else {
      const currentOrder = await OrderModel.findById(order._id);
      if (!currentOrder || currentOrder.status !== "PAID") {
        throw new AppError(
          "Payment state changed while creating the payment link.",
          409,
          "PAYMENT_STATE_CHANGED",
        );
      }
      const linkedPaidOrder = await OrderModel.findOneAndUpdate(
        { _id: currentOrder._id, status: "PAID" },
        {
          $set: {
            razorpayPaymentLinkId: paymentLink.id,
            razorpayPaymentLinkUrl: paymentLink.short_url,
          },
        },
        { new: true },
      );
      if (!linkedPaidOrder) {
        throw new AppError(
          "Payment state changed while storing the payment link.",
          409,
          "PAYMENT_STATE_CHANGED",
        );
      }
      order = linkedPaidOrder;
    }

    claimedAction.executionStatus =
      "SUCCEEDED";

    await claimedAction.save();

    await recordAudit(
      "PAYMENT_LINK_CREATED",
      {
        razorpayIdentifier:
          paymentLink.id,

        executionState: "SUCCEEDED",
      },
      String(claimedAction._id),
      options.actor,
    );

    return {
      success: true,
      actionId: String(
        claimedAction._id
      ),
      orderId: String(order._id),
      paymentLinkId:
        paymentLink.id,
      paymentLink:
        paymentLink.short_url,
      status: order.status,
    };
  } catch (error) {
    /**
     * Known Razorpay rejection.
     */
    if (
      error instanceof AppError &&
      error.code === "RAZORPAY_ERROR"
    ) {
      if (order) {
        await OrderModel.findOneAndUpdate(
          { _id: order._id, status: { $in: ["CREATED", "AWAITING_PAYMENT"] } },
          { $set: { status: "FAILED" } },
        );
      }

      await AgentActionModel.updateOne(
        { _id: claimedAction._id, executionStatus: "IN_PROGRESS" },
        { $set: { executionStatus: "FAILED" } },
      );

      await recordAudit(
        "PAYMENT_EXECUTION_FAILED",
        {
          executionState: "FAILED",
          errorCategory: error.code,
        },
        String(claimedAction._id),
        options.actor,
      );

      throw error;
    }

    /**
     * Unknown outcome.
     *
     * We cannot safely assume whether Razorpay
     * created the payment link, so recovery is
     * required.
     */
    if (order) {
      await OrderModel.findOneAndUpdate(
        { _id: order._id, status: { $in: ["CREATED", "AWAITING_PAYMENT"] } },
        { $set: { status: "UNKNOWN" } },
      );
    }

    await AgentActionModel.updateOne(
      { _id: claimedAction._id, executionStatus: "IN_PROGRESS" },
      { $set: { executionStatus: "UNKNOWN" } },
    );

    await recordAudit(
      "PAYMENT_EXECUTION_UNKNOWN",
      {
        executionState: "UNKNOWN",

        errorCategory:
          error instanceof Error
            ? error.message
            : "PAYMENT_EXECUTION_UNKNOWN",
      },
      String(claimedAction._id),
      options.actor,
    );

    throw error;
  }
}

/**
 * Backward-compatible composition used by
 * existing unit tests.
 */
export async function approveActionAndCreatePayment(
  options: {
    actionId: string;
    actor: AuthenticatedUser;
  }
): Promise<ApprovalResult> {
  await approveAction({
    actionId: options.actionId,
    actor: options.actor,
  });

  return createPaymentForApprovedAction(
    options
  );
}

/**
 * Payment history item returned to the frontend.
 *
 * IMPORTANT:
 * razorpayPaymentId is intentionally NOT included
 * because the current Order model does not persist it.
 */
export interface PaymentHistoryItem {
  orderId: string;
  referenceId: string;
  amountInPaise: number;
  currency: Order["currency"];
  status: OrderStatus;

  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPriceInPaise: number;
  }>;

  paymentLinkId?: string;
  paymentLink?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Returns persisted orders for the Payments
 * history screen.
 *
 * MongoDB is the source of truth for:
 * - amount
 * - item quantities
 * - item prices
 * - order state
 * - Razorpay Payment Link identifiers
 */
export async function getPaymentHistoryFromDatabase(): Promise<
  PaymentHistoryItem[]
> {
  const orders =
    await OrderModel.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

  if (orders.length === 0) {
    return [];
  }

  const productIds = Array.from(
    new Set(
      orders.flatMap((order) =>
        order.items.map(
          (item) =>
            String(item.productId)
        )
      )
    )
  );

  const products =
    await ProductModel.find({
      _id: {
        $in: productIds,
      },
    })
      .select("_id name")
      .lean();

  const productNames =
    new Map(
      products.map((product) => [
        String(product._id),
        product.name,
      ])
    );

  return orders.map((order) => ({
    orderId: String(order._id),

    referenceId:
      order.referenceId,

    amountInPaise:
      order.amountInPaise,

    currency:
      order.currency,

    status:
      order.status,

    items: order.items.map(
      (item) => ({
        productId:
          String(item.productId),

        productName:
          productNames.get(
            String(item.productId)
          ) ?? "Unknown product",

        quantity:
          item.quantity,

        unitPriceInPaise:
          item.unitPriceInPaise,
      })
    ),

    ...(order.razorpayPaymentLinkId
      ? {
          paymentLinkId:
            order.razorpayPaymentLinkId,
        }
      : {}),

    ...(order.razorpayPaymentLinkUrl
      ? {
          paymentLink:
            order.razorpayPaymentLinkUrl,
        }
      : {}),

    createdAt:
      order.createdAt.toISOString(),

    updatedAt:
      order.updatedAt.toISOString(),
  }));
}
