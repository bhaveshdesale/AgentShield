import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";

import { parseProposalInput } from "../controllers/action.controller";
import { AppError } from "../utils/AppError";

const PRODUCT_ID = "507f1f77bcf86cd799439011";

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "CREATE_PAYMENT",
    items: [{ productId: PRODUCT_ID, quantity: 2 }],
    proposedAmountInPaise: 2500,
    reason: "Customer requested the product.",
    requiresApproval: true,
    referenceId: "  proposal-123  ",
    ...overrides,
  };
}

function assertInvalidProposal(input: unknown): void {
  assert.throws(
    () => parseProposalInput(input),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 400 &&
      error.code === "INVALID_PROPOSAL",
  );
}

describe("parseProposalInput", () => {
  it("normalizes a valid proposal without changing accepted values", () => {
    const parsed = parseProposalInput(validInput());

    assert.equal(parsed.action, "CREATE_PAYMENT");
    assert.equal(String(parsed.items[0].productId), PRODUCT_ID);
    assert.ok(parsed.items[0].productId instanceof Types.ObjectId);
    assert.equal(parsed.items[0].quantity, 2);
    assert.equal(parsed.proposedAmountInPaise, 2500);
    assert.equal(parsed.reason, "Customer requested the product.");
    assert.equal(parsed.requiresApproval, true);
    assert.equal(parsed.referenceId, "proposal-123");
    assert.equal("discountPercent" in parsed, false);
  });

  it("rejects missing required fields and empty input", () => {
    assertInvalidProposal({});
    assertInvalidProposal(
      validInput({
        action: "",
        referenceId: "   ",
        proposedAmountInPaise: undefined,
        items: [],
      }),
    );
    assertInvalidProposal(
      validInput({
        reason: undefined,
      }),
    );
    assertInvalidProposal(
      validInput({
        requiresApproval: undefined,
      }),
    );
  });

  it("rejects primitive and array request bodies", () => {
    for (const body of [null, [], "proposal", 42]) {
      assertInvalidProposal(body);
    }
  });

  it("rejects non-array items and malformed item values", () => {
    assertInvalidProposal(validInput({ items: "not-an-array" }));
    assertInvalidProposal(validInput({ items: [null] }));
    assertInvalidProposal(validInput({ items: [42] }));
  });

  it("rejects invalid or missing product IDs", () => {
    assertInvalidProposal(
      validInput({ items: [{ productId: "invalid-id", quantity: 1 }] }),
    );
    assertInvalidProposal(
      validInput({ items: [{ quantity: 1 }] }),
    );
  });

  it("rejects zero, negative, and fractional item quantities", () => {
    for (const quantity of [0, -1, 1.5]) {
      assertInvalidProposal(
        validInput({ items: [{ productId: PRODUCT_ID, quantity }] }),
      );
    }
  });

  it("rejects malformed, fractional, and negative amounts but accepts zero", () => {
    for (const amount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "2500"]) {
      assertInvalidProposal(
        validInput({ proposedAmountInPaise: amount }),
      );
    }

    assert.equal(
      parseProposalInput(validInput({ proposedAmountInPaise: 0 }))
        .proposedAmountInPaise,
      0,
    );
  });

  it("preserves finite optional discounts and rejects malformed discounts", () => {
    assert.equal(
      parseProposalInput(validInput({ discountPercent: 12.5 })).discountPercent,
      12.5,
    );

    assertInvalidProposal(validInput({ discountPercent: "12.5" }));
    assertInvalidProposal(validInput({ discountPercent: Number.NaN }));
  });

  it("preserves either boolean approval value and rejects other types", () => {
    assert.equal(
      parseProposalInput(validInput({ requiresApproval: false })).requiresApproval,
      false,
    );
    assertInvalidProposal(validInput({ requiresApproval: "true" }));
    assertInvalidProposal(validInput({ reason: 42 }));
    assertInvalidProposal(validInput({ conversationId: 42 }));
  });
});
