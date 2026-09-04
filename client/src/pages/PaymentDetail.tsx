import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import type { Order } from "../types";
import { apiGetOrderById } from "../services/api";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import StatusBadge from "../components/StatusBadge";

export default function PaymentDetail() {
  const { orderId } = useParams<{ orderId: string }>();

  const { data: order, error, loading, refetch } = useApi<Order>(
    { fn: () => apiGetOrderById(orderId || ""), deps: [orderId] }
  );

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={refetch} />;
  }

  if (!order) {
    return <div className="text-center py-8 text-neutral-400">Order not found</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Payment Details</h1>
      <p className="mt-1 text-neutral-500">Order reference: {order.referenceId}</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
          <h3 className="text-sm font-medium text-neutral-500">Amount</h3>
          <p className="text-xl font-semibold text-neutral-900 mt-1">₹{(order.amountInPaise / 100).toLocaleString("en-IN")}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
          <h3 className="text-sm font-medium text-neutral-500">Status</h3>
          <div className="mt-1">
            <StatusBadge status={order.status} />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
          <h3 className="text-sm font-medium text-neutral-500">Currency</h3>
          <p className="text-neutral-900 mt-1">{order.currency}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
          <h3 className="text-sm font-medium text-neutral-500">Last Updated</h3>
          <p className="text-neutral-900 mt-1">{new Date(order.updatedAt).toLocaleString()}</p>
        </div>
      </div>

      {order.razorpayPaymentLinkId && (
        <div className="mt-6 bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
          <h3 className="text-sm font-medium text-neutral-500">Razorpay Payment Link</h3>
          <div className="mt-2 space-y-1">
            <div className="text-sm">
              <span className="text-neutral-500">ID:</span> {order.razorpayPaymentLinkId}
            </div>
            <div className="text-sm">
              <span className="text-neutral-500">URL:</span>
              <a href={order.razorpayPaymentLinkUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline ml-1">
                {order.razorpayPaymentLinkUrl}
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-lg font-semibold text-neutral-900">Order Items</h3>
        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-4 py-2 text-left font-medium text-neutral-500">Product</th>
                <th className="px-4 py-2 text-left font-medium text-neutral-500">Quantity</th>
                <th className="px-4 py-2 text-left font-medium text-neutral-500">Unit Price</th>
                <th className="px-4 py-2 text-left font-medium text-neutral-500">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, i) => (
                <tr key={i} className="border-b border-neutral-200 last:border-0">
                  <td className="px-4 py-2 text-neutral-900">Product ID: {item.productId}</td>
                  <td className="px-4 py-2 text-neutral-900">{item.quantity}</td>
                  <td className="px-4 py-2 text-neutral-900">₹{(item.unitPriceInPaise / 100).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2 font-medium text-neutral-900">₹{((item.unitPriceInPaise * item.quantity) / 100).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
