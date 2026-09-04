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

  return (
    <div className={`app ${isAgent ? "app-agent" : ""}`}>
      <header className="topbar">
        <NavLink to="/" className="brand" onClick={() => setMobileOpen(false)}>
          <span className="brand-mark"><Icon name="shield" size={17} /></span>
          <span className="brand-copy">
            <strong>AgentShield</strong>
            <small>trust layer</small>
          </span>
        </NavLink>

        <nav className={`top-nav ${mobileOpen ? "open" : ""}`}>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => isActive ? "top-nav-link active" : "top-nav-link"}
            >
              <Icon name={item.icon} size={15} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-right">
          <span className="mode-pill"><span className="mode-dot" /> Razorpay Test Mode</span>
          <span className={`connection-pill ${online ? "online" : "offline"}`}>
            <span /> {online ? "Connected" : "Offline"}
          </span>
          <button className="mobile-menu" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle navigation">
            <Icon name="menu" size={19} />
          </button>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
