import { Router } from "express";
import { actionRouter } from "./action.routes";
import { agentRouter } from "./agent.routes";
import { healthRouter } from "./health.routes";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/actions", actionRouter);
apiRouter.use("/agent", agentRouter);

export { apiRouter };
