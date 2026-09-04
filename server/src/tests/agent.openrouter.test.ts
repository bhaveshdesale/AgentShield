/**
 * OpenRouter / LLM integration contract tests.
 *
 * IMPORTANT:
 * These tests DO NOT call OpenRouter.
 * They mock fetch and verify that AgentShield:
 *
 * 1. sends an OpenAI-compatible chat completion request
 * 2. uses LLM_BASE_URL and LLM_MODEL
 * 3. sends the API key only in the Authorization header
 * 4. requests JSON structured output
 * 5. parses a valid structured response
 * 6. rejects malformed/unsafe LLM output
 * 7. falls back safely when the provider fails
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import {
  after,
  afterEach,
  before,
  describe,
  it,
} from "node:test";

import "../config/env";

import {
  connectDatabase,
  disconnectDatabase,
} from "../config/db";

import { ProductModel } from "../models/Product";

import {
  parseAgentOutput,
  runAgentChat,
} from "../services/agent.service";

const originalFetch = globalThis.fetch;

const originalApiKey = process.env.LLM_API_KEY;
const originalBaseUrl = process.env.LLM_BASE_URL;
const originalModel = process.env.LLM_MODEL;

const TEST_API_KEY = "test-openrouter-key";
const TEST_BASE_URL = "https://openrouter.test/api/v1";
const TEST_MODEL = "openrouter/free";

const TEST_DB_NAME = "agentshield_openrouter_test";

let productId = "";

function resolveTestUri(): string {
  const raw =
    process.env.MONGODB_TEST_URI ??
    process.env.MONGODB_URI ??
    "";

  if (raw.trim().length === 0) {
    throw new Error(
      "Set MONGODB_TEST_URI (or MONGODB_URI) to run OpenRouter tests.",
    );
  }

  /*
   * Force an isolated database so these tests never
   * touch the normal development database.
   */
  return raw.replace(
    /\/[^/?]*(\?.*)?$/,
    `/${TEST_DB_NAME}$1`,
  );
}

