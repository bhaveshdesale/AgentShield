import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function LoadingState({ message = "Loading..." }) {
    return (_jsx("div", { className: "flex items-center justify-center py-12", children: _jsxs("div", { className: "flex items-center gap-2 text-neutral-500", children: [_jsx("div", { className: "h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" }), _jsx("span", { className: "text-sm", children: message })] }) }));
}
