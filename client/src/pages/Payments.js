import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { apiGetOrders, apiReconcilePayment } from "../services/api";
import MetricCard from "../components/MetricCard";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../hooks/useToast";
export default function Payments() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { data: orders, error: ordersError, loading: ordersLoading, refetch } = useApi({ fn: apiGetOrders, deps: [] });
    const handleReconcile = async (orderId) => {
        try {
            const result = await apiReconcilePayment(orderId);
            showToast(`Payment reconciled: ${result.status}`, "success");
            refetch();
        }
        catch (e) {
            const error = e;
            showToast(error.message || "Reconciliation failed", "error");
        }
    };
    if (ordersLoading) {
        return _jsx(LoadingState, {});
    }
    if (ordersError) {
        return _jsx(ErrorState, { error: ordersError, onRetry: refetch });
    }
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-semibold text-neutral-900", children: "Payments" }), _jsx("p", { className: "mt-1 text-neutral-500", children: "Monitor and manage payment execution and recovery." }), _jsxs("div", { className: "mt-6 grid grid-cols-1 md:grid-cols-4 gap-4", children: [_jsx(MetricCard, { title: "Total Orders", value: orders?.length || 0, variant: "default" }), _jsx(MetricCard, { title: "Awaiting Payment", value: orders?.filter((o) => o.status === "AWAITING_PAYMENT").length || 0, variant: "warning" }), _jsx(MetricCard, { title: "Paid", value: orders?.filter((o) => o.status === "PAID").length || 0, variant: "success" }), _jsx(MetricCard, { title: "Unknown", value: orders?.filter((o) => o.status === "UNKNOWN").length || 0, variant: "neutral" })] }), _jsxs("div", { className: "mt-8", children: [_jsx("h2", { className: "text-lg font-semibold text-neutral-900 mb-3", children: "Payment Orders" }), orders && orders.length > 0 ? (_jsx("div", { className: "overflow-x-auto rounded-lg border border-neutral-200 bg-white", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-neutral-200 bg-neutral-50", children: [_jsx("th", { className: "px-4 py-2 text-left font-medium text-neutral-500", children: "Reference" }), _jsx("th", { className: "px-4 py-2 text-left font-medium text-neutral-500", children: "Amount" }), _jsx("th", { className: "px-4 py-2 text-left font-medium text-neutral-500", children: "Status" }), _jsx("th", { className: "px-4 py-2 text-left font-medium text-neutral-500", children: "Updated" }), _jsx("th", { className: "px-4 py-2 text-left font-medium text-neutral-500", children: "Actions" })] }) }), _jsx("tbody", { children: orders.map((order) => (_jsxs("tr", { className: "border-b border-neutral-200 last:border-0 hover:bg-neutral-50", children: [_jsx("td", { className: "px-4 py-2 font-mono text-neutral-900", children: order.referenceId }), _jsxs("td", { className: "px-4 py-2 text-neutral-900", children: ["\u20B9", (order.amountInPaise / 100).toLocaleString("en-IN")] }), _jsx("td", { className: "px-4 py-2", children: _jsx(StatusBadge, { status: order.status }) }), _jsx("td", { className: "px-4 py-2 text-neutral-500", children: new Date(order.updatedAt).toLocaleString() }), _jsx("td", { className: "px-4 py-2", children: order.status === "UNKNOWN" && (_jsx("button", { onClick: () => handleReconcile(order._id), className: "text-sm font-medium text-primary-600 hover:text-primary-700", children: "Reconcile" })) })] }, order._id))) })] }) })) : (_jsx("div", { className: "text-center py-8 text-neutral-400", children: _jsx("p", { children: "No payment orders yet" }) }))] })] }));
}
