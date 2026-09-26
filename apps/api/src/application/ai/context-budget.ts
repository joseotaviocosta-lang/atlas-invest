import { HttpException, HttpStatus } from '@nestjs/common';
import { AIMessage, AI_DEFAULT_MAX_CONTEXT_BYTES, validateContextBudget } from '@atlas/ai-engine';

/**
 * Total Provider Context Budget Governance (ADR-207).
 *
 * Single authoritative pre-provider budget decision for the ENTIRE provider payload.
 *
 * The measured object is exactly the `AIMessage[]` array handed to `AIProvider.complete`,
 * so the byte count covers the complete request boundary: system policy, bounded
 * conversation history, current grounding facts, timeline events and the user question.
 *
 * Event-level caps (e.g. MAX_AI_TIMELINE_EVENTS) remain earlier deterministic bounds,
 * but they are NOT the final gate — this total measurement is.
 *
 * Boundary semantics are inclusive: <= max is allowed, > max is blocked.
 */
export function resolveMaxContextBytes(): number {
  if (!process.env.AI_MAX_CONTEXT_BYTES) {
    return AI_DEFAULT_MAX_CONTEXT_BYTES;
  }
  const parsed = parseInt(process.env.AI_MAX_CONTEXT_BYTES, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : AI_DEFAULT_MAX_CONTEXT_BYTES;
}

/**
 * Canonical measurement expression for the total provider context payload.
 */
export function measureProviderContextBytes(messages: readonly AIMessage[]): number {
  return Buffer.byteLength(JSON.stringify(messages), 'utf8');
}

export interface ProviderContextBudgetDecision {
  readonly ok: boolean;
  readonly sizeBytes: number;
  readonly maxBytes: number;
}

/**
 * Evaluates the total provider context budget. Pure decision, no side effects.
 */
export function evaluateProviderContextBudget(
  messages: readonly AIMessage[],
  maxBytes: number = resolveMaxContextBytes(),
): ProviderContextBudgetDecision {
  return validateContextBudget(measureProviderContextBytes(messages), maxBytes);
}

/**
 * Builds the canonical over-budget HttpException (400 AI.CONTEXT_BUDGET_EXCEEDED).
 */
export function contextBudgetExceededException(
  decision: ProviderContextBudgetDecision,
): HttpException {
  return new HttpException(
    {
      message: `AI request context size (${decision.sizeBytes} bytes) exceeds budget limit (${decision.maxBytes} bytes)`,
      code: 'AI.CONTEXT_BUDGET_EXCEEDED',
      details: { sizeBytes: decision.sizeBytes, maxBytes: decision.maxBytes },
    },
    HttpStatus.BAD_REQUEST,
  );
}
