import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPaymentStatus } from "../services/api";
import Icon from "../components/Icon";
const money = (p) => p == null ? "—" : `₹${(p / 100).toLocaleString("en-IN")}`;
export default function Payments() {
    const [orderId, setOrderId] = useState("");
    const [payment, setPayment] = useState(null);
    const [error, setError] = useState("");
    const navigate = useNavigate();
    async function lookup() {
        if (!orderId.trim())
            return;
        setError("");
        try {
            const result = await apiPaymentStatus(orderId.trim());
            setPayment(result);
        }
        catch (e) {
            setPayment(null);
            setError(e instanceof Error ? e.message : "Payment could not be found.");
        }
    }
    return (_jsxs("section", { className: "simple-page", children: [_jsxs("div", { className: "simple-head", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "PAYMENTS" }), _jsx("h1", { children: "Payment status" }), _jsx("p", { children: "Check the authoritative status of a Razorpay test payment." })] }), _jsxs("span", { className: "mode-pill large", children: [_jsx("span", { className: "mode-dot" }), " Test mode"] })] }), _jsxs("div", { className: "lookup-card", children: [_jsxs("div", { className: "lookup-copy", children: [_jsx("div", { className: "lookup-icon", children: _jsx(Icon, { name: "card", size: 21 }) }), _jsxs("div", { children: [_jsx("strong", { children: "Look up an order" }), _jsx("span", { children: "Use the order ID returned after AgentShield creates a payment link." })] })] }), _jsxs("div", { className: "lookup-form", children: [_jsx("input", { value: orderId, onChange: (e) => setOrderId(e.target.value), onKeyDown: (e) => e.key === "Enter" && void lookup(), placeholder: "Order ID" }), _jsxs("button", { onClick: () => void lookup(), children: [_jsx(Icon, { name: "search", size: 17 }), " Check"] })] })] }), error && _jsxs("div", { className: "inline-error page-error", children: [_jsx(Icon, { name: "x", size: 15 }), " ", error] }), payment && (_jsxs("div", { className: "payment-result-card", children: [_jsxs("div", { className: "payment-result-main", children: [_jsx("span", { className: "eyebrow", children: "CURRENT STATE" }), _jsxs("div", { className: `payment-status ${payment.status.toLowerCase()}`, children: [_jsx("span", {}), " ", payment.status.replaceAll("_", " ")] }), _jsx("strong", { children: money(payment.amountInPaise) })] }), _jsxs("div", { className: "payment-result-meta", children: [_jsxs("div", { children: [_jsx("span", { children: "Order ID" }), _jsx("code", { children: payment.orderId })] }), _jsxs("div", { children: [_jsx("span", { children: "Payment link" }), _jsx("code", { children: payment.paymentLinkId || "—" })] }), payment.paymentLink && _jsxs("a", { href: payment.paymentLink, target: "_blank", rel: "noreferrer", children: ["Open checkout ", _jsx(Icon, { name: "external", size: 14 })] }), _jsxs("button", { onClick: () => navigate(`/payments/${payment.orderId}`), children: ["View details ", _jsx(Icon, { name: "arrow", size: 14 })] })] })] })), !payment && !error && _jsxs("div", { className: "page-empty", children: [_jsx("div", { children: _jsx(Icon, { name: "card", size: 22 }) }), _jsx("strong", { children: "No payment selected" }), _jsx("span", { children: "Create a payment from the Agent page, then paste its order ID here." })] })] }));
}
