/**
 * Safety Simulation tests — Milestone 8.
 *
 * Covers all 10 predefined AgentShield safety scenarios:
 *
 * 1. Valid Transaction          -> ALLOW
 * 2. Spending Limit Violation   -> BLOCK
 * 3. Price Mismatch             -> BLOCK
 * 4. Excessive Discount         -> BLOCK
 * 5. Duplicate Payment          -> BLOCK
 * 6. Missing Inventory           -> BLOCK
 * 7. Unauthorized Action         -> BLOCK
 * 8. Malformed AI Output         -> REJECTED
 * 9. Payment Timeout             -> UNKNOWN
 * 10. Recovery                   -> RECOVERED
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import "../config/env";

import {
  connectDatabase,
  disconnectDatabase,
} from "../config/db";

import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";

import {
  runSimulation,
  SIMULATION_SCENARIOS,
} from "../services/simulation.service";

const TEST_DB_NAME = "agentshield_simulation_test";

function resolveTestUri(): string {
  const raw =
    process.env.MONGODB_TEST_URI ??
    process.env.MONGODB_URI ??
    "";

  if (raw.trim().length === 0) {
    throw new Error(
      "Set MONGODB_TEST_URI (or MONGODB_URI) to run simulation tests.",
    );
  }

  return raw.replace(
    /\/[^/?]*(\?.*)?$/,
    `/${TEST_DB_NAME}$1`,
  );
}

describe("AgentShield safety simulations", () => {
  before(async () => {
    await connectDatabase(resolveTestUri());
  });

  beforeEach(async () => {
    await Promise.all([
      MerchantModel.deleteMany({}),
      OrderModel.deleteMany({}),
      ProductModel.deleteMany({}),
    ]);

    await MerchantModel.create({
      name: "Simulation Test Store",

      policy: {
        maxTransactionAmount: 500000,
        maxDiscountPercent: 10,
        requireHumanApproval: true,
        allowRefunds: false,
        allowPayouts: false,
      },
    });

    await ProductModel.create({
      name: "Artisan Coffee Kit",
      description: "Pour-over starter kit gift set.",
      priceInPaise: 179900,
      currency: "INR",
      category: "coffee",
      tags: ["gift", "coffee", "starter-kit"],
      inventory: 18,
      frequentlyBoughtWith: [],
    });

    await ProductModel.create({
      name: "14-inch Business Laptop",
      description: "Business laptop for testing.",
      priceInPaise: 4899900,
      currency: "INR",
      category: "electronics",
      tags: ["laptop", "business"],
      inventory: 4,
      frequentlyBoughtWith: [],
    });

    await ProductModel.create({
      name: "Insulated Water Bottle",
      description: "Out of stock product.",
      priceInPaise: 119900,
      currency: "INR",
      category: "home",
      tags: ["bottle"],
      inventory: 0,
      frequentlyBoughtWith: [],
    });
  });

  after(async () => {
    await disconnectDatabase();
  });

  it("contains exactly the 10 required SRS scenarios", () => {
    assert.equal(
      SIMULATION_SCENARIOS.length,
      10,
    );

    assert.deepEqual(
      SIMULATION_SCENARIOS.map(
        (scenario) => ({
          id: scenario.id,
          name: scenario.name,
        }),
      ),
      [
        {
          id: 1,
          name: "Valid Transaction",
        },
        {
          id: 2,
          name: "Spending Limit Violation",
        },
        {
          id: 3,
          name: "Price Mismatch",
        },
        {
          id: 4,
          name: "Excessive Discount",
        },
        {
          id: 5,
          name: "Duplicate Payment",
        },
        {
          id: 6,
          name: "Missing Inventory",
        },
        {
          id: 7,
          name: "Unauthorized Action",
        },
        {
          id: 8,
          name: "Malformed AI Output",
        },
        {
          id: 9,
          name: "Payment Timeout",
        },
        {
          id: 10,
          name: "Recovery",
        },
      ],
    );
  });

  it("1. Valid Transaction -> ALLOW", async () => {
    const result = await runSimulation(1);

    assert.equal(
      result.scenario.id,
      1,
    );

    assert.equal(
      result.scenario.name,
      "Valid Transaction",
    );

    assert.equal(
      result.expected,
      "ALLOW",
    );

    const policyResult =
      result.result as {
        decision: string;
        verifiedAmountInPaise: number;
      };

    assert.equal(
      policyResult.decision,
      "ALLOW",
    );

    assert.equal(
      policyResult.verifiedAmountInPaise,
      179900,
    );
  });

  it("2. Spending Limit Violation -> BLOCK", async () => {
    const result = await runSimulation(2);

    assert.equal(
      result.scenario.id,
      2,
    );

    assert.equal(
      result.scenario.name,
      "Spending Limit Violation",
    );

    assert.equal(
      result.expected,
      "BLOCK",
    );

    const policyResult =
      result.result as {
        decision: string;
      };

    assert.equal(
      policyResult.decision,
      "BLOCK",
    );
  });

  it("3. Price Mismatch -> BLOCK", async () => {
    const result = await runSimulation(3);

    assert.equal(
      result.scenario.id,
      3,
    );

    assert.equal(
      result.scenario.name,
      "Price Mismatch",
    );

    assert.equal(
      result.expected,
      "BLOCK",
    );

    const policyResult =
      result.result as {
        decision: string;
        verifiedAmountInPaise: number;
      };

    assert.equal(
      policyResult.decision,
      "BLOCK",
    );

    assert.equal(
      policyResult.verifiedAmountInPaise,
      179900,
    );
  });

  it("4. Excessive Discount -> BLOCK", async () => {
    const result = await runSimulation(4);

    assert.equal(
      result.scenario.id,
      4,
    );

    assert.equal(
      result.scenario.name,
      "Excessive Discount",
    );

    assert.equal(
      result.expected,
      "BLOCK",
    );

    const policyResult =
      result.result as {
        decision: string;
      };

    assert.equal(
      policyResult.decision,
      "BLOCK",
    );
  });

  it("5. Duplicate Payment -> BLOCK", async () => {
    const result = await runSimulation(5);

    assert.equal(
      result.scenario.id,
      5,
    );

    assert.equal(
      result.scenario.name,
      "Duplicate Payment",
    );

    assert.equal(
      result.expected,
      "BLOCK",
    );

    const policyResult =
      result.result as {
        decision: string;
      };

    assert.equal(
      policyResult.decision,
      "BLOCK",
    );
  });

  it("6. Missing Inventory -> BLOCK", async () => {
    const result = await runSimulation(6);

    assert.equal(
      result.scenario.id,
      6,
    );

    assert.equal(
      result.scenario.name,
      "Missing Inventory",
    );

    assert.equal(
      result.expected,
      "BLOCK",
    );

    const policyResult =
      result.result as {
        decision: string;
      };

    assert.equal(
      policyResult.decision,
      "BLOCK",
    );
  });

  it("7. Unauthorized Action -> BLOCK", async () => {
    const result = await runSimulation(7);

    assert.equal(
      result.scenario.id,
      7,
    );

    assert.equal(
      result.scenario.name,
      "Unauthorized Action",
    );

    assert.equal(
      result.expected,
      "BLOCK",
    );

    const policyResult =
      result.result as {
        decision: string;
      };

    assert.equal(
      policyResult.decision,
      "BLOCK",
    );
  });

  it("8. Malformed AI Output -> REJECTED", async () => {
    const result = await runSimulation(8);

    assert.equal(
      result.scenario.id,
      8,
    );

    assert.equal(
      result.scenario.name,
      "Malformed AI Output",
    );

    assert.equal(
      result.expected,
      "REJECTED",
    );

    const simulationResult =
      result.result as {
        rejected: boolean;
        errorCode: string;
      };

    assert.equal(
      simulationResult.rejected,
      true,
    );

    assert.equal(
      simulationResult.errorCode,
      "AI_MALFORMED_OUTPUT",
    );
  });

  it("9. Payment Timeout -> UNKNOWN", async () => {
    const result = await runSimulation(9);

    assert.equal(
      result.scenario.id,
      9,
    );

    assert.equal(
      result.scenario.name,
      "Payment Timeout",
    );

    assert.equal(
      result.expected,
      "UNKNOWN",
    );

    const simulationResult =
      result.result as {
        state: string;
        action: string;
        reason: string;
      };

    assert.equal(
      simulationResult.state,
      "UNKNOWN",
    );

    assert.equal(
      simulationResult.action,
      "NO_RETRY_UNTIL_STATUS_VERIFIED",
    );

    assert.ok(
      simulationResult.reason.includes(
        "Razorpay timeout",
      ),
    );
  });

  it("10. Recovery -> RECOVERED", async () => {
    const result = await runSimulation(10);

    assert.equal(
      result.scenario.id,
      10,
    );

    assert.equal(
      result.scenario.name,
      "Recovery",
    );

    assert.equal(
      result.expected,
      "RECOVERED",
    );

    const simulationResult =
      result.result as {
        state: string;
        action: string;
        reason: string;
      };

    assert.equal(
      simulationResult.state,
      "RECOVERED",
    );

    assert.equal(
      simulationResult.action,
      "REUSE_EXISTING_PAYMENT_OR_SAFE_RETRY",
    );

    assert.ok(
      simulationResult.reason.includes(
        "recovery",
      ),
    );
  });

  it("rejects an invalid scenario ID", async () => {
    await assert.rejects(
      () => runSimulation(0),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes(
          "scenarioId must be between 1 and 10",
        ),
    );

    await assert.rejects(
      () => runSimulation(11),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes(
          "scenarioId must be between 1 and 10",
        ),
    );
  });
});