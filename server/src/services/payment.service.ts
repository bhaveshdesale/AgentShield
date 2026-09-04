// import mongoose, { HydratedDocument, Types } from "mongoose";
// import { AuditLogModel } from "../models/AuditLog";
// import { MerchantModel } from "../models/Merchant";
// import { OrderModel } from "../models/Order";
// import { ProductModel } from "../models/Product";
// import { AgentActionModel } from "../models/AgentAction";
// import { AppError } from "../utils/AppError";
// import { logger } from "../utils/logger";
// import { evaluateAction } from "./policy.service";
// import type { ActionProposalInput, AgentAction, Order, OrderStatus } from "../types/domain";

// /**
//  * Razorpay TEST-MODE payment service + explicit approval flow.
//  *
//  * Core principle: AI can propose. AgentShield authorizes. Razorpay executes.
//  * - The AI never calls Razorpay.
//  * - Amounts are always recomputed server-side from MongoDB.
//  * - Client input can never supply amounts, Razorpay IDs or approval state.
//  */

// export interface RazorpayCredentials {
//   keyId: string;
//   keySecret: string;
// }

// export interface RazorpayPaymentLink {
//   id: string;
//   short_url: string;
//   status: string;
// }

// export interface ApprovalResult {
//   success: true;
//   actionId: string;
//   orderId: string;
//   paymentLinkId: string;
//   paymentLink: string;
//   status: string;
// }

// const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";
// const RAZORPAY_TIMEOUT_MS = 20000;

// /** Reads TEST-MODE credentials from env. Never hardcoded, never exposed. */
// export function getRazorpayCredentials(): RazorpayCredentials {
//   const keyId = process.env.RAZORPAY_KEY_ID;
//   const keySecret = process.env.RAZORPAY_KEY_SECRET;
//   if (
//     keyId === undefined ||
//     keyId.trim() === "" ||
//     keySecret === undefined ||
//     keySecret.trim() === ""
//   ) {
//     throw new AppError(
//       "Razorpay test-mode credentials are not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).",
//       503,
//       "RAZORPAY_NOT_CONFIGURED"
//     );
//   }
//   return { keyId: keyId.trim(), keySecret: keySecret.trim() };
// }

// /** Minimal Razorpay TEST-MODE Payment Link creation. */
// export async function createRazorpayPaymentLink(options: {
//   amountInPaise: number;
//   referenceId: string;
//   description: string;
//   callbackUrl?: string;
//   credentials?: RazorpayCredentials;
// }): Promise<RazorpayPaymentLink> {
//   const credentials = options.credentials ?? getRazorpayCredentials();

//   const referenceId = options.referenceId.trim();

//   // Razorpay Payment Links require a non-empty reference_id
//   // with a maximum length of 40 characters.
//   if (referenceId.length === 0) {
//     throw new AppError(
//       "Payment reference ID cannot be empty.",
//       400,
//       "INVALID_REFERENCE_ID"
//     );
//   }

//   if (referenceId.length > 40) {
//     throw new AppError(
//       "Payment reference ID must be 40 characters or fewer.",
//       400,
//       "INVALID_REFERENCE_ID"
//     );
//   }

//   // Razorpay expects the amount in paise as an integer.
//   if (
//     !Number.isInteger(options.amountInPaise) ||
//     options.amountInPaise < 100
//   ) {
//     throw new AppError(
//       "Payment amount must be an integer of at least 100 paise.",
//       400,
//       "INVALID_PAYMENT_AMOUNT"
//     );
//   }

//   const controller = new AbortController();
//   const timeout = setTimeout(() => controller.abort(), RAZORPAY_TIMEOUT_MS);

//   try {
//     const response = await fetch(`${RAZORPAY_API_BASE}/payment_links`, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         Authorization: `Basic ${Buffer.from(
//           `${credentials.keyId}:${credentials.keySecret}`
//         ).toString("base64")}`,
//       },
//       body: JSON.stringify({
//   amount: options.amountInPaise,
//   currency: "INR",
//   accept_partial: false,
//   reference_id: referenceId,
//   description: options.description,

//   ...(options.callbackUrl
//     ? {
//         callback_url: options.callbackUrl,
//         callback_method: "get",
//       }
//     : {}),
// }),
//       signal: controller.signal,
//     });

//     const bodyText = await response.text().catch(() => "");

//     if (!response.ok) {
//       let detail = `Razorpay rejected the payment link request with status ${response.status}.`;
//       let razorpayCode: string | undefined;

//       try {
//         const parsed = JSON.parse(bodyText) as {
//           error?: {
//             code?: string;
//             description?: string;
//           };
//         };

//         if (parsed.error?.code) {
//           razorpayCode = parsed.error.code;
//         }

//         if (parsed.error?.description) {
//           detail = parsed.error.description;
//         }
//       } catch {
//         // Keep generic detail if Razorpay returned non-JSON.
//       }

//       logger.error("Razorpay Payment Link request failed", {
//         status: response.status,
//         referenceId,
//         razorpayCode,
//       });

//       throw new AppError(detail, 502, "RAZORPAY_ERROR");
//     }

//     let link: RazorpayPaymentLink;

//     try {
//       link = JSON.parse(bodyText) as RazorpayPaymentLink;
//     } catch {
//       throw new AppError(
//         "Razorpay returned an unparseable payment link response.",
//         502,
//         "RAZORPAY_ERROR"
//       );
//     }

//     if (
//       typeof link.id !== "string" ||
//       link.id.length === 0 ||
//       typeof link.short_url !== "string" ||
//       link.short_url.length === 0
//     ) {
//       throw new AppError(
//         "Razorpay returned an unexpected payment link response.",
//         502,
//         "RAZORPAY_ERROR"
//       );
//     }

//     return link;
//   } catch (error) {
//     if (error instanceof AppError) {
//       throw error;
//     }

//     if (error instanceof Error && error.name === "AbortError") {
//       throw new AppError(
//         "Razorpay payment link request timed out.",
//         504,
//         "RAZORPAY_TIMEOUT"
//       );
//     }

//     throw error;
//   } finally {
//     clearTimeout(timeout);
//   }
// }

// /** Append-oriented audit helper. Never record secrets. */
// export async function recordAudit(event: string, details: Record<string, string | number | boolean | undefined>, actionId: string | null): Promise<void> {
//   await AuditLogModel.create({
//     actionId: actionId === null ? undefined : new Types.ObjectId(actionId),
//     event,
//     details,
//     timestamp: new Date(),
//   });
// }

// /** Recomputes the authoritative amount from MongoDB (same source of truth as
//  * the policy engine). The AI-proposed amount is never used for payments. */
// export async function calculateAuthoritativeAmount(proposal: { items: { productId: Types.ObjectId; quantity: number }[] }): Promise<number> {
//   const quantitiesByProductId = new Map<string, number>();
//   for (const item of proposal.items) {
//     const key = String(item.productId);
//     quantitiesByProductId.set(key, (quantitiesByProductId.get(key) ?? 0) + item.quantity);
//   }

//   const products = await ProductModel.find({ _id: { $in: Array.from(quantitiesByProductId.keys()) } });
//   const productById = new Map(products.map((p) => [String(p._id), p]));

//   let amountInPaise = 0;
//   for (const [id, quantity] of quantitiesByProductId) {
//     const product = productById.get(id);
//     if (!product) {
//       throw new AppError(
//         `Authoritative amount cannot be calculated: product ${id} not found in catalog.`,
//         409,
//         "AI_UNKNOWN_PRODUCT"
//       );
//     }
//     amountInPaise += product.priceInPaise * quantity;
//   }
//   return amountInPaise;
// }

// async function createOrderSnapshot(
//   proposal: { referenceId: string; items: { productId: Types.ObjectId; quantity: number }[] },
//   amountInPaise: number
// ): Promise<HydratedDocument<Order>> {
//   const existing = await OrderModel.findOne({ referenceId: proposal.referenceId });
//   if (existing) {
//     return existing;
//   }

//   const products = await ProductModel.find({ _id: { $in: proposal.items.map((item) => item.productId) } });
//   const prices = new Map(products.map((product) => [String(product._id), product.priceInPaise]));
//   const items = proposal.items.map((item) => {
//     const unitPriceInPaise = prices.get(String(item.productId));
//     if (unitPriceInPaise === undefined) {
//       throw new AppError("Product changed before order creation.", 409, "PRODUCT_CHANGED");
//     }
//     return { productId: item.productId, quantity: item.quantity, unitPriceInPaise };
//   });

//   try {
//     return await OrderModel.create({
//       items,
//       amountInPaise,
//       currency: "INR",
//       status: "CREATED",
//       referenceId: proposal.referenceId,
//     });
//   } catch (error) {
//     if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
//       const concurrentOrder = await OrderModel.findOne({ referenceId: proposal.referenceId });
//       if (concurrentOrder) {
//         return concurrentOrder;
//       }
//     }
//     throw error;
//   }
// }

