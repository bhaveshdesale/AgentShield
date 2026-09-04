import type { NextFunction, Request, Response } from "express";
import { getProductById, listProducts } from "../services/catalog.service";

export async function getProducts(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json({ products: await listProducts() });
  } catch (error) {
    next(error);
  }
}

export async function getProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(await getProductById(req.params.id));
  } catch (error) {
    next(error);
  }
}
