# AgentShield
## Software Requirements Specification
### Razorpay AI Builder Internship 2026

**Version:** 1.0
**Status:** MVP Specification

---

# 1. Product Overview

## 1.1 Product Name

AgentShield

## 1.2 Product Tagline

> AI can propose. Deterministic systems authorize. Razorpay executes.

## 1.3 Product Description

AgentShield is a runtime trust and reliability layer for AI-powered agentic commerce.

It allows an AI agent to understand customer intent and propose financial actions while preventing the AI from directly controlling financial execution.

Before any financial action reaches Razorpay, AgentShield independently validates the action against deterministic merchant policies, verifies financial information, applies approval requirements, and records an audit trail.

---

# 2. Problem Statement

AI agents are evolving from systems that only answer questions into systems that can take actions.

In commerce, an AI agent may eventually:

1. Understand customer intent.
2. Search products.
3. Recommend products.
4. Build a transaction.
5. Create a payment.

However, AI-generated decisions are not inherently trustworthy enough to receive unrestricted financial authority.

Potential problems include:

- incorrect product selection
- incorrect price
- stale information
- excessive discounts
- unauthorized actions
- transactions exceeding merchant limits
- duplicate payment attempts
- malicious instructions in product/customer content
- uncertain payment states after network failure
- lack of accountability and auditability

AgentShield addresses this problem by separating AI reasoning from financial authority.

---

# 3. Goal

Build a working MVP demonstrating that a merchant can safely allow an AI agent to participate in commerce without giving the AI unrestricted access to payment infrastructure.

---

# 4. Primary Objectives

1. Use AI for customer-intent understanding and commerce reasoning.
2. Generate structured financial action proposals.
3. Validate all financial actions deterministically.
4. Enforce merchant-defined limits.
5. Require explicit approval for financial actions.
6. Integrate Razorpay Test Mode.
7. Verify payment events through webhooks.
8. Maintain an auditable action history.
9. Safely handle at least one payment failure.
10. Demonstrate unsafe-agent behavior being blocked.

---

# 5. Target Users

## Merchant

A merchant that wants to use AI agents for commerce without giving them unrestricted financial authority.

## Customer

A customer interacting with the AI commerce agent.

## Reviewer / Developer

A person evaluating the reliability, architecture, AI judgment, and failure handling of the system.

---

# 6. MVP Scope

## In Scope

### AI

- Natural-language shopping conversation
- Product search
- Product recommendation
- Cross-sell recommendation
- Structured action proposals
- Reason explanations

### AgentShield

- Product validation
- Price validation
- Inventory validation
- Transaction limit
- Discount limit
- Action permissions
- Duplicate detection
- Approval gate
- Audit trail

### Razorpay

- Test-mode Payment Link creation
- Payment status lookup
- Webhook handling
- Webhook verification
- Duplicate webhook protection

### Failure Recovery

- Unknown payment state handling
- Payment status verification
- Safe retry decision

### Demonstration

- Safety simulation
- Predefined edge cases

---

# 7. Out of Scope

The following are intentionally excluded from MVP:

- Production payments
- Real-money transactions
- Full authentication system
- Multi-tenant SaaS architecture
- WhatsApp
- Voice
- Custom fraud ML
- Custom foundation models
- Refund automation
- Payout automation
- Subscription management
- Kubernetes
- Microservices
- Redis
- Kafka
- Complex event infrastructure
- Full e-commerce platform

---

# 8. Core Architecture

```text
Customer
    |
    v
AI Agent
    |
    v
Structured Action Proposal
    |
    v
AgentShield
    |
    +--> Price Validation
    +--> Inventory Validation
    +--> Policy Validation
    +--> Permission Check
    +--> Duplicate Check
    +--> Approval Requirement
    |
    v
Approval
    |
    v
Razorpay Test API
    |
    v
Payment
    |
    v
Razorpay Webhook
    |
    v
Webhook Verification
    |
    v
Order State Update
    |
    v
Audit Trail
```

