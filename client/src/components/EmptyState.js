import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function EmptyState({ title, description, icon }) {
    return (_jsxs("div", { className: "flex flex-col items-center justify-center py-12 text-center", children: [icon && _jsx("div", { className: "mb-3 text-neutral-300", children: icon }), _jsx("h3", { className: "text-sm font-medium text-neutral-900", children: title }), description && _jsx("p", { className: "mt-1 text-sm text-neutral-500", children: description })] }));
}
