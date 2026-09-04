import { Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import AgentWorkspace from "./pages/AgentWorkspace";
import Payments from "./pages/Payments";
import PaymentDetail from "./pages/PaymentDetail";
import RiskRules from "./pages/RiskRules";
import AuditLog from "./pages/AuditLog";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<AgentWorkspace />} />
        <Route path="/agent" element={<AgentWorkspace />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/payments/:orderId" element={<PaymentDetail />} />
        <Route path="/simulator" element={<RiskRules />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/approvals" element={<Navigate to="/" replace />} />
        <Route path="/risk" element={<Navigate to="/simulator" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
