# AgentShield Release Handoff

This checklist is an operator handoff, not a deployment procedure. The repository has no release-tagging, publishing, or production-deployment workflow. Check items marked **Deployment verification** in the actual target environment; local tests and Compose validation do not prove production readiness.

## Final release decision — 2026-10-28

**NO-GO — Not ready for production.** This is the final release handoff for the current implementation workflow. Source checks and local builds are not substitutes for the blocked integration-test, CI, staging, container-runtime, and production-operational gates listed below. No deployment or release action has been performed.

### Project scope and benchmark

AgentShield is a trust and reliability layer for agentic commerce: AI may propose actions, deterministic policy and human approval constrain authorization, and Razorpay executes the resulting payment. This handoff covers the current application source, local validation, and deployment prerequisites; it does not certify a production deployment.

Repository documentation, tracked source/history, and the available remote code search did not contain a verifiable DataFactor/DataFactory definition, rubric, evaluation criteria, or score. The referenced initial score of 35.4/100 could not be verified. No benchmark comparison or final score is claimed.

### Evidence snapshot

**Source-reviewed controls (not deployment proof):**

- Authentication uses provisioned accounts rather than public registration; role checks restrict privileged actions, CSRF protects browser state changes, and sessions use secure cookies with expiry/revocation.
- Payment operations enforce approval and server-side state checks. Razorpay mode selection is explicit in production, test/live credentials and webhook secrets are mode-specific, and unsafe configuration fails closed.
- Webhook handling verifies signatures, deduplicates events, supports retry/recovery, and guards payment-state transitions against late failure events. Audit and payment records use idempotency protections.
- Database indexes are initialized before serving; health reports database readiness. Request IDs are returned for correlation and request/error logs omit query strings.

These are source-level findings, not proof that the controls have been exercised in a deployed environment.

**Locally verified on this handoff:** backend and frontend typechecks and production builds passed; both dependency audits reported zero vulnerabilities; Compose configuration parsed successfully; package/lockfile name and version checks matched; `git diff --check` passed. The frontend build emitted a Tailwind configuration warning but completed successfully.

**Not verified:** backend tests were not run because MongoDB is stopped and `127.0.0.1:27017` is unreachable; no test totals are available for this handoff. Docker Compose configuration validation did not exercise the Docker runtime; Docker Desktop's daemon is unavailable. GitHub Actions reports zero workflows and zero runs, so the local CI definition is not CI-verified. No staging environment or credentials were configured. No production deployment, live-provider request, backup/restore, or rollback was tested.

### Release blockers and owner actions

Before any production release, the owner must:

1. Make the reviewed CI workflow available on the intended GitHub branch through the normal repository process, then verify successful CI for the exact release candidate.
2. Run the complete backend suite against an isolated, reachable test MongoDB and record its actual pass/fail/cancelled/skipped totals.
3. Provide a dedicated staging environment and verify authentication, roles, CSRF, session expiry/revocation, health/readiness, payment approvals, webhook signatures/retries/idempotency, sanitized diagnostics, and restore/rollback using dummy data and Razorpay test mode only.
4. Verify production TLS termination and trusted proxy hop count; configure managed secrets and authenticated, least-privilege MongoDB access with network restrictions, encrypted backups, and a successful restore test.
5. Verify deployment monitoring and incident ownership. Use a shared login rate-limit store before running multiple backend replicas; the current limiter is process-local and resets on restart.
6. Pin mutable container base-image tags by digest, build the candidate images, and verify container startup and runtime behavior before release.

The rollback checklist below remains mandatory: retain prior image/configuration, check database compatibility, reconcile provider state before retrying or replaying payment work, and do not overwrite newer payment/order state with an old snapshot. The required next action is to **hold production release** until the owner has evidence for these gates and reviews this NO-GO decision.

## Before approving a release candidate

