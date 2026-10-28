import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { createApp } from "../app";
import { UserModel } from "../models/User";
import { UserSessionModel } from "../models/UserSession";
import { MerchantModel } from "../models/Merchant";
import { ProductModel } from "../models/Product";
import { AuditLogModel } from "../models/AuditLog";
import { AgentActionModel } from "../models/AgentAction";
import { OrderModel } from "../models/Order";
import { createProvisionedUser } from "../services/auth.service";

const TEST_DB_NAME = "agentshield_auth_test";
const originalTrustProxyHops = process.env.TRUST_PROXY_HOPS;
let server: Server;
let baseUrl = "";
let productId = "";
let approverId = "";

function resolveTestUri(): string {
  const raw = process.env.MONGODB_TEST_URI ?? "";
  if (!raw.trim()) {
    throw new Error("Set MONGODB_TEST_URI to run authentication tests.");
  }
  return raw.replace(/\/[^/?]*(\?.*)?$/, `/${TEST_DB_NAME}$1`);
}

async function request(
  path: string,
  options: RequestInit = {},
  cookie?: string,
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (cookie) headers.set("Cookie", cookie);
  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

async function signIn(email: string, password: string) {
  const response = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json() as { user: { id: string }; csrfToken: string };
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  return {
    body,
    setCookie,
    cookie: setCookie.split(";")[0],
  };
}

describe("API authentication and authorization", () => {
  before(async () => {
    process.env.TRUST_PROXY_HOPS = "1";
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
      UserModel.deleteMany({}),
      UserSessionModel.deleteMany({}),
      MerchantModel.deleteMany({}),
      ProductModel.deleteMany({}),
      OrderModel.deleteMany({}),
      AgentActionModel.deleteMany({}),
      AuditLogModel.deleteMany({}),
    ]);
    const approver = await createProvisionedUser({
      email: "approver@example.test",
      password: "correct-horse-battery-staple",
      role: "approver",
    });
    approverId = approver.id;
    await MerchantModel.create({
      name: "Authentication Test Store",
      policy: {
        maxTransactionAmount: 500000,
        maxDiscountPercent: 10,
        requireHumanApproval: true,
        allowRefunds: false,
        allowPayouts: false,
      },
    });
    const product = await ProductModel.create({
      name: "Test product",
      description: "Test product",
      priceInPaise: 10000,
      currency: "INR",
      category: "test",
      tags: [],
      inventory: 5,
      frequentlyBoughtWith: [],
    });
    productId = String(product._id);
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await disconnectDatabase();
    if (originalTrustProxyHops === undefined) {
      delete process.env.TRUST_PROXY_HOPS;
    } else {
      process.env.TRUST_PROXY_HOPS = originalTrustProxyHops;
    }
  });

  it("denies unauthenticated financial access and audits unauthenticated approval attempts", async () => {
    const read = await request("/api/payments");
    assert.equal(read.status, 401);

    const approval = await request("/api/actions/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId: "not-an-id" }),
    });
    assert.equal(approval.status, 401);
    assert.ok(await AuditLogModel.exists({ event: "AUTHENTICATION_DENIED" }));
  });

  it("uses generic login errors and rejects malformed or revoked session tokens", async () => {
    const unknownEmail = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "missing@example.test", password: "wrong-password" }),
    });
    const wrongPassword = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "approver@example.test", password: "wrong-password" }),
    });
    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(await unknownEmail.json(), await wrongPassword.json());

    const malformed = await request("/api/payments", {}, "agentshield_session=not-a-session-token");
    assert.equal(malformed.status, 401);

    const session = await signIn("approver@example.test", "correct-horse-battery-staple");
    const cookieToken = session.cookie.slice("agentshield_session=".length);
    await UserSessionModel.deleteMany({});
    const revoked = await request("/api/payments", {}, `agentshield_session=${cookieToken}`);
    assert.equal(revoked.status, 401);
  });

  it("allows viewer financial reads but denies action validation", async () => {
    await createProvisionedUser({
      email: "viewer@example.test",
      password: "correct-horse-battery-staple",
      role: "viewer",
    });
    const session = await signIn("viewer@example.test", "correct-horse-battery-staple");

    const payments = await request("/api/payments", {}, session.cookie);
    assert.equal(payments.status, 200);
    const audit = await request("/api/audit", {}, session.cookie);
    assert.equal(audit.status, 200);

    const order = await OrderModel.create({
      items: [{ productId, quantity: 1, unitPriceInPaise: 10000 }],
      amountInPaise: 10000,
      currency: "INR",
      status: "AWAITING_PAYMENT",
      referenceId: "viewer-status-read",
      razorpayPaymentLinkId: "plink-viewer",
      razorpayPaymentLinkUrl: "https://rzp.test/plink-viewer",
    });
    const paymentStatus = await request(`/api/payments/${String(order._id)}/status`, {}, session.cookie);
    assert.equal(paymentStatus.status, 200);
    assert.equal((await OrderModel.findById(order._id))?.status, "AWAITING_PAYMENT");

    const validation = await request("/api/actions/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.body.csrfToken,
      },
      body: JSON.stringify({
        action: "CREATE_PAYMENT",
        items: [{ productId, quantity: 1 }],
        proposedAmountInPaise: 10000,
        reason: "Test purchase",
        requiresApproval: true,
        referenceId: "viewer-auth-denied",
      }),
    }, session.cookie);
    assert.equal(validation.status, 403);
    const approval = await request("/api/actions/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.body.csrfToken,
      },
      body: JSON.stringify({ actionId: "507f1f77bcf86cd799439011" }),
    }, session.cookie);
    assert.equal(approval.status, 403);
    const paymentCreation = await request("/api/payments/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.body.csrfToken,
      },
      body: JSON.stringify({ actionId: "507f1f77bcf86cd799439011" }),
    }, session.cookie);
    assert.equal(paymentCreation.status, 403);
    assert.ok(await AuditLogModel.exists({ event: "AUTHORIZATION_DENIED" }));
  });

  it("requires CSRF and records the authenticated approver rather than a client-supplied actor", async () => {
    const session = await signIn("approver@example.test", "correct-horse-battery-staple");
    assert.ok(session.setCookie.includes("HttpOnly"));
    assert.ok(session.setCookie.includes("Secure"));
    assert.ok(session.setCookie.includes("SameSite=Strict"));
    assert.ok(session.setCookie.includes("Path=/api"));
    const firstSessionRead = await request("/api/auth/session", {}, session.cookie);
    const firstSessionBody = await firstSessionRead.json() as { csrfToken: string };
    const secondSessionRead = await request("/api/auth/session", {}, session.cookie);
    const secondSessionBody = await secondSessionRead.json() as { csrfToken: string };
    assert.equal(firstSessionBody.csrfToken, session.body.csrfToken);
    assert.equal(secondSessionBody.csrfToken, firstSessionBody.csrfToken);

    const proposal = {
      action: "CREATE_PAYMENT",
      items: [{ productId, quantity: 1 }],
      proposedAmountInPaise: 10000,
      reason: "Test purchase",
      requiresApproval: true,
      referenceId: "approver-auth-success",
    };

    const validation = await request("/api/actions/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.body.csrfToken,
      },
      body: JSON.stringify(proposal),
    }, session.cookie);
    assert.equal(validation.status, 200);
    const validated = await validation.json() as { actionId: string };

    const missingCsrf = await request("/api/actions/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
      },
      body: JSON.stringify({ actionId: validated.actionId }),
    }, session.cookie);
    assert.equal(missingCsrf.status, 403);
    assert.notEqual(missingCsrf.headers.get("access-control-allow-origin"), "https://attacker.example");
    const invalidCsrf = await request("/api/actions/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "A".repeat(43),
      },
      body: JSON.stringify({ actionId: validated.actionId }),
    }, session.cookie);
    assert.equal(invalidCsrf.status, 403);
    assert.equal((await AgentActionModel.findById(validated.actionId))?.approvalStatus, "PENDING");

    const approval = await request("/api/actions/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.body.csrfToken,
      },
      body: JSON.stringify({ actionId: validated.actionId, approvedBy: "attacker" }),
    }, session.cookie);
    assert.equal(approval.status, 200);

    const action = await AgentActionModel.findById(validated.actionId);
    assert.equal(String(action?.approval?.approvedBy), approverId);
    assert.equal(action?.approval?.approverEmail, "approver@example.test");
    const audit = await AuditLogModel.findOne({ event: "ACTION_APPROVED" });
    assert.equal(String(audit?.actorId), approverId);
    assert.equal(audit?.actorEmail, "approver@example.test");
  });

  it("does not leave an approval executable when approval audit storage fails", async () => {
    const session = await signIn("approver@example.test", "correct-horse-battery-staple");
    const validation = await request("/api/actions/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.body.csrfToken,
      },
      body: JSON.stringify({
        action: "CREATE_PAYMENT",
        items: [{ productId, quantity: 1 }],
        proposedAmountInPaise: 10000,
        reason: "Test purchase",
        requiresApproval: true,
        referenceId: "approval-audit-failure",
      }),
    }, session.cookie);
    assert.equal(validation.status, 200);
    const validated = await validation.json() as { actionId: string };

    const createDescriptor = Object.getOwnPropertyDescriptor(AuditLogModel, "create");
    const originalCreate = AuditLogModel.create;
    Object.defineProperty(AuditLogModel, "create", {
      configurable: true,
      value: async (...args: unknown[]) => {
        const [documents] = args;
        const records = Array.isArray(documents) ? documents : [documents];
        if (records.some((record) =>
          typeof record === "object" &&
          record !== null &&
          "event" in record &&
          record.event === "ACTION_APPROVED"
        )) {
          throw new Error("Simulated approval audit storage failure");
        }
        return Reflect.apply(originalCreate, AuditLogModel, args);
      },
    });

    try {
      const approval = await request("/api/actions/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session.body.csrfToken,
        },
        body: JSON.stringify({ actionId: validated.actionId }),
      }, session.cookie);
      assert.equal(approval.status, 500);
    } finally {
      if (createDescriptor) {
        Object.defineProperty(AuditLogModel, "create", createDescriptor);
      } else {
        Reflect.deleteProperty(AuditLogModel, "create");
      }
    }

    const action = await AgentActionModel.findById(validated.actionId);
    assert.equal(action?.approvalStatus, "PENDING");
    assert.equal(action?.approval, undefined);
    assert.equal(await AuditLogModel.exists({
      actionId: action?._id,
      event: "ACTION_APPROVED",
    }), null);

    const payment = await request("/api/payments/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.body.csrfToken,
      },
      body: JSON.stringify({ actionId: validated.actionId }),
    }, session.cookie);
    assert.equal(payment.status, 409);
    assert.equal(await OrderModel.countDocuments(), 0);
  });

  it("revokes the server-side session on CSRF-protected logout and denies public registration", async () => {
    const session = await signIn("approver@example.test", "correct-horse-battery-staple");
    const userCount = await UserModel.countDocuments();

    const registration = await request("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.body.csrfToken,
      },
      body: JSON.stringify({ email: "attacker@example.test", password: "strong-password", role: "admin" }),
    }, session.cookie);
    assert.equal(registration.status, 404);
    assert.equal(await UserModel.countDocuments(), userCount);

    const logout = await request("/api/auth/logout", {
      method: "POST",
      headers: { "X-CSRF-Token": session.body.csrfToken },
    }, session.cookie);
    assert.equal(logout.status, 204);
    const afterLogout = await request("/api/payments", {}, session.cookie);
    assert.equal(afterLogout.status, 401);
  });

  it("rejects expired sessions", async () => {
    const session = await signIn("approver@example.test", "correct-horse-battery-staple");
    await UserSessionModel.updateMany({}, { $set: { expiresAt: new Date(0) } });
    const response = await request("/api/payments", {}, session.cookie);
    assert.equal(response.status, 401);
  });

  it("rejects cross-origin browser access and throttles repeated login failures", async () => {
    const preflight = await request("/api/actions/approve", {
      method: "OPTIONS",
      headers: {
        Origin: "https://attacker.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-csrf-token",
      },
    });
    assert.notEqual(preflight.headers.get("access-control-allow-origin"), "https://attacker.example");

    let response: Response | undefined;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "unknown@example.test", password: "wrong-password" }),
      });
    }
    assert.equal(response?.status, 429);
  });

  it("uses forwarded client addresses for login throttling behind the configured proxy", async () => {
    for (let attempt = 1; attempt <= 11; attempt += 1) {
      const response = await request("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": `192.0.2.${attempt}`,
        },
        body: JSON.stringify({ email: `unknown-${attempt}@example.test`, password: "wrong-password" }),
      });
      assert.equal(response.status, 401);
    }
  });
});
