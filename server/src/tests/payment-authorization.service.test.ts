import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import { Types } from "mongoose";

import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { revalidatePersistedPaymentAction } from "../services/payment-authorization.service";
import type { AgentAction, MerchantPolicy } from "../types/domain";
import { AppError } from "../utils/AppError";

type PersistedPaymentAction = Pick<
  AgentAction,
  "proposal" | "referenceId" | "discountPercent"
>;

const defaultPolicy: MerchantPolicy = {
  maxTransactionAmount: 500000,
  maxDiscountPercent: 10,
  requireHumanApproval: true,
  allowRefunds: false,
  allowPayouts: false,
};

function persistedAction(
  productId: Types.ObjectId,
  overrides: Partial<AgentAction["proposal"]> = {},
): PersistedPaymentAction {
  return {
    referenceId: "authorization-test-001",
    discountPercent: 5,
    proposal: {
      action: "CREATE_PAYMENT",
      items: [{ productId, quantity: 2 }],
      proposedAmountInPaise: 25000,
      reason: "Customer requested the product.",
      requiresApproval: true,
      ...overrides,
    },
  };
}

function mockAuthorizationData(
  context: TestContext,
  policy: MerchantPolicy | null,
  products: Array<{
    _id: Types.ObjectId;
    name: string;
    priceInPaise: number;
    inventory: number;
  }>,
  onProductQuery?: (filter: unknown) => void,
): void {
  context.mock.method(
    MerchantModel,
    "findOne",
    () =>
      ({
        sort: async (sort: unknown) => {
          assert.deepEqual(sort, { createdAt: 1 });
          return policy ? { policy } : null;
        },
      }) as never,
  );
  context.mock.method(
    OrderModel,
    "findOne",
    async (filter: unknown) => {
      assert.deepEqual(filter, {
        referenceId: "authorization-test-001",
        status: {
          $in: [
            "CREATED",
            "AWAITING_PAYMENT",
            "PAID",
            "UNKNOWN",
            "RECOVERED",
          ],
        },
      });
      return null as never;
    },
  );
  context.mock.method(
    ProductModel,
    "find",
    async (filter: unknown) => {
      onProductQuery?.(filter);
      return products as never;
    },
  );
}

describe("revalidatePersistedPaymentAction", () => {
  it("reconstructs persisted proposal fields and evaluates current catalog data", async (context) => {
    const productId = new Types.ObjectId();
    let productFilter: unknown;
    mockAuthorizationData(
      context,
      defaultPolicy,
      [{
        _id: productId,
        name: "Product",
        priceInPaise: 12500,
        inventory: 10,
      }],
      (filter) => {
        productFilter = filter;
      },
    );

    const result = await revalidatePersistedPaymentAction(
      persistedAction(productId),
    );

    assert.equal(result.decision, "ALLOW");
    assert.equal(result.verifiedAmountInPaise, 25000);
    assert.equal(result.approvalRequired, true);
    assert.deepEqual(productFilter, {
      _id: { $in: [String(productId)] },
    });
    assert.ok(result.checks.some(
      (check) =>
        check.name === "PRICE_MISMATCH" &&
        check.passed,
    ));
    assert.ok(result.checks.some(
      (check) =>
        check.name === "DISCOUNT_LIMIT" &&
        check.passed,
    ));
  });

  it("blocks a persisted proposal when the current catalog price has changed", async (context) => {
    const productId = new Types.ObjectId();
    mockAuthorizationData(context, defaultPolicy, [{
      _id: productId,
      name: "Product",
      priceInPaise: 15000,
      inventory: 10,
    }]);

    const result = await revalidatePersistedPaymentAction(
      persistedAction(productId),
    );

    assert.equal(result.decision, "BLOCK");
    assert.equal(result.verifiedAmountInPaise, 30000);
    assert.ok(result.checks.some(
      (check) =>
        check.name === "PRICE_MISMATCH" &&
        !check.passed,
    ));
  });

  it("blocks proposals exceeding the current merchant transaction limit", async (context) => {
    const productId = new Types.ObjectId();
    mockAuthorizationData(
      context,
      { ...defaultPolicy, maxTransactionAmount: 20000 },
      [{
        _id: productId,
        name: "Product",
        priceInPaise: 12500,
        inventory: 10,
      }],
    );

    const result = await revalidatePersistedPaymentAction(
      persistedAction(productId),
    );

    assert.equal(result.decision, "BLOCK");
    assert.equal(result.verifiedAmountInPaise, 25000);
    assert.ok(result.checks.some(
      (check) =>
        check.name === "TRANSACTION_LIMIT" &&
        !check.passed,
    ));
  });

  it("blocks when a persisted product is missing from the current catalog", async (context) => {
    const productId = new Types.ObjectId();
    mockAuthorizationData(context, defaultPolicy, []);

    const result = await revalidatePersistedPaymentAction(
      persistedAction(productId),
    );

    assert.equal(result.decision, "BLOCK");
    assert.equal(result.verifiedAmountInPaise, 0);
    assert.ok(result.checks.some(
      (check) =>
        check.name === "PRODUCT_EXISTS" &&
        !check.passed,
    ));
  });

  it("blocks an incomplete persisted proposal without querying products", async (context) => {
    let productQueryCount = 0;
    const productId = new Types.ObjectId();
    mockAuthorizationData(
      context,
      defaultPolicy,
      [],
      () => {
        productQueryCount += 1;
      },
    );

    const result = await revalidatePersistedPaymentAction(
      persistedAction(productId, { items: [] }),
    );

    assert.equal(result.decision, "BLOCK");
    assert.equal(productQueryCount, 0);
    assert.ok(result.checks.some(
      (check) =>
        check.name === "VALID_PROPOSAL" &&
        !check.passed,
    ));
  });

  it("returns MERCHANT_NOT_FOUND when no current merchant policy exists", async (context) => {
    const productId = new Types.ObjectId();
    mockAuthorizationData(context, null, []);

    await assert.rejects(
      revalidatePersistedPaymentAction(
        persistedAction(productId),
      ),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 503 &&
        error.code === "MERCHANT_NOT_FOUND",
    );
  });

  it("propagates product lookup failures", async (context) => {
    const productId = new Types.ObjectId();
    const lookupError = new Error("Catalog unavailable");
    context.mock.method(
      MerchantModel,
      "findOne",
      () =>
        ({
          sort: async () => ({ policy: defaultPolicy }),
        }) as never,
    );
    context.mock.method(
      OrderModel,
      "findOne",
      async () => null as never,
    );
    context.mock.method(
      ProductModel,
      "find",
      async () => {
        throw lookupError;
      },
    );

    await assert.rejects(
      revalidatePersistedPaymentAction(
        persistedAction(productId),
      ),
      (error: unknown) => error === lookupError,
    );
  });
});
