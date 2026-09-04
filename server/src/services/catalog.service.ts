import { Types } from "mongoose";
import { ProductModel } from "../models/Product";
import { AppError } from "../utils/AppError";

export interface ProductResponse {
  id: string;
  name: string;
  description: string;
  priceInPaise: number;
  currency: "INR";
  category: string;
  tags: string[];
  inventory: number;
  frequentlyBoughtWith: string[];
}

function mapProduct(product: { _id: unknown; name: string; description: string; priceInPaise: number; currency: "INR"; category: string; tags: string[]; inventory: number; frequentlyBoughtWith: { toString(): string }[] }): ProductResponse {
  return {
    id: String(product._id),
    name: product.name,
    description: product.description,
    priceInPaise: product.priceInPaise,
    currency: product.currency,
    category: product.category,
    tags: product.tags,
    inventory: product.inventory,
    frequentlyBoughtWith: product.frequentlyBoughtWith.map(String),
  };
}

export async function listProducts(): Promise<ProductResponse[]> {
  const products = await ProductModel.find().sort({ createdAt: 1 });
  return products.map(mapProduct);
}

export async function getProductById(productId: string): Promise<ProductResponse> {
  if (!Types.ObjectId.isValid(productId)) throw new AppError("Invalid product ID.", 400, "INVALID_PRODUCT_ID");
  const product = await ProductModel.findById(productId);
  if (!product) throw new AppError("Product was not found.", 404, "PRODUCT_NOT_FOUND");
  return mapProduct(product);
}
