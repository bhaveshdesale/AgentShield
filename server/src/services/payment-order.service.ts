import mongoose, { HydratedDocument, Types } from "mongoose";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { AppError } from "../utils/AppError";
import type { Order } from "../types/domain";

/**
 * Creates an immutable order snapshot using
 * authoritative MongoDB prices.
 */
export async function createOrderSnapshot(
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
