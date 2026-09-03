import { randomUUID } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { AuditLogModel } from "../models/AuditLog";
import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { AgentActionModel } from "../models/AgentAction";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import type { Order, PolicyEvaluationResult } from "../types/domain";

/**
 * Razorpay TEST-MODE payment service + explicit approval flow.
 *
 * Core principle: AI can propose. AgentShield authorizes. Razorpay executes.
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
const RAZORPAY_TIMEOUT_MS = 20000;

/** Reads TEST-MODE credentials from env. Never hardcoded, never exposed. */
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
  return { keyId: keyId.trim(), keySecret: keySecret.trim() };
}

/** Minimal Razorpay TEST-MODE Payment Link creation. */
export async function createRazorpayPaymentLink(options: {
  amountInPaise: number;
  referenceId: string;
  description: string;
  credentials?: RazorpayCredentials;
}): Promise<RazorpayPaymentLink> {
  const credentials = options.credentials ?? getRazorpayCredentials();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RAZORPAY_TIMEOUT_MS);

  try {
    const response = await fetch(`${RAZORPAY_API_BASE}/payment_links`, {
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
        reference_id: options.referenceId,
        description: options.description,
      }),
      signal: controller.signal,
    });

    const bodyText = await response.text().catch(() => "");
    if (!response.ok) {
      // Never log or return the secret; only the status is preserved.
      logger.error("Razorpay Payment Link request failed", {
        status: response.status,
        referenceId: options.referenceId,
      });
      let detail = "Razorpay rejected the payment link request.";
      try {
        const parsed = JSON.parse(bodyText) as { error?: { description?: string } };
        if (parsed.error?.description) {
          detail = parsed.error.description;
        }
      } catch {
        // keep generic detail
      }
      throw new AppError(detail, 502, "RAZORPAY_ERROR");
    }

    const link = JSON.parse(bodyText) as RazorpayPaymentLink;
    if (
      typeof link.id !== "string" ||
      typeof link.short_url !== "string" ||
      link.id.length === 0
    ) {
      throw new AppError(
        "Razorpay returned an unexpected payment link response.",
        502,
        "RAZORPAY_ERROR"
      );
    }
    return link;
  } finally {
    clearTimeout(timeout);
  }
}

/** Append-oriented audit helper. Never record secrets. */
export async function recordAudit(event: string, details: Record<string, string | number | boolean | undefined>, actionId: string | null): Promise<void> {
  await AuditLogModel.create({
    actionId: actionId === null ? undefined : new Types.ObjectId(actionId),
    event,
    details,
    timestamp: new Date(),
  });
}

/** Recomputes the authoritative amount from MongoDB (same source of truth as
 * the policy engine). The AI-proposed amount is never used for payments. */
export async function calculateAuthoritativeAmount(proposal: { items: { productId: Types.ObjectId; quantity: number }[] }): Promise<number> {
  const quantitiesByProductId = new Map<string, number>();
  for (const item of proposal.items) {
    const key = String(item.productId);
    quantitiesByProductId.set(key, (quantitiesByProductId.get(key) ?? 0) + item.quantity);
  }

  const products = await ProductModel.find({ _id: { $in: Array.from(quantitiesByProductId.keys()) } });
  const productById = new Map(products.map((p) => [String(p._id), p]));

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
    amountInPaise += product.priceInPaise * quantity;
  }
  return amountInPaise;
}

async function findOrCreateOrder(actionId: string, proposal: { referenceId: string; items: { productId: Types.ObjectId; quantity: number }[] }, amountInPaise: number): Promise<Order> {
  const existing = await OrderModel.findOne({ referenceId: proposal.referenceId });
  if (existing) {
    return existing;
  }
  return OrderModel.create({
    items: proposal.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPriceInPaise: 0, // unit prices persisted by webhook/state update later; total below is authoritative
    })),
    amountInPaise,
    currency: "INR",
    status: "PENDING" as Order["status"],
    referenceId: proposal.referenceId,
  });
}

/**
 * Explicit approval flow: AI proposal → policy ALLOW → explicit approval →
 * Razorpay TEST-MODE Payment Link → Order PENDING.
 *
 * Amounts, approval state and Razorpay identifiers come only from the server
 * database — never from the request body or the AI.
 */
export async function approveActionAndCreatePayment(options: {
  actionId: string;
  credentials?: RazorpayCredentials;
}): Promise<ApprovalResult
