import type { ApproveActionResponse } from "../types";

interface ApprovalPanelProps {
  actionId: string;
  verifiedAmountInPaise: number;
  isApproving: boolean;
  onApprove: () => void;
  onReject: () => void;
  approvalResult?: ApproveActionResponse;
}

export default function ApprovalPanel({
  actionId,
  verifiedAmountInPaise,
  isApproving,
  onApprove,
  onReject,
  approvalResult,
}: ApprovalPanelProps) {
  const amount = (verifiedAmountInPaise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });

  return (
    <div className="sticky top-4 space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-neutral-500">Action ID</h3>
        <p className="font-mono text-xs text-neutral-900">{actionId}</p>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-neutral-500">Authoritative Amount</h3>
        <p className="text-2xl font-semibold text-neutral-900">{amount}</p>
        <p className="text-xs text-neutral-400">Recalculated from MongoDB — not from AI proposal</p>
      </div>

      {approvalResult ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
          <div className="text-sm font-medium text-green-800">Payment Link Created</div>
          <div className="mt-1 text-xs text-green-600">Status: {approvalResult.status}</div>
        </div>
      ) : (
        <>
          <button
            onClick={onApprove}
            disabled={isApproving}
            className="w-full rounded-lg bg-primary-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isApproving ? "Creating Payment Link..." : "Approve & Create Payment Link"}
          </button>
          <button
            onClick={onReject}
            className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Reject
          </button>
        </>
      )}
    </div>
  );
}
