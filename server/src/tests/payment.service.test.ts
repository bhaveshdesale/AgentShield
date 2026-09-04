// import assert from "node:assert/strict";
// import { after, before, beforeEach, describe, it } from "node:test";
// import type { NextFunction, Request, Response as ExpressResponse } from "express";
// import "../config/env";
// import { connectDatabase, disconnectDatabase } from "../config/db";
// import {
//   approveAction,
//   validateAction,
// } from "../controllers/action.controller";
// import { AgentActionModel } from "../models/AgentAction";
// import { AuditLogModel } from "../models/AuditLog";
// import { MerchantModel } from "../models/Merchant";
// import { OrderModel } from "../models/Order";
// import { ProductModel } from "../models/Product";
// import { Types } from "mongoose";
// import { reconcilePayment, approveActionAndCreatePayment } from "../services/payment.service";
// import {
//   createPaymentForApprovedAction,
// } from "../services/payment.service";
// const TEST_DB_NAME = "agentshield_payment_test";
// const originalFetch = globalThis.fetch;
// let coffeeKitId = "";

// function resolveTestUri(): string {
//   const raw = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI ?? "";
//   if (raw.trim().length === 0) {
//     throw new Error("Set MONGODB_TEST_URI (or MONGODB_URI) to run payment tests.");
//   }
//   return raw.replace(/\/[^/?]*(\?.*)?$/, `/${TEST_DB_NAME}$1`);
// }

// async function validate(body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
//   let status = 200;
//   let responseBody: unknown;
//   let forwarded: unknown;
//   const res = {
//     status(code: number) {
//       status = code;
//       return this;
//     },
//     json(payload: unknown) {
//       responseBody = payload;
//       return this;
//     },
//   };
//   const next: NextFunction = (error?: unknown) => {
//     forwarded = error;
//   };
//   await validateAction({ body } as Request, res as unknown as ExpressResponse, next);
//   if (forwarded) {
//     throw forwarded;
//   }
//   return { status, body: responseBody };
// }

// function proposal(referenceId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
//   return {
//     action: "CREATE_PAYMENT",
//     items: [{ productId: coffeeKitId, quantity: 1 }],
//     proposedAmountInPaise: 179900,
//     reason: "Customer requested the coffee kit.",
//     requiresApproval: true,
//     referenceId,
//     ...overrides,
//   };
// }

// describe("M5 approval and Razorpay execution", () => {
//   before(async () => {
//     await connectDatabase(resolveTestUri());
//   });

//   beforeEach(async () => {
//     await Promise.all([
//       AgentActionModel.deleteMany({}),
//       AuditLogModel.deleteMany({}),
//       MerchantModel.deleteMany({}),
//       OrderModel.deleteMany({}),
//       ProductModel.deleteMany({}),
//     ]);
//     await MerchantModel.create({
//       name: "Payment Test Store",
//       policy: {
//         maxTransactionAmount: 500000,
//         maxDiscountPercent: 10,
//         requireHumanApproval: true,
//         allowRefunds: false,
//         allowPayouts: false,
//       },
//     });
//     const coffeeKit = await ProductModel.create({
//       name: "Artisan Coffee Kit",
//       description: "Test product",
//       priceInPaise: 179900,
//       currency: "INR",
//       category: "coffee",
//       tags: ["coffee"],
//       inventory: 5,
//       frequentlyBoughtWith: [],
//     });
//     coffeeKitId = String(coffeeKit._id);
//   });

//   after(async () => {
//     globalThis.fetch = originalFetch;
//     await disconnectDatabase();
//   });

//   it("persists validation, requires approval, and never calls Razorpay before approval", async () => {
//     let calls = 0;
//     globalThis.fetch = async () => {
//       calls += 1;
//       throw new Error("Razorpay must not be called during validation");
//     };
//     const result = await validate(proposal("m5-validate-001"));
//     const response = result.body as { actionId: string; decision: string };
//     const action = await AgentActionModel.findById(response.actionId);

//     assert.equal(result.status, 200);
//     assert.equal(response.decision, "ALLOW");
//     assert.ok(action);
//     assert.equal(action?.approvalStatus, "PENDING");
//     assert.equal(action?.executionStatus, "NOT_STARTED");
//     assert.equal(action?.verifiedAmountInPaise, 179900);
//     assert.equal(calls, 0);
//   });
//   it("approves an ALLOW action without executing Razorpay", async () => {
//   let razorpayCalls = 0;

//   globalThis.fetch = async () => {
//     razorpayCalls += 1;

//     throw new Error(
//       "Razorpay must not be called during approval",
//     );
//   };

//   const validated = await validate(
//     proposal("m5-explicit-approval-001"),
//   );

//   const actionId = (
//     validated.body as {
//       actionId: string;
//     }
//   ).actionId;

//   let status = 200;
//   let responseBody: unknown;

//   const req = {
//     body: {
//       actionId,
//     },
//   } as Request;

//   const res = {
//     status(code: number) {
//       status = code;
//       return this;
//     },

//     json(payload: unknown) {
//       responseBody = payload;
//       return this;
//     },
//   } as unknown as ExpressResponse;

//   let forwarded: unknown;

//   const next: NextFunction = (
//     error?: unknown,
//   ) => {
//     forwarded = error;
//   };

//   await approveAction(req, res, next);

//   if (forwarded) {
//     throw forwarded;
//   }

//   assert.equal(status, 200);

//   const action =
//     await AgentActionModel.findById(
//       actionId,
//     );

//   assert.equal(
//     action?.approvalStatus,
//     "APPROVED",
//   );

//   assert.equal(
//     action?.executionStatus,
//     "NOT_STARTED",
//   );

//   assert.equal(
//     razorpayCalls,
//     0,
//   );

//   assert.ok(responseBody);
// });
// it("rejects payment creation when human approval has not happened", async () => {
//   let razorpayCalls = 0;

//   globalThis.fetch = async () => {
//     razorpayCalls += 1;

//     throw new Error(
//       "Razorpay must not be called",
//     );
//   };

//   const validated = await validate(
//     proposal("m5-no-approval-002"),
//   );

//   const actionId = (
//     validated.body as {
//       actionId: string;
//     }
//   ).actionId;

//   await assert.rejects(
//     () =>
//       createPaymentForApprovedAction({
//         actionId,
//         credentials: {
//           keyId: "test_id",
//           keySecret: "test_secret",
//         },
//       }),
//     (error: unknown) => {
//       if (
//         typeof error !== "object" ||
//         error === null ||
//         !("message" in error)
//       ) {
//         return false;
//       }

//       return /approval/i.test(
//         String((error as { message: unknown }).message),
//       );
//     },
//   );

//   const action =
//     await AgentActionModel.findById(actionId);

