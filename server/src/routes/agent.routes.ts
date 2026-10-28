import { Router } from "express";
import { agentChat } from "../controllers/agent.controller";
import { requireRoles } from "../middleware/authentication";

const agentRouter = Router();

agentRouter.post("/chat", requireRoles("admin", "approver"), agentChat);

export { agentRouter };