import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useApi } from "../hooks/useApi";
import { apiGetAuditLogs } from "../services/api";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import StatusBadge from "../components/StatusBadge";
export default function AuditLog() {
    const { data: logs, error, loading, refetch } = useApi({ fn: () => apiGetAuditLogs(50), deps: [] });
    if (loading) {
        return _jsx(LoadingState, {});
    }
    if (error) {
        return _jsx(ErrorState, { error: error, onRetry: refetch });
    }
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-semibold text-neutral-900", children: "Audit Log" }), _jsx("p", { className: "mt-1 text-neutral-500", children: "View system events and actions." }), _jsx("div", { className: "mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-neutral-200 bg-neutral-50", children: [_jsx("th", { className: "px-4 py-2 text-left font-medium text-neutral-500", children: "Timestamp" }), _jsx("th", { className: "px-4 py-2 text-left font-medium text-neutral-500", children: "Event" }), _jsx("th", { className: "px-4 py-2 text-left font-medium text-neutral-500", children: "Action ID" }), _jsx("th", { className: "px-4 py-2 text-left font-medium text-neutral-500", children: "Details" })] }) }), _jsx("tbody", { children: logs && logs.length > 0 ? (logs.map((log) => (_jsxs("tr", { className: "border-b border-neutral-200 last:border-0 hover:bg-neutral-50", children: [_jsx("td", { className: "px-4 py-2 text-neutral-900", children: new Date(log.timestamp).toLocaleString() }), _jsx("td", { className: "px-4 py-2", children: _jsx(StatusBadge, { status: log.event }) }), _jsx("td", { className: "px-4 py-2 font-mono text-neutral-900", children: log.actionId || "N/A" }), _jsx("td", { className: "px-4 py-2 text-neutral-500", children: JSON.stringify(log.details, null, 2) })] }, log._id)))) : (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "px-4 py-8 text-center text-neutral-400", children: "No audit logs yet" }) })) })] }) })] }));
}
