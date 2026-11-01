import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseAgentOutput,
  type AgentLlmOutput,
} from "../services/agent.service";
import type { CatalogProduct } from "../services/agent-catalog.service";
import { AppError } from "../utils/AppError";

const catalog: CatalogProduct[] = [
  {
    productId: "catalog-product-1",
    name: "First product",
    category: "test",
    tags: ["first"],
    priceInPaise: 12500,
    inventory: 4,
  },
  {
    productId: "catalog-product-2",
    name: "Second product",
    category: "test",
    tags: ["second"],
    priceInPaise: 25000,
    inventory: 2,
  },
];

function assertParserError(
  raw: string,
  code: "AI_MALFORMED_OUTPUT" | "AI_UNKNOWN_PRODUCT",
): void {
  assert.throws(
    () => parseAgentOutput(raw, catalog),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 502 &&
      error.code === code,
  );
}

describe("parseAgentOutput", () => {
  it("parses structured output, normalizes proposal fields, and caps recommendations at five", () => {
    const raw = JSON.stringify({
      reply: "Ready to prepare this purchase.",
      recommendations: Array.from({ length: 6 }, (_, index) => ({
        productId: index % 2 === 0 ? catalog[0].productId : catalog[1].productId,
        reason: `Match ${index + 1}`,
        ignored: true,
      })),
      proposal: {
        action: "CREATE_PAYMENT",
        items: [
          { productId: catalog[0].productId, quantity: 2, ignored: true },
        ],
        proposedAmountInPaise: 25000,
        reason: "Customer requested the first product.",
        requiresApproval: false,
        ignored: true,
      },
      ignored: true,
    });

    const result: AgentLlmOutput = parseAgentOutput(raw, catalog);

    assert.deepEqual(result, {
      reply: "Ready to prepare this purchase.",
      recommendations: [
        { productId: catalog[0].productId, reason: "Match 1" },
        { productId: catalog[1].productId, reason: "Match 2" },
        { productId: catalog[0].productId, reason: "Match 3" },
        { productId: catalog[1].productId, reason: "Match 4" },
        { productId: catalog[0].productId, reason: "Match 5" },
      ],
      proposal: {
        items: [{ productId: catalog[0].productId, quantity: 2 }],
        proposedAmountInPaise: 25000,
        reason: "Customer requested the first product.",
        requiresApproval: false,
      },
    });
  });

  it("accepts fenced JSON and an absent or null proposal", () => {
    for (const proposal of [undefined, null]) {
      const result = parseAgentOutput(
        `\`\`\`json\n${JSON.stringify({
          reply: "Catalog results are ready.",
          recommendations: [],
          proposal,
        })}\n\`\`\``,
        catalog,
      );

      assert.equal(result.reply, "Catalog results are ready.");
      assert.deepEqual(result.recommendations, []);
      assert.equal(result.proposal, undefined);
    }
  });

  it("rejects malformed JSON and non-object JSON with AI_MALFORMED_OUTPUT", () => {
    assertParserError("not-json", "AI_MALFORMED_OUTPUT");
    assertParserError("[]", "AI_MALFORMED_OUTPUT");
    assertParserError("null", "AI_MALFORMED_OUTPUT");
  });

  it("rejects missing or blank required reply text", () => {
    assertParserError(
      JSON.stringify({ recommendations: [] }),
      "AI_MALFORMED_OUTPUT",
    );
    assertParserError(
      JSON.stringify({ reply: "  ", recommendations: [] }),
      "AI_MALFORMED_OUTPUT",
    );
  });

  it("rejects malformed recommendation entries and unknown catalog products", () => {
    assertParserError(
      JSON.stringify({ reply: "Hello.", recommendations: [null] }),
      "AI_MALFORMED_OUTPUT",
    );
    assertParserError(
      JSON.stringify({
        reply: "Hello.",
        recommendations: [{ productId: catalog[0].productId }],
      }),
      "AI_MALFORMED_OUTPUT",
    );
    assertParserError(
      JSON.stringify({
        reply: "Hello.",
        recommendations: [
          { productId: "unknown-product", reason: "Invented" },
        ],
      }),
      "AI_UNKNOWN_PRODUCT",
    );
  });

  it("rejects unsupported proposal actions and incomplete proposal items", () => {
    assertParserError(
      JSON.stringify({
        reply: "I can help.",
        recommendations: [],
        proposal: { action: "CREATE_REFUND" },
      }),
      "AI_MALFORMED_OUTPUT",
    );
    assertParserError(
      JSON.stringify({
        reply: "I can help.",
        recommendations: [],
        proposal: {
          action: "CREATE_PAYMENT",
          items: [],
        },
      }),
      "AI_MALFORMED_OUTPUT",
    );
    assertParserError(
      JSON.stringify({
        reply: "I can help.",
        recommendations: [],
        proposal: {
          action: "CREATE_PAYMENT",
          items: [{ productId: catalog[0].productId, quantity: 1.5 }],
          proposedAmountInPaise: 12500,
          reason: "Customer request.",
        },
      }),
      "AI_MALFORMED_OUTPUT",
    );
  });

  it("accepts zero proposal amount but rejects negative or fractional amounts", () => {
    const base = {
      reply: "Proposal prepared.",
      recommendations: [],
      proposal: {
        action: "CREATE_PAYMENT",
        items: [{ productId: catalog[0].productId, quantity: 1 }],
        proposedAmountInPaise: 0,
        reason: "Boundary amount.",
      },
    };
    assert.equal(
      parseAgentOutput(JSON.stringify(base), catalog).proposal
        ?.proposedAmountInPaise,
      0,
    );

    for (const amount of [-1, 0.5, "12500"]) {
      assertParserError(
        JSON.stringify({
          ...base,
          proposal: { ...base.proposal, proposedAmountInPaise: amount },
        }),
        "AI_MALFORMED_OUTPUT",
      );
    }
  });
});
