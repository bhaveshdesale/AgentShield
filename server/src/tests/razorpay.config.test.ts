import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getRazorpayCredentials,
  getRazorpayMode,
  getRazorpayWebhookSecret,
} from "../config/razorpay";
import { createRazorpayPaymentLink } from "../services/razorpay.client";
import { AppError } from "../utils/AppError";

function assertConfigError(action: () => unknown): void {
  assert.throws(action, (error: unknown) =>
    error instanceof AppError &&
    error.code === "RAZORPAY_CONFIGURATION_INVALID",
  );
}

describe("Razorpay mode configuration", () => {
  it("defaults to test mode outside production", () => {
    assert.equal(getRazorpayMode({ NODE_ENV: "development" }), "test");
  });

  it("accepts test credentials with a test key ID", () => {
    assert.deepEqual(
      getRazorpayCredentials({
        NODE_ENV: "test",
        RAZORPAY_MODE: "test",
        RAZORPAY_KEY_ID: "rzp_test_dummy",
        RAZORPAY_KEY_SECRET: "opaque-dummy-secret",
      }),
      {
        keyId: "rzp_test_dummy",
        keySecret: "opaque-dummy-secret",
      },
    );
  });

  it("rejects live-style credentials in test mode", () => {
    assertConfigError(() =>
      getRazorpayCredentials({
        NODE_ENV: "development",
        RAZORPAY_MODE: "test",
        RAZORPAY_KEY_ID: "rzp_live_dummy",
        RAZORPAY_KEY_SECRET: "opaque-dummy-secret",
      }),
    );
  });

  it("rejects an incomplete key ID with only a mode prefix", () => {
    assertConfigError(() =>
      getRazorpayCredentials({
        NODE_ENV: "test",
        RAZORPAY_MODE: "test",
        RAZORPAY_KEY_ID: "rzp_test_",
        RAZORPAY_KEY_SECRET: "opaque-dummy-secret",
      }),
    );
  });

  it("rejects test credentials in live mode", () => {
    assertConfigError(() =>
      getRazorpayCredentials({
        NODE_ENV: "production",
        RAZORPAY_MODE: "live",
        RAZORPAY_KEY_ID: "rzp_test_dummy",
        RAZORPAY_KEY_SECRET: "opaque-dummy-secret",
      }),
    );
  });

  it("requires an explicit mode in production and permits deliberate live mode only there", () => {
    assertConfigError(() =>
      getRazorpayMode({ NODE_ENV: "production" }),
    );
    assertConfigError(() =>
      getRazorpayMode({ NODE_ENV: "development", RAZORPAY_MODE: "live" }),
    );
    assert.equal(
      getRazorpayMode({ NODE_ENV: "production", RAZORPAY_MODE: "live" }),
      "live",
    );
    assert.deepEqual(
      getRazorpayCredentials({
        NODE_ENV: "production",
        RAZORPAY_MODE: "live",
        RAZORPAY_KEY_ID: "rzp_live_dummy",
        RAZORPAY_KEY_SECRET: "opaque-dummy-secret",
      }),
      {
        keyId: "rzp_live_dummy",
        keySecret: "opaque-dummy-secret",
      },
    );
  });

  it("rejects missing credentials and invalid mode values", () => {
    assertConfigError(() =>
      getRazorpayCredentials({
        NODE_ENV: "development",
        RAZORPAY_MODE: "test",
      }),
    );
    assertConfigError(() =>
      getRazorpayMode({ NODE_ENV: "development", RAZORPAY_MODE: "sandbox" }),
    );
  });

  it("selects only the webhook secret belonging to the configured mode", () => {
    assert.equal(
      getRazorpayWebhookSecret({
        NODE_ENV: "test",
        RAZORPAY_MODE: "test",
        RAZORPAY_TEST_WEBHOOK_SECRET: "test-webhook-secret",
        RAZORPAY_LIVE_WEBHOOK_SECRET: "live-webhook-secret",
      }),
      "test-webhook-secret",
    );
    assert.equal(
      getRazorpayWebhookSecret({
        NODE_ENV: "production",
        RAZORPAY_MODE: "live",
        RAZORPAY_LIVE_WEBHOOK_SECRET: "live-webhook-secret",
      }),
      "live-webhook-secret",
    );
    assert.throws(
      () =>
        getRazorpayWebhookSecret({
          NODE_ENV: "test",
          RAZORPAY_MODE: "test",
          RAZORPAY_LIVE_WEBHOOK_SECRET: "live-webhook-secret",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "WEBHOOK_NOT_CONFIGURED",
    );
  });

  it("rejects invalid configuration before issuing any provider request", async () => {
    const names = [
      "NODE_ENV",
      "RAZORPAY_MODE",
      "RAZORPAY_KEY_ID",
      "RAZORPAY_KEY_SECRET",
    ] as const;
    const original = Object.fromEntries(
      names.map((name) => [name, process.env[name]]),
    );
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response();
    };

    try {
      process.env.NODE_ENV = "test";
      process.env.RAZORPAY_MODE = "test";
      process.env.RAZORPAY_KEY_ID = "rzp_live_dummy";
      process.env.RAZORPAY_KEY_SECRET = "opaque-dummy-secret";
      await assert.rejects(
        () =>
          createRazorpayPaymentLink({
            amountInPaise: 100,
            referenceId: "mode-check",
            description: "Configuration guard test",
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "RAZORPAY_CONFIGURATION_INVALID",
      );
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = originalFetch;
      for (const name of names) {
        const value = original[name];
        if (typeof value === "string") {
          process.env[name] = value;
        } else {
          delete process.env[name];
        }
      }
    }
  });
});