//   assert.equal(
//     action?.approvalStatus,
//     "PENDING",
//   );

//   assert.equal(
//     action?.executionStatus,
//     "NOT_STARTED",
//   );

//   assert.equal(
//     razorpayCalls,
//     0,
//   );

//   assert.equal(
//     await OrderModel.countDocuments(),
//     0,
//   );
// });
// it("executes payment only after explicit approval", async () => {
//   let razorpayCalls = 0;

//   globalThis.fetch = async () => {
//     razorpayCalls += 1;

//     return new Response(
//       JSON.stringify({
//         id: "plink_explicit_003",
//         short_url:
//           "https://rzp.test/plink_explicit_003",
//         status: "created",
//       }),
//       {
//         status: 200,
//         headers: {
//           "content-type":
//             "application/json",
//         },
//       },
//     );
//   };

//   // STEP 1 — validate
//   const validated = await validate(
//     proposal("m5-explicit-flow-003"),
//   );

//   const actionId = (
//     validated.body as {
//       actionId: string;
//     }
//   ).actionId;

//   const beforeApproval =
//     await AgentActionModel.findById(
//       actionId,
//     );

//   assert.equal(
//     beforeApproval?.approvalStatus,
//     "PENDING",
//   );

//   assert.equal(
//     beforeApproval?.executionStatus,
//     "NOT_STARTED",
//   );

//   assert.equal(
//     razorpayCalls,
//     0,
//   );

//   // STEP 2 — explicit human approval
//   let approvalStatus = 200;
//   let approvalBody: unknown;

//   const req = {
//     body: {
//       actionId,
//     },
//   } as Request;

//   const res = {
//     status(code: number) {
//       approvalStatus = code;
//       return this;
//     },

//     json(payload: unknown) {
//       approvalBody = payload;
//       return this;
//     },
//   } as unknown as ExpressResponse;

//   let forwarded: unknown;

//   const next: NextFunction = (
//     error?: unknown,
//   ) => {
//     forwarded = error;
//   };

//   await approveAction(
//     req,
//     res,
//     next,
//   );

//   if (forwarded) {
//     throw forwarded;
//   }

//   assert.equal(
//     approvalStatus,
//     200,
//   );

//   assert.ok(approvalBody);

//   const afterApproval =
//     await AgentActionModel.findById(
//       actionId,
//     );

//   assert.equal(
//     afterApproval?.approvalStatus,
//     "APPROVED",
//   );

//   assert.equal(
//     afterApproval?.executionStatus,
//     "NOT_STARTED",
//   );

//   // STEP 3 — payment execution
//   const payment =
//     await createPaymentForApprovedAction({
//       actionId,
//       credentials: {
//         keyId: "test_id",
//         keySecret: "test_secret",
//       },
//     });

//   assert.equal(
//     payment.success,
//     true,
//   );

//   assert.equal(
//     payment.paymentLinkId,
//     "plink_explicit_003",
//   );

//   assert.equal(
//     razorpayCalls,
//     1,
//   );

//   const finalAction =
//     await AgentActionModel.findById(
//       actionId,
//     );

//   assert.equal(
//     finalAction?.approvalStatus,
//     "APPROVED",
//   );

//   assert.equal(
//     finalAction?.executionStatus,
//     "SUCCEEDED",
//   );

//   const order =
//     await OrderModel.findOne({
//       referenceId:
//         "m5-explicit-flow-003",
//     });

//   assert.ok(order);

//   assert.equal(
//     order?.status,
//     "AWAITING_PAYMENT",
//   );

//   assert.equal(
//     order?.amountInPaise,
//     179900,
//   );
// });

//   it("blocks malformed mixed item input instead of silently dropping it", async () => {
//     await assert.rejects(
//       () => validate(proposal("m5-invalid-items-002", { items: [{ productId: coffeeKitId, quantity: 1 }, { productId: "bad", quantity: 1 }] })),
//       (error: unknown) => error instanceof Error && error.message.includes("Each item")
//     );
//   });

//   it("rejects a missing action and a blocked action", async () => {
//     await assert.rejects(
//       () => approveActionAndCreatePayment({ actionId: "507f1f77bcf86cd799439011" }),
//       (error: unknown) => error instanceof Error && error.message.includes("not found")
//     );
//     const blocked = await validate(proposal("m5-blocked-003", { proposedAmountInPaise: 1 }));
//     const actionId = (blocked.body as { actionId: string }).actionId;
//     await assert.rejects(
//       () => approveActionAndCreatePayment({ actionId }),
//       (error: unknown) => error instanceof Error && error.message.includes("policy-allowed")
//     );
//   });

//   it("recomputes price, creates one payment link, and stores authoritative order prices", async () => {
//     let calls = 0;
//     globalThis.fetch = async () => {
//       calls += 1;
//       return new Response(JSON.stringify({ id: "plink_m5", short_url: "https://rzp.test/plink_m5", status: "created" }), { status: 200 });
//     };
//     const validated = await validate(proposal("m5-approved-004"));
//     const actionId = (validated.body as { actionId: string }).actionId;
//     const approved = await approveActionAndCreatePayment({ actionId, credentials: { keyId: "test_id", keySecret: "test_secret" } });
//     const order = await OrderModel.findById(approved.orderId);

//     assert.equal(calls, 1);
//     assert.equal(approved.paymentLinkId, "plink_m5");
//     assert.equal(order?.status, "AWAITING_PAYMENT");
//     assert.equal(order?.amountInPaise, 179900);
//     assert.equal(order?.items[0].unitPriceInPaise, 179900);
//     await assert.rejects(() => approveActionAndCreatePayment({ actionId, credentials: { keyId: "test_id", keySecret: "test_secret" } }));
//     await assert.rejects(() => validate(proposal("m5-approved-004")));
//     assert.equal(await OrderModel.countDocuments({ referenceId: "m5-approved-004" }), 1);
//     assert.equal(calls, 1);
//   });

//   it("re-evaluates the persisted allowed proposal and executes against unchanged policy and catalog", async () => {
//     let calls = 0;
//     globalThis.fetch = async () => {
//       calls += 1;
//       return new Response(JSON.stringify({ id: "plink_m5_regression", short_url: "https://rzp.test/plink_m5_regression", status: "created" }), { status: 200 });
//     };
//     const validated = await validate(proposal("m5-revalidation-regression-005"));
//     const actionId = (validated.body as { actionId: string }).actionId;
//     const persisted = await AgentActionModel.findById(actionId);

//     assert.equal(persisted?.policyResult?.decision, "ALLOW");
//     assert.equal(persisted?.proposal.proposedAmountInPaise, 179900);
//     assert.equal(String(persisted?.proposal.items[0].productId), coffeeKitId);

