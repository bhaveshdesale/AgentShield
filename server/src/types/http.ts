export interface ApiErrorBody {
  status: "error";
  code: string;
  message: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  service: "agentshield";
  timestamp: string;
  uptimeSeconds: number;
  mongodb: "connected" | "disconnected" | "connecting" | "disconnecting";
}
