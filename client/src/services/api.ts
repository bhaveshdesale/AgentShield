// import type {
//   Action,
//   AgentChatResponse,
//   AuditLogEntry,
//   DashboardStats,
//   PaymentHistoryItem,
//   PaymentResult,
//   PaymentStatus,
//   PolicyEvaluationResult,
//   Product,
// } from "../types";

// const API_BASE =
//   import.meta.env.VITE_API_BASE_URL || "/api";

// /**
//  * Generic API request helper.
//  */
// async function request<T>(
//   path: string,
//   init?: RequestInit,
// ): Promise<T> {
//   let response: Response;

//   try {
//     response = await fetch(`${API_BASE}${path}`, {
//       ...init,
//       headers: {
//         "Content-Type": "application/json",
//         ...(init?.headers || {}),
//       },
//     });
//   } catch {
//     throw new Error(
//       "Unable to connect to AgentShield API.",
//     );
//   }

//   const body = await response
//     .json()
//     .catch(() => null);

//   if (!response.ok) {
//     const message =
//       body?.message || "Request failed.";

//     const error = Object.assign(
//       new Error(message),
//       {
//         code: body?.code,
//         statusCode: response.status,
//       },
//     );

//     throw error;
//   }

//   return body as T;
// }

// /**
//  * Health
//  */
// export const apiHealth = () =>
//   request<{
//     status: string;
//     mongodb: string;
//     uptimeSeconds: number;
//   }>("/health");

// /**
//  * Products
//  */
// export const apiProducts = () =>
//   request<Product[]>("/products");

// /**
//  * Agent chat
//  */
// export const apiAgentChat = (
//   message: string,
//   conversationId?: string,
// ) =>
//   request<AgentChatResponse>(
//     "/agent/chat",
//     {
//       method: "POST",
//       body: JSON.stringify({
//         message,
//         ...(conversationId
//           ? { conversationId }
//           : {}),
//       }),
//     },
//   );

// /**
//  * Validate an agent action proposal.
//  */
// export const apiValidateAction = (
//   proposal: Action["proposal"] & {
//     conversationId?: string;
//   },
// ) =>
//   request<
//     { actionId: string } &
//       PolicyEvaluationResult
//   >(
//     "/actions/validate",
//     {
//       method: "POST",
//       body: JSON.stringify(proposal),
//     },
//   );

// /**
//  * Explicit human approval.
//  */
// export const apiApproveAction = (
//   actionId: string,
// ) =>
//   request<{
//     success: true;
//     actionId: string;
//     approvalStatus?: string;
//   }>(
//     "/actions/approve",
//     {
//       method: "POST",
//       body: JSON.stringify({
//         actionId,
//       }),
//     },
//   );

// /**
//  * Create Razorpay TEST-MODE payment
//  * for an already approved action.
//  */
// export const apiCreatePayment = (
//   actionId: string,
// ) =>
//   request<PaymentResult>(
//     "/payments/create",
//     {
//       method: "POST",
//       body: JSON.stringify({
//         actionId,
//       }),
//     },
//   );

// /**
//  * Get all persisted payment/order history.
//  *
//  * GET /api/payments
//  */
// export const apiPaymentHistory = () =>
//   request<PaymentHistoryItem[]>(
//     "/payments",
//   );

// /**
//  * Get current status of a specific order.
//  *
//  * GET /api/payments/:orderId/status
//  */
// export const apiPaymentStatus = (
//   orderId: string,
// ) =>
//   request<PaymentStatus>(
//     `/payments/${encodeURIComponent(
//       orderId,
//     )}/status`,
//   );

// /**
//  * Dashboard statistics.
//  */
// export const apiDashboard = () =>
//   request<DashboardStats>(
//     "/dashboard/stats",
//   );

// /**
//  * Audit log.
//  */
// export const apiAudit = (
//   limit = 50,
// ) =>
//   request<AuditLogEntry[]>(
//     `/audit?limit=${limit}`,
//   );

// /**
//  * Safety simulation.
//  */
// export const apiSimulation = (
//   scenarioId: number,
// ) =>
//   request<{
//     scenario: {
//       id: number;
//       name: string;
//     };
//     expected: string;
//     result: unknown;
//   }>(
//     "/simulation/run",
//     {
//       method: "POST",
//       body: JSON.stringify({
//         scenarioId,
//       }),
//     },
//   );

import type {
  Action,
  AgentChatResponse,
  AuditLogEntry,
  DashboardStats,
  PaymentHistoryItem,
  PaymentResult,
  PaymentStatus,
  PolicyEvaluationResult,
  Product,
} from "../types";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "/api";

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
      headers: {
        "Content-Type": "application/json",
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
export const apiProducts = () =>
  request<Product[]>("/products");

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
  request<PaymentHistoryItem[]>(
    "/payments",
  );

/**
 * Get current status of a specific order.
 */
export const apiPaymentStatus = (
  orderId: string,
) =>
  request<PaymentStatus>(
    `/payments/${encodeURIComponent(
      orderId,
    )}/status`,
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