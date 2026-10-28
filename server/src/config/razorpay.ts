import { AppError } from "../utils/AppError";

export type RazorpayMode = "test" | "live";

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
}

function configurationError(message: string): AppError {
  return new AppError(message, 503, "RAZORPAY_CONFIGURATION_INVALID");
}

export function getRazorpayMode(
  env: NodeJS.ProcessEnv = process.env,
): RazorpayMode {
  const configured = env.RAZORPAY_MODE;
  if (configured === undefined) {
    if (env.NODE_ENV === "production") {
      throw configurationError(
        "RAZORPAY_MODE must be explicitly set in production.",
      );
    }
    return "test";
  }

  const mode = configured.trim().toLowerCase();
  if (mode !== "test" && mode !== "live") {
    throw configurationError("RAZORPAY_MODE must be either test or live.");
  }
  if (mode === "live" && env.NODE_ENV !== "production") {
    throw configurationError(
      "Live Razorpay mode is available only when NODE_ENV is production.",
    );
  }
  return mode;
}

export function getRazorpayCredentials(
  env: NodeJS.ProcessEnv = process.env,
): RazorpayCredentials {
  const mode = getRazorpayMode(env);
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();

  if (!keyId || !keySecret) {
    throw configurationError(
      "Razorpay API credentials are not configured (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET).",
    );
  }

  const expectedPrefix = mode === "test" ? "rzp_test_" : "rzp_live_";
  if (
    !keyId.startsWith(expectedPrefix) ||
    keyId.length === expectedPrefix.length
  ) {
    throw configurationError(
      `RAZORPAY_KEY_ID does not match the configured ${mode} mode.`,
    );
  }

  return { keyId, keySecret };
}

export function getRazorpayWebhookSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const mode = getRazorpayMode(env);
  const variable =
    mode === "test"
      ? "RAZORPAY_TEST_WEBHOOK_SECRET"
      : "RAZORPAY_LIVE_WEBHOOK_SECRET";
  const secret = env[variable]?.trim();
  if (!secret) {
    throw new AppError(
      `Razorpay ${mode} webhook secret is not configured (${variable}).`,
      503,
      "WEBHOOK_NOT_CONFIGURED",
    );
  }
  return secret;
}
