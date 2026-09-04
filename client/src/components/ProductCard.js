import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function ProductCard({ product }) {
    const price = (product.priceInPaise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" });
    const inStock = product.inventory > 0;
    return (_jsxs("div", { className: "w-64 rounded-lg border border-neutral-200 bg-white p-3 shadow-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("h4", { className: "font-medium text-neutral-900", children: product.name }), _jsx("span", { className: "text-sm font-semibold text-neutral-900", children: price })] }), _jsx("p", { className: "mt-1 text-xs text-neutral-500", children: product.category }), _jsxs("div", { className: "mt-2 flex items-center justify-between text-xs", children: [_jsx("span", { className: inStock ? "text-success-600" : "text-danger-600", children: inStock ? `${product.inventory} available` : "Out of stock" }), product.tags.length > 0 && (_jsx("span", { className: "rounded bg-neutral-100 px-1.5 py-0.25 text-neutral-500", children: product.tags.join(", ") }))] })] }));
}
