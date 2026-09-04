import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { apiAgentChat, apiApproveAction, apiCreatePayment, apiProducts, apiValidateAction } from "../services/api";
import Icon from "../components/Icon";
const money = (paise) => `₹${(paise / 100).toLocaleString("en-IN")}`;
export default function AgentWorkspace() {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState([]);
    const [result, setResult] = useState(null);
    const [action, setAction] = useState(null);
    const [payment, setPayment] = useState(null);
    const [products, setProducts] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const started = messages.length > 0;
    const suggestions = useMemo(() => [
        "Find wireless headphones under ₹5,000",
        "Buy the artisan coffee kit",
        "Find a laptop under ₹50,000",
    ], []);
    async function sendMessage(value = input) {
        const message = value.trim();
        if (!message || busy)
            return;
        setInput("");
        setMessages((current) => [...current, { role: "user", text: message }]);
        setBusy(true);
        setError("");
        try {
            const response = await apiAgentChat(message, result?.conversationId);
            setResult(response);
            setMessages((current) => [...current, { role: "agent", text: response.message }]);
            const catalog = await apiProducts();
            setProducts(catalog);
            if (response.proposal && response.policyResult) {
                const validated = await apiValidateAction({
                    ...response.proposal,
                    conversationId: response.conversationId,
                });
                setAction({
                    _id: validated.actionId,
                    conversationId: response.conversationId,
                    referenceId: response.proposal.referenceId,
                    action: response.proposal.action,
                    proposal: response.proposal,
                    reason: response.proposal.reason,
                    policyResult: validated,
                    verifiedAmountInPaise: validated.verifiedAmountInPaise,
                    approvalRequired: validated.approvalRequired,
                    approvalStatus: validated.approvalRequired ? "PENDING" : "NOT_REQUIRED",
                    executionStatus: validated.decision === "ALLOW" ? "NOT_STARTED" : "BLOCKED",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
                setPayment(null);
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "The agent could not complete the request.");
        }
        finally {
            setBusy(false);
        }
    }
    async function approve() {
        if (!action || action.policyResult?.decision !== "ALLOW" || busy)
            return;
        setBusy(true);
        setError("");
        try {
            await apiApproveAction(action._id);
            const created = await apiCreatePayment(action._id);
            setPayment(created);
            setAction((current) => current ? { ...current, approvalStatus: "APPROVED", executionStatus: "IN_PROGRESS" } : current);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Approval failed.");
        }
        finally {
            setBusy(false);
        }
    }
    function onSubmit(event) {
        event.preventDefault();
        void sendMessage();
    }
    if (!started) {
        return (_jsxs("section", { className: "agent-home", children: [_jsxs("div", { className: "agent-intro", children: [_jsxs("div", { className: "agent-avatar", "aria-hidden": "true", children: [_jsx("span", { className: "avatar-eye left" }), _jsx("span", { className: "avatar-eye right" }), _jsx("span", { className: "avatar-body" }), _jsx("span", { className: "avatar-shadow" })] }), _jsx("p", { className: "home-kicker", children: "SECURE COMMERCE AGENT" }), _jsxs("h1", { children: ["What can I help you ", _jsx("span", { children: "buy?" })] }), _jsx("p", { className: "home-subtitle", children: "Ask naturally. AgentShield verifies every proposed transaction before money can move." })] }), _jsxs("form", { className: "composer hero-composer", onSubmit: onSubmit, children: [_jsx("textarea", { value: input, onChange: (event) => setInput(event.target.value), onKeyDown: (event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    void sendMessage();
                                }
                            }, placeholder: "Chat with your assistant...", rows: 2, autoFocus: true }), _jsxs("div", { className: "composer-bottom", children: [_jsxs("span", { className: "composer-hint", children: [_jsx(Icon, { name: "shield", size: 14 }), " Policy protected"] }), _jsx("button", { className: "send-button", disabled: !input.trim() || busy, "aria-label": "Send", children: _jsx(Icon, { name: "arrow", size: 18 }) })] })] }), _jsx("div", { className: "suggestions", children: suggestions.map((suggestion) => (_jsx("button", { onClick: () => void sendMessage(suggestion), children: suggestion }, suggestion))) }), _jsxs("div", { className: "trust-line", children: [_jsx("span", { className: "trust-check", children: "\u2713" }), " AI proposes \u00B7 AgentShield authorizes \u00B7 You approve \u00B7 Razorpay executes"] })] }));
    }
    return (_jsxs("section", { className: "agent-session", children: [_jsxs("div", { className: "session-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "PROTECTED SESSION" }), _jsx("h1", { children: "Commerce agent" })] }), _jsx("button", { className: "new-session", onClick: () => { setMessages([]); setResult(null); setAction(null); setPayment(null); setError(""); }, children: "New conversation" })] }), _jsxs("div", { className: "session-grid", children: [_jsxs("section", { className: "conversation-card", children: [_jsxs("div", { className: "conversation-scroll", children: [messages.map((message, index) => (_jsxs("div", { className: `chat-message ${message.role}`, children: [message.role === "agent" && _jsx("div", { className: "mini-agent", children: _jsx(Icon, { name: "shield", size: 14 }) }), _jsx("div", { className: "chat-bubble", children: message.text })] }, `${message.role}-${index}`))), busy && _jsxs("div", { className: "chat-message agent", children: [_jsx("div", { className: "mini-agent", children: _jsx(Icon, { name: "shield", size: 14 }) }), _jsxs("div", { className: "chat-bubble typing", children: [_jsx("i", {}), " ", _jsx("i", {}), " ", _jsx("i", {})] })] })] }), _jsxs("form", { className: "composer session-composer", onSubmit: onSubmit, children: [_jsx("textarea", { value: input, onChange: (event) => setInput(event.target.value), placeholder: "Tell the agent what you want to buy...", rows: 1 }), _jsx("button", { className: "send-button", disabled: !input.trim() || busy, "aria-label": "Send", children: _jsx(Icon, { name: "arrow", size: 17 }) })] }), result?.source === "fallback" && _jsx("p", { className: "fallback-note", children: "Using deterministic fallback agent. Authorization remains server-side." })] }), _jsxs("aside", { className: "security-card", children: [_jsxs("div", { className: "security-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "AGENTSHIELD" }), _jsx("h2", { children: "Authorization" })] }), _jsxs("span", { className: "secure-badge", children: [_jsx("span", {}), " protected"] })] }), error && _jsxs("div", { className: "inline-error", children: [_jsx(Icon, { name: "x", size: 15 }), " ", error] }), !action && _jsxs("div", { className: "security-empty", children: [_jsx("div", { className: "security-orb", children: _jsx(Icon, { name: "shield", size: 25 }) }), _jsx("strong", { children: "Waiting for a proposal" }), _jsx("span", { children: "The agent can recommend a product, but only this server-side policy layer can authorize payment." })] }), action && (_jsxs(_Fragment, { children: [_jsxs("div", { className: `decision-banner ${action.policyResult?.decision.toLowerCase()}`, children: [_jsx("span", { className: "decision-symbol", children: action.policyResult?.decision === "ALLOW" ? "✓" : action.policyResult?.decision === "BLOCK" ? "×" : "!" }), _jsxs("div", { children: [_jsx("strong", { children: action.policyResult?.decision === "ALLOW" ? "Allowed — approval required" : action.policyResult?.decision === "BLOCK" ? "Blocked by policy" : "Escalation required" }), _jsx("span", { children: action.policyResult?.reason })] })] }), _jsxs("div", { className: "proposal-card", children: [_jsx("p", { className: "eyebrow", children: "ACTION PROPOSAL" }), _jsx("h3", { children: action.action.replaceAll("_", " ") }), _jsxs("div", { className: "amount-line", children: [_jsx("span", { children: "Verified amount" }), _jsx("strong", { children: money(action.verifiedAmountInPaise) })] }), _jsxs("div", { className: "amount-line muted", children: [_jsx("span", { children: "Agent proposed" }), _jsx("span", { children: money(action.proposal.proposedAmountInPaise) })] }), _jsxs("div", { className: "reference-line", children: [_jsx("span", { children: "ref" }), _jsx("code", { children: action.referenceId })] })] }), _jsxs("div", { className: "policy-list", children: [_jsx("div", { className: "policy-title", children: "POLICY CHECKS" }), action.policyResult?.checks.map((check) => (_jsxs("div", { className: "policy-row", children: [_jsx("span", { className: `policy-icon ${check.passed ? "pass" : "fail"}`, children: check.passed ? "✓" : "×" }), _jsxs("div", { children: [_jsx("strong", { children: check.name }), _jsx("span", { children: check.message })] })] }, check.name)))] }), payment ? (_jsxs("div", { className: "payment-ready", children: [_jsxs("div", { children: [_jsx("span", { className: "eyebrow", children: "PAYMENT LINK READY" }), _jsx("strong", { children: money(action.verifiedAmountInPaise) })] }), _jsxs("a", { href: payment.paymentLink, target: "_blank", rel: "noreferrer", children: ["Open Razorpay checkout ", _jsx(Icon, { name: "external", size: 14 })] })] })) : action.policyResult?.decision === "ALLOW" ? (_jsxs("button", { className: "approve-button", disabled: busy, onClick: () => void approve(), children: [busy ? "Creating secure payment link…" : "Approve purchase", _jsx(Icon, { name: "arrow", size: 17 })] })) : null] }))] })] }), !!products.length && result?.recommendations?.length ? (_jsxs("div", { className: "recommendations", children: [_jsx("div", { className: "section-label", children: "RECOMMENDED FROM CATALOG" }), _jsx("div", { className: "recommendation-list", children: result.recommendations.map((recommendation) => (_jsxs("div", { className: "recommendation", children: [_jsx("div", { className: "recommendation-icon", children: _jsx(Icon, { name: "box", size: 18 }) }), _jsxs("div", { children: [_jsx("strong", { children: recommendation.name }), _jsxs("span", { children: [money(recommendation.priceInPaise), " \u00B7 ", recommendation.reason] })] })] }, recommendation.productId))) })] })) : null] }));
}
