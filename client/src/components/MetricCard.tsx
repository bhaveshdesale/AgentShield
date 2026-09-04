import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "neutral";
}

const variantColors: Record<NonNullable<MetricCardProps["variant"]>, string> = {
  default: "bg-white",
  success: "bg-success-50",
  warning: "bg-warning-50",
  danger: "bg-danger-50",
  neutral: "bg-neutral-50",
};

export default function MetricCard({ title, value, subtitle, icon, variant = "default" }: MetricCardProps) {
  return (
    <div className={`rounded-lg border border-neutral-200 p-4 ${variantColors[variant]}`}>
      <div className="flex items-center gap-2 text-neutral-500">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider">{title}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold text-neutral-900">{value}</div>
      {subtitle && <div className="mt-0.5 text-xs text-neutral-400">{subtitle}</div>}
    </div>
  );
}
