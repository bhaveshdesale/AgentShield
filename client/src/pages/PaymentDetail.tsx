// import {
//   useCallback,
//   useEffect,
//   useState,
// } from "react";

// import {
//   Link,
//   useParams,
// } from "react-router-dom";

// import {
//   apiPaymentStatus,
// } from "../services/api";

// import type {
//   PaymentStatus,
// } from "../types";

// import Icon from "../components/Icon";

// const money = (paise?: number) => {
//   if (paise == null) {
//     return "—";
//   }

//   return `₹${(paise / 100).toLocaleString(
//     "en-IN",
//   )}`;
// };

// function formatDate(value?: string) {
//   if (!value) {
//     return "—";
//   }

//   const date = new Date(value);

//   if (Number.isNaN(date.getTime())) {
//     return "—";
//   }

//   return date.toLocaleString("en-IN", {
//     dateStyle: "medium",
//     timeStyle: "short",
//   });
// }

// export default function PaymentDetail() {
//   const { orderId } = useParams();

//   const [payment, setPayment] =
//     useState<PaymentStatus | null>(null);

//   const [loading, setLoading] =
//     useState(true);

//   const [error, setError] =
//     useState("");

//   const loadPayment = useCallback(
//     async (showLoading = true) => {
//       if (!orderId) {
//         setError(
//           "Order ID is missing.",
//         );

//         setLoading(false);

//         return;
//       }

//       if (showLoading) {
//         setLoading(true);
//       }

//       setError("");

//       try {
//         const result =
//           await apiPaymentStatus(
//             orderId,
//           );

//         setPayment(result);
//       } catch (e) {
//         setPayment(null);

//         setError(
//           e instanceof Error
//             ? e.message
//             : "Payment status could not be loaded.",
//         );
//       } finally {
//         setLoading(false);
//       }
//     },
//     [orderId],
//   );

//   /*
//    * Initial request.
//    */
//   useEffect(() => {
//     void loadPayment(true);
//   }, [loadPayment]);

//   /*
//    * Razorpay can redirect immediately after payment.
//    *
//    * The backend independently checks Razorpay's
//    * authoritative state, so give reconciliation a
//    * few attempts before stopping.
//    */
//   useEffect(() => {
//     if (!orderId) {
//       return;
//     }

//     let cancelled = false;

//     const reconcile = async () => {
//       for (
//         let attempt = 0;
//         attempt < 5;
//         attempt += 1
//       ) {
//         if (cancelled) {
//           return;
//         }

//         try {
//           const result =
//             await apiPaymentStatus(
//               orderId,
//             );

//           if (cancelled) {
//             return;
//           }

//           setPayment(result);
//           setError("");
//           setLoading(false);

//           /*
//            * Once the authoritative order state
//            * reaches a terminal payment state,
//            * stop polling.
//            */
//           if (
//             result.status === "PAID" ||
//             result.status === "FAILED"
//           ) {
//             return;
//           }
//         } catch (e) {
//           if (cancelled) {
//             return;
//           }

//           /*
//            * Only expose the error after the final
//            * reconciliation attempt.
//            */
//           if (attempt === 4) {
//             setError(
//               e instanceof Error
//                 ? e.message
//                 : "Payment status could not be loaded.",
//             );

//             setLoading(false);
//           }
//         }

//         await new Promise(
//           (resolve) =>
//             setTimeout(resolve, 1000),
//         );
//       }
//     };

//     void reconcile();

//     return () => {
//       cancelled = true;
//     };
//   }, [orderId]);

//   /*
//    * Loading state.
//    */
//   if (loading && !payment) {
//     return (
//       <section className="simple-page">
//         <div className="page-loading">
//           Checking payment status…
//         </div>
//       </section>
//     );
//   }

//   /*
//    * Complete failure.
//    */
//   if (error && !payment) {
//     return (
//       <section className="simple-page">
//         <div className="inline-error page-error">
//           <Icon
//             name="x"
//             size={15}
//           />

//           {error}
//         </div>

//         <Link
//           className="text-link"
//           to="/payments"
//         >
//           ← Back to payments
//         </Link>
//       </section>
//     );
//   }

//   /*
//    * No payment returned.
//    */
//   if (!payment) {
//     return (
//       <section className="simple-page">
//         <div className="page-empty">
//           <div>
//             <Icon
//               name="card"
//               size={22}
//             />
//           </div>

//           <strong>
//             Payment not found
//           </strong>

