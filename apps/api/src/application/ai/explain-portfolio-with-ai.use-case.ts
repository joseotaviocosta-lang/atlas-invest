import { Inject, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import {
  classifyExplanationIntent,
  buildCompactConversationPrompt,
  resolveClaimReferences,
  resolveEvidenceReferences,
  validateExplanationEvidence,
  validateGroundedClaims,
  renderValidatedClaims,
  INTENT_REFUSAL_MESSAGES,
  GroundedAiExplanationResponseV1,
  AIProvider,
  GroundedClaimV1,
} from '@atlas/ai-engine';
import { GetPortfolioAiGroundingContextUseCase } from './get-portfolio-ai-grounding-context.use-case';
import { AI_PROVIDER_TOKEN } from '../../infrastructure/ai/openai-ai.provider';
import { contextBudgetExceededException, evaluateProviderContextBudget } from './context-budget';

export const ExplainPortfolioBodySchema = z.object({
  question: z
    .string()
    .min(3, { message: 'A pergunta deve conter pelo menos 3 caracteres.' })
    .max(2000, { message: 'A pergunta deve conter no máximo 2000 caracteres.' }),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be YYYY-MM-DD' })
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be YYYY-MM-DD' })
    .optional(),
});

export type ExplainPortfolioBody = z.infer<typeof ExplainPortfolioBodySchema>;

export const ExplainPortfolioInputSchema = ExplainPortfolioBodySchema.extend({
  portfolioId: z.string().uuid({ message: 'portfolioId must be a valid UUID' }),
  userId: z.string().min(1, { message: 'userId is required' }),
});

export type ExplainPortfolioInput = z.infer<typeof ExplainPortfolioInputSchema>;

const ClaimSegmentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('TEXT'),
    text: z.string().max(2000),
  }),
  z.object({
    type: z.literal('FACT_VALUE'),
    factId: z.string().min(1),
    role: z.enum(['PRIMARY', 'BENCHMARK', 'THRESHOLD', 'REFERENCE']).optional(),
  }),
  z.object({
    type: z.literal('FACT_LABEL'),
    factId: z.string().min(1),
  }),
]);

const ClaimInputSchema = z.object({
  claimId: z.string().optional(),
  type: z.enum([
    'FACTUAL_METRIC',
    'BENCHMARK_COMPARISON',
    'RISK_EXPLANATION',
    'SCENARIO_EXPLANATION',
    'DATA_QUALITY',
    'LIMITATION',
    'CONTEXTUAL_EXPLANATION',
  ]),
  segments: z.array(ClaimSegmentSchema).min(1).max(20),
  factIds: z.array(z.string()).optional(),
});

const ModelOutputSchema = z.object({
  answer: z.string().optional(),
  claims: z.array(ClaimInputSchema).min(1).max(25).optional(),
  evidenceFactIds: z.array(z.string()),
  limitations: z.array(z.string()).default([]),
});

/**
 * ExplainPortfolioWithAiUseCase (Phase 3R, ADR-179–ADR-185)
 *
 * Canonical orchestrator for grounded portfolio AI explanations:
 * 1. Validates user input.
 * 2. Deterministic capability gate runs BEFORE calling provider.
 * 3. Rejects unsupported requests (recommendation, prediction, calculation, tax) with 0 model calls and 0 grounding calls.
 * 4. For supported requests, obtains grounding context EXACTLY ONCE.
 * 5. Calls isolated AI provider EXACTLY ONCE with bounded prompt.
 * 6. Validates structured response and verifies every cited evidenceFactId against grounding context.
 * 7. Resolves evidence values strictly from grounding, never from model prose.
 */
@Injectable()
export class ExplainPortfolioWithAiUseCase {
  constructor(
    @Inject(GetPortfolioAiGroundingContextUseCase)
    private readonly getGroundingContextUseCase: GetPortfolioAiGroundingContextUseCase,
    @Inject(AI_PROVIDER_TOKEN)
    private readonly aiProvider: AIProvider,
  ) {}

