import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState, } from "react";
import { useNavigate } from "react-router-dom";
import { apiPaymentHistory, apiPaymentStatus, } from "../services/api";
import Icon from "../components/Icon";
function money(paise) {
    if (typeof paise !== "number" ||
        !Number.isFinite(paise)) {
        return "—";
    }
    return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
function formatDate(value) {
    if (!value) {
        return "—";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "—";
    }
    return date.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
    });
}
function statusClass(status) {
    return `payment-status ${status
        ? status.toLowerCase()
        : "unknown"}`;
}
function displayStatus(status) {
    if (!status) {
        return "UNKNOWN";
    }
    return status.replaceAll("_", " ");
}
export default function Payments() {
    const navigate = useNavigate();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [orderId, setOrderId] = useState("");
    const [payment, setPayment] = useState(null);
    const [lookupError, setLookupError] = useState("");
    const [lookupLoading, setLookupLoading] = useState(false);
    /**
     * Load persisted orders from MongoDB.
     */
    const loadHistory = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            console.log("🔵 Calling payment history API...");
            const result = await apiPaymentHistory();
            console.log("🟢 Payment history API response:", result);
            console.log("🟢 Is array:", Array.isArray(result));
            console.log("🟢 Number of payments:", Array.isArray(result)
                ? result.length
                : "NOT ARRAY");
            if (Array.isArray(result)) {
                setPayments(result);
                console.log("🟢 Payments state updated:", result);
            }
            else {
                setPayments([]);
                throw new Error("Invalid payment history response.");
            }
        }
        catch (e) {
            console.error("🔴 Payment history error:", e);
            setPayments([]);
            setError(e instanceof Error
                ? e.message
                : "Payment history could not be loaded.");
        }
        finally {
            setLoading(false);
        }
    }, []);
    /**
     * Load history on page open.
     */
    useEffect(() => {
        void loadHistory();
    }, [loadHistory]);
    /**
     * Look up one order.
     */
    async function lookup() {
        const trimmedOrderId = orderId.trim();
        if (!trimmedOrderId) {
            setLookupError("Enter an order ID.");
            setPayment(null);
            return;
        }
        setLookupError("");
        setPayment(null);
        setLookupLoading(true);
        try {
            const result = await apiPaymentStatus(trimmedOrderId);
            setPayment(result);
        }
        catch (e) {
            setPayment(null);
            setLookupError(e instanceof Error
                ? e.message
                : "Payment could not be found.");
        }
        finally {
            setLookupLoading(false);
        }
    }
    return (_jsxs("section", { className: "simple-page", children: [_jsxs("div", { className: "simple-head", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "PAYMENTS" }), _jsx("h1", { children: "Payment history" }), _jsx("p", { children: "Persisted Razorpay test transactions reconciled by AgentShield." })] }), _jsx("div", { children: _jsxs("span", { className: "mode-pill large", children: [_jsx("span", { className: "mode-dot" }), "Test mode"] }) })] }), error && (_jsxs("div", { className: "inline-error page-error", children: [_jsx(Icon, { name: "x", size: 15 }), _jsx("span", { children: error }), _jsx("button", { type: "button", onClick: () => void loadHistory(), children: "Retry" })] })), _jsxs("div", { className: "lookup-card", children: [_jsxs("div", { className: "lookup-copy", children: [_jsx("div", { className: "lookup-icon", children: _jsx(Icon, { name: "card", size: 21 }) }), _jsxs("div", { children: [_jsx("strong", { children: "Look up an order" }), _jsx("span", { children: "Check the authoritative state of a specific AgentShield order." })] })] }), _jsxs("div", { className: "lookup-form", children: [_jsx("input", { value: orderId, onChange: (event) => setOrderId(event.target.value), onKeyDown: (event) => {
                                    if (event.key === "Enter") {
                                        void lookup();
                                    }
                                }, placeholder: "Order ID", "aria-label": "Order ID" }), _jsxs("button", { type: "button", onClick: () => void lookup(), disabled: lookupLoading, children: [_jsx(Icon, { name: "search", size: 17 }), lookupLoading
                                        ? "Checking…"
                                        : "Check"] })] })] }), lookupError && (_jsxs("div", { className: "inline-error page-error", children: [_jsx(Icon, { name: "x", size: 15 }), _jsx("span", { children: lookupError })] })), payment && (_jsxs("div", { className: "payment-result-card", children: [_jsxs("div", { className: "payment-result-main", children: [_jsx("span", { className: "eyebrow", children: "CURRENT STATE" }), _jsxs("div", { className: statusClass(payment.status), children: [_jsx("span", {}), displayStatus(payment.status)] }), _jsx("strong", { children: money(payment.amountInPaise) })] }), _jsxs("div", { className: "payment-result-meta", children: [_jsxs("div", { children: [_jsx("span", { children: "Order ID" }), _jsx("code", { children: payment.orderId ||
                                            "—" })] }), _jsxs("div", { children: [_jsx("span", { children: "Reference ID" }), _jsx("code", { children: payment.referenceId ||
                                            "—" })] }), _jsxs("div", { children: [_jsx("span", { children: "Payment link" }), _jsx("code", { children: payment.paymentLinkId ||
                                            "—" })] }), _jsxs("div", { children: [_jsx("span", { children: "Razorpay status" }), _jsx("code", { children: payment.razorpayStatus ||
                                            "—" })] }), payment.paymentLink && (_jsxs("a", { href: payment.paymentLink, target: "_blank", rel: "noreferrer", children: ["Open checkout", _jsx(Icon, { name: "external", size: 14 })] })), payment.orderId && (_jsxs("button", { type: "button", onClick: () => navigate(`/payments/${payment.orderId}`), children: ["View details", _jsx(Icon, { name: "arrow", size: 14 })] }))] })] })), _jsxs("div", { className: "simple-head", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "PERSISTED ORDERS" }), _jsx("h2", { children: "Payment history" }), _jsx("p", { children: "Loaded directly from the AgentShield database." })] }), _jsx("div", { children: !loading &&
                            payments.length > 0 && (_jsxs("span", { children: [payments.length, " ", payments.length === 1
                                    ? "payment"
                                    : "payments"] })) })] }), loading && (_jsx("div", { className: "page-loading", children: "Loading payment history\u2026" })), !loading &&
                !error &&
                payments.length === 0 && (_jsxs("div", { className: "page-empty", children: [_jsx("div", { children: _jsx(Icon, { name: "card", size: 22 }) }), _jsx("strong", { children: "No payments yet" }), _jsx("span", { children: "Create a payment from the Agent page and it will appear here automatically." })] })), !loading &&
                payments.length > 0 && (_jsx("div", { className: "payment-history-list", children: payments.map((item) => {
                    const firstItem = Array.isArray(item.items) &&
                        item.items.length > 0
                        ? item.items[0]
                        : null;
                    const itemCount = Array.isArray(item.items)
                        ? item.items.length
                        : 0;
                    return (_jsxs("button", { type: "button", className: "payment-history-card", onClick: () => navigate(`/payments/${item.orderId}`), children: [_jsxs("div", { className: "payment-history-main", children: [_jsxs("div", { children: [_jsx("strong", { children: firstItem
                                                    ?.productName ||
                                                    "Order" }), _jsx("span", { children: itemCount >
                                                    1
                                                    ? `${itemCount} items`
                                                    : firstItem
                                                        ? `Qty ${firstItem.quantity}`
                                                        : "No items" })] }), _jsx("strong", { children: money(item.amountInPaise) })] }), _jsxs("div", { className: "payment-history-meta", children: [_jsxs("span", { className: statusClass(item.status), children: [_jsx("span", {}), displayStatus(item.status)] }), _jsx("code", { children: item.orderId }), _jsx("span", { children: formatDate(item.createdAt) }), _jsx(Icon, { name: "arrow", size: 16 })] })] }, item.orderId));
                }) }))] }));
}
