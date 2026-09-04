import { Router } from "express";
import { getAudit } from "../controllers/audit.controller";
const auditRouter = Router();
auditRouter.get("/", getAudit);
export { auditRouter };
