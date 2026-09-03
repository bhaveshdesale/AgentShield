import { Router } from "express";
import { agentChat } from "../controllers/agent.controller";

const agentRouter = Router();

agentRouter.post("/chat", agentChat);

export { agentRouter };