import { Router } from "express";
import { approveAction, validateAction } from "../controllers/action.controller";

const actionRouter = Router();

actionRouter.post("/validate", validateAction);
actionRouter.post("/:actionId/approve", approveAction);

export { actionRouter };