// /**
//  * Explicit approval flow: AI proposal → policy ALLOW → explicit approval →
//  * Razorpay TEST-MODE Payment Link → Order PENDING.
//  *
//  * Amounts, approval state and Razorpay identifiers come only from the server
//  * database — never from the request body or the AI.
//  */
// export interface ActionApprovalResult {
//   success: true;
//   actionId: string;
//   approvalStatus: "APPROVED";
//   executionStatus: "NOT_STARTED";
// }

// function buildPersistedProposal(action: HydratedDocument<AgentAction>): ActionProposalInput {
//   return {
//     action: action.proposal.action,
//     items: action.proposal.items.map((item) => ({
//       productId: item.productId,
//       quantity: item.quantity,
//     })),
//     proposedAmountInPaise: action.proposal.proposedAmountInPaise,
//     reason: action.proposal.reason,
//     requiresApproval: action.proposal.requiresApproval,
//     referenceId: action.referenceId,
//     ...(action.discountPercent === undefined ? {} : { discountPercent: action.discountPercent }),
//   };
// }

// async function revalidateAction(action: HydratedDocument<AgentAction>) {
//   const merchant = await MerchantModel.findOne().sort({ createdAt: 1 });
//   if (!merchant) {
//     throw new AppError("Merchant policy was not found.", 503, "MERCHANT_NOT_FOUND");
//   }
//   const proposal = buildPersistedProposal(action);
//   const result = await evaluateAction(proposal, merchant.policy);
//   if (result.decision !== "ALLOW" || result.verifiedAmountInPaise !== action.verifiedAmountInPaise) {
//     action.policyResult = { decision: result.decision, checks: result.checks };
//     action.approvalStatus = "REJECTED";
//     action.executionStatus = "BLOCKED";
//     await action.save();
//     await recordAudit(
//       "ACTION_BLOCKED",
//       { policyDecision: result.decision, verifiedAmountInPaise: result.verifiedAmountInPaise },
//       String(action._id)
//     );
//     throw new AppError("Action no longer satisfies current merchant policy.", 409, "ACTION_REVALIDATION_FAILED");
//   }
//   if (!result.approvalRequired) {
//     action.approvalStatus = "NOT_REQUIRED";
//     await action.save();
//     throw new AppError("This action no longer requires explicit approval.", 409, "APPROVAL_NOT_REQUIRED");
//   }
//   return result;
// }

// /** Explicit human approval. Approval never calls Razorpay. */
// export async function approveAction(options: { actionId: string }): Promise<ActionApprovalResult> {
//   if (!Types.ObjectId.isValid(options.actionId)) {
//     throw new AppError("Invalid action ID.", 400, "INVALID_ACTION_ID");
//   }
//   const action = await AgentActionModel.findById(options.actionId);
//   if (!action) throw new AppError("Agent action was not found.", 404, "ACTION_NOT_FOUND");
//   if (action.action !== "CREATE_PAYMENT" || action.policyResult?.decision !== "ALLOW") {
//     throw new AppError("Only policy-allowed payment actions can be approved.", 409, "ACTION_NOT_ALLOWED");
//   }
//   if (action.approvalStatus !== "PENDING" || action.executionStatus !== "NOT_STARTED") {
//     throw new AppError("This action has already been approved or processed.", 409, "ACTION_ALREADY_PROCESSED");
//   }

//   const reevaluation = await revalidateAction(action);
//   const claimedAction = await AgentActionModel.findOneAndUpdate(
//     { _id: action._id, approvalStatus: "PENDING", executionStatus: "NOT_STARTED" },
//     {
//       $set: {
//         approvalStatus: "APPROVED",
//         executionStatus: "NOT_STARTED",
//         policyResult: { decision: reevaluation.decision, checks: reevaluation.checks },
//         verifiedAmountInPaise: reevaluation.verifiedAmountInPaise,
//       },
//     },
//     { new: true }
//   );
//   if (!claimedAction) {
//     throw new AppError("This action is already being processed.", 409, "ACTION_ALREADY_PROCESSED");
//   }
//   await recordAudit("ACTION_APPROVED", { approvalState: "APPROVED", executionState: "NOT_STARTED" }, String(claimedAction._id));
//   return {
//     success: true,
//     actionId: String(claimedAction._id),
//     approvalStatus: "APPROVED",
//     executionStatus: "NOT_STARTED",
//   };
// }

// /** Executes an explicitly approved action. This is the only path that calls Razorpay. */
// export async function createPaymentForApprovedAction(options: {
//   actionId: string;
//   credentials?: RazorpayCredentials;
// }): Promise<ApprovalResult> {
//   if (!Types.ObjectId.isValid(options.actionId)) {
//     throw new AppError("Invalid action ID.", 400, "INVALID_ACTION_ID");
//   }
//   const action = await AgentActionModel.findById(options.actionId);
//   if (!action) throw new AppError("Agent action was not found.", 404, "ACTION_NOT_FOUND");
//   if (action.action !== "CREATE_PAYMENT" || action.policyResult?.decision !== "ALLOW") {
//     throw new AppError("Only policy-allowed payment actions can create a payment.", 409, "ACTION_NOT_ALLOWED");
//   }
//   if (!action.approvalRequired) throw new AppError("This action does not require explicit approval.", 409, "APPROVAL_NOT_REQUIRED");
//   if (action.approvalStatus !== "APPROVED") {
//     throw new AppError("Action must be explicitly approved before payment creation.", 409, "APPROVAL_REQUIRED");
//   }
//   if (action.executionStatus === "UNKNOWN") {
//     const unknownOrder = await OrderModel.findOne({ referenceId: action.referenceId });
//     if (!unknownOrder) throw new AppError("Unknown payment state has no associated order.", 409, "RECOVERY_ORDER_NOT_FOUND");
//     return reconcilePayment({
//       orderId: String(unknownOrder._id),
//       ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
//     }).then((result) => ({
//       success: true as const,
//       actionId: String(action._id),
//       orderId: result.orderId,
//       paymentLinkId: result.paymentLinkId ?? "",
//       paymentLink: result.paymentLink ?? "",
//       status: result.status,
//     }));
//   }
//   if (action.executionStatus !== "NOT_STARTED") {
//     throw new AppError("This action has already been approved or processed.", 409, "ACTION_ALREADY_PROCESSED");
//   }

//   const reevaluation = await revalidateAction(action);
//   const claimedAction = await AgentActionModel.findOneAndUpdate(
//     { _id: action._id, approvalStatus: "APPROVED", executionStatus: "NOT_STARTED" },
//     { $set: { executionStatus: "IN_PROGRESS", policyResult: { decision: reevaluation.decision, checks: reevaluation.checks }, verifiedAmountInPaise: reevaluation.verifiedAmountInPaise } },
//     { new: true }
//   );
//   if (!claimedAction) throw new AppError("This action is already being processed.", 409, "ACTION_ALREADY_PROCESSED");

//   let order: HydratedDocument<Order> | undefined;
//   try {
//     order = await createOrderSnapshot(
//       { referenceId: claimedAction.referenceId, items: claimedAction.proposal.items },
//       reevaluation.verifiedAmountInPaise
//     );
//     if (order.razorpayPaymentLinkId && order.razorpayPaymentLinkUrl) {
//       claimedAction.executionStatus = "SUCCEEDED";
//       await claimedAction.save();
//       return { success: true, actionId: String(claimedAction._id), orderId: String(order._id), paymentLinkId: order.razorpayPaymentLinkId, paymentLink: order.razorpayPaymentLinkUrl, status: order.status };
//     }

//     await recordAudit("PAYMENT_LINK_CREATION_STARTED", { verifiedAmountInPaise: reevaluation.verifiedAmountInPaise, executionState: "IN_PROGRESS" }, String(claimedAction._id));
//     const frontendUrl = (
//   process.env.FRONTEND_URL || "http://localhost:5173"
// ).replace(/\/$/, "");

// const paymentLink = await createRazorpayPaymentLink({
//   amountInPaise: reevaluation.verifiedAmountInPaise,
//   referenceId: claimedAction.referenceId,
//   description: `AgentShield order ${claimedAction.referenceId}`,
//   callbackUrl: `${frontendUrl}/payments/${String(order._id)}`,
//   ...(options.credentials === undefined
//     ? {}
//     : { credentials: options.credentials }),
// });
    
