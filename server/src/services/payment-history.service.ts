import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import type { Order, OrderStatus } from "../types/domain";

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
