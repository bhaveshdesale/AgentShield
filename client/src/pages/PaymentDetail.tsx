import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Link,
  useParams,
} from "react-router-dom";

import {
  apiPaymentStatus,
} from "../services/api";
import {
  displayStatus,
  statusClass,
} from "../utils/payment-display";

import type {
  PaymentStatus,
} from "../types";

import Icon from "../components/Icon";
import PaymentDetailOverview from "../components/payments/PaymentDetailOverview";
import PaymentDetailReconciliation from "../components/payments/PaymentDetailReconciliation";

import "../payment-pages.css";

export default function PaymentDetail() {
  const { orderId } = useParams();

  const [payment, setPayment] =
    useState<PaymentStatus | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  /*
   * Load authoritative payment state.
   */
  const loadPayment = useCallback(
    async (showLoading = true) => {
      if (!orderId) {
        setError("Order ID is missing.");
        setLoading(false);
        return;
      }

      if (showLoading) {
        setLoading(true);
      }

      setError("");

      try {
        const result =
          await apiPaymentStatus(orderId);

        setPayment(result);
      } catch (e) {
        setPayment(null);

        setError(
          e instanceof Error
            ? e.message
            : "Payment status could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [orderId],
  );

  /*
   * Initial payment lookup.
   */
  useEffect(() => {
    void loadPayment(true);
  }, [loadPayment]);

  /*
   * Short reconciliation window.
   *
   * Useful when Razorpay redirects immediately
   * after a payment and the webhook has not yet
   * updated the local order.
   */
  useEffect(() => {
    if (!orderId) {
      return;
    }

    let cancelled = false;

    const reconcile = async () => {
      for (
        let attempt = 0;
        attempt < 5;
        attempt += 1
      ) {
        if (cancelled) {
          return;
        }

        try {
          const result =
            await apiPaymentStatus(orderId);

          if (cancelled) {
            return;
          }

          setPayment(result);
          setError("");
          setLoading(false);

          /*
           * PAID and FAILED are terminal states.
           */
          if (
            result.status === "PAID" ||
            result.status === "FAILED"
          ) {
            return;
          }
        } catch (e) {
          if (cancelled) {
            return;
          }

          /*
           * Don't immediately replace a valid
           * payment with an error.
           */
          if (attempt === 4) {
            setError(
              e instanceof Error
                ? e.message
                : "Payment status could not be loaded.",
            );

            setLoading(false);
          }
        }

        await new Promise<void>(
          (resolve) => {
            setTimeout(resolve, 1000);
          },
        );
      }
    };

    void reconcile();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  /*
   * Loading state.
   */
  if (loading && !payment) {
    return (
      <section className="payment-detail-page">
        <div className="payment-page-loading">
          <div className="payment-loading-spinner" />

          <strong>
            Checking payment status
          </strong>

          <span>
            AgentShield is verifying the
            authoritative order state.
          </span>
        </div>
      </section>
    );
  }

  /*
   * Complete failure.
   */
  if (error && !payment) {
    return (
      <section className="payment-detail-page">
        <div className="payment-detail-error">
          <div className="payment-error-icon">
            <Icon
              name="x"
              size={18}
            />
          </div>

          <div>
            <strong>
              Unable to load payment
            </strong>

            <span>
              {error}
            </span>
          </div>
        </div>

        <Link
          className="payment-back-link"
          to="/payments"
        >
          ← Back to payments
        </Link>
      </section>
    );
  }

  /*
   * No payment returned.
   */
  if (!payment) {
    return (
      <section className="payment-detail-page">
        <div className="payment-page-empty">
          <div className="payment-empty-icon">
            <Icon
              name="card"
              size={22}
            />
          </div>

          <strong>
            Payment not found
          </strong>

          <span>
            AgentShield could not find
            this payment order.
          </span>
        </div>

        <Link
          className="payment-back-link"
          to="/payments"
        >
          ← Back to payments
        </Link>
      </section>
    );
  }

  const formattedStatus =
    displayStatus(payment.status);

  return (
    <section className="payment-detail-page">

      {/* =================================================
          HEADER
      ================================================== */}

      <div className="payment-detail-header">

        <div className="payment-detail-header-copy">

          <Link
            className="payment-back-link top-back"
            to="/payments"
          >
            ← Payments
          </Link>

          <p className="eyebrow">
            PAYMENT DETAIL
          </p>

          <h1>
            Order {payment.orderId.slice(-10)}
          </h1>

          <p>
            Authoritative payment state
            reconciled by AgentShield.
          </p>

        </div>

        <div
          className={statusClass(
            payment.status,
          )}
        >
          <span />

          {formattedStatus}
        </div>

      </div>

      {/* =================================================
          RECONCILIATION NOTICE
      ================================================== */}

      {error && (
        <div className="payment-detail-notice">
          <Icon
            name="x"
            size={15}
          />

          <span>
            {error}
          </span>
        </div>
      )}

      {/* =================================================
          MAIN DETAIL CARD
      ================================================== */}

      <div className="payment-detail-surface">

        <PaymentDetailOverview payment={payment} />
        <PaymentDetailReconciliation
          payment={payment}
          formattedStatus={formattedStatus}
        />

        {/* -----------------------------------------------
            ACTIONS
        ------------------------------------------------ */}

        <div className="payment-detail-actions">

          <Link
            className="payment-back-link"
            to="/payments"
          >
            ← Back to payment history
          </Link>

          {payment.paymentLink && (
            <a
              className="payment-checkout-button"
              href={payment.paymentLink}
              target="_blank"
              rel="noreferrer"
            >
              Open Razorpay checkout

              <Icon
                name="external"
                size={15}
              />
            </a>
          )}

        </div>

      </div>

    </section>
  );
}