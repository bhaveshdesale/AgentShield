import path from "path";
import dotenv from "dotenv";
import type { Env } from "../types/env";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function readOptional(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  return value;
}

function requireEnv(name: string): string {
  const value = readOptional(name);
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return 5000;
  }

  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

export function loadEnv(): Env {
  return {
    PORT: parsePort(process.env.PORT),
    MONGODB_URI: requireEnv("MONGODB_URI"),
    LLM_API_KEY: readOptional("LLM_API_KEY"),
    RAZORPAY_KEY_ID: readOptional("RAZORPAY_KEY_ID"),
    RAZORPAY_KEY_SECRET: readOptional("RAZORPAY_KEY_SECRET"),
    RAZORPAY_WEBHOOK_SECRET: readOptional("RAZORPAY_WEBHOOK_SECRET"),
  };
}
