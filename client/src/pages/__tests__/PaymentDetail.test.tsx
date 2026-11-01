import {
  act,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
} from "react-router-dom";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { PaymentStatus } from "../../types";
import { apiPaymentStatus } from "../../services/api";
import PaymentDetail from "../PaymentDetail";

vi.mock("../../services/api", () => ({
  apiPaymentStatus: vi.fn(),
}));

const paidPayment: PaymentStatus = {
  orderId: "order_1234567890",
  status: "PAID",
  amountInPaise: 8450,
  currency: "INR",
  referenceId: "ref_detail_1",
  items: [
    {
      productId: "product_1",
      productName: "Premium widget",
      quantity: 1,
      unitPriceInPaise: 8450,
    },
  ],
  paymentLinkId: "plink_detail_1",
  paymentLink: "https://checkout.example.test/detail",
  razorpayPaymentId: "pay_detail_1",
  razorpayStatus: "captured",
  createdAt: "2026-10-28T10:00:00.000Z",
  updatedAt: "2026-10-28T10:05:00.000Z",
};

function renderDetail(initialEntry = `/payments/${paidPayment.orderId}`) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/payments/:orderId"
          element={<PaymentDetail />}
        />
        <Route
          path="/missing"
          element={<PaymentDetail />}
        />
        <Route
          path="/payments"
          element={<p>Payment history destination</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const statusApi = vi.mocked(apiPaymentStatus);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PaymentDetail", () => {
  it("shows loading while status is checked, then renders transaction details", async () => {
    const user = userEvent.setup();
    const pending = deferred<PaymentStatus>();
    statusApi.mockReturnValue(pending.promise);

    renderDetail();

    expect(screen.getByText("Checking payment status")).toBeInTheDocument();
    await act(async () => {
      pending.resolve(paidPayment);
    });

    expect(
      await screen.findByRole("heading", {
        name: "Order 1234567890",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("PAID").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹84.5").length).toBeGreaterThan(0);
    expect(screen.getByText("Premium widget")).toBeInTheDocument();
    expect(screen.getByText("pay_detail_1")).toBeInTheDocument();
    expect(screen.getByText("captured")).toBeInTheDocument();
    expect(statusApi).toHaveBeenCalledWith(paidPayment.orderId);

    await user.click(
      screen.getByRole("link", { name: /Back to payment history/ }),
    );
    expect(
      screen.getByText("Payment history destination"),
    ).toBeInTheDocument();
  });

  it("renders a safe fallback when optional or malformed display fields are absent", async () => {
    const malformedPayment = {
      ...paidPayment,
      amountInPaise: Number.NaN,
      currency: undefined,
      items: undefined,
      referenceId: "",
      paymentLinkId: undefined,
      razorpayPaymentId: undefined,
      razorpayStatus: undefined,
      createdAt: "not-a-date",
      updatedAt: "",
    } as unknown as PaymentStatus;
    statusApi.mockResolvedValue(malformedPayment);

    renderDetail();

    expect(
      await screen.findByText("No item information was recorded for this order."),
    ).toBeInTheDocument();
    expect(screen.getByText("INR · server verified")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(6);
  });

  it("shows product and quantity fallbacks for incomplete item details", async () => {
    statusApi.mockResolvedValue({
      ...paidPayment,
      items: [
        {
          productId: "",
          productName: "",
          quantity: 0,
          unitPriceInPaise: 0,
        },
      ],
    });

    renderDetail();

    expect(await screen.findByText("Product")).toBeInTheDocument();
    expect(screen.getByText("Quantity 0")).toBeInTheDocument();
    expect(screen.getByText("₹0")).toBeInTheDocument();
  });

  it("shows a clear error when the route has no order ID", async () => {
    renderDetail("/missing");

    expect(await screen.findByText("Unable to load payment")).toBeInTheDocument();
    expect(screen.getByText("Order ID is missing.")).toBeInTheDocument();
    expect(statusApi).not.toHaveBeenCalled();
  });

  it("shows a clear error and lets the user return to payment history", async () => {
    const user = userEvent.setup();
    statusApi.mockRejectedValue(new Error("Payment status is unavailable"));

    renderDetail();

    expect(
      await screen.findByText("Unable to load payment"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Payment status is unavailable"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("link", { name: /Back to payments/ }),
    );
    expect(
      screen.getByText("Payment history destination"),
    ).toBeInTheDocument();
  });

  it("uses a safe error message when the initial request rejects with a non-Error value", async () => {
    statusApi.mockRejectedValue("network failure");

    renderDetail();

    expect(
      await screen.findByText("Payment status could not be loaded."),
    ).toBeInTheDocument();
  });

  it("stops reconciliation when the provider reports a failed payment", async () => {
    statusApi
      .mockResolvedValueOnce({
        ...paidPayment,
        status: "AWAITING_PAYMENT",
      })
      .mockResolvedValueOnce({
        ...paidPayment,
        status: "FAILED",
      });

    renderDetail();

    expect((await screen.findAllByText("FAILED")).length).toBeGreaterThan(0);
    expect(statusApi).toHaveBeenCalledTimes(2);
  });

  it("retries after a transient reconciliation error and clears it after success", async () => {
    vi.useFakeTimers();
    statusApi
      .mockResolvedValueOnce({
        ...paidPayment,
        status: "AWAITING_PAYMENT",
      })
      .mockRejectedValueOnce(new Error("Temporary status failure"))
      .mockResolvedValueOnce(paidPayment);

    renderDetail();

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getAllByText("PAID").length).toBeGreaterThan(0);
    expect(screen.queryByText("Temporary status failure")).not.toBeInTheDocument();
    expect(statusApi).toHaveBeenCalledTimes(3);
  });

  it("keeps the last known payment visible and reports an error after reconciliation retries fail", async () => {
    vi.useFakeTimers();
    statusApi
      .mockResolvedValueOnce({
        ...paidPayment,
        status: "AWAITING_PAYMENT",
      })
      .mockRejectedValue("network failure");

    renderDetail();

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getAllByText("AWAITING PAYMENT").length).toBeGreaterThan(0);
    expect(screen.getByText("Payment status could not be loaded.")).toBeInTheDocument();
    expect(statusApi).toHaveBeenCalledTimes(6);
  });

  it("shows the final reconciliation error message when a refresh rejects with an Error", async () => {
    vi.useFakeTimers();
    statusApi
      .mockResolvedValueOnce({
        ...paidPayment,
        status: "AWAITING_PAYMENT",
      })
      .mockRejectedValue(new Error("Provider status is unavailable"));

    renderDetail();

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText("Provider status is unavailable")).toBeInTheDocument();
    expect(statusApi).toHaveBeenCalledTimes(6);
  });

  it("ignores a pending reconciliation response after the page unmounts", async () => {
    const initialRequest = deferred<PaymentStatus>();
    const reconciliationRequest = deferred<PaymentStatus>();
    statusApi
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(reconciliationRequest.promise);

    const { unmount } = renderDetail();
    await act(async () => {
      initialRequest.resolve(paidPayment);
    });
    expect(
      await screen.findByRole("heading", {
        name: "Order 1234567890",
      }),
    ).toBeInTheDocument();

    unmount();
    await act(async () => {
      reconciliationRequest.resolve({
        ...paidPayment,
        status: "FAILED",
      });
    });

    expect(statusApi).toHaveBeenCalledTimes(2);
  });

  it("does not start another reconciliation request after unmounting during the retry delay", async () => {
    vi.useFakeTimers();
    statusApi.mockResolvedValue({
      ...paidPayment,
      status: "AWAITING_PAYMENT",
    });

    const { unmount } = renderDetail();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(statusApi).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(statusApi).toHaveBeenCalledTimes(2);
  });

  it("ignores a reconciliation error that arrives after the page unmounts", async () => {
    const initialRequest = deferred<PaymentStatus>();
    const reconciliationRequest = deferred<PaymentStatus>();
    statusApi
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(reconciliationRequest.promise);

    const { unmount } = renderDetail();
    await act(async () => {
      initialRequest.resolve(paidPayment);
    });
    expect(
      await screen.findByRole("heading", {
        name: "Order 1234567890",
      }),
    ).toBeInTheDocument();

    unmount();
    await act(async () => {
      reconciliationRequest.reject(new Error("Late refresh failure"));
      await reconciliationRequest.promise.catch(() => undefined);
    });

    expect(statusApi).toHaveBeenCalledTimes(2);
  });
});
