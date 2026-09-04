import { Router } from "express";
import { getDashboard } from "../controllers/dashboard.controller";
const dashboardRouter = Router();
dashboardRouter.get("/stats", getDashboard);
export { dashboardRouter };
