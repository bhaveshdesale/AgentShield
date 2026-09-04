const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
async function request(path, init) {
    const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        const message = body?.message || "Request failed";
        const error = Object.assign(new Error(message), { code: body?.code, statusCode: res.status });
        throw error;
    }
    return body;
}
export const apiHealth = () => request("/health");
export const apiProducts = () => request("/products");
export const apiAgentChat = (message, conversationId) => request("/agent/chat", { method: "POST", body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) }) });
export const apiValidateAction = (proposal) => request("/actions/validate", { method: "POST", body: JSON.stringify(proposal) });
export const apiApproveAction = (actionId) => request("/actions/approve", { method: "POST", body: JSON.stringify({ actionId }) });
export const apiCreatePayment = (actionId) => request("/payments/create", { method: "POST", body: JSON.stringify({ actionId }) });
export const apiPaymentStatus = (orderId) => request(`/payments/${encodeURIComponent(orderId)}/status`);
export const apiDashboard = () => request("/dashboard/stats");
export const apiAudit = (limit = 50) => request(`/audit?limit=${limit}`);
export const apiSimulation = (scenarioId) => request("/simulation/run", { method: "POST", body: JSON.stringify({ scenarioId }) });
