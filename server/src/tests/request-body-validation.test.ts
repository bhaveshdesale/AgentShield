import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";

import * as actionController from "../controllers/action.controller";
import * as agentController from "../controllers/agent.controller";
import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { errorHandler } from "../middleware/errorHandler";

interface ControllerResponse {
  statusCode: number;
  body: unknown;
}

async function invokeController(
  controller: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  body: unknown,
  path: string,
): Promise<ControllerResponse> {
  let statusCode = 200;
  let responseBody: unknown;
  let forwardedError: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      responseBody = value;
      return this;
    },
  } as unknown as Response;
  const next: NextFunction = (error?: unknown) => {
    forwardedError = error;
  };

  await controller({ body } as Request, response, next);

  if (forwardedError !== undefined) {
    errorHandler(
      forwardedError,
      { method: "POST", path } as Request,
      response,
      (() => undefined) as NextFunction,
    );
  }

  return { statusCode, body: responseBody };
}

function assertBadRequest(
  response: ControllerResponse,
  code: string,
): void {
  assert.equal(response.statusCode, 400);
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  assert.equal(
    (response.body as { status: string }).status,
    "error",
  );
  assert.equal(
    (response.body as { code: string }).code,
    code,
  );
  assert.equal(
    typeof (response.body as { message: unknown }).message,
    "string",
  );
}

describe("action request body validation", () => {
  it("returns INVALID_PROPOSAL for non-object and incomplete proposal bodies", async (context) => {
    context.mock.method(console, "warn", () => undefined);
    const invalidBodies: unknown[] = [
      null,
      [],
      "proposal",
      42,
      {},
      { action: "CREATE_PAYMENT" },
      {
        action: 42,
        referenceId: "reference-1",
        reason: "Customer request",
        requiresApproval: true,
        proposedAmountInPaise: 100,
        items: [],
      },
      {
        action: "CREATE_PAYMENT",
        referenceId: "reference-1",
        reason: "Customer request",
        requiresApproval: true,
        proposedAmountInPaise: 100,
        items: "not-an-array",
      },
      {
        action: "CREATE_PAYMENT",
        referenceId: "reference-1",
        reason: "Customer request",
        requiresApproval: true,
        proposedAmountInPaise: 100,
        items: [null],
      },
      {
        action: "CREATE_PAYMENT",
        referenceId: "reference-1",
        reason: "Customer request",
        requiresApproval: "true",
        proposedAmountInPaise: 100,
        items: [{ productId: "507f1f77bcf86cd799439011", quantity: 1 }],
      },
    ];

    for (const body of invalidBodies) {
      const response = await invokeController(
        actionController.validateAction,
        body,
        "/api/actions/validate",
      );
      assertBadRequest(response, "INVALID_PROPOSAL");
    }
  });

  it("returns INVALID_ACTION_ID for non-object or incorrectly typed approval bodies", async (context) => {
    context.mock.method(console, "warn", () => undefined);

    for (const body of [null, [], "approval", 42, {}, { actionId: 42 }]) {
      const response = await invokeController(
        actionController.approveAction,
        body,
        "/api/actions/approve",
      );
      assertBadRequest(response, "INVALID_ACTION_ID");
    }
  });

  it("preserves valid proposal validation and persisted response behavior", async (context) => {
    const actionId = new Types.ObjectId();
    const createdActions: unknown[] = [];
    const merchant = {
      policy: {
        maxTransactionAmount: 1000,
        maxDiscountPercent: 10,
        requireHumanApproval: true,
        allowRefunds: false,
        allowPayouts: false,
      },
    };
    const productId = new Types.ObjectId("507f1f77bcf86cd799439011");

    context.mock.method(MerchantModel, "findOne", () => ({
      sort: async () => merchant,
    }) as never);
    context.mock.method(OrderModel, "findOne", async () => null);
    context.mock.method(ProductModel, "find", async () => [{
      _id: productId,
      priceInPaise: 100,
      inventory: 5,
    }] as never);
    context.mock.method(AgentActionModel, "create", async (document: unknown) => {
      createdActions.push(document);
      return {
        ...(document as Record<string, unknown>),
        _id: actionId,
        approvalStatus: "PENDING",
        executionStatus: "NOT_STARTED",
      } as never;
    });
    context.mock.method(AuditLogModel, "create", async () => ({} as never));
    context.mock.method(console, "log", () => undefined);

    const response = await invokeController(
      actionController.validateAction,
      {
        action: "CREATE_PAYMENT",
        items: [{ productId: String(productId), quantity: 1 }],
        proposedAmountInPaise: 100,
        reason: "Customer requested this product.",
        requiresApproval: true,
        referenceId: "valid-request-1",
        conversationId: "conversation-1",
      },
      "/api/actions/validate",
    );

    assert.equal(response.statusCode, 200);
    const responseBody = response.body as {
      actionId: string;
      decision: string;
      verifiedAmountInPaise: number;
      approvalRequired: boolean;
    };
    assert.equal(responseBody.actionId, String(actionId));
    assert.equal(responseBody.decision, "ALLOW");
    assert.equal(responseBody.verifiedAmountInPaise, 100);
    assert.equal(responseBody.approvalRequired, true);
    assert.equal(createdActions.length, 1);
    assert.equal(
      (createdActions[0] as { conversationId: string }).conversationId,
      "conversation-1",
    );
  });
});

describe("agent chat request body validation", () => {
  it("returns INVALID_REQUEST for non-object, missing, and incorrectly typed fields", async (context) => {
    context.mock.method(console, "warn", () => undefined);
    const invalidBodies: unknown[] = [
      null,
      [],
      "chat",
      42,
      {},
      { message: "  " },
      { message: 42 },
      { message: "Hello.", conversationId: 42 },
    ];

    for (const body of invalidBodies) {
      const response = await invokeController(
        agentController.agentChat,
        body,
        "/api/agent/chat",
      );
      assertBadRequest(response, "INVALID_REQUEST");
    }
  });

  it("preserves valid chat response behavior", async (context) => {
    const originalApiKey = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;
    context.after(() => {
      if (originalApiKey === undefined) {
        delete process.env.LLM_API_KEY;
      } else {
        process.env.LLM_API_KEY = originalApiKey;
      }
    });
    context.mock.method(ProductModel, "find", () => ({
      limit: async () => [],
    }) as never);
    context.mock.method(console, "log", () => undefined);

    const response = await invokeController(
      agentController.agentChat,
      { message: "  Find a product.  ", conversationId: " conversation-1 " },
      "/api/agent/chat",
    );

    assert.equal(response.statusCode, 200);
    const responseBody = response.body as {
      conversationId: string;
      source: string;
      message: string;
      recommendations: unknown[];
      proposal: unknown;
      policyResult: unknown;
    };
    assert.equal(responseBody.conversationId, "conversation-1");
    assert.equal(responseBody.source, "fallback");
    assert.ok(responseBody.message.length > 0);
    assert.deepEqual(responseBody.recommendations, []);
    assert.equal(responseBody.proposal, undefined);
    assert.equal(responseBody.policyResult, undefined);
  });
});
