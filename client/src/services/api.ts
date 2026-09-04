import type {
  Action,
  AgentChatResponse,
  ApproveActionResponse,
  AuditLogEntry,
  CreateActionResponse,
  Merchant,
  Order,
  Product,
  ReconcileResponse,
} from "../types";

const API_BASE = "/api";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({
      status: "error",
      code: "UNKNOWN_ERROR",
      message: "An unexpected error occurred.",
    }))) as { status: string; code: string; message: string };
    const error = new Error(errorBody.message) as Error & { code: string; statusCode: number };
    error.code = errorBody.code;
    error.statusCode = response.status;
    throw error;
  }
  return (await response.json()) as T;
}

export async function apiHealth(): Promise<{ status: string; service: string; timestamp: string; uptimeSeconds: number; mongodb: string }> {
  return handleResponse<{ status: string; service: string; timestamp: string; uptimeSeconds: number; mongodb: string }>(
    await fetch(`${API_BASE}/health`)
  );
}

export async function apiAgentChat(message: string, conversationId?: string): Promise<AgentChatResponse> {
  const body: { message: string; conversationId?: string } = { message };
  if (conversationId) {
    body.conversationId = conversationId;
  }
  return handleResponse<AgentChatResponse>(
    await fetch(`${API_BASE}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export async function apiValidateAction(proposal: {
  action: string;
  items: { productId: string; quantity: number }[];
  proposedAmountInPaise: number;
  reason: string;
  requiresApproval: boolean;
  referenceId: string;
  conversationId?: string;
  discountPercent?: number;
}): Promise<CreateActionResponse> {
  return handleResponse<CreateActionResponse>(
    await fetch(`${API_BASE}/actions/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proposal),
    })
  );
}

export async function apiApproveAction(actionId: string): Promise<ApproveActionResponse> {
  return handleResponse<ApproveActionResponse>(
    await fetch(`${API_BASE}/actions/${actionId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  );
}

export async function apiReconcilePayment(orderId: string): Promise<ReconcileResponse> {
  return handleResponse<ReconcileResponse>(
    await fetch(`${API_BASE}/payments/${orderId}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  );
}

export async function apiGetOrders(): Promise<Order[]> {
  return handleResponse<Order[]>(await fetch(`${API_BASE}/orders`));
}

export async function apiGetOrderById(id: string): Promise<Order> {
  return handleResponse<Order>(await fetch(`${API_BASE}/orders/${id}`));
}

export async function apiGetProducts(): Promise<Product[]> {
  return handleResponse<Product[]>(await fetch(`${API_BASE}/products`));
}

export async function apiGetMerchant(): Promise<Merchant> {
  return handleResponse<Merchant>(await fetch(`${API_BASE}/merchants`));
}

export async function apiGetActions(): Promise<Action[]> {
  return handleResponse<Action[]>(await fetch(`${API_BASE}/actions`));
}

export async function apiGetActionById(id: string): Promise<Action> {
  return handleResponse<Action>(await fetch(`${API_BASE}/actions/${id}`));
}

export async function apiGetAuditLogs(limit?: number): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams();
  if (limit) {
    params.set("limit", String(limit));
  }
  const query = params.toString();
  return handleResponse<AuditLogEntry[]>(await fetch(`${API_BASE}/audit-logs${query ? `?${query}` : ""}`));
}
