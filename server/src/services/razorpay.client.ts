import { AppError } from "../utils/AppError";
import { getRazorpayCredentials } from "../config/razorpay";
import type { RazorpayCredentials } from "../config/razorpay";
import { logger } from "../utils/logger";
/**
 * Razorpay Payment Link HTTP client.
 *
 * Core principle:
 * AI can propose. AgentShield authorizes. Razorpay executes.
 *
 * - The AI never calls Razorpay.
 * - Amounts are always recomputed server-side from MongoDB.
 * - Client input can never supply amounts, Razorpay IDs or approval state.
 */

export interface RazorpayPaymentLink {
  id: string;
  short_url: string;
  status: string;
}

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

const RAZORPAY_TIMEOUT_MS = 20_000;

/**
 * Creates a Razorpay Payment Link in the validated configured mode.
 */
export async function createRazorpayPaymentLink(options: {
  amountInPaise: number;
  referenceId: string;
  description: string;
  callbackUrl?: string;
}): Promise<RazorpayPaymentLink> {
  const credentials = getRazorpayCredentials();

  const referenceId = options.referenceId.trim();

  if (referenceId.length === 0) {
    throw new AppError(
      "Payment reference ID cannot be empty.",
      400,
      "INVALID_REFERENCE_ID"
    );
  }

  if (referenceId.length > 40) {
    throw new AppError(
      "Payment reference ID must be 40 characters or fewer.",
      400,
      "INVALID_REFERENCE_ID"
    );
  }

  if (
    !Number.isInteger(options.amountInPaise) ||
    options.amountInPaise < 100
  ) {
    throw new AppError(
      "Payment amount must be an integer of at least 100 paise.",
      400,
      "INVALID_PAYMENT_AMOUNT"
    );
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    RAZORPAY_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${RAZORPAY_API_BASE}/payment_links`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${credentials.keyId}:${credentials.keySecret}`
          ).toString("base64")}`,
        },
        body: JSON.stringify({
          amount: options.amountInPaise,
          currency: "INR",
          accept_partial: false,
          reference_id: referenceId,
          description: options.description,

          ...(options.callbackUrl
            ? {
                callback_url: options.callbackUrl,
                callback_method: "get",
              }
            : {}),
        }),
        signal: controller.signal,
      }
    );

    const bodyText = await response.text().catch(() => "");

    if (!response.ok) {
      let razorpayCode: string | undefined;

      try {
        const parsed = JSON.parse(bodyText) as {
          error?: {
            code?: string;
          };
        };

        if (parsed.error?.code) {
          razorpayCode = parsed.error.code;
        }
      } catch {
        // The provider response body is not exposed to the caller.
      }

      logger.error("Razorpay Payment Link request failed", {
        status: response.status,
        referenceId,
        razorpayCode,
      });

      throw new AppError(
        "Payment provider rejected the payment link request.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    let link: RazorpayPaymentLink;

    try {
      link = JSON.parse(bodyText) as RazorpayPaymentLink;
    } catch {
      throw new AppError(
        "Razorpay returned an unparseable payment link response.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    if (
      typeof link.id !== "string" ||
      link.id.length === 0 ||
      typeof link.short_url !== "string" ||
      link.short_url.length === 0
    ) {
      throw new AppError(
        "Razorpay returned an unexpected payment link response.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    return link;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new AppError(
        "Razorpay payment link request timed out.",
        504,
        "RAZORPAY_TIMEOUT"
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Razorpay Payment Link lookup result.
 */
export interface RazorpayPaymentLinkDetail {
  id: string;
  short_url: string;
  status: string;
  reference_id?: string;
}

/**
 * Looks up a Razorpay Payment Link either
 * by ID or reference ID.
 */
export async function lookupRazorpayPaymentLink(
  options: {
    paymentLinkId?: string;
    referenceId?: string;
  }
): Promise<RazorpayPaymentLinkDetail | null> {
  const credentials = getRazorpayCredentials();

  if (
    options.paymentLinkId &&
    options.paymentLinkId.trim().length > 0
  ) {
    return lookupPaymentLinkById(
      options.paymentLinkId,
      credentials
    );
  }

  if (
    options.referenceId &&
    options.referenceId.trim().length > 0
  ) {
    return lookupPaymentLinkByReference(
      options.referenceId,
      credentials
    );
  }

  return null;
}

/**
 * Razorpay lookup by Payment Link ID.
 */
async function lookupPaymentLinkById(
  id: string,
  credentials: RazorpayCredentials
): Promise<RazorpayPaymentLinkDetail | null> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    RAZORPAY_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${RAZORPAY_API_BASE}/payment_links/${encodeURIComponent(
        id
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${credentials.keyId}:${credentials.keySecret}`
          ).toString("base64")}`,
        },
        signal: controller.signal,
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      await response.text().catch(() => "");

      throw new AppError(
        "Payment provider lookup failed.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    const bodyText =
      await response.text().catch(
        () => ""
      );

    let link:
      | RazorpayPaymentLinkDetail;

    try {
      link =
        JSON.parse(
          bodyText
        ) as RazorpayPaymentLinkDetail;
    } catch {
      throw new AppError(
        "Razorpay returned an unparseable payment link detail.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    if (
      typeof link.id !== "string" ||
      link.id.length === 0
    ) {
      throw new AppError(
        "Razorpay returned an unexpected payment link detail.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    return link;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Razorpay lookup by reference ID.
 */
async function lookupPaymentLinkByReference(
  referenceId: string,
  credentials: RazorpayCredentials
): Promise<RazorpayPaymentLinkDetail | null> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    RAZORPAY_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${RAZORPAY_API_BASE}/payment_links?reference_id=${encodeURIComponent(
        referenceId
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${credentials.keyId}:${credentials.keySecret}`
          ).toString("base64")}`,
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      await response.text().catch(() => "");

      throw new AppError(
        "Payment provider lookup failed.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    const bodyText =
      await response.text().catch(
        () => ""
      );

    let parsed: {
      payment_links?: RazorpayPaymentLinkDetail[];
    };

    try {
      parsed =
        JSON.parse(bodyText) as {
          payment_links?: RazorpayPaymentLinkDetail[];
        };
    } catch {
      throw new AppError(
        "Razorpay returned an unparseable payment link list.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    const links =
      parsed.payment_links ?? [];

    return links.length > 0
      ? links[0]
      : null;
  } finally {
    clearTimeout(timeout);
  }
}
