import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function AgentMessage({ chat, isUser, children }) {
    if (isUser) {
        return (_jsx("div", { className: "mb-4 flex justify-end", children: _jsx("div", { className: "max-w-[70%] rounded-lg bg-neutral-100 px-4 py-2 text-sm text-neutral-900", children: chat.message }) }));
    }
    const isFallback = chat.source === "fallback";
    return (_jsx("div", { className: "mb-4", children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsx("div", { className: "flex h-6 w-6 shrinkage-0 items-center justify-center rounded bg-neutral-900 text-xs text-white", children: "AI" }), _jsxs("div", { className: "max-w-[80%]", children: [isFallback && (_jsx("span", { className: "mb-1 inline-block text-xs text-neutral-400", children: "(fallback agent \u2014 LLM unavailable)" })), _jsx("div", { className: "text-sm text-neutral-900", children: chat.message }), children] })] }) }));
}
