import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { apiHealth } from "../services/api";
const nav = [
    { label: "Agent", to: "/", icon: "bot" },
    { label: "Payments", to: "/payments", icon: "card" },
    { label: "Safety", to: "/simulator", icon: "shield" },
    { label: "Audit", to: "/audit", icon: "activity" },
];
export default function MainLayout() {
    const location = useLocation();
    const [online, setOnline] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    useEffect(() => {
        const check = () => apiHealth().then(() => setOnline(true)).catch(() => setOnline(false));
        check();
        const timer = window.setInterval(check, 15000);
        return () => window.clearInterval(timer);
    }, []);
    const isAgent = location.pathname === "/" || location.pathname === "/agent";
    return (_jsxs("div", { className: `app ${isAgent ? "app-agent" : ""}`, children: [_jsxs("header", { className: "topbar", children: [_jsxs(NavLink, { to: "/", className: "brand", onClick: () => setMobileOpen(false), children: [_jsx("span", { className: "brand-mark", children: _jsx(Icon, { name: "shield", size: 17 }) }), _jsxs("span", { className: "brand-copy", children: [_jsx("strong", { children: "AgentShield" }), _jsx("small", { children: "trust layer" })] })] }), _jsx("nav", { className: `top-nav ${mobileOpen ? "open" : ""}`, children: nav.map((item) => (_jsxs(NavLink, { to: item.to, end: item.to === "/", onClick: () => setMobileOpen(false), className: ({ isActive }) => isActive ? "top-nav-link active" : "top-nav-link", children: [_jsx(Icon, { name: item.icon, size: 15 }), item.label] }, item.to))) }), _jsxs("div", { className: "topbar-right", children: [_jsxs("span", { className: "mode-pill", children: [_jsx("span", { className: "mode-dot" }), " Razorpay Test Mode"] }), _jsxs("span", { className: `connection-pill ${online ? "online" : "offline"}`, children: [_jsx("span", {}), " ", online ? "Connected" : "Offline"] }), _jsx("button", { className: "mobile-menu", onClick: () => setMobileOpen((v) => !v), "aria-label": "Toggle navigation", children: _jsx(Icon, { name: "menu", size: 19 }) })] })] }), _jsx("main", { className: "main-content", children: _jsx(Outlet, {}) })] }));
}
