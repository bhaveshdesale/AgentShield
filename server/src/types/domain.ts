import type { Types } from "mongoose";

export const CURRENCIES = ["INR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ORDER_STATUSES = [
  "CREATED",
  "AWAITING_PAYMENT",
  "PAID",
  "FAILED",
  "UNKNOWN",
  "RECOVERED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const AGENT_ACTION_TYPES = ["CREATE_PAYMENT", "CREATE_REFUND", "CREATE_PAYOUT"] as const;
export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number];

export const POLICY_DECISIONS = ["ALLOW", "BLOCK", "ESCALATE"] as const;
export type PolicyDecision = (typeof POLICY_DECISIONS)[number];

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "NOT_REQUIRED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const EXECUTION_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUCCEEDED",
  "FAILED",
  "UNKNOWN",
  "RECOVERED",
  "BLOCKED",
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export interface MerchantPolicy {
  maxTransactionAmount: number;
  maxDiscountPercent: number;
  requireHumanApproval: boolean;
  allowRefunds: boolean;
  allowPayouts: boolean;
}

export interface Merchant {
  name: string;
  policy: MerchantPolicy;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  name: string;
  description: string;
  priceInPaise: number;
  currency: Currency;
  category: string;
  tags: string[];
  inventory: number;
  frequentlyBoughtWith: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  productId: Types.ObjectId;
  quantity: number;
  unitPriceInPaise: number;
}

export interface Order {
  items: OrderItem[];
  amountInPaise: number;
  currency: Currency;
  status: OrderStatus;
  referenceId: string;
  razorpayPaymentLinkId: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProposalItem {
  productId: Types.ObjectId;
  quantity: number;
}

export interface ActionProposal {
  action: AgentActionType;
  items: ProposalItem[];
  proposedAmountInPaise: number;
  reason: string;
  requiresApproval: boolean;
}

export interface PolicyCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface PolicyResult {
  decision: PolicyDecision;
  checks: PolicyCheck[];
}

export interface AgentAction {
  conversationId: string;
  action: AgentActionType;
  proposal: ActionProposal;
  reason: string;
  policyResult: PolicyResult | undefined;
  approvalStatus: ApprovalStatus;
  executionStatus: ExecutionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogDetails {
  conversationId?: string;
  actionType?: string;
  proposedAmountInPaise?: number;
  verifiedAmountInPaise?: number;
  policyDecision?: PolicyDecision;
  approvalState?: ApprovalStatus;
  executionState?: ExecutionStatus;
  razorpayIdentifier?: string;
  errorCategory?: string;
  recoveryNote?: string;
}

export interface AuditLog {
  actionId: Types.ObjectId | undefined;
  event: string;
  details: AuditLogDetails;
  timestamp: Date;
}