//     order.razorpayPaymentLinkId = paymentLink.id;
//     order.razorpayPaymentLinkUrl = paymentLink.short_url;
//     order.status = "AWAITING_PAYMENT";
//     await order.save();
//     claimedAction.executionStatus = "SUCCEEDED";
//     await claimedAction.save();
//     await recordAudit("PAYMENT_LINK_CREATED", { razorpayIdentifier: paymentLink.id, executionState: "SUCCEEDED" }, String(claimedAction._id));
//     return { success: true, actionId: String(claimedAction._id), orderId: String(order._id), paymentLinkId: paymentLink.id, paymentLink: paymentLink.short_url, status: order.status };
//   } catch (error) {
//     if (error instanceof AppError && error.code === "RAZORPAY_ERROR") {
//       if (order) { order.status = "FAILED"; await order.save(); }
//       claimedAction.executionStatus = "FAILED";
//       await claimedAction.save();
//       await recordAudit("PAYMENT_EXECUTION_FAILED", { executionState: "FAILED", errorCategory: error.code }, String(claimedAction._id));
//       throw error;
//     }
//     if (order) { order.status = "UNKNOWN"; await order.save(); }
//     claimedAction.executionStatus = "UNKNOWN";
//     await claimedAction.save();
//     await recordAudit("PAYMENT_EXECUTION_UNKNOWN", { executionState: "UNKNOWN", errorCategory: error instanceof Error ? error.message : "PAYMENT_EXECUTION_UNKNOWN" }, String(claimedAction._id));
//     throw error;
//   }
// }

// /** Backward-compatible service composition used by the existing unit tests. */
// export async function approveActionAndCreatePayment(options: {
//   actionId: string;
//   credentials?: RazorpayCredentials;
// }): Promise<ApprovalResult> {
//   await approveAction({ actionId: options.actionId });
//   return createPaymentForApprovedAction(options);
// }

// export interface RazorpayPaymentLinkDetail {
//   id: string;
//   short_url: string;
//   status: string;
//   reference_id?: string;
// }

// export async function lookupRazorpayPaymentLink(options: {
//   paymentLinkId?: string;
//   referenceId?: string;
//   credentials?: RazorpayCredentials;
// }): Promise<RazorpayPaymentLinkDetail | null> {
//   const credentials = options.credentials ?? getRazorpayCredentials();

//   if (options.paymentLinkId && options.paymentLinkId.trim().length > 0) {
//     return lookupPaymentLinkById(options.paymentLinkId, credentials);
//   }

//   if (options.referenceId && options.referenceId.trim().length > 0) {
//     return lookupPaymentLinkByReference(options.referenceId, credentials);
//   }

//   return null;
// }

// async function lookupPaymentLinkById(id: string, credentials: RazorpayCredentials): Promise<RazorpayPaymentLinkDetail | null> {
//   const controller = new AbortController();
//   const timeout = setTimeout(() => controller.abort(), RAZORPAY_TIMEOUT_MS);

//   try {
//     const response = await fetch(`${RAZORPAY_API_BASE}/payment_links/${encodeURIComponent(id)}`, {
//       method: "GET",
//       headers: {
//         Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64")}`,
//       },
//       signal: controller.signal,
//     });

//     if (response.status === 404) {
//       return null;
//     }

//     if (!response.ok) {
//       let detail = `Razorpay lookup failed with status ${response.status}.`;
//       try {
//         const bodyText = await response.text();
//         const parsed = JSON.parse(bodyText) as { error?: { description?: string } };
//         if (parsed.error?.description) {
//           detail = parsed.error.description;
//         }
//       } catch {
//         // keep generic detail
//       }
//       throw new AppError(detail, 502, "RAZORPAY_ERROR");
//     }

//     const bodyText = await response.text().catch(() => "");
//     let link: RazorpayPaymentLinkDetail;
//     try {
//       link = JSON.parse(bodyText) as RazorpayPaymentLinkDetail;
//     } catch {
//       throw new AppError("Razorpay returned an unparseable payment link detail.", 502, "RAZORPAY_ERROR");
//     }

//     if (typeof link.id !== "string" || link.id.length === 0) {
//       throw new AppError("Razorpay returned an unexpected payment link detail.", 502, "RAZORPAY_ERROR");
//     }

//     return link;
//   } finally {
//     clearTimeout(timeout);
//   }
// }

// async function lookupPaymentLinkByReference(referenceId: string, credentials: RazorpayCredentials): Promise<RazorpayPaymentLinkDetail | null> {
//   const controller = new AbortController();
//   const timeout = setTimeout(() => controller.abort(), RAZORPAY_TIMEOUT_MS);

//   try {
//     const response = await fetch(`${RAZORPAY_API_BASE}/payment_links?reference_id=${encodeURIComponent(referenceId)}`, {
//       method: "GET",
//       headers: {
//         Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64")}`,
//       },
//       signal: controller.signal,
//     });

//     if (!response.ok) {
//       let detail = `Razorpay lookup failed with status ${response.status}.`;
//       try {
//         const bodyText = await response.text();
//         const parsed = JSON.parse(bodyText) as { error?: { description?: string } };
//         if (parsed.error?.description) {
//           detail = parsed.error.description;
//         }
//       } catch {
//         // keep generic detail
//       }
//       throw new AppError(detail, 502, "RAZORPAY_ERROR");
//     }

//     const bodyText = await response.text().catch(() => "");
//     let parsed: { payment_links?: RazorpayPaymentLinkDetail[] };
//     try {
//       parsed = JSON.parse(bodyText) as { payment_links?: RazorpayPaymentLinkDetail[] };
//     } catch {
//       throw new AppError("Razorpay returned an unparseable payment link list.", 502, "RAZORPAY_ERROR");
//     }

//     const links = parsed.payment_links ?? [];
//     return links.length > 0 ? links[0] : null;
//   } finally {
//     clearTimeout(timeout);
//   }
// }
// export interface PaymentHistoryItem {
//   orderId: string;
//   referenceId: string;
//   amountInPaise: number;
//   currency: Order["currency"];
//   status: OrderStatus;

//   items: Array<{
//     productId: string;
//     productName: string;
//     quantity: number;
//     unitPriceInPaise: number;
//   }>;

//   paymentLinkId?: string;
//   paymentLink?: string;
//   razorpayPaymentId?: string;

//   createdAt: string;
//   updatedAt: string;
// }

// /**
//  * Returns persisted orders for the Payments history screen.
//  *
//  * MongoDB is the source of truth for:
//  * - amount
//  * - item quantities
//  * - item prices
//  * - order state
//  * - Razorpay identifiers
//  */
// export async function getPaymentHistoryFromDatabase(): Promise<
//   PaymentHistoryItem[]
// > {
//   const orders = await OrderModel.find({})
//     .sort({ createdAt: -1 })
//     .limit(100)
//     .lean();

//   if (orders.length === 0) {
//     return [];
//   }

//   const productIds = Array.from(
//     new Set(
//       orders.flatMap((order) =>
//         order.items.map((item) => String(item.productId)),
//       ),
//     ),
//   );

//   const products = await ProductModel.find({
//     _id: { $in: productIds },
//   })
//     .select("_id name")
//     .lean();

//   const productNames = new Map(
//     products.map((product) => [
//       String(product._id),
//       product.name,
//     ]),
//   );

//   return orders.map((order) => ({
//     orderId: String(order._id),
//     referenceId: order.referenceId,
//     amountInPaise: order.amountInPaise,
//     currency: order.currency,
//     status: order.status,

//     items: order.items.map((item) => ({
//       productId: String(item.productId),
//       productName:
//         productNames.get(String(item.productId)) ??
//         "Unknown product",
//       quantity: item.quantity,
//       unitPriceInPaise: item.unitPriceInPaise,
//     })),

//     ...(order.razorpayPaymentLinkId
//       ? { paymentLinkId: order.razorpayPaymentLinkId }
//       : {}),

//     ...(order.razorpayPaymentLinkUrl
//       ? { paymentLink: order.razorpayPaymentLinkUrl }
//       : {}),

//     ...(order.razorpayPaymentId
//       ? { razorpayPaymentId: order.razorpayPaymentId }
//       : {}),

//     createdAt: order.createdAt.toISOString(),
//     updatedAt: order.updatedAt.toISOString(),
//   }));
// }

// export async function getPaymentStatusByOrderId(options: { orderId: string; credentials?: RazorpayCredentials }): 
// Promise<{
//   orderId: string;
//   status: OrderStatus;
//   amountInPaise: number;
//   referenceId: string;
//   paymentLinkId?: string;
//   paymentLink?: string;
//   razorpayStatus?: string;
// }> {
//   if (!Types.ObjectId.isValid(options.orderId)) throw new AppError("Invalid order ID.", 400, "INVALID_ORDER_ID");
//   const order = await OrderModel.findById(options.orderId);
//   if (!order) throw new AppError("Order was not found.", 404, "ORDER_NOT_FOUND");

