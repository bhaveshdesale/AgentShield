import { Router } from "express";
import { createPayment, getPaymentStatus } from "../controllers/reconcile.controller";

const paymentRouter = Router();
paymentRouter.post("/create", createPayment);
paymentRouter.get("/:id/status", getPaymentStatus);

export { paymentRouter };
