import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { apiAudit } from "../services/api";
import Icon from "../components/Icon";
export default function AuditLog() {
    const [logs, setLogs] = useState([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    async function load() { setLoading(true); try {
        setLogs(await apiAudit(100));
    }
    finally {
        setLoading(false);
    } }
    useEffect(() => { void load(); }, []);
    const filtered = logs.filter((log) => `${log.event} ${log.actionId ?? ""} ${JSON.stringify(log.details)}`.toLowerCase().includes(query.toLowerCase()));
    return (_jsxs("section", { className: "simple-page", children: [_jsxs("div", { className: "simple-head", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "AUDIT TRAIL" }), _jsx("h1", { children: "What happened" }), _jsx("p", { children: "Policy and payment transitions recorded by the server." })] }), _jsxs("button", { className: "refresh-button", onClick: () => void load(), children: [_jsx(Icon, { name: "refresh", size: 16 }), " Refresh"] })] }), _jsxs("div", { className: "audit-toolbar", children: [_jsxs("div", { className: "search-field", children: [_jsx(Icon, { name: "search", size: 16 }), _jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Search events or action IDs" })] }), _jsxs("span", { children: [filtered.length, " events"] })] }), _jsx("div", { className: "audit-surface", children: loading ? _jsx("div", { className: "page-loading", children: "Loading audit trail\u2026" }) : filtered.length ? filtered.map((log) => (_jsxs("div", { className: "audit-entry", children: [_jsx("div", { className: `audit-marker ${log.event.includes("BLOCK") ? "danger" : log.event.includes("PAYMENT") ? "payment" : "normal"}` }), _jsxs("div", { className: "audit-main", children: [_jsx("strong", { children: log.event.replaceAll("_", " ") }), _jsx("span", { children: log.actionId ? `Action ${log.actionId.slice(-10)}` : "System event" })] }), _jsx("time", { children: new Date(log.timestamp).toLocaleString("en-IN") })] }, log._id))) : _jsxs("div", { className: "page-empty", children: [_jsx("div", { children: _jsx(Icon, { name: "activity", size: 22 }) }), _jsx("strong", { children: "No audit events" }), _jsx("span", { children: "Important decisions will appear here as the agent is used." })] }) })] }));
}
