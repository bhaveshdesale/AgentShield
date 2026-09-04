import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import type { Action, ActionProposal, PolicyEvaluationResult, OrderStatus } from "../types";
import type { ApproveActionResponse } from "../types";
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
  const [agentMessage, setAgentMessage] = useState<string>("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [action, setAction] = useState<Action | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const { data: agentResult, error: agentError, loading: agentLoading } = useApi<{
    conversationId: string;
    source: "llm" | "fallback";
    message: string;
    recommendations: { productId: string; name: string; priceInPaise: number; reason: string }[];
    proposal: ActionProposal | undefined;
    policyResult: PolicyEvaluationResult | undefined;
  }>(
    {
      fn: () => apiAgentChat(agentMessage, conversationId),
      deps: [agentMessage, conversationId],
    }
  );

  useEffect(() => {
    if (agentResult) {
      setConversationId(agentResult.conversationId);
      setAction(null);
      if (agentResult.proposal && agentResult.policyResult) {
        void (async () => {
          try {
            const validateResponse = await apiValidateAction({
              action: agentResult.proposal?.action || "",
              items: agentResult.proposal?.items.map((item: { productId: string; quantity: number }) => ({
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
              referenceId: agentResult.proposal!.referenceId,
              action: agentResult.proposal!.action,
              proposal: agentResult.proposal!,
              reason: agentResult.proposal!.reason,
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
          } catch (e) {
            showToast(e instanceof Error ? e.message : "Failed to validate proposal", "error");
          }
        })();
      }
    }
  }, [agentResult]);

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
        showToast("Action already processed. Redirecting to approvals...", "info");
        navigate("/approvals");
      } else {
        showToast(error.message || "Failed to create payment link", "error");
      }
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = () => {
    setAction({
      ...action,
      approvalStatus: "REJECTED",
      executionStatus: "BLOCKED",
    } as Action);
    showToast("Action rejected", "info");
  };

  if (agentLoading) {
    return <LoadingState />;
  }

  if (agentError) {
    return <ErrorState error={agentError} />;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Agent Workspace</h1>
      <p className="mt-1 text-neutral-500">Communicate with the commerce agent and review proposals.</p>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">AI Conversation</h2>
          {agentResult ? (
            <div className="space-y-4">
              <AgentMessage chat={agentResult} />
              {agentResult.recommendations.map((rec: { productId: string; name: string; priceInPaise: number; reason: string }) => (
                <div key={rec.productId} className="text-sm border-t border-neutral-100 pt-2">
                  <div className="font-medium text-neutral-900">{rec.name}</div>
                  <div className="text-neutral-600">₹{(rec.priceInPaise / 100).toLocaleString("en-IN")}</div>
                  <div className="text-neutral-500 text-xs mt-1">{rec.reason}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-neutral-400 text-sm">Send a message to start the conversation.</div>
          )}

          <div className="mt-4 flex gap-2">
            <input
              type="text"
              placeholder="Type your request..."
              className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={agentMessage}
              onChange={(e) => setAgentMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agentMessage && !agentLoading && setAgentMessage("")}
            />
            <button
              onClick={() => agentMessage && !agentLoading && setAgentMessage("")}
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50"
              disabled={!agentMessage || agentLoading}
            >
              Send
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <MetricCard title="Agent Status" value="ONLINE" icon={<span>🟢</span>} variant="success" />
          <MetricCard title="Actions Today" value="12" subtitle="3 approved, 2 blocked" variant="default" />
          <MetricCard title="Recovery Queue" value="2" subtitle="Unknown states waiting" variant="warning" />

          <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-neutral-900">Current Action</h3>
            {action ? (
              <div>
                <ActionCard proposal={action.proposal} policyResult={action.policyResult} actionId={action._id} onApprove={handleApprove} isApproving={isApproving} />
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Execution</span>
                    <StatusBadge status={action.executionStatus as OrderStatus} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Approval</span>
                    <StatusBadge status={action.approvalStatus as OrderStatus} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-neutral-400 text-sm py-4">No action in progress. Send a message to start.</div>
            )}
          </div>

          {action && (action.approvalStatus === "PENDING" || action.approvalStatus === "NOT_REQUIRED") && (
            <ApprovalPanel
              actionId={action._id}
              verifiedAmountInPaise={action.verifiedAmountInPaise}
              isApproving={isApproving}
              onApprove={handleApprove}
              onReject={handleReject}
              approvalResult={undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}