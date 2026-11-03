import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../app";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { UserModel } from "../models/User";
import { UserSessionModel } from "../models/UserSession";
import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { MerchantModel } from "../models/Merchant";
import { ProductModel } from "../models/Product";
import { WebhookEventModel } from "../models/WebhookEvent";
import { createProvisionedUser } from "../services/auth.service";
import { createRazorpayPaymentLink } from "../services/razorpay.client";
import {
  recordPaymentLinkCreationFailure,
  recordPolicyDecision,
  recordWebhookRetry,
  renderMetrics,
} from "../utils/metrics";

const TEST_DB_NAME = "agentshield_metrics_test";
const TEST_PASSWORD = "metrics-test-password";
const TEST_WEBHOOK_SECRET = "metrics-test-webhook-secret";
const originalFetch = globalThis.fetch;
const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  RAZORPAY_MODE: process.env.RAZORPAY_MODE,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RAZORPAY_TEST_WEBHOOK_SECRET: process.env.RAZORPAY_TEST_WEBHOOK_SECRET,
};
let server: Server;
let baseUrl = "";

function resolveTestUri(): string {
  const raw = process.env.MONGODB_TEST_URI ?? "";
  if (!raw.trim()) {
    throw new Error("Set MONGODB_TEST_URI to run metrics tests.");
  }
  return raw.replace(/\/[^/?]*(\?.*)?$/, `/${TEST_DB_NAME}$1`);
}

async function signIn(email: string): Promise<{ cookie: string; csrfToken: string }> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  const body = await response.json() as { csrfToken: string };
  return { cookie: cookie.split(";")[0], csrfToken: body.csrfToken };
}

function metricValue(metrics: string, name: string, labels = ""): number {
  const sample = `${name}${labels} `;
  const line = metrics.split("\n").find((candidate) => candidate.startsWith(sample));
  assert.ok(line, `Expected metric sample ${sample}`);
  return Number(line.slice(sample.length));
}

