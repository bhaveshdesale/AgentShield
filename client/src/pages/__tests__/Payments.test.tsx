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

import type {
  PaymentHistoryItem,
  PaymentStatus,
} from "../../types";
import {
  apiPaymentHistory,
  apiPaymentStatus,
} from "../../services/api";
import Payments from "../Payments";

vi.mock("../../services/api", () => ({
  apiPaymentHistory: vi.fn(),
  apiPaymentStatus: vi.fn(),
}));

const payment: PaymentHistoryItem = {
  orderId: "order_1234567890",
  status: "PAID",
  amountInPaise: 123400,
  currency: "INR",
  referenceId: "ref_123",
  items: [
    {
      productId: "product_1",
      productName: "Garden kit",
      quantity: 2,
      unitPriceInPaise: 61700,
    },
  ],
  paymentLinkId: "plink_123",
  paymentLink: "https://checkout.example.test/link",
  razorpayPaymentId: "pay_123",
  razorpayStatus: "paid",
  createdAt: "2026-10-28T10:00:00.000Z",
  updatedAt: "2026-10-28T10:05:00.000Z",
};

function renderPayments() {
  return render(
    <MemoryRouter initialEntries={["/payments"]}>
      <Routes>
        <Route
          path="/payments"
          element={<Payments />}
        />
        <Route
          path="/payments/:orderId"
          element={<p>Payment detail destination</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const historyApi = vi.mocked(apiPaymentHistory);
const statusApi = vi.mocked(apiPaymentStatus);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Payments", () => {
  it("shows loading, then renders payment history and opens its detail", async () => {
    const user = userEvent.setup();
    const pending = deferred<PaymentHistoryItem[]>();
    historyApi.mockReturnValue(pending.promise);

    renderPayments();

    expect(screen.getByText("Loading payment history…")).toBeInTheDocument();

    await act(async () => {
      pending.resolve([payment]);
    });

    const paymentCard = await screen.findByRole("button", {
      name: /Garden kit/,
    });
    expect(screen.getByText("₹1,234")).toBeInTheDocument();
    expect(screen.getByText("PAID")).toBeInTheDocument();
    expect(screen.getByText("order_1234567890")).toBeInTheDocument();

    await user.click(paymentCard);
    expect(
      screen.getByText("Payment detail destination"),
    ).toBeInTheDocument();
  });

  it("shows an empty state when history contains no payments", async () => {
    historyApi.mockResolvedValue([]);

    renderPayments();

    expect(
      await screen.findByText("No payments yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Create a payment from the Agent page/),
    ).toBeInTheDocument();
  });

  it("offers a retry after a history error and renders recovered results", async () => {
    const user = userEvent.setup();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    historyApi
      .mockRejectedValueOnce(new Error("Payment history unavailable"))
      .mockResolvedValueOnce([payment]);

    renderPayments();

    expect(
      await screen.findByText("Payment history unavailable"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByRole("button", { name: /Garden kit/ }),
    ).toBeInTheDocument();
    errorLog.mockRestore();
  });

  it("shows an order status lookup with safe fallbacks and navigates to details", async () => {
    const user = userEvent.setup();
    historyApi.mockResolvedValue([]);
    statusApi.mockResolvedValue({
      orderId: payment.orderId,
      status: "AWAITING_PAYMENT",
      amountInPaise: 123400,
      currency: "INR",
      referenceId: "ref_lookup",
      items: [],
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    } satisfies PaymentStatus);

    renderPayments();

    const orderInput = screen.getByRole("textbox", { name: "Order ID" });
    await user.type(orderInput, payment.orderId);
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("AWAITING PAYMENT")).toBeInTheDocument();
    expect(screen.getByText("ref_lookup")).toBeInTheDocument();
    expect(statusApi).toHaveBeenCalledWith(payment.orderId);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "View details" }));
    expect(
      screen.getByText("Payment detail destination"),
    ).toBeInTheDocument();
  });

  it("asks for an order ID without calling the status API", async () => {
    const user = userEvent.setup();
    historyApi.mockResolvedValue([]);

    renderPayments();
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByText("Enter an order ID.")).toBeInTheDocument();
    expect(statusApi).not.toHaveBeenCalled();
  });
});