---

# 9. AI Responsibility Boundary

## AI IS responsible for:

- intent understanding
- product discovery
- product recommendation
- cross-sell reasoning
- explanation
- financial action proposal

## AI IS NOT responsible for:

- final amount calculation
- transaction authorization
- merchant policy
- approval
- payment execution
- payment verification
- financial state

---

# 10. Merchant Policy

Default MVP policy:

```json
{
  "maxTransactionAmount": 5000,
  "maxDiscountPercent": 10,
  "requireHumanApproval": true,
  "allowRefunds": false,
  "allowPayouts": false
}
```

---

# 11. Functional Requirements

## FR-01 — Customer Conversation

The system shall allow customers to submit natural-language commerce requests.

Example:

> "I need a coffee gift under ₹2500."

## FR-02 — Product Search

The AI agent shall search the merchant catalog.

## FR-03 — Product Recommendation

The AI agent shall recommend relevant products.

## FR-04 — Cross-Sell

The AI agent may recommend a related product where appropriate.

## FR-05 — Structured Action Proposal

The AI shall return a structured proposal.

Example:

```json
{
  "action": "CREATE_PAYMENT",
  "items": [],
  "proposedAmount": 1799,
  "reason": "Customer explicitly requested the product",
  "requiresApproval": true
}
```

## FR-06 — Price Verification

The server shall calculate authoritative pricing using database values.

## FR-07 — Inventory Verification

The server shall verify availability before payment execution.

## FR-08 — Transaction Limit

The system shall block transactions above the configured merchant limit.

## FR-09 — Discount Validation

The system shall block discounts above the configured merchant limit.

## FR-10 — Permission Validation

The system shall ensure the proposed action is allowed by merchant policy.

## FR-11 — Approval Gate

The system shall require explicit approval before executing a financial action when policy requires approval.

## FR-12 — Razorpay Payment Link

The server shall create a Razorpay Test Mode Payment Link only after validation and required approval.

## FR-13 — Payment Status

The server shall be able to retrieve payment state.

## FR-14 — Webhook Validation

The system shall validate Razorpay webhook authenticity.

## FR-15 — Webhook Idempotency

Repeated webhook events shall not cause repeated state transitions.

## FR-16 — Audit Trail

Every important financial action shall create an audit record.

## FR-17 — Failure Recovery

The system shall resolve uncertain payment states before retrying.

## FR-18 — Safety Simulation

The system shall support predefined safety scenarios.

---

# 12. Safety Scenarios

## Scenario 1 — Valid Transaction

- Product: Coffee Kit
- Price: ₹1,799

Expected: **APPROVED**

## Scenario 2 — Spending Limit Violation

- Product: Laptop
- Price: ₹48,999
- Merchant limit: ₹5,000

Expected: **BLOCKED**

## Scenario 3 — Price Mismatch

- LLM proposal: ₹44,999
- Verified product price: ₹49,999

Expected: **BLOCKED**

## Scenario 4 — Excessive Discount

- AI proposes: 50% discount
- Merchant policy: 10% maximum

Expected: **BLOCKED**

## Scenario 5 — Duplicate Payment

Existing payment already associated with transaction reference.

Expected: Existing state reused; duplicate creation prevented.

## Scenario 6 — Missing Inventory

Requested product has: inventory = 0

Expected: **BLOCKED**

## Scenario 7 — Unauthorized Action

Agent proposes an action not permitted by policy.

Expected: **BLOCKED**

## Scenario 8 — Malformed AI Output

AI response does not match required structured schema.

Expected: **REJECTED** safely.

## Scenario 9 — Payment Timeout

Razorpay request returns uncertain/timeout condition.

Expected: Payment state checked before retry.

## Scenario 10 — Recovery

Existing payment discovered after timeout.

Expected: Existing payment reused and audit trail updated.

---

# 13. Main User Flows

## 13.1 Normal Purchase

