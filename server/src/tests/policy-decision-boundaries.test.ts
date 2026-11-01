import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";

import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { evaluateAction } from "../services/policy.service";
import type { ActionProposalInput, MerchantPolicy } from "../types/domain";

const BASE_POLICY: MerchantPolicy = {
  maxTransactionAmount: 1000,
  maxDiscountPercent: 10,
  requireHumanApproval: true,
  allowRefunds: false,
  allowPayouts: false,
};

const PRODUCT_ID = new Types.ObjectId();

function proposal(
  overrides: Partial<ActionProposalInput> = {},
): ActionProposalInput {
  return {
    action: "CREATE_PAYMENT",
    items: [{ productId: PRODUCT_ID, quantity: 2 }],
    proposedAmountInPaise: 1000,
    reason: "Customer requested this product.",
    requiresApproval: false,
    referenceId: "policy-test-reference",
    ...overrides,
  };
}

function catalogProduct(overrides: {
  _id?: Types.ObjectId;
  name?: string;
  priceInPaise?: number;
  inventory?: number;
} = {}) {
  return {
    _id: overrides._id ?? PRODUCT_ID,
    name: overrides.name ?? "Test product",
    priceInPaise: overrides.priceInPaise ?? 500,
    inventory: overrides.inventory ?? 2,
  };
}

function checkPassed(
  result: Awaited<ReturnType<typeof evaluateAction>>,
  name: string,
): boolean | undefined {
  return result.checks.find((check) => check.name === name)?.passed;
}

describe("evaluateAction policy decision boundaries", () => {
  it("allows a payment exactly at transaction, inventory, and discount limits", async (t) => {
    t.mock.method(OrderModel, "findOne", async () => null);
    t.mock.method(ProductModel, "find", async () => [catalogProduct()]);

    const result = await evaluateAction(
      proposal({ discountPercent: 10 }),
      BASE_POLICY,
    );

    assert.equal(result.decision, "ALLOW");
    assert.equal(result.verifiedAmountInPaise, 1000);
    assert.equal(checkPassed(result, "TRANSACTION_LIMIT"), true);
    assert.equal(checkPassed(result, "INVENTORY"), true);
    assert.equal(checkPassed(result, "DISCOUNT_LIMIT"), true);
  });

  it("blocks a payment one paise above the merchant transaction limit", async (t) => {
    t.mock.method(OrderModel, "findOne", async () => null);
    t.mock.method(ProductModel, "find", async () => [
      catalogProduct({ priceInPaise: 1001, inventory: 1 }),
    ]);

    const result = await evaluateAction(
      proposal({
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        proposedAmountInPaise: 1001,
      }),
      BASE_POLICY,
    );

    assert.equal(result.decision, "BLOCK");
    assert.equal(checkPassed(result, "TRANSACTION_LIMIT"), false);
  });

  it("blocks aggregated quantities that exceed inventory", async (t) => {
    t.mock.method(OrderModel, "findOne", async () => null);
    t.mock.method(ProductModel, "find", async () => [
      catalogProduct({ priceInPaise: 100, inventory: 2 }),
    ]);

    const result = await evaluateAction(
      proposal({
        items: [
          { productId: PRODUCT_ID, quantity: 1 },
          { productId: PRODUCT_ID, quantity: 2 },
        ],
        proposedAmountInPaise: 300,
      }),
      BASE_POLICY,
    );

    assert.equal(result.decision, "BLOCK");
    assert.equal(result.verifiedAmountInPaise, 300);
    assert.equal(checkPassed(result, "INVENTORY"), false);
  });

  it("blocks discounts over the configured limit and out-of-range discounts", async (t) => {
    t.mock.method(OrderModel, "findOne", async () => null);
    t.mock.method(ProductModel, "find", async () => [
      catalogProduct({ priceInPaise: 500, inventory: 2 }),
    ]);

    const aboveLimit = await evaluateAction(
      proposal({ discountPercent: 10.01 }),
      BASE_POLICY,
    );
    assert.equal(aboveLimit.decision, "BLOCK");
    assert.equal(checkPassed(aboveLimit, "DISCOUNT_LIMIT"), false);

    const invalidDiscount = await evaluateAction(
      proposal({ discountPercent: 101 }),
      BASE_POLICY,
    );
    assert.equal(invalidDiscount.decision, "BLOCK");
    assert.equal(checkPassed(invalidDiscount, "DISCOUNT_LIMIT"), false);
  });

  it("denies a refund when refunds are disabled by policy", async (t) => {
    t.mock.method(OrderModel, "findOne", async () => null);
    t.mock.method(ProductModel, "find", async () => {
      throw new Error("Product lookup should be skipped for a denied action.");
    });

    const result = await evaluateAction(
      proposal({ action: "CREATE_REFUND" }),
      BASE_POLICY,
    );

    assert.equal(result.decision, "BLOCK");
    assert.equal(checkPassed(result, "ACTION_PERMISSION"), false);
  });

  it("reports approval as a policy requirement without changing the decision", async (t) => {
    t.mock.method(OrderModel, "findOne", async () => null);
    t.mock.method(ProductModel, "find", async () => [catalogProduct()]);

    const approvalRequired = await evaluateAction(
      proposal({ requiresApproval: false }),
      BASE_POLICY,
    );
    const noApprovalPolicy = await evaluateAction(
      proposal({ requiresApproval: true }),
      { ...BASE_POLICY, requireHumanApproval: false },
    );

    assert.equal(approvalRequired.decision, "ALLOW");
    assert.equal(approvalRequired.approvalRequired, true);
    assert.equal(noApprovalPolicy.decision, "ALLOW");
    assert.equal(noApprovalPolicy.approvalRequired, false);
  });

  it("blocks structurally invalid proposals without querying the catalog", async (t) => {
    t.mock.method(OrderModel, "findOne", async () => null);
    const findProducts = t.mock.method(ProductModel, "find", async () => []);

    const invalid = await evaluateAction(
      proposal({
        reason: "  ",
        proposedAmountInPaise: -1,
        items: [{ productId: PRODUCT_ID, quantity: 1.5 }],
      }),
      BASE_POLICY,
    );

    assert.equal(invalid.decision, "BLOCK");
    assert.equal(checkPassed(invalid, "VALID_PROPOSAL"), false);
    assert.equal(findProducts.mock.callCount(), 0);
  });
});
