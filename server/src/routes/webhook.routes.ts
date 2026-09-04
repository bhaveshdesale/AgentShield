import { Router } from "express";
import { receiveRazorpayWebhook } from "../controllers/webhook.controller";

const webhookRouter = Router();

webhookRouter.post("/razorpay", receiveRazorpayWebhook);

export { webhookRouter };
