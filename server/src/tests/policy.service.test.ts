/**
 * Policy engine tests — Milestone 3.
 *
 * Uses the real database (separate test database) via node:test + tsx.
 * Run: npm test  (see package.json)
 *
 * Required scenarios covered:
 *  1. valid transaction          -> ALLOW
 *  2. transaction over limit     -> BLOCK
 *  3. price mismatch             -> BLOCK
 *  4. insufficient inventory     -> BLOCK
 *  5. excessive discount         -> BLOCK
 *  6. unsupported action         -> BLOCK
 *  7. approval required          -> true
 *  8. duplicate transaction      -> BLOCK
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Types } from "mongoose";
// Loads server/.env so MONGODB_URI is available for the test database.
import "../config/env";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { evaluateAction } from "../services/policy.service";
import type {
  ActionProposalInput,
  MerchantPolicy,
  PolicyEvaluationResult,
} from "../types/domain";

const TEST_DB_NAME = "agentshield_policy_test";

function resolveTestUri(): string {
  const raw = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI ?? "";
  if (raw.trim().length === 0) {
    throw new Error(
      "Set MONGODB_TEST_URI (or MONGODB_URI) to run policy tests, e.g. mongodb://127.0.0.1:27017",
    );
  }
  // Force an isolated database so tests never touch dev data.
  return raw.replace(/\/[^/?]*(\?.*)?$/, `/${TEST_DB_NAME}$1`);
}

const BASE_POLICY: MerchantPolicy = {
  maxTransactionAmount: 500000, // ₹5,000 in paise
  maxDiscountPercent: 10,
  requireHumanApproval: true,
  allowRefunds: false,
  allowPayouts: false,
};

let coffeeKitId = "";
let bottleId = "";

function paymentProposal(overrides: {
  items: { productId: string; quantity: number }[];
  proposedAmountInPaise: number;
  referenceId: string;
  action?: ActionProposalInput["action"];
  discountPercent?: number;
}): ActionProposalInput {
  return {
    action: overrides.action ?? "CREATE_PAYMENT",
    items: overrides.items.map((item) => ({
      productId: new Types.ObjectId(item.productId),
      quantity: item.quantity,
    })),
    proposedAmountInPaise: overrides.proposedAmountInPaise,
    reason: "Customer requested this product",
    requiresApproval: true,
    referenceId: overrides.referenceId,
    ...(overrides.discountPercent !== undefined
      ? { discountPercent: overrides.discountPercent }
      : {}),
  };
}

before(async () => {
  await connectDatabase(resolveTestUri());

  await Promise.all([
    MerchantModel.deleteMany({}),
    ProductModel.deleteMany({}),
    OrderModel.deleteMany({}),
  ]);

  await MerchantModel.create({
    name: "Policy Test Store",
    policy: BASE_POLICY,
  });

  const coffeeKit = await ProductModel.create({
    name: "Artisan Coffee Kit",
    description: "Test product",
    priceInPaise: 179900, // ₹1,799
    currency: "INR",
    category: "coffee",
    tags: [],
    inventory: 18,
    frequentlyBoughtWith: [],
  });
  await ProductModel.create({
    name: "14-inch Business Laptop",
    description: "Test product",
    priceInPaise: 4899900, // ₹48,999
    currency: "INR",
    category: "electronics",
    tags: [],
    inventory: 4,
    frequentlyBoughtWith: [],
  });
  await ProductModel.create({
    name: "Insulated Water Bottle",
    description: "Out of stock product",
    priceInPaise: 119900,
    currency: "INR",
    category: "home",
    tags: [],
    inventory: 0,
    frequentlyBoughtWith: [],
  });

  coffeeKitId = String(coffeeKit._id);
  bottleId = String((await ProductModel.findOne({ inventory: 0 }))!._id);
});

after(async () => {
  await disconnectDatabase();
});

describe("evaluateAction", () => {
  it("1. allows a valid transaction", async () => {
    const result: PolicyEvaluationResult = await evaluateAction(
      paymentProposal({
        items: [{ productId: coffeeKitId, quantity: 1 }],
        proposedAmountInPaise: 179900,
        referenceId: "test-allow-001",
      }),
      BASE_POLICY,
    );

    assert.equal(result.decision, "ALLOW");
    assert.equal(result.verifiedAmountInPaise, 179900);
    assert.equal(result.approvalRequired, true);
    assert.ok(result.checks.every((check) => check.passed));
  });

  it("2. blocks a transaction over the merchant limit", async () => {
    const result = await evaluateAction(
      paymentProposal({
        items: [{ productId: coffeeKitId, quantity: 3 }], // 539700 > 500000
        proposedAmountInPaise: 539700,
        referenceId: "test-limit-002",
      }),
      BASE_POLICY,
    );

    assert.equal(result.decision, "BLOCK");
    const limitCheck = result.checks.find(
      (check) => check.name === "TRANSACTION_LIMIT",
    );
    assert.equal(limitCheck?.passed, false);
  });

  it("3. blocks a price mismatch between proposal and database", async () => {
    const result = await evaluateAction(
      paymentProposal({
        items: [{ productId: coffeeKitId, quantity: 1 }],
        proposedAmountInPaise: 159900, // AI claims lower price; DB says 179900
        referenceId: "test-price-003",
      }),
      BASE_POLICY,
    );

    assert.equal(result.decision, "BLOCK");
    const mismatch = result.checks.find(
      (check) => check.name === "PRICE_MISMATCH",
    );
    assert.equal(mismatch?.passed, false);
    assert.equal(result.verifiedAmountInPaise, 179900);
  });

  it("4. blocks insufficient inventory", async () => {
    const result = await evaluateAction(
      paymentProposal({
        items: [{ productId: bottleId, quantity: 1 }], // inventory = 0
        proposedAmountInPaise: 119900,
        referenceId: "test-inventory-004",
      }),
      BASE_POLICY,
    );

    assert.equal(result.decision, "BLOCK");
    const inventory = result.checks.find(
      (check) => check.name === "INVENTORY",
    );
    assert.equal(inventory?.passed, false);
  });

  it("5. blocks an excessive discount", async () => {
    const result = await evaluateAction(
      paymentProposal({
        items: [{ productId: coffeeKitId, quantity: 1 }],
        proposedAmountInPaise: 179900,
        referenceId: "test-discount-005",
        discountPercent: 50, // policy allows 10
      }),
      BASE_POLICY,
    );

    assert.equal(result.decision, "BLOCK");
    const discount = result.checks.find(
      (check) => check.name === "DISCOUNT_LIMIT",
    );
    assert.equal(discount?.passed, false);
  });

  it("6. blocks unsupported and unknown actions", async () => {
    const refundResult = await evaluateAction(
      paymentProposal({
        action: "CREATE_REFUND",
        items: [{ productId: coffeeKitId, quantity: 1 }],
        proposedAmountInPaise: 179900,
        referenceId: "test-refund-006",
      }),
      BASE_POLICY,
    );
    assert.equal(refundResult.decision, "BLOCK");
    const refundPermission = refundResult.checks.find(
      (check) => check.name === "ACTION_PERMISSION",
    );
    assert.equal(refundPermission?.passed, false);

    const unknownResult = await evaluateAction(
      paymentProposal({
        // Simulates an AI proposing an action outside the known enum.
        action: "TRANSFER_MONEY" as ActionProposalInput["action"],
        items: [{ productId: coffeeKitId, quantity: 1 }],
        proposedAmountInPaise: 179900,
        referenceId: "test-unknown-006",
      }),
      BASE_POLICY,
    );
    assert.equal(unknownResult.decision, "BLOCK");
    const unknownPermission = unknownResult.checks.find(
      (check) => check.name === "ACTION_PERMISSION",
    );
    assert.equal(unknownPermission?.passed, false);
  });

  it("7. sets approvalRequired from merchant policy, not the AI", async () => {
    const withApproval = await evaluateAction(
      paymentProposal({
        items: [{ productId: coffeeKitId, quantity: 1 }],
        proposedAmountInPaise: 179900,
        referenceId: "test-approval-007",
      }),
      BASE_POLICY,
    );
    assert.equal(withApproval.approvalRequired, true);

    const noApprovalPolicy: MerchantPolicy = {
      ...BASE_POLICY,
      requireHumanApproval: false,
    };
    const withoutApproval = await evaluateAction(
      paymentProposal({
        items: [{ productId: coffeeKitId, quantity: 1 }],
        proposedAmountInPaise: 179900,
        referenceId: "test-approval-007b",
      }),
      noApprovalPolicy,
    );
    assert.equal(withoutApproval.approvalRequired, false);
    // The AI proposal flag must not influence the requirement.
    assert.equal(withoutApproval.decision, "ALLOW");
  });

  it("8. blocks a duplicate transaction reference", async () => {
    await OrderModel.create({
      items: [
        {
          productId: new Types.ObjectId(coffeeKitId),
          quantity: 1,
          unitPriceInPaise: 179900,
        },
      ],
      amountInPaise: 179900,
      currency: "INR",
      status: "AWAITING_PAYMENT",
      referenceId: "test-duplicate-008",
    });

    const result = await evaluateAction(
      paymentProposal({
        items: [{ productId: coffeeKitId, quantity: 1 }],
        proposedAmountInPaise: 179900,
        referenceId: "test-duplicate-008",
      }),
      BASE_POLICY,
    );

    assert.equal(result.decision, "BLOCK");
    const duplicate = result.checks.find(
      (check) => check.name === "DUPLICATE_PROTECTION",
    );
    assert.equal(duplicate?.passed, false);
  });
  it("blocks zero or negative quantity", async () => {
  const zero = await evaluateAction(
    paymentProposal({
      items: [{ productId: coffeeKitId, quantity: 0 }],
      proposedAmountInPaise: 0,
      referenceId: "test-quantity-zero-010",
    }),
    BASE_POLICY,
  );

  assert.equal(zero.decision, "BLOCK");

  const negative = await evaluateAction(
    paymentProposal({
      items: [{ productId: coffeeKitId, quantity: -1 }],
      proposedAmountInPaise: -179900,
      referenceId: "test-quantity-negative-011",
    }),
    BASE_POLICY,
  );

  assert.equal(negative.decision, "BLOCK");
});

  it("blocks a missing product", async () => {
    const result = await evaluateAction(
      paymentProposal({
        items: [{ productId: "507f1f77bcf86cd799439011", quantity: 1 }],
        proposedAmountInPaise: 179900,
        referenceId: "test-missing-009",
      }),
      BASE_POLICY,
    );

    assert.equal(result.decision, "BLOCK");
    const exists = result.checks.find(
      (check) => check.name === "PRODUCT_EXISTS",
    );
    assert.equal(exists?.passed, false);
  });
});
