import { Router } from "express";
import { validateAction } from "../controllers/action.controller";

const actionRouter = Router();

actionRouter.post("/validate", validateAction);

export { actionRouter };