//     const approved = await approveActionAndCreatePayment({ actionId, credentials: { keyId: "test_id", keySecret: "test_secret" } });

//     assert.equal(calls, 1);
//     assert.equal(approved.paymentLinkId, "plink_m5_regression");
//     assert.equal((await AgentActionModel.findById(actionId))?.executionStatus, "SUCCEEDED");
//   });

//   it("fails safely when Razorpay rejects the request", async () => {
//     globalThis.fetch = async () => new Response(JSON.stringify({ error: { description: "declined" } }), { status: 500 });
//     const validated = await validate(proposal("m5-failure-005"));
//     const actionId = (validated.body as { actionId: string }).actionId;
//     await assert.rejects(() => approveActionAndCreatePayment({ actionId, credentials: { keyId: "test_id", keySecret: "test_secret" } }));
//     const [action, order] = await Promise.all([
//       AgentActionModel.findById(actionId),
//       OrderModel.findOne({ referenceId: "m5-failure-005" }),
//     ]);
//     assert.equal(action?.executionStatus, "FAILED");
//     assert.equal(order?.status, "FAILED");
//     assert.ok(await AuditLogModel.exists({ actionId, event: "PAYMENT_EXECUTION_FAILED" }));
//   });
// });

// describe("M7 payment UNKNOWN-state recovery and reconciliation", () => {
//   before(async () => {
//     await connectDatabase(resolveTestUri());
//   });

//   beforeEach(async () => {
//     await Promise.all([
//       AgentActionModel.deleteMany({}),
//       AuditLogModel.deleteMany({}),
//       MerchantModel.deleteMany({}),
//       OrderModel.deleteMany({}),
//       ProductModel.deleteMany({}),
//     ]);
//     await MerchantModel.create({
//       name: "Payment Test Store",
//       policy: {
//         maxTransactionAmount: 500000,
//         maxDiscountPercent: 10,
//         requireHumanApproval: true,
//         allowRefunds: false,
//         allowPayouts: false,
//       },
//     });
//     const coffeeKit = await ProductModel.create({
//       name: "Artisan Coffee Kit",
//       description: "Test product",
//       priceInPaise: 179900,
//       currency: "INR",
//       category: "coffee",
//       tags: ["coffee"],
//       inventory: 5,
//       frequentlyBoughtWith: [],
//     });
//     coffeeKitId = String(coffeeKit._id);
//   });

//   after(async () => {
//     globalThis.fetch = originalFetch;
//     await disconnectDatabase();
//   });

//   it("sets order to UNKNOWN when Razorpay call times out", async () => {
//     globalThis.fetch = async () => {
//       const error = new Error("The operation was aborted.");
//       error.name = "AbortError";
//       throw error;
//     };

//     const validated = await validate(proposal("m7-timeout-001"));
//     const actionId = (validated.body as { actionId: string }).actionId;
//     await assert.rejects(() => approveActionAndCreatePayment({ actionId, credentials: { keyId: "test_id", keySecret: "test_secret" } }));

//     const [action, order] = await Promise.all([
//       AgentActionModel.findById(actionId),
//       OrderModel.findOne({ referenceId: "m7-timeout-001" }),
//     ]);
//     assert.equal(action?.executionStatus, "UNKNOWN");
//     assert.equal(order?.status, "UNKNOWN");
//     assert.ok(await AuditLogModel.exists({ actionId, event: "PAYMENT_EXECUTION_UNKNOWN" }));
//   });

//   it("sets order to FAILED for known Razorpay rejection", async () => {
//     globalThis.fetch = async () => new Response(JSON.stringify({ error: { description: "declined" } }), { status: 500 });
//     const validated = await validate(proposal("m7-rejection-002"));
//     const actionId = (validated.body as { actionId: string }).actionId;
//     await assert.rejects(() => approveActionAndCreatePayment({ actionId, credentials: { keyId: "test_id", keySecret: "test_secret" } }));
//     const [action, order] = await Promise.all([
//       AgentActionModel.findById(actionId),
//       OrderModel.findOne({ referenceId: "m7-rejection-002" }),
//     ]);
//     assert.equal(action?.executionStatus, "FAILED");
//     assert.equal(order?.status, "FAILED");
//   });

//   it("recovers an UNKNOWN order with an existing paid payment link", async () => {
//     await OrderModel.create({
//       items: [{ productId: new Types.ObjectId(coffeeKitId), quantity: 1, unitPriceInPaise: 179900 }],
//       amountInPaise: 179900,
//       currency: "INR",
//       status: "UNKNOWN",
//       referenceId: "m7-recover-003",
//       razorpayPaymentLinkId: "plink_existing_003",
//       razorpayPaymentLinkUrl: "https://rzp.test/plink_existing_003",
//     });

//     globalThis.fetch = async () => new Response(JSON.stringify({
//       id: "plink_existing_003",
//       short_url: "https://rzp.test/plink_existing_003",
//       status: "paid",
//     }), { status: 200 });

//     const order = await OrderModel.findOne({ referenceId: "m7-recover-003" });
//     const result = await reconcilePayment({ orderId: String(order!._id), credentials: { keyId: "test_id", keySecret: "test_secret" } });

//     assert.equal(result.status, "PAID");
//     assert.equal(result.paymentLinkId, "plink_existing_003");
//     const updated = await OrderModel.findOne({ referenceId: "m7-recover-003" });
//     assert.equal(updated?.status, "PAID");
//     assert.ok(await AuditLogModel.exists({ event: "RECOVERY_STARTED" }));
//     assert.ok(await AuditLogModel.exists({ event: "RECOVERY_PAYMENT_FOUND" }));
//     assert.ok(await AuditLogModel.exists({ event: "RECOVERY_PAYMENT_CONFIRMED" }));
//   });

//   it("reuses the existing payment link when found", async () => {
//     await OrderModel.create({
//       items: [{ productId: new Types.ObjectId(coffeeKitId), quantity: 1, unitPriceInPaise: 179900 }],
//       amountInPaise: 179900,
//       currency: "INR",
//       status: "UNKNOWN",
//       referenceId: "m7-reuse-004",
//       razorpayPaymentLinkId: "plink_reuse_004",
//       razorpayPaymentLinkUrl: "https://rzp.test/plink_reuse_004",
//     });

//     globalThis.fetch = async () => new Response(JSON.stringify({
//       id: "plink_reuse_004",
//       short_url: "https://rzp.test/plink_reuse_004",
//       status: "created",
//     }), { status: 200 });

//     const order = await OrderModel.findOne({ referenceId: "m7-reuse-004" });
//     const result = await reconcilePayment({ orderId: String(order!._id), credentials: { keyId: "test_id", keySecret: "test_secret" } });

