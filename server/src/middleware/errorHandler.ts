import type { NextFunction, Request, Response } from "express";
import type { ApiErrorBody } from "../types/http";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    const body: ApiErrorBody = {
      status: "error",
      code: err.code,
      message: err.message,
    };

    logger.warn("Request failed", {
      requestId: req.requestId ?? "unknown",
      code: err.code,
      status: err.statusCode,
      method: req.method,
      path: req.path,
    });

    res.status(err.statusCode).json(body);
    return;
  }

  logger.error("Unhandled request error", {
    requestId: req.requestId ?? "unknown",
    method: req.method,
    path: req.path,
    errorType: err instanceof Error ? err.name : "UnknownError",
  });

  const body: ApiErrorBody = {
    status: "error",
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred. The request was not completed.",
  };

  res.status(500).json(body);
}
