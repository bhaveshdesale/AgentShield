import { afterEach, describe, expect, it, vi } from "vitest";

import { ORDER_STATUSES } from "../types";
import {
  apiPaymentHistory,
  apiPaymentStatus,
  apiProducts,
  setCsrfToken,
} from "./api";

function stubResponse(body: string, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(body, {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

describe("apiProducts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setCsrfToken(undefined);
  });

  it("returns the product array from the catalog response envelope", async () => {
    const products = [
      {
        id: "product-1",
        name: "Test product",
        description: "Catalog response",
        priceInPaise: 10000,
        currency: "INR" as const,
        category: "test",
        tags: [],
        inventory: 3,
        frequentlyBoughtWith: [],
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ products }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(apiProducts()).resolves.toEqual(products);
  });

  it("accepts an empty catalog", async () => {
    stubResponse(JSON.stringify({ products: [] }));

    await expect(apiProducts()).resolves.toEqual([]);
  });

  it.each([
    ["missing products", JSON.stringify({})],
    ["wrong products type", JSON.stringify({ products: {} })],
    [
      "wrong product property type",
      JSON.stringify({
        products: [
          {
            id: "product-1",
            name: 12,
            description: "Test",
            priceInPaise: 100,
            currency: "INR",
            category: "test",
            tags: [],
            inventory: 1,
            frequentlyBoughtWith: [],
          },
        ],
      }),
    ],
    ["malformed JSON", "{not-json"],
  ])("rejects a catalog response with %s", async (_case, body) => {
    stubResponse(body);

    await expect(apiProducts()).rejects.toThrow(
      "Invalid response from AgentShield API.",
    );
  });
});

describe("apiPaymentHistory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setCsrfToken(undefined);
  });

  it("accepts empty history and validates payment DTOs", async () => {
    stubResponse(JSON.stringify([]));
    await expect(apiPaymentHistory()).resolves.toEqual([]);

    const history = [
      {
        orderId: "order-1",
        referenceId: "ref-1",
        amountInPaise: 1000,
        currency: "INR",
        status: "PAID",
        items: [
          {
            productId: "product-1",
            productName: "Test product",
            quantity: 1,
            unitPriceInPaise: 1000,
          },
        ],
        createdAt: "2026-10-28T10:00:00.000Z",
        updatedAt: "2026-10-28T10:05:00.000Z",
      },
    ];
    stubResponse(JSON.stringify(history));

    await expect(apiPaymentHistory()).resolves.toEqual(history);
  });

  it.each([
    ["wrong top-level type", JSON.stringify({ payments: [] })],
    ["missing required items", JSON.stringify([{ orderId: "order-1" }])],
    [
      "wrong item property type",
      JSON.stringify([
        {
          orderId: "order-1",
          referenceId: "ref-1",
          amountInPaise: 1000,
          currency: "INR",
          status: "PAID",
          items: [{ productId: "product-1", quantity: "one" }],
          createdAt: "2026-10-28T10:00:00.000Z",
          updatedAt: "2026-10-28T10:05:00.000Z",
        },
      ]),
    ],
    ["malformed JSON", "["],
  ])("rejects payment history with %s", async (_case, body) => {
    stubResponse(body);

    await expect(apiPaymentHistory()).rejects.toThrow(
      "Invalid response from AgentShield API.",
    );
  });
});

describe("apiPaymentStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setCsrfToken(undefined);
  });

  it("accepts the backend payment status shape and encodes the order ID", async () => {
    const status = {
      orderId: "order/1",
      status: "PAID",
      amountInPaise: 1000,
      referenceId: "ref-1",
      paymentLinkId: "plink-1",
    };
    stubResponse(JSON.stringify(status));

    await expect(apiPaymentStatus(status.orderId)).resolves.toEqual(status);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:5050/api/payments/order%2F1/status",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("accepts every supported backend order status", async () => {
    for (const status of ORDER_STATUSES) {
      const paymentStatus = {
        orderId: "order-1",
        status,
        amountInPaise: 1000,
        referenceId: "ref-1",
      };
      stubResponse(JSON.stringify(paymentStatus));

      await expect(apiPaymentStatus(paymentStatus.orderId)).resolves.toEqual(
        paymentStatus,
      );
    }
  });

  it.each([
    ["missing order ID", JSON.stringify({ status: "PAID" })],
    [
      "wrong amount type",
      JSON.stringify({
        orderId: "order-1",
        status: "PAID",
        amountInPaise: "1000",
        referenceId: "ref-1",
      }),
    ],
    [
      "wrong optional item type",
      JSON.stringify({
        orderId: "order-1",
        status: "PAID",
        amountInPaise: 1000,
        referenceId: "ref-1",
        items: {},
      }),
    ],
    [
      "unknown order status",
      JSON.stringify({
        orderId: "order-1",
        status: "SETTLED",
        amountInPaise: 1000,
        referenceId: "ref-1",
      }),
    ],
    ["malformed JSON", "null"],
  ])("rejects payment status with %s", async (_case, body) => {
    stubResponse(body);

    await expect(apiPaymentStatus("order-1")).rejects.toThrow(
      "Invalid response from AgentShield API.",
    );
  });
});

describe("API error handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setCsrfToken(undefined);
  });

  it("preserves API error messages and dispatches session-expired on unauthorized responses", async () => {
    setCsrfToken("csrf-token");
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    stubResponse(
      JSON.stringify({ message: "Session expired", code: "UNAUTHORIZED" }),
      401,
    );

    await expect(apiPaymentStatus("order-1")).rejects.toMatchObject({
      message: "Session expired",
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "agentshield:session-expired" }),
    );
  });
});