//     assert.equal(result.status, "RECOVERED");
//     assert.equal(result.paymentLinkId, "plink_reuse_004");
//     const updated = await OrderModel.findOne({ referenceId: "m7-reuse-004" });
//     assert.equal(updated?.razorpayPaymentLinkId, "plink_reuse_004");
//   });

//   it("returns UNKNOWN when lookup fails and does not retry", async () => {
//     await OrderModel.create({
//       items: [{ productId: new Types.ObjectId(coffeeKitId), quantity: 1, unitPriceInPaise: 179900 }],
//       amountInPaise: 179900,
//       currency: "INR",
//       status: "UNKNOWN",
//       referenceId: "m7-unresolved-005",
//     });

//     globalThis.fetch = async () => {
//       const error = new Error("Network connection lost.");
//       error.name = "TypeError";
//       throw error;
//     };

//     const order = await OrderModel.findOne({ referenceId: "m7-unresolved-005" });
//     await assert.rejects(() => reconcilePayment({ orderId: String(order!._id), credentials: { keyId: "test_id", keySecret: "test_secret" } }));

//     const updated = await OrderModel.findOne({ referenceId: "m7-unresolved-005" });
//     assert.equal(updated?.status, "UNKNOWN");
//     assert.ok(await AuditLogModel.exists({ event: "RECOVERY_UNRESOLVED" }));
//   });

//   it("performs safe retry only after successful empty lookup", async () => {
//     await OrderModel.create({
//       items: [{ productId: new Types.ObjectId(coffeeKitId), quantity: 1, unitPriceInPaise: 179900 }],
//       amountInPaise: 179900,
//       currency: "INR",
//       status: "UNKNOWN",
//       referenceId: "m7-safe-retry-006",
//     });

//     let fetchCalls = 0;
//     globalThis.fetch = async (input: unknown) => {
//       fetchCalls += 1;
//       const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : "";

//       if (urlStr.includes("/payment_links?reference_id=")) {
//         return new Response(JSON.stringify({ payment_links: [] }), { status: 200 });
//       }

//       return new Response(JSON.stringify({ id: "plink_retry_006", short_url: "https://rzp.test/plink_retry_006", status: "created" }), { status: 200 });
//     };

//     const order = await OrderModel.findOne({ referenceId: "m7-safe-retry-006" });
//     const result = await reconcilePayment({ orderId: String(order!._id), credentials: { keyId: "test_id", keySecret: "test_secret" } });

//     assert.equal(result.status, "AWAITING_PAYMENT");
//     assert.equal(result.paymentLinkId, "plink_retry_006");
//     assert.equal(fetchCalls, 2);
//     const updated = await OrderModel.findOne({ referenceId: "m7-safe-retry-006" });
//     assert.equal(updated?.status, "AWAITING_PAYMENT");
//     assert.ok(await AuditLogModel.exists({ event: "RECOVERY_SAFE_RETRY" }));
//   });

//   it("protects against concurrent recovery", async () => {
//     await OrderModel.create({
//       items: [{ productId: new Types.ObjectId(coffeeKitId), quantity: 1, unitPriceInPaise: 179900 }],
//       amountInPaise: 179900,
//       currency: "INR",
//       status: "UNKNOWN",
//       referenceId: "m7-concurrent-007",
//       razorpayPaymentLinkId: "plink_concurrent_007",
//       razorpayPaymentLinkUrl: "https://rzp.test/plink_concurrent_007",
//     });

//     globalThis.fetch = async () => new Response(JSON.stringify({
//       id: "plink_concurrent_007",
//       short_url: "https://rzp.test/plink_concurrent_007",
//       status: "created",
//     }), { status: 200 });

//     const order = await OrderModel.findOne({ referenceId: "m7-concurrent-007" });
//     const orderId = String(order!._id);

//     const first = await reconcilePayment({ orderId, credentials: { keyId: "test_id", keySecret: "test_secret" } });
//     assert.equal(first.status, "RECOVERED");

//     await assert.rejects(
//       () => reconcilePayment({ orderId, credentials: { keyId: "test_id", keySecret: "test_secret" } }),
//       (error: unknown) => error instanceof Error && error.message.includes("UNKNOWN state")
//     );
//   });

//   it("rejects reconciliation for non-UNKNOWN orders", async () => {
//     await OrderModel.create({
//       items: [{ productId: new Types.ObjectId(coffeeKitId), quantity: 1, unitPriceInPaise: 179900 }],
//       amountInPaise: 179900,
//       currency: "INR",
//       status: "AWAITING_PAYMENT",
//       referenceId: "m7-non-unknown-008",
//     });

//     const order = await OrderModel.findOne({ referenceId: "m7-non-unknown-008" });
//     await assert.rejects(
//       () => reconcilePayment({ orderId: String(order!._id), credentials: { keyId: "test_id", keySecret: "test_secret" } }),
//       (error: unknown) => error instanceof Error && error.message.includes("UNKNOWN state")
//     );
//   });

//   it("records recovery audit events", async () => {
//     await OrderModel.create({
//       items: [{ productId: new Types.ObjectId(coffeeKitId), quantity: 1, unitPriceInPaise: 179900 }],
//       amountInPaise: 179900,
//       currency: "INR",
//       status: "UNKNOWN",
//       referenceId: "m7-audit-009",
//       razorpayPaymentLinkId: "plink_audit_009",
//       razorpayPaymentLinkUrl: "https://rzp.test/plink_audit_009",
//     });

//     globalThis.fetch = async () => new Response(JSON.stringify({
//       id: "plink_audit_009",
//       short_url: "https://rzp.test/plink_audit_009",
//       status: "created",
//     }), { status: 200 });

//     const order = await OrderModel.findOne({ referenceId: "m7-audit-009" });
//     await reconcilePayment({ orderId: String(order!._id), credentials: { keyId: "test_id", keySecret: "test_secret" } });

//     assert.ok(await AuditLogModel.exists({ event: "RECOVERY_STARTED" }));
//     assert.ok(await AuditLogModel.exists({ event: "RECOVERY_PAYMENT_FOUND" }));
//   });

//   it("recalculates authoritative amount before safe retry", async () => {
//     await OrderModel.create({
//       items: [{ productId: new Types.ObjectId(coffeeKitId), quantity: 1, unitPriceInPaise: 179900 }],
//       amountInPaise: 179900,
//       currency: "INR",
//       status: "UNKNOWN",
//       referenceId: "m7-amount-010",
//     });

//     await ProductModel.findByIdAndUpdate(coffeeKitId, { priceInPaise: 99900 });

