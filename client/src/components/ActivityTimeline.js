import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const eventLabels = {
    ACTION_VALIDATED: "Action validated",
    ACTION_BLOCKED: "Action blocked",
    ACTION_APPROVED: "Action approved",
    PAYMENT_LINK_CREATION_STARTED: "Payment link creation started",
    PAYMENT_LINK_CREATED: "Payment link created",
    PAYMENT_EXECUTION_FAILED: "Payment execution failed",
    PAYMENT_EXECUTION_UNKNOWN: "Payment execution unknown",
    ORDER_PAYMENT_CONFIRMED: "Payment confirmed",
    ORDER_PAYMENT_FAILED: "Payment failed",
    RECOVERY_STARTED: "Recovery started",
    RECOVERY_PAYMENT_FOUND: "Payment found during recovery",
    RECOVERY_PAYMENT_CONFIRMED: "Payment confirmed during recovery",
    RECOVERY_SAFE_RETRY: "Safe retry initiated",
    RECOVERY_RETRY_FAILED: "Recovery retry failed",
    RECOVERY_UNRESOLVED: "Recovery unresolved",
    WEBHOOK_RECEIVED: "Webhook received",
    WEBHOOK_VERIFIED: "Webhook verified",
    WEBHOOK_IGNORED: "Webhook ignored",
    WEBHOOK_DUPLICATE: "Duplicate webhook",
    WEBHOOK_UNKNOWN_ORDER: "Unknown order in webhook",
    WEBHOOK_MALFORMED: "Malformed webhook",
    WEBHOOK_INVALID_SIGNATURE: "Invalid webhook signature",
};
function getEventLabel(event) {
    return eventLabels[event] ?? event.replace(/_/g, " ");
}
function getEventIcon(event) {
    if (event.includes("CONFIRMED") || event.includes("CREATED") || event.includes("PAID"))
        return "✓";
    if (event.includes("FAILED") || event.includes("BLOCKED"))
        return "✕";
    if (event.includes("REQUIRED") || event.includes("STARTED") || event.includes("UNKNOWN"))
        return "⚠";
    if (event.includes("RECOVERY"))
        return "↻";
    if (event.includes("WEBHOOK"))
        return "⧈";
    return "•";
}
export default function ActivityTimeline({ logs }) {
    if (!logs || logs.length === 0) {
        return (_jsx("div", { className: "text-center py-8 text-neutral-400", children: _jsx("p", { className: "text-sm", children: "No activity yet" }) }));
    }
    return (_jsx("div", { className: "flow-root", children: _jsx("ul", { className: "-mb-2", children: logs.map((log) => (_jsxs("li", { className: "relative pb-4", children: [_jsx("div", { className: "absolute left-4 top-0 bottom-0 w-px bg-neutral-200" }), _jsxs("div", { className: "relative flex items-start gap-3", children: [_jsx("div", { className: "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs", children: getEventIcon(log.event) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "text-sm font-medium text-neutral-900", children: getEventLabel(log.event) }), _jsx("time", { className: "text-xs text-neutral-400", children: new Date(log.timestamp).toLocaleString() })] }), log.details && (_jsx("pre", { className: "mt-0.5 text-xs text-neutral-500 whitespace-pre-wrap", children: JSON.stringify(log.details, null, 0) })), log.actionId && (_jsxs("div", { className: "mt-0.5 text-xs text-neutral-400", children: ["Action: ", log.actionId] }))] })] })] }, log._id))) }) }));
}
