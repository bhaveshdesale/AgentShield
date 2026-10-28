import { useState, type FormEvent } from "react";
import Icon from "../components/Icon";

export default function SignIn(props: {
  onSignIn: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await props.onSignIn(email, password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <div className="brand-mark auth-mark"><Icon name="shield" size={20} /></div>
        <p className="eyebrow">AGENTSHIELD ACCESS</p>
        <h1>Sign in</h1>
        <p className="auth-description">Use an account provisioned by your AgentShield administrator.</p>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <div className="inline-error" role="alert">{error}</div>}
        <button className="auth-submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
