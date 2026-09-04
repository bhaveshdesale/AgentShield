import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useApi } from "../hooks/useApi";
import { apiGetMerchant } from "../services/api";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
export default function RiskRules() {
    const { data: merchant, error: merchantError, loading: merchantLoading, refetch } = useApi({ fn: apiGetMerchant, deps: [] });
    if (merchantLoading) {
        return _jsx(LoadingState, {});
    }
    if (merchantError) {
        return _jsx(ErrorState, { error: merchantError, onRetry: refetch });
    }
    if (!merchant) {
        return _jsx("div", { className: "text-center py-8 text-neutral-400", children: "Merchant not found" });
    }
    const policy = merchant.policy;
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-semibold text-neutral-900", children: "Risk & Rules" }), _jsx("p", { className: "mt-1 text-neutral-500", children: "Current merchant policy settings." }), _jsxs("div", { className: "mt-6 bg-white rounded-lg border border-neutral-200 p-4 shadow-sm", children: [_jsx("h3", { className: "text-lg font-semibold text-neutral-900 mb-3", children: "Merchant" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm text-neutral-500", children: "Name" }), _jsx("p", { className: "font-medium text-neutral-900", children: merchant.name })] }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-neutral-500", children: "Created" }), _jsx("p", { className: "font-medium text-neutral-900", children: new Date(merchant.createdAt).toLocaleString() })] })] })] }), _jsxs("div", { className: "mt-4 bg-white rounded-lg border border-neutral-200 p-4 shadow-sm", children: [_jsx("h3", { className: "text-lg font-semibold text-neutral-900 mb-3", children: "Policy" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm text-neutral-500", children: "Max Transaction Amount" }), _jsxs("p", { className: "font-medium text-neutral-900", children: ["\u20B9", (policy.maxTransactionAmount / 100).toLocaleString("en-IN")] })] }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-neutral-500", children: "Max Discount Percent" }), _jsxs("p", { className: "font-medium text-neutral-900", children: [policy.maxDiscountPercent, "%"] })] }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-neutral-500", children: "Human Approval Required" }), _jsx("p", { className: "font-medium text-neutral-900", children: policy.requireHumanApproval ? "Yes" : "No" })] }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-neutral-500", children: "Allow Refunds" }), _jsx("p", { className: "font-medium text-neutral-900", children: policy.allowRefunds ? "Yes" : "No" })] }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-neutral-500", children: "Allow Payouts" }), _jsx("p", { className: "font-medium text-neutral-900", children: policy.allowPayouts ? "Yes" : "No" })] })] })] }), _jsx("div", { className: "mt-4 bg-neutral-50 rounded-lg border border-neutral-200 p-4", children: _jsx("p", { className: "text-sm text-neutral-600", children: "These rules are enforced by AgentShield's deterministic policy engine. The AI cannot override them." }) })] }));
}
