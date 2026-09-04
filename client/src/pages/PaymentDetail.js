import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState, } from "react";
import { Link, useParams, } from "react-router-dom";
import { apiPaymentStatus, } from "../services/api";
import Icon from "../components/Icon";
const money = (paise) => {
    if (paise == null) {
        return "—";
    }
    return `₹${(paise / 100).toLocaleString("en-IN")}`;
};
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
export default function PaymentDetail() {
    const { orderId } = useParams();
    const [payment, setPayment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const loadPayment = useCallback(async (showLoading = true) => {
        if (!orderId) {
            setError("Order ID is missing.");
            setLoading(false);
            return;
        }
        if (showLoading) {
            setLoading(true);
        }
        setError("");
        try {
            const result = await apiPaymentStatus(orderId);
            setPayment(result);
        }
        catch (e) {
            setPayment(null);
            setError(e instanceof Error
                ? e.message
                : "Payment status could not be loaded.");
        }
        finally {
            setLoading(false);
        }
    }, [orderId]);
    /*
     * Initial request.
     */
    useEffect(() => {
        void loadPayment(true);
    }, [loadPayment]);
    /*
     * Razorpay can redirect immediately after payment.
     *
     * The backend independently checks Razorpay's
     * authoritative state, so give reconciliation a
     * few attempts before stopping.
     */
    useEffect(() => {
        if (!orderId) {
            return;
        }
        let cancelled = false;
        const reconcile = async () => {
            for (let attempt = 0; attempt < 5; attempt += 1) {
                if (cancelled) {
                    return;
                }
                try {
                    const result = await apiPaymentStatus(orderId);
                    if (cancelled) {
                        return;
                    }
                    setPayment(result);
                    setError("");
                    setLoading(false);
                    /*
                     * Once the authoritative order state
                     * reaches a terminal payment state,
                     * stop polling.
                     */
                    if (result.status === "PAID" ||
                        result.status === "FAILED") {
                        return;
                    }
                }
                catch (e) {
                    if (cancelled) {
                        return;
                    }
                    /*
                     * Only expose the error after the final
                     * reconciliation attempt.
                     */
                    if (attempt === 4) {
                        setError(e instanceof Error
                            ? e.message
                            : "Payment status could not be loaded.");
                        setLoading(false);
                    }
                }
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        };
        void reconcile();
        return () => {
            cancelled = true;
        };
    }, [orderId]);
    /*
     * Loading state.
     */
    if (loading && !payment) {
        return (_jsx("section", { className: "simple-page", children: _jsx("div", { className: "page-loading", children: "Checking payment status\u2026" }) }));
    }
    /*
     * Complete failure.
     */
    if (error && !payment) {
        return (_jsxs("section", { className: "simple-page", children: [_jsxs("div", { className: "inline-error page-error", children: [_jsx(Icon, { name: "x", size: 15 }), error] }), _jsx(Link, { className: "text-link", to: "/payments", children: "\u2190 Back to payments" })] }));
    }
    /*
     * No payment returned.
     */
    if (!payment) {
        return (_jsxs("section", { className: "simple-page", children: [_jsxs("div", { className: "page-empty", children: [_jsx("div", { children: _jsx(Icon, { name: "card", size: 22 }) }), _jsx("strong", { children: "Payment not found" }), _jsx("span", { children: "AgentShield could not find this payment order." })] }), _jsx(Link, { className: "text-link", to: "/payments", children: "\u2190 Back to payments" })] }));
    }
    const formattedStatus = payment.status.replaceAll("_", " ");
    return (_jsxs("section", { className: "simple-page", children: [_jsxs("div", { className: "simple-head", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "PAYMENT DETAIL" }), _jsx("h1", { children: payment.orderId.slice(-10) }), _jsx("p", { children: "Authoritative payment state reconciled by AgentShield." })] }), _jsxs("div", { className: `payment-status ${payment.status.toLowerCase()}`, children: [_jsx("span", {}), formattedStatus] })] }), error && (_jsxs("div", { className: "inline-error page-error", children: [_jsx(Icon, { name: "x", size: 15 }), error] })), _jsxs("div", { className: "detail-surface", children: [_jsxs("div", { className: "detail-amount", children: [_jsx("span", { children: "AMOUNT" }), _jsx("strong", { children: money(payment.amountInPaise) }), _jsxs("small", { children: [payment.currency, " \u00B7 server verified"] })] }), _jsxs("div", { className: "detail-field", children: [_jsx("span", { children: "ITEMS" }), _jsx("div", { children: payment.items.length === 0 ? (_jsx("span", { children: "\u2014" })) : (payment.items.map((item) => (_jsxs("div", { style: {
                                        marginBottom: "10px",
                                    }, children: [_jsx("strong", { children: item.productName }), _jsxs("div", { children: ["Qty", " ", item.quantity, " ", "\u00B7", " ", money(item.unitPriceInPaise), " ", "each"] })] }, `${item.productId}-${item.quantity}`)))) })] }), _jsxs("div", { className: "detail-field", children: [_jsx("span", { children: "ORDER ID" }), _jsx("code", { children: payment.orderId })] }), _jsxs("div", { className: "detail-field", children: [_jsx("span", { children: "REFERENCE ID" }), _jsx("code", { children: payment.referenceId })] }), _jsxs("div", { className: "detail-field", children: [_jsx("span", { children: "PAYMENT LINK ID" }), _jsx("code", { children: payment.paymentLinkId ||
                                    "—" })] }), _jsxs("div", { className: "detail-field", children: [_jsx("span", { children: "RAZORPAY PAYMENT ID" }), _jsx("code", { children: payment.razorpayPaymentId ||
                                    "—" })] }), _jsxs("div", { className: "detail-field", children: [_jsx("span", { children: "RAZORPAY STATUS" }), _jsx("code", { children: payment.razorpayStatus ||
                                    "—" })] }), _jsxs("div", { className: "detail-field", children: [_jsx("span", { children: "CREATED" }), _jsx("code", { children: formatDate(payment.createdAt) })] }), _jsxs("div", { className: "detail-field", children: [_jsx("span", { children: "UPDATED" }), _jsx("code", { children: formatDate(payment.updatedAt) })] }), payment.paymentLink && (_jsxs("a", { className: "approve-button compact", href: payment.paymentLink, target: "_blank", rel: "noreferrer", children: ["Open Razorpay checkout", _jsx(Icon, { name: "external", size: 15 })] }))] }), _jsx(Link, { className: "text-link", to: "/payments", children: "\u2190 Back to payments" })] }));
}
