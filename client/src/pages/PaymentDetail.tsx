import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiPaymentStatus } from "../services/api";
import type { PaymentStatus } from "../types";
import Icon from "../components/Icon";

const money = (p?: number) => p == null ? "—" : `₹${(p / 100).toLocaleString("en-IN")}`;

export default function PaymentDetail() {
  const { orderId } = useParams();
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderId) return;
    apiPaymentStatus(orderId).then(setPayment).catch((e) => setError(e instanceof Error ? e.message : "Payment unavailable."));
  }, [orderId]);

  if (error) return <section className="simple-page"><div className="inline-error page-error"><Icon name="x" size={15} /> {error}</div><Link className="text-link" to="/payments">← Back to payments</Link></section>;
  if (!payment) return <section className="simple-page"><div className="page-loading">Loading payment…</div></section>;

  return (
    <section className="simple-page">
      <div className="simple-head"><div><p className="eyebrow">PAYMENT DETAIL</p><h1>{payment.orderId.slice(-10)}</h1><p>Authoritative state reconciled by AgentShield.</p></div><div className={`payment-status ${payment.status.toLowerCase()}`}><span /> {payment.status.replaceAll("_", " ")}</div></div>
      <div className="detail-surface">
        <div className="detail-amount"><span>AMOUNT</span><strong>{money(payment.amountInPaise)}</strong><small>INR · server verified</small></div>
        <div className="detail-field"><span>ORDER ID</span><code>{payment.orderId}</code></div>
        <div className="detail-field"><span>PAYMENT LINK ID</span><code>{payment.paymentLinkId || "—"}</code></div>
        {payment.paymentLink && <a className="approve-button compact" href={payment.paymentLink} target="_blank" rel="noreferrer">Open Razorpay checkout <Icon name="external" size={15} /></a>}
      </div>
      <Link className="text-link" to="/payments">← Back to payments</Link>
    </section>
  );
}
