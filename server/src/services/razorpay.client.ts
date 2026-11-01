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

function unknownProviderOutcome(message: string, statusCode = 502): AppError {
  return new AppError(
    message,
    statusCode,
    "RAZORPAY_OUTCOME_UNKNOWN",
  );
}

export function isDefinitivePaymentLinkCreationFailure(
  error: unknown,
): error is AppError {
  return (
    error instanceof AppError &&
    (
      error.code === "RAZORPAY_ERROR" ||
      error.code === "RAZORPAY_CONFIGURATION_INVALID" ||
      error.code === "INVALID_REFERENCE_ID" ||
      error.code === "INVALID_PAYMENT_AMOUNT"
    )
  );
}

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
    let response: Response;
    try {
      response = await fetch(
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
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw unknownProviderOutcome(
          "Razorpay payment link request timed out; its outcome is unknown.",
          504,
        );
      }

      throw unknownProviderOutcome(
        "Payment provider response could not be confirmed; recovery is required.",
      );
    }

    let bodyText: string;
    try {
      bodyText = await response.text();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw unknownProviderOutcome(
          "Razorpay payment link request timed out; its outcome is unknown.",
          504,
        );
      }
      throw unknownProviderOutcome(
        "Payment provider response could not be read; recovery is required.",
      );
    }

    if (!response.ok) {
      let razorpayCode: string | undefined;
      let razorpayField: string | undefined;

      try {
        const parsed: unknown = JSON.parse(bodyText);
        const errorObject =
          typeof parsed === "object" &&
          parsed !== null &&
          "error" in parsed
            ? parsed.error
            : undefined;
        if (
          typeof errorObject === "object" &&
          errorObject !== null &&
          "code" in errorObject &&
          typeof errorObject.code === "string"
        ) {
          razorpayCode = errorObject.code;
        }
        if (
          typeof errorObject === "object" &&
          errorObject !== null &&
          "field" in errorObject &&
          typeof errorObject.field === "string"
        ) {
          razorpayField = errorObject.field;
        }
      } catch {
        razorpayCode = undefined;
        razorpayField = undefined;
      }

      logger.error("Razorpay Payment Link request failed", {
        status: response.status,
        referenceId,
        razorpayCode,
        razorpayField,
      });

      const validatedRequestFields = [
        "amount",
        "currency",
        "description",
        "callback_url",
        "callback_method",
      ];
      if (
        response.status === 400 &&
        razorpayCode === "BAD_REQUEST_ERROR" &&
        razorpayField !== undefined &&
        validatedRequestFields.includes(razorpayField)
      ) {
        throw new AppError(
          "Payment provider rejected the payment link request.",
          502,
          "RAZORPAY_ERROR"
        );
      }

      throw unknownProviderOutcome(
        "Payment provider response did not confirm whether the payment link was created; recovery is required.",
      );
    }

    if (response.status !== 200 && response.status !== 201) {
      throw unknownProviderOutcome(
        "Payment provider returned a non-final response; recovery is required.",
      );
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(bodyText);
    } catch {
      throw unknownProviderOutcome(
        "Razorpay returned an unreadable payment link response; recovery is required.",
      );
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw unknownProviderOutcome(
        "Razorpay returned an unexpected payment link response; recovery is required.",
      );
    }
    if (
      !("id" in parsed) ||
      typeof parsed.id !== "string" ||
      parsed.id.length === 0 ||
      !("short_url" in parsed) ||
      typeof parsed.short_url !== "string" ||
      parsed.short_url.length === 0 ||
      !("status" in parsed) ||
      typeof parsed.status !== "string" ||
      parsed.status.length === 0
    ) {
      throw unknownProviderOutcome(
        "Razorpay returned an incomplete payment link response; recovery is required.",
      );
    }

    return {
      id: parsed.id,
      short_url: parsed.short_url,
      status: parsed.status,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw unknownProviderOutcome(
        "Razorpay payment link request timed out; its outcome is unknown.",
        504,
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

function parsePaymentLinkDetail(value: unknown): RazorpayPaymentLinkDetail {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    !("short_url" in value) ||
    typeof value.short_url !== "string" ||
    value.short_url.length === 0 ||
    !("status" in value) ||
    typeof value.status !== "string" ||
    value.status.length === 0 ||
    ("reference_id" in value &&
      value.reference_id !== undefined &&
      typeof value.reference_id !== "string")
  ) {
    throw new AppError(
      "Payment provider lookup response was incomplete.",
      502,
      "RAZORPAY_ERROR",
    );
  }

  return {
    id: value.id,
    short_url: value.short_url,
    status: value.status,
    ...("reference_id" in value &&
    typeof value.reference_id === "string"
      ? { reference_id: value.reference_id }
      : {}),
  };
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

    let parsed: unknown;

    try {
      parsed = JSON.parse(bodyText);
    } catch {
      throw new AppError(
        "Razorpay returned an unparseable payment link detail.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    return parsePaymentLinkDetail(parsed);
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

    let parsed: unknown;

    try {
      parsed = JSON.parse(bodyText);
    } catch {
      throw new AppError(
        "Razorpay returned an unparseable payment link list.",
        502,
        "RAZORPAY_ERROR"
      );
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      !("payment_links" in parsed) ||
      !Array.isArray(parsed.payment_links)
    ) {
      throw new AppError(
        "Payment provider lookup response was incomplete.",
        502,
        "RAZORPAY_ERROR",
      );
    }

    const links = parsed.payment_links;
    if (links.length === 0) {
      return null;
    }
    if (links.length !== 1) {
      throw new AppError(
        "Payment provider lookup returned an ambiguous result.",
        502,
        "RAZORPAY_ERROR",
      );
    }

    const link = parsePaymentLinkDetail(links[0]);
    if (link.reference_id !== referenceId) {
      throw new AppError(
        "Payment provider lookup did not match the requested reference.",
        502,
        "RAZORPAY_ERROR",
      );
    }

    return link;
  } finally {
    clearTimeout(timeout);
  }
}
