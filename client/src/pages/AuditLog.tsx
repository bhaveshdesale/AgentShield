import { useEffect, useState } from "react";
import type { AuditLogEntry } from "../types";
import { apiAudit } from "../services/api";
import Icon from "../components/Icon";

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() { setLoading(true); try { setLogs(await apiAudit(100)); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);

  const filtered = logs.filter((log) => `${log.event} ${log.actionId ?? ""} ${JSON.stringify(log.details)}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="simple-page">
      <div className="simple-head"><div><p className="eyebrow">AUDIT TRAIL</p><h1>What happened</h1><p>Policy and payment transitions recorded by the server.</p></div><button className="refresh-button" onClick={() => void load()}><Icon name="refresh" size={16} /> Refresh</button></div>
      <div className="audit-toolbar"><div className="search-field"><Icon name="search" size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events or action IDs" /></div><span>{filtered.length} events</span></div>
      <div className="audit-surface">
        {loading ? <div className="page-loading">Loading audit trail…</div> : filtered.length ? filtered.map((log) => (
          <div className="audit-entry" key={log._id}>
            <div className={`audit-marker ${log.event.includes("BLOCK") ? "danger" : log.event.includes("PAYMENT") ? "payment" : "normal"}`} />
            <div className="audit-main"><strong>{log.event.replaceAll("_", " ")}</strong><span>{log.actionId ? `Action ${log.actionId.slice(-10)}` : "System event"}</span></div>
            <time>{new Date(log.timestamp).toLocaleString("en-IN")}</time>
          </div>
        )) : <div className="page-empty"><div><Icon name="activity" size={22} /></div><strong>No audit events</strong><span>Important decisions will appear here as the agent is used.</span></div>}
      </div>
    </section>
  );
}
