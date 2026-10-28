import { Types } from "mongoose";
import { AgentActionModel } from "../models/AgentAction";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { AppError } from "../utils/AppError";
import { recordAudit, recordIdempotentAudit } from "./audit.service";
import { createRazorpayPaymentLink, lookupRazorpayPaymentLink } from "./razorpay.client";
import type { RazorpayPaymentLinkDetail } from "./razorpay.client";
import type { OrderStatus } from "../types/domain";
const RECOVERY_LEASE_MS = 120_000;

/**
 * Recomputes the authoritative amount from MongoDB.
 *
 * The AI-proposed amount is NEVER used for payment creation.
 */
export async function calculateAuthoritativeAmount(
  proposal: {
    items: {
      productId: Types.ObjectId;
      quantity: number;
    }[];
  }
): Promise<number> {
  const quantitiesByProductId = new Map<
    string,
    number
  >();

  for (const item of proposal.items) {
    const key = String(item.productId);

    quantitiesByProductId.set(
      key,
      (quantitiesByProductId.get(key) ?? 0) +
        item.quantity
    );
  }

  const products = await ProductModel.find({
    _id: {
      $in: Array.from(
        quantitiesByProductId.keys()
      ),
    },
  });

  const productById = new Map(
    products.map((product) => [
      String(product._id),
      product,
    ])
  );

  let amountInPaise = 0;

  for (const [id, quantity] of quantitiesByProductId) {
    const product = productById.get(id);

    if (!product) {
      throw new AppError(
        `Authoritative amount cannot be calculated: product ${id} not found in catalog.`,
        409,
        "AI_UNKNOWN_PRODUCT"
      );
    }

    amountInPaise +=
      product.priceInPaise * quantity;
  }

  return amountInPaise;
}

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
        const updatedOrder = await OrderModel.findOneAndUpdate(
          {
            _id: order._id,
            status: { $in: allowedPriorStates },
          },
          { $set: { status: targetStatus } },
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

/**
 * Reconciles an order stuck in UNKNOWN state.
 *
 * UNKNOWN
 *    ↓
 * RECOVERING
 *    ↓
 * PAID / RECOVERED / AWAITING_PAYMENT
 */
export async function reconcilePayment(
  options: {
    orderId: string;
  }
): Promise<{
  orderId: string;
  status: string;
  paymentLinkId?: string;
  paymentLink?: string;
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

  if (
    order.status !== "UNKNOWN" &&
    !(
      order.status === "RECOVERING" &&
      order.updatedAt.getTime() <= Date.now() - RECOVERY_LEASE_MS
    )
  ) {
    throw new AppError(
      "Only orders in UNKNOWN state or stale RECOVERING claims can be reconciled.",
      409,
      "ORDER_NOT_UNKNOWN"
    );
  }

  const action =
    await AgentActionModel.findOne({
      referenceId:
        order.referenceId,
    });

  const actionId = action
    ? String(action._id)
    : null;

  const staleRecoveryCutoff = new Date(Date.now() - RECOVERY_LEASE_MS);
  const claimed =
    await OrderModel.findOneAndUpdate(
      {
        _id: order._id,
        $or: [
          { status: "UNKNOWN" },
          { status: "RECOVERING", updatedAt: { $lte: staleRecoveryCutoff } },
        ],
      },
      {
        $set: {
          status: "RECOVERING",
        },
      },
      {
        new: true,
      }
    );

  if (!claimed) {
    throw new AppError(
      "Order is already being reconciled by another process.",
      409,
      "ORDER_ALREADY_RECOVERING"
    );
  }

  await recordIdempotentAudit(
    "RECOVERY_STARTED",
    { orderId: String(order._id) },
    `recovery:${String(order._id)}:${claimed.updatedAt.getTime()}`,
    actionId ?? undefined,
  );

  try {
    /**
     * Recompute the amount from current catalog.
     */
    const verifiedAmountInPaise =
      await calculateAuthoritativeAmount({
        items: order.items.map(
          (item) => ({
            productId:
              item.productId,

            quantity:
              item.quantity,
          })
        ),
      });

    let paymentLinkId =
      order.razorpayPaymentLinkId;

    let paymentLink =
      order.razorpayPaymentLinkUrl;

    let finalStatus:
      | OrderStatus
      = "UNKNOWN";

    let existing:
      | RazorpayPaymentLinkDetail
      | null = null;

    let lookupFailed =
      false;

    /**
     * First check Razorpay to prevent
     * accidentally creating a duplicate.
     */
    try {
      existing =
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
    } catch (lookupError) {
      lookupFailed = true;

      await recordAudit(
        "RECOVERY_UNRESOLVED",
        {
          errorCategory:
            lookupError instanceof
              AppError
              ? lookupError.code
              : "RECOVERY_LOOKUP_ERROR",
        },
        actionId
      );
      if (
        lookupError instanceof AppError &&
        lookupError.code === "RAZORPAY_CONFIGURATION_INVALID"
      ) {
        throw lookupError;
      }
    }

    /**
     * If Razorpay lookup itself failed,
     * stay UNKNOWN. Never blindly retry.
     */
    if (lookupFailed) {
      const resetOrder = await OrderModel.findOneAndUpdate(
        { _id: order._id, status: "RECOVERING" },
        {
          $set: {
            status: "UNKNOWN",
          },
        }
      );

      if (action && resetOrder) {
        await AgentActionModel.updateOne(
          {
            _id: action._id,
            executionStatus: { $in: ["RECOVERING", "UNKNOWN"] },
          },
          { $set: { executionStatus: "UNKNOWN" } },
        );
      }

      throw new AppError(
        "Recovery lookup failed. Order remains in UNKNOWN state.",
        502,
        "RECOVERY_LOOKUP_FAILED"
      );
    }

    /**
     * Existing Razorpay Payment Link found.
     */
    if (existing) {
      paymentLinkId =
        existing.id;

      paymentLink =
        existing.short_url;

      await recordAudit(
        "RECOVERY_PAYMENT_FOUND",
        {
          razorpayIdentifier:
            existing.id,

          referenceId:
            order.referenceId,
        },
        actionId
      );

      if (
        existing.status === "paid" ||
        existing.status ===
          "captured"
      ) {
        await recordAudit(
          "RECOVERY_PAYMENT_CONFIRMED",
          {
            razorpayIdentifier:
              existing.id,

            paymentStatus:
              existing.status,
          },
          actionId
        );

        finalStatus =
          "PAID";
      } else {
        /**
         * Payment link exists but has
         * not been paid yet.
         */
        finalStatus =
          "RECOVERED";
      }
    } else {
      /**
       * Razorpay has no matching link.
       *
       * A safe retry is now allowed.
       */
      await recordAudit(
        "RECOVERY_SAFE_RETRY",
        {
          verifiedAmountInPaise,
        },
        actionId
      );

      try {
        const frontendUrl = (
          process.env.FRONTEND_URL ||
          "http://localhost:5173"
        ).replace(/\/$/, "");

        const newPaymentLink =
          await createRazorpayPaymentLink({
            amountInPaise:
              verifiedAmountInPaise,

            referenceId:
              order.referenceId,

            description:
              `AgentShield order ${order.referenceId}`,

            callbackUrl:
              `${frontendUrl}/payments/${String(
                order._id
              )}`,
          });

        paymentLinkId =
          newPaymentLink.id;

        paymentLink =
          newPaymentLink.short_url;

        finalStatus =
          "AWAITING_PAYMENT";
      } catch (retryError) {
        /**
         * Known Razorpay rejection.
         */
        if (
          retryError instanceof
            AppError &&
          retryError.code ===
            "RAZORPAY_ERROR"
        ) {
          const failedOrder = await OrderModel.findOneAndUpdate(
            { _id: order._id, status: "RECOVERING" },
            {
              $set: {
                status: "FAILED",
              },
            }
          );

          if (action && failedOrder) {
            await AgentActionModel.updateOne(
              {
                _id: action._id,
                executionStatus: { $in: ["RECOVERING", "UNKNOWN"] },
              },
              { $set: { executionStatus: "FAILED" } },
            );
          }

          await recordAudit(
            "RECOVERY_RETRY_FAILED",
            {
              errorCategory:
                retryError.code,
            },
            actionId
          );

          throw retryError;
        }

        /**
         * Unknown retry outcome.
         * Keep the order UNKNOWN.
         */
        const resetOrder = await OrderModel.findOneAndUpdate(
          { _id: order._id, status: "RECOVERING" },
          {
            $set: {
              status: "UNKNOWN",
            },
          }
        );

        if (action && resetOrder) {
          await AgentActionModel.updateOne(
            {
              _id: action._id,
              executionStatus: { $in: ["RECOVERING", "UNKNOWN"] },
            },
            { $set: { executionStatus: "UNKNOWN" } },
          );
        }

        await recordAudit(
          "RECOVERY_RETRY_FAILED",
          {
            errorCategory:
              retryError instanceof
                Error
                ? retryError.message
                : "RECOVERY_RETRY_ERROR",
          },
          actionId
        );

        throw new AppError(
          "Recovery retry failed. Order remains in UNKNOWN state.",
          502,
          "RECOVERY_RETRY_FAILED"
        );
      }
    }

    /**
     * Persist recovered Razorpay identifiers
     * and final order state.
     */
    const finalizedOrder = await OrderModel.findOneAndUpdate(
      { _id: order._id, status: "RECOVERING" },
      {
        $set: {
          razorpayPaymentLinkId: paymentLinkId,
          razorpayPaymentLinkUrl: paymentLink,
          status: finalStatus,
        },
      },
      { new: true },
    );
    if (!finalizedOrder) {
      throw new AppError(
        "Payment state changed while recovery was in progress.",
        409,
        "RECOVERY_STATE_CHANGED",
      );
    }

    /**
     * Synchronize the AgentAction state.
     */
    if (action) {
      if (finalStatus === "PAID" || finalStatus === "AWAITING_PAYMENT") {
        await AgentActionModel.updateOne(
          { _id: action._id, executionStatus: { $ne: "SUCCEEDED" } },
          { $set: { executionStatus: "SUCCEEDED" } },
        );
      } else if (finalStatus === "RECOVERED") {
        await AgentActionModel.updateOne(
          {
            _id: action._id,
            executionStatus: { $in: ["IN_PROGRESS", "UNKNOWN", "RECOVERING"] },
          },
          { $set: { executionStatus: "RECOVERED" } },
        );
      }
    }

    return {
      orderId:
        String(order._id),

      status:
        finalStatus,

      paymentLinkId,
      paymentLink,
    };
  } catch (error) {
    /**
     * Preserve the explicit recovery failure state.
     */
    if (
      error instanceof AppError &&
      error.code ===
        "RECOVERY_LOOKUP_FAILED"
    ) {
      throw error;
    }

    /**
     * Any unexpected recovery error
     * returns the order to UNKNOWN.
     */
    const resetOrder = await OrderModel.findOneAndUpdate(
      { _id: order._id, status: "RECOVERING" },
      {
        $set: {
          status: "UNKNOWN",
        },
      }
    );

    if (action && resetOrder) {
      await AgentActionModel.updateOne(
        {
          _id: action._id,
          executionStatus: { $in: ["RECOVERING", "UNKNOWN"] },
        },
        { $set: { executionStatus: "UNKNOWN" } },
      );
    }

    throw error;
  }
}
