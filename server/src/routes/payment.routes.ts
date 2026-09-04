import { Router } from "express";
import { reconcilePaymentController } from "../controllers/reconcile.controller";

const paymentRouter = Router();

paymentRouter.post("/:orderId/reconcile", reconcilePaymentController);

export { paymentRouter };
