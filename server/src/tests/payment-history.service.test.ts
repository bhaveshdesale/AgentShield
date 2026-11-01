import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";

import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { getPaymentHistoryFromDatabase } from "../services/payment-history.service";

describe("getPaymentHistoryFromDatabase", () => {
  it("sorts and limits orders, then maps order and product data to history items", async (t) => {
    const firstProductId = new Types.ObjectId();
    const missingProductId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const createdAt = new Date("2026-10-28T10:00:00.000Z");
    const updatedAt = new Date("2026-10-28T10:05:00.000Z");
    let orderFilter: unknown;
    let orderSort: unknown;
    let orderLimit: number | undefined;
    let productFilter: unknown;
    let productSelection: string | undefined;

    const orders = [
      {
        _id: orderId,
        referenceId: "ref_123",
        amountInPaise: 123400,
        currency: "INR",
        status: "AWAITING_PAYMENT",
        items: [
          {
            productId: firstProductId,
            quantity: 2,
            unitPriceInPaise: 61700,
          },
          {
            productId: firstProductId,
            quantity: 1,
            unitPriceInPaise: 61700,
          },
          {
            productId: missingProductId,
            quantity: 3,
            unitPriceInPaise: 100,
          },
        ],
        razorpayPaymentLinkId: "plink_123",
        razorpayPaymentLinkUrl: "https://checkout.example.test/link",
        createdAt,
        updatedAt,
      },
    ];

    t.mock.method(OrderModel, "find", (filter: unknown) => {
      orderFilter = filter;
      return {
        sort(sort: unknown) {
          orderSort = sort;
          return {
            limit(limit: number) {
              orderLimit = limit;
              return {
                lean: async () => orders,
              };
            },
          };
        },
      };
    });

    t.mock.method(ProductModel, "find", (filter: unknown) => {
      productFilter = filter;
      return {
        select(selection: string) {
          productSelection = selection;
          return {
            lean: async () => [
              { _id: firstProductId, name: "Garden kit" },
            ],
          };
        },
      };
    });

    assert.deepEqual(await getPaymentHistoryFromDatabase(), [
      {
        orderId: String(orderId),
        referenceId: "ref_123",
        amountInPaise: 123400,
        currency: "INR",
        status: "AWAITING_PAYMENT",
        items: [
          {
            productId: String(firstProductId),
            productName: "Garden kit",
            quantity: 2,
            unitPriceInPaise: 61700,
          },
          {
            productId: String(firstProductId),
            productName: "Garden kit",
            quantity: 1,
            unitPriceInPaise: 61700,
          },
          {
            productId: String(missingProductId),
            productName: "Unknown product",
            quantity: 3,
            unitPriceInPaise: 100,
          },
        ],
        paymentLinkId: "plink_123",
        paymentLink: "https://checkout.example.test/link",
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
    ]);
    assert.deepEqual(orderFilter, {});
    assert.deepEqual(orderSort, { createdAt: -1 });
    assert.equal(orderLimit, 100);
    assert.deepEqual(productFilter, {
      _id: {
        $in: [String(firstProductId), String(missingProductId)],
      },
    });
    assert.equal(productSelection, "_id name");
  });

  it("returns an empty list without querying products when no orders exist", async (t) => {
    let productQueryCount = 0;
    t.mock.method(OrderModel, "find", () => ({
      sort: () => ({
        limit: () => ({
          lean: async () => [],
        }),
      }),
    }));
    t.mock.method(ProductModel, "find", () => {
      productQueryCount += 1;
      return {
        select: () => ({
          lean: async () => [],
        }),
      };
    });

    assert.deepEqual(await getPaymentHistoryFromDatabase(), []);
    assert.equal(productQueryCount, 0);
  });

  it("propagates order query errors", async (t) => {
    const databaseError = new Error("order history query failed");
    t.mock.method(OrderModel, "find", () => ({
      sort: () => ({
        limit: () => ({
          lean: async () => {
            throw databaseError;
          },
        }),
      }),
    }));

    await assert.rejects(
      getPaymentHistoryFromDatabase(),
      (error: unknown) => error === databaseError,
    );
  });

  it("propagates product query errors", async (t) => {
    const productId = new Types.ObjectId();
    const databaseError = new Error("product history query failed");
    t.mock.method(OrderModel, "find", () => ({
      sort: () => ({
        limit: () => ({
          lean: async () => [
            {
              _id: new Types.ObjectId(),
              referenceId: "ref_123",
              amountInPaise: 100,
              currency: "INR",
              status: "CREATED",
              items: [
                {
                  productId,
                  quantity: 1,
                  unitPriceInPaise: 100,
                },
              ],
              createdAt: new Date("2026-10-28T10:00:00.000Z"),
              updatedAt: new Date("2026-10-28T10:00:00.000Z"),
            },
          ],
        }),
      }),
    }));
    t.mock.method(ProductModel, "find", () => ({
      select: () => ({
        lean: async () => {
          throw databaseError;
        },
      }),
    }));

    await assert.rejects(
      getPaymentHistoryFromDatabase(),
      (error: unknown) => error === databaseError,
    );
  });
});