//   let razorpayStatus: string | undefined;
//   if (order.razorpayPaymentLinkId || order.referenceId) {
//     const credentials = options.credentials ?? getRazorpayCredentials();
//     const remote = await lookupRazorpayPaymentLink({
//       ...(order.razorpayPaymentLinkId ? { paymentLinkId: order.razorpayPaymentLinkId } : {}),
//       referenceId: order.referenceId,
//       credentials,
//     });
//     if (remote) {
//       razorpayStatus = remote.status;
//       if ((remote.status === "paid" || remote.status === "captured") && order.status === "AWAITING_PAYMENT") {
//         order.status = "PAID";
//         await order.save();
//       } else if ((remote.status === "expired" || remote.status === "failed") && order.status === "AWAITING_PAYMENT") {
//         order.status = "FAILED";
//         await order.save();
//       }
//     }
//   }

//   return {
//   orderId: String(order._id),
//   status: order.status,
//   amountInPaise: order.amountInPaise,
//   referenceId: order.referenceId,

//   ...(order.razorpayPaymentLinkId
//     ? { paymentLinkId: order.razorpayPaymentLinkId }
//     : {}),

//   ...(order.razorpayPaymentLinkUrl
//     ? { paymentLink: order.razorpayPaymentLinkUrl }
//     : {}),

//   ...(razorpayStatus ? { razorpayStatus } : {}),
// };
// }

// export async function reconcilePayment(options: {
//   orderId: string;
//   credentials?: RazorpayCredentials;
// }): Promise<{ orderId: string; status: string; paymentLinkId?: string; paymentLink?: string }> {
//   if (!Types.ObjectId.isValid(options.orderId)) {
//     throw new AppError("Invalid order ID.", 400, "INVALID_ORDER_ID");
//   }

//   const order = await OrderModel.findById(options.orderId);
//   if (!order) {
//     throw new AppError("Order was not found.", 404, "ORDER_NOT_FOUND");
//   }

//   if (order.status !== "UNKNOWN") {
//     throw new AppError("Only orders in UNKNOWN state can be reconciled.", 409, "ORDER_NOT_UNKNOWN");
//   }

//   const action = await AgentActionModel.findOne({ referenceId: order.referenceId });
//   const actionId = action ? String(action._id) : null;

//   await recordAudit("RECOVERY_STARTED", { orderId: String(order._id) }, actionId);

//   const claimed = await OrderModel.findOneAndUpdate(
//     { _id: order._id, status: "UNKNOWN" },
//     { $set: { status: "RECOVERING" } },
//     { new: true }
//   );

//   if (!claimed) {
//     throw new AppError("Order is already being reconciled by another process.", 409, "ORDER_ALREADY_RECOVERING");
//   }

//   try {
//     const verifiedAmountInPaise = await calculateAuthoritativeAmount({
//       items: order.items.map((item) => ({
//         productId: item.productId,
//         quantity: item.quantity,
//       })),
//     });

//     let paymentLinkId = order.razorpayPaymentLinkId;
//     let paymentLink = order.razorpayPaymentLinkUrl;
//     let finalStatus: OrderStatus = "UNKNOWN";

//     let existing: RazorpayPaymentLinkDetail | null = null;
//     let lookupFailed = false;

//     try {
//       existing = await lookupRazorpayPaymentLink({
//         ...(order.razorpayPaymentLinkId ? { paymentLinkId: order.razorpayPaymentLinkId } : {}),
//         referenceId: order.referenceId,
//         ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
//       });
//     } catch (lookupError) {
//       lookupFailed = true;
//       await recordAudit("RECOVERY_UNRESOLVED", {
//         errorCategory: lookupError instanceof AppError ? lookupError.code : "RECOVERY_LOOKUP_ERROR",
//       }, actionId);
//     }

//     if (lookupFailed) {
//       await OrderModel.findByIdAndUpdate(order._id, { $set: { status: "UNKNOWN" } });
//       if (action) {
//         action.executionStatus = "UNKNOWN";
//         await action.save();
//       }
//       throw new AppError("Recovery lookup failed. Order remains in UNKNOWN state.", 502, "RECOVERY_LOOKUP_FAILED");
//     }

//     if (existing) {
//       paymentLinkId = existing.id;
//       paymentLink = existing.short_url;

//       await recordAudit("RECOVERY_PAYMENT_FOUND", {
//         razorpayIdentifier: existing.id,
//         referenceId: order.referenceId,
//       }, actionId);

//       if (existing.status === "paid" || existing.status === "captured") {
//         await recordAudit("RECOVERY_PAYMENT_CONFIRMED", {
//           razorpayIdentifier: existing.id,
//           paymentStatus: existing.status,
//         }, actionId);
//         finalStatus = "PAID";
//       } else {
//         finalStatus = "RECOVERED";
//       }
//     } else {
//       await recordAudit("RECOVERY_SAFE_RETRY", {
//         verifiedAmountInPaise,
//       }, actionId);

//       try {
//        const frontendUrl = (
//   process.env.FRONTEND_URL || "http://localhost:5173"
// ).replace(/\/$/, "");

// const newPaymentLink = await createRazorpayPaymentLink({
//   amountInPaise: verifiedAmountInPaise,
//   referenceId: order.referenceId,
//   description: `AgentShield order ${order.referenceId}`,
//   callbackUrl: `${frontendUrl}/payments/${String(order._id)}`,
//   ...(options.credentials === undefined
//     ? {}
//     : { credentials: options.credentials }),
// });

//         paymentLinkId = newPaymentLink.id;
//         paymentLink = newPaymentLink.short_url;
//         finalStatus = "AWAITING_PAYMENT";
//       } catch (retryError) {
//         if (retryError instanceof AppError && retryError.code === "RAZORPAY_ERROR") {
//           await OrderModel.findByIdAndUpdate(order._id, { $set: { status: "FAILED" } });
//           if (action) {
//             action.executionStatus = "FAILED";
//             await action.save();
//           }
//           await recordAudit("RECOVERY_RETRY_FAILED", {
//             errorCategory: retryError.code,
//           }, actionId);
//           throw retryError;
//         }

//         await OrderModel.findByIdAndUpdate(order._id, { $set: { status: "UNKNOWN" } });
//         if (action) {
//           action.executionStatus = "UNKNOWN";
//           await action.save();
//         }
//         await recordAudit("RECOVERY_RETRY_FAILED", {
//           errorCategory: retryError instanceof Error ? retryError.message : "RECOVERY_RETRY_ERROR",
//         }, actionId);
//         throw new AppError("Recovery retry failed. Order remains in UNKNOWN state.", 502, "RECOVERY_RETRY_FAILED");
//       }
//     }

//     order.razorpayPaymentLinkId = paymentLinkId;
//     order.razorpayPaymentLinkUrl = paymentLink;
//     order.status = finalStatus;
//     await order.save();

//     if (action) {
//       if (finalStatus === "PAID") {
//         action.executionStatus = "SUCCEEDED";
//       } else if (finalStatus === "RECOVERED") {
//         action.executionStatus = "RECOVERED";
//       } else if (finalStatus === "AWAITING_PAYMENT") {
//         action.executionStatus = "SUCCEEDED";
//       }
//       await action.save();
//     }

//     return {
//       orderId: String(order._id),
//       status: finalStatus,
//       paymentLinkId,
//       paymentLink,
//     };
//   } catch (error) {
//     if (error instanceof AppError && error.code === "RECOVERY_LOOKUP_FAILED") {
//       throw error;
//     }
//     await OrderModel.findByIdAndUpdate(order._id, { $set: { status: "UNKNOWN" } });
//     if (action) {
//       action.executionStatus = "UNKNOWN";
//       await action.save();
//     }
//     throw error;
//   }
// }



import mongoose, { HydratedDocument, Types } from "mongoose";
import { AuditLogModel } from "../models/AuditLog";
import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { AgentActionModel } from "../models/AgentAction";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { evaluateAction } from "./policy.service";
import type {
  ActionProposalInput,
  AgentAction,
  Order,
  OrderStatus,
} from "../types/domain";

/**
 * Razorpay TEST-MODE payment service + explicit approval flow.
 *
 * Core principle:
 * AI can propose. AgentShield authorizes. Razorpay executes.
 *
 * - The AI never calls Razorpay.
 * - Amounts are always recomputed server-side from MongoDB.
 * - Client input can never supply amounts, Razorpay IDs or approval state.
 */

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
}

export interface RazorpayPaymentLink {
  id: string;
  short_url: string;
  status: string;
}

export interface ApprovalResult {
  success: true;
  actionId: string;
  orderId: string;
  paymentLinkId: string;
  paymentLink: string;
  status: string;
}

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";
const RAZORPAY_TIMEOUT_MS = 20_000;

