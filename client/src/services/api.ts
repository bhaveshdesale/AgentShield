import {
  ORDER_STATUSES,
  type Action,
  type AgentChatResponse,
  type AuditLogEntry,
  type DashboardStats,
  type OrderStatus,
  type PaymentHistoryItem,
  type PaymentResult,
  type PaymentStatus,
  type PolicyEvaluationResult,
  type Product,
} from "../types";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "/api";
let csrfToken: string | undefined;

export interface AuthUser {
  id: string;
  email: string;
  role: "admin" | "approver" | "viewer";
}

export function setCsrfToken(token?: string) {
  csrfToken = token;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return ORDER_STATUSES.some((status) => status === value);
}

function isProduct(value: unknown): value is Product {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.description) &&
    isFiniteNumber(value.priceInPaise) &&
    value.currency === "INR" &&
    isString(value.category) &&
    isStringArray(value.tags) &&
    isFiniteNumber(value.inventory) &&
    isStringArray(value.frequentlyBoughtWith)
  );
}

function isPaymentItem(value: unknown): value is PaymentHistoryItem["items"][number] {
  return (
    isRecord(value) &&
    isString(value.productId) &&
    isString(value.productName) &&
    isFiniteNumber(value.quantity) &&
    isFiniteNumber(value.unitPriceInPaise)
  );
}

function isPaymentHistoryItem(value: unknown): value is PaymentHistoryItem {
  return (
    isRecord(value) &&
    isString(value.orderId) &&
    isString(value.referenceId) &&
    isFiniteNumber(value.amountInPaise) &&
    value.currency === "INR" &&
    isOrderStatus(value.status) &&
    Array.isArray(value.items) &&
    value.items.every(isPaymentItem) &&
    isString(value.createdAt) &&
    isString(value.updatedAt) &&
    (value.paymentLinkId === undefined || isString(value.paymentLinkId)) &&
    (value.paymentLink === undefined || isString(value.paymentLink))
  );
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return (
    isRecord(value) &&
    isString(value.orderId) &&
    isOrderStatus(value.status) &&
    isFiniteNumber(value.amountInPaise) &&
    isString(value.referenceId) &&
    (value.currency === undefined || value.currency === "INR") &&
    (value.items === undefined ||
      (Array.isArray(value.items) && value.items.every(isPaymentItem))) &&
    (value.paymentLinkId === undefined || isString(value.paymentLinkId)) &&
    (value.paymentLink === undefined || isString(value.paymentLink)) &&
    (value.razorpayPaymentId === undefined || isString(value.razorpayPaymentId)) &&
    (value.razorpayStatus === undefined || isString(value.razorpayStatus)) &&
    (value.createdAt === undefined || isString(value.createdAt)) &&
    (value.updatedAt === undefined || isString(value.updatedAt))
  );
}

export async function apiLogin(email: string, password: string) {
  const result = await request<{ user: AuthUser; csrfToken: string; expiresAt: string }>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
  );
  setCsrfToken(result.csrfToken);
  return result;
}

export async function apiGetSession() {
  const result = await request<{ user: AuthUser; csrfToken: string }>("/auth/session");
  setCsrfToken(result.csrfToken);
  return result;
}

export async function apiLogout() {
  try {
    await request<void>("/auth/logout", { method: "POST" });
  } finally {
    setCsrfToken(undefined);
  }
}

/**
 * Generic API request helper.
 */
async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.method && !["GET", "HEAD", "OPTIONS"].includes(init.method.toUpperCase()) &&
        !path.startsWith("/auth/login") && csrfToken
          ? { "X-CSRF-Token": csrfToken }
          : {}),
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new Error(
      "Unable to connect to AgentShield API.",
    );
  }

  const body = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/")) {
      setCsrfToken(undefined);
      window.dispatchEvent(new Event("agentshield:session-expired"));
    }
    const message =
      body?.message || "Request failed.";

    const error = Object.assign(
      new Error(message),
      {
        code: body?.code,
        statusCode: response.status,
      },
    );

    throw error;
  }

  return body as T;
}

async function requestValidated<T>(
  path: string,
  validate: (value: unknown) => value is T,
): Promise<T> {
  const body = await request<unknown>(path);
  if (!validate(body)) {
    throw new Error("Invalid response from AgentShield API.");
  }
  return body;
}

/**
 * Health
 */
export const apiHealth = () =>
  request<{
    status: string;
    mongodb: string;
    uptimeSeconds: number;
  }>("/health");

/**
 * Products
 */
export const apiProducts = async (): Promise<Product[]> => {
  const response = await requestValidated(
    "/products",
    (value): value is { products: Product[] } =>
      isRecord(value) &&
      Array.isArray(value.products) &&
      value.products.every(isProduct),
  );
  return response.products;
};

/**
 * Agent chat
 */
export const apiAgentChat = (
  message: string,
  conversationId?: string,
) =>
  request<AgentChatResponse>(
    "/agent/chat",
    {
      method: "POST",
      body: JSON.stringify({
        message,
        ...(conversationId
          ? { conversationId }
          : {}),
      }),
    },
  );

/**
 * Validate an agent action proposal.
 */
export const apiValidateAction = (
  proposal: Action["proposal"] & {
    conversationId?: string;
  },
) =>
  request<
    { actionId: string } &
      PolicyEvaluationResult
  >(
    "/actions/validate",
    {
      method: "POST",
      body: JSON.stringify(proposal),
    },
  );

/**
 * Explicit human approval.
 */
export const apiApproveAction = (
  actionId: string,
) =>
  request<{
    success: true;
    actionId: string;
    approvalStatus?: string;
  }>(
    "/actions/approve",
    {
      method: "POST",
      body: JSON.stringify({
        actionId,
      }),
    },
  );

/**
 * Create Razorpay TEST-MODE payment
 * for an already approved action.
 */
export const apiCreatePayment = (
  actionId: string,
) =>
  request<PaymentResult>(
    "/payments/create",
    {
      method: "POST",
      body: JSON.stringify({
        actionId,
      }),
    },
  );

/**
 * Get all persisted payment/order history.
 */
export const apiPaymentHistory = () =>
  requestValidated(
    "/payments",
    (value): value is PaymentHistoryItem[] =>
      Array.isArray(value) && value.every(isPaymentHistoryItem),
  );

/**
 * Get current status of a specific order.
 */
export const apiPaymentStatus = (
  orderId: string,
) =>
  requestValidated(
    `/payments/${encodeURIComponent(
      orderId,
    )}/status`,
    isPaymentStatus,
  );

/**
 * Dashboard statistics.
 */
export const apiDashboard = () =>
  request<DashboardStats>(
    "/dashboard/stats",
  );

/**
 * Audit log.
 *
 * Backend response:
 * {
 *   logs: AuditLogEntry[]
 * }
 *
 * Unwrap it here so every component receives
 * a predictable AuditLogEntry[].
 */
export const apiAudit = async (
  limit = 50,
): Promise<AuditLogEntry[]> => {
  const response = await request<{
    logs: AuditLogEntry[];
  }>(`/audit?limit=${limit}`);

  return Array.isArray(response.logs)
    ? response.logs
    : [];
};

/**
 * Safety simulation.
 */
export const apiSimulation = (
  scenarioId: number,
) =>
  request<{
    scenario: {
      id: number;
      name: string;
    };
    expected: string;
    result: unknown;
  }>(
    "/simulation/run",
    {
      method: "POST",
      body: JSON.stringify({
        scenarioId,
      }),
    },
  );