import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import type { Order } from "../types";
import { apiGetOrders, apiReconcilePayment } from "../services/api";
import MetricCard from "../components/MetricCard";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../hooks/useToast";

export default function Payments() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: orders, error: ordersError, loading: ordersLoading, refetch } = useApi<Order[]>(
    { fn: apiGetOrders, deps: [] }
  );

  const handleReconcile = async (orderId: string) => {
    try {
      const result = await apiReconcilePayment(orderId);
      showToast(`Payment reconciled: ${result.status}`, "success");
      refetch();
    } catch (e) {
      const error = e as Error;
      showToast(error.message || "Reconciliation failed", "error");
    }
  };

  if (ordersLoading) {
    return <LoadingState />;
  }

  if (ordersError) {
    return <ErrorState error={ordersError} onRetry={refetch} />;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Payments</h1>
      <p className="mt-1 text-neutral-500">Monitor and manage payment execution and recovery.</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Total Orders" value={orders?.length || 0} variant="default" />
        <MetricCard
          title="Awaiting Payment"
          value={orders?.filter((o) => o.status === "AWAITING_PAYMENT").length || 0}
          variant="warning"
        />
        <MetricCard
          title="Paid"
          value={orders?.filter((o) => o.status === "PAID").length || 0}
          variant="success"
        />
        <MetricCard
          title="Unknown"
          value={orders?.filter((o) => o.status === "UNKNOWN").length || 0}
          variant="neutral"
        />
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Payment Orders</h2>
        {orders && orders.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th className="px-4 py-2 text-left font-medium text-neutral-500">Reference</th>
                  <th className="px-4 py-2 text-left font-medium text-neutral-500">Amount</th>
                  <th className="px-4 py-2 text-left font-medium text-neutral-500">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-neutral-500">Updated</th>
                  <th className="px-4 py-2 text-left font-medium text-neutral-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order._id} className="border-b border-neutral-200 last:border-0 hover:bg-neutral-50">
                    <td className="px-4 py-2 font-mono text-neutral-900">{order.referenceId}</td>
                    <td className="px-4 py-2 text-neutral-900">₹{(order.amountInPaise / 100).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-2 text-neutral-500">{new Date(order.updatedAt).toLocaleString()}</td>
                    <td className="px-4 py-2">
                      {order.status === "UNKNOWN" && (
                        <button
                          onClick={() => handleReconcile(order._id)}
                          className="text-sm font-medium text-primary-600 hover:text-primary-700"
                        >
                          Reconcile
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-neutral-400">
            <p>No payment orders yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
