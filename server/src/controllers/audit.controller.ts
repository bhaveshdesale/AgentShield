import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { listAuditLogs } from "../services/audit.service";
import { AppError } from "../utils/AppError";

export async function getAudit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawLimit = req.query.limit;
    const limit = rawLimit === undefined ? undefined : Number(rawLimit);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new AppError("limit must be a positive integer.", 400, "INVALID_LIMIT");
    }
    const actionId = typeof req.query.actionId === "string" ? req.query.actionId : undefined;
    if (actionId !== undefined && !Types.ObjectId.isValid(actionId)) {
      throw new AppError("Invalid actionId.", 400, "INVALID_ACTION_ID");
    }
    const logs = await listAuditLogs({ ...(actionId ? { actionId } : {}), ...(limit ? { limit } : {}) });
    res.status(200).json({ logs });
  } catch (error) {
    next(error);
  }
}
