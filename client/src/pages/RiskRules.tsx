import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { apiGetMerchant } from "../services/api";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import StatusBadge from "../components/StatusBadge";

export default function RiskRules() {
  const { data: merchant, error: merchantError, loading: merchantLoading, refetch } = useApi<
    { _id: string; name: string; policy: any; createdAt: string; updatedAt: string }
  >(
    { fn: apiGetMerchant, deps: [] }
  );

  if (merchantLoading) {
    return <LoadingState />;
  }

  if (merchantError) {
    return <ErrorState error={merchantError} onRetry={refetch} />;
  }

  if (!merchant) {
    return <div className="text-center py-8 text-neutral-400">Merchant not found</div>;
  }

  const policy = merchant.policy;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Risk & Rules</h1>
      <p className="mt-1 text-neutral-500">Current merchant policy settings.</p>

      <div className="mt-6 bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-neutral-900 mb-3">Merchant</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-neutral-500">Name</p>
            <p className="font-medium text-neutral-900">{merchant.name}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500">Created</p>
            <p className="font-medium text-neutral-900">{new Date(merchant.createdAt).toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-neutral-900 mb-3">Policy</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-neutral-500">Max Transaction Amount</p>
            <p className="font-medium text-neutral-900">₹{(policy.maxTransactionAmount / 100).toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500">Max Discount Percent</p>
            <p className="font-medium text-neutral-900">{policy.maxDiscountPercent}%</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500">Human Approval Required</p>
            <p className="font-medium text-neutral-900">{policy.requireHumanApproval ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500">Allow Refunds</p>
            <p className="font-medium text-neutral-900">{policy.allowRefunds ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500">Allow Payouts</p>
            <p className="font-medium text-neutral-900">{policy.allowPayouts ? "Yes" : "No"}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 bg-neutral-50 rounded-lg border border-neutral-200 p-4">
        <p className="text-sm text-neutral-600">
          These rules are enforced by AgentShield's deterministic policy engine. The AI cannot override them.
        </p>
      </div>
    </div>
  );
}
