import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";

import { ProductModel } from "../models/Product";
import {
  getProductById,
  listProducts,
} from "../services/catalog.service";
import { AppError } from "../utils/AppError";

interface CatalogProductFixture {
  _id: Types.ObjectId;
  name: string;
  description: string;
  priceInPaise: number;
  currency: "INR";
  category: string;
  tags: string[];
  inventory: number;
  frequentlyBoughtWith: Types.ObjectId[];
}

function product(
  id: Types.ObjectId,
  overrides: Partial<Omit<CatalogProductFixture, "_id">> = {},
): CatalogProductFixture {
  return {
    _id: id,
    name: "Test product",
    description: "A test product",
    priceInPaise: 12500,
    currency: "INR",
    category: "test",
    tags: ["sample"],
    inventory: 3,
    frequentlyBoughtWith: [],
    ...overrides,
  };
}

describe("catalog service", () => {
  it("lists products in creation order and maps database IDs to strings", async (t) => {
    const productId = new Types.ObjectId();
    const relatedProductId = new Types.ObjectId();
    const products = [
      product(productId, {
        frequentlyBoughtWith: [relatedProductId],
      }),
    ];
    let sortFilter: unknown;
    const query = {
      sort: t.mock.fn(async (filter: unknown) => {
        sortFilter = filter;
        return products;
      }),
    };
    t.mock.method(ProductModel, "find", () => query);

    assert.deepEqual(await listProducts(), [
      {
        id: String(productId),
        name: "Test product",
        description: "A test product",
        priceInPaise: 12500,
        currency: "INR",
        category: "test",
        tags: ["sample"],
        inventory: 3,
        frequentlyBoughtWith: [String(relatedProductId)],
      },
    ]);
    assert.deepEqual(sortFilter, { createdAt: 1 });
    assert.equal(query.sort.mock.callCount(), 1);
  });

  it("returns an empty list when no products exist", async (t) => {
    t.mock.method(ProductModel, "find", () => ({
      sort: async () => [],
    }));

    assert.deepEqual(await listProducts(), []);
  });

  it("propagates product-list database errors", async (t) => {
    const databaseError = new Error("product query failed");
    t.mock.method(ProductModel, "find", () => ({
      sort: async () => {
        throw databaseError;
      },
    }));

    await assert.rejects(listProducts(), (error: unknown) => error === databaseError);
  });

  it("retrieves a product by valid ID and maps referenced IDs to strings", async (t) => {
    const productId = new Types.ObjectId();
    const relatedProductId = new Types.ObjectId();
    t.mock.method(ProductModel, "findById", async () =>
      product(productId, {
        frequentlyBoughtWith: [relatedProductId],
      }),
    );

    assert.deepEqual(await getProductById(String(productId)), {
      id: String(productId),
      name: "Test product",
      description: "A test product",
      priceInPaise: 12500,
      currency: "INR",
      category: "test",
      tags: ["sample"],
      inventory: 3,
      frequentlyBoughtWith: [String(relatedProductId)],
    });
  });

  it("rejects invalid IDs before querying the database", async (t) => {
    const findById = t.mock.method(ProductModel, "findById", async () => null);

    await assert.rejects(
      getProductById("not-an-object-id"),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 400 &&
        error.code === "INVALID_PRODUCT_ID",
    );
    assert.equal(findById.mock.callCount(), 0);
  });

  it("returns a not-found error for a valid ID with no matching product", async (t) => {
    t.mock.method(ProductModel, "findById", async () => null);

    await assert.rejects(
      getProductById(String(new Types.ObjectId())),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 404 &&
        error.code === "PRODUCT_NOT_FOUND",
    );
  });

  it("propagates product retrieval database errors", async (t) => {
    const databaseError = new Error("product lookup failed");
    t.mock.method(ProductModel, "findById", async () => {
      throw databaseError;
    });

    await assert.rejects(
      getProductById(String(new Types.ObjectId())),
      (error: unknown) => error === databaseError,
    );
  });
});
