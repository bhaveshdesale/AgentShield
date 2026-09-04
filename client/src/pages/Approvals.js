import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { apiGetActions, apiValidateAction, apiApproveAction, apiReconcilePayment } from "../services/api";
import ActionCard from "../components/ActionCard";
import ApprovalPanel from "../components/ApprovalPanel";
import StatusBadge from "../components/StatusBadge";
import MetricCard from "../components/MetricCard";
import { useToast } from "../hooks/useToast";
export default function Approvals() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [agentMessage, setAgentMessage] = useState("");
    const [conversationId, setConversationId] = useState();
    const [action, setAction] = useState(null);
    const [isApproving, setIsApproving] = useState(false);
    const { data: actions, error: actionsError, loading: actionsLoading, refetch: refetchActions } = useApi({ fn: () => apiGetActions(), deps: [] });
    const handleValidate = async () => {
        if (!action)
            return;
        try {
            const validateResponse = await apiValidateAction({
                action: action.action,
                items: action.proposal.items.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                })),
                proposedAmountInPaise: action.proposal.proposedAmountInPaise,
                reason: action.proposal.reason,
                requiresApproval: action.proposal.requiresApproval,
                referenceId: action.referenceId,
                conversationId,
                discountPercent: action.proposal.discountPercent,
            });
            setAction({
                ...action,
                _id: validateResponse.actionId,
                policyResult: {
                    decision: validateResponse.decision,
                    reason: validateResponse.reason,
                    checks: validateResponse.checks,
                    verifiedAmountInPaise: validateResponse.verifiedAmountInPaise,
                    approvalRequired: validateResponse.approvalRequired,
                },
                verifiedAmountInPaise: validateResponse.verifiedAmountInPaise,
                approvalRequired: validateResponse.approvalRequired,
            });
        }
        catch (e) {
            const error = e;
            showToast(error.message || "Failed to validate", "error");
        }
    };
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
                showToast("Action already processed. Redirecting to details...", "info");
                navigate(`/actions/${action._id}`);
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
        if (!action)
            return;
        setAction({
            ...action,
            approvalStatus: "REJECTED",
            executionStatus: "BLOCKED",
        });
        showToast("Action rejected", "info");
    };
    const handleReconcile = async (orderId) => {
        try {
            await apiReconcilePayment(orderId);
            showToast("Payment reconciled", "success");
            refetchActions();
        }
        catch (e) {
            const error = e;
            showToast(error.message || "Reconciliation failed", "error");
        }
    };
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-semibold text-neutral-900", children: "Approvals" }), _jsx("p", { className: "mt-1 text-neutral-500", children: "Review pending actions and manage approvals." }), _jsxs("div", { className: "mt-6 grid grid-cols-1 md:grid-cols-3 gap-4", children: [_jsx(MetricCard, { title: "Total Actions", value: actions?.length || 0, variant: "default" }), _jsx(MetricCard, { title: "Awaiting Approval", value: actions?.filter((a) => a.approvalStatus === "PENDING").length || 0, variant: "warning" }), _jsx(MetricCard, { title: "Approved", value: actions?.filter((a) => a.approvalStatus === "APPROVED").length || 0, variant: "success" })] }), _jsxs("div", { className: "mt-8", children: [_jsx("h2", { className: "text-lg font-semibold text-neutral-900 mb-3", children: "Pending Actions" }), actions && actions.length > 0 ? (_jsx("div", { className: "space-y-4", children: actions.filter((a) => a.approvalStatus === "PENDING").map((pendingAction) => (_jsxs("div", { className: "bg-white rounded-lg border border-neutral-200 p-4 shadow-sm", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("div", { className: "font-medium text-neutral-900", children: pendingAction.action.replace("_", " ") }), _jsxs("div", { className: "flex gap-2", children: [pendingAction.executionStatus === "NOT_STARTED" && (_jsx("button", { onClick: () => {
                                                        setAction(pendingAction);
                                                        handleValidate();
                                                    }, className: "text-sm font-medium text-primary-600 hover:text-primary-700", children: "Validate" })), pendingAction.executionStatus === "IN_PROGRESS" && (_jsx("button", { onClick: () => {
                                                        setAction(pendingAction);
                                                    }, className: "text-sm font-medium text-primary-600 hover:text-primary-700", children: "Continue" }))] })] }), _jsxs("div", { className: "text-sm text-neutral-500", children: ["Reference: ", pendingAction.referenceId, " | Conversation: ", pendingAction.conversationId] }), _jsxs("div", { className: "mt-2 flex gap-2", children: [_jsx(StatusBadge, { status: pendingAction.executionStatus }), _jsx(StatusBadge, { status: pendingAction.approvalStatus })] })] }, pendingAction._id))) })) : (_jsx("div", { className: "text-center py-8 text-neutral-400", children: _jsx("p", { children: "No actions awaiting approval" }) }))] }), action && (_jsxs("div", { className: "mt-8", children: [_jsx("h2", { className: "text-lg font-semibold text-neutral-900 mb-3", children: "Selected Action Details" }), _jsx(ActionCard, { proposal: action.proposal, policyResult: action.policyResult, actionId: action._id, onApprove: handleApprove, isApproving: isApproving }), _jsx(ApprovalPanel, { actionId: action._id, verifiedAmountInPaise: action.verifiedAmountInPaise, isApproving: isApproving, onApprove: handleApprove, onReject: handleReject, approvalResult: undefined })] }))] }));
}
