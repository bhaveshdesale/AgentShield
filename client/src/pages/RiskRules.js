import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { apiSimulation } from "../services/api";
import Icon from "../components/Icon";
const scenarios = [
    [1, "Valid transaction", "Normal purchase"],
    [2, "Spending limit violation", "Amount exceeds merchant limit"],
    [3, "Price mismatch", "AI amount differs from catalog"],
    [4, "Excessive discount", "Discount exceeds policy"],
    [5, "Duplicate payment", "Replay of a completed payment"],
    [6, "Missing inventory", "Requested stock is unavailable"],
    [7, "Unauthorized action", "Action is outside permissions"],
    [8, "Malformed AI output", "Structured proposal is invalid"],
    [9, "Payment timeout", "Execution reaches an uncertain state"],
    [10, "Recovery", "Unknown payment state is reconciled"],
];
export default function RiskRules() {
    const [selected, setSelected] = useState(0);
    const [result, setResult] = useState(null);
    const [running, setRunning] = useState(false);
    async function run(id) {
        setSelected(id);
        setRunning(true);
        try {
            setResult(await apiSimulation(id));
        }
        finally {
            setRunning(false);
        }
    }
    return (_jsxs("section", { className: "simple-page simulator-page", children: [_jsxs("div", { className: "simple-head", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "SAFETY SIMULATOR" }), _jsx("h1", { children: "Prove the guardrails" }), _jsx("p", { children: "Run the ten predefined scenarios from the SRS and see how AgentShield responds." })] }), _jsxs("div", { className: "sim-badge", children: [_jsx(Icon, { name: "shield", size: 15 }), " deterministic"] })] }), _jsxs("div", { className: "simulator-grid", children: [_jsx("div", { className: "scenario-list", children: scenarios.map(([id, name, description]) => (_jsxs("button", { className: `scenario ${selected === id ? "selected" : ""}`, onClick: () => void run(id), children: [_jsx("span", { className: "scenario-number", children: String(id).padStart(2, "0") }), _jsxs("span", { children: [_jsx("strong", { children: name }), _jsx("small", { children: description })] }), _jsx(Icon, { name: "arrow", size: 15 })] }, id))) }), _jsx("div", { className: "simulation-result", children: !result ? _jsxs("div", { className: "sim-empty", children: [_jsx("div", { className: "security-orb", children: _jsx(Icon, { name: "shield", size: 24 }) }), _jsx("strong", { children: "Select a scenario" }), _jsx("span", { children: "The backend runs the actual deterministic simulation. This screen only visualizes its result." })] }) : (_jsxs("div", { className: "result-content", children: [_jsxs("p", { className: "eyebrow", children: ["SCENARIO ", String(result.scenario.id).padStart(2, "0")] }), _jsx("h2", { children: result.scenario.name }), _jsx("div", { className: `result-decision ${String(result.expected).toLowerCase()}`, children: _jsx("span", { children: running ? "…" : result.expected }) }), _jsxs("div", { className: "result-box", children: [_jsx("span", { children: "Expected outcome" }), _jsx("strong", { children: String(result.expected) }), _jsx("small", { children: "Returned by the AgentShield simulation endpoint." })] }), _jsxs("details", { children: [_jsx("summary", { children: "Raw simulation result" }), _jsx("pre", { children: JSON.stringify(result.result, null, 2) })] })] })) })] })] }));
}
