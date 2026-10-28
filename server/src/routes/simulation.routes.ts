import { Router } from "express";
import { runSafetySimulation } from "../controllers/simulation.controller";
import { requireRoles } from "../middleware/authentication";
const simulationRouter = Router();
simulationRouter.post("/run", requireRoles("admin", "approver"), runSafetySimulation);
export { simulationRouter };
