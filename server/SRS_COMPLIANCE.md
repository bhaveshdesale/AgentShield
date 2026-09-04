# AgentShield SRS Compliance Review

## Core principle
AI can propose. Deterministic systems authorize. Razorpay executes.

## Functional requirements
- FR-01 Customer Conversation: implemented by POST /api/agent/chat.
- FR-02 Product Search: implemented in the DB-backed agent service.
- FR-03 Product Recommendation: implemented by agent recommendations.
- FR-04 Cross-Sell: implemented by frequentlyBoughtWith recommendations, including deterministic fallback.
- FR-05 Structured Action Proposal: implemented and server-validated.
- FR-06 Price Verification: server recalculates from MongoDB.
- FR-07 Inventory Verification: deterministic policy check.
- FR-08 Transaction Limit: deterministic merchant policy check.
- FR-09 Discount Validation: deterministic merchant policy check.
- FR-10 Permission Validation: deterministic action permission check.
- FR-11 Approval Gate: explicit POST /api/actions/approve; approval does not itself call Razorpay.
- FR-12 Razorpay Payment Link: POST /api/payments/create executes only an explicitly approved action.
- FR-13 Payment Status: GET /api/payments/:id/status.
- FR-14 Webhook Validation: HMAC verification over the raw body.
- FR-15 Webhook Idempotency: unique event ID and duplicate-event handling.
- FR-16 Audit Trail: financial transitions write audit records; GET /api/audit exposes them.
- FR-17 Failure Recovery: UNKNOWN payment state is reconciled before a safe retry.
- FR-18 Safety Simulation: POST /api/simulation/run supports scenarios 1-10.

## SRS API surface
The public API surface contains only the endpoints listed in SRS section 15.

## Intentionally out of scope
No production payments, authentication system, multi-tenancy, WhatsApp, voice, custom fraud ML, refunds automation, payout automation, subscriptions, Kubernetes, microservices, Redis, Kafka, or complex event infrastructure are added.
