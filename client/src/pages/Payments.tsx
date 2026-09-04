import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import {
  apiPaymentHistory,
  apiPaymentStatus,
} from "../services/api";

import type {
  PaymentHistoryItem,
  PaymentStatus,
} from "../types";

import Icon from "../components/Icon";

function money(paise?: number) {
  if (
    typeof paise !== "number" ||
    !Number.isFinite(paise)
  ) {
    return "—";
  }

  return `₹${(paise / 100).toLocaleString(
    "en-IN",
  )}`;
}

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

function statusClass(status?: string) {
  return `payment-status ${
    status
      ? status.toLowerCase()
      : "unknown"
  }`;
}

function displayStatus(status?: string) {
  if (!status) {
    return "UNKNOWN";
  }

  return status.replaceAll("_", " ");
}

export default function Payments() {
  const navigate = useNavigate();

  const [payments, setPayments] = useState<
    PaymentHistoryItem[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [orderId, setOrderId] =
    useState("");

  const [payment, setPayment] =
    useState<PaymentStatus | null>(null);

  const [lookupError, setLookupError] =
    useState("");

  const [lookupLoading, setLookupLoading] =
    useState(false);

  /**
   * Load persisted orders from MongoDB.
   */
  const loadHistory = useCallback(
  async () => {
    setLoading(true);
    setError("");

    try {
      console.log("🔵 Calling payment history API...");

      const result = await apiPaymentHistory();

      console.log(
        "🟢 Payment history API response:",
        result,
      );

      console.log(
        "🟢 Is array:",
        Array.isArray(result),
      );

      console.log(
        "🟢 Number of payments:",
        Array.isArray(result)
          ? result.length
          : "NOT ARRAY",
      );

      if (Array.isArray(result)) {
        setPayments(result);

        console.log(
          "🟢 Payments state updated:",
          result,
        );
      } else {
        setPayments([]);

        throw new Error(
          "Invalid payment history response.",
        );
      }
    } catch (e) {
      console.error(
        "🔴 Payment history error:",
        e,
      );

      setPayments([]);

      setError(
        e instanceof Error
          ? e.message
          : "Payment history could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  },
  [],
);

  /**
   * Load history on page open.
   */
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  /**
   * Look up one order.
   */
  async function lookup() {
    const trimmedOrderId =
      orderId.trim();

    if (!trimmedOrderId) {
      setLookupError(
        "Enter an order ID.",
      );
      setPayment(null);
      return;
    }

    setLookupError("");
    setPayment(null);
    setLookupLoading(true);

    try {
      const result =
        await apiPaymentStatus(
          trimmedOrderId,
        );

      setPayment(result);
    } catch (e) {
      setPayment(null);

      setLookupError(
        e instanceof Error
          ? e.message
          : "Payment could not be found.",
      );
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <section className="simple-page">
      {/* =========================
          PAGE HEADER
      ========================== */}

      <div className="simple-head">
        <div>
          <p className="eyebrow">
            PAYMENTS
          </p>

          <h1>Payment history</h1>

          <p>
            Persisted Razorpay test
            transactions reconciled by
            AgentShield.
          </p>
        </div>

        <div>
          <span className="mode-pill large">
            <span className="mode-dot" />
            Test mode
          </span>
        </div>
      </div>

      {/* =========================
          GLOBAL ERROR
      ========================== */}

      {error && (
        <div className="inline-error page-error">
          <Icon
            name="x"
            size={15}
          />

          <span>{error}</span>

          <button
            type="button"
            onClick={() =>
              void loadHistory()
            }
          >
            Retry
          </button>
        </div>
      )}

      {/* =========================
          ORDER LOOKUP
      ========================== */}

      <div className="lookup-card">
        <div className="lookup-copy">
          <div className="lookup-icon">
            <Icon
              name="card"
              size={21}
            />
          </div>

          <div>
            <strong>
              Look up an order
            </strong>

            <span>
              Check the authoritative
              state of a specific
              AgentShield order.
            </span>
          </div>
        </div>

        <div className="lookup-form">
          <input
            value={orderId}
            onChange={(event) =>
              setOrderId(
                event.target.value,
              )
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter"
              ) {
                void lookup();
              }
            }}
            placeholder="Order ID"
            aria-label="Order ID"
          />

          <button
            type="button"
            onClick={() =>
              void lookup()
            }
            disabled={lookupLoading}
          >
            <Icon
              name="search"
              size={17}
            />

            {lookupLoading
              ? "Checking…"
              : "Check"}
          </button>
        </div>
      </div>

      {/* =========================
          LOOKUP ERROR
      ========================== */}

      {lookupError && (
        <div className="inline-error page-error">
          <Icon
            name="x"
            size={15}
          />

          <span>{lookupError}</span>
        </div>
      )}

      {/* =========================
          LOOKUP RESULT
      ========================== */}

      {payment && (
        <div className="payment-result-card">
          <div className="payment-result-main">
            <span className="eyebrow">
              CURRENT STATE
            </span>

            <div
              className={statusClass(
                payment.status,
              )}
            >
              <span />

              {displayStatus(
                payment.status,
              )}
            </div>

            <strong>
              {money(
                payment.amountInPaise,
              )}
            </strong>
          </div>

          <div className="payment-result-meta">
            <div>
              <span>Order ID</span>

              <code>
                {payment.orderId ||
                  "—"}
              </code>
            </div>

            <div>
              <span>
                Reference ID
              </span>

              <code>
                {payment.referenceId ||
                  "—"}
              </code>
            </div>

            <div>
              <span>
                Payment link
              </span>

              <code>
                {payment.paymentLinkId ||
                  "—"}
              </code>
            </div>

            <div>
              <span>
                Razorpay status
              </span>

              <code>
                {payment.razorpayStatus ||
                  "—"}
              </code>
            </div>

            {payment.paymentLink && (
              <a
                href={
                  payment.paymentLink
                }
                target="_blank"
                rel="noreferrer"
              >
                Open checkout

                <Icon
                  name="external"
                  size={14}
                />
              </a>
            )}

            {payment.orderId && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/payments/${payment.orderId}`,
                  )
                }
              >
                View details

                <Icon
                  name="arrow"
                  size={14}
                />
              </button>
            )}
          </div>
        </div>
      )}

      {/* =========================
          HISTORY HEADER
      ========================== */}

      <div className="simple-head">
        <div>
          <p className="eyebrow">
            PERSISTED ORDERS
          </p>

          <h2>
            Payment history
          </h2>

          <p>
            Loaded directly from the
            AgentShield database.
          </p>
        </div>

        <div>
          {!loading &&
            payments.length > 0 && (
              <span>
                {payments.length}{" "}
                {payments.length === 1
                  ? "payment"
                  : "payments"}
              </span>
            )}
        </div>
      </div>

      {/* =========================
          LOADING
      ========================== */}

      {loading && (
        <div className="page-loading">
          Loading payment history…
        </div>
      )}

      {/* =========================
          EMPTY
      ========================== */}

      {!loading &&
        !error &&
        payments.length === 0 && (
          <div className="page-empty">
            <div>
              <Icon
                name="card"
                size={22}
              />
            </div>

            <strong>
              No payments yet
            </strong>

            <span>
              Create a payment from
              the Agent page and it
              will appear here
              automatically.
            </span>
          </div>
        )}

      {/* =========================
          PAYMENT HISTORY
      ========================== */}

      {!loading &&
        payments.length > 0 && (
          <div className="payment-history-list">
            {payments.map(
              (item) => {
                const firstItem =
                  Array.isArray(
                    item.items,
                  ) &&
                  item.items.length > 0
                    ? item.items[0]
                    : null;

                const itemCount =
                  Array.isArray(
                    item.items,
                  )
                    ? item.items.length
                    : 0;

                return (
                  <button
                    type="button"
                    className="payment-history-card"
                    key={
                      item.orderId
                    }
                    onClick={() =>
                      navigate(
                        `/payments/${item.orderId}`,
                      )
                    }
                  >
                    {/* MAIN */}
                    <div className="payment-history-main">
                      <div>
                        <strong>
                          {firstItem
                            ?.productName ||
                            "Order"}
                        </strong>

                        <span>
                          {itemCount >
                          1
                            ? `${itemCount} items`
                            : firstItem
                              ? `Qty ${firstItem.quantity}`
                              : "No items"}
                        </span>
                      </div>

                      <strong>
                        {money(
                          item.amountInPaise,
                        )}
                      </strong>
                    </div>

                    {/* META */}
                    <div className="payment-history-meta">
                      <span
                        className={statusClass(
                          item.status,
                        )}
                      >
                        <span />

                        {displayStatus(
                          item.status,
                        )}
                      </span>

                      <code>
                        {item.orderId}
                      </code>

                      <span>
                        {formatDate(
                          item.createdAt,
                        )}
                      </span>

                      <Icon
                        name="arrow"
                        size={16}
                      />
                    </div>
                  </button>
                );
              },
            )}
          </div>
        )}
    </section>
  );
}