import { Router } from "express";
import { requireRoles } from "../middleware/authentication";
import { renderMetrics } from "../utils/metrics";

const metricsRouter = Router();

metricsRouter.get("/", requireRoles("admin"), (_request, response) => {
  response.type("text/plain; version=0.0.4; charset=utf-8").send(renderMetrics());
});

export { metricsRouter };
