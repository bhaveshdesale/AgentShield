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
          path="/payments"
          element={<p>Payment history destination</p>}
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

const statusApi = vi.mocked(apiPaymentStatus);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
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
});
