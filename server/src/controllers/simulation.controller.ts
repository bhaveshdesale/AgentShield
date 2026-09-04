import type { NextFunction, Request, Response } from "express";

import { runSimulation } from "../services/simulation.service";
import { AppError } from "../utils/AppError";

export async function runSafetySimulation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const scenarioId =
      typeof req.body?.scenarioId === "number"
        ? req.body.scenarioId
        : Number(req.body?.scenarioId);

    if (!Number.isInteger(scenarioId)) {
      throw new AppError(
        "scenarioId must be an integer.",
        400,
        "INVALID_SCENARIO",
      );
    }

    const result = await runSimulation(scenarioId);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}