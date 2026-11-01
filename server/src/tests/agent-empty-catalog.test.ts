import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { ProductModel } from "../models/Product";
import { runAgentChat } from "../services/agent.service";

const originalLlmEnvironment = {
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_BASE_URL: process.env.LLM_BASE_URL,
  LLM_MODEL: process.env.LLM_MODEL,
};
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(originalLlmEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("agent behavior with no catalog candidates", () => {
  it("uses the deterministic fallback without calling the provider when LLM is unconfigured", async (t) => {
    process.env.LLM_API_KEY = "";
    let catalogQuery: unknown;
    t.mock.method(ProductModel, "find", (query: unknown) => {
      catalogQuery = query;
      return {
        limit: async () => [],
      };
    });
    const fetch = t.mock.method(globalThis, "fetch", async () =>
      new Response("unexpected provider request", { status: 500 }),
    );

    const result = await runAgentChat({
      message: "Show me a product",
      conversationId: "empty-catalog-conversation",
    });

    assert.deepEqual(catalogQuery, {
      $or: [
        { name: { $regex: "show|product", $options: "i" } },
        { tags: { $regex: "show|product", $options: "i" } },
        { category: { $regex: "show|product", $options: "i" } },
      ],
    });
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(result.source, "fallback");
    assert.equal(result.conversationId, "empty-catalog-conversation");
    assert.deepEqual(result.recommendations, []);
    assert.equal(result.proposal, undefined);
    assert.match(result.message, /could not find catalog products/i);
  });

  it("returns no candidates when catalog matches are all outside the requested budget", async (t) => {
    process.env.LLM_API_KEY = "";
    t.mock.method(ProductModel, "find", () => ({
      limit: async () => [
        {
          _id: "product-over-budget",
          name: "Expensive product",
          category: "electronics",
          tags: ["premium"],
          priceInPaise: 500000,
          inventory: 4,
        },
      ],
    }));

    const result = await runAgentChat({
      message: "Show me electronics under 100",
      conversationId: "budget-filter-conversation",
    });

    assert.equal(result.source, "fallback");
    assert.deepEqual(result.recommendations, []);
    assert.equal(result.proposal, undefined);
    assert.match(result.message, /could not find catalog products/i);
  });

  it("still calls the configured provider with an empty catalog", async (t) => {
    process.env.LLM_API_KEY = "test-agent-key";
    process.env.LLM_BASE_URL = "https://llm.example.test/v1";
    process.env.LLM_MODEL = "test-model";
    t.mock.method(ProductModel, "find", () => ({
      limit: async () => [],
    }));

    let requestBody = "";
    const fetch = t.mock.method(
      globalThis,
      "fetch",
      async (_input: string | URL | Request, init?: RequestInit) => {
        requestBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply: "The catalog is empty.",
                    recommendations: [],
                    proposal: null,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    const result = await runAgentChat({
      message: "Show me a product",
      conversationId: "configured-empty-catalog",
    });

    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(result.source, "llm");
    assert.equal(result.message, "The catalog is empty.");
    assert.deepEqual(result.recommendations, []);
    assert.equal(result.proposal, undefined);
    const request = JSON.parse(requestBody) as {
      messages: Array<{ content: string }>;
    };
    assert.ok(request.messages[0].content.includes("CATALOG JSON:\n[]"));
  });
});
