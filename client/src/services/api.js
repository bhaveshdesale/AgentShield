const API_BASE = "/api";
async function handleResponse(response) {
    if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({
            status: "error",
            code: "UNKNOWN_ERROR",
            message: "An unexpected error occurred.",
        })));
        const error = new Error(errorBody.message);
        error.code = errorBody.code;
        error.statusCode = response.status;
        throw error;
    }
    return (await response.json());
}
export async function apiHealth() {
    return handleResponse(await fetch(`${API_BASE}/health`));
}
export async function apiAgentChat(message, conversationId) {
    const body = { message };
    if (conversationId) {
        body.conversationId = conversationId;
    }
    return handleResponse(await fetch(`${API_BASE}/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    }));
}
export async function apiValidateAction(proposal) {
    return handleResponse(await fetch(`${API_BASE}/actions/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proposal),
    }));
}
export async function apiApproveAction(actionId) {
    return handleResponse(await fetch(`${API_BASE}/actions/${actionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    }));
}
export async function apiReconcilePayment(orderId) {
    return handleResponse(await fetch(`${API_BASE}/payments/${orderId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    }));
}
export async function apiGetOrders() {
    return handleResponse(await fetch(`${API_BASE}/orders`));
}
export async function apiGetOrderById(id) {
    return handleResponse(await fetch(`${API_BASE}/orders/${id}`));
}
export async function apiGetProducts() {
    return handleResponse(await fetch(`${API_BASE}/products`));
}
export async function apiGetMerchant() {
    return handleResponse(await fetch(`${API_BASE}/merchants`));
}
export async function apiGetActions() {
    return handleResponse(await fetch(`${API_BASE}/actions`));
}
export async function apiGetActionById(id) {
    return handleResponse(await fetch(`${API_BASE}/actions/${id}`));
}
export async function apiGetAuditLogs(limit) {
    const params = new URLSearchParams();
    if (limit) {
        params.set("limit", String(limit));
    }
    const query = params.toString();
    return handleResponse(await fetch(`${API_BASE}/audit-logs${query ? `?${query}` : ""}`));
}
