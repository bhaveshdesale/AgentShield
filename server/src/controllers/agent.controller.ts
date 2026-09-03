import type { NextFunction, Request, Response } from "express";
import { MerchantModel } from "../models/Merchant";
import { evaluateAction } from "../services/policy.service";
import { runAgentChat, type AgentRecommendation } from "../services/agent.service";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import type { ActionProposalInput, PolicyEvaluationResult } from "../types/domain";

interface AgentChatRequestBody {
  message?: unknown;
  conversationId?: unknown;
}

export interface AgentChatResponse {
  conversationId: string;
  /** "llm" = real LLM response, "fallback" = deterministic demo agent. */
  source: "llm" | "fallback";
  message: string;
  recommendations: AgentRecommendation[];
  /** 1. AI PROPOSAL — non-authoritative; validated below. */
  proposal: ActionProposalInput | undefined;
  /** 2. POLICY RESULT — deterministic server-side authorization. */
  policyResult: PolicyEvaluationResult | undefined;
}

export async function agentChat(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as AgentChatRequestBody;
    const message = typeof body.message === "string" ? body.message : "";
    const conversationId =
      typeof body.conversationId === "string" && body.conversationId.trim().length > 0
        ? body.conversationId.trim()
        : undefined;

    if (message.trim().length === 0) {
      throw new AppError(
        'Field "message" is required and must be a non-empty string.',
        400,
        "INVALID_REQUEST"
      );
    }

    // 1. AI PROPOSAL — the agent can only propose.
    const agentResult = await runAgentChat(
      conversationId === undefined ? { message } : { message, conversationId }
    );

    // 2. POLICY RESULT — deterministic authorization. No payment is ever
    // executed here regardless of the decision.
    let policyResult: PolicyEvaluationResult | undefined;
    if (agentResult.proposal) {
      const merchant = await MerchantModel.findOne().sort({ createdAt: 1 });
      if (!merchant) {
        throw new AppError(
          "Demo merchant not found. Run the seed script (npm run seed) before chatting.",
          503,
          "MERCHANT_NOT_FOUND"
        );
      }
      policyResult = await evaluateAction(agentResult.proposal, merchant.policy);
    }

    logger.info("Agent chat completed", {
      conversationId: agentResult.conversationId,
      source: agentResult.source,
      hasProposal: agentResult.proposal !== undefined,
      policyDecision: policyResult?.decision ?? "NO_PROPOSAL",
    });

    const responseBody: AgentChatResponse = {
      conversationId: agentResult.conversationId,
      source: agentResult.source,
      message: agentResult.message,
      recommendations: agentResult.recommendations,
      proposal: agentResult.proposal,
      policyResult,
    };

    res.status(200).json(responseBody);
  } catch (error) {
    next(error);
  }
}