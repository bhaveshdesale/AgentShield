import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import AgentWorkspace from "./pages/AgentWorkspace";
import Payments from "./pages/Payments";
import PaymentDetail from "./pages/PaymentDetail";
import RiskRules from "./pages/RiskRules";
import AuditLog from "./pages/AuditLog";
export default function App() {
    return (_jsx(Routes, { children: _jsxs(Route, { element: _jsx(MainLayout, {}), children: [_jsx(Route, { path: "/", element: _jsx(AgentWorkspace, {}) }), _jsx(Route, { path: "/agent", element: _jsx(AgentWorkspace, {}) }), _jsx(Route, { path: "/payments", element: _jsx(Payments, {}) }), _jsx(Route, { path: "/payments/:orderId", element: _jsx(PaymentDetail, {}) }), _jsx(Route, { path: "/simulator", element: _jsx(RiskRules, {}) }), _jsx(Route, { path: "/audit", element: _jsx(AuditLog, {}) }), _jsx(Route, { path: "/approvals", element: _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/risk", element: _jsx(Navigate, { to: "/simulator", replace: true }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }));
}
