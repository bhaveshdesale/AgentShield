import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink } from "react-router-dom";
const navigation = [
    { name: "Control Center", href: "/" },
    { name: "Agent", href: "/agent" },
    { name: "Actions", href: "/actions" },
    { name: "Approvals", href: "/approvals" },
    { name: "Payments", href: "/payments" },
    { name: "Risk & Rules", href: "/risk" },
    { name: "Audit Log", href: "/audit" },
];
export default function Sidebar() {
    return (_jsxs("div", { className: "flex h-screen w-64 flex-col border-r border-neutral-200 bg-neutral-50", children: [_jsxs("div", { className: "p-4 border-b border-neutral-200", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "h-6 w-6 rounded bg-primary-600" }), _jsx("span", { className: "font-mono text-sm font-semibold text-neutral-900", children: "AgentShield" })] }), _jsx("div", { className: "mt-1 text-xs text-neutral-500", children: "TEST MODE" })] }), _jsx("nav", { className: "flex-1 overflow-y-auto", children: navigation.map((item) => (_jsx(NavLink, { to: item.href, className: ({ isActive }) => `block px-3 py-2 text-sm font-medium ${isActive ? "border-l-2 border-primary-600 bg-primary-50 text-primary-700" : "text-neutral-600 hover:bg-neutral-100"}`, children: item.name }, item.name))) }), _jsx("div", { className: "p-4 border-t border-neutral-200", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "h-2 w-2 rounded-full bg-success-500" }), _jsx("span", { className: "text-xs text-neutral-500", children: "Demo Merchant" })] }) })] }));
}