  async execute(input: ExplainPortfolioInput): Promise<GroundedAiExplanationResponseV1> {
    const validatedInput = ExplainPortfolioInputSchema.parse(input);

    // 1. Deterministic intent / capability gate BEFORE model invocation
    const { intent, reason } = classifyExplanationIntent(validatedInput.question);

    if (
      intent === 'UNSUPPORTED_RECOMMENDATION' ||
      intent === 'UNSUPPORTED_PREDICTION' ||
      intent === 'UNSUPPORTED_NEW_CALCULATION' ||
      intent === 'UNSUPPORTED_TAX' ||
      intent === 'UNSUPPORTED_OTHER'
    ) {
      // Upstream refusal: ZERO grounding calls, ZERO provider calls
      return {
        schemaVersion: '1',
        status: 'UNSUPPORTED',
        intent,
        reason,
        answer: INTENT_REFUSAL_MESSAGES[intent],
        evidence: [],
        limitations: [],
      };
    }

    // 2. Obtain grounding context EXACTLY ONCE for supported intents
    const context = await this.getGroundingContextUseCase.execute({
      portfolioId: validatedInput.portfolioId,
      userId: validatedInput.userId,
      startDate: validatedInput.startDate,
      endDate: validatedInput.endDate,
    });

    // 3. Deterministic relevance selection + compaction (Phase 3Y, ADR-222/ADR-223)
    const { messages, selection, projection } = buildCompactConversationPrompt(
      context,
      validatedInput.question,
      intent,
      [],
    );

    // Authoritative registry for THIS turn is the selected subset only (ADR-227).
    const authoritativeContext = { ...context, facts: selection.selectedFacts };

    // 3.1 Enforce TOTAL provider context budget BEFORE any provider call (ADR-207).
    // Measures the exact payload handed to the provider; over-budget => ZERO provider calls.
    const budgetDecision = evaluateProviderContextBudget(messages);
    if (!budgetDecision.ok) {
      throw contextBudgetExceededException(budgetDecision);
    }

    // 4. Call AI provider EXACTLY ONCE
    let completion;
    try {
      completion = await this.aiProvider.complete(messages, {
        temperature: 0.1,
        maxTokens: 1200,
      });
    } catch (err: unknown) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpException(
        {
          message: 'AI provider unavailable or failed to respond',
          code: 'AI.PROVIDER_UNAVAILABLE',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // 5. Parse and validate structured model output
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(completion.content);
    } catch {
      throw new HttpException(
        {
          message: 'Model response is not valid JSON',
          code: 'AI.INVALID_MODEL_RESPONSE',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const parseResult = ModelOutputSchema.safeParse(parsedJson);
    if (!parseResult.success) {
      throw new HttpException(
        {
          message: 'Model response schema violation',
          code: 'AI.INVALID_MODEL_RESPONSE',
          details: parseResult.error.format(),
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const { claims, evidenceFactIds, limitations } = parseResult.data;

    // 6. Validate claims against canonical grounding facts (fail-closed if provided)
    let validatedClaims: GroundedClaimV1[] | undefined;
    if (claims && claims.length > 0) {
      const canonicalClaims = resolveClaimReferences(claims, projection.aliases);
      const claimValidation = validateGroundedClaims(canonicalClaims, authoritativeContext);
      if (!claimValidation.valid) {
        throw new HttpException(
          {
            message: `Model claims validation failed: ${claimValidation.invalidReasons.join('; ')}`,
            code: 'AI.INVALID_MODEL_RESPONSE',
            details: { invalidReasons: claimValidation.invalidReasons },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      validatedClaims = claimValidation.validatedClaims as GroundedClaimV1[];
    }

    // 7. Validate evidence citations against canonical grounding facts
    const canonicalEvidenceFactIds = resolveEvidenceReferences(evidenceFactIds, projection.aliases);
    const validation = validateExplanationEvidence(canonicalEvidenceFactIds, authoritativeContext);
    if (!validation.valid) {
      throw new HttpException(
        {
          message: `Model cited unknown facts: ${validation.unknownFactIds.join(', ')}`,
          code: 'AI.INVALID_MODEL_RESPONSE',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // Fail closed: portfolio explanation must provide at least one verified grounded fact
    if (validation.resolvedEvidence.length === 0) {
      throw new HttpException(
        {
          message: 'Model response lacks verified financial evidence citations',
          code: 'AI.INVALID_MODEL_RESPONSE',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 8. Render authoritative server-validated answer from claims if present
    const serverRenderedAnswer =
      validatedClaims && validatedClaims.length > 0 ? renderValidatedClaims(validatedClaims) : '';

    // 9. Return safe structured explanation
    return {
      schemaVersion: '1',
      status: 'ANSWERED',
      intent,
      answer: serverRenderedAnswer || parseResult.data.answer || '',
      claims: validatedClaims,
      evidence: validation.resolvedEvidence,
      limitations:
        limitations.length > 0 ? limitations : context.limitations.map((l) => l.description),
      model: {
        provider: process.env.AI_PROVIDER || 'openai',
        model: process.env.AI_MODEL || 'gpt-4o-mini',
      },
    };
  }
}
