import { Router } from "express";
import { runSafetySimulation } from "../controllers/simulation.controller";
const simulationRouter = Router();
simulationRouter.post("/run", runSafetySimulation);
export { simulationRouter };
