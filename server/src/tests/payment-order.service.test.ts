import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose, { Types } from "mongoose";

import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { createOrderSnapshot } from "../services/payment-order.service";
import { AppError } from "../utils/AppError";

describe("createOrderSnapshot", () => {
  it("creates an order using catalog prices and preserves duplicate proposal lines", async (t) => {
    const productId = new Types.ObjectId();
    const persistedOrder = { _id: new Types.ObjectId() };
    let orderFilter: unknown;
    let productFilter: unknown;
    let orderDocument: unknown;

    t.mock.method(OrderModel, "findOne", async (filter: unknown) => {
      orderFilter = filter;
      return null;
    });
    t.mock.method(ProductModel, "find", async (filter: unknown) => {
      productFilter = filter;
      return [{ _id: productId, priceInPaise: 12500 }] as never;
    });
    t.mock.method(OrderModel, "create", async (document: unknown) => {
      orderDocument = document;
      return persistedOrder as never;
    });

    const result = await createOrderSnapshot(
      {
        referenceId: "order-snapshot-test",
        items: [
          { productId, quantity: 2 },
          { productId, quantity: 3 },
        ],
      },
      62500,
    );

    assert.strictEqual(result, persistedOrder);
    assert.deepEqual(orderFilter, {
      referenceId: "order-snapshot-test",
    });
    assert.deepEqual(productFilter, {
      _id: { $in: [productId, productId] },
    });
    assert.deepEqual(orderDocument, {
      items: [
        { productId, quantity: 2, unitPriceInPaise: 12500 },
        { productId, quantity: 3, unitPriceInPaise: 12500 },
      ],
      amountInPaise: 62500,
      currency: "INR",
      status: "CREATED",
      referenceId: "order-snapshot-test",
    });
  });

  it("returns an existing order without looking up products or creating another order", async (t) => {
    const existingOrder = { _id: new Types.ObjectId() };
    const findOne = t.mock.method(
      OrderModel,
      "findOne",
      async () => existingOrder as never,
    );
    const findProducts = t.mock.method(
      ProductModel,
      "find",
      async () => [] as never,
    );
    const createOrder = t.mock.method(
      OrderModel,
      "create",
      async () => {
        throw new Error("Order creation should not run");
      },
    );

    const result = await createOrderSnapshot(
      {
        referenceId: "existing-order",
        items: [{ productId: new Types.ObjectId(), quantity: 1 }],
      },
      100,
    );

    assert.strictEqual(result, existingOrder);
    assert.equal(findOne.mock.callCount(), 1);
    assert.equal(findProducts.mock.callCount(), 0);
    assert.equal(createOrder.mock.callCount(), 0);
  });

  it("rejects when a proposal product is missing from the catalog", async (t) => {
    const productId = new Types.ObjectId();
    const createOrder = t.mock.method(
      OrderModel,
      "create",
      async () => {
        throw new Error("Order creation should not run");
      },
    );
    t.mock.method(OrderModel, "findOne", async () => null);
    t.mock.method(ProductModel, "find", async () => [] as never);

    await assert.rejects(
      createOrderSnapshot(
        {
          referenceId: "missing-product",
          items: [{ productId, quantity: 1 }],
        },
        100,
      ),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        error.code === "PRODUCT_CHANGED",
    );
    assert.equal(createOrder.mock.callCount(), 0);
  });

  it("returns the order created by a concurrent request after a duplicate-key error", async (t) => {
    const duplicateError = new mongoose.mongo.MongoServerError({
      message: "Duplicate reference ID",
      code: 11000,
    });
    const concurrentOrder = { _id: new Types.ObjectId() };
    let findOneCalls = 0;
    const findOne = t.mock.method(
      OrderModel,
      "findOne",
      async () => {
        findOneCalls += 1;
        return findOneCalls === 1 ? null : concurrentOrder as never;
      },
    );
    t.mock.method(OrderModel, "create", async () => {
      throw duplicateError;
    });

    const productId = new Types.ObjectId();
    t.mock.method(ProductModel, "find", async () => [
      { _id: productId, priceInPaise: 100 },
    ] as never);

    const result = await createOrderSnapshot(
      {
        referenceId: "concurrent-order",
        items: [{ productId, quantity: 1 }],
      },
      100,
    );

    assert.strictEqual(result, concurrentOrder);
    assert.equal(findOne.mock.callCount(), 2);
  });

  it("rethrows a duplicate-key error when no concurrent order is found", async (t) => {
    const duplicateError = new mongoose.mongo.MongoServerError({
      message: "Duplicate reference ID",
      code: 11000,
    });
    const findOne = t.mock.method(
      OrderModel,
      "findOne",
      async () => null,
    );
    const productId = new Types.ObjectId();
    t.mock.method(ProductModel, "find", async () => [
      { _id: productId, priceInPaise: 100 },
    ] as never);
    t.mock.method(OrderModel, "create", async () => {
      throw duplicateError;
    });

    await assert.rejects(
      createOrderSnapshot(
        {
          referenceId: "unresolved-race",
          items: [{ productId, quantity: 1 }],
        },
        100,
      ),
      (error: unknown) => error === duplicateError,
    );
    assert.equal(findOne.mock.callCount(), 2);
  });

  it("propagates non-duplicate persistence failures without a second lookup", async (t) => {
    const persistenceError = new Error("Database unavailable");
    const findOne = t.mock.method(
      OrderModel,
      "findOne",
      async () => null,
    );
    const productId = new Types.ObjectId();
    t.mock.method(ProductModel, "find", async () => [
      { _id: productId, priceInPaise: 100 },
    ] as never);
    t.mock.method(OrderModel, "create", async () => {
      throw persistenceError;
    });

    await assert.rejects(
      createOrderSnapshot(
        {
          referenceId: "persistence-failure",
          items: [{ productId, quantity: 1 }],
        },
        100,
      ),
      (error: unknown) => error === persistenceError,
    );
    assert.equal(findOne.mock.callCount(), 1);
  });
});
