import { Types } from "mongoose";
import { getPaymentCallbackUrl } from "../config/env";
import { AgentActionModel } from "../models/AgentAction";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { AppError } from "../utils/AppError";
import { recordAudit } from "./audit.service";
import {
  createRazorpayPaymentLink,
  isDefinitivePaymentLinkCreationFailure,
  lookupRazorpayPaymentLink,
} from "./razorpay.client";
import type { RazorpayPaymentLinkDetail } from "./razorpay.client";
import type { OrderStatus } from "../types/domain";
import {
  claimPaymentRecovery,
  refreshPaymentRecoveryLease,
} from "./payment-recovery-claim.service";

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
  const { order, action, actionId, recoveryClaimToken } = await claimPaymentRecovery(
    options.orderId,
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
        {
          _id: order._id,
          status: "RECOVERING",
          recoveryClaimToken,
        },
        {
          $set: {
            status: "UNKNOWN",
          },
          $unset: {
            recoveryClaimToken: 1,
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

      const activeClaim = await refreshPaymentRecoveryLease(
        order._id,
        recoveryClaimToken,
      );
      if (!activeClaim) {
        throw new AppError(
          "Payment recovery claim is no longer owned by this process.",
          409,
          "RECOVERY_STATE_CHANGED",
        );
      }

      // An already-sent Razorpay request cannot be cancelled if this lease later expires.
      try {
        const newPaymentLink =
          await createRazorpayPaymentLink({
            amountInPaise:
              verifiedAmountInPaise,

            referenceId:
              order.referenceId,

            description:
              `AgentShield order ${order.referenceId}`,

            callbackUrl: getPaymentCallbackUrl(String(order._id)),
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
        if (isDefinitivePaymentLinkCreationFailure(retryError)) {
          const failedOrder = await OrderModel.findOneAndUpdate(
            {
              _id: order._id,
              status: "RECOVERING",
              recoveryClaimToken,
            },
            {
              $set: {
                status: "FAILED",
              },
              $unset: {
                recoveryClaimToken: 1,
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
          {
            _id: order._id,
            status: "RECOVERING",
            recoveryClaimToken,
          },
          {
            $set: {
              status: "UNKNOWN",
            },
            $unset: {
              recoveryClaimToken: 1,
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
      {
        _id: order._id,
        status: "RECOVERING",
        recoveryClaimToken,
      },
      {
        $set: {
          razorpayPaymentLinkId: paymentLinkId,
          razorpayPaymentLinkUrl: paymentLink,
          status: finalStatus,
        },
        $unset: {
          recoveryClaimToken: 1,
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
      {
        _id: order._id,
        status: "RECOVERING",
        recoveryClaimToken,
      },
      {
        $set: {
          status: "UNKNOWN",
        },
        $unset: {
          recoveryClaimToken: 1,
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
