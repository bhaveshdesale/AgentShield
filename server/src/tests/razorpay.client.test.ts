import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRazorpayPaymentLink,
  lookupRazorpayPaymentLink,
} from "../services/razorpay.client";
import { AppError } from "../utils/AppError";

const credentialNames = [
  "NODE_ENV",
  "RAZORPAY_MODE",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
] as const;

async function withTestCredentials<T>(
  run: () => Promise<T>,
): Promise<T> {
  const original = Object.fromEntries(
    credentialNames.map((name) => [name, process.env[name]]),
  );
  process.env.NODE_ENV = "test";
  process.env.RAZORPAY_MODE = "test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_client_dummy";
  process.env.RAZORPAY_KEY_SECRET = "client-dummy-secret";

  try {
    return await run();
  } finally {
    for (const name of credentialNames) {
      const value = original[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

describe("Razorpay client", () => {
  it("constructs a payment-link request using configured credentials", async () =>
    withTestCredentials(async () => {
      const originalFetch = globalThis.fetch;
      let requestUrl = "";
      let requestInit: RequestInit | undefined;
      globalThis.fetch = async (input, init) => {
        requestUrl = input instanceof URL ? input.toString() : String(input);
        requestInit = init;
        return new Response(
          JSON.stringify({
            id: "plink_client_test",
            short_url: "https://rzp.test/plink_client_test",
            status: "created",
          }),
          { status: 200 },
        );
      };

      try {
        const link = await createRazorpayPaymentLink({
          amountInPaise: 12500,
          referenceId: "client-test-001",
          description: "Client request test",
          callbackUrl: "https://example.test/payments/order-1",
        });

        assert.deepEqual(link, {
          id: "plink_client_test",
          short_url: "https://rzp.test/plink_client_test",
          status: "created",
        });
        assert.equal(
          requestUrl,
          "https://api.razorpay.com/v1/payment_links",
        );
        assert.equal(requestInit?.method, "POST");
        const headers = new Headers(requestInit?.headers);
        assert.equal(headers.get("Content-Type"), "application/json");
        assert.equal(
          Buffer.from(
            headers.get("Authorization")!.slice("Basic ".length),
            "base64",
          ).toString("utf8"),
          "rzp_test_client_dummy:client-dummy-secret",
        );
        assert.deepEqual(JSON.parse(String(requestInit?.body)), {
          amount: 12500,
          currency: "INR",
          accept_partial: false,
          reference_id: "client-test-001",
          description: "Client request test",
          callback_url: "https://example.test/payments/order-1",
          callback_method: "get",
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    }));

  it("rejects invalid payment-link inputs before making a provider request", async () =>
    withTestCredentials(async () => {
      const originalFetch = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return new Response();
      };

      try {
        await assert.rejects(
          () =>
            createRazorpayPaymentLink({
              amountInPaise: 100,
              referenceId: " ".repeat(1),
              description: "Invalid reference",
            }),
          (error: unknown) =>
            error instanceof AppError &&
            error.code === "INVALID_REFERENCE_ID",
        );
        await assert.rejects(
          () =>
            createRazorpayPaymentLink({
              amountInPaise: 99,
              referenceId: "client-test-002",
              description: "Invalid amount",
            }),
          (error: unknown) =>
            error instanceof AppError &&
            error.code === "INVALID_PAYMENT_AMOUNT",
        );
        assert.equal(calls, 0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }));

  it("classifies a documented BAD_REQUEST_ERROR response as a definitive rejection", async (context) =>
    withTestCredentials(async () => {
      context.mock.method(globalThis, "fetch", async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "BAD_REQUEST_ERROR",
              field: "amount",
              description: "private provider detail",
            },
          }),
          { status: 400 },
        ),
      );

      await assert.rejects(
        () =>
          createRazorpayPaymentLink({
            amountInPaise: 100,
            referenceId: "client-test-003",
            description: "Provider rejection",
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "RAZORPAY_ERROR" &&
          !error.message.includes("private provider detail"),
      );
    }));

  it("keeps duplicate-reference errors uncertain because a link may already exist", async (context) =>
    withTestCredentials(async () => {
      context.mock.method(globalThis, "fetch", async () =>
        Response.json(
          {
            error: {
              code: "BAD_REQUEST_ERROR",
              field: "reference_id",
              description: "reference_id must be unique",
            },
          },
          { status: 400 },
        ),
      );

      await assert.rejects(
        () =>
          createRazorpayPaymentLink({
            amountInPaise: 100,
            referenceId: "client-test-012",
            description: "Duplicate reference",
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "RAZORPAY_OUTCOME_UNKNOWN",
      );
    }));

  it("classifies an HTTP 5xx response as an uncertain outcome", async (context) =>
    withTestCredentials(async () => {
      context.mock.method(globalThis, "fetch", async () =>
        Response.json(
          { error: { code: "SERVER_ERROR" } },
          { status: 500 },
        ),
      );

      await assert.rejects(
        () =>
          createRazorpayPaymentLink({
            amountInPaise: 100,
            referenceId: "client-test-005",
            description: "Server error",
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "RAZORPAY_OUTCOME_UNKNOWN",
      );
    }));

  it("classifies a non-final HTTP 202 response as an uncertain outcome", async (context) =>
    withTestCredentials(async () => {
      context.mock.method(globalThis, "fetch", async () =>
        Response.json(
          {
            id: "plink_accepted",
            short_url: "https://rzp.test/plink_accepted",
            status: "created",
          },
          { status: 202 },
        ),
      );

      await assert.rejects(
        () =>
          createRazorpayPaymentLink({
            amountInPaise: 100,
            referenceId: "client-test-011",
            description: "Non-final response",
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "RAZORPAY_OUTCOME_UNKNOWN",
      );
    }));

  it("classifies other HTTP error responses as uncertain", async (context) =>
    withTestCredentials(async () => {
      context.mock.method(globalThis, "fetch", async () =>
        Response.json(
          { error: { code: "RATE_LIMIT_ERROR" } },
          { status: 429 },
        ),
      );

      await assert.rejects(
        () =>
          createRazorpayPaymentLink({
            amountInPaise: 100,
            referenceId: "client-test-006",
            description: "Rate limit",
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "RAZORPAY_OUTCOME_UNKNOWN",
      );
    }));

  it("classifies a network failure as an uncertain outcome", async (context) =>
    withTestCredentials(async () => {
      context.mock.method(globalThis, "fetch", async () => {
        throw new TypeError("Connection reset");
      });

      await assert.rejects(
        () =>
          createRazorpayPaymentLink({
            amountInPaise: 100,
            referenceId: "client-test-007",
            description: "Network failure",
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "RAZORPAY_OUTCOME_UNKNOWN",
      );
    }));

  it("classifies a timed out request as an uncertain outcome", async (context) =>
    withTestCredentials(async () => {
      context.mock.method(globalThis, "fetch", async () => {
        const error = new Error("Request timed out");
        error.name = "AbortError";
        throw error;
      });

      await assert.rejects(
        () =>
          createRazorpayPaymentLink({
            amountInPaise: 100,
            referenceId: "client-test-008",
            description: "Timeout",
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.statusCode === 504 &&
          error.code === "RAZORPAY_OUTCOME_UNKNOWN",
      );
    }));

  it("classifies malformed successful responses as uncertain", async (context) =>
    withTestCredentials(async () => {
      context.mock.method(globalThis, "fetch", async () =>
        new Response("{", { status: 200 }),
      );

      await assert.rejects(
        () =>
          createRazorpayPaymentLink({
            amountInPaise: 100,
            referenceId: "client-test-009",
            description: "Malformed response",
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "RAZORPAY_OUTCOME_UNKNOWN",
      );
    }));

  it("classifies incomplete successful responses as uncertain", async (context) =>
    withTestCredentials(async () => {
      context.mock.method(globalThis, "fetch", async () =>
        Response.json({ id: "plink_missing_url" }),
      );

      await assert.rejects(
        () =>
          createRazorpayPaymentLink({
            amountInPaise: 100,
            referenceId: "client-test-010",
            description: "Incomplete response",
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "RAZORPAY_OUTCOME_UNKNOWN",
      );
    }));

  it("looks up links by encoded ID or reference and treats a missing ID as absent", async () =>
    withTestCredentials(async () => {
      const originalFetch = globalThis.fetch;
      const urls: string[] = [];
      globalThis.fetch = async (input) => {
        const url = input instanceof URL ? input.toString() : String(input);
        urls.push(url);
        if (url.endsWith("/payment_links/plink%2Fencoded")) {
          return new Response(
            JSON.stringify({
              id: "plink/encoded",
              short_url: "https://rzp.test/plink/encoded",
              status: "created",
            }),
            { status: 200 },
          );
        }
        if (url.includes("reference_id=")) {
          return new Response(
            JSON.stringify({
              payment_links: [
                {
                  id: "plink_by_reference",
                  short_url: "https://rzp.test/plink_by_reference",
                  status: "created",
                  reference_id: "ref with spaces",
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response("", { status: 404 });
      };

      try {
        const byId = await lookupRazorpayPaymentLink({
          paymentLinkId: "plink/encoded",
        });
        const byReference = await lookupRazorpayPaymentLink({
          referenceId: "ref with spaces",
        });
        const missing = await lookupRazorpayPaymentLink({
          paymentLinkId: "missing",
        });

        assert.equal(byId?.id, "plink/encoded");
        assert.equal(byReference?.id, "plink_by_reference");
        assert.equal(missing, null);
        assert.deepEqual(urls, [
          "https://api.razorpay.com/v1/payment_links/plink%2Fencoded",
          "https://api.razorpay.com/v1/payment_links?reference_id=ref%20with%20spaces",
          "https://api.razorpay.com/v1/payment_links/missing",
        ]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }));

  it("does not treat incomplete, mismatched, or ambiguous reference lookups as absence", async (context) =>
    withTestCredentials(async () => {
      const responses = [
        Response.json({}),
        Response.json({
          payment_links: [{
            id: "plink_other_reference",
            short_url: "https://rzp.test/plink_other_reference",
            status: "created",
            reference_id: "another-reference",
          }],
        }),
        Response.json({
          payment_links: [
            {
              id: "plink_first",
              short_url: "https://rzp.test/plink_first",
              status: "created",
              reference_id: "expected-reference",
            },
            {
              id: "plink_second",
              short_url: "https://rzp.test/plink_second",
              status: "created",
              reference_id: "expected-reference",
            },
          ],
        }),
      ];
      let responseIndex = 0;
      context.mock.method(globalThis, "fetch", async () =>
        responses[responseIndex++],
      );

      for (let index = 0; index < responses.length; index += 1) {
        await assert.rejects(
          () =>
            lookupRazorpayPaymentLink({
              referenceId: "expected-reference",
            }),
          (error: unknown) =>
            error instanceof AppError &&
            error.code === "RAZORPAY_ERROR",
        );
      }
    }));
});
