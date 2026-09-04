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
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<ControlCenter />} />
          <Route path="agent" element={<AgentWorkspace />} />
          <Route path="actions" element={<AgentWorkspace />} />
          <Route path="approvals" element={<AgentWorkspace />} />
          <Route path="payments" element={<Payments />} />
          <Route path="payments/:orderId" element={<PaymentDetail />} />
          <Route path="risk" element={<RiskRules />} />
          <Route path="audit" element={<AuditLog />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
