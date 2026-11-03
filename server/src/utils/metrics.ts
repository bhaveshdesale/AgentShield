import type { PolicyDecision } from "../types/domain";

type PolicyDecisionLabel = "allow" | "block" | "review";

const policyDecisions: Record<PolicyDecisionLabel, number> = {
  allow: 0,
  block: 0,
  review: 0,
};
let paymentLinkCreationFailures = 0;
let webhookRetries = 0;

export function recordPolicyDecision(decision: PolicyDecision): void {
  const label: PolicyDecisionLabel =
    decision === "ALLOW"
      ? "allow"
      : decision === "BLOCK"
        ? "block"
        : "review";
  policyDecisions[label] += 1;
}

export function recordPaymentLinkCreationFailure(): void {
  paymentLinkCreationFailures += 1;
}

export function recordWebhookRetry(): void {
  webhookRetries += 1;
}

export function renderMetrics(): string {
  const lines = [
    "# HELP agentshield_policy_decisions_total Policy decisions by outcome.",
    "# TYPE agentshield_policy_decisions_total counter",
    ...Object.entries(policyDecisions).map(
      ([decision, count]) =>
        `agentshield_policy_decisions_total{decision="${decision}"} ${count}`,
    ),
    "# HELP agentshield_payment_link_creation_failures_total Failed provider payment-link creation attempts.",
    "# TYPE agentshield_payment_link_creation_failures_total counter",
    `agentshield_payment_link_creation_failures_total ${paymentLinkCreationFailures}`,
    "# HELP agentshield_webhook_retries_total Webhook retry processing attempts claimed.",
    "# TYPE agentshield_webhook_retries_total counter",
    `agentshield_webhook_retries_total ${webhookRetries}`,
  ];
  return `${lines.join("\n")}\n`;
}
