import { Router } from "express";
import { approveAction, validateAction } from "../controllers/action.controller";
import { requireRoles } from "../middleware/authentication";
const actionRouter = Router();
const requireApprover = requireRoles("admin", "approver");
actionRouter.post("/validate", requireApprover, validateAction);
actionRouter.post("/approve", requireApprover, approveAction);
export { actionRouter };
