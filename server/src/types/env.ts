import type { RazorpayMode } from "../config/razorpay";

export interface Env {
  PORT: number;
  MONGODB_URI: string;
  CLIENT_URL: string;
  LLM_API_KEY: string | undefined;
  LLM_BASE_URL: string | undefined;
  LLM_MODEL: string | undefined;
  RAZORPAY_MODE: RazorpayMode;
}
