import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readProductIdParam } from "../controllers/product.controller";
import { AppError } from "../utils/AppError";

describe("product route parameters", () => {
  it("accepts a single product ID", () => {
    assert.equal(readProductIdParam("product-id"), "product-id");
  });

  it("rejects repeated or non-string product IDs", () => {
    assert.throws(
      () => readProductIdParam(["first", "second"]),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 400 &&
        error.code === "INVALID_PRODUCT_ID",
    );
    assert.throws(
      () => readProductIdParam(undefined),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 400 &&
        error.code === "INVALID_PRODUCT_ID",
    );
  });
});
