import mongoose from "mongoose";
import { logger } from "../utils/logger";

const MONGO_STATES = ["disconnected", "connected", "connecting", "disconnecting"] as const;

export type MongoConnectionState = (typeof MONGO_STATES)[number];

export function getMongoConnectionState(): MongoConnectionState {
  const state = mongoose.connection.readyState;
  if (state === 0 || state === 1 || state === 2 || state === 3) {
    return MONGO_STATES[state];
  }
  return "disconnected";
}

export async function connectDatabase(uri: string): Promise<void> {
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(uri);
    logger.info("MongoDB connected");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown MongoDB error";
    logger.error("MongoDB connection failed. The HTTP server will not start.", {
      error: message,
    });
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
  logger.info("MongoDB disconnected");
}
