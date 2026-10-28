import { Navigate, Route, Routes } from "react-router-dom";
import { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "./auth/AuthContext";
import MainLayout from "./layouts/MainLayout";
import AgentWorkspace from "./pages/AgentWorkspace";
import Payments from "./pages/Payments";
import PaymentDetail from "./pages/PaymentDetail";
import RiskRules from "./pages/RiskRules";
import AuditLog from "./pages/AuditLog";
import SignIn from "./pages/SignIn";
import { apiGetSession, apiLogin, apiLogout, setCsrfToken, type AuthUser } from "./services/api";

function RoleGate(props: { children: JSX.Element }) {
  const { user } = useContext(AuthContext)!;
  return user.role === "viewer" ? <Navigate to="/payments" replace /> : props.children;
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");

  useEffect(() => {
    let active = true;
    const expire = () => {
      setCsrfToken(undefined);
      setUser(null);
    };
    window.addEventListener("agentshield:session-expired", expire);
    void apiGetSession()
      .then((session) => {
        if (active) setUser(session.user);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const statusCode = typeof reason === "object" && reason !== null && "statusCode" in reason
          ? Number(reason.statusCode)
          : undefined;
        if (statusCode === 401) {
          setUser(null);
        } else {
          setBootstrapError(reason instanceof Error ? reason.message : "Could not check the current session.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.removeEventListener("agentshield:session-expired", expire);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    setUser(result.user);
  }, []);
  const logout = useCallback(async () => {
    try {
      await apiLogout();
      setUser(null);
    } catch (reason) {
      const statusCode = typeof reason === "object" && reason !== null && "statusCode" in reason
        ? Number(reason.statusCode)
        : undefined;
      if (statusCode === 401) setUser(null);
      throw reason;
    }
  }, []);

  if (loading) {
    return <main className="auth-screen"><p>Checking your AgentShield session…</p></main>;
  }
  if (bootstrapError) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <p className="eyebrow">AGENTSHIELD ACCESS</p>
          <h1>Unable to check session</h1>
          <p className="auth-description">{bootstrapError}</p>
          <button className="auth-submit" onClick={() => window.location.reload()}>Retry</button>
        </section>
      </main>
    );
  }
  if (!user) {
    return <SignIn onSignIn={signIn} />;
  }

  return (
    <AuthContext.Provider value={{ user, logout }}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<RoleGate><AgentWorkspace /></RoleGate>} />
          <Route path="/agent" element={<RoleGate><AgentWorkspace /></RoleGate>} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/payments/:orderId" element={<PaymentDetail />} />
          <Route path="/simulator" element={<RoleGate><RiskRules /></RoleGate>} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/approvals" element={<Navigate to="/" replace />} />
          <Route path="/risk" element={<Navigate to="/simulator" replace />} />
          <Route path="*" element={<Navigate to="/payments" replace />} />
        </Route>
      </Routes>
    </AuthContext.Provider>
  );
}
