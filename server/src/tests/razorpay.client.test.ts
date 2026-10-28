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

  it("maps provider errors and rejects malformed payment-link responses", async () =>
    withTestCredentials(async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            error: { code: "BAD_REQUEST", description: "private provider detail" },
          }),
          { status: 400 },
        );

      try {
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

        globalThis.fetch = async () =>
          new Response(JSON.stringify({ id: "plink_missing_url" }), {
            status: 200,
          });
        await assert.rejects(
          () =>
            createRazorpayPaymentLink({
              amountInPaise: 100,
              referenceId: "client-test-004",
              description: "Malformed response",
            }),
          (error: unknown) =>
            error instanceof AppError &&
            error.code === "RAZORPAY_ERROR",
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
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
});
