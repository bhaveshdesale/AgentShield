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

import type {
  PaymentStatus,
} from "../types";

import Icon from "../components/Icon";

const money = (paise?: number) => {
  if (paise == null) {
    return "—";
  }

  return `₹${(paise / 100).toLocaleString(
    "en-IN",
  )}`;
};

function formatDate(value?: string) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function PaymentDetail() {
  const { orderId } = useParams();

  const [payment, setPayment] =
    useState<PaymentStatus | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const loadPayment = useCallback(
    async (showLoading = true) => {
      if (!orderId) {
        setError(
          "Order ID is missing.",
        );

        setLoading(false);

        return;
      }

      if (showLoading) {
        setLoading(true);
      }

      setError("");

      try {
        const result =
          await apiPaymentStatus(
            orderId,
          );

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
   * Initial request.
   */
  useEffect(() => {
    void loadPayment(true);
  }, [loadPayment]);

  /*
   * Razorpay can redirect immediately after payment.
   *
   * The backend independently checks Razorpay's
   * authoritative state, so give reconciliation a
   * few attempts before stopping.
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
            await apiPaymentStatus(
              orderId,
            );

          if (cancelled) {
            return;
          }

          setPayment(result);
          setError("");
          setLoading(false);

          /*
           * Once the authoritative order state
           * reaches a terminal payment state,
           * stop polling.
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
           * Only expose the error after the final
           * reconciliation attempt.
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

        await new Promise(
          (resolve) =>
            setTimeout(resolve, 1000),
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
      <section className="simple-page">
        <div className="page-loading">
          Checking payment status…
        </div>
      </section>
    );
  }

  /*
   * Complete failure.
   */
  if (error && !payment) {
    return (
      <section className="simple-page">
        <div className="inline-error page-error">
          <Icon
            name="x"
            size={15}
          />

          {error}
        </div>

        <Link
          className="text-link"
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
      <section className="simple-page">
        <div className="page-empty">
          <div>
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
          className="text-link"
          to="/payments"
        >
          ← Back to payments
        </Link>
      </section>
    );
  }

  const formattedStatus =
    payment.status.replaceAll(
      "_",
      " ",
    );

  return (
    <section className="simple-page">
      {/* HEADER */}
      <div className="simple-head">
        <div>
          <p className="eyebrow">
            PAYMENT DETAIL
          </p>

          <h1>
            {payment.orderId.slice(-10)}
          </h1>

          <p>
            Authoritative payment state
            reconciled by AgentShield.
          </p>
        </div>

        <div
          className={`payment-status ${payment.status.toLowerCase()}`}
        >
          <span />

          {formattedStatus}
        </div>
      </div>

      {/* RECONCILIATION ERROR */}
      {error && (
        <div className="inline-error page-error">
          <Icon
            name="x"
            size={15}
          />

          {error}
        </div>
      )}

      <div className="detail-surface">
        {/* AMOUNT */}
        <div className="detail-amount">
          <span>AMOUNT</span>

          <strong>
            {money(
              payment.amountInPaise,
            )}
          </strong>

          <small>
            {payment.currency} · server verified
          </small>
        </div>

        {/* ITEMS */}
        <div className="detail-field">
          <span>ITEMS</span>

          <div>
            {payment.items.length === 0 ? (
              <span>—</span>
            ) : (
              payment.items.map(
                (item) => (
                  <div
                    key={`${item.productId}-${item.quantity}`}
                    style={{
                      marginBottom:
                        "10px",
                    }}
                  >
                    <strong>
                      {item.productName}
                    </strong>

                    <div>
                      Qty{" "}
                      {item.quantity}{" "}
                      ·{" "}
                      {money(
                        item.unitPriceInPaise,
                      )}{" "}
                      each
                    </div>
                  </div>
                ),
              )
            )}
          </div>
        </div>

        {/* ORDER ID */}
        <div className="detail-field">
          <span>ORDER ID</span>

          <code>
            {payment.orderId}
          </code>
        </div>

        {/* REFERENCE ID */}
        <div className="detail-field">
          <span>REFERENCE ID</span>

          <code>
            {payment.referenceId}
          </code>
        </div>

        {/* PAYMENT LINK ID */}
        <div className="detail-field">
          <span>
            PAYMENT LINK ID
          </span>

          <code>
            {payment.paymentLinkId ||
              "—"}
          </code>
        </div>

        {/* RAZORPAY PAYMENT ID */}
        <div className="detail-field">
          <span>
            RAZORPAY PAYMENT ID
          </span>

          <code>
            {payment.razorpayPaymentId ||
              "—"}
          </code>
        </div>

        {/* RAZORPAY STATUS */}
        <div className="detail-field">
          <span>
            RAZORPAY STATUS
          </span>

          <code>
            {payment.razorpayStatus ||
              "—"}
          </code>
        </div>

        {/* CREATED */}
        <div className="detail-field">
          <span>CREATED</span>

          <code>
            {formatDate(
              payment.createdAt,
            )}
          </code>
        </div>

        {/* UPDATED */}
        <div className="detail-field">
          <span>UPDATED</span>

          <code>
            {formatDate(
              payment.updatedAt,
            )}
          </code>
        </div>

        {/* RAZORPAY CHECKOUT */}
        {payment.paymentLink && (
          <a
            className="approve-button compact"
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

      <Link
        className="text-link"
        to="/payments"
      >
        ← Back to payments
      </Link>
    </section>
  );
}