# Developer setup

This guide describes the commands and local services configured by the repository. CI and Docker build/runtime stages use Node.js 22. The backend application package declares Node.js `>=18`, but the lint/coverage toolchain requires Node.js `>=22.15.0`; use Node.js 22.15 or newer for the full check suite. Non-Docker deployments should continue to use their separately verified runtime configuration.

## Install

From the repository root:

```text
cd server
npm ci
cd ../client
npm ci
```

## Configure and run locally

### Backend

Copy `server/.env.example` to `server/.env` and set `MONGODB_URI` to a MongoDB database for local development. For example, from the repository root:

```powershell
Copy-Item server\.env.example server\.env
```

```sh
cp server/.env.example server/.env
```

The example configures `PORT=5050`, `CLIENT_URL=http://localhost:5173`, `LLM_TIMEOUT_MS=30000`, and Razorpay test mode. `MONGODB_URI` must be set. Razorpay API credentials and webhook secrets are blank in the example; real Razorpay test credentials are needed only to make actual provider requests. `LLM_API_KEY` is optional; when absent, the backend uses its deterministic fallback agent. `LLM_BASE_URL` and `LLM_MODEL` can optionally select the OpenAI-compatible endpoint and model when using an API key. `LLM_TIMEOUT_MS` defaults to 30000 and must be an integer from 1 to 2147483647.

The backend requires a reachable MongoDB instance before it starts. Keep development data in a dedicated local database, for example `agentshield_dev`.

In one terminal:

```text
cd server
npm run dev
```

### Frontend

The Vite development server uses `http://localhost:5173` and proxies `/api` to `http://localhost:5050`. The default API base is `/api`, so no client environment file is required. If a custom API base is needed, use `client/.env.example` as the reference for `VITE_API_BASE_URL`; browser-exposed `VITE_` variables must not contain secrets.

In a second terminal:

```text
cd client
npm run dev
```

Open `http://localhost:5173`. The backend health endpoint is `http://localhost:5050/api/health`.

## Checks and tests

Run package commands from the indicated directory:

| Directory | Command | Purpose |
| --- | --- | --- |
| `server/` | `npm run lint` | ESLint |
| `server/` | `npm run typecheck` | TypeScript check without emitting |
| `server/` | `npm run build` | Compile to `server/dist/` |
| `server/` | `npm test` | Run backend tests serially |
| `server/` | `npm run test:coverage` | Run backend tests and report coverage |
| `client/` | `npm run lint` | ESLint |
| `client/` | `npm run typecheck` | TypeScript check without emitting |
| `client/` | `npm run build` | Typecheck and build the frontend |
| `client/` | `npm test` | Run frontend tests |
| `client/` | `npm run test:coverage` | Run frontend tests with coverage |
| repository root | `npm test` | Run client tests, then backend tests |

The client tests run in Vitest with jsdom and do not require the backend. The backend suite includes MongoDB-backed tests and requires an isolated, reachable test MongoDB. Several test suites replace the database name in the supplied URI with their own test database names; this does not make a shared MongoDB server safe. Set `MONGODB_TEST_URI` to a dedicated disposable MongoDB instance and never use production, shared, or the persistent Compose development database.

Example PowerShell setup for backend tests (use only when `127.0.0.1:27017` is a disposable MongoDB instance):

```powershell
Set-Location server
$env:NODE_ENV = "test"
$env:MONGODB_TEST_URI = "mongodb://127.0.0.1:27017/agentshield_test"
$env:MONGODB_URI = $env:MONGODB_TEST_URI
$env:RAZORPAY_MODE = "test"
$env:RAZORPAY_KEY_ID = "rzp_test_local_dummy"
$env:RAZORPAY_KEY_SECRET = "local-dummy-api-secret"
$env:RAZORPAY_TEST_WEBHOOK_SECRET = "local-dummy-webhook-secret"
Remove-Item Env:LLM_API_KEY -ErrorAction SilentlyContinue
npm test
```

The example Razorpay values are placeholders. Automated provider interactions are mocked by tests; do not substitute live credentials. `MONGODB_URI` is included because some backend suites can fall back to it, while others require `MONGODB_TEST_URI`.

### Coverage output

Backend coverage uses Monocart Coverage Reports. From `server/`, run `npm run test:coverage`; it prints a text summary and writes `server/coverage/lcov.info`. The configured report includes TypeScript implementation files under `server/src/` and filters test files and declaration files. No backend coverage percentage threshold is configured.

Client coverage uses Vitest's V8 provider and writes its reports under `client/coverage/`. The current include list and thresholds are in `client/vite.config.ts`; they apply per file to `Payments.tsx` and `PaymentDetail.tsx`, not to the entire client codebase.

## Docker Compose

Docker Desktop or Docker Engine with the Compose v2 plugin is required. From the repository root:

```text
docker compose up --build
```

The frontend is published on `127.0.0.1:8080`; it proxies API requests through Nginx to the backend. Compose starts MongoDB with a persistent named volume and configures Razorpay test mode with dummy defaults. This is a local development stack, not a test database: integration tests should use a separate disposable MongoDB instance.

Stop the services with `docker compose down`. `docker compose down -v` deletes the persistent MongoDB volume and its data; use it only when that local data is no longer needed.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`. It uses Node.js 22, installs each package with `npm ci`, runs low-severity dependency audits, then runs lint, typecheck, build, and coverage-enabled tests for backend and client. The workflow provisions MongoDB 7.0 and uses dummy Razorpay test values. Backend LCOV coverage is uploaded as the `backend-coverage-lcov` artifact when generated. A workflow file alone does not establish that a remote CI run succeeded.
