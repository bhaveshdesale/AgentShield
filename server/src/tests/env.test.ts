import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getLlmTimeoutMs, loadEnv } from "../config/env";

function loadPort(port: string | undefined): number {
  const names = [
    "NODE_ENV",
    "PORT",
    "MONGODB_URI",
    "CLIENT_URL",
    "LLM_TIMEOUT_MS",
    "RAZORPAY_MODE",
  ] as const;
  const original = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );

  process.env.NODE_ENV = "test";
  if (port === undefined) {
    delete process.env.PORT;
  } else {
    process.env.PORT = port;
  }
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/agentshield_env_test";
  process.env.CLIENT_URL = "http://localhost:5173";
  delete process.env.LLM_TIMEOUT_MS;
  process.env.RAZORPAY_MODE = "test";

  try {
    return loadEnv().PORT;
  } finally {
    for (const name of names) {
      const value = original[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

describe("PORT environment configuration", () => {
  it("accepts integer ports within the supported range", () => {
    assert.equal(loadPort("5050"), 5050);
    assert.equal(loadPort("+5050"), 5050);
    assert.equal(loadPort("1"), 1);
    assert.equal(loadPort("65535"), 65535);
  });

  it("defaults to 5000 when PORT is missing or blank", () => {
    assert.equal(loadPort(undefined), 5000);
    assert.equal(loadPort(""), 5000);
    assert.equal(loadPort("   "), 5000);
  });

  it("allows surrounding whitespace around a valid port", () => {
    assert.equal(loadPort("  5050  "), 5050);
  });

  it("rejects ports below or above the supported range", () => {
    for (const port of ["0", "-1", "65536", "99999"]) {
      assert.throws(
        () => loadPort(port),
        /PORT must be an integer between 1 and 65535/,
        `expected ${JSON.stringify(port)} to be rejected`,
      );
    }
  });

  it("rejects non-numeric and partially numeric values", () => {
    for (const port of ["abc", "5050junk", "5 050", "1e3"]) {
      assert.throws(
        () => loadPort(port),
        /PORT must be an integer between 1 and 65535/,
        `expected ${JSON.stringify(port)} to be rejected`,
      );
    }
  });

  it("rejects decimal-formatted values", () => {
    for (const port of ["5050.5", "5050.0"]) {
      assert.throws(
        () => loadPort(port),
        /PORT must be an integer between 1 and 65535/,
        `expected ${JSON.stringify(port)} to be rejected`,
      );
    }
  });
});

describe("LLM timeout environment configuration", () => {
  it("uses the default timeout when LLM_TIMEOUT_MS is missing or blank", () => {
    assert.equal(getLlmTimeoutMs({}), 30_000);
    assert.equal(getLlmTimeoutMs({ LLM_TIMEOUT_MS: "  " }), 30_000);
  });

  it("accepts positive integer timer values", () => {
    assert.equal(getLlmTimeoutMs({ LLM_TIMEOUT_MS: "5000" }), 5000);
    assert.equal(getLlmTimeoutMs({ LLM_TIMEOUT_MS: " 30000 " }), 30_000);
    assert.equal(getLlmTimeoutMs({ LLM_TIMEOUT_MS: "2147483647" }), 2_147_483_647);
  });

  it("rejects malformed, non-positive, and out-of-range timer values", () => {
    for (const value of ["abc", "5000ms", "1.5", "0", "-1", "2147483648"]) {
      assert.throws(
        () => getLlmTimeoutMs({ LLM_TIMEOUT_MS: value }),
        /LLM_TIMEOUT_MS must be an integer between 1 and 2147483647/,
        `expected ${JSON.stringify(value)} to be rejected`,
      );
    }
  });
});
