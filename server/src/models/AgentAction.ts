import mongoose, { Schema } from "mongoose";
import {
  AGENT_ACTION_TYPES,
  APPROVAL_STATUSES,
  EXECUTION_STATUSES,
  POLICY_DECISIONS,
  type ActionProposal,
  type AgentAction,
  type PolicyCheck,
  type PolicyResult,
  type ProposalItem,
} from "../types/domain";

const proposalItemSchema = new Schema<ProposalItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const actionProposalSchema = new Schema<ActionProposal>(
  {
    action: { type: String, required: true, enum: AGENT_ACTION_TYPES },
    items: { type: [proposalItemSchema], required: true, default: [] },
    proposedAmountInPaise: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true },
    requiresApproval: { type: Boolean, required: true },
  },
  { _id: false }
);

const policyCheckSchema = new Schema<PolicyCheck>(
  {
    name: { type: String, required: true },
    passed: { type: Boolean, required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const policyResultSchema = new Schema<PolicyResult>(
  {
    decision: { type: String, required: true, enum: POLICY_DECISIONS },
    checks: { type: [policyCheckSchema], required: true, default: [] },
  },
  { _id: false }
);

const agentActionSchema = new Schema<AgentAction>(
  {
    conversationId: { type: String, required: true, trim: true, index: true },
    action: { type: String, required: true, enum: AGENT_ACTION_TYPES },
    proposal: { type: actionProposalSchema, required: true },
    reason: { type: String, required: true },
    policyResult: { type: policyResultSchema },
    approvalStatus: { type: String, required: true, enum: APPROVAL_STATUSES, default: "PENDING" },
    executionStatus: { type: String, required: true, enum: EXECUTION_STATUSES, default: "NOT_STARTED" },
  },
  { timestamps: true }
);

export const AgentActionModel = mongoose.model<AgentAction>("AgentAction", agentActionSchema);
