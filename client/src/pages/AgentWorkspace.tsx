import { useMemo, useState, type FormEvent } from "react";
import type { Action, AgentChatResponse, Product, PaymentResult } from "../types";
import { apiAgentChat, apiApproveAction, apiCreatePayment, apiProducts, apiValidateAction } from "../services/api";
import Icon from "../components/Icon";

const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

type Message = { role: "agent" | "user"; text: string };

export default function AgentWorkspace() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [result, setResult] = useState<AgentChatResponse | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const started = messages.length > 0;
  const suggestions = useMemo(() => [
    "Find wireless headphones under ₹5,000",
    "Buy the artisan coffee kit",
    "Find a laptop under ₹50,000",
  ], []);

  async function sendMessage(value = input) {
    const message = value.trim();
    if (!message || busy) return;
    setInput("");
    setMessages((current) => [...current, { role: "user", text: message }]);
    setBusy(true);
    setError("");
    try {
      const response = await apiAgentChat(message, result?.conversationId);
      setResult(response);
      setMessages((current) => [...current, { role: "agent", text: response.message }]);
      const catalog = await apiProducts();
      setProducts(catalog);
      if (response.proposal && response.policyResult) {
        const validated = await apiValidateAction({
          ...response.proposal,
          conversationId: response.conversationId,
        });
        setAction({
          _id: validated.actionId,
          conversationId: response.conversationId,
          referenceId: response.proposal.referenceId,
          action: response.proposal.action,
          proposal: response.proposal,
          reason: response.proposal.reason,
          policyResult: validated,
          verifiedAmountInPaise: validated.verifiedAmountInPaise,
          approvalRequired: validated.approvalRequired,
          approvalStatus: validated.approvalRequired ? "PENDING" : "NOT_REQUIRED",
          executionStatus: validated.decision === "ALLOW" ? "NOT_STARTED" : "BLOCKED",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        setPayment(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The agent could not complete the request.");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!action || action.policyResult?.decision !== "ALLOW" || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiApproveAction(action._id);
      const created = await apiCreatePayment(action._id);
      setPayment(created);
      setAction((current) => current ? { ...current, approvalStatus: "APPROVED", executionStatus: "IN_PROGRESS" } : current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  if (!started) {
    return (
      <section className="agent-home">
        <div className="agent-intro">
          <div className="agent-avatar" aria-hidden="true">
            <span className="avatar-eye left" />
            <span className="avatar-eye right" />
            <span className="avatar-body" />
            <span className="avatar-shadow" />
          </div>
          <p className="home-kicker">SECURE COMMERCE AGENT</p>
          <h1>What can I help you <span>buy?</span></h1>
          <p className="home-subtitle">Ask naturally. AgentShield verifies every proposed transaction before money can move.</p>
        </div>

        <form className="composer hero-composer" onSubmit={onSubmit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Chat with your assistant..."
            rows={2}
            autoFocus
          />
          <div className="composer-bottom">
            <span className="composer-hint"><Icon name="shield" size={14} /> Policy protected</span>
            <button className="send-button" disabled={!input.trim() || busy} aria-label="Send">
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </form>

        <div className="suggestions">
          {suggestions.map((suggestion) => (
            <button key={suggestion} onClick={() => void sendMessage(suggestion)}>{suggestion}</button>
          ))}
        </div>

        <div className="trust-line"><span className="trust-check">✓</span> AI proposes · AgentShield authorizes · You approve · Razorpay executes</div>
      </section>
    );
  }

  return (
    <section className="agent-session">
      <div className="session-header">
        <div>
          <p className="eyebrow">PROTECTED SESSION</p>
          <h1>Commerce agent</h1>
        </div>
        <button className="new-session" onClick={() => { setMessages([]); setResult(null); setAction(null); setPayment(null); setError(""); }}>
          New conversation
        </button>
      </div>

      <div className="session-grid">
        <section className="conversation-card">
          <div className="conversation-scroll">
            {messages.map((message, index) => (
              <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                {message.role === "agent" && <div className="mini-agent"><Icon name="shield" size={14} /></div>}
                <div className="chat-bubble">{message.text}</div>
              </div>
            ))}
            {busy && <div className="chat-message agent"><div className="mini-agent"><Icon name="shield" size={14} /></div><div className="chat-bubble typing"><i /> <i /> <i /></div></div>}
          </div>

          <form className="composer session-composer" onSubmit={onSubmit}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Tell the agent what you want to buy..." rows={1} />
            <button className="send-button" disabled={!input.trim() || busy} aria-label="Send"><Icon name="arrow" size={17} /></button>
          </form>
          {result?.source === "fallback" && <p className="fallback-note">Using deterministic fallback agent. Authorization remains server-side.</p>}
        </section>

        <aside className="security-card">
          <div className="security-header">
            <div><p className="eyebrow">AGENTSHIELD</p><h2>Authorization</h2></div>
            <span className="secure-badge"><span /> protected</span>
          </div>

          {error && <div className="inline-error"><Icon name="x" size={15} /> {error}</div>}

          {!action && <div className="security-empty"><div className="security-orb"><Icon name="shield" size={25} /></div><strong>Waiting for a proposal</strong><span>The agent can recommend a product, but only this server-side policy layer can authorize payment.</span></div>}

          {action && (
            <>
              <div className={`decision-banner ${action.policyResult?.decision.toLowerCase()}`}>
                <span className="decision-symbol">{action.policyResult?.decision === "ALLOW" ? "✓" : action.policyResult?.decision === "BLOCK" ? "×" : "!"}</span>
                <div><strong>{action.policyResult?.decision === "ALLOW" ? "Allowed — approval required" : action.policyResult?.decision === "BLOCK" ? "Blocked by policy" : "Escalation required"}</strong><span>{action.policyResult?.reason}</span></div>
              </div>

              <div className="proposal-card">
                <p className="eyebrow">ACTION PROPOSAL</p>
                <h3>{action.action.replaceAll("_", " ")}</h3>
                <div className="amount-line"><span>Verified amount</span><strong>{money(action.verifiedAmountInPaise)}</strong></div>
                <div className="amount-line muted"><span>Agent proposed</span><span>{money(action.proposal.proposedAmountInPaise)}</span></div>
                <div className="reference-line"><span>ref</span><code>{action.referenceId}</code></div>
              </div>

              <div className="policy-list">
                <div className="policy-title">POLICY CHECKS</div>
                {action.policyResult?.checks.map((check) => (
                  <div className="policy-row" key={check.name}>
                    <span className={`policy-icon ${check.passed ? "pass" : "fail"}`}>{check.passed ? "✓" : "×"}</span>
                    <div><strong>{check.name}</strong><span>{check.message}</span></div>
                  </div>
                ))}
              </div>

              {payment ? (
                <div className="payment-ready">
                  <div><span className="eyebrow">PAYMENT LINK READY</span><strong>{money(action.verifiedAmountInPaise)}</strong></div>
                  <a href={payment.paymentLink} target="_blank" rel="noreferrer">Open Razorpay checkout <Icon name="external" size={14} /></a>
                </div>
              ) : action.policyResult?.decision === "ALLOW" ? (
                <button className="approve-button" disabled={busy} onClick={() => void approve()}>
                  {busy ? "Creating secure payment link…" : "Approve purchase"}
                  <Icon name="arrow" size={17} />
                </button>
              ) : null}
            </>
          )}
        </aside>
      </div>

      {!!products.length && result?.recommendations?.length ? (
        <div className="recommendations">
          <div className="section-label">RECOMMENDED FROM CATALOG</div>
          <div className="recommendation-list">
            {result.recommendations.map((recommendation) => (
              <div className="recommendation" key={recommendation.productId}>
                <div className="recommendation-icon"><Icon name="box" size={18} /></div>
                <div><strong>{recommendation.name}</strong><span>{money(recommendation.priceInPaise)} · {recommendation.reason}</span></div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
