import { Router } from "express";
import { actionRouter } from "./action.routes";
import { agentRouter } from "./agent.routes";
import { healthRouter } from "./health.routes";
import { paymentRouter } from "./payment.routes";
import { productRouter } from "./product.routes";
import { auditRouter } from "./audit.routes";
import { dashboardRouter } from "./dashboard.routes";
import { simulationRouter } from "./simulation.routes";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/actions", actionRouter);
apiRouter.use("/agent", agentRouter);
apiRouter.use("/payments", paymentRouter);
apiRouter.use("/products", productRouter);
apiRouter.use("/audit", auditRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/simulation", simulationRouter);

export { apiRouter };