//           <span>
//             AgentShield could not find
//             this payment order.
//           </span>
//         </div>

//         <Link
//           className="text-link"
//           to="/payments"
//         >
//           ← Back to payments
//         </Link>
//       </section>
//     );
//   }

//   const formattedStatus =
//     payment.status.replaceAll(
//       "_",
//       " ",
//     );

//   return (
//     <section className="simple-page">
//       {/* HEADER */}
//       <div className="simple-head">
//         <div>
//           <p className="eyebrow">
//             PAYMENT DETAIL
//           </p>

//           <h1>
//             {payment.orderId.slice(-10)}
//           </h1>

//           <p>
//             Authoritative payment state
//             reconciled by AgentShield.
//           </p>
//         </div>

//         <div
//           className={`payment-status ${payment.status.toLowerCase()}`}
//         >
//           <span />

//           {formattedStatus}
//         </div>
//       </div>

//       {/* RECONCILIATION ERROR */}
//       {error && (
//         <div className="inline-error page-error">
//           <Icon
//             name="x"
//             size={15}
//           />

//           {error}
//         </div>
//       )}

//       <div className="detail-surface">
//         {/* AMOUNT */}
//         <div className="detail-amount">
//           <span>AMOUNT</span>

//           <strong>
//             {money(
//               payment.amountInPaise,
//             )}
//           </strong>

//           <small>
//             {payment.currency} · server verified
//           </small>
//         </div>

//         {/* ITEMS */}
//         <div className="detail-field">
//           <span>ITEMS</span>

//           <div>
//             {payment.items.length === 0 ? (
//               <span>—</span>
//             ) : (
//               payment.items.map(
//                 (item) => (
//                   <div
//                     key={`${item.productId}-${item.quantity}`}
//                     style={{
//                       marginBottom:
//                         "10px",
//                     }}
//                   >
//                     <strong>
//                       {item.productName}
//                     </strong>

//                     <div>
//                       Qty{" "}
//                       {item.quantity}{" "}
//                       ·{" "}
//                       {money(
//                         item.unitPriceInPaise,
//                       )}{" "}
//                       each
//                     </div>
//                   </div>
//                 ),
//               )
//             )}
//           </div>
//         </div>

//         {/* ORDER ID */}
//         <div className="detail-field">
//           <span>ORDER ID</span>

//           <code>
//             {payment.orderId}
//           </code>
//         </div>

//         {/* REFERENCE ID */}
//         <div className="detail-field">
//           <span>REFERENCE ID</span>

//           <code>
//             {payment.referenceId}
//           </code>
//         </div>

//         {/* PAYMENT LINK ID */}
//         <div className="detail-field">
//           <span>
//             PAYMENT LINK ID
//           </span>

//           <code>
//             {payment.paymentLinkId ||
//               "—"}
//           </code>
//         </div>

//         {/* RAZORPAY PAYMENT ID */}
//         <div className="detail-field">
//           <span>
//             RAZORPAY PAYMENT ID
//           </span>

//           <code>
//             {payment.razorpayPaymentId ||
//               "—"}
//           </code>
//         </div>

//         {/* RAZORPAY STATUS */}
//         <div className="detail-field">
//           <span>
//             RAZORPAY STATUS
//           </span>

//           <code>
//             {payment.razorpayStatus ||
//               "—"}
//           </code>
//         </div>

//         {/* CREATED */}
//         <div className="detail-field">
//           <span>CREATED</span>

//           <code>
//             {formatDate(
//               payment.createdAt,
//             )}
//           </code>
//         </div>

//         {/* UPDATED */}
//         <div className="detail-field">
//           <span>UPDATED</span>

//           <code>
//             {formatDate(
//               payment.updatedAt,
//             )}
//           </code>
//         </div>

//         {/* RAZORPAY CHECKOUT */}
//         {payment.paymentLink && (
//           <a
//             className="approve-button compact"
//             href={payment.paymentLink}
//             target="_blank"
//             rel="noreferrer"
//           >
//             Open Razorpay checkout

//             <Icon
//               name="external"
//               size={15}
//             />
//           </a>
//         )}
//       </div>

//       <Link
//         className="text-link"
//         to="/payments"
//       >
//         ← Back to payments
//       </Link>
//     </section>
//   );
// }


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

import "../payment-pages.css";

