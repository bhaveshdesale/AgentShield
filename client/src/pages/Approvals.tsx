import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { apiGetActions, apiValidateAction, apiApproveAction, apiReconcilePayment } from "../services/api";
import type { Action, ActionProposal, PolicyEvaluationResult } from "../types";
import ActionCard from "../components/ActionCard";
import ApprovalPanel from "../components/ApprovalPanel";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import StatusBadge from "../components/StatusBadge";
import MetricCard from "../components/MetricCard";
import AgentMessage from "../components/AgentMessage";
import { useToast } from "../hooks/useToast";

export default function Approvals() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [agentMessage, setAgentMessage] = useState<string>("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [action, setAction] = useState<Action | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const { data: actions, error: actionsError, loading: actionsLoading, refetch: refetchActions } = useApi<Action[]>(
    { fn: () => apiGetActions(), deps: [] }
  );

  const handleValidate = async () => {
    if (!action) return;
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
} catch (e) {
       const error = e as Error & { statusCode?: number; code?: string };
       showToast(error.message || "Failed to validate", "error");
     }
  };

  const handleApprove = async () => {
    if (!action) return;
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
} catch (e) {
       const error = e as Error & { statusCode?: number; code?: string };
       if (error.statusCode === 409 && error.code === "DUPLICATE_REFERENCE") {
         showToast("Action already processed. Redirecting to details...", "info");
         navigate(`/actions/${action._id}`);
       } else {
         showToast(error.message || "Failed to create payment link", "error");
       }
    } finally {
      setIsApproving(false);
    }
  };

const handleReject = () => {
     if (!action) return;
     setAction({
       ...action,
       approvalStatus: "REJECTED",
       executionStatus: "BLOCKED",
     });
     showToast("Action rejected", "info");
   };

  const handleReconcile = async (orderId: string) => {
    try {
      await apiReconcilePayment(orderId);
      showToast("Payment reconciled", "success");
      refetchActions();
    } catch (e) {
      const error = e as Error;
      showToast(error.message || "Reconciliation failed", "error");
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Approvals</h1>
      <p className="mt-1 text-neutral-500">Review pending actions and manage approvals.</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard title="Total Actions" value={actions?.length || 0} variant="default" />
        <MetricCard
          title="Awaiting Approval"
          value={actions?.filter((a) => a.approvalStatus === "PENDING").length || 0}
          variant="warning"
        />
        <MetricCard
          title="Approved"
          value={actions?.filter((a) => a.approvalStatus === "APPROVED").length || 0}
          variant="success"
        />
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Pending Actions</h2>
        {actions && actions.length > 0 ? (
          <div className="space-y-4">
            {actions.filter((a) => a.approvalStatus === "PENDING").map((pendingAction) => (
              <div key={pendingAction._id} className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-neutral-900">{pendingAction.action.replace("_", " ")}</div>
                  <div className="flex gap-2">
                    {pendingAction.executionStatus === "NOT_STARTED" && (
                      <button
                        onClick={() => {
                          setAction(pendingAction);
                          handleValidate();
                        }}
                        className="text-sm font-medium text-primary-600 hover:text-primary-700"
                      >
                        Validate
                      </button>
                    )}
                    {pendingAction.executionStatus === "IN_PROGRESS" && (
                      <button
                        onClick={() => {
                          setAction(pendingAction);
                        }}
                        className="text-sm font-medium text-primary-600 hover:text-primary-700"
                      >
                        Continue
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-sm text-neutral-500">
                  Reference: {pendingAction.referenceId} | Conversation: {pendingAction.conversationId}
                </div>
                <div className="mt-2 flex gap-2">
                  <StatusBadge status={pendingAction.executionStatus} />
                  <StatusBadge status={pendingAction.approvalStatus} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-neutral-400">
            <p>No actions awaiting approval</p>
          </div>
        )}
      </div>

      {action && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">Selected Action Details</h2>
          <ActionCard proposal={action.proposal} policyResult={action.policyResult} actionId={action._id} onApprove={handleApprove} isApproving={isApproving} />
          <ApprovalPanel
            actionId={action._id}
            verifiedAmountInPaise={action.verifiedAmountInPaise}
            isApproving={isApproving}
            onApprove={handleApprove}
            onReject={handleReject}
            approvalResult={undefined}
          />
        </div>
      )}
    </div>
  );
}
