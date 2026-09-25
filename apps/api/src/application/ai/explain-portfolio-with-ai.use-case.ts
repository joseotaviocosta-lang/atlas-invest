import { Inject, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import {
  classifyExplanationIntent,
  buildExplanationPrompt,
  validateExplanationEvidence,
  INTENT_REFUSAL_MESSAGES,
  GroundedAiExplanationResponseV1,
  AIProvider,
} from '@atlas/ai-engine';
import { GetPortfolioAiGroundingContextUseCase } from './get-portfolio-ai-grounding-context.use-case';
import { AI_PROVIDER_TOKEN } from '../../infrastructure/ai/openai-ai.provider';

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

const ModelOutputSchema = z.object({
  answer: z.string().min(1, { message: 'Model answer cannot be empty' }),
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

    // 3. Build bounded model request
    const { system, user } = buildExplanationPrompt(context, validatedInput.question, intent);

    // 4. Call AI provider EXACTLY ONCE
    let completion;
    try {
      completion = await this.aiProvider.complete(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { temperature: 0.1, maxTokens: 1200 },
      );
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

    const { answer, evidenceFactIds, limitations } = parseResult.data;

    // 6. Validate evidence citations against canonical grounding facts
    const validation = validateExplanationEvidence(evidenceFactIds, context);
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

    // 7. Return safe structured explanation
    return {
      schemaVersion: '1',
      status: 'ANSWERED',
      intent,
      answer,
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
