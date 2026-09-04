import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
export default function ErrorState({ error, onRetry }) {
    const [showDetails, setShowDetails] = useState(false);
    useEffect(() => {
        let timer;
        if (showDetails) {
            timer = setTimeout(() => setShowDetails(false), 5000);
        }
        return () => {
            if (timer)
                clearTimeout(timer);
        };
    }, [showDetails]);
    const statusCode = error.statusCode;
    return (_jsx("div", { className: "rounded-lg border border-danger-200 bg-danger-50 p-4", children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsx("span", { className: "text-danger-500", children: "\u2715" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "text-sm font-medium text-danger-800", children: statusCode ? `Request failed (${statusCode})` : "Something went wrong" }), _jsx("p", { className: "mt-0.5 text-xs text-danger-600", children: error.message }), showDetails && (_jsx("pre", { className: "mt-1 whitespace-pre-wrap text-xs text-danger-600", children: error.stack })), _jsxs("div", { className: "mt-2 flex gap-2", children: [_jsx("button", { onClick: () => setShowDetails(!showDetails), className: "text-xs underline text-danger-700 hover:text-danger-800", children: showDetails ? "Hide details" : "Show details" }), onRetry && (_jsx("button", { onClick: onRetry, className: "text-xs font-medium underline text-primary-700 hover:text-primary-800", children: "Retry" }))] })] })] }) }));
}
