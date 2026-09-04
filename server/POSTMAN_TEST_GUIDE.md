# AgentShield Postman Test Suite

## Scope
This collection tests only the API endpoints listed in `AGENTSHIELD_SRS.md`.

### SRS endpoints
- POST /api/agent/chat
- GET /api/products
- GET /api/products/:id
- POST /api/actions/validate
- POST /api/actions/approve
- POST /api/payments/create
- GET /api/payments/:id/status
- POST /api/webhooks/razorpay
- GET /api/audit
- GET /api/dashboard/stats
- POST /api/simulation/run
- GET /api/health

## Prerequisites
1. MongoDB is running.
2. `server/.env` exists with `MONGODB_URI` and `PORT=5050`.
3. Run `npm install`.
4. Run `npm run seed`.
5. Run `npm run dev`.
6. Import `AgentShield_Backend_Test.postman_collection.json` into Postman.
7. Set collection variable `webhookSecret` to the same value as `RAZORPAY_WEBHOOK_SECRET`.
8. For the real payment-link success path, configure Razorpay Test Mode credentials in the server `.env`.

## Run
Use Postman Collection Runner and run the entire collection in order.

The collection automatically chains:
`products -> product IDs -> actionId -> orderId/paymentLinkId -> webhook`.

Expected security behavior:
- Valid coffee purchase: ALLOW.
- Laptop over limit: BLOCK.
- Tampered price: BLOCK.
- Excessive discount: BLOCK.
- Out-of-stock product: BLOCK.
- Unauthorized payout: BLOCK.
- Malformed proposal: HTTP 400.
- Explicit approval: APPROVED, execution remains NOT_STARTED.
- Payment creation: Razorpay Test Mode only after approval.
- Repeated payment creation: BLOCKED.
- Invalid/missing webhook signatures: rejected.
- Repeated webhook event: idempotent.
- Safety simulation scenarios 1-10: executable without a real payment.
