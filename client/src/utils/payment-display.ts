export function money(paise?: number): string {
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

export function formatDate(value?: string): string {
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

export function statusClass(status?: string): string {
  return `payment-status ${
    status
      ? status.toLowerCase()
      : "unknown"
  }`;
}

export function displayStatus(status?: string): string {
  if (!status) {
    return "UNKNOWN";
  }

  return status.replaceAll("_", " ");
}
