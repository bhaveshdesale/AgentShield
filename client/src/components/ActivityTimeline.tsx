import type { AuditLogEntry } from "../types";

interface ActivityTimelineProps {
  logs: AuditLogEntry[];
}

const eventLabels: Record<string, string> = {
  ACTION_VALIDATED: "Action validated",
  ACTION_BLOCKED: "Action blocked",
  ACTION_APPROVED: "Action approved",
  PAYMENT_LINK_CREATION_STARTED: "Payment link creation started",
  PAYMENT_LINK_CREATED: "Payment link created",
  PAYMENT_EXECUTION_FAILED: "Payment execution failed",
  PAYMENT_EXECUTION_UNKNOWN: "Payment execution unknown",
  ORDER_PAYMENT_CONFIRMED: "Payment confirmed",
  ORDER_PAYMENT_FAILED: "Payment failed",
  RECOVERY_STARTED: "Recovery started",
  RECOVERY_PAYMENT_FOUND: "Payment found during recovery",
  RECOVERY_PAYMENT_CONFIRMED: "Payment confirmed during recovery",
  RECOVERY_SAFE_RETRY: "Safe retry initiated",
  RECOVERY_RETRY_FAILED: "Recovery retry failed",
  RECOVERY_UNRESOLVED: "Recovery unresolved",
  WEBHOOK_RECEIVED: "Webhook received",
  WEBHOOK_VERIFIED: "Webhook verified",
  WEBHOOK_IGNORED: "Webhook ignored",
  WEBHOOK_DUPLICATE: "Duplicate webhook",
  WEBHOOK_UNKNOWN_ORDER: "Unknown order in webhook",
  WEBHOOK_MALFORMED: "Malformed webhook",
  WEBHOOK_INVALID_SIGNATURE: "Invalid webhook signature",
};

function getEventLabel(event: string): string {
  return eventLabels[event] ?? event.replace(/_/g, " ");
}

function getEventIcon(event: string): string {
  if (event.includes("CONFIRMED") || event.includes("CREATED") || event.includes("PAID")) return "✓";
  if (event.includes("FAILED") || event.includes("BLOCKED")) return "✕";
  if (event.includes("REQUIRED") || event.includes("STARTED") || event.includes("UNKNOWN")) return "⚠";
  if (event.includes("RECOVERY")) return "↻";
  if (event.includes("WEBHOOK")) return "⧈";
  return "•";
}

interface ActivityTimelineProps {
  logs: AuditLogEntry[];
}

export default function ActivityTimeline({ logs }: ActivityTimelineProps) {
  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-400">
        <p className="text-sm">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="flow-root">
      <ul className="-mb-2">
        {logs.map((log) => (
          <li key={log._id} className="relative pb-4">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-neutral-200" />
            <div className="relative flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs">
                {getEventIcon(log.event)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-neutral-900">{getEventLabel(log.event)}</p>
                  <time className="text-xs text-neutral-400">{new Date(log.timestamp).toLocaleString()}</time>
                </div>
                {log.details && (
                  <pre className="mt-0.5 text-xs text-neutral-500 whitespace-pre-wrap">
                    {JSON.stringify(log.details, null, 0)}
                  </pre>
                )}
                {log.actionId && (
                  <div className="mt-0.5 text-xs text-neutral-400">
                    Action: {log.actionId}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
