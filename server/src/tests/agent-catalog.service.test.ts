import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";

import { ProductModel } from "../models/Product";
import {
  getProduct,
  listAgentCatalog,
  proposePayment,
  recommendProducts,
  searchProducts,
} from "../services/agent-catalog.service";
import {
  getProduct as getProductFromAgentService,
  proposePayment as proposePaymentFromAgentService,
  recommendProducts as recommendProductsFromAgentService,
  searchProducts as searchProductsFromAgentService,
} from "../services/agent.service";
import { AppError } from "../utils/AppError";

function product(
  id: Types.ObjectId,
  overrides: {
    name?: string;
    category?: string;
    tags?: string[];
    priceInPaise?: number;
    inventory?: number;
    frequentlyBoughtWith?: Types.ObjectId[];
  } = {},
) {
  return {
    _id: id,
    name: overrides.name ?? "Test product",
    category: overrides.category ?? "test",
    tags: overrides.tags ?? ["sample"],
    priceInPaise: overrides.priceInPaise ?? 12500,
    inventory: overrides.inventory ?? 3,
    frequentlyBoughtWith: overrides.frequentlyBoughtWith ?? [],
  };
}

describe("agent catalog service", () => {
  it("preserves the agent service catalog and proposal exports", () => {
    assert.equal(getProductFromAgentService, getProduct);
    assert.equal(proposePaymentFromAgentService, proposePayment);
    assert.equal(recommendProductsFromAgentService, recommendProducts);
    assert.equal(searchProductsFromAgentService, searchProducts);
  });

  it("returns an empty catalog when there are no products", async (t) => {
    let limit: number | undefined;
    t.mock.method(ProductModel, "find", () => ({
      limit: async (value: number) => {
        limit = value;
        return [];
      },
    }));

    assert.deepEqual(await listAgentCatalog(), []);
    assert.equal(limit, 100);
  });

  it("maps catalog products while applying the requested list limit", async (t) => {
    const productId = new Types.ObjectId();
    let limit: number | undefined;
    t.mock.method(ProductModel, "find", () => ({
      limit: async (value: number) => {
        limit = value;
        return [product(productId, { name: "Garden kit" })];
      },
    }));

    assert.deepEqual(await listAgentCatalog(25), [
      {
        productId: String(productId),
        name: "Garden kit",
        category: "test",
        tags: ["sample"],
        priceInPaise: 12500,
        inventory: 3,
      },
    ]);
    assert.equal(limit, 25);
  });

  it("returns no search results without querying for empty or short tokens", async (t) => {
    const find = t.mock.method(ProductModel, "find", () => ({
      limit: async () => [],
    }));

    assert.deepEqual(await searchProducts("a b !"), []);
    assert.equal(find.mock.callCount(), 0);
  });

  it("searches all catalog fields and maps matching products", async (t) => {
    const productId = new Types.ObjectId();
    let filter: unknown;
    let limit: number | undefined;
    t.mock.method(ProductModel, "find", (query: unknown) => {
      filter = query;
      return {
        limit: async (value: number) => {
          limit = value;
          return [product(productId)];
        },
      };
    });

    assert.deepEqual(await searchProducts("Coffee Gift", 7), [
      {
        productId: String(productId),
        name: "Test product",
        category: "test",
        tags: ["sample"],
        priceInPaise: 12500,
        inventory: 3,
      },
    ]);
    assert.deepEqual(filter, {
      $or: [
        { name: { $regex: "coffee|gift", $options: "i" } },
        { tags: { $regex: "coffee|gift", $options: "i" } },
        { category: { $regex: "coffee|gift", $options: "i" } },
      ],
    });
    assert.equal(limit, 7);
  });

  it("returns null for invalid or missing product IDs", async (t) => {
    const findById = t.mock.method(ProductModel, "findById", async () => null);

    assert.equal(await getProduct("not-an-id"), null);
    assert.equal(await getProduct(String(new Types.ObjectId())), null);
    assert.equal(findById.mock.callCount(), 1);
  });

  it("maps a found product to the agent catalog shape", async (t) => {
    const productId = new Types.ObjectId();
    t.mock.method(ProductModel, "findById", async () =>
      product(productId, { name: "Coffee kit" }),
    );

    assert.deepEqual(await getProduct(String(productId)), {
      productId: String(productId),
      name: "Coffee kit",
      category: "test",
      tags: ["sample"],
      priceInPaise: 12500,
      inventory: 3,
    });
  });

  it("returns no recommendations when the seed product is missing", async (t) => {
    const findById = t.mock.method(ProductModel, "findById", async () => null);

    assert.deepEqual(
      await recommendProducts(String(new Types.ObjectId())),
      [],
    );
    assert.equal(findById.mock.callCount(), 1);
  });

  it("adds related products before same-category recommendations", async (t) => {
    const seedId = new Types.ObjectId();
    const relatedId = new Types.ObjectId();
    const categoryId = new Types.ObjectId();
    t.mock.method(ProductModel, "findById", async () =>
      product(seedId, {
        name: "Seed product",
        category: "coffee",
        frequentlyBoughtWith: [relatedId],
      }),
    );
    let categoryLimit: number | undefined;
    t.mock.method(ProductModel, "find", (filter: unknown) => {
      if (JSON.stringify(filter).includes('"$in"')) {
        return Promise.resolve([
          product(relatedId, { name: "Related item" }),
        ]);
      }

      return {
        limit: async (limit: number) => {
          categoryLimit = limit;
          return [
            product(categoryId, {
              name: "Category item",
              category: "coffee",
            }),
          ];
        },
      };
    });

    assert.deepEqual(await recommendProducts(String(seedId), 2), [
      {
        productId: String(relatedId),
        name: "Related item",
        priceInPaise: 12500,
        reason: "Frequently bought together with Seed product.",
      },
      {
        productId: String(categoryId),
        name: "Category item",
        priceInPaise: 12500,
        reason: "Other popular items in coffee.",
      },
    ]);
    assert.equal(categoryLimit, 1);
  });

  it("rejects empty proposals and missing products with their existing errors", async (t) => {
    t.mock.method(ProductModel, "findById", async () => null);

    await assert.rejects(
      proposePayment([], "reason"),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 400 &&
        error.code === "INVALID_PROPOSAL" &&
        error.message === "proposePayment requires at least one item.",
    );
    await assert.rejects(
      proposePayment(
        [{ productId: String(new Types.ObjectId()), quantity: 1 }],
        "reason",
      ),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 400 &&
        error.code === "AI_UNKNOWN_PRODUCT",
    );
  });

  it("rejects non-positive or non-integer proposal quantities", async (t) => {
    const productId = new Types.ObjectId();
    t.mock.method(ProductModel, "findById", async () => product(productId));

    for (const quantity of [0, -1, 1.5]) {
      await assert.rejects(
        proposePayment([{ productId: String(productId), quantity }], "reason"),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "INVALID_PROPOSAL" &&
          error.message ===
            "Cannot propose payment: quantity for Test product must be a positive integer.",
      );
    }
  });

  it("builds a payment proposal using catalog prices without persisting it", async (t) => {
    const productId = new Types.ObjectId();
    t.mock.method(ProductModel, "findById", async () =>
      product(productId, { priceInPaise: 179900 }),
    );

    const proposal = await proposePayment(
      [{ productId: String(productId), quantity: 2 }],
      "Customer request",
    );

    assert.equal(proposal.action, "CREATE_PAYMENT");
    assert.equal(proposal.proposedAmountInPaise, 359800);
    assert.equal(proposal.reason, "Customer request");
    assert.equal(proposal.requiresApproval, true);
    assert.equal(proposal.items.length, 1);
    assert.equal(String(proposal.items[0].productId), String(productId));
    assert.match(proposal.referenceId, /^agent-[0-9a-f]{32}$/);
  });
});
