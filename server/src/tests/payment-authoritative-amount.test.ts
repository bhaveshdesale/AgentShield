import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";

import { ProductModel } from "../models/Product";
import { calculateAuthoritativeAmount } from "../services/reconciliation.service";
import { AppError } from "../utils/AppError";

function objectId(): Types.ObjectId {
  return new Types.ObjectId();
}

describe("calculateAuthoritativeAmount", () => {
  it("uses the server catalog price for a single product", async (t) => {
    const productId = objectId();
    let query: unknown;
    t.mock.method(ProductModel, "find", async (filter: unknown) => {
      query = filter;
      return [{ _id: productId, priceInPaise: 179900 }];
    });

    const amount = await calculateAuthoritativeAmount({
      items: [{ productId, quantity: 1 }],
    });

    assert.equal(amount, 179900);
    assert.deepEqual(query, { _id: { $in: [String(productId)] } });
  });

  it("calculates totals across multiple distinct products", async (t) => {
    const firstId = objectId();
    const secondId = objectId();
    t.mock.method(ProductModel, "find", async () => [
      { _id: firstId, priceInPaise: 179900 },
      { _id: secondId, priceInPaise: 89900 },
    ]);

    const amount = await calculateAuthoritativeAmount({
      items: [
        { productId: firstId, quantity: 1 },
        { productId: secondId, quantity: 2 },
      ],
    });

    assert.equal(amount, 359700);
  });

  it("aggregates repeated product IDs before applying catalog prices", async (t) => {
    const productId = objectId();
    let query: unknown;
    t.mock.method(ProductModel, "find", async (filter: unknown) => {
      query = filter;
      return [{ _id: productId, priceInPaise: 12500 }];
    });

    const amount = await calculateAuthoritativeAmount({
      items: [
        { productId, quantity: 2 },
        { productId, quantity: 3 },
      ],
    });

    assert.equal(amount, 62500);
    assert.deepEqual(query, { _id: { $in: [String(productId)] } });
  });

  it("does not use a proposal-provided price", async (t) => {
    const productId = objectId();
    t.mock.method(ProductModel, "find", async () => [
      { _id: productId, priceInPaise: 7500 },
    ]);
    const item = {
      productId,
      quantity: 2,
      priceInPaise: 1,
    };

    const amount = await calculateAuthoritativeAmount({
      items: [item],
    });

    assert.equal(amount, 15000);
  });

  it("rejects a product missing from the catalog with AI_UNKNOWN_PRODUCT", async (t) => {
    const productId = objectId();
    t.mock.method(ProductModel, "find", async () => []);

    await assert.rejects(
      calculateAuthoritativeAmount({
        items: [{ productId, quantity: 1 }],
      }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        error.code === "AI_UNKNOWN_PRODUCT",
    );
  });

  it("returns zero for an empty item list", async (t) => {
    let query: unknown;
    t.mock.method(ProductModel, "find", async (filter: unknown) => {
      query = filter;
      return [];
    });

    assert.equal(
      await calculateAuthoritativeAmount({ items: [] }),
      0,
    );
    assert.deepEqual(query, { _id: { $in: [] } });
  });
});