describe("protected process-local metrics", () => {
  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.RAZORPAY_MODE = "test";
    process.env.RAZORPAY_KEY_ID = "rzp_test_metrics_key";
    process.env.RAZORPAY_KEY_SECRET = "metrics-test-api-secret";
    process.env.RAZORPAY_TEST_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    await connectDatabase(resolveTestUri());
    server = createApp().listen(0);
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    await Promise.all([
      AgentActionModel.deleteMany({}),
      AuditLogModel.deleteMany({}),
      UserModel.deleteMany({}),
      UserSessionModel.deleteMany({}),
      MerchantModel.deleteMany({}),
      ProductModel.deleteMany({}),
      WebhookEventModel.deleteMany({}),
    ]);
    await Promise.all([
      createProvisionedUser({
        email: "metrics-admin@example.test",
        password: TEST_PASSWORD,
        role: "admin",
      }),
      createProvisionedUser({
        email: "metrics-approver@example.test",
        password: TEST_PASSWORD,
        role: "approver",
      }),
    ]);
    await MerchantModel.create({
      name: "Metrics Test Store",
      policy: {
        maxTransactionAmount: 500000,
        maxDiscountPercent: 10,
        requireHumanApproval: true,
        allowRefunds: false,
        allowPayouts: false,
      },
    });
    await ProductModel.create({
      name: "Metrics Test Product",
      description: "Test product",
      priceInPaise: 10000,
      currency: "INR",
      category: "test",
      tags: [],
      inventory: 5,
      frequentlyBoughtWith: [],
    });
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await disconnectDatabase();
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("increments only predefined policy labels and emits Prometheus counter samples", () => {
    const beforeMetrics = renderMetrics();
    recordPolicyDecision("ALLOW");
    recordPolicyDecision("BLOCK");
    recordPolicyDecision("ESCALATE");
    recordPaymentLinkCreationFailure();
    recordWebhookRetry();
    const metrics = renderMetrics();

    assert.equal(
      metricValue(metrics, "agentshield_policy_decisions_total", '{decision="allow"}'),
      metricValue(beforeMetrics, "agentshield_policy_decisions_total", '{decision="allow"}') + 1,
    );
    assert.equal(
      metricValue(metrics, "agentshield_policy_decisions_total", '{decision="block"}'),
      metricValue(beforeMetrics, "agentshield_policy_decisions_total", '{decision="block"}') + 1,
    );
    assert.equal(
      metricValue(metrics, "agentshield_policy_decisions_total", '{decision="review"}'),
      metricValue(beforeMetrics, "agentshield_policy_decisions_total", '{decision="review"}') + 1,
    );
    assert.equal(
      metricValue(metrics, "agentshield_payment_link_creation_failures_total"),
      metricValue(beforeMetrics, "agentshield_payment_link_creation_failures_total") + 1,
    );
    assert.equal(
      metricValue(metrics, "agentshield_webhook_retries_total"),
      metricValue(beforeMetrics, "agentshield_webhook_retries_total") + 1,
    );
    assert.match(metrics, /# TYPE agentshield_policy_decisions_total counter/);
    assert.match(metrics, /# TYPE agentshield_payment_link_creation_failures_total counter/);
    assert.match(metrics, /# TYPE agentshield_webhook_retries_total counter/);
    assert.equal(metrics.endsWith("\n"), true);
    assert.equal(metrics.includes("metrics-admin@example.test"), false);
  });

  it("counts a policy decision after a real policy evaluation", async () => {
    const cookie = await signIn("metrics-admin@example.test");
    const product = await ProductModel.findOne({ name: "Metrics Test Product" });
    assert.ok(product);
    const beforeAllows = metricValue(
      renderMetrics(),
      "agentshield_policy_decisions_total",
      '{decision="allow"}',
    );

    const response = await fetch(`${baseUrl}/api/actions/validate`, {
      method: "POST",
      headers: {
        Cookie: cookie.cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": cookie.csrfToken,
      },
      body: JSON.stringify({
        action: "CREATE_PAYMENT",
        items: [{ productId: String(product._id), quantity: 1 }],
        proposedAmountInPaise: 10000,
        reason: "Metrics policy test",
        requiresApproval: true,
        referenceId: "metrics-policy-allow",
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(
      metricValue(
        renderMetrics(),
        "agentshield_policy_decisions_total",
        '{decision="allow"}',
      ),
      beforeAllows + 1,
    );
  });

  it("counts a retry only after a previously failed webhook is successfully claimed", async () => {
    const eventId = "metrics-retry-event";
    const body = JSON.stringify({ event: "unknown.metrics_event" });
    await WebhookEventModel.create({
      eventId,
      eventName: "unknown.metrics_event",
      status: "RETRYABLE_FAILURE",
      transition: "IGNORED",
      payloadHash: createHash("sha256").update(body).digest("hex"),
      attempts: 1,
    });
    const beforeRetries = metricValue(renderMetrics(), "agentshield_webhook_retries_total");
    const signature = createHmac("sha256", TEST_WEBHOOK_SECRET).update(body).digest("hex");

    const response = await fetch(`${baseUrl}/api/webhooks/razorpay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Razorpay-Event-Id": eventId,
        "X-Razorpay-Signature": signature,
      },
      body,
    });

    assert.equal(response.status, 200);
    assert.equal(
      metricValue(renderMetrics(), "agentshield_webhook_retries_total"),
      beforeRetries + 1,
    );
  });

  it("counts a provider payment-link creation failure once", async () => {
    const beforeFailures = metricValue(
      renderMetrics(),
      "agentshield_payment_link_creation_failures_total",
    );
    globalThis.fetch = async () =>
      Response.json(
        { error: { code: "BAD_REQUEST_ERROR", field: "amount" } },
        { status: 400 },
      );

    await assert.rejects(
      createRazorpayPaymentLink({
        amountInPaise: 100,
        referenceId: "metrics-failure",
        description: "Metrics failure test",
      }),
    );
    assert.equal(
      metricValue(renderMetrics(), "agentshield_payment_link_creation_failures_total"),
      beforeFailures + 1,
    );
    globalThis.fetch = originalFetch;
  });

  it("requires authentication and the admin role to read metrics", async () => {
    const unauthenticated = await fetch(`${baseUrl}/api/metrics`);
    assert.equal(unauthenticated.status, 401);

    const approverCookie = await signIn("metrics-approver@example.test");
    const forbidden = await fetch(`${baseUrl}/api/metrics`, {
      headers: { Cookie: approverCookie.cookie },
    });
    assert.equal(forbidden.status, 403);

    const adminCookie = await signIn("metrics-admin@example.test");
    const response = await fetch(`${baseUrl}/api/metrics`, {
      headers: { Cookie: adminCookie.cookie },
    });
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type") ?? "",
      /^text\/plain;.*version=0\.0\.4/,
    );
    const body = await response.text();
    assert.match(body, /agentshield_policy_decisions_total\{decision="allow"\} \d+/);
    assert.match(body, /agentshield_payment_link_creation_failures_total \d+/);
    assert.match(body, /agentshield_webhook_retries_total \d+/);
  });
});