- [ ] Review the exact source revision and worktree. Confirm each `package.json` version matches its lockfile; install with `npm ci`.
- [ ] Run the CI-equivalent backend typecheck, production build, and full tests, plus frontend typecheck and production build. Backend tests must use an isolated disposable MongoDB database and dummy Razorpay test credentials; provider calls are mocked.
- [ ] Confirm the blocking `npm audit --audit-level=low` steps pass in CI for both `server/` and `client/`, and rerun them locally when changing dependencies.
- [ ] Run `docker compose config --quiet`. For container distribution, build from the reviewed source revision, record image digests, and run image/runtime smoke tests. The Dockerfiles and Compose file currently use mutable base-image tags, so builds are not byte-for-byte reproducible; pin base images by digest before treating images as reproducible release artifacts.
- [ ] Confirm `.env*`, credentials, and local data are not staged or in build contexts. `.gitignore` excludes environment files except `.env.example`; both Docker build contexts exclude `.env*`. Supply secrets at runtime, never in source, image build arguments, or frontend variables.

## Deployment verification — required outside this repository

### Configuration and access

- [ ] Inject secrets through the deployment secret manager. Configure `MONGODB_URI`, `CLIENT_URL` (an HTTPS origin in production), `PORT` as needed, and `TRUST_PROXY_HOPS` for the real proxy chain. `LLM_API_KEY` is optional. Do not use the example or Compose dummy credentials in a deployment.
- [ ] For staging, use a dedicated database containing only dummy/test data, set `NODE_ENV=production` to exercise production HTTPS validation, and explicitly set `RAZORPAY_MODE=test` with Razorpay test credentials and the staging test webhook secret. Never set live mode or point staging at a production database.
- [ ] Provision the initial administrator against the intended database with `cd server` then `npm run provision-user`. Select the `admin` role and enter the password only at the hidden interactive prompt; do not put passwords in command arguments, shell history, or logs. Review and remove temporary provisioning access.
- [ ] Verify login, role authorization, CSRF protection for state-changing requests, logout/revocation, and session expiry. The session cookie is `Secure`, `HttpOnly`, `SameSite=Strict`, scoped to `/api`, and sessions expire after eight hours. Serve the app over HTTPS; the cookie settings are fixed by the application.
- [ ] Terminate TLS at a trusted ingress/reverse proxy and ensure it overwrites untrusted forwarded headers. Set `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops seen by Express (valid range `0`–`10`; default `0`). Do not trust client-supplied forwarding headers or copy the local Compose value without checking the production topology.

### Payments and data protection

- [ ] Keep test and live Razorpay credentials separate. Live operation requires `NODE_ENV=production`, explicit `RAZORPAY_MODE=live`, an `rzp_live_` key ID, its matching API secret, and `RAZORPAY_LIVE_WEBHOOK_SECRET`. Test mode uses `RAZORPAY_TEST_WEBHOOK_SECRET`. The application rejects a missing/invalid mode, mode/key-prefix mismatch, missing API credentials at payment creation, and a missing mode-specific webhook secret at webhook verification; verify the deployed secret values and webhook configuration before enabling payment traffic.
- [ ] Configure MongoDB authentication, TLS, network access controls, and least-privilege application credentials. The local Compose MongoDB has no authentication and is not a production configuration.
- [ ] **Deployment verification:** take a protected backup and perform a restore test using the deployment's documented recovery process. Confirm restore point, retention, access controls, and recovery ownership before handling customer or payment data.
- [ ] Review index/model changes before rollout. The application creates/verifies indexes during startup; confirm the target database permits this and that schema/index changes remain compatible with the prior application version.

### Runtime and incident readiness

- [ ] **Deployment verification:** build and start the exact candidate images in a non-production environment. Smoke-test frontend access and `/api/health`; confirm the health endpoint reports MongoDB connected, authenticated routes and CSRF behavior work, and no live payment is initiated. Compose's frontend is bound to `127.0.0.1:8080`; backend and MongoDB ports are not published to the host.
- [ ] Confirm operators can retrieve service logs and correlate an incident using the response `X-Request-ID`. Request logs include method, path (without query string), status, and duration; do not add payment payloads, credentials, cookies, or provider response bodies to diagnostics.
- [ ] Exercise the deployment's graceful shutdown/restart and alerting procedures. `/api/health` returns `200` when MongoDB is connected and `503` otherwise. Login rate limiting is process-local and resets on restart; configure a shared store before deploying multiple backend replicas.
- [ ] Prepare an incident owner and escalation path for payment/webhook uncertainty. Reconcile provider state before retrying or replaying payment operations; webhook processing is recoverable and idempotent by event, but is not a distributed exactly-once transaction.

## Rollback and post-release verification

- [ ] Retain the previous application image digests and deployment configuration. Define the platform-specific traffic switch/rollback steps and verify that the previous application version is compatible with current database indexes and data.
- [ ] If payment or webhook state is uncertain, pause affected payment activity and reconcile against the provider before resuming. Do not blindly replay events or restore an old database snapshot: doing so can lose or contradict payments, webhook records, and audit history. Restore data only under the verified recovery plan with an explicit data-loss assessment.
- [ ] After rollout or rollback, verify health/readiness, login and privileged access, request-ID logging, webhook processing, and relevant audit records. Record the deployed revision/image digests and any incidents.

## Non-production staging verification

No staging URL, platform, database, or credentials are configured by this repository. Run these checks only after an authorized operator provides an isolated staging environment and confirms it uses dummy/test data and Razorpay test mode. These checks are deployment evidence, not a substitute for the local test suite.

### Safe baseline checks

In PowerShell, set the URL to the operator-provided HTTPS staging origin; do not include credentials or query parameters:

```powershell
$BaseUrl = "https://<staging-host>"
$health = Invoke-RestMethod -Uri "$BaseUrl/api/health"
if ($health.status -ne "ok" -or $health.mongodb -ne "connected") {
  throw "Staging health/readiness check failed."
}
"health=$($health.status) mongodb=$($health.mongodb)"

