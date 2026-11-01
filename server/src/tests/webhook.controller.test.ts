import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";

import { AuditLogModel } from "../models/AuditLog";
import { receiveRazorpayWebhook } from "../controllers/webhook.controller";
import { AppError } from "../utils/AppError";

describe("Razorpay webhook controller", () => {
  it("forwards signature errors when security-audit persistence fails", async (context) => {
    const originalMode = process.env.RAZORPAY_MODE;
    const originalSecret = process.env.RAZORPAY_TEST_WEBHOOK_SECRET;
    process.env.RAZORPAY_MODE = "test";
    process.env.RAZORPAY_TEST_WEBHOOK_SECRET = "unit-test-webhook-secret";
    context.after(() => {
      if (originalMode === undefined) {
        delete process.env.RAZORPAY_MODE;
      } else {
        process.env.RAZORPAY_MODE = originalMode;
      }
      if (originalSecret === undefined) {
        delete process.env.RAZORPAY_TEST_WEBHOOK_SECRET;
      } else {
        process.env.RAZORPAY_TEST_WEBHOOK_SECRET = originalSecret;
      }
    });

    context.mock.method(AuditLogModel, "create", async () => {
      throw new Error("MongoDB unavailable");
    });

    let forwardedError: unknown;
    const req = {
      get: (name: string) =>
        name.toLowerCase() === "x-razorpay-signature" ? "invalid" : undefined,
      body: Buffer.from("{}"),
    } as unknown as Request;
    const res = {} as Response;
    const next: NextFunction = (error?: unknown) => {
      forwardedError = error;
    };

    await receiveRazorpayWebhook(req, res, next);

    assert.ok(forwardedError instanceof AppError);
    assert.equal(forwardedError.code, "WEBHOOK_SIGNATURE_INVALID");
  });
});
