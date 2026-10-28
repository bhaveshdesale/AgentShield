import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
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
const PRODUCT_PRICE_IN_PAISE = 20_000;
const TEST_WEBHOOK_SECRET = "phase9-dummy-webhook-secret";
const TEST_PASSWORD = "trust-workflow-test-password";
const INTERNAL_ERROR_MARKER = "internal-database-detail-must-not-be-logged";
const QUERY_SECRET_MARKER = "query-secret-must-not-be-echoed-or-logged";
const PROVIDER_ERROR_MARKER = "provider-internal-detail-must-not-be-returned";

interface Session {
  cookie: string;
  csrfToken: string;
}

interface Proposal {
  action: string;
  items: Array<{ productId: string; quantity: number }>;
  proposedAmountInPaise: number;
  referenceId: string;
  reason: string;
  requiresApproval: boolean;
}

interface JsonResponse {
  [key: string]: unknown;
}

const originalEnvironment = new Map<string, string | undefined>();
const originalFetch = globalThis.fetch;
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
let baseUrl = "";
let productId = "";
let approverId = "";
const users = {
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

async function request(
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

async function jsonRequest(
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

async function signIn(email: string): Promise<Session> {
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

async function getProposal(session: Session): Promise<Proposal> {
  const response = await jsonRequest("/api/agent/chat", "POST", session, {
    message: "Buy the Test Ceramic Mug",
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { source: string; proposal?: Proposal };
  assert.equal(body.source, "fallback");
  assert.ok(body.proposal, "the deterministic fallback should propose the catalog purchase");
  return body.proposal;
}

async function validateProposal(
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

async function approveAction(session: Session, actionId: string): Promise<Response> {
  return jsonRequest("/api/actions/approve", "POST", session, {
    actionId,
    approved: true,
  });
}

async function createPayment(
  session: Session,
  actionId: string,
  extraFields: Record<string, unknown> = {},
): Promise<Response> {
  return jsonRequest("/api/payments/create", "POST", session, {
    actionId,
    ...extraFields,
  });
}

function setProviderMock(
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

function mockPaymentLink(): { calls: Array<{ method: string; url: string; body: string }> } {
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

function signedWebhook(
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

async function sendWebhook(eventId: string, status: "paid" | "failed", referenceId: string): Promise<Response> {
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

describe("authenticated trust and payment workflow over HTTP", () => {
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

  it("requires authenticated approval, ignores client-authoritative fields, and records payment/webhook attribution", async () => {
    const approver = await signIn(users.approver);
    const proposal = await getProposal(approver);
    assert.equal(proposal.items[0].productId, productId);

    const forgedValidation = await validateProposal(approver, proposal, {
      approved: true,
      approvedBy: "forged@example.test",
      executionStatus: "SUCCEEDED",
      proposedAmountInPaise: 1,
      requiresApproval: false,
    });
    assert.equal(forgedValidation.decision, "BLOCK");
    assert.equal(forgedValidation.approvalRequired, true);

    const validProposal = await getProposal(approver);
    const validation = await validateProposal(approver, validProposal);
    assert.equal(validation.decision, "ALLOW");
    assert.equal(validation.approvalRequired, true);

    const actionBeforeApproval = await AgentActionModel.findById(validation.actionId).lean();
    assert.ok(actionBeforeApproval);
    assert.equal(actionBeforeApproval.approvalStatus, "PENDING");
    assert.equal(actionBeforeApproval.approval?.approvedBy, undefined);
    assert.notEqual(actionBeforeApproval.executionStatus, "SUCCEEDED");

    const viewer = await signIn(users.viewer);
    const viewerApproval = await approveAction(viewer, validation.actionId);
    assert.equal(viewerApproval.status, 403);
    const blockedPayment = await createPayment(approver, validation.actionId);
    assert.equal(blockedPayment.status, 409);

    const approvalResponse = await approveAction(approver, validation.actionId);
    assert.equal(approvalResponse.status, 200);
    assert.equal((await approveAction(approver, validation.actionId)).status, 409);

    const provider = mockPaymentLink();
    const paymentResponse = await createPayment(approver, validation.actionId, {
      amountInPaise: 1,
      approved: false,
      executionStatus: "FAILED",
    });
    assert.equal(paymentResponse.status, 200);
    const providerRequest = provider.calls.find((call) => call.method === "POST");
    assert.ok(providerRequest);
    assert.equal(
      (JSON.parse(providerRequest.body) as { amount: number }).amount,
      PRODUCT_PRICE_IN_PAISE,
      "the provider amount is recalculated from the catalog rather than client input",
    );
    assert.equal((await createPayment(approver, validation.actionId)).status, 409);
    assert.equal(provider.calls.filter((call) => call.method === "POST").length, 1);

    const webhook = await sendWebhook("phase9-paid-event", "paid", validProposal.referenceId);
    assert.equal(webhook.status, 200);
    assert.equal((await sendWebhook("phase9-paid-event", "paid", validProposal.referenceId)).status, 200);
    assert.equal((await sendWebhook("phase9-late-failure", "failed", validProposal.referenceId)).status, 200);

    const order = await OrderModel.findOne({ referenceId: validProposal.referenceId }).lean();
    assert.ok(order);
    assert.equal(order.status, "PAID");
    const action = await AgentActionModel.findById(validation.actionId).lean();
    assert.ok(action);
    assert.equal(action.executionStatus, "SUCCEEDED");

    const paymentAudit = await AuditLogModel.findOne({
      event: "PAYMENT_LINK_CREATED",
      actionId: validation.actionId,
    }).lean();
    assert.ok(paymentAudit);
    assert.equal(String(paymentAudit.actorId), approverId);
    assert.equal(paymentAudit.actorEmail, users.approver);
    assert.equal(
      await AuditLogModel.countDocuments({
        event: "ORDER_PAYMENT_CONFIRMED",
        idempotencyKey: "razorpay:phase9-paid-event",
      }),
      1,
    );
    const webhookAudit = await AuditLogModel.findOne({
      event: "ORDER_PAYMENT_CONFIRMED",
      idempotencyKey: "razorpay:phase9-paid-event",
    }).lean();
    assert.ok(webhookAudit);
    assert.equal(webhookAudit.actorId, undefined, "system-generated webhook audit must not impersonate a user");
  });

  it("allows a policy-approved payment without human approval when the current policy permits it", async () => {
    await MerchantModel.updateOne({}, { $set: { "policy.requireHumanApproval": false } });
    const approver = await signIn(users.approver);
    const proposal = await getProposal(approver);
    const validation = await validateProposal(approver, proposal);

    assert.equal(validation.decision, "ALLOW");
    assert.equal(validation.approvalRequired, false);
    const action = await AgentActionModel.findById(validation.actionId).lean();
    assert.ok(action);
    assert.equal(action.approvalStatus, "NOT_REQUIRED");

    mockPaymentLink();
    const response = await createPayment(approver, validation.actionId);
    assert.equal(response.status, 200);
    const audit = await AuditLogModel.findOne({
      event: "PAYMENT_LINK_CREATED",
      actionId: validation.actionId,
    }).lean();
    assert.ok(audit);
    assert.equal(String(audit.actorId), approverId);
  });

  it("allows only one concurrent approval and payment creation for an action", async () => {
    const approver = await signIn(users.approver);
    const proposal = await getProposal(approver);
    const validation = await validateProposal(approver, proposal);

    const approvals = await Promise.all([
      approveAction(approver, validation.actionId),
      approveAction(approver, validation.actionId),
    ]);
    assert.deepEqual(approvals.map((response) => response.status).sort(), [200, 409]);
    assert.equal(
      await AuditLogModel.countDocuments({
        event: "ACTION_APPROVED",
        actionId: validation.actionId,
      }),
      1,
    );

    let providerStarted!: () => void;
    let releaseProvider!: () => void;
    const providerRequestStarted = new Promise<void>((resolve) => {
      providerStarted = resolve;
    });
    const providerResponseReleased = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const provider = setProviderMock(async (_url, init) => {
      assert.equal(init?.method, "POST");
      providerStarted();
      await providerResponseReleased;
      const requestBody = JSON.parse(String(init?.body)) as {
        amount: number;
        reference_id: string;
      };
      return Response.json({
        id: "plink_concurrent_action",
        short_url: "https://rzp.io/i/concurrent-action",
        status: "created",
        amount: requestBody.amount,
        reference_id: requestBody.reference_id,
      });
    });

    const firstPayment = createPayment(approver, validation.actionId);
    await providerRequestStarted;
    const duplicatePayment = await createPayment(approver, validation.actionId);
    assert.equal(duplicatePayment.status, 409);
    releaseProvider();

    const paymentResponse = await firstPayment;
    assert.equal(paymentResponse.status, 200);
    assert.equal(provider.calls.filter((call) => call.method === "POST").length, 1);
    assert.equal(
      await AuditLogModel.countDocuments({
        event: "PAYMENT_LINK_CREATED",
        actionId: validation.actionId,
      }),
      1,
    );
    assert.equal(
      (await AgentActionModel.findById(validation.actionId))?.executionStatus,
      "SUCCEEDED",
    );
    assert.equal(
      (await OrderModel.findOne({ referenceId: proposal.referenceId }))?.status,
      "AWAITING_PAYMENT",
    );
  });

  it("blocks denied proposals and revalidates approval against changed policy before payment", async () => {
    const approver = await signIn(users.approver);
    const proposal = await getProposal(approver);
    const denied = await validateProposal(approver, proposal, {
      proposedAmountInPaise: PRODUCT_PRICE_IN_PAISE + 1,
    });
    assert.equal(denied.decision, "BLOCK");
    const deniedPayment = await createPayment(approver, denied.actionId);
    assert.equal(deniedPayment.status, 409);
    const deniedAction = await AgentActionModel.findById(denied.actionId).lean();
    assert.ok(deniedAction);
    assert.equal(deniedAction.executionStatus, "BLOCKED");

    const validProposal = await getProposal(approver);
    const valid = await validateProposal(approver, validProposal);
    assert.equal(valid.decision, "ALLOW");
    await MerchantModel.updateOne({}, { $set: { "policy.maxTransactionAmount": 10_000 } });
    const approvalAfterPolicyChange = await approveAction(approver, valid.actionId);
    assert.equal(approvalAfterPolicyChange.status, 409);
    const invalidatedAction = await AgentActionModel.findById(valid.actionId).lean();
    assert.ok(invalidatedAction);
    assert.equal(invalidatedAction.executionStatus, "BLOCKED");

    const provider = setProviderMock(async () => {
      throw new Error("A policy-denied action must not call the payment provider.");
    });
    assert.equal((await createPayment(approver, valid.actionId)).status, 409);
    assert.equal(provider.calls.length, 0);
  });

  it("recovers an uncertain provider result through the existing reference lookup before retrying creation", async () => {
    const approver = await signIn(users.approver);
    const proposal = await getProposal(approver);
    const validation = await validateProposal(approver, proposal);
    assert.equal((await approveAction(approver, validation.actionId)).status, 200);

    let firstCreate = true;
    const provider = setProviderMock(async (url, init) => {
      if (init?.method === "POST" && url.pathname === "/v1/payment_links") {
        if (firstCreate) {
          firstCreate = false;
          throw new Error("simulated network timeout after uncertain provider outcome");
        }
        return Response.json({
          id: "plink_phase9_recovered",
          short_url: "https://rzp.io/i/phase9-recovered",
          status: "created",
        });
      }
      if (init?.method === "GET" && url.pathname === "/v1/payment_links") {
        assert.equal(url.searchParams.get("reference_id"), proposal.referenceId);
        return Response.json({ payment_links: [] });
      }
      throw new Error(`Unexpected mocked provider request: ${init?.method} ${url.pathname}`);
    });

    assert.equal((await createPayment(approver, validation.actionId)).status, 500);
    const unknownAction = await AgentActionModel.findById(validation.actionId).lean();
    assert.ok(unknownAction);
    assert.equal(unknownAction.executionStatus, "UNKNOWN");

    const recovered = await createPayment(approver, validation.actionId);
    assert.equal(recovered.status, 200);
    assert.deepEqual(provider.calls.map((call) => call.method), ["POST", "GET", "POST"]);
    const recoveredOrder = await OrderModel.findOne({ referenceId: proposal.referenceId }).lean();
    assert.ok(recoveredOrder);
    assert.equal(recoveredOrder.status, "AWAITING_PAYMENT");
    const recoveryAudit = await AuditLogModel.findOne({
      event: "RECOVERY_SAFE_RETRY",
      actionId: validation.actionId,
    }).lean();
    assert.ok(recoveryAudit);
  });

  it("returns a generic server error and omits unexpected internal error text from request logs", async () => {
    const admin = await signIn(users.admin);
    const originalFind = OrderModel.find;
    const originalLoggerError = logger.error;
    const logEntries: string[] = [];

    Object.defineProperty(OrderModel, "find", {
      configurable: true,
      value: () => {
        throw new Error(INTERNAL_ERROR_MARKER);
      },
    });
    logger.error = (message, context) => {
      logEntries.push(`${message} ${JSON.stringify(context)}`);
    };

    try {
      const response = await request("/api/payments", {}, admin);
      assert.equal(response.status, 500);
      const body = await response.json() as JsonResponse;
      assert.equal(body.code, "INTERNAL_ERROR");
      assert.equal(body.message, "An unexpected error occurred. The request was not completed.");
      assert.equal(JSON.stringify(body).includes(INTERNAL_ERROR_MARKER), false);
      assert.equal(logEntries.length, 1);
      assert.equal(logEntries[0].includes(INTERNAL_ERROR_MARKER), false);
      assert.match(logEntries[0], /"errorType":"Error"/);
    } finally {
      Object.defineProperty(OrderModel, "find", {
        configurable: true,
        value: originalFind,
      });
      logger.error = originalLoggerError;
    }
  });

  it("does not echo or log query-string values for unknown routes", async () => {
    const originalLoggerInfo = logger.info;
    const originalLoggerWarn = logger.warn;
    const entries: string[] = [];
    logger.info = (message, context) => {
      entries.push(`${message} ${JSON.stringify(context)}`);
    };
    logger.warn = (message, context) => {
      entries.push(`${message} ${JSON.stringify(context)}`);
    };

    try {
      const response = await request(`/missing-route?token=${QUERY_SECRET_MARKER}`);
      const body = await response.json() as JsonResponse;

      assert.equal(response.status, 404);
      assert.equal(JSON.stringify(body).includes(QUERY_SECRET_MARKER), false);
      assert.ok(entries.some((entry) => entry.includes('"path":"/missing-route"')));
      assert.equal(entries.some((entry) => entry.includes(QUERY_SECRET_MARKER)), false);
    } finally {
      logger.info = originalLoggerInfo;
      logger.warn = originalLoggerWarn;
    }
  });

  it("does not expose payment provider rejection details to the client or routine logs", async () => {
    const approver = await signIn(users.approver);
    const proposal = await getProposal(approver);
    const validation = await validateProposal(approver, proposal);
    assert.equal(validation.decision, "ALLOW");
    assert.equal((await approveAction(approver, validation.actionId)).status, 200);

    const originalLoggerError = logger.error;
    const logEntries: string[] = [];
    logger.error = (message, context) => {
      logEntries.push(`${message} ${JSON.stringify(context)}`);
    };
    setProviderMock(async () => Response.json({
      error: {
        code: "BAD_REQUEST_ERROR",
        description: PROVIDER_ERROR_MARKER,
      },
    }, { status: 400 }));

    try {
      const response = await createPayment(approver, validation.actionId);
      const body = await response.json() as JsonResponse;

      assert.equal(response.status, 502);
      assert.equal(body.code, "RAZORPAY_ERROR");
      assert.equal(body.message, "Payment provider rejected the payment link request.");
      assert.equal(JSON.stringify(body).includes(PROVIDER_ERROR_MARKER), false);
      assert.equal(logEntries.some((entry) => entry.includes(PROVIDER_ERROR_MARKER)), false);
    } finally {
      globalThis.fetch = originalFetch;
      logger.error = originalLoggerError;
    }
  });

  it("does not expose provider lookup details when refreshing payment status", async () => {
    const approver = await signIn(users.approver);
    const order = await OrderModel.create({
      items: [{ productId, quantity: 1, unitPriceInPaise: PRODUCT_PRICE_IN_PAISE }],
      amountInPaise: PRODUCT_PRICE_IN_PAISE,
      currency: "INR",
      status: "AWAITING_PAYMENT",
      referenceId: "phase11-lookup-error",
      razorpayPaymentLinkId: "plink_phase11_lookup",
      razorpayPaymentLinkUrl: "https://rzp.io/i/phase11-lookup",
    });
    setProviderMock(async () => Response.json({
      error: { description: PROVIDER_ERROR_MARKER },
    }, { status: 500 }));

    const response = await request(
      `/api/payments/${String(order._id)}/status`,
      {},
      approver,
    );
    const body = await response.json() as JsonResponse;

    assert.equal(response.status, 502);
    assert.equal(body.code, "RAZORPAY_ERROR");
    assert.equal(body.message, "Payment provider lookup failed.");
    assert.equal(JSON.stringify(body).includes(PROVIDER_ERROR_MARKER), false);
    globalThis.fetch = originalFetch;
  });
});
