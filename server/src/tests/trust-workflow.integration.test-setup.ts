import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, beforeEach } from "node:test";
import { createApp } from "../app";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { UserModel } from "../models/User";
import { UserSessionModel } from "../models/UserSession";
import { WebhookEventModel } from "../models/WebhookEvent";
import { createProvisionedUser } from "../services/auth.service";
import { logger } from "../utils/logger";

const TEST_DB_NAME = "agentshield_trust_workflow_test";
export const PRODUCT_PRICE_IN_PAISE = 20_000;
const TEST_WEBHOOK_SECRET = "phase9-dummy-webhook-secret";
const TEST_PASSWORD = "trust-workflow-test-password";
export const INTERNAL_ERROR_MARKER = "internal-database-detail-must-not-be-logged";
export const QUERY_SECRET_MARKER = "query-secret-must-not-be-echoed-or-logged";
export const PROVIDER_ERROR_MARKER = "provider-internal-detail-must-not-be-returned";

export interface Session {
  cookie: string;
  csrfToken: string;
}

export interface Proposal {
  action: string;
  items: Array<{ productId: string; quantity: number }>;
  proposedAmountInPaise: number;
  referenceId: string;
  reason: string;
  requiresApproval: boolean;
}

export interface JsonResponse {
  [key: string]: unknown;
}

const originalEnvironment = new Map<string, string | undefined>();
export const originalFetch = globalThis.fetch;
const environmentKeys = [
  "NODE_ENV",
  "CLIENT_URL",
  "MONGODB_TEST_URI",
  "RAZORPAY_MODE",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_TEST_WEBHOOK_SECRET",
  "LLM_API_KEY",
];
let server: Server;
export let baseUrl = "";
export let productId = "";
export let approverId = "";
export const users = {
  admin: "workflow-admin@example.test",
  approver: "workflow-approver@example.test",
  viewer: "workflow-viewer@example.test",
};

function resolveTestUri(): string {
  const raw = process.env.MONGODB_TEST_URI ?? "";
  if (!raw.trim()) {
    throw new Error("Set MONGODB_TEST_URI to run trust workflow integration tests.");
  }
  return raw.replace(/\/[^/?]*(\?.*)?$/, `/${TEST_DB_NAME}$1`);
}

