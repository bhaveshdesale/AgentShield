import path from "path";
import dotenv from "dotenv";
import type { Env } from "../types/env";
import { getRazorpayMode } from "./razorpay";

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

  const normalized = raw.trim();
  if (!/^\+?\d+$/.test(normalized)) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const port = Number(normalized);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

export function getLlmTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const configured = env.LLM_TIMEOUT_MS?.trim();
  if (configured === undefined || configured === "") {
    return 30_000;
  }
  if (!/^\+?\d+$/.test(configured)) {
    throw new Error("LLM_TIMEOUT_MS must be an integer between 1 and 2147483647");
  }

  const timeoutMs = Number(configured);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw new Error("LLM_TIMEOUT_MS must be an integer between 1 and 2147483647");
  }
  return timeoutMs;
}

export function getClientUrl(): string {
  const configured = readOptional("CLIENT_URL") ?? readOptional("FRONTEND_URL") ?? "http://localhost:5173";
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("CLIENT_URL must be a valid absolute URL");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error("CLIENT_URL must contain only an HTTP(S) origin");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("CLIENT_URL must use HTTPS in production");
  }
  return url.origin;
}

export function getPaymentCallbackUrl(orderId: string): string {
  return `${getClientUrl()}/payments/${orderId}`;
}

export function getTrustedProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const configured = env.TRUST_PROXY_HOPS?.trim();
  if (configured === undefined || configured === "") {
    return 0;
  }
  if (!/^(0|[1-9]\d*)$/.test(configured)) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10");
  }

  const hops = Number(configured);
  if (hops > 10) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10");
  }
  return hops;
}

export function loadEnv(): Env {
  return {
    PORT: parsePort(process.env.PORT),
    MONGODB_URI: requireEnv("MONGODB_URI"),
    CLIENT_URL: getClientUrl(),
    LLM_API_KEY: readOptional("LLM_API_KEY"),
    LLM_BASE_URL: readOptional("LLM_BASE_URL"),
    LLM_MODEL: readOptional("LLM_MODEL"),
    LLM_TIMEOUT_MS: getLlmTimeoutMs(),
    RAZORPAY_MODE: getRazorpayMode(),
  };
}