//     globalThis.fetch = async (input: unknown) => {
//       const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : "";
//       if (urlStr.includes("/payment_links?reference_id=")) {
//         return new Response(JSON.stringify({ payment_links: [] }), { status: 200 });
//       }
//       return new Response(JSON.stringify({ id: "plink_amount_010", short_url: "https://rzp.test/plink_amount_010", status: "created" }), { status: 200 });
//     };

//     const order = await OrderModel.findOne({ referenceId: "m7-amount-010" });
//     const result = await reconcilePayment({ orderId: String(order!._id), credentials: { keyId: "test_id", keySecret: "test_secret" } });

//     assert.equal(result.status, "AWAITING_PAYMENT");
//     assert.ok(await AuditLogModel.exists({ event: "RECOVERY_SAFE_RETRY", "details.verifiedAmountInPaise": 99900 }));
//   });
// });



import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
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

import {
  approveAction,
  validateAction,
} from "../controllers/action.controller";

import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { Types } from "mongoose";

import {
  approveActionAndCreatePayment,
  createPaymentForApprovedAction,
  reconcilePayment,
} from "../services/payment.service";

const TEST_DB_NAME = "agentshield_payment_test";

const originalFetch = globalThis.fetch;

let coffeeKitId = "";

/**
 * Resolve a dedicated MongoDB database for this test suite.
 *
 * Example:
 * mongodb://localhost:27017/agentshield
 * becomes:
 * mongodb://localhost:27017/agentshield_payment_test
 */
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

/**
 * Call validateAction directly without starting an HTTP server.
 */