function money(paise?: number) {
  if (
    typeof paise !== "number" ||
    !Number.isFinite(paise)
  ) {
    return "—";
  }

  return `₹${(paise / 100).toLocaleString("en-IN")}`;
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

function displayStatus(status?: string) {
  if (!status) {
    return "UNKNOWN";
  }

  return status.replaceAll("_", " ");
}

function statusClass(status?: string) {
  return `payment-status ${
    status
      ? status.toLowerCase()
      : "unknown"
  }`;
}

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

  /*
   * Runtime-safe normalization.
   *
   * Even if an older database record does not
   * contain `items`, the detail page will not crash.
   */
  const items = Array.isArray(payment.items)
    ? payment.items
    : [];

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

        {/* -----------------------------------------------
            AMOUNT HERO
        ------------------------------------------------ */}

        <div className="payment-detail-hero">

          <div>
            <span className="payment-detail-amount-label">
              TOTAL PAYMENT
            </span>

            <div className="payment-detail-amount">
              {money(
                payment.amountInPaise,
              )}
            </div>

            <div className="payment-detail-currency">
              {payment.currency || "INR"}
              {" · "}
              server verified
            </div>
          </div>

          <div className="payment-verification">
            <div className="payment-verification-icon">
              <Icon
                name="shield"
                size={18}
              />
            </div>

            <div>
              <strong>
                AgentShield verified
              </strong>

              <span>
                Server-authoritative order state
              </span>
            </div>
          </div>

        </div>

        {/* -----------------------------------------------
            ITEMS
        ------------------------------------------------ */}

        <div className="payment-detail-items">

          <div className="payment-section-heading">
            <span>
              ORDER ITEMS
            </span>

            <small>
              {items.length}{" "}
              {items.length === 1
                ? "item"
                : "items"}
            </small>
          </div>

          {items.length === 0 ? (
            <div className="payment-no-items">
              No item information was
              recorded for this order.
            </div>
          ) : (
            <div className="payment-items-list">
              {items.map(
                (item, index) => (
                  <div
                    className="payment-detail-item"
                    key={
                      `${item.productId || "item"}-${index}`
                    }
                  >
                    <div className="payment-item-number">
                      {String(index + 1).padStart(
                        2,
                        "0",
                      )}
                    </div>

                    <div className="payment-item-info">
                      <strong>
                        {item.productName ||
                          "Product"}
                      </strong>

                      <span>
                        Quantity{" "}
                        {item.quantity || 0}
                      </span>
                    </div>

                    <div className="payment-item-price">
                      {money(
                        item.unitPriceInPaise,
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}

        </div>

        {/* -----------------------------------------------
            IDENTIFIERS
        ------------------------------------------------ */}

        <div className="payment-detail-section">

          <div className="payment-section-heading">
            <span>
              TRANSACTION IDENTIFIERS
            </span>
          </div>

          <div className="payment-detail-fields">

            <div className="payment-detail-field">
              <span>
                ORDER ID
              </span>

              <code>
                {payment.orderId}
              </code>
            </div>

            <div className="payment-detail-field">
              <span>
                REFERENCE ID
              </span>

              <code>
                {payment.referenceId || "—"}
              </code>
            </div>

            <div className="payment-detail-field">
              <span>
                PAYMENT LINK ID
              </span>

              <code>
                {payment.paymentLinkId || "—"}
              </code>
            </div>

            <div className="payment-detail-field">
              <span>
                RAZORPAY PAYMENT ID
              </span>

              <code>
                {payment.razorpayPaymentId || "—"}
              </code>
            </div>

          </div>

        </div>

        {/* -----------------------------------------------
            STATUS + TIMELINE
        ------------------------------------------------ */}

        <div className="payment-detail-section">

          <div className="payment-section-heading">
            <span>
              RECONCILIATION
            </span>
          </div>

          <div className="payment-detail-fields">

            <div className="payment-detail-field">
              <span>
                AGENTSHIELD STATUS
              </span>

              <div
                className={statusClass(
                  payment.status,
                )}
              >
                <span />

                {formattedStatus}
              </div>
            </div>

            <div className="payment-detail-field">
              <span>
                RAZORPAY STATUS
              </span>

              <code>
                {payment.razorpayStatus || "—"}
              </code>
            </div>

            <div className="payment-detail-field">
              <span>
                CREATED
              </span>

              <code>
                {formatDate(
                  payment.createdAt,
                )}
              </code>
            </div>

            <div className="payment-detail-field">
              <span>
                LAST UPDATED
              </span>

              <code>
                {formatDate(
                  payment.updatedAt,
                )}
              </code>
            </div>

          </div>

        </div>

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