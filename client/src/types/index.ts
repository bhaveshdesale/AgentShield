export type Currency = "INR";

export type OrderStatus =
  | "CREATED"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "FAILED"
  | "UNKNOWN"
  | "RECOVERED"
  | "CANCELLED";

export type PolicyDecision = "ALLOW" | "BLOCK" | "ESCALATE";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "NOT_REQUIRED";
export type ExecutionStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUCCEEDED"
  | "FAILED"
  | "UNKNOWN"
  | "RECOVERED"
  | "BLOCKED";

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPriceInPaise: number;
}

export interface Order {
  _id: string;
  items: OrderItem[];
  amountInPaise: number;
  currency: Currency;
  status: OrderStatus;
  referenceId: string;
  razorpayPaymentLinkId?: string;
  razorpayPaymentLinkUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  _id: string;
  name: string;
  description: string;
  priceInPaise: number;
  currency: Currency;
  category: string;
  tags: string[];
  inventory: number;
  frequentlyBoughtWith: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MerchantPolicy {
  maxTransactionAmount: number;
  maxDiscountPercent: number;
  requireHumanApproval: boolean;
  allowRefunds: boolean;
  allowPayouts: boolean;
}

export interface Merchant {
  _id: string;
  name: string;
  policy: MerchantPolicy;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRecommendation {
  productId: string;
  name: string;
  priceInPaise: number;
  reason: string;
}

export interface ActionProposal {
  action: string;
  items: { productId: string; quantity: number }[];
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

export interface AgentChatResponse {
  conversationId: string;
  source: "llm" | "fallback";
  message: string;
  recommendations: AgentRecommendation[];
  proposal: ActionProposal | undefined;
  policyResult: PolicyEvaluationResult | undefined;
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

export interface AuditLogDetails {
  [key: string]: string | number | boolean | undefined;
}

export interface AuditLogEntry {
  _id: string;
  actionId?: string;
  event: string;
  details: AuditLogDetails;
  timestamp: string;
}

export interface CreateActionResponse {
  actionId: string;
  decision: PolicyDecision;
  reason: string;
  checks: PolicyCheck[];
  verifiedAmountInPaise: number;
  approvalRequired: boolean;
}

export interface ApproveActionResponse {
  success: true;
  actionId: string;
  orderId: string;
  paymentLinkId: string;
  paymentLink: string;
  status: string;
}

export interface ReconcileResponse {
  orderId: string;
  status: string;
  paymentLinkId?: string;
  paymentLink?: string;
}

export interface ApiErrorBody {
  status: "error";
  code: string;
  message: string;
}

export type AgentStep =
  | "idle"
  | "searching"
  | "proposing"
  | "policy_checking"
  | "awaiting_approval"
  | "executing"
  | "awaiting_payment"
  | "paid"
  | "blocked"
  | "recovered"
  | "unknown";
