import type { ActionProposal, PolicyEvaluationResult } from "../types";
import StatusBadge from "./StatusBadge";

interface ActionCardProps {
  proposal: ActionProposal;
  policyResult?: PolicyEvaluationResult | null;
  actionId?: string;
  onApprove?: () => void;
  isApproving?: boolean;
}

export default function ActionCard({ proposal, policyResult, actionId, onApprove, isApproving }: ActionCardProps) {
  const proposedAmount = (proposal.proposedAmountInPaise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });
  const verifiedAmount = policyResult
    ? (policyResult.verifiedAmountInPaise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })
    : "—";

  const amountsMatch = policyResult
    ? proposal.proposedAmountInPaise === policyResult.verifiedAmountInPaise
    : false;

  return (
    <div className="mt-3 max-w-2xl rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-medium text-neutral-400">Agent proposed action</span>
          <div className="mt-1 text-lg font-semibold text-neutral-900">{proposal.action.replace("_", " ")}</div>
        </div>
        {policyResult ? <StatusBadge status="CREATED" /> : <StatusBadge status="NOT_STARTED" />}
      </div>

      <div className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Reference</span>
          <span className="font-mono text-neutral-900">{proposal.referenceId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Items</span>
          <span className="text-neutral-900">{proposal.items.length} item(s)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">AI Proposed Amount</span>
          <span className="font-medium text-neutral-900">{proposedAmount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Server Verified Amount</span>
          <span className={`font-medium ${amountsMatch ? "text-success-700" : "text-neutral-900"}`}>
            {verifiedAmount} {amountsMatch && "✅"}
          </span>
        </div>
        {policyResult && (
          <div className="flex justify-between">
            <span className="text-neutral-500">Policy</span>
            <span className="font-medium text-neutral-900">{policyResult.decision} ✅</span>
          </div>
        )}
        {proposal.requiresApproval && (
          <div className="flex justify-between">
            <span className="text-neutral-500">Approval</span>
            <span className="font-medium text-warning-700">REQUIRED ⚠</span>
          </div>
        )}
      </div>

      {onApprove && (
        <button
          onClick={onApprove}
          disabled={isApproving}
          className="mt-4 w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {isApproving ? "Processing..." : "Review & Approve"}
        </button>
      )}
    </div>
  );
}
