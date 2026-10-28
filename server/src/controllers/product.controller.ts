import type { NextFunction, Request, Response } from "express";
import { getProductById, listProducts } from "../services/catalog.service";
import { AppError } from "../utils/AppError";

export function readProductIdParam(value: unknown): string {
  if (typeof value !== "string") {
    throw new AppError("Invalid product ID.", 400, "INVALID_PRODUCT_ID");
  }
  return value;
}

export async function getProducts(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json({ products: await listProducts() });
  } catch (error) {
    next(error);
  }
}

export async function getProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(await getProductById(readProductIdParam(req.params.id)));
  } catch (error) {
    next(error);
  }
}