async function validate(
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

/**
 * Standard CREATE_PAYMENT proposal used throughout the tests.
 */
function proposal(
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

/**
 * Assert an error message without relying on instanceof Error.
 *
 * AppError can cross module/runtime boundaries in test execution,
 * so checking the actual error message is more robust.
 */
function hasErrorMessage(
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

describe("M5 approval and Razorpay execution", () => {
  before(async () => {
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
  });

  it(
    "persists validation, requires approval, and never calls Razorpay before approval",
    async () => {
      let calls = 0;

      globalThis.fetch = async () => {
        calls += 1;

        throw new Error(
          "Razorpay must not be called during validation",
        );
      };

      const result = await validate(
        proposal("m5-validate-001"),
      );

      const response = result.body as {
        actionId: string;
        decision: string;
      };

      const action =
        await AgentActionModel.findById(
          response.actionId,
        );

      assert.equal(result.status, 200);
      assert.equal(response.decision, "ALLOW");

      assert.ok(action);

      assert.equal(
        action?.approvalStatus,
        "PENDING",
      );

      assert.equal(
        action?.executionStatus,
        "NOT_STARTED",
      );

      assert.equal(
        action?.verifiedAmountInPaise,
        179900,
      );

      assert.equal(calls, 0);
    },
  );

  it(
    "approves an ALLOW action without executing Razorpay",
    async () => {
      let razorpayCalls = 0;

      globalThis.fetch = async () => {
        razorpayCalls += 1;

        throw new Error(
          "Razorpay must not be called during approval",
        );
      };

      const validated = await validate(
        proposal(
          "m5-explicit-approval-001",
        ),
      );

      const actionId = (
        validated.body as {
          actionId: string;
        }
      ).actionId;

      let status = 200;
      let responseBody: unknown;

      const req = {
        body: {
          actionId,
        },
      } as Request;

      const res = {
        status(code: number) {
          status = code;
          return this;
        },

        json(payload: unknown) {
          responseBody = payload;
          return this;
        },
      } as unknown as ExpressResponse;

      let forwarded: unknown;

      const next: NextFunction = (
        error?: unknown,
      ) => {
        forwarded = error;
      };

      await approveAction(
        req,
        res,
        next,
      );

      if (forwarded) {
        throw forwarded;
      }

      assert.equal(status, 200);

      const action =
        await AgentActionModel.findById(
          actionId,
        );

      assert.equal(
        action?.approvalStatus,
        "APPROVED",
      );

      assert.equal(
        action?.executionStatus,
        "NOT_STARTED",
      );

      assert.equal(
        razorpayCalls,
        0,
      );

      assert.ok(responseBody);
    },
  );

  it(
    "rejects payment creation when human approval has not happened",
    async () => {
      let razorpayCalls = 0;

      globalThis.fetch = async () => {
        razorpayCalls += 1;

        throw new Error(
          "Razorpay must not be called",
        );
      };

      const validated = await validate(
        proposal("m5-no-approval-002"),
      );

      const actionId = (
        validated.body as {
          actionId: string;
        }
      ).actionId;

      await assert.rejects(
  () =>
    createPaymentForApprovedAction({
      actionId,
      credentials: {
        keyId: "test_id",
        keySecret: "test_secret",
      },
    }),
  /Action must be explicitly approved before payment creation/,
);

      const action =
        await AgentActionModel.findById(
          actionId,
        );

      assert.equal(
        action?.approvalStatus,
        "PENDING",
      );

      assert.equal(
        action?.executionStatus,
        "NOT_STARTED",
      );

      assert.equal(
        razorpayCalls,
        0,
      );

      assert.equal(
        await OrderModel.countDocuments(),
        0,
      );
    },
  );

  it(
    "executes payment only after explicit approval",
    async () => {
      let razorpayCalls = 0;

      globalThis.fetch = async () => {
        razorpayCalls += 1;

        return new Response(
          JSON.stringify({
            id: "plink_explicit_003",
            short_url:
              "https://rzp.test/plink_explicit_003",
            status: "created",
          }),
          {
            status: 200,
            headers: {
              "content-type":
                "application/json",
            },
          },
        );
      };

      // STEP 1 — validate

      const validated = await validate(
        proposal(
          "m5-explicit-flow-003",
        ),
      );

      const actionId = (
        validated.body as {
          actionId: string;
        }
      ).actionId;

      const beforeApproval =
        await AgentActionModel.findById(
          actionId,
        );

      assert.equal(
        beforeApproval?.approvalStatus,
        "PENDING",
      );

      assert.equal(
        beforeApproval?.executionStatus,
        "NOT_STARTED",
      );

      assert.equal(
        razorpayCalls,
        0,
      );

      // STEP 2 — explicit human approval

      let approvalStatus = 200;
      let approvalBody: unknown;

      const req = {
        body: {
          actionId,
        },
      } as Request;

      const res = {
        status(code: number) {
          approvalStatus = code;
          return this;
        },

        json(payload: unknown) {
          approvalBody = payload;
          return this;
        },
      } as unknown as ExpressResponse;

      let forwarded: unknown;

      const next: NextFunction = (
        error?: unknown,
      ) => {
        forwarded = error;
      };

      await approveAction(
        req,
        res,
        next,
      );

      if (forwarded) {
        throw forwarded;
      }

      assert.equal(
        approvalStatus,
        200,
      );

      assert.ok(approvalBody);

      const afterApproval =
        await AgentActionModel.findById(
          actionId,
        );

      assert.equal(
        afterApproval?.approvalStatus,
        "APPROVED",
      );

      assert.equal(
        afterApproval?.executionStatus,
        "NOT_STARTED",
      );

      // STEP 3 — payment execution

      const payment =
        await createPaymentForApprovedAction({
          actionId,

          credentials: {
            keyId: "test_id",
            keySecret: "test_secret",
          },
        });

      assert.equal(
        payment.success,
        true,
      );

      assert.equal(
        payment.paymentLinkId,
        "plink_explicit_003",
      );

      assert.equal(
        razorpayCalls,
        1,
      );

      const finalAction =
        await AgentActionModel.findById(
          actionId,
        );

      assert.equal(
        finalAction?.approvalStatus,
        "APPROVED",
      );

      assert.equal(
        finalAction?.executionStatus,
        "SUCCEEDED",
      );

      const order =
        await OrderModel.findOne({
          referenceId:
            "m5-explicit-flow-003",
        });

      assert.ok(order);

      assert.equal(
        order?.status,
        "AWAITING_PAYMENT",
      );

      assert.equal(
        order?.amountInPaise,
        179900,
      );
    },
  );

  it(
    "blocks malformed mixed item input instead of silently dropping it",
    async () => {
      await assert.rejects(
        () =>
          validate(
            proposal(
              "m5-invalid-items-002",
              {
                items: [
                  {
                    productId:
                      coffeeKitId,
                    quantity: 1,
                  },
                  {
                    productId: "bad",
                    quantity: 1,
                  },
                ],
              },
            ),
          ),

        hasErrorMessage(
          /Each item/i,
        ),
      );
    },
  );

  it(
    "rejects a missing action and a blocked action",
    async () => {
      await assert.rejects(
        () =>
          approveActionAndCreatePayment({
            actionId:
              "507f1f77bcf86cd799439011",
          }),

        hasErrorMessage(/not found/i),
      );

      const blocked = await validate(
        proposal(
          "m5-blocked-003",
          {
            proposedAmountInPaise: 1,
          },
        ),
      );

      const actionId = (
        blocked.body as {
          actionId: string;
        }
      ).actionId;

      await assert.rejects(
        () =>
          approveActionAndCreatePayment({
            actionId,
          }),

        hasErrorMessage(
          /policy-allowed/i,
        ),
      );
    },
  );

  it(
    "recomputes price, creates one payment link, and stores authoritative order prices",
    async () => {
      let calls = 0;

      globalThis.fetch = async () => {
        calls += 1;

        return new Response(
          JSON.stringify({
            id: "plink_m5",
            short_url:
              "https://rzp.test/plink_m5",
            status: "created",
          }),
          {
            status: 200,
          },
        );
      };

      const validated = await validate(
        proposal("m5-approved-004"),
      );

      const actionId = (
        validated.body as {
          actionId: string;
        }
      ).actionId;

      const approved =
        await approveActionAndCreatePayment({
          actionId,

          credentials: {
            keyId: "test_id",
            keySecret: "test_secret",
          },
        });

      const order =
        await OrderModel.findById(
          approved.orderId,
        );

      assert.equal(calls, 1);

      assert.equal(
        approved.paymentLinkId,
        "plink_m5",
      );

      assert.equal(
        order?.status,
        "AWAITING_PAYMENT",
      );

      assert.equal(
        order?.amountInPaise,
        179900,
      );

      assert.equal(
        order?.items[0]
          .unitPriceInPaise,
        179900,
      );

      await assert.rejects(
        () =>
          approveActionAndCreatePayment({
            actionId,

            credentials: {
              keyId: "test_id",
              keySecret: "test_secret",
            },
          }),
      );

      await assert.rejects(
        () =>
          validate(
            proposal(
              "m5-approved-004",
            ),
          ),
      );

      assert.equal(
        await OrderModel.countDocuments({
          referenceId:
            "m5-approved-004",
        }),
        1,
      );

      assert.equal(calls, 1);
    },
  );

  it(
    "re-evaluates the persisted allowed proposal and executes against unchanged policy and catalog",
    async () => {
      let calls = 0;

      globalThis.fetch = async () => {
        calls += 1;

        return new Response(
          JSON.stringify({
            id:
              "plink_m5_regression",
            short_url:
              "https://rzp.test/plink_m5_regression",
            status: "created",
          }),
          {
            status: 200,
          },
        );
      };

      const validated = await validate(
        proposal(
          "m5-revalidation-regression-005",
        ),
      );

      const actionId = (
        validated.body as {
          actionId: string;
        }
      ).actionId;

      const persisted =
        await AgentActionModel.findById(
          actionId,
        );

      assert.equal(
        persisted?.policyResult?.decision,
        "ALLOW",
      );

      assert.equal(
        persisted?.proposal
          .proposedAmountInPaise,
        179900,
      );

      assert.equal(
        String(
          persisted?.proposal.items[0]
            .productId,
        ),
        coffeeKitId,
      );

      const approved =
        await approveActionAndCreatePayment({
          actionId,

          credentials: {
            keyId: "test_id",
            keySecret: "test_secret",
          },
        });

      assert.equal(
        calls,
        1,
      );

      assert.equal(
        approved.paymentLinkId,
        "plink_m5_regression",
      );

      assert.equal(
        (
          await AgentActionModel.findById(
            actionId,
          )
        )?.executionStatus,
        "SUCCEEDED",
      );
    },
  );

  it(
    "fails safely when Razorpay rejects the request",
    async () => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            error: {
              description: "declined",
            },
          }),
          {
            status: 500,
          },
        );

      const validated = await validate(
        proposal(
          "m5-failure-005",
        ),
      );

      const actionId = (
        validated.body as {
          actionId: string;
        }
      ).actionId;

      await assert.rejects(
        () =>
          approveActionAndCreatePayment({
            actionId,

            credentials: {
              keyId: "test_id",
              keySecret: "test_secret",
            },
          }),
      );

      const [
        action,
        order,
      ] = await Promise.all([
        AgentActionModel.findById(
          actionId,
        ),

        OrderModel.findOne({
          referenceId:
            "m5-failure-005",
        }),
      ]);

      assert.equal(
        action?.executionStatus,
        "FAILED",
      );

      assert.equal(
        order?.status,
        "FAILED",
      );

      assert.ok(
        await AuditLogModel.exists({
          actionId,
          event:
            "PAYMENT_EXECUTION_FAILED",
        }),
      );
    },
  );
});

