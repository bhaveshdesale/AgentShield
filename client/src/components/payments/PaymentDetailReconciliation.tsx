import type { PaymentStatus } from "../../types";
import { formatDate, statusClass } from "../../utils/payment-display";

export default function PaymentDetailReconciliation({
  payment,
  formattedStatus,
}: {
  payment: PaymentStatus;
  formattedStatus: string;
}) {
  return (
    <>
      <div className="payment-detail-section">
        <div className="payment-section-heading">
          <span>TRANSACTION IDENTIFIERS</span>
        </div>

        <div className="payment-detail-fields">
          <div className="payment-detail-field">
            <span>ORDER ID</span>
            <code>{payment.orderId}</code>
          </div>

          <div className="payment-detail-field">
            <span>REFERENCE ID</span>
            <code>{payment.referenceId || "—"}</code>
          </div>

          <div className="payment-detail-field">
            <span>PAYMENT LINK ID</span>
            <code>{payment.paymentLinkId || "—"}</code>
          </div>

          <div className="payment-detail-field">
            <span>RAZORPAY PAYMENT ID</span>
            <code>{payment.razorpayPaymentId || "—"}</code>
          </div>
        </div>
      </div>

      <div className="payment-detail-section">
        <div className="payment-section-heading">
          <span>RECONCILIATION</span>
        </div>

        <div className="payment-detail-fields">
          <div className="payment-detail-field">
            <span>AGENTSHIELD STATUS</span>
            <div className={statusClass(payment.status)}>
              <span />
              {formattedStatus}
            </div>
          </div>

          <div className="payment-detail-field">
            <span>RAZORPAY STATUS</span>
            <code>{payment.razorpayStatus || "—"}</code>
          </div>

          <div className="payment-detail-field">
            <span>CREATED</span>
            <code>{formatDate(payment.createdAt)}</code>
          </div>

          <div className="payment-detail-field">
            <span>LAST UPDATED</span>
            <code>{formatDate(payment.updatedAt)}</code>
          </div>
        </div>
      </div>
    </>
  );
}
