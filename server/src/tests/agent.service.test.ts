/**
 * Agent tests — Milestone 4.
 *
 * Covers (LLM unconfigured -> deterministic fallback, clearly labelled):
 *  1. valid shopping request produces a structured response
 *  2. purchase request produces a CREATE_PAYMENT proposal
 *  3. proposed price is not authoritative (proposal vs policy verified amount)
 *  4. malformed AI output is safely rejected
 *  5. AI output with unknown product IDs is rejected
 *  6. no payment execution tool is exposed to the agent
 *
 * Run: npm test
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
// Loads server/.env (needed for MONGODB_URI in this environment).
import "../config/env";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { ProductModel } from "../models/Product";
import {
  AGENT_TOOLS,
  parseAgentOutput,
  proposePayment,
  runAgentChat,
  searchProducts,
  type CatalogProduct,
} from "../services/agent.service";
import { evaluateAction } from "../services/policy.service";
import type { MerchantPolicy } from "../types/domain";

function resolveTestUri(): string {
  const raw = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI ?? "";
  if (raw.trim().length === 0) {
    throw new Error(
      "Set MONGODB_TEST_URI (or MONGODB_URI) to run agent tests, e.g. mongodb://127.0.0.1:27017"
    );
  }
  // Force an isolated database so tests never touch dev data.
  return raw.replace(/\/[^/?]*(\?.*)?$/, `/${TEST_DB_NAME}$1`);
}

const TEST_DB_NAME = "agentshield_agent_test";

const BASE_POLICY: MerchantPolicy = {
  maxTransactionAmount: 500000,
  maxDiscountPercent: 10,
  requireHumanApproval: true,
  allowRefunds: false,
  allowPayouts: false,
};

let coffeeKitId = "";

before(async () => {
  // Ensure the LLM path is disabled so tests exercise the deterministic
  // fallback agent (no network, no real LLM responses).
  delete process.env.LLM_API_KEY;

  await connectDatabase(resolveTestUri());

  await ProductModel.deleteMany({});
  const coffeeKit = await ProductModel.create({
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
    name: "Ceramic Mug Set",
    description: "Set of two mugs.",
    priceInPaise: 89900,
    currency: "INR",
    category: "coffee",
    tags: ["gift", "home"],
    inventory: 40,
    frequentlyBoughtWith: [],
  });
  coffeeKitId = String(coffeeKit._id);
});

after(async () => {
  await disconnectDatabase();
});

function buildCatalog(): CatalogProduct[] {
  return [
    {
      productId: coffeeKitId,
      name: "Artisan Coffee Kit",
      category: "coffee",
      tags: ["gift", "coffee"],
      priceInPaise: 179900,
      inventory: 18,
    },
  ];
}

describe("agent (deterministic fallback, LLM unconfigured)", () => {
  it("1. produces a structured response for a valid shopping request", async () => {
    const result = await runAgentChat({
      message: "I need a coffee gift under 2500",
    });

    assert.equal(result.source, "fallback");
    assert.ok(result.conversationId.length > 0);
    assert.ok(result.message.length > 0);
    assert.ok(result.recommendations.length > 0);
    assert.equal(result.proposal, undefined);
    for (const rec of result.recommendations) {
      assert.ok(rec.productId.length > 0);
      assert.ok(rec.reason.length > 0);
      assert.ok(rec.priceInPaise > 0);
    }
  });

  it("2. produces a CREATE_PAYMENT proposal for a purchase request", async () => {
    const result = await runAgentChat({ message: "Buy the Artisan Coffee Kit" });

    assert.ok(result.proposal, "expected a proposal");
    assert.equal(result.proposal.action, "CREATE_PAYMENT");
    assert.equal(result.proposal.proposedAmountInPaise, 179900);
    assert.equal(result.proposal.requiresApproval, true);
    assert.equal(result.proposal.items.length, 1);
    assert.equal(String(result.proposal.items[0].productId), coffeeKitId);
    // The AI requires approval; the policy engine enforces it independently.
    const policy = await evaluateAction(result.proposal, BASE_POLICY);
    assert.equal(policy.decision, "ALLOW");
    assert.equal(policy.approvalRequired, true);
  });

  it("3. does not treat the proposed price as authoritative", async () => {
    // Build a proposal, then corrupt the proposed amount the way a malicious
    // or buggy AI could. The policy engine must recompute from MongoDB.
    const proposal = await proposePayment(
      [{ productId: coffeeKitId, quantity: 1 }],
      "Customer requested the coffee kit."
    );
    assert.equal(proposal.proposedAmountInPaise, 179900);

    const tampered = { ...proposal, proposedAmountInPaise: 99900 };
    const policy = await evaluateAction(tampered, BASE_POLICY);

    assert.equal(policy.decision, "BLOCK");
    const mismatch = policy.checks.find((c) => c.name === "PRICE_MISMATCH");
    assert.equal(mismatch?.passed, false);
    // Server-verified amount comes from MongoDB, not the proposal.
    assert.equal(policy.verifiedAmountInPaise, 179900);
  });

  it("4. safely rejects malformed AI output", () => {
    const catalog = buildCatalog();

    assert.throws(
      () => parseAgentOutput("this is not json at all", catalog),
      (error: unknown) =>
        error instanceof Error && error.message.includes("not valid JSON")
    );

    assert.throws(
      () =>
        parseAgentOutput(
          JSON.stringify({ reply: "hi", recommendations: "oops", proposal: null }),
          catalog
        ),
      (error: unknown) => error instanceof Error && error.message.includes("recommendations")
    );
  });

  it("5. rejects AI output containing unknown product IDs", () => {
    const catalog = buildCatalog();

    assert.throws(
      () =>
        parseAgentOutput(
          JSON.stringify({
            reply: "Sure!",
            recommendations: [
              { productId: "507f1f77bcf86cd799439011", reason: "invented" },
            ],
            proposal: null,
          }),
          catalog
        ),
      (error: unknown) => error instanceof Error && error.message.includes("unknown product")
    );

    assert.throws(
      () =>
        parseAgentOutput(
          JSON.stringify({
            reply: "Sure!",
            recommendations: [],
            proposal: {
              action: "CREATE_PAYMENT",
              items: [{ productId: "deadbeefdeadbeefdeadbeef", quantity: 1 }],
              proposedAmountInPaise: 179900,
              reason: "hallucinated product",
              requiresApproval: true,
            },
          }),
          catalog
        ),
      (error: unknown) => error instanceof Error && error.message.includes("unknown product")
    );
  });

  it("6. exposes no payment execution tool to the agent", () => {
    // The agent's tool set must contain proposal-only tools. There is no
    // createPayment/executePayment/anything-that-moves-money tool.
    assert.deepEqual([...AGENT_TOOLS].sort(), [
      "getProduct",
      "proposePayment",
      "recommendProducts",
      "searchProducts",
    ]);
    assert.ok(!AGENT_TOOLS.includes("createPayment" as (typeof AGENT_TOOLS)[number]));
    // proposePayment only builds a proposal; it creates no order and no
    // payment. Its output feeds the policy engine, which never executes.
  });

  it("searches the catalog deterministically", async () => {
    const results = await searchProducts("coffee gift");
    assert.ok(results.length > 0);
    assert.ok(results.some((p) => String(p.productId) === coffeeKitId));
  });
});