describe(
  "M7 payment UNKNOWN-state recovery and reconciliation",
  () => {
    before(async () => {
      await connectDatabase(
        resolveTestUri(),
      );
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

      const coffeeKit =
        await ProductModel.create({
          name: "Artisan Coffee Kit",
          description: "Test product",
          priceInPaise: 179900,
          currency: "INR",
          category: "coffee",
          tags: ["coffee"],
          inventory: 5,
          frequentlyBoughtWith: [],
        });

      coffeeKitId = String(
        coffeeKit._id,
      );
    });

    after(async () => {
      globalThis.fetch = originalFetch;

      await disconnectDatabase();
    });

    it(
      "sets order to UNKNOWN when Razorpay call times out",
      async () => {
        globalThis.fetch = async () => {
          const error =
            new Error(
              "The operation was aborted.",
            );

          error.name =
            "AbortError";

          throw error;
        };

        const validated = await validate(
          proposal(
            "m7-timeout-001",
          ),
        );

        const actionId = (
          validated.body as {
            actionId: string;
          }
        ).actionId;

        await assert.rejects(
          () =>
            approveActionAndCreatePayment({
              actionId,

              credentials: {
                keyId: "test_id",
                keySecret: "test_secret",
              },
            }),
        );

        const [
          action,
          order,
        ] = await Promise.all([
          AgentActionModel.findById(
            actionId,
          ),

          OrderModel.findOne({
            referenceId:
              "m7-timeout-001",
          }),
        ]);

        assert.equal(
          action?.executionStatus,
          "UNKNOWN",
        );

        assert.equal(
          order?.status,
          "UNKNOWN",
        );

        assert.ok(
          await AuditLogModel.exists({
            actionId,
            event:
              "PAYMENT_EXECUTION_UNKNOWN",
          }),
        );
      },
    );

    it(
      "sets order to FAILED for known Razorpay rejection",
      async () => {
        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              error: {
                description:
                  "declined",
              },
            }),
            {
              status: 500,
            },
          );

        const validated =
          await validate(
            proposal(
              "m7-rejection-002",
            ),
          );

        const actionId = (
          validated.body as {
            actionId: string;
          }
        ).actionId;

        await assert.rejects(
          () =>
            approveActionAndCreatePayment({
              actionId,

              credentials: {
                keyId: "test_id",
                keySecret: "test_secret",
              },
            }),
        );

        const [
          action,
          order,
        ] = await Promise.all([
          AgentActionModel.findById(
            actionId,
          ),

          OrderModel.findOne({
            referenceId:
              "m7-rejection-002",
          }),
        ]);

        assert.equal(
          action?.executionStatus,
          "FAILED",
        );

        assert.equal(
          order?.status,
          "FAILED",
        );
      },
    );

    it(
      "recovers an UNKNOWN order with an existing paid payment link",
      async () => {
        await OrderModel.create({
          items: [
            {
              productId:
                new Types.ObjectId(
                  coffeeKitId,
                ),
              quantity: 1,
              unitPriceInPaise:
                179900,
            },
          ],

          amountInPaise: 179900,
          currency: "INR",
          status: "UNKNOWN",

          referenceId:
            "m7-recover-003",

          razorpayPaymentLinkId:
            "plink_existing_003",

          razorpayPaymentLinkUrl:
            "https://rzp.test/plink_existing_003",
        });

        globalThis.fetch =
          async () =>
            new Response(
              JSON.stringify({
                id:
                  "plink_existing_003",

                short_url:
                  "https://rzp.test/plink_existing_003",

                status: "paid",
              }),
              {
                status: 200,
              },
            );

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-recover-003",
          });

        const result =
          await reconcilePayment({
            orderId:
              String(order!._id),

            credentials: {
              keyId: "test_id",
              keySecret: "test_secret",
            },
          });

        assert.equal(
          result.status,
          "PAID",
        );

        assert.equal(
          result.paymentLinkId,
          "plink_existing_003",
        );

        const updated =
          await OrderModel.findOne({
            referenceId:
              "m7-recover-003",
          });

        assert.equal(
          updated?.status,
          "PAID",
        );

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_STARTED",
          }),
        );

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_PAYMENT_FOUND",
          }),
        );

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_PAYMENT_CONFIRMED",
          }),
        );
      },
    );

    it(
      "reuses the existing payment link when found",
      async () => {
        await OrderModel.create({
          items: [
            {
              productId:
                new Types.ObjectId(
                  coffeeKitId,
                ),
              quantity: 1,
              unitPriceInPaise:
                179900,
            },
          ],

          amountInPaise: 179900,
          currency: "INR",
          status: "UNKNOWN",

          referenceId:
            "m7-reuse-004",

          razorpayPaymentLinkId:
            "plink_reuse_004",

          razorpayPaymentLinkUrl:
            "https://rzp.test/plink_reuse_004",
        });

        globalThis.fetch =
          async () =>
            new Response(
              JSON.stringify({
                id:
                  "plink_reuse_004",

                short_url:
                  "https://rzp.test/plink_reuse_004",

                status: "created",
              }),
              {
                status: 200,
              },
            );

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-reuse-004",
          });

        const result =
          await reconcilePayment({
            orderId:
              String(order!._id),

            credentials: {
              keyId: "test_id",
              keySecret: "test_secret",
            },
          });

        assert.equal(
          result.status,
          "RECOVERED",
        );

        assert.equal(
          result.paymentLinkId,
          "plink_reuse_004",
        );

        const updated =
          await OrderModel.findOne({
            referenceId:
              "m7-reuse-004",
          });

        assert.equal(
          updated?.razorpayPaymentLinkId,
          "plink_reuse_004",
        );
      },
    );

    it(
      "returns UNKNOWN when lookup fails and does not retry",
      async () => {
        await OrderModel.create({
          items: [
            {
              productId:
                new Types.ObjectId(
                  coffeeKitId,
                ),
              quantity: 1,
              unitPriceInPaise:
                179900,
            },
          ],

          amountInPaise: 179900,
          currency: "INR",
          status: "UNKNOWN",

          referenceId:
            "m7-unresolved-005",
        });

        globalThis.fetch =
          async () => {
            const error =
              new Error(
                "Network connection lost.",
              );

            error.name =
              "TypeError";

            throw error;
          };

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-unresolved-005",
          });

        await assert.rejects(
          () =>
            reconcilePayment({
              orderId:
                String(order!._id),

              credentials: {
                keyId: "test_id",
                keySecret: "test_secret",
              },
            }),
        );

        const updated =
          await OrderModel.findOne({
            referenceId:
              "m7-unresolved-005",
          });

        assert.equal(
          updated?.status,
          "UNKNOWN",
        );

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_UNRESOLVED",
          }),
        );
      },
    );

    it(
      "performs safe retry only after successful empty lookup",
      async () => {
        await OrderModel.create({
          items: [
            {
              productId:
                new Types.ObjectId(
                  coffeeKitId,
                ),
              quantity: 1,
              unitPriceInPaise:
                179900,
            },
          ],

          amountInPaise: 179900,
          currency: "INR",
          status: "UNKNOWN",

          referenceId:
            "m7-safe-retry-006",
        });

        let fetchCalls = 0;

        globalThis.fetch =
          async (input: unknown) => {
            fetchCalls += 1;

            const urlStr =
              typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.toString()
                  : "";

            if (
              urlStr.includes(
                "/payment_links?reference_id=",
              )
            ) {
              return new Response(
                JSON.stringify({
                  payment_links: [],
                }),
                {
                  status: 200,
                },
              );
            }

            return new Response(
              JSON.stringify({
                id:
                  "plink_retry_006",

                short_url:
                  "https://rzp.test/plink_retry_006",

                status: "created",
              }),
              {
                status: 200,
              },
            );
          };

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-safe-retry-006",
          });

        const result =
          await reconcilePayment({
            orderId:
              String(order!._id),

            credentials: {
              keyId: "test_id",
              keySecret: "test_secret",
            },
          });

        assert.equal(
          result.status,
          "AWAITING_PAYMENT",
        );

        assert.equal(
          result.paymentLinkId,
          "plink_retry_006",
        );

        assert.equal(
          fetchCalls,
          2,
        );

        const updated =
          await OrderModel.findOne({
            referenceId:
              "m7-safe-retry-006",
          });

        assert.equal(
          updated?.status,
          "AWAITING_PAYMENT",
        );

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_SAFE_RETRY",
          }),
        );
      },
    );

    it(
      "protects against concurrent recovery",
      async () => {
        await OrderModel.create({
          items: [
            {
              productId:
                new Types.ObjectId(
                  coffeeKitId,
                ),
              quantity: 1,
              unitPriceInPaise:
                179900,
            },
          ],

          amountInPaise: 179900,
          currency: "INR",
          status: "UNKNOWN",

          referenceId:
            "m7-concurrent-007",

          razorpayPaymentLinkId:
            "plink_concurrent_007",

          razorpayPaymentLinkUrl:
            "https://rzp.test/plink_concurrent_007",
        });

        globalThis.fetch =
          async () =>
            new Response(
              JSON.stringify({
                id:
                  "plink_concurrent_007",

                short_url:
                  "https://rzp.test/plink_concurrent_007",

                status: "created",
              }),
              {
                status: 200,
              },
            );

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-concurrent-007",
          });

        const orderId =
          String(order!._id);

        const first =
          await reconcilePayment({
            orderId,

            credentials: {
              keyId: "test_id",
              keySecret: "test_secret",
            },
          });

        assert.equal(
          first.status,
          "RECOVERED",
        );

        await assert.rejects(
          () =>
            reconcilePayment({
              orderId,

              credentials: {
                keyId: "test_id",
                keySecret: "test_secret",
              },
            }),

          hasErrorMessage(
            /UNKNOWN state/i,
          ),
        );
      },
    );

    it(
      "rejects reconciliation for non-UNKNOWN orders",
      async () => {
        await OrderModel.create({
          items: [
            {
              productId:
                new Types.ObjectId(
                  coffeeKitId,
                ),
              quantity: 1,
              unitPriceInPaise:
                179900,
            },
          ],

          amountInPaise: 179900,
          currency: "INR",
          status: "AWAITING_PAYMENT",

          referenceId:
            "m7-non-unknown-008",
        });

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-non-unknown-008",
          });

        await assert.rejects(
          () =>
            reconcilePayment({
              orderId:
                String(order!._id),

              credentials: {
                keyId: "test_id",
                keySecret: "test_secret",
              },
            }),

          hasErrorMessage(
            /UNKNOWN state/i,
          ),
        );
      },
    );

    it(
      "records recovery audit events",
      async () => {
        await OrderModel.create({
          items: [
            {
              productId:
                new Types.ObjectId(
                  coffeeKitId,
                ),
              quantity: 1,
              unitPriceInPaise:
                179900,
            },
          ],

          amountInPaise: 179900,
          currency: "INR",
          status: "UNKNOWN",

          referenceId:
            "m7-audit-009",

          razorpayPaymentLinkId:
            "plink_audit_009",

          razorpayPaymentLinkUrl:
            "https://rzp.test/plink_audit_009",
        });

        globalThis.fetch =
          async () =>
            new Response(
              JSON.stringify({
                id:
                  "plink_audit_009",

                short_url:
                  "https://rzp.test/plink_audit_009",

                status: "created",
              }),
              {
                status: 200,
              },
            );

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-audit-009",
          });

        await reconcilePayment({
          orderId:
            String(order!._id),

          credentials: {
            keyId: "test_id",
            keySecret: "test_secret",
          },
        });

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_STARTED",
          }),
        );

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_PAYMENT_FOUND",
          }),
        );
      },
    );

    it(
      "recalculates authoritative amount before safe retry",
      async () => {
        await OrderModel.create({
          items: [
            {
              productId:
                new Types.ObjectId(
                  coffeeKitId,
                ),
              quantity: 1,
              unitPriceInPaise:
                179900,
            },
          ],

          amountInPaise: 179900,
          currency: "INR",
          status: "UNKNOWN",

          referenceId:
            "m7-amount-010",
        });

        await ProductModel.findByIdAndUpdate(
          coffeeKitId,
          {
            priceInPaise: 99900,
          },
        );

        globalThis.fetch =
          async (input: unknown) => {
            const urlStr =
              typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.toString()
                  : "";

            if (
              urlStr.includes(
                "/payment_links?reference_id=",
              )
            ) {
              return new Response(
                JSON.stringify({
                  payment_links: [],
                }),
                {
                  status: 200,
                },
              );
            }

            return new Response(
              JSON.stringify({
                id:
                  "plink_amount_010",

                short_url:
                  "https://rzp.test/plink_amount_010",

                status: "created",
              }),
              {
                status: 200,
              },
            );
          };

        const order =
          await OrderModel.findOne({
            referenceId:
              "m7-amount-010",
          });

        const result =
          await reconcilePayment({
            orderId:
              String(order!._id),

            credentials: {
              keyId: "test_id",
              keySecret: "test_secret",
            },
          });

        assert.equal(
          result.status,
          "AWAITING_PAYMENT",
        );

        assert.ok(
          await AuditLogModel.exists({
            event:
              "RECOVERY_SAFE_RETRY",

            "details.verifiedAmountInPaise":
              99900,
          }),
        );
      },
    );
  },
);