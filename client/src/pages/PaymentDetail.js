import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiPaymentStatus } from "../services/api";
import Icon from "../components/Icon";
const money = (p) => p == null ? "—" : `₹${(p / 100).toLocaleString("en-IN")}`;
export default function PaymentDetail() {
    const { orderId } = useParams();
    const [payment, setPayment] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => {
        if (!orderId)
            return;
        apiPaymentStatus(orderId).then(setPayment).catch((e) => setError(e instanceof Error ? e.message : "Payment unavailable."));
    }, [orderId]);
    if (error)
        return _jsxs("section", { className: "simple-page", children: [_jsxs("div", { className: "inline-error page-error", children: [_jsx(Icon, { name: "x", size: 15 }), " ", error] }), _jsx(Link, { className: "text-link", to: "/payments", children: "\u2190 Back to payments" })] });
    if (!payment)
        return _jsx("section", { className: "simple-page", children: _jsx("div", { className: "page-loading", children: "Loading payment\u2026" }) });
    return (_jsxs("section", { className: "simple-page", children: [_jsxs("div", { className: "simple-head", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "PAYMENT DETAIL" }), _jsx("h1", { children: payment.orderId.slice(-10) }), _jsx("p", { children: "Authoritative state reconciled by AgentShield." })] }), _jsxs("div", { className: `payment-status ${payment.status.toLowerCase()}`, children: [_jsx("span", {}), " ", payment.status.replaceAll("_", " ")] })] }), _jsxs("div", { className: "detail-surface", children: [_jsxs("div", { className: "detail-amount", children: [_jsx("span", { children: "AMOUNT" }), _jsx("strong", { children: money(payment.amountInPaise) }), _jsx("small", { children: "INR \u00B7 server verified" })] }), _jsxs("div", { className: "detail-field", children: [_jsx("span", { children: "ORDER ID" }), _jsx("code", { children: payment.orderId })] }), _jsxs("div", { className: "detail-field", children: [_jsx("span", { children: "PAYMENT LINK ID" }), _jsx("code", { children: payment.paymentLinkId || "—" })] }), payment.paymentLink && _jsxs("a", { className: "approve-button compact", href: payment.paymentLink, target: "_blank", rel: "noreferrer", children: ["Open Razorpay checkout ", _jsx(Icon, { name: "external", size: 15 })] })] }), _jsx(Link, { className: "text-link", to: "/payments", children: "\u2190 Back to payments" })] }));
}
