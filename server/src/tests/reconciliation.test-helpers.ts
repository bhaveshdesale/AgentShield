import { after, before, beforeEach } from "node:test";
import type {
  NextFunction,
  Request,
  Response as ExpressResponse,
} from "express";
import "../config/env";

import {
  connectDatabase,
  disconnectDatabase,
} from "../config/db";
import { validateAction } from "../controllers/action.controller";
import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";

const TEST_DB_NAME = "agentshield_payment_test";

export const testActor = {
  id: "64b000000000000000000001",
  email: "approver@example.test",
  role: "admin" as const,
};

let coffeeKitId = "";

function resolveTestUri(): string {
  const raw =
    process.env.MONGODB_TEST_URI ??
    process.env.MONGODB_URI ??
    "";

  if (raw.trim().length === 0) {
    throw new Error(
      "Set MONGODB_TEST_URI (or MONGODB_URI) to run payment tests.",
    );
  }

  return raw.replace(
    /\/[^/?]*(\?.*)?$/,
    `/${TEST_DB_NAME}$1`,
  );
}

export function setupPaymentTestSuite(): void {
  const originalFetch = globalThis.fetch;
  const originalRazorpayEnv = {
    NODE_ENV: process.env.NODE_ENV,
    CLIENT_URL: process.env.CLIENT_URL,
    FRONTEND_URL: process.env.FRONTEND_URL,
    RAZORPAY_MODE: process.env.RAZORPAY_MODE,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  };

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.CLIENT_URL = "https://checkout.example.test";
    process.env.FRONTEND_URL = "https://legacy.example.test";
    process.env.RAZORPAY_MODE = "test";
    process.env.RAZORPAY_KEY_ID = "rzp_test_dummy_key_id";
    process.env.RAZORPAY_KEY_SECRET = "dummy-test-api-secret";
    await connectDatabase(resolveTestUri());
  });

  beforeEach(async () => {
    await Promise.all([
      AgentActionModel.deleteMany({}),
      AuditLogModel.deleteMany({}),
      MerchantModel.deleteMany({}),
      OrderModel.deleteMany({}),
      ProductModel.deleteMany({}),
    ]);

    await MerchantModel.create({
      name: "Payment Test Store",
      policy: {
        maxTransactionAmount: 500000,
        maxDiscountPercent: 10,
        requireHumanApproval: true,
        allowRefunds: false,
        allowPayouts: false,
      },
    });

    const coffeeKit = await ProductModel.create({
      name: "Artisan Coffee Kit",
      description: "Test product",
      priceInPaise: 179900,
      currency: "INR",
      category: "coffee",
      tags: ["coffee"],
      inventory: 5,
      frequentlyBoughtWith: [],
    });

    coffeeKitId = String(coffeeKit._id);
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await disconnectDatabase();
    restoreRazorpayEnv(originalRazorpayEnv);
  });
}

function restoreRazorpayEnv(
  originalRazorpayEnv: Record<string, string | undefined>,
): void {
  for (const [name, value] of Object.entries(originalRazorpayEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

export function getCoffeeKitId(): string {
  return coffeeKitId;
}

export async function validate(
  body: Record<string, unknown>,
): Promise<{
  status: number;
  body: unknown;
}> {
  let status = 200;
  let responseBody: unknown;
  let forwarded: unknown;

  const res = {
    status(code: number) {
      status = code;
      return this;
    },

    json(payload: unknown) {
      responseBody = payload;
      return this;
    },
  };

  const next: NextFunction = (error?: unknown) => {
    forwarded = error;
  };

  await validateAction(
    { body } as Request,
    res as unknown as ExpressResponse,
    next,
  );

  if (forwarded) {
    throw forwarded;
  }

  return {
    status,
    body: responseBody,
  };
}

export function proposal(
  referenceId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    action: "CREATE_PAYMENT",
    items: [
      {
        productId: coffeeKitId,
        quantity: 1,
      },
    ],
    proposedAmountInPaise: 179900,
    reason: "Customer requested the coffee kit.",
    requiresApproval: true,
    referenceId,
    ...overrides,
  };
}

export function hasErrorMessage(
  pattern: RegExp,
): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    if (
      typeof error !== "object" ||
      error === null ||
      !("message" in error)
    ) {
      return false;
    }

    const message = String(
      (error as { message: unknown }).message,
    );

    return pattern.test(message);
  };
}
