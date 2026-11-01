import { HydratedDocument, Types } from "mongoose";
import { AuditLogModel } from "../models/AuditLog";
import { OrderModel } from "../models/Order";
import { AgentActionModel } from "../models/AgentAction";
import { getPaymentCallbackUrl } from "../config/env";
import { AppError } from "../utils/AppError";
import { getRazorpayCredentials } from "../config/razorpay";
import {
  approveAction,
  revalidateAction,
} from "./payment-approval.service";
import { recordAudit } from "./audit.service";
import {
  createRazorpayPaymentLink,
  isDefinitivePaymentLinkCreationFailure,
} from "./razorpay.client";
import { createOrderSnapshot } from "./payment-order.service";
import {
  calculateAuthoritativeAmount,
  reconcilePayment,
} from "./reconciliation.service";
import type { AuthenticatedUser } from "../types/auth";
import type {
  Order,
} from "../types/domain";

export { createRazorpayPaymentLink, getRazorpayCredentials };
export { calculateAuthoritativeAmount, reconcilePayment };
export { getPaymentStatusByOrderId } from "./reconciliation.service";
export { getPaymentHistoryFromDatabase } from "./payment-history.service";
export type { PaymentHistoryItem } from "./payment-history.service";
export { recordAudit } from "./audit.service";
export { approveAction };
export type { ActionApprovalResult } from "./payment-approval.service";
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
 * Explicit human approval.
 *
 * Approval NEVER calls Razorpay.
 */
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

        callbackUrl: getPaymentCallbackUrl(String(order._id)),
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
    if (isDefinitivePaymentLinkCreationFailure(error)) {
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
