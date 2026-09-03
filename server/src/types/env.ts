export interface Env {
  PORT: number;
  MONGODB_URI: string;
  LLM_API_KEY: string | undefined;
  RAZORPAY_KEY_ID: string | undefined;
  RAZORPAY_KEY_SECRET: string | undefined;
  RAZORPAY_WEBHOOK_SECRET: string | undefined;
}
