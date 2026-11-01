# Architecture

AgentShield separates agent-generated proposals from deterministic authorization and payment execution. The frontend is a React application; the backend is an Express API backed by MongoDB through Mongoose. Razorpay is the external payment provider. The optional agent integration uses an OpenAI-compatible chat-completions API; without an API key the backend uses its deterministic fallback.

## Frontend

- `client/src/pages/` contains the sign-in, agent workspace, payments, payment detail, audit, and risk/simulation pages.
- `client/src/auth/` and `client/src/layouts/` manage the authenticated UI and application shell.
- `client/src/services/api.ts` centralizes browser requests, session credentials, and CSRF-token handling.
- `client/vite.config.ts` configures the development server and `/api` proxy to the backend.

The browser UI is not the authorization boundary. The backend validates session, role, CSRF, policy, and payment state.

## Backend request path

`server/src/server.ts` loads configuration, connects to MongoDB, and starts the HTTP server. `server/src/app.ts` configures request logging, CORS, raw-body parsing for Razorpay webhooks, JSON parsing, authentication, CSRF checks on state-changing authenticated API requests, and error handling. Routers in `server/src/routes/` connect endpoints to controllers in `server/src/controllers/`.

## Backend responsibilities

- `config/` loads environment configuration, connects Mongoose models, and resolves Razorpay mode and credentials.
- `middleware/` handles authentication, CSRF, request logging, not-found responses, and errors.
- `models/` defines persisted users, sessions, products, merchants, actions, orders, audit records, and webhook events.
- `services/agent.service.ts` handles agent conversation, catalog-oriented tools, and structured action proposals; it does not expose a payment-execution tool to the agent.
- `services/policy.service.ts` evaluates proposals against server-side product and merchant policy data.
- `services/payment.service.ts` handles approval/payment orchestration, authoritative order amounts, and payment history. The payment-link creation path requires an allowed action and its required approval state.
- `services/reconciliation.service.ts` recalculates authoritative amounts, reads provider status, performs recovery lookup/retry, and persists recovery outcomes and action state.
- `services/payment-recovery-claim.service.ts` owns the recovery-claim boundary: it validates that an order is `UNKNOWN` or has a stale `RECOVERING` lease, loads its related action, atomically claims the order, and records the idempotent `RECOVERY_STARTED` audit event.
- `services/webhook.service.ts` verifies and processes signed Razorpay webhook events and coordinates event deduplication/retry state.
- `services/audit.service.ts` writes standard, security, and idempotent audit events.
- `services/catalog.service.ts`, `dashboard.service.ts`, and `simulation.service.ts` implement product, dashboard-statistics, and safety-simulation operations.
- `tests/` contains Node's built-in test-runner tests, including integration tests that require MongoDB.

## Payment and recovery flow

1. The agent may produce a structured proposal. The API validates it and the policy service evaluates it using server-side data; the model's proposed amount is not authoritative.
2. An authorized user approves an action when policy requires approval.
3. Payment execution revalidates the action, computes the amount from the catalog, and requests a Razorpay Payment Link.
4. Payment status can be refreshed from the provider, and signed webhooks can update local state. State updates and audit writes use conditional/idempotent operations in the relevant services.
5. If an execution outcome is unknown, recovery first claims an eligible order. The claim is conditional, so concurrent calls cannot both acquire a current claim; a `RECOVERING` claim older than the 120-second lease can be reclaimed.
6. After claiming, reconciliation checks Razorpay before creating another link. A successful lookup may confirm an existing payment or reuse its link. A new link is attempted only after a successful lookup finds no matching link. Lookup or retry uncertainty remains an error/unknown state rather than a blind retry.

The claim and subsequent reconciliation work are multiple MongoDB/provider operations, not one transaction across both systems. Idempotent audit records and conditional order/action updates reduce duplicate work, but the flow is recoverable rather than a distributed exactly-once guarantee.

## Configuration and operational boundaries

Backend configuration is documented in `server/.env.example`; the client API override is `VITE_API_BASE_URL` in `client/.env.example`. `compose.yaml` starts a local frontend, backend, and MongoDB with a persistent volume and test-mode Razorpay dummy defaults. Compose is for local development; it does not provide production database authentication, secret management, or a shared rate-limit store. See [RELEASING.md](../RELEASING.md) for release-readiness limitations and deployment-only checks.
