import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getPaymentCallbackUrl } from "../config/env";

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  CLIENT_URL: process.env.CLIENT_URL,
  FRONTEND_URL: process.env.FRONTEND_URL,
};

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("payment callback URL", () => {
  it("uses the validated CLIENT_URL for normal and recovery payment callbacks", () => {
    process.env.NODE_ENV = "test";
    process.env.CLIENT_URL = "https://shop.example.test";
    process.env.FRONTEND_URL = "https://legacy.example.test";

    const normalPaymentCallback = getPaymentCallbackUrl("order-123");
    const recoveryPaymentCallback = getPaymentCallbackUrl("order-123");

    assert.equal(
      normalPaymentCallback,
      "https://shop.example.test/payments/order-123",
    );
    assert.equal(recoveryPaymentCallback, normalPaymentCallback);
  });

  it("uses the legacy FRONTEND_URL when CLIENT_URL is not configured", () => {
    process.env.NODE_ENV = "test";
    delete process.env.CLIENT_URL;
    process.env.FRONTEND_URL = "https://legacy.example.test";

    assert.equal(
      getPaymentCallbackUrl("order-456"),
      "https://legacy.example.test/payments/order-456",
    );
  });

  it("uses the localhost fallback when no optional client URL is configured", () => {
    process.env.NODE_ENV = "test";
    delete process.env.CLIENT_URL;
    delete process.env.FRONTEND_URL;

    assert.equal(
      getPaymentCallbackUrl("order-789"),
      "http://localhost:5173/payments/order-789",
    );
  });

  it("does not use the localhost fallback in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.CLIENT_URL;
    delete process.env.FRONTEND_URL;

    assert.throws(
      () => getPaymentCallbackUrl("order-production"),
      /CLIENT_URL must use HTTPS in production/,
    );
  });
});