$status = & curl.exe -sS -o NUL -w "%{http_code}" "$BaseUrl/api/payments"
if ($LASTEXITCODE -ne 0 -or $status -ne "401") {
  throw "Unauthenticated payment access was not rejected as expected."
}
"unauthenticated-payments=$status"
```

Confirm the deployed revision/image digest in the deployment platform and verify required environment-variable names are present in its secret/configuration manager without displaying values. Do not use a public diagnostics endpoint for configuration: none is provided.

### Authenticated, payment-safe checks

- [ ] Using staging-only accounts, confirm no public registration is available (`POST /api/auth/register` without a session is rejected with `401`) and a protected request without a session (`GET /api/payments`) returns `401`.
- [ ] Sign in as a staging viewer. Confirm permitted read-only pages work. Send a state-changing request with that session's valid CSRF token to `POST /api/actions/validate`, `POST /api/actions/approve`, or `POST /api/payments/create`; each must be denied with `403`. Do not copy session cookies or CSRF tokens into tickets, shell history, screenshots, or shared logs.
- [ ] Confirm a state-changing request without a CSRF token returns `403`. Sign out through the application, then confirm `GET /api/auth/session` returns `401`. Confirm the login response's `expiresAt` is eight hours after session creation; do not wait for or weaken production session expiry solely for this check.
- [ ] Provision staging administrator/approver accounts only through `server/src/scripts/provision-user.ts` (`npm run provision-user` from `server/`) against the staging database. The tool requires an interactive terminal and hides password entry. Never put passwords in command arguments or logs.
- [ ] Exercise an approval/payment flow using a deterministic provider mock in the automated integration suite, or use Razorpay **test mode only** with explicit operator authorization, dummy/test entities, and the staging test webhook secret. Verify payment state and audit records; do not create real charges or use live credentials.
- [ ] Verify missing/invalid webhook signatures are rejected (`401`), and use test-signed duplicate/retry deliveries to confirm one final transition and idempotent audit behavior. Confirm a late failure cannot regress a `PAID` order. Do not replay live or production webhooks.
- [ ] Correlate a response's `X-Request-ID` with backend logs. Confirm logs contain no query-string values, cookies, CSRF tokens, credentials, or payment/webhook payloads.
- [ ] In staging only, exercise the documented backup and restore procedure with disposable test data. Record the restore result and data loss assessment; do not restore an older snapshot over newer payment/order state.
- [ ] Record tested rollback steps, prior image digest, and database compatibility assessment. A rollback must not blindly overwrite newer application data.

Tests that require the staging host, configured identity accounts, Razorpay test webhook delivery, deployment logs, or a functioning MongoDB deployment remain blocked until an operator supplies and authorizes that environment.

## Current limitations

- No production deployment, release, or publishing workflow is defined here.
- The Compose stack is local development only and uses unauthenticated MongoDB and Razorpay test mode.
- No production infrastructure, live Razorpay transaction/webhook, backup, restore, or container runtime has been verified by this checklist.
- Mutable Docker base-image tags prevent a claim of byte-for-byte reproducible images until pinned and recorded.
