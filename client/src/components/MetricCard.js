import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const variantColors = {
    default: "bg-white",
    success: "bg-success-50",
    warning: "bg-warning-50",
    danger: "bg-danger-50",
    neutral: "bg-neutral-50",
};
export default function MetricCard({ title, value, subtitle, icon, variant = "default" }) {
    return (_jsxs("div", { className: `rounded-lg border border-neutral-200 p-4 ${variantColors[variant]}`, children: [_jsxs("div", { className: "flex items-center gap-2 text-neutral-500", children: [icon, _jsx("span", { className: "text-xs font-medium uppercase tracking-wider", children: title })] }), _jsx("div", { className: "mt-1 text-2xl font-semibold text-neutral-900", children: value }), subtitle && _jsx("div", { className: "mt-0.5 text-xs text-neutral-400", children: subtitle })] }));
}
