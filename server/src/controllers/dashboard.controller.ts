import type { NextFunction, Request, Response } from "express";
import { getDashboardStats } from "../services/dashboard.service";

export async function getDashboard(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(await getDashboardStats());
  } catch (error) {
    next(error);
  }
}
