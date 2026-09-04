const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
/**
 * Generic API request helper.
 */
async function request(path, init) {
    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                ...(init?.headers || {}),
            },
        });
    }
    catch {
        throw new Error("Unable to connect to AgentShield API.");
    }
    const body = await response
        .json()
        .catch(() => null);
    if (!response.ok) {
        const message = body?.message || "Request failed.";
        const error = Object.assign(new Error(message), {
            code: body?.code,
            statusCode: response.status,
        });
        throw error;
    }
    return body;
}
/**
 * Health
 */
export const apiHealth = () => request("/health");
/**
 * Products
 */
export const apiProducts = () => request("/products");
/**
 * Agent chat
 */
export const apiAgentChat = (message, conversationId) => request("/agent/chat", {
    method: "POST",
    body: JSON.stringify({
        message,
        ...(conversationId
            ? { conversationId }
            : {}),
    }),
});
/**
 * Validate an agent action proposal.
 */
export const apiValidateAction = (proposal) => request("/actions/validate", {
    method: "POST",
    body: JSON.stringify(proposal),
});
/**
 * Explicit human approval.
 */
export const apiApproveAction = (actionId) => request("/actions/approve", {
    method: "POST",
    body: JSON.stringify({
        actionId,
    }),
});
/**
 * Create Razorpay TEST-MODE payment
 * for an already approved action.
 */
export const apiCreatePayment = (actionId) => request("/payments/create", {
    method: "POST",
    body: JSON.stringify({
        actionId,
    }),
});
/**
 * Get all persisted payment/order history.
 *
 * GET /api/payments
 */
export const apiPaymentHistory = () => request("/payments");
/**
 * Get current status of a specific order.
 *
 * GET /api/payments/:orderId/status
 */
export const apiPaymentStatus = (orderId) => request(`/payments/${encodeURIComponent(orderId)}/status`);
/**
 * Dashboard statistics.
 */
export const apiDashboard = () => request("/dashboard/stats");
/**
 * Audit log.
 */
export const apiAudit = (limit = 50) => request(`/audit?limit=${limit}`);
/**
 * Safety simulation.
 */
export const apiSimulation = (scenarioId) => request("/simulation/run", {
    method: "POST",
    body: JSON.stringify({
        scenarioId,
    }),
});
