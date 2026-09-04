import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function StatusBadge({ status }) {
    const statusConfig = {
        CREATED: { label: "Created", className: "bg-neutral-100 text-neutral-600", dotClassName: "bg-neutral-400" },
        AWAITING_PAYMENT: { label: "Awaiting Payment", className: "bg-warning-50 text-warning-700", dotClassName: "bg-warning-500" },
        PAID: { label: "Paid", className: "bg-success-50 text-success-700", dotClassName: "bg-success-500" },
        FAILED: { label: "Failed", className: "bg-danger-50 text-danger-700", dotClassName: "bg-danger-500" },
        UNKNOWN: { label: "Unknown", className: "bg-neutral-100 text-neutral-600", dotClassName: "bg-neutral-400" },
        RECOVERED: { label: "Recovered", className: "bg-primary-50 text-primary-700", dotClassName: "bg-primary-500" },
        CANCELLED: { label: "Cancelled", className: "bg-neutral-100 text-neutral-600", dotClassName: "bg-neutral-400" },
        NOT_STARTED: { label: "Not Started", className: "bg-neutral-100 text-neutral-600", dotClassName: "bg-neutral-400" },
        IN_PROGRESS: { label: "In Progress", className: "bg-primary-50 text-primary-700", dotClassName: "bg-primary-500" },
        SUCCEEDED: { label: "Succeeded", className: "bg-success-50 text-success-700", dotClassName: "bg-success-500" },
        BLOCKED: { label: "Blocked", className: "bg-danger-50 text-danger-700", dotClassName: "bg-danger-500" },
        PENDING: { label: "Pending", className: "bg-warning-50 text-warning-700", dotClassName: "bg-warning-500" },
        APPROVED: { label: "Approved", className: "bg-success-50 text-success-700", dotClassName: "bg-success-500" },
        REJECTED: { label: "Rejected", className: "bg-danger-50 text-danger-700", dotClassName: "bg-danger-500" },
        NOT_REQUIRED: { label: "Not Required", className: "bg-neutral-100 text-neutral-600", dotClassName: "bg-neutral-400" },
    };
    const config = statusConfig[status] || { label: status, className: "bg-neutral-100 text-neutral-600", dotClassName: "bg-neutral-400" };
    return (_jsxs("span", { className: `inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`, children: [_jsx("span", { className: `h-1.5 w-1.5 rounded-full ${config.dotClassName}` }), config.label] }));
}
