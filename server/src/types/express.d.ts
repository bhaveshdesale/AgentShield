import type { AuthenticatedSession } from "./auth";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedSession;
      requestId?: string;
    }
  }
}

export {};
