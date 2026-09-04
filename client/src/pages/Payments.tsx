import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPaymentStatus } from "../services/api";
import type { PaymentStatus } from "../types";
import Icon from "../components/Icon";

const money = (p?: number) => p == null ? "—" : `₹${(p / 100).toLocaleString("en-IN")}`;

export default function Payments() {
  const [orderId, setOrderId] = useState("");
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function lookup() {
    if (!orderId.trim()) return;
    setError("");
    try {
      const result = await apiPaymentStatus(orderId.trim());
      setPayment(result);
    } catch (e) {
      setPayment(null);
      setError(e instanceof Error ? e.message : "Payment could not be found.");
    }
  }

  return (
    <section className="simple-page">
      <div className="simple-head">
        <div><p className="eyebrow">PAYMENTS</p><h1>Payment status</h1><p>Check the authoritative status of a Razorpay test payment.</p></div>
        <span className="mode-pill large"><span className="mode-dot" /> Test mode</span>
      </div>

      <div className="lookup-card">
        <div className="lookup-copy"><div className="lookup-icon"><Icon name="card" size={21} /></div><div><strong>Look up an order</strong><span>Use the order ID returned after AgentShield creates a payment link.</span></div></div>
        <div className="lookup-form"><input value={orderId} onChange={(e) => setOrderId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void lookup()} placeholder="Order ID" /><button onClick={() => void lookup()}><Icon name="search" size={17} /> Check</button></div>
      </div>

      {error && <div className="inline-error page-error"><Icon name="x" size={15} /> {error}</div>}
      {payment && (
        <div className="payment-result-card">
          <div className="payment-result-main"><span className="eyebrow">CURRENT STATE</span><div className={`payment-status ${payment.status.toLowerCase()}`}><span /> {payment.status.replaceAll("_", " ")}</div><strong>{money(payment.amountInPaise)}</strong></div>
          <div className="payment-result-meta"><div><span>Order ID</span><code>{payment.orderId}</code></div><div><span>Payment link</span><code>{payment.paymentLinkId || "—"}</code></div>{payment.paymentLink && <a href={payment.paymentLink} target="_blank" rel="noreferrer">Open checkout <Icon name="external" size={14} /></a>}<button onClick={() => navigate(`/payments/${payment.orderId}`)}>View details <Icon name="arrow" size={14} /></button></div>
        </div>
      )}

      {!payment && !error && <div className="page-empty"><div><Icon name="card" size={22} /></div><strong>No payment selected</strong><span>Create a payment from the Agent page, then paste its order ID here.</span></div>}
    </section>
  );
}
