import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";

import { errorHandler } from "../middleware/errorHandler";

describe("API error handler", () => {
  it("returns a client error for malformed JSON request bodies", () => {
    let statusCode = 0;
    let responseBody: unknown;
    const req = {
      method: "POST",
      path: "/api/actions/validate",
      requestId: "request-123",
    } as Request;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        responseBody = body;
        return this;
      },
    } as unknown as Response;
    const next = (() => undefined) as NextFunction;
    const malformedJsonError = Object.assign(
      new SyntaxError("Unexpected token"),
      { type: "entity.parse.failed", status: 400 },
    );

    errorHandler(malformedJsonError, req, res, next);

    assert.equal(statusCode, 400);
    assert.deepEqual(responseBody, {
      status: "error",
      code: "INVALID_JSON",
      message: "Request body must contain valid JSON.",
    });
  });
});
