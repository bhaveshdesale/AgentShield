import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { apiGetActions } from "../services/api";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import StatusBadge from "../components/StatusBadge";
export default function ControlCenter() {
    const navigate = useNavigate();
    const { data: actions, error: actionsError, loading: actionsLoading, refetch } = useApi({ fn: apiGetActions, deps: [] });
    if (actionsLoading) {
        return _jsx(LoadingState, {});
    }
    if (actionsError) {
        return _jsx(ErrorState, { error: actionsError, onRetry: refetch });
    }
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-semibold text-neutral-900", children: "Control Center" }), _jsx("p", { className: "mt-1 text-neutral-500", children: "Overview of agent actions and approvals." }), _jsxs("div", { className: "mt-6 grid grid-cols-1 md:grid-cols-3 gap-4", children: [_jsxs("div", { className: "bg-white rounded-lg border border-neutral-200 p-4 shadow-sm", children: [_jsx("h3", { className: "text-sm font-medium text-neutral-500", children: "Total Actions" }), _jsx("p", { className: "text-2xl font-semibold text-neutral-900 mt-1", children: actions?.length || 0 })] }), _jsxs("div", { className: "bg-white rounded-lg border border-neutral-200 p-4 shadow-sm", children: [_jsx("h3", { className: "text-sm font-medium text-neutral-500", children: "Awaiting Approval" }), _jsx("p", { className: "text-2xl font-semibold text-warning-600 mt-1", children: actions?.filter((a) => a.approvalStatus === "PENDING").length || 0 })] }), _jsxs("div", { className: "bg-white rounded-lg border border-neutral-200 p-4 shadow-sm", children: [_jsx("h3", { className: "text-sm font-medium text-neutral-500", children: "Recovered" }), _jsx("p", { className: "text-2xl font-semibold text-success-600 mt-1", children: actions?.filter((a) => a.executionStatus === "RECOVERED").length || 0 })] })] }), _jsxs("div", { className: "mt-8", children: [_jsx("h2", { className: "text-lg font-semibold text-neutral-900 mb-3", children: "Recent Activity" }), actions && actions.length > 0 ? (_jsx("div", { className: "space-y-3", children: actions.map((action) => (_jsxs("div", { className: "bg-white rounded-lg border border-neutral-200 p-4 shadow-sm hover:bg-neutral-50 cursor-pointer transition-colors", onClick: () => navigate(`/actions/${action._id}`), children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("div", { className: "font-medium text-neutral-900", children: action.action.replace("_", " ") }), _jsx(StatusBadge, { status: action.executionStatus })] }), _jsxs("div", { className: "text-sm text-neutral-500 flex gap-4", children: [_jsxs("span", { children: ["Reference: ", action.referenceId] }), _jsxs("span", { children: ["Conversation: ", action.conversationId] }), _jsxs("span", { children: ["Created: ", new Date(action.createdAt).toLocaleString()] })] }), _jsxs("div", { className: "mt-2 flex gap-2", children: [action.approvalStatus === "PENDING" && _jsx(StatusBadge, { status: "PENDING" }), action.approvalStatus === "APPROVED" && _jsx(StatusBadge, { status: "APPROVED" }), action.approvalStatus === "REJECTED" && _jsx(StatusBadge, { status: "REJECTED" })] })] }, action._id))) })) : (_jsx("div", { className: "text-center py-8 text-neutral-400", children: _jsx("p", { children: "No actions yet" }) }))] })] }));
}
