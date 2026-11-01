import { describe, expect, it } from "vitest";

import {
  displayStatus,
  formatDate,
  money,
  statusClass,
} from "./payment-display";

describe("payment display utilities", () => {
  describe("money", () => {
    it("formats paise as Indian rupees", () => {
      expect(money(123456)).toBe("₹1,234.56");
      expect(money(0)).toBe("₹0");
      expect(money(-125)).toBe("₹-1.25");
      expect(money(50)).toBe("₹0.5");
    });

    it("returns the fallback for missing and non-finite values", () => {
      expect(money()).toBe("—");
      expect(money(Number.NaN)).toBe("—");
      expect(money(Number.POSITIVE_INFINITY)).toBe("—");
      expect(money(Number.NEGATIVE_INFINITY)).toBe("—");
    });
  });

  describe("formatDate", () => {
    it("formats a valid date using the existing locale and styles", () => {
      const value = "2026-10-28T10:00:00.000Z";
      const expected = new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });

      expect(formatDate(value)).toBe(expected);
    });

    it("returns the fallback for missing or invalid dates", () => {
      expect(formatDate()).toBe("—");
      expect(formatDate("")).toBe("—");
      expect(formatDate("not-a-date")).toBe("—");
    });
  });

  describe("statusClass", () => {
    it.each([
      ["CREATED", "payment-status created"],
      ["AWAITING_PAYMENT", "payment-status awaiting_payment"],
      ["PAID", "payment-status paid"],
      ["FAILED", "payment-status failed"],
      ["UNKNOWN", "payment-status unknown"],
      ["RECOVERING", "payment-status recovering"],
      ["RECOVERED", "payment-status recovered"],
      ["CANCELLED", "payment-status cancelled"],
    ])("maps %s to its CSS class", (status, expected) => {
      expect(statusClass(status)).toBe(expected);
    });

    it("uses the unknown class for a missing status", () => {
      expect(statusClass()).toBe("payment-status unknown");
      expect(statusClass("")).toBe("payment-status unknown");
    });
  });

  describe("displayStatus", () => {
    it.each([
      ["CREATED", "CREATED"],
      ["AWAITING_PAYMENT", "AWAITING PAYMENT"],
      ["RECOVERY_IN_PROGRESS", "RECOVERY IN PROGRESS"],
    ])("replaces underscores in %s", (status, expected) => {
      expect(displayStatus(status)).toBe(expected);
    });

    it("returns UNKNOWN for a missing status", () => {
      expect(displayStatus()).toBe("UNKNOWN");
      expect(displayStatus("")).toBe("UNKNOWN");
    });
  });
});
