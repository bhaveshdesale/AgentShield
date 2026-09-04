import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Toast from "../components/Toast";
export default function MainLayout() {
    const [toasts, setToasts] = useState([]);
    return (_jsxs("div", { className: "flex h-screen bg-neutral-50", children: [_jsx(Sidebar, {}), _jsx("div", { className: "flex-1 overflow-hidden", children: _jsx("div", { className: "h-full overflow-y-auto", children: _jsx("div", { className: "p-6", children: _jsx(Outlet, {}) }) }) }), _jsx("div", { className: "fixed bottom-4 right-4 z-50 flex flex-col gap-2", children: toasts.map((toast) => (_jsx(Toast, { message: toast.message, type: toast.type, onClose: () => setToasts((prev) => prev.filter((t) => t.id !== toast.id)) }, toast.id))) })] }));
}
