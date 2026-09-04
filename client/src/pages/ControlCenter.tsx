import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import type { Action } from "../types";
import { apiGetActions } from "../services/api";
import ActionCard from "../components/ActionCard";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import StatusBadge from "../components/StatusBadge";

export default function ControlCenter() {
  const navigate = useNavigate();
  const { data: actions, error: actionsError, loading: actionsLoading, refetch } = useApi<Action[]>(
    { fn: apiGetActions, deps: [] }
  );

  if (actionsLoading) {
    return <LoadingState />;
  }

  if (actionsError) {
    return <ErrorState error={actionsError} onRetry={refetch} />;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Control Center</h1>
      <p className="mt-1 text-neutral-500">Overview of agent actions and approvals.</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
          <h3 className="text-sm font-medium text-neutral-500">Total Actions</h3>
          <p className="text-2xl font-semibold text-neutral-900 mt-1">{actions?.length || 0}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
          <h3 className="text-sm font-medium text-neutral-500">Awaiting Approval</h3>
          <p className="text-2xl font-semibold text-warning-600 mt-1">
            {actions?.filter((a) => a.approvalStatus === "PENDING").length || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
          <h3 className="text-sm font-medium text-neutral-500">Recovered</h3>
          <p className="text-2xl font-semibold text-success-600 mt-1">
            {actions?.filter((a) => a.executionStatus === "RECOVERED").length || 0}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Recent Activity</h2>
        {actions && actions.length > 0 ? (
          <div className="space-y-3">
            {actions.map((action) => (
              <div
                key={action._id}
                className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm hover:bg-neutral-50 cursor-pointer transition-colors"
                onClick={() => navigate(`/actions/${action._id}`)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-neutral-900">{action.action.replace("_", " ")}</div>
                  <StatusBadge status={action.executionStatus} />
                </div>
                <div className="text-sm text-neutral-500 flex gap-4">
                  <span>Reference: {action.referenceId}</span>
                  <span>Conversation: {action.conversationId}</span>
                  <span>Created: {new Date(action.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  {action.approvalStatus === "PENDING" && <StatusBadge status="PENDING" />}
                  {action.approvalStatus === "APPROVED" && <StatusBadge status="APPROVED" />}
                  {action.approvalStatus === "REJECTED" && <StatusBadge status="REJECTED" />}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-neutral-400">
            <p>No actions yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