before(async () => {
  process.env.LLM_API_KEY = TEST_API_KEY;
  process.env.LLM_BASE_URL = TEST_BASE_URL;
  process.env.LLM_MODEL = TEST_MODEL;

  await connectDatabase(resolveTestUri());

  await ProductModel.deleteMany({});

  const product = await ProductModel.create({
    name: "Test Wireless Headphones",
    description: "Wireless headphones for testing.",
    priceInPaise: 399900,
    currency: "INR",
    category: "electronics",
    tags: [
      "wireless",
      "headphones",
      "audio",
    ],
    inventory: 10,
    frequentlyBoughtWith: [],
  });

  productId = String(product._id);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

after(async () => {
  globalThis.fetch = originalFetch;

  await ProductModel.deleteMany({});
  await disconnectDatabase();

  if (originalApiKey === undefined) {
    delete process.env.LLM_API_KEY;
  } else {
    process.env.LLM_API_KEY = originalApiKey;
  }

  if (originalBaseUrl === undefined) {
    delete process.env.LLM_BASE_URL;
  } else {
    process.env.LLM_BASE_URL = originalBaseUrl;
  }

  if (originalModel === undefined) {
    delete process.env.LLM_MODEL;
  } else {
    process.env.LLM_MODEL = originalModel;
  }
});

describe("OpenRouter LLM integration contract", () => {
  it(
    "sends an OpenAI-compatible structured-output request",
    async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      globalThis.fetch = async (
        input: string | URL | Request,
        init?: RequestInit,
      ) => {
        capturedUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        capturedInit = init;

        const body = {
          reply:
            "I found wireless headphones for you.",

          recommendations: [
            {
              productId,
              reason:
                "Matches your wireless headphone request.",
            },
          ],

          proposal: undefined,
        };

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify(body),
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      };

      const result = await runAgentChat({
        message:
          "Find wireless headphones under ₹5,000",
      });

      assert.equal(
        result.source,
        "llm",
      );

      assert.equal(
        result.proposal,
        undefined,
      );

      assert.equal(
        result.recommendations.length,
        1,
      );

      assert.equal(
        result.recommendations[0].productId,
        productId,
      );

      assert.equal(
        capturedUrl,
        `${TEST_BASE_URL}/chat/completions`,
      );

      assert.ok(capturedInit);

      assert.equal(
        capturedInit.method,
        "POST",
      );

      const headers = new Headers(
        capturedInit.headers,
      );

      assert.equal(
        headers.get("content-type"),
        "application/json",
      );

      assert.equal(
        headers.get("authorization"),
        `Bearer ${TEST_API_KEY}`,
      );

      /*
       * Verify that the API key was not placed in
       * the request body.
       */
      const rawRequestBody =
        String(capturedInit.body);

      assert.equal(
        rawRequestBody.includes(TEST_API_KEY),
        false,
      );

      const requestBody = JSON.parse(
        rawRequestBody,
      ) as {
        model: string;
        temperature: number;
        response_format: {
          type: string;
        };
        messages: unknown[];
      };

      assert.equal(
        requestBody.model,
        TEST_MODEL,
      );

      assert.equal(
        requestBody.temperature,
        0.2,
      );

      assert.deepEqual(
        requestBody.response_format,
        {
          type: "json_object",
        },
      );

      assert.ok(
        Array.isArray(
          requestBody.messages,
        ),
      );

      assert.equal(
        requestBody.messages.length,
        2,
      );
    },
  );

  it(
    "accepts a valid CREATE_PAYMENT proposal from the LLM",
    async () => {
      globalThis.fetch = async () => {
        /*
         * IMPORTANT:
         *
         * The current AgentShield parser expects the LLM
         * proposal itself to contain action: CREATE_PAYMENT.
         *
         * referenceId is intentionally NOT supplied by the LLM.
         */
        const body = {
          reply:
            "I can prepare this purchase for approval.",

          recommendations: [
            {
              productId,
              reason:
                "Matches the requested product.",
            },
          ],

          proposal: {
            action: "CREATE_PAYMENT",

            items: [
              {
                productId,
                quantity: 1,
              },
            ],

            proposedAmountInPaise: 399900,

            reason:
              "Customer explicitly requested the headphones.",

            requiresApproval: true,
          },
        };

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    JSON.stringify(body),
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type":
                "application/json",
            },
          },
        );
      };

      const result = await runAgentChat({
        message:
          "I want to buy the wireless headphones",
      });

      assert.equal(
        result.source,
        "llm",
      );

      assert.ok(
        result.proposal,
        "expected a proposal",
      );

      assert.equal(
        result.proposal?.action,
        "CREATE_PAYMENT",
      );

      assert.equal(
        result.proposal
          ?.proposedAmountInPaise,
        399900,
      );

      assert.equal(
        result.proposal
          ?.requiresApproval,
        true,
      );

      assert.equal(
        result.proposal?.items.length,
        1,
      );

      assert.equal(
        String(
          result.proposal
            ?.items[0].productId,
        ),
        productId,
      );
    },
  );

  it(
    "falls back safely when OpenRouter returns 429",
    async () => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            error: {
              message:
                "simulated rate limit",
            },
          }),
          {
            status: 429,
            headers: {
              "content-type":
                "application/json",
            },
          },
        );

      const result = await runAgentChat({
        message:
          "Find wireless headphones under ₹5,000",
      });

      assert.equal(
        result.source,
        "fallback",
      );

      assert.ok(
        result.message.length > 0,
      );

      assert.ok(
        result.recommendations.length > 0,
      );
    },
  );

  it(
    "rejects an LLM response containing an unknown product",
    () => {
      const body = {
        reply:
          "I found the perfect product.",

        recommendations: [
          {
            productId:
              "507f1f77bcf86cd799439011",
            reason: "Invented product.",
          },
        ],

        proposal: undefined,
      };

      /*
       * parseAgentOutput() is synchronous.
       * Therefore assert.throws() is required,
       * not assert.rejects().
       */
      assert.throws(
        () =>
          parseAgentOutput(
            JSON.stringify(body),
            [
              {
                productId,
                name:
                  "Test Wireless Headphones",
                category:
                  "electronics",
                tags: [
                  "wireless",
                  "headphones",
                  "audio",
                ],
                priceInPaise: 399900,
                inventory: 10,
              },
            ],
          ),
        (error: unknown) =>
          error instanceof Error &&
          error.message
            .toLowerCase()
            .includes(
              "unknown product",
            ),
      );
    },
  );

  it(
    "rejects malformed LLM JSON",
    () => {
      /*
       * parseAgentOutput() is synchronous.
       */
      assert.throws(
        () =>
          parseAgentOutput(
            "this is not valid json",
            [
              {
                productId,
                name:
                  "Test Wireless Headphones",
                category:
                  "electronics",
                tags: [
                  "wireless",
                  "headphones",
                  "audio",
                ],
                priceInPaise: 399900,
                inventory: 10,
              },
            ],
          ),
        (error: unknown) =>
          error instanceof Error &&
          error.message
            .toLowerCase()
            .includes(
              "not valid json",
            ),
      );
    },
  );

  it(
    "does not expose the API key in the agent result",
    async () => {
      globalThis.fetch = async () => {
        const body = {
          reply: "Safe response.",
          recommendations: [],
          proposal: undefined,
        };

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    JSON.stringify(body),
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type":
                "application/json",
            },
          },
        );
      };

      const result = await runAgentChat({
        message: "Hello",
      });

      const serialized =
        JSON.stringify(result);

      assert.equal(
        serialized.includes(
          TEST_API_KEY,
        ),
        false,
      );
    },
  );
});