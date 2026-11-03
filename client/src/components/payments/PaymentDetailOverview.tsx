import type { PaymentStatus } from "../../types";
import { money } from "../../utils/payment-display";
import Icon from "../Icon";

export default function PaymentDetailOverview({
  payment,
}: {
  payment: PaymentStatus;
}) {
  const items = Array.isArray(payment.items) ? payment.items : [];

  return (
    <>
      <div className="payment-detail-hero">
        <div>
          <span className="payment-detail-amount-label">
            TOTAL PAYMENT
          </span>

          <div className="payment-detail-amount">
            {money(payment.amountInPaise)}
          </div>

          <div className="payment-detail-currency">
            {payment.currency || "INR"}
            {" · "}
            server verified
          </div>
        </div>

        <div className="payment-verification">
          <div className="payment-verification-icon">
            <Icon name="shield" size={18} />
          </div>

          <div>
            <strong>AgentShield verified</strong>
            <span>Server-authoritative order state</span>
          </div>
        </div>
      </div>

      <div className="payment-detail-items">
        <div className="payment-section-heading">
          <span>ORDER ITEMS</span>
          <small>
            {items.length} {items.length === 1 ? "item" : "items"}
          </small>
        </div>

        {items.length === 0 ? (
          <div className="payment-no-items">
            No item information was recorded for this order.
          </div>
        ) : (
          <div className="payment-items-list">
            {items.map((item, index) => (
              <div
                className="payment-detail-item"
                key={`${item.productId || "item"}-${index}`}
              >
                <div className="payment-item-number">
                  {String(index + 1).padStart(2, "0")}
                </div>

                <div className="payment-item-info">
                  <strong>{item.productName || "Product"}</strong>
                  <span>Quantity {item.quantity || 0}</span>
                </div>

                <div className="payment-item-price">
                  {money(item.unitPriceInPaise)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