/**
 * Reads TEST-MODE credentials from environment.
 * Never hardcoded and never exposed to the client.
 */
export function getRazorpayCredentials(): RazorpayCredentials {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (
    keyId === undefined ||
    keyId.trim() === "" ||
    keySecret === undefined ||
    keySecret.trim() === ""
  ) {
    throw new AppError(
      "Razorpay test-mode credentials are not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).",
      503,
      "RAZORPAY_NOT_CONFIGURED"
    );
  }

  return {
    keyId: keyId.trim(),
    keySecret: keySecret.trim(),
  };
}

/**
 * Creates a Razorpay TEST-MODE Payment Link.
 */
export async function createRazorpayPaymentLink(options: {
  amountInPaise: number;
  referenceId: string;
  description: string;
  callbackUrl?: string;
  credentials?: RazorpayCredentials;
}): Promise<RazorpayPaymentLink> {
  const credentials =
    options.credentials ?? getRazorpayCredentials();

  const referenceId = options.referenceId.trim();

  if (referenceId.length === 0) {
    throw new AppError(
      "Payment reference ID cannot be empty.",
      400,
      "INVALID_REFERENCE_ID"
    );
  }

  if (referenceId.length > 40) {
    throw new AppError(
      "Payment reference ID must be 40 characters or fewer.",
      400,
      "INVALID_REFERENCE_ID"
    );
  }

  if (
    !Number.isInteger(options.amountInPaise) ||
    options.amountInPaise < 100
  ) {
    throw new AppError(
      "Payment amount must be an integer of at least 100 paise.",
      400,
      "INVALID_PAYMENT_AMOUNT"
    );
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    RAZORPAY_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${RAZORPAY_API_BASE}/payment_links`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${credentials.keyId}:${credentials.keySecret}`
          ).toString("base64")}`,
        },
        body: JSON.stringify({
          amount: options.amountInPaise,
          currency: "INR",
          accept_partial: false,
          reference_id: referenceId,
          description: options.description,

          ...(options.callbackUrl
            ? {
                callback_url: options.callbackUrl,
                callback_method: "get",
              }
            : {}),
        }),
        signal: controller.signal,
      }
    );

    const bodyText = await response.text().catch(() => "");

    if (!response.ok) {
      let detail = `Razorpay rejected the payment link request with status ${response.status}.`;
      let razorpayCode: string | undefined;

      try {
        const parsed = JSON.parse(bodyText) as {
          error?: {
            code?: string;
            description?: string;
          };
        };

        if (parsed.error?.code) {
          razorpayCode = parsed.error.code;
        }

        if (parsed.error?.description) {
          detail = parsed.error.description;
        }
      } catch {
        // Keep generic detail if Razorpay returned non-JSON.
      }

      logger.error("Razorpay Payment Link request failed", {
        status: response.status,
        referenceId,
        razorpayCode,
      });

      throw new AppError(
        detail,
        502,
        "RAZORPAY_ERROR"
      );
    }

    let link: RazorpayPaymentLink;

    try {
      link = JSON.parse(bodyText) as RazorpayPaymentLink;
    } catch {
      throw new AppError(
        "Razorpay returned an unparseable payment link response.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    if (
      typeof link.id !== "string" ||
      link.id.length === 0 ||
      typeof link.short_url !== "string" ||
      link.short_url.length === 0
    ) {
      throw new AppError(
        "Razorpay returned an unexpected payment link response.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    return link;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new AppError(
        "Razorpay payment link request timed out.",
        504,
        "RAZORPAY_TIMEOUT"
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Append-oriented audit helper.
 * Never record secrets.
 */
export async function recordAudit(
  event: string,
  details: Record<
    string,
    string | number | boolean | undefined
  >,
  actionId: string | null
): Promise<void> {
  await AuditLogModel.create({
    actionId:
      actionId === null
        ? undefined
        : new Types.ObjectId(actionId),
    event,
    details,
    timestamp: new Date(),
  });
}

/**
 * Recomputes the authoritative amount from MongoDB.
 *
 * The AI-proposed amount is NEVER used for payment creation.
 */
export async function calculateAuthoritativeAmount(
  proposal: {
    items: {
      productId: Types.ObjectId;
      quantity: number;
    }[];
  }
): Promise<number> {
  const quantitiesByProductId = new Map<
    string,
    number
  >();

  for (const item of proposal.items) {
    const key = String(item.productId);

    quantitiesByProductId.set(
      key,
      (quantitiesByProductId.get(key) ?? 0) +
        item.quantity
    );
  }

  const products = await ProductModel.find({
    _id: {
      $in: Array.from(
        quantitiesByProductId.keys()
      ),
    },
  });

  const productById = new Map(
    products.map((product) => [
      String(product._id),
      product,
    ])
  );

  let amountInPaise = 0;

  for (const [id, quantity] of quantitiesByProductId) {
    const product = productById.get(id);

    if (!product) {
      throw new AppError(
        `Authoritative amount cannot be calculated: product ${id} not found in catalog.`,
        409,
        "AI_UNKNOWN_PRODUCT"
      );
    }

    amountInPaise +=
      product.priceInPaise * quantity;
  }

  return amountInPaise;
}

/**
 * Creates an immutable order snapshot using
 * authoritative MongoDB prices.
 */
async function createOrderSnapshot(
  proposal: {
    referenceId: string;
    items: {
      productId: Types.ObjectId;
      quantity: number;
    }[];
  },
  amountInPaise: number
): Promise<HydratedDocument<Order>> {
  const existing = await OrderModel.findOne({
    referenceId: proposal.referenceId,
  });

  if (existing) {
    return existing;
  }

  const products = await ProductModel.find({
    _id: {
      $in: proposal.items.map(
        (item) => item.productId
      ),
    },
  });

  const prices = new Map(
    products.map((product) => [
      String(product._id),
      product.priceInPaise,
    ])
  );

  const items = proposal.items.map((item) => {
    const unitPriceInPaise = prices.get(
      String(item.productId)
    );

    if (unitPriceInPaise === undefined) {
      throw new AppError(
        "Product changed before order creation.",
        409,
        "PRODUCT_CHANGED"
      );
    }

    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPriceInPaise,
    };
  });

  try {
    return await OrderModel.create({
      items,
      amountInPaise,
      currency: "INR",
      status: "CREATED",
      referenceId: proposal.referenceId,
    });
  } catch (error) {
    if (
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000
    ) {
      const concurrentOrder =
        await OrderModel.findOne({
          referenceId: proposal.referenceId,
        });

      if (concurrentOrder) {
        return concurrentOrder;
      }
    }

    throw error;
  }
}

/**
 * Builds the persisted proposal back into the
 * policy-engine input format.
 */
function buildPersistedProposal(
  action: HydratedDocument<AgentAction>
): ActionProposalInput {
  return {
    action: action.proposal.action,

    items: action.proposal.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),

    proposedAmountInPaise:
      action.proposal.proposedAmountInPaise,

    reason: action.proposal.reason,

    requiresApproval:
      action.proposal.requiresApproval,

    referenceId: action.referenceId,

    ...(action.discountPercent === undefined
      ? {}
      : {
          discountPercent:
            action.discountPercent,
        }),
  };
}

/**
 * Re-evaluates the action against the CURRENT
 * merchant policy and CURRENT catalog.
 */
async function revalidateAction(
  action: HydratedDocument<AgentAction>
) {
  const merchant = await MerchantModel.findOne().sort({
    createdAt: 1,
  });

  if (!merchant) {
    throw new AppError(
      "Merchant policy was not found.",
      503,
      "MERCHANT_NOT_FOUND"
    );
  }

  const proposal =
    buildPersistedProposal(action);

  const result = await evaluateAction(
    proposal,
    merchant.policy
  );

  if (
    result.decision !== "ALLOW" ||
    result.verifiedAmountInPaise !==
      action.verifiedAmountInPaise
  ) {
    action.policyResult = {
      decision: result.decision,
      checks: result.checks,
    };

    action.approvalStatus = "REJECTED";
    action.executionStatus = "BLOCKED";

    await action.save();

    await recordAudit(
      "ACTION_BLOCKED",
      {
        policyDecision: result.decision,
        verifiedAmountInPaise:
          result.verifiedAmountInPaise,
      },
      String(action._id)
    );

    throw new AppError(
      "Action no longer satisfies current merchant policy.",
      409,
      "ACTION_REVALIDATION_FAILED"
    );
  }

  if (!result.approvalRequired) {
    action.approvalStatus = "NOT_REQUIRED";
    await action.save();

    throw new AppError(
      "This action no longer requires explicit approval.",
      409,
      "APPROVAL_NOT_REQUIRED"
    );
  }

  return result;
}

/**
 * Explicit human approval.
 *
 * Approval NEVER calls Razorpay.
 */
export interface ActionApprovalResult {
  success: true;
  actionId: string;
  approvalStatus: "APPROVED";
  executionStatus: "NOT_STARTED";
}

export async function approveAction(
  options: {
    actionId: string;
  }
): Promise<ActionApprovalResult> {
  if (
    !Types.ObjectId.isValid(options.actionId)
  ) {
    throw new AppError(
      "Invalid action ID.",
      400,
      "INVALID_ACTION_ID"
    );
  }

  const action =
    await AgentActionModel.findById(
      options.actionId
    );

  if (!action) {
    throw new AppError(
      "Agent action was not found.",
      404,
      "ACTION_NOT_FOUND"
    );
  }

  if (
    action.action !== "CREATE_PAYMENT" ||
    action.policyResult?.decision !== "ALLOW"
  ) {
    throw new AppError(
      "Only policy-allowed payment actions can be approved.",
      409,
      "ACTION_NOT_ALLOWED"
    );
  }

  if (
    action.approvalStatus !== "PENDING" ||
    action.executionStatus !== "NOT_STARTED"
  ) {
    throw new AppError(
      "This action has already been approved or processed.",
      409,
      "ACTION_ALREADY_PROCESSED"
    );
  }

  const reevaluation =
    await revalidateAction(action);

  const claimedAction =
    await AgentActionModel.findOneAndUpdate(
      {
        _id: action._id,
        approvalStatus: "PENDING",
        executionStatus: "NOT_STARTED",
      },
      {
        $set: {
          approvalStatus: "APPROVED",
          executionStatus: "NOT_STARTED",

          policyResult: {
            decision: reevaluation.decision,
            checks: reevaluation.checks,
          },

          verifiedAmountInPaise:
            reevaluation.verifiedAmountInPaise,
        },
      },
      {
        new: true,
      }
    );

  if (!claimedAction) {
    throw new AppError(
      "This action is already being processed.",
      409,
      "ACTION_ALREADY_PROCESSED"
    );
  }

  await recordAudit(
    "ACTION_APPROVED",
    {
      approvalState: "APPROVED",
      executionState: "NOT_STARTED",
    },
    String(claimedAction._id)
  );

  return {
    success: true,
    actionId: String(claimedAction._id),
    approvalStatus: "APPROVED",
    executionStatus: "NOT_STARTED",
  };
}

/**
 * Executes an explicitly approved action.
 *
 * THIS is the only path that calls Razorpay.
 */
export async function createPaymentForApprovedAction(
  options: {
    actionId: string;
    credentials?: RazorpayCredentials;
  }
): Promise<ApprovalResult> {
  if (
    !Types.ObjectId.isValid(options.actionId)
  ) {
    throw new AppError(
      "Invalid action ID.",
      400,
      "INVALID_ACTION_ID"
    );
  }

  const action =
    await AgentActionModel.findById(
      options.actionId
    );

  if (!action) {
    throw new AppError(
      "Agent action was not found.",
      404,
      "ACTION_NOT_FOUND"
    );
  }

  if (
    action.action !== "CREATE_PAYMENT" ||
    action.policyResult?.decision !== "ALLOW"
  ) {
    throw new AppError(
      "Only policy-allowed payment actions can create a payment.",
      409,
      "ACTION_NOT_ALLOWED"
    );
  }

  if (!action.approvalRequired) {
    throw new AppError(
      "This action does not require explicit approval.",
      409,
      "APPROVAL_NOT_REQUIRED"
    );
  }

  if (action.approvalStatus !== "APPROVED") {
    throw new AppError(
      "Action must be explicitly approved before payment creation.",
      409,
      "APPROVAL_REQUIRED"
    );
  }

  /**
   * Recovery path for previously UNKNOWN executions.
   */
  if (action.executionStatus === "UNKNOWN") {
    const unknownOrder =
      await OrderModel.findOne({
        referenceId: action.referenceId,
      });

    if (!unknownOrder) {
      throw new AppError(
        "Unknown payment state has no associated order.",
        409,
        "RECOVERY_ORDER_NOT_FOUND"
      );
    }

    return reconcilePayment({
      orderId: String(unknownOrder._id),

      ...(options.credentials === undefined
        ? {}
        : {
            credentials:
              options.credentials,
          }),
    }).then((result) => ({
      success: true as const,
      actionId: String(action._id),
      orderId: result.orderId,
      paymentLinkId:
        result.paymentLinkId ?? "",
      paymentLink:
        result.paymentLink ?? "",
      status: result.status,
    }));
  }

  if (
    action.executionStatus !== "NOT_STARTED"
  ) {
    throw new AppError(
      "This action has already been approved or processed.",
      409,
      "ACTION_ALREADY_PROCESSED"
    );
  }

  const reevaluation =
    await revalidateAction(action);

  const claimedAction =
    await AgentActionModel.findOneAndUpdate(
      {
        _id: action._id,
        approvalStatus: "APPROVED",
        executionStatus: "NOT_STARTED",
      },
      {
        $set: {
          executionStatus: "IN_PROGRESS",

          policyResult: {
            decision: reevaluation.decision,
            checks: reevaluation.checks,
          },

          verifiedAmountInPaise:
            reevaluation.verifiedAmountInPaise,
        },
      },
      {
        new: true,
      }
    );

  if (!claimedAction) {
    throw new AppError(
      "This action is already being processed.",
      409,
      "ACTION_ALREADY_PROCESSED"
    );
  }

  let order:
    | HydratedDocument<Order>
    | undefined;

  try {
    /**
     * MongoDB becomes the source of truth for
     * the order amount and item prices.
     */
    order = await createOrderSnapshot(
      {
        referenceId:
          claimedAction.referenceId,

        items:
          claimedAction.proposal.items,
      },
      reevaluation.verifiedAmountInPaise
    );

    /**
     * If the payment link already exists,
     * do not create a duplicate Razorpay link.
     */
    if (
      order.razorpayPaymentLinkId &&
      order.razorpayPaymentLinkUrl
    ) {
      claimedAction.executionStatus =
        "SUCCEEDED";

      await claimedAction.save();

      return {
        success: true,
        actionId: String(
          claimedAction._id
        ),
        orderId: String(order._id),
        paymentLinkId:
          order.razorpayPaymentLinkId,
        paymentLink:
          order.razorpayPaymentLinkUrl,
        status: order.status,
      };
    }

    await recordAudit(
      "PAYMENT_LINK_CREATION_STARTED",
      {
        verifiedAmountInPaise:
          reevaluation.verifiedAmountInPaise,

        executionState: "IN_PROGRESS",
      },
      String(claimedAction._id)
    );

    const frontendUrl = (
      process.env.FRONTEND_URL ||
      "http://localhost:5173"
    ).replace(/\/$/, "");

    /**
     * Razorpay callback returns the user to
     * the frontend payment detail page.
     */
    const paymentLink =
      await createRazorpayPaymentLink({
        amountInPaise:
          reevaluation.verifiedAmountInPaise,

        referenceId:
          claimedAction.referenceId,

        description:
          `AgentShield order ${claimedAction.referenceId}`,

        callbackUrl:
          `${frontendUrl}/payments/${String(
            order._id
          )}`,

        ...(options.credentials === undefined
          ? {}
          : {
              credentials:
                options.credentials,
            }),
      });

    order.razorpayPaymentLinkId =
      paymentLink.id;

    order.razorpayPaymentLinkUrl =
      paymentLink.short_url;

    order.status =
      "AWAITING_PAYMENT";

    await order.save();

    claimedAction.executionStatus =
      "SUCCEEDED";

    await claimedAction.save();

    await recordAudit(
      "PAYMENT_LINK_CREATED",
      {
        razorpayIdentifier:
          paymentLink.id,

        executionState: "SUCCEEDED",
      },
      String(claimedAction._id)
    );

    return {
      success: true,
      actionId: String(
        claimedAction._id
      ),
      orderId: String(order._id),
      paymentLinkId:
        paymentLink.id,
      paymentLink:
        paymentLink.short_url,
      status: order.status,
    };
  } catch (error) {
    /**
     * Known Razorpay rejection.
     */
    if (
      error instanceof AppError &&
      error.code === "RAZORPAY_ERROR"
    ) {
      if (order) {
        order.status = "FAILED";
        await order.save();
      }

      claimedAction.executionStatus =
        "FAILED";

      await claimedAction.save();

      await recordAudit(
        "PAYMENT_EXECUTION_FAILED",
        {
          executionState: "FAILED",
          errorCategory: error.code,
        },
        String(claimedAction._id)
      );

      throw error;
    }

    /**
     * Unknown outcome.
     *
     * We cannot safely assume whether Razorpay
     * created the payment link, so recovery is
     * required.
     */
    if (order) {
      order.status = "UNKNOWN";
      await order.save();
    }

    claimedAction.executionStatus =
      "UNKNOWN";

    await claimedAction.save();

    await recordAudit(
      "PAYMENT_EXECUTION_UNKNOWN",
      {
        executionState: "UNKNOWN",

        errorCategory:
          error instanceof Error
            ? error.message
            : "PAYMENT_EXECUTION_UNKNOWN",
      },
      String(claimedAction._id)
    );

    throw error;
  }
}

/**
 * Backward-compatible composition used by
 * existing unit tests.
 */
export async function approveActionAndCreatePayment(
  options: {
    actionId: string;
    credentials?: RazorpayCredentials;
  }
): Promise<ApprovalResult> {
  await approveAction({
    actionId: options.actionId,
  });

  return createPaymentForApprovedAction(
    options
  );
}

/**
 * Razorpay Payment Link lookup result.
 */
export interface RazorpayPaymentLinkDetail {
  id: string;
  short_url: string;
  status: string;
  reference_id?: string;
}

/**
 * Looks up a Razorpay Payment Link either
 * by ID or reference ID.
 */
export async function lookupRazorpayPaymentLink(
  options: {
    paymentLinkId?: string;
    referenceId?: string;
    credentials?: RazorpayCredentials;
  }
): Promise<RazorpayPaymentLinkDetail | null> {
  const credentials =
    options.credentials ??
    getRazorpayCredentials();

  if (
    options.paymentLinkId &&
    options.paymentLinkId.trim().length > 0
  ) {
    return lookupPaymentLinkById(
      options.paymentLinkId,
      credentials
    );
  }

  if (
    options.referenceId &&
    options.referenceId.trim().length > 0
  ) {
    return lookupPaymentLinkByReference(
      options.referenceId,
      credentials
    );
  }

  return null;
}

/**
 * Razorpay lookup by Payment Link ID.
 */
async function lookupPaymentLinkById(
  id: string,
  credentials: RazorpayCredentials
): Promise<RazorpayPaymentLinkDetail | null> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    RAZORPAY_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${RAZORPAY_API_BASE}/payment_links/${encodeURIComponent(
        id
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${credentials.keyId}:${credentials.keySecret}`
          ).toString("base64")}`,
        },
        signal: controller.signal,
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      let detail = `Razorpay lookup failed with status ${response.status}.`;

      try {
        const bodyText =
          await response.text();

        const parsed =
          JSON.parse(bodyText) as {
            error?: {
              description?: string;
            };
          };

        if (
          parsed.error?.description
        ) {
          detail =
            parsed.error.description;
        }
      } catch {
        // Keep generic detail.
      }

      throw new AppError(
        detail,
        502,
        "RAZORPAY_ERROR"
      );
    }

    const bodyText =
      await response.text().catch(
        () => ""
      );

    let link:
      | RazorpayPaymentLinkDetail;

    try {
      link =
        JSON.parse(
          bodyText
        ) as RazorpayPaymentLinkDetail;
    } catch {
      throw new AppError(
        "Razorpay returned an unparseable payment link detail.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    if (
      typeof link.id !== "string" ||
      link.id.length === 0
    ) {
      throw new AppError(
        "Razorpay returned an unexpected payment link detail.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    return link;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Razorpay lookup by reference ID.
 */
async function lookupPaymentLinkByReference(
  referenceId: string,
  credentials: RazorpayCredentials
): Promise<RazorpayPaymentLinkDetail | null> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    RAZORPAY_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${RAZORPAY_API_BASE}/payment_links?reference_id=${encodeURIComponent(
        referenceId
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${credentials.keyId}:${credentials.keySecret}`
          ).toString("base64")}`,
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      let detail = `Razorpay lookup failed with status ${response.status}.`;

      try {
        const bodyText =
          await response.text();

        const parsed =
          JSON.parse(bodyText) as {
            error?: {
              description?: string;
            };
          };

        if (
          parsed.error?.description
        ) {
          detail =
            parsed.error.description;
        }
      } catch {
        // Keep generic detail.
      }

      throw new AppError(
        detail,
        502,
        "RAZORPAY_ERROR"
      );
    }

    const bodyText =
      await response.text().catch(
        () => ""
      );

    let parsed: {
      payment_links?: RazorpayPaymentLinkDetail[];
    };

    try {
      parsed =
        JSON.parse(bodyText) as {
          payment_links?: RazorpayPaymentLinkDetail[];
        };
    } catch {
      throw new AppError(
        "Razorpay returned an unparseable payment link list.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    const links =
      parsed.payment_links ?? [];

    return links.length > 0
      ? links[0]
      : null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Payment history item returned to the frontend.
 *
 * IMPORTANT:
 * razorpayPaymentId is intentionally NOT included
 * because the current Order model does not persist it.
 */
export interface PaymentHistoryItem {
  orderId: string;
  referenceId: string;
  amountInPaise: number;
  currency: Order["currency"];
  status: OrderStatus;

  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPriceInPaise: number;
  }>;

  paymentLinkId?: string;
  paymentLink?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Returns persisted orders for the Payments
 * history screen.
 *
 * MongoDB is the source of truth for:
 * - amount
 * - item quantities
 * - item prices
 * - order state
 * - Razorpay Payment Link identifiers
 */
export async function getPaymentHistoryFromDatabase(): Promise<
  PaymentHistoryItem[]
> {
  const orders =
    await OrderModel.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

  if (orders.length === 0) {
    return [];
  }

  const productIds = Array.from(
    new Set(
      orders.flatMap((order) =>
        order.items.map(
          (item) =>
            String(item.productId)
        )
      )
    )
  );

  const products =
    await ProductModel.find({
      _id: {
        $in: productIds,
      },
    })
      .select("_id name")
      .lean();

  const productNames =
    new Map(
      products.map((product) => [
        String(product._id),
        product.name,
      ])
    );

  return orders.map((order) => ({
    orderId: String(order._id),

    referenceId:
      order.referenceId,

    amountInPaise:
      order.amountInPaise,

    currency:
      order.currency,

    status:
      order.status,

    items: order.items.map(
      (item) => ({
        productId:
          String(item.productId),

        productName:
          productNames.get(
            String(item.productId)
          ) ?? "Unknown product",

        quantity:
          item.quantity,

        unitPriceInPaise:
          item.unitPriceInPaise,
      })
    ),

    ...(order.razorpayPaymentLinkId
      ? {
          paymentLinkId:
            order.razorpayPaymentLinkId,
        }
      : {}),

    ...(order.razorpayPaymentLinkUrl
      ? {
          paymentLink:
            order.razorpayPaymentLinkUrl,
        }
      : {}),

    createdAt:
      order.createdAt.toISOString(),

    updatedAt:
      order.updatedAt.toISOString(),
  }));
}

/**
 * Gets the current payment status.
 *
 * Local MongoDB state is always returned.
 * Razorpay is queried when a Payment Link exists.
 */
export async function getPaymentStatusByOrderId(
  options: {
    orderId: string;
    credentials?: RazorpayCredentials;
  }
): Promise<{
  orderId: string;
  status: OrderStatus;
  amountInPaise: number;
  referenceId: string;
  paymentLinkId?: string;
  paymentLink?: string;
  razorpayStatus?: string;
}> {
  if (
    !Types.ObjectId.isValid(
      options.orderId
    )
  ) {
    throw new AppError(
      "Invalid order ID.",
      400,
      "INVALID_ORDER_ID"
    );
  }

  const order =
    await OrderModel.findById(
      options.orderId
    );

  if (!order) {
    throw new AppError(
      "Order was not found.",
      404,
      "ORDER_NOT_FOUND"
    );
  }

  let razorpayStatus:
    | string
    | undefined;

  if (
    order.razorpayPaymentLinkId ||
    order.referenceId
  ) {
    const credentials =
      options.credentials ??
      getRazorpayCredentials();

    const remote =
      await lookupRazorpayPaymentLink({
        ...(order.razorpayPaymentLinkId
          ? {
              paymentLinkId:
                order.razorpayPaymentLinkId,
            }
          : {}),

        referenceId:
          order.referenceId,

        credentials,
      });

    if (remote) {
      razorpayStatus =
        remote.status;

      if (
        (remote.status === "paid" ||
          remote.status ===
            "captured") &&
        order.status ===
          "AWAITING_PAYMENT"
      ) {
        order.status = "PAID";
        await order.save();
      } else if (
        (remote.status === "expired" ||
          remote.status ===
            "failed") &&
        order.status ===
          "AWAITING_PAYMENT"
      ) {
        order.status = "FAILED";
        await order.save();
      }
    }
  }

  return {
    orderId: String(order._id),

    status:
      order.status,

    amountInPaise:
      order.amountInPaise,

    referenceId:
      order.referenceId,

    ...(order.razorpayPaymentLinkId
      ? {
          paymentLinkId:
            order.razorpayPaymentLinkId,
        }
      : {}),

    ...(order.razorpayPaymentLinkUrl
      ? {
          paymentLink:
            order.razorpayPaymentLinkUrl,
        }
      : {}),

    ...(razorpayStatus
      ? {
          razorpayStatus,
        }
      : {}),
  };
}

/**
 * Reconciles an order stuck in UNKNOWN state.
 *
 * UNKNOWN
 *    ↓
 * RECOVERING
 *    ↓
 * PAID / RECOVERED / AWAITING_PAYMENT
 */
export async function reconcilePayment(
  options: {
    orderId: string;
    credentials?: RazorpayCredentials;
  }
): Promise<{
  orderId: string;
  status: string;
  paymentLinkId?: string;
  paymentLink?: string;
}> {
  if (
    !Types.ObjectId.isValid(
      options.orderId
    )
  ) {
    throw new AppError(
      "Invalid order ID.",
      400,
      "INVALID_ORDER_ID"
    );
  }

  const order =
    await OrderModel.findById(
      options.orderId
    );

  if (!order) {
    throw new AppError(
      "Order was not found.",
      404,
      "ORDER_NOT_FOUND"
    );
  }

  if (order.status !== "UNKNOWN") {
    throw new AppError(
      "Only orders in UNKNOWN state can be reconciled.",
      409,
      "ORDER_NOT_UNKNOWN"
    );
  }

  const action =
    await AgentActionModel.findOne({
      referenceId:
        order.referenceId,
    });

  const actionId = action
    ? String(action._id)
    : null;

  await recordAudit(
    "RECOVERY_STARTED",
    {
      orderId:
        String(order._id),
    },
    actionId
  );

  const claimed =
    await OrderModel.findOneAndUpdate(
      {
        _id: order._id,
        status: "UNKNOWN",
      },
      {
        $set: {
          status: "RECOVERING",
        },
      },
      {
        new: true,
      }
    );

  if (!claimed) {
    throw new AppError(
      "Order is already being reconciled by another process.",
      409,
      "ORDER_ALREADY_RECOVERING"
    );
  }

  try {
    /**
     * Recompute the amount from current catalog.
     */
    const verifiedAmountInPaise =
      await calculateAuthoritativeAmount({
        items: order.items.map(
          (item) => ({
            productId:
              item.productId,

            quantity:
              item.quantity,
          })
        ),
      });

    let paymentLinkId =
      order.razorpayPaymentLinkId;

    let paymentLink =
      order.razorpayPaymentLinkUrl;

    let finalStatus:
      | OrderStatus
      = "UNKNOWN";

    let existing:
      | RazorpayPaymentLinkDetail
      | null = null;

    let lookupFailed =
      false;

    /**
     * First check Razorpay to prevent
     * accidentally creating a duplicate.
     */
    try {
      existing =
        await lookupRazorpayPaymentLink({
          ...(order.razorpayPaymentLinkId
            ? {
                paymentLinkId:
                  order.razorpayPaymentLinkId,
              }
            : {}),

          referenceId:
            order.referenceId,

          ...(options.credentials ===
          undefined
            ? {}
            : {
                credentials:
                  options.credentials,
              }),
        });
    } catch (lookupError) {
      lookupFailed = true;

      await recordAudit(
        "RECOVERY_UNRESOLVED",
        {
          errorCategory:
            lookupError instanceof
              AppError
              ? lookupError.code
              : "RECOVERY_LOOKUP_ERROR",
        },
        actionId
      );
    }

    /**
     * If Razorpay lookup itself failed,
     * stay UNKNOWN. Never blindly retry.
     */
    if (lookupFailed) {
      await OrderModel.findByIdAndUpdate(
        order._id,
        {
          $set: {
            status: "UNKNOWN",
          },
        }
      );

      if (action) {
        action.executionStatus =
          "UNKNOWN";

        await action.save();
      }

      throw new AppError(
        "Recovery lookup failed. Order remains in UNKNOWN state.",
        502,
        "RECOVERY_LOOKUP_FAILED"
      );
    }

    /**
     * Existing Razorpay Payment Link found.
     */
    if (existing) {
      paymentLinkId =
        existing.id;

      paymentLink =
        existing.short_url;

      await recordAudit(
        "RECOVERY_PAYMENT_FOUND",
        {
          razorpayIdentifier:
            existing.id,

          referenceId:
            order.referenceId,
        },
        actionId
      );

      if (
        existing.status === "paid" ||
        existing.status ===
          "captured"
      ) {
        await recordAudit(
          "RECOVERY_PAYMENT_CONFIRMED",
          {
            razorpayIdentifier:
              existing.id,

            paymentStatus:
              existing.status,
          },
          actionId
        );

        finalStatus =
          "PAID";
      } else {
        /**
         * Payment link exists but has
         * not been paid yet.
         */
        finalStatus =
          "RECOVERED";
      }
    } else {
      /**
       * Razorpay has no matching link.
       *
       * A safe retry is now allowed.
       */
      await recordAudit(
        "RECOVERY_SAFE_RETRY",
        {
          verifiedAmountInPaise,
        },
        actionId
      );

      try {
        const frontendUrl = (
          process.env.FRONTEND_URL ||
          "http://localhost:5173"
        ).replace(/\/$/, "");

        const newPaymentLink =
          await createRazorpayPaymentLink({
            amountInPaise:
              verifiedAmountInPaise,

            referenceId:
              order.referenceId,

            description:
              `AgentShield order ${order.referenceId}`,

            callbackUrl:
              `${frontendUrl}/payments/${String(
                order._id
              )}`,

            ...(options.credentials ===
            undefined
              ? {}
              : {
                  credentials:
                    options.credentials,
                }),
          });

        paymentLinkId =
          newPaymentLink.id;

        paymentLink =
          newPaymentLink.short_url;

        finalStatus =
          "AWAITING_PAYMENT";
      } catch (retryError) {
        /**
         * Known Razorpay rejection.
         */
        if (
          retryError instanceof
            AppError &&
          retryError.code ===
            "RAZORPAY_ERROR"
        ) {
          await OrderModel.findByIdAndUpdate(
            order._id,
            {
              $set: {
                status: "FAILED",
              },
            }
          );

          if (action) {
            action.executionStatus =
              "FAILED";

            await action.save();
          }

          await recordAudit(
            "RECOVERY_RETRY_FAILED",
            {
              errorCategory:
                retryError.code,
            },
            actionId
          );

          throw retryError;
        }

        /**
         * Unknown retry outcome.
         * Keep the order UNKNOWN.
         */
        await OrderModel.findByIdAndUpdate(
          order._id,
          {
            $set: {
              status: "UNKNOWN",
            },
          }
        );

        if (action) {
          action.executionStatus =
            "UNKNOWN";

          await action.save();
        }

        await recordAudit(
          "RECOVERY_RETRY_FAILED",
          {
            errorCategory:
              retryError instanceof
                Error
                ? retryError.message
                : "RECOVERY_RETRY_ERROR",
          },
          actionId
        );

        throw new AppError(
          "Recovery retry failed. Order remains in UNKNOWN state.",
          502,
          "RECOVERY_RETRY_FAILED"
        );
      }
    }

    /**
     * Persist recovered Razorpay identifiers
     * and final order state.
     */
    order.razorpayPaymentLinkId =
      paymentLinkId;

    order.razorpayPaymentLinkUrl =
      paymentLink;

    order.status =
      finalStatus;

    await order.save();

    /**
     * Synchronize the AgentAction state.
     */
    if (action) {
      if (finalStatus === "PAID") {
        action.executionStatus =
          "SUCCEEDED";
      } else if (
        finalStatus === "RECOVERED"
      ) {
        action.executionStatus =
          "RECOVERED";
      } else if (
        finalStatus ===
        "AWAITING_PAYMENT"
      ) {
        action.executionStatus =
          "SUCCEEDED";
      }

      await action.save();
    }

    return {
      orderId:
        String(order._id),

      status:
        finalStatus,

      paymentLinkId,
      paymentLink,
    };
  } catch (error) {
    /**
     * Preserve the explicit recovery failure state.
     */
    if (
      error instanceof AppError &&
      error.code ===
        "RECOVERY_LOOKUP_FAILED"
    ) {
      throw error;
    }

    /**
     * Any unexpected recovery error
     * returns the order to UNKNOWN.
     */
    await OrderModel.findByIdAndUpdate(
      order._id,
      {
        $set: {
          status: "UNKNOWN",
        },
      }
    );

    if (action) {
      action.executionStatus =
        "UNKNOWN";

      await action.save();
    }

    throw error;
  }
}