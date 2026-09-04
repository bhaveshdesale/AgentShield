import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "./hooks/useToast";
import MainLayout from "./layouts/MainLayout";
import AgentWorkspace from "./pages/AgentWorkspace";
import ControlCenter from "./pages/ControlCenter";
import Payments from "./pages/Payments";
import PaymentDetail from "./pages/PaymentDetail";
import RiskRules from "./pages/RiskRules";
import AuditLog from "./pages/AuditLog";
export default function App() {
    return (_jsx(ToastProvider, { children: _jsxs(Routes, { children: [_jsxs(Route, { path: "/", element: _jsx(MainLayout, {}), children: [_jsx(Route, { index: true, element: _jsx(ControlCenter, {}) }), _jsx(Route, { path: "agent", element: _jsx(AgentWorkspace, {}) }), _jsx(Route, { path: "actions", element: _jsx(AgentWorkspace, {}) }), _jsx(Route, { path: "approvals", element: _jsx(AgentWorkspace, {}) }), _jsx(Route, { path: "payments", element: _jsx(Payments, {}) }), _jsx(Route, { path: "payments/:orderId", element: _jsx(PaymentDetail, {}) }), _jsx(Route, { path: "risk", element: _jsx(RiskRules, {}) }), _jsx(Route, { path: "audit", element: _jsx(AuditLog, {}) })] }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }));
}