export async function request(
  path: string,
  options: RequestInit = {},
  session?: Session,
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (session) {
    headers.set("Cookie", session.cookie);
    if (options.method && options.method !== "GET") {
      headers.set("X-CSRF-Token", session.csrfToken);
    }
  }
  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

export async function jsonRequest(
  path: string,
  method: string,
  session: Session | undefined,
  body?: unknown,
): Promise<Response> {
  return request(
    path,
    {
      method,
      ...(body === undefined ? {} : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    },
    session,
  );
}

export async function signIn(email: string): Promise<Session> {
  const response = await jsonRequest("/api/auth/login", "POST", undefined, {
    email,
    password: TEST_PASSWORD,
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { csrfToken: string };
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  return { cookie: setCookie.split(";")[0], csrfToken: body.csrfToken };
}

export async function getProposal(session: Session): Promise<Proposal> {
  const response = await jsonRequest("/api/agent/chat", "POST", session, {
    message: "Buy the Test Ceramic Mug",
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { source: string; proposal?: Proposal };
  assert.equal(body.source, "fallback");
  assert.ok(body.proposal, "the deterministic fallback should propose the catalog purchase");
  return body.proposal;
}

export async function validateProposal(
  session: Session,
  proposal: Proposal,
  overrides: Record<string, unknown> = {},
): Promise<{ actionId: string; decision: string; approvalRequired: boolean }> {
  const response = await jsonRequest("/api/actions/validate", "POST", session, {
    ...proposal,
    ...overrides,
  });
  assert.equal(response.status, 200);
  return await response.json() as { actionId: string; decision: string; approvalRequired: boolean };
}

export async function approveAction(session: Session, actionId: string): Promise<Response> {
  return jsonRequest("/api/actions/approve", "POST", session, {
    actionId,
    approved: true,
  });
}

export async function createPayment(
  session: Session,
  actionId: string,
  extraFields: Record<string, unknown> = {},
): Promise<Response> {
  return jsonRequest("/api/payments/create", "POST", session, {
    actionId,
    ...extraFields,
  });
}

export function setProviderMock(
  handler: (url: URL, init: RequestInit | undefined) => Promise<Response>,
): { calls: Array<{ method: string; url: string; body: string }> } {
  const calls: Array<{ method: string; url: string; body: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin === baseUrl) {
      return originalFetch(input, init);
    }
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ method, url: url.href, body });
    return handler(url, init);
  };
  return { calls };
}

export function mockPaymentLink(): { calls: Array<{ method: string; url: string; body: string }> } {
  return setProviderMock(async (url, init) => {
    assert.equal(url.pathname, "/v1/payment_links");
    assert.equal(init?.method, "POST");
    const payload = JSON.parse(String(init?.body)) as { amount: number; reference_id: string };
    return Response.json({
      id: "plink_phase9_test",
      short_url: "https://rzp.io/i/phase9-test",
      status: "created",
      amount: payload.amount,
      reference_id: payload.reference_id,
    });
  });
}

export function signedWebhook(
  status: "paid" | "failed",
  referenceId: string,
): { body: string; signature: string } {
  const body = JSON.stringify({
    event: `payment_link.${status}`,
    payload: {
      payment_link: {
        entity: {
          id: "plink_phase9_test",
          reference_id: referenceId,
          status,
          amount: PRODUCT_PRICE_IN_PAISE,
          currency: "INR",
        },
      },
    },
  });
  return {
    body,
    signature: createHmac("sha256", TEST_WEBHOOK_SECRET).update(body).digest("hex"),
  };
}

export async function sendWebhook(eventId: string, status: "paid" | "failed", referenceId: string): Promise<Response> {
  const signed = signedWebhook(status, referenceId);
  return request("/api/webhooks/razorpay", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Razorpay-Event-Id": eventId,
      "X-Razorpay-Signature": signed.signature,
    },
    body: signed.body,
  });
}

export function registerTrustWorkflowTestHooks(): void {
  before(async () => {
    for (const key of environmentKeys) {
      originalEnvironment.set(key, process.env[key]);
    }
    process.env.NODE_ENV = "test";
    process.env.CLIENT_URL = "http://localhost:5173";
    process.env.RAZORPAY_MODE = "test";
    process.env.RAZORPAY_KEY_ID = "rzp_test_phase9_dummy";
    process.env.RAZORPAY_KEY_SECRET = "phase9-dummy-api-secret";
    process.env.RAZORPAY_TEST_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    delete process.env.LLM_API_KEY;

    await connectDatabase(resolveTestUri());
    await Promise.all([
      UserModel.deleteMany({}),
      UserSessionModel.deleteMany({}),
      MerchantModel.deleteMany({}),
      ProductModel.deleteMany({}),
      OrderModel.deleteMany({}),
      AgentActionModel.deleteMany({}),
      AuditLogModel.deleteMany({}),
      WebhookEventModel.deleteMany({}),
    ]);

    await createProvisionedUser({
      email: users.admin,
      password: TEST_PASSWORD,
      role: "admin",
    });
    const approver = await createProvisionedUser({
      email: users.approver,
      password: TEST_PASSWORD,
      role: "approver",
    });
    approverId = approver.id;
    await createProvisionedUser({
      email: users.viewer,
      password: TEST_PASSWORD,
      role: "viewer",
    });

    server = createApp().listen(0);
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    globalThis.fetch = originalFetch;
    await Promise.all([
      UserSessionModel.deleteMany({}),
      MerchantModel.deleteMany({}),
      ProductModel.deleteMany({}),
      OrderModel.deleteMany({}),
      AgentActionModel.deleteMany({}),
      AuditLogModel.deleteMany({}),
      WebhookEventModel.deleteMany({}),
    ]);
    await MerchantModel.create({
      name: "Trust Workflow Test Store",
      policy: {
        maxTransactionAmount: 500_000,
        maxDiscountPercent: 10,
        requireHumanApproval: true,
        allowRefunds: false,
        allowPayouts: false,
      },
    });
    const product = await ProductModel.create({
      name: "Test Ceramic Mug",
      description: "Isolated workflow integration fixture",
      priceInPaise: PRODUCT_PRICE_IN_PAISE,
      currency: "INR",
      category: "test",
      tags: ["workflow"],
      inventory: 10,
      frequentlyBoughtWith: [],
    });
    productId = String(product._id);
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await disconnectDatabase();
    for (const [key, value] of originalEnvironment) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

}

export {
  AgentActionModel,
  AuditLogModel,
  MerchantModel,
  OrderModel,
  ProductModel,
  UserModel,
  UserSessionModel,
  WebhookEventModel,
  logger,
};
