import { Router } from "express";
import { actionRouter } from "./action.routes";
import { healthRouter } from "./health.routes";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/actions", actionRouter);

export { apiRouter };
