import type { Request, Response } from "express";
import { getMongoConnectionState } from "../config/db";
import type { HealthResponse } from "../types/http";

export function getHealth(_req: Request, res: Response): void {
  const mongodb = getMongoConnectionState();
  const body: HealthResponse = {
    status: mongodb === "connected" ? "ok" : "degraded",
    service: "agentshield",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    mongodb,
  };

  res.status(200).json(body);
}