```text
Customer request
      ↓
AI understands intent
      ↓
AI searches catalog
      ↓
AI recommends product
      ↓
AI proposes action
      ↓
AgentShield validates
      ↓
User approves
      ↓
Razorpay Payment Link
      ↓
Payment
      ↓
Webhook
      ↓
Order marked PAID
      ↓
Audit log
```

## 13.2 Blocked Purchase

```text
Customer request
      ↓
AI proposes action
      ↓
AgentShield validates
      ↓
Policy violation
      ↓
BLOCK
      ↓
No Razorpay call
      ↓
Audit log
```

## 13.3 Recovery Flow

```text
Payment request
      ↓
Timeout
      ↓
Unknown state
      ↓
Query payment
      ↓
Payment exists?
    /       \
  YES        NO
   |          |
Reuse       Safe retry
```

---

# 14. Data Models

## Merchant

- _id
- name
- policy
- createdAt
- updatedAt

## Product

- _id
- name
- description
- price
- currency
- category
- tags
- inventory
- frequentlyBoughtWith
- createdAt
- updatedAt

## Order

- _id
- items
- amount
- currency
- status
- referenceId
- razorpayPaymentLinkId
- createdAt
- updatedAt

## AgentAction

- _id
- conversationId
- action
- proposal
- reason
- policyResult
- approvalStatus
- executionStatus
- createdAt
- updatedAt

## AuditLog

- _id
- actionId
- event
- details
- timestamp

---

# 15. API Requirements

```text
POST /api/agent/chat

GET /api/products
GET /api/products/:id

POST /api/actions/validate
POST /api/actions/approve

POST /api/payments/create
GET /api/payments/:id/status

POST /api/webhooks/razorpay

GET /api/audit
GET /api/dashboard/stats

POST /api/simulation/run

GET /api/health
```

---

# 16. Frontend Requirements

## Page 1 — Agent Playground

Customer interacts with AI.

Must display:

- customer messages
- AI responses
- recommended products
- proposed transaction
- action state

## Page 2 — Action Review

Display:

- action type
- products
- authoritative amount
- AI reason
- validation checks
- policy checks
- approval controls
- final decision

## Page 3 — Control Center

Display:

- evaluated actions
- approved
- blocked
- escalated
- recovered failures
- recent audit events

## Page 4 — Safety Lab

Display:

- test scenario
- proposed action
- policy result
- reason
- result summary

---

# 17. Non-Functional Requirements

## Security

- secrets server-side only
- webhook verification
- server-side financial validation
- no direct LLM financial execution

## Reliability

- duplicate protection
- safe retry logic
- deterministic policy enforcement

## Maintainability

- business logic in services
- type-safe interfaces
- clear module boundaries

## Usability

- clear action states
- understandable validation results
- clear error messages

---

# 18. Technology Stack

## Frontend

React + TypeScript

## Styling

Tailwind CSS

## Backend

Node.js + Express + TypeScript

## Database

MongoDB + Mongoose

## AI

LLM API with structured output/tool calling

## Payments

Razorpay Test API

## Version Control

Git + GitHub

---

# 19. Success Criteria

MVP is complete when:

1. AI understands a purchase request.
2. AI searches the catalog.
3. AI recommends a product.
4. AI generates a structured action proposal.
5. Backend independently validates amount.
6. Unsafe actions are blocked.
7. Approval works.
8. Approved actions create Razorpay Test Payment Links.
9. Webhooks update payment state.
10. Duplicate events are handled safely.
11. Audit records exist.
12. Payment failure recovery works.
13. Safety simulation works.
14. Demo is reproducible within five minutes.
15. Project can be explained clearly in a technical pitch.

---

# 20. Project Principle

> AI can propose. Deterministic systems authorize. Razorpay executes.

This principle must remain true throughout the implementation.

Save.

---

# Appendix — `.gitignore`

Open `.gitignore` and make sure it contains:

```gitignore
node_modules/
.env
.env.*
!.env.example

dist/
build/

.vscode/
.DS_Store

coverage/

*.log
npm-debug.log*
```