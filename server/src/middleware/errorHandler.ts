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
      code: err.code,
      status: err.statusCode,
      method: req.method,
      path: req.originalUrl,
    });

    res.status(err.statusCode).json(body);
    return;
  }

  const message = err instanceof Error ? err.message : "Unexpected server error";

  logger.error("Unhandled request error", {
    method: req.method,
    path: req.originalUrl,
    error: message,
  });

  const body: ApiErrorBody = {
    status: "error",
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred. The request was not completed.",
  };

  res.status(500).json(body);
}
