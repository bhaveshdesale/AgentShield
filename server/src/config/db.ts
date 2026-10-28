import mongoose from "mongoose";
import { AgentActionModel } from "../models/AgentAction";
import { AuditLogModel } from "../models/AuditLog";
import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { UserModel } from "../models/User";
import { UserSessionModel } from "../models/UserSession";
import { WebhookEventModel } from "../models/WebhookEvent";
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
    await Promise.all([
      AgentActionModel.init(),
      AuditLogModel.init(),
      MerchantModel.init(),
      OrderModel.init(),
      ProductModel.init(),
      UserModel.init(),
      UserSessionModel.init(),
      WebhookEventModel.init(),
    ]);
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
