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
] as const;

export default function RiskRules() {
  const [selected, setSelected] = useState(0);
  const [result, setResult] = useState<{ scenario: { id: number; name: string }; expected: string; result: unknown } | null>(null);
  const [running, setRunning] = useState(false);

  async function run(id: number) {
    setSelected(id);
    setRunning(true);
    try { setResult(await apiSimulation(id)); } finally { setRunning(false); }
  }

  return (
    <section className="simple-page simulator-page">
      <div className="simple-head"><div><p className="eyebrow">SAFETY SIMULATOR</p><h1>Prove the guardrails</h1><p>Run the ten predefined scenarios from the SRS and see how AgentShield responds.</p></div><div className="sim-badge"><Icon name="shield" size={15} /> deterministic</div></div>
      <div className="simulator-grid">
        <div className="scenario-list">
          {scenarios.map(([id, name, description]) => (
            <button key={id} className={`scenario ${selected === id ? "selected" : ""}`} onClick={() => void run(id)}>
              <span className="scenario-number">{String(id).padStart(2, "0")}</span><span><strong>{name}</strong><small>{description}</small></span><Icon name="arrow" size={15} />
            </button>
          ))}
        </div>
        <div className="simulation-result">
          {!result ? <div className="sim-empty"><div className="security-orb"><Icon name="shield" size={24} /></div><strong>Select a scenario</strong><span>The backend runs the actual deterministic simulation. This screen only visualizes its result.</span></div> : (
            <div className="result-content">
              <p className="eyebrow">SCENARIO {String(result.scenario.id).padStart(2, "0")}</p>
              <h2>{result.scenario.name}</h2>
              <div className={`result-decision ${String(result.expected).toLowerCase()}`}><span>{running ? "…" : result.expected}</span></div>
              <div className="result-box"><span>Expected outcome</span><strong>{String(result.expected)}</strong><small>Returned by the AgentShield simulation endpoint.</small></div>
              <details><summary>Raw simulation result</summary><pre>{JSON.stringify(result.result, null, 2)}</pre></details>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
