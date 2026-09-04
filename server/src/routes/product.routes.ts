import { Router } from "express";
import { getProduct, getProducts } from "../controllers/product.controller";

const productRouter = Router();
productRouter.get("/", getProducts);
productRouter.get("/:id", getProduct);
export { productRouter };
