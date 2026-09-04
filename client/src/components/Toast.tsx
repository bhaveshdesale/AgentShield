import { useEffect, useState } from "react";

export default function Toast({
  message,
  type = "info",
  duration = 4000,
  onClose,
}: {
  message: string;
  type?: "success" | "error" | "info" | "warning";
  duration?: number;
  onClose: () => void;
}) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const typeColors = {
    success: "bg-success-500",
    error: "bg-danger-500",
    info: "bg-neutral-800",
    warning: "bg-warning-500",
  };

  return (
    <div
      className={`pointer-events-auto rounded-lg px-3 py-2 text-xs font-medium text-white shadow-lg ${typeColors[type]}`}
    >
      {message}
    </div>
  );
}
