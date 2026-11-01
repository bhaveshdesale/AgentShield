import { Types } from "mongoose";
import { AgentActionModel } from "../models/AgentAction";
import { OrderModel } from "../models/Order";
import { AppError } from "../utils/AppError";
import { recordIdempotentAudit } from "./audit.service";
import { lookupRazorpayPaymentLink } from "./razorpay.client";
import type { OrderStatus } from "../types/domain";

/**
 * Gets the current payment status.
 *
 * Local MongoDB state is always returned.
 * Razorpay is queried when a Payment Link exists.
 */
export async function getPaymentStatusByOrderId(
  options: {
    orderId: string;
    refreshRemote?: boolean;
  }
): Promise<{
  orderId: string;
  status: OrderStatus;
  amountInPaise: number;
  referenceId: string;
  paymentLinkId?: string;
  paymentLink?: string;
  razorpayStatus?: string;
}> {
  if (
    !Types.ObjectId.isValid(
      options.orderId
    )
  ) {
    throw new AppError(
      "Invalid order ID.",
      400,
      "INVALID_ORDER_ID"
    );
  }

  const order =
    await OrderModel.findById(
      options.orderId
    );

  if (!order) {
    throw new AppError(
      "Order was not found.",
      404,
      "ORDER_NOT_FOUND"
    );
  }

  let razorpayStatus:
    | string
    | undefined;

  if (
    options.refreshRemote !== false &&
    (order.razorpayPaymentLinkId || order.referenceId)
  ) {
    const remote =
      await lookupRazorpayPaymentLink({
        ...(order.razorpayPaymentLinkId
          ? {
              paymentLinkId:
                order.razorpayPaymentLinkId,
            }
          : {}),

        referenceId:
          order.referenceId,
      });

    if (remote) {
      razorpayStatus =
        remote.status;

      const targetStatus =
        remote.status === "paid" || remote.status === "captured"
          ? "PAID"
          : remote.status === "expired" || remote.status === "failed"
            ? "FAILED"
            : undefined;
      if (targetStatus) {
        const allowedPriorStates =
          targetStatus === "PAID"
            ? ["CREATED", "AWAITING_PAYMENT", "FAILED", "RECOVERED", "RECOVERING"]
            : ["CREATED", "AWAITING_PAYMENT"];
        const orderUpdate =
          targetStatus === "PAID"
            ? {
                $set: { status: targetStatus },
                $unset: { recoveryClaimToken: 1 },
              }
            : { $set: { status: targetStatus } };
        const updatedOrder = await OrderModel.findOneAndUpdate(
          {
            _id: order._id,
            status: { $in: allowedPriorStates },
          },
          orderUpdate,
          { new: true },
        );
        const currentOrder = updatedOrder ?? await OrderModel.findById(order._id);
        if (!currentOrder) {
          throw new AppError("Order disappeared during payment reconciliation.", 503, "ORDER_NOT_FOUND");
        }
        order.status = currentOrder.status;
        if (currentOrder.status === targetStatus) {
          const action = await AgentActionModel.findOne({
            referenceId: order.referenceId,
          }).select("_id");
          await AgentActionModel.updateOne(
            targetStatus === "PAID"
              ? { referenceId: order.referenceId, executionStatus: { $ne: "SUCCEEDED" } }
              : {
                  referenceId: order.referenceId,
                  executionStatus: { $in: ["IN_PROGRESS", "UNKNOWN", "RECOVERING"] },
                },
            { $set: { executionStatus: targetStatus === "PAID" ? "SUCCEEDED" : "FAILED" } },
          );
          await recordIdempotentAudit(
            targetStatus === "PAID" ? "ORDER_PAYMENT_CONFIRMED" : "ORDER_PAYMENT_FAILED",
            {
              provider: "razorpay",
              providerStatus: remote.status,
              orderStatus: targetStatus,
              razorpayIdentifier: order.razorpayPaymentLinkId ?? "",
            },
            `reconcile:${String(order._id)}:${targetStatus}`,
            action ? String(action._id) : undefined,
          );
        }
      }
    }
  }

  return {
    orderId: String(order._id),

    status:
      order.status,

    amountInPaise:
      order.amountInPaise,

    referenceId:
      order.referenceId,

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

    ...(razorpayStatus
      ? {
          razorpayStatus,
        }
      : {}),
  };
}
