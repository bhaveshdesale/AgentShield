import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { ProductModel } from "../models/Product";
import { AppError } from "../utils/AppError";
import type { ActionProposalInput } from "../types/domain";

export interface CatalogProduct {
  productId: string;
  name: string;
  category: string;
  tags: string[];
  priceInPaise: number;
  inventory: number;
}

export interface AgentRecommendation {
  productId: string;
  name: string;
  priceInPaise: number;
  reason: string;
}

function toCatalogProduct(doc: {
  _id: unknown;
  name: string;
  category: string;
  tags: string[];
  priceInPaise: number;
  inventory: number;
}): CatalogProduct {
  return {
    productId: String(doc._id),
    name: doc.name,
    category: doc.category,
    tags: doc.tags,
    priceInPaise: doc.priceInPaise,
    inventory: doc.inventory,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listAgentCatalog(
  limit = 100,
): Promise<CatalogProduct[]> {
  const docs = await ProductModel.find().limit(limit);
  return docs.map(toCatalogProduct);
}

/** searchProducts: keyword search over name, tags and category. */
export async function searchProducts(
  query: string,
  limit = 5,
): Promise<CatalogProduct[]> {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

  if (tokens.length === 0) {
    return [];
  }

  const regex = tokens.map((token) => escapeRegex(token)).join("|");
  const docs = await ProductModel.find({
    $or: [
      { name: { $regex: regex, $options: "i" } },
      { tags: { $regex: regex, $options: "i" } },
      { category: { $regex: regex, $options: "i" } },
    ],
  }).limit(limit);

  return docs.map(toCatalogProduct);
}

/** getProduct: fetch a single catalog product by ID. */
export async function getProduct(
  productId: string,
): Promise<CatalogProduct | null> {
  if (!Types.ObjectId.isValid(productId)) {
    return null;
  }
  const doc = await ProductModel.findById(productId);
  return doc ? toCatalogProduct(doc) : null;
}

/** recommendProducts: cross-sell via frequentlyBoughtWith, then same category. */
export async function recommendProducts(
  productId: string,
  limit = 3,
): Promise<AgentRecommendation[]> {
  const seed = await getProduct(productId);
  if (!seed) {
    return [];
  }

  const seedDoc = await ProductModel.findById(productId);
  const relatedIds = (seedDoc?.frequentlyBoughtWith ?? []).map((id) => String(id));
  const related = relatedIds.length > 0 ? await ProductModel.find({ _id: { $in: relatedIds } }) : [];

  const recommendations: AgentRecommendation[] = related.slice(0, limit).map((doc) => ({
    productId: String(doc._id),
    name: doc.name,
    priceInPaise: doc.priceInPaise,
    reason: `Frequently bought together with ${seed.name}.`,
  }));

  if (recommendations.length < limit) {
    const sameCategory = await ProductModel.find({
      _id: { $ne: seed.productId },
      category: seed.category,
      inventory: { $gt: 0 },
    }).limit(limit - recommendations.length);

    for (const doc of sameCategory) {
      recommendations.push({
        productId: String(doc._id),
        name: doc.name,
        priceInPaise: doc.priceInPaise,
        reason: `Other popular items in ${doc.category}.`,
      });
    }
  }

  return recommendations;
}

/** proposePayment: builds a structured CREATE_PAYMENT proposal from DB prices.
 * The amount is a PROPOSAL only — the policy engine computes the authoritative
 * amount independently from MongoDB. */
export async function proposePayment(
  items: { productId: string; quantity: number }[],
  reason: string,
): Promise<ActionProposalInput> {
  if (items.length === 0) {
    throw new AppError("proposePayment requires at least one item.", 400, "INVALID_PROPOSAL");
  }

  const catalogItems: { productId: string; quantity: number }[] = [];
  let proposedAmountInPaise = 0;

  for (const item of items) {
    const product = await getProduct(item.productId);
    if (!product) {
      throw new AppError(
        `Cannot propose payment: product ${item.productId} was not found in the catalog.`,
        400,
        "AI_UNKNOWN_PRODUCT"
      );
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new AppError(
        `Cannot propose payment: quantity for ${product.name} must be a positive integer.`,
        400,
        "INVALID_PROPOSAL"
      );
    }
    catalogItems.push({ productId: product.productId, quantity: item.quantity });
    proposedAmountInPaise += product.priceInPaise * item.quantity;
  }

  return {
    action: "CREATE_PAYMENT",
    items: catalogItems.map((item) => ({
      productId: new Types.ObjectId(item.productId),
      quantity: item.quantity,
    })),
    proposedAmountInPaise,
    reason,
    requiresApproval: true,
    referenceId: `agent-${randomUUID().replace(/-/g, "")}`,
  };
}
