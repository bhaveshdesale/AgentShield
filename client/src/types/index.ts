export type PolicyDecision =
  | "ALLOW"
  | "BLOCK"
  | "ESCALATE";

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "NOT_REQUIRED";

export type ExecutionStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUCCEEDED"
  | "FAILED"
  | "UNKNOWN"
  | "RECOVERED"
  | "BLOCKED";

export const ORDER_STATUSES = [
  "CREATED",
  "AWAITING_PAYMENT",
  "PAID",
  "FAILED",
  "UNKNOWN",
  "RECOVERING",
  "RECOVERED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Product {
  id: string;
  name: string;
  description: string;
  priceInPaise: number;
  currency: "INR";
  category: string;
  tags: string[];
  inventory: number;
  frequentlyBoughtWith: string[];
}

export interface ActionProposal {
  action: string;
  items: {
    productId: string;
    quantity: number;
  }[];
  proposedAmountInPaise: number;
  reason: string;
  requiresApproval: boolean;
  referenceId: string;
  discountPercent?: number;
}

export interface PolicyCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  reason: string;
  checks: PolicyCheck[];
  verifiedAmountInPaise: number;
  approvalRequired: boolean;
}

export interface AgentRecommendation {
  productId: string;
  name: string;
  priceInPaise: number;
  reason: string;
}

export interface AgentChatResponse {
  conversationId: string;
  source: "llm" | "fallback";
  message: string;
  recommendations: AgentRecommendation[];
  proposal?: ActionProposal;
  policyResult?: PolicyEvaluationResult;
}

export interface Action {
  _id: string;
  conversationId: string;
  referenceId: string;
  action: string;
  proposal: ActionProposal;
  reason: string;
  policyResult?: PolicyEvaluationResult;
  verifiedAmountInPaise: number;
  approvalRequired: boolean;
  discountPercent?: number;
  approvalStatus: ApprovalStatus;
  executionStatus: ExecutionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  actions: {
    evaluated: number;
    approved: number;
    blocked: number;
    escalated: number;
    recovered: number;
    failed: number;
    unknown: number;
  };

  orders: {
    paid: number;
    awaitingPayment: number;
  };

  auditEvents: number;
}

export interface AuditLogEntry {
  _id: string;
  actionId?: string;
  actorId?: string;
  actorEmail?: string;
  event: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface PaymentItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceInPaise: number;
}

export interface PaymentResult {
  success: true;
  actionId: string;
  orderId: string;
  paymentLinkId: string;
  paymentLink: string;
  status: string;
}

export interface PaymentStatus {
  orderId: string;
  status: OrderStatus;
  amountInPaise: number;
  currency?: "INR";
  referenceId: string;

  items?: PaymentItem[];

  paymentLinkId?: string;
  paymentLink?: string;
  razorpayPaymentId?: string;
  razorpayStatus?: string;

  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentHistoryItem extends PaymentStatus {
  currency: "INR";
  items: PaymentItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ApproveActionResponse {
  success: true;
  actionId: string;
  approvalStatus?: string;
}