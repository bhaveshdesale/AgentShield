import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { apiAgentChat, apiValidateAction, apiApproveAction } from "../services/api";
import AgentMessage from "../components/AgentMessage";
import ActionCard from "../components/ActionCard";
import ApprovalPanel from "../components/ApprovalPanel";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import StatusBadge from "../components/StatusBadge";
import MetricCard from "../components/MetricCard";
import { useToast } from "../hooks/useToast";
export default function AgentWorkspace() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [agentMessage, setAgentMessage] = useState("");
    const [conversationId, setConversationId] = useState();
    const [action, setAction] = useState(null);
    const [isApproving, setIsApproving] = useState(false);
    const { data: agentResult, error: agentError, loading: agentLoading } = useApi({
        fn: () => apiAgentChat(agentMessage, conversationId),
        deps: [agentMessage, conversationId],
    });
    useEffect(() => {
        if (agentResult) {
            setConversationId(agentResult.conversationId);
            setAction(null);
            if (agentResult.proposal && agentResult.policyResult) {
                void (async () => {
                    try {
                        const validateResponse = await apiValidateAction({
                            action: agentResult.proposal?.action || "",
                            items: agentResult.proposal?.items.map((item) => ({
                                productId: item.productId,
                                quantity: item.quantity,
                            })) || [],
                            proposedAmountInPaise: agentResult.proposal?.proposedAmountInPaise || 0,
                            reason: agentResult.proposal?.reason || "",
                            requiresApproval: agentResult.proposal?.requiresApproval || true,
                            referenceId: agentResult.proposal?.referenceId || "",
                            conversationId: conversationId,
                            discountPercent: agentResult.proposal?.discountPercent,
                        });
                        setAction({
                            _id: validateResponse.actionId,
                            conversationId: agentResult.conversationId,
                            referenceId: agentResult.proposal.referenceId,
                            action: agentResult.proposal.action,
                            proposal: agentResult.proposal,
                            reason: agentResult.proposal.reason,
                            policyResult: {
                                decision: agentResult.policyResult?.decision || "ALLOW",
                                checks: agentResult.policyResult?.checks || [],
                                reason: agentResult.policyResult?.reason || "",
                                verifiedAmountInPaise: agentResult.policyResult?.verifiedAmountInPaise || 0,
                                approvalRequired: agentResult.policyResult?.approvalRequired || false,
                            },
                            verifiedAmountInPaise: agentResult.policyResult?.verifiedAmountInPaise || 0,
                            approvalRequired: agentResult.policyResult?.approvalRequired || false,
                            discountPercent: agentResult.proposal?.discountPercent,
                            approvalStatus: "PENDING",
                            executionStatus: "NOT_STARTED",
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        });
                    }
                    catch (e) {
                        showToast(e instanceof Error ? e.message : "Failed to validate proposal", "error");
                    }
                })();
            }
        }
    }, [agentResult]);
    const handleApprove = async () => {
        if (!action)
            return;
        setIsApproving(true);
        try {
            const result = await apiApproveAction(action._id);
            setAction({
                ...action,
                approvalStatus: "APPROVED",
                executionStatus: "IN_PROGRESS",
            });
            showToast("Payment link created successfully", "success");
            navigate(`/payments/${result.orderId}`);
        }
        catch (e) {
            const error = e;
            if (error.statusCode === 409 && error.code === "DUPLICATE_REFERENCE") {
                showToast("Action already processed. Redirecting to approvals...", "info");
                navigate("/approvals");
            }
            else {
                showToast(error.message || "Failed to create payment link", "error");
            }
        }
        finally {
            setIsApproving(false);
        }
    };
    const handleReject = () => {
        setAction({
            ...action,
            approvalStatus: "REJECTED",
            executionStatus: "BLOCKED",
        });
        showToast("Action rejected", "info");
    };
    if (agentLoading) {
        return _jsx(LoadingState, {});
    }
    if (agentError) {
        return _jsx(ErrorState, { error: agentError });
    }
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-semibold text-neutral-900", children: "Agent Workspace" }), _jsx("p", { className: "mt-1 text-neutral-500", children: "Communicate with the commerce agent and review proposals." }), _jsxs("div", { className: "mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6", children: [_jsxs("div", { className: "bg-white rounded-lg border border-neutral-200 p-4 shadow-sm", children: [_jsx("h2", { className: "text-lg font-semibold text-neutral-900 mb-3", children: "AI Conversation" }), agentResult ? (_jsxs("div", { className: "space-y-4", children: [_jsx(AgentMessage, { chat: agentResult }), agentResult.recommendations.map((rec) => (_jsxs("div", { className: "text-sm border-t border-neutral-100 pt-2", children: [_jsx("div", { className: "font-medium text-neutral-900", children: rec.name }), _jsxs("div", { className: "text-neutral-600", children: ["\u20B9", (rec.priceInPaise / 100).toLocaleString("en-IN")] }), _jsx("div", { className: "text-neutral-500 text-xs mt-1", children: rec.reason })] }, rec.productId)))] })) : (_jsx("div", { className: "text-neutral-400 text-sm", children: "Send a message to start the conversation." })), _jsxs("div", { className: "mt-4 flex gap-2", children: [_jsx("input", { type: "text", placeholder: "Type your request...", className: "flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500", value: agentMessage, onChange: (e) => setAgentMessage(e.target.value), onKeyDown: (e) => e.key === "Enter" && agentMessage && !agentLoading && setAgentMessage("") }), _jsx("button", { onClick: () => agentMessage && !agentLoading && setAgentMessage(""), className: "px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50", disabled: !agentMessage || agentLoading, children: "Send" })] })] }), _jsxs("div", { className: "space-y-4", children: [_jsx(MetricCard, { title: "Agent Status", value: "ONLINE", icon: _jsx("span", { children: "\uD83D\uDFE2" }), variant: "success" }), _jsx(MetricCard, { title: "Actions Today", value: "12", subtitle: "3 approved, 2 blocked", variant: "default" }), _jsx(MetricCard, { title: "Recovery Queue", value: "2", subtitle: "Unknown states waiting", variant: "warning" }), _jsxs("div", { className: "bg-white rounded-lg border border-neutral-200 p-4 shadow-sm", children: [_jsx("h3", { className: "text-lg font-semibold text-neutral-900", children: "Current Action" }), action ? (_jsxs("div", { children: [_jsx(ActionCard, { proposal: action.proposal, policyResult: action.policyResult, actionId: action._id, onApprove: handleApprove, isApproving: isApproving }), _jsxs("div", { className: "mt-4 space-y-2 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-neutral-500", children: "Execution" }), _jsx(StatusBadge, { status: action.executionStatus })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-neutral-500", children: "Approval" }), _jsx(StatusBadge, { status: action.approvalStatus })] })] })] })) : (_jsx("div", { className: "text-neutral-400 text-sm py-4", children: "No action in progress. Send a message to start." }))] }), action && (action.approvalStatus === "PENDING" || action.approvalStatus === "NOT_REQUIRED") && (_jsx(ApprovalPanel, { actionId: action._id, verifiedAmountInPaise: action.verifiedAmountInPaise, isApproving: isApproving, onApprove: handleApprove, onReject: handleReject, approvalResult: undefined }))] })] })] }));
}
