import { Inject, Injectable, HttpException, HttpStatus, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import {
  classifyConversationIntent,
  buildConversationPrompt,
  validateExplanationEvidence,
  buildMinimalEvidenceSnapshot,
  selectConversationHistory,
  validateGroundedClaims,
  renderValidatedClaims,
  buildAiExecutionTelemetry,
  validateContextBudget,
  AI_DEFAULT_MAX_CONTEXT_BYTES,
  AiExecutionStatus,
  INTENT_REFUSAL_MESSAGES,
  AIProvider,
  GroundedAiExplanationResponseV1,
  ConversationHistoryMessage,
  ExplanationIntent,
  GroundedClaimV1,
  PortfolioAiGroundingContextV1,
  PortfolioAssetAiGroundingContextV1,
  PortfolioTimelineAiGroundingContextV1,
} from '@atlas/ai-engine';
import { IAiConversationRepository } from '@atlas/database';
import { GetPortfolioAiGroundingContextUseCase } from './get-portfolio-ai-grounding-context.use-case';
import { GetPortfolioAssetAiGroundingContextUseCase } from './get-portfolio-asset-ai-grounding-context.use-case';
import { GetPortfolioTimelineAiGroundingContextUseCase } from './get-portfolio-timeline-ai-grounding-context.use-case';
import { AI_CONVERSATION_REPOSITORY } from '../../database/tokens';
import { AI_PROVIDER_TOKEN } from '../../infrastructure/ai/openai-ai.provider';
import {
  AI_TELEMETRY_SINK_TOKEN,
  AiTelemetrySink,
} from '../../infrastructure/ai/ai-telemetry.sink';

export const SendAiConversationMessageBodySchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, { message: 'A pergunta deve conter pelo menos 3 caracteres.' })
    .max(2000, { message: 'A pergunta deve conter no máximo 2000 caracteres.' }),
  scope: z
    .discriminatedUnion('type', [
      z.object({
        type: z.literal('PORTFOLIO'),
      }),
      z.object({
        type: z.literal('ASSET'),
        assetId: z.string().min(1, { message: 'assetId is required for ASSET scope' }),
      }),
      z.object({
        type: z.literal('TIMELINE'),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
          .optional(),
      }),
      z.object({
        type: z.literal('ASSET_TIMELINE'),
        assetId: z.string().min(1, { message: 'assetId is required for ASSET_TIMELINE scope' }),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
          .optional(),
      }),
    ])
    .optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be YYYY-MM-DD' })
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be YYYY-MM-DD' })
    .optional(),
});

export type SendAiConversationMessageBody = z.infer<typeof SendAiConversationMessageBodySchema>;

export const SendAiConversationMessageInputSchema = SendAiConversationMessageBodySchema.extend({
  conversationId: z.string().uuid({ message: 'conversationId must be a valid UUID' }),
  portfolioId: z.string().uuid({ message: 'portfolioId must be a valid UUID' }),
  userId: z.string().min(1, { message: 'userId is required' }),
  requestId: z.string().optional(),
});

export type SendAiConversationMessageInput = z.infer<typeof SendAiConversationMessageInputSchema>;

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

export interface GroundedConversationTurnResponseDto extends GroundedAiExplanationResponseV1 {
  readonly userMessageId?: string;
  readonly assistantMessageId?: string;
}

/**
 * SendAiConversationMessageUseCase (Phase 3S, Phase 3T, Phase 3V)
 *
 * Canonical orchestrator for multi-turn grounded conversations:
 * 1. Validates ownership (hidden 404).
 * 2. Retrieves bounded recent history from database.
 * 3. Evaluates deterministic intent gate before any grounding or model work.
 * 4. Refuses unsupported requests with 0 grounding calls and 0 model calls, persisting safe audit.
 * 5. Rebuilds fresh canonical PortfolioAiGroundingContextV1 for every supported turn (1 call).
 * 6. Bounds history deterministically (drop oldest first, char & count limits).
 * 7. Enforces system policy: prior assistant messages are contextual narrative only, NOT financial truth.
 * 8. Enforces pre-provider context budget limit (ADR-207).
 * 9. Validates model citations strictly against CURRENT grounding facts.
 * 10. Persists turn atomically with minimal exact-decimal evidence snapshot.
 * 11. Dispatches privacy-safe operational telemetry (ADR-204–ADR-206) with fail-open guarantee.
 */
@Injectable()
export class SendAiConversationMessageUseCase {
  constructor(
    @Inject(AI_CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IAiConversationRepository,
    @Inject(GetPortfolioAiGroundingContextUseCase)
    private readonly getGroundingContextUseCase: GetPortfolioAiGroundingContextUseCase,
    @Inject(GetPortfolioAssetAiGroundingContextUseCase)
    private readonly getAssetGroundingContextUseCase: GetPortfolioAssetAiGroundingContextUseCase,
    @Inject(GetPortfolioTimelineAiGroundingContextUseCase)
    private readonly getTimelineGroundingContextUseCase: GetPortfolioTimelineAiGroundingContextUseCase,
    @Inject(AI_PROVIDER_TOKEN)
    private readonly aiProvider: AIProvider,
    @Optional()
    @Inject(AI_TELEMETRY_SINK_TOKEN)
    private readonly telemetrySink?: AiTelemetrySink,
  ) {}

  async execute(
    input: SendAiConversationMessageInput,
  ): Promise<GroundedConversationTurnResponseDto> {
    const startTime = performance.now();
    const startedAt = new Date().toISOString();
    const requestId = input.requestId ?? randomUUID();

    let intentGateMs: number | undefined;
    let ownershipMs: number | undefined;
    let historyLoadMs: number | undefined;
    let groundingMs: number | undefined;
    let assetGroundingMs: number | undefined;
    let timelineGroundingMs: number | undefined;
    let timelineEventCount: number | undefined;
    let timelineEventLimitReached: boolean | undefined;
    let promptBuildMs: number | undefined;
    let providerMs: number | undefined;
    let claimValidationMs: number | undefined;
    let renderMs: number | undefined;
    let persistenceMs: number | undefined;

    let detectedIntent = 'UNKNOWN';
    let executionStatus: AiExecutionStatus = 'ANSWERED';
    let errorCode: string | undefined;
    let isRetryable: boolean | undefined;

    let groundingCallCount = 0;
    let providerCallCount = 0;
    let claimValidationCount = 0;
    let rendererCount = 0;
    let claimCount: number | undefined;
    let evidenceCount: number | undefined;
    let historyMessageCount: number | undefined;
    let historyChars: number | undefined;
    let groundingFactCount: number | undefined;
    let assetFactCount: number | undefined;
    let groundingSerializedBytes: number | undefined;

    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let totalTokens: number | null = null;
    let usageSource: 'PROVIDER' | 'UNAVAILABLE' | 'NOT_APPLICABLE' = 'UNAVAILABLE';

    const validatedInput = SendAiConversationMessageInputSchema.parse(input);

    try {
      // 1. Ownership & Scoping check (hidden 404)
      const tOwnershipStart = performance.now();
      const conversation = await this.conversationRepository.findConversationById(
        validatedInput.conversationId,
        validatedInput.portfolioId,
        validatedInput.userId,
      );
      ownershipMs = performance.now() - tOwnershipStart;

      if (!conversation) {
        executionStatus = 'AUTHORIZATION_REJECTED';
        errorCode = 'CONVERSATION.NOT_FOUND';
        throw new HttpException(
          {
            message: 'Conversation not found',
            code: 'CONVERSATION.NOT_FOUND',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // 2. Load recent conversation history (up to 20 raw messages, sorted oldest-first)
      const tHistoryStart = performance.now();
      const rawHistory = await this.conversationRepository.listMessages(
        validatedInput.conversationId,
        {
          limit: 20,
          order: 'asc',
        },
      );
      historyLoadMs = performance.now() - tHistoryStart;

      const historyMessages: ConversationHistoryMessage[] = rawHistory.items.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        status: m.status,
        intent: (m.intent as ExplanationIntent) ?? undefined,
        limitations: m.limitations,
        createdAt: m.createdAt.toISOString(),
      }));

      // Bounded history selection (max 10 messages, max 14k chars)
      const selectedHistory = selectConversationHistory(historyMessages, {
        maxMessages: 10,
        maxChars: 14000,
      });
      historyMessageCount = selectedHistory.messages.length;
      historyChars = selectedHistory.totalChars;

      // 3. Deterministic intent / capability gate BEFORE model invocation
      const tIntentStart = performance.now();
      const { intent, reason } = classifyConversationIntent(
        validatedInput.question,
        selectedHistory.messages,
        validatedInput.scope,
      );
      intentGateMs = performance.now() - tIntentStart;
      detectedIntent = intent;

      if (
        intent === 'UNSUPPORTED_RECOMMENDATION' ||
        intent === 'UNSUPPORTED_PREDICTION' ||
        intent === 'UNSUPPORTED_NEW_CALCULATION' ||
        intent === 'UNSUPPORTED_TAX' ||
        intent === 'UNSUPPORTED_OTHER'
      ) {
        // Upstream refusal: ZERO grounding calls, ZERO provider calls
        executionStatus = 'UNSUPPORTED';
        usageSource = 'NOT_APPLICABLE';
        inputTokens = 0;
        outputTokens = 0;
        totalTokens = 0;
        const refusalAnswer = INTENT_REFUSAL_MESSAGES[intent];

        const tPersistStart = performance.now();
        const turn = await this.conversationRepository.appendTurn(
          validatedInput.conversationId,
          { content: validatedInput.question },
          {
            content: refusalAnswer,
            status: 'UNSUPPORTED',
            intent,
            evidenceSnapshot: [],
            limitations: [],
          },
        );
        persistenceMs = performance.now() - tPersistStart;

        return {
          schemaVersion: '1',
          status: 'UNSUPPORTED',
          intent,
          reason,
          answer: refusalAnswer,
          evidence: [],
          limitations: [],
          userMessageId: turn.userMessage.id,
          assistantMessageId: turn.assistantMessage.id,
        };
      }

      // 4. Obtain FRESH grounding context EXACTLY ONCE for supported intents
      const tGroundingStart = performance.now();
      groundingCallCount = 1;
      let context:
        | PortfolioAiGroundingContextV1
        | PortfolioAssetAiGroundingContextV1
        | PortfolioTimelineAiGroundingContextV1;

      if (validatedInput.scope?.type === 'ASSET') {
        const tAssetStart = performance.now();
        context = await this.getAssetGroundingContextUseCase.execute({
          portfolioId: validatedInput.portfolioId,
          userId: validatedInput.userId,
          assetId: validatedInput.scope.assetId,
          startDate: validatedInput.startDate,
          endDate: validatedInput.endDate,
        });
        assetGroundingMs = performance.now() - tAssetStart;
        assetFactCount = (context as PortfolioAssetAiGroundingContextV1).assetFacts.length;
      } else if (
        validatedInput.scope?.type === 'TIMELINE' ||
        validatedInput.scope?.type === 'ASSET_TIMELINE'
      ) {
        const tTimelineStart = performance.now();
        context = await this.getTimelineGroundingContextUseCase.execute({
          portfolioId: validatedInput.portfolioId,
          userId: validatedInput.userId,
          from: validatedInput.scope.from ?? validatedInput.startDate,
          to: validatedInput.scope.to ?? validatedInput.endDate,
          assetId:
            validatedInput.scope.type === 'ASSET_TIMELINE'
              ? validatedInput.scope.assetId
              : undefined,
        });
        timelineGroundingMs = performance.now() - tTimelineStart;
        timelineEventCount = (context as PortfolioTimelineAiGroundingContextV1).events.length;
        timelineEventLimitReached = (context as PortfolioTimelineAiGroundingContextV1).summaryFacts
          .hasMore;
      } else {
        context = await this.getGroundingContextUseCase.execute({
          portfolioId: validatedInput.portfolioId,
          userId: validatedInput.userId,
          startDate: validatedInput.startDate,
          endDate: validatedInput.endDate,
        });
      }
      groundingMs = performance.now() - tGroundingStart;
      groundingFactCount = context.facts.length;
      groundingSerializedBytes = Buffer.byteLength(JSON.stringify(context.facts), 'utf8');

      // 5. Build bounded multi-turn model request
      const tPromptStart = performance.now();
      const { messages } = buildConversationPrompt(
        context,
        validatedInput.question,
        intent,
        selectedHistory.messages,
      );
      promptBuildMs = performance.now() - tPromptStart;

      // 5.1 Enforce Context Budget Governance before provider call (ADR-207)
      const serializedContextBytes = Buffer.byteLength(JSON.stringify(messages), 'utf8');
      const maxContextBudget = process.env.AI_MAX_CONTEXT_BYTES
        ? parseInt(process.env.AI_MAX_CONTEXT_BYTES, 10)
        : AI_DEFAULT_MAX_CONTEXT_BYTES;

      const budgetCheck = validateContextBudget(serializedContextBytes, maxContextBudget);
      if (!budgetCheck.ok) {
        executionStatus = 'CONTEXT_BUDGET_EXCEEDED';
        errorCode = 'AI.CONTEXT_BUDGET_EXCEEDED';
        isRetryable = false;
        throw new HttpException(
          {
            message: `AI request context size (${budgetCheck.sizeBytes} bytes) exceeds budget limit (${budgetCheck.maxBytes} bytes)`,
            code: 'AI.CONTEXT_BUDGET_EXCEEDED',
            details: { sizeBytes: budgetCheck.sizeBytes, maxBytes: budgetCheck.maxBytes },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // 6. Call AI provider EXACTLY ONCE
      let completion;
      const tProviderStart = performance.now();
      providerCallCount = 1;
      try {
        completion = await this.aiProvider.complete(messages, { temperature: 0.1 });
        providerMs = performance.now() - tProviderStart;
        if (completion.usage) {
          inputTokens = completion.usage.promptTokens ?? null;
          outputTokens = completion.usage.completionTokens ?? null;
          totalTokens = completion.usage.totalTokens ?? null;
          usageSource = 'PROVIDER';
        } else {
          usageSource = 'UNAVAILABLE';
        }
      } catch (err: unknown) {
        providerMs = performance.now() - tProviderStart;
        executionStatus = 'PROVIDER_ERROR';
        if (err instanceof HttpException) {
          const resp = err.getResponse() as { code?: string };
          errorCode = resp.code ?? 'AI.PROVIDER_ERROR';
          isRetryable = err.getStatus() >= 500 || err.getStatus() === 429;
          throw err;
        }
        errorCode = 'AI.PROVIDER_UNAVAILABLE';
        isRetryable = true;
        throw new HttpException(
          {
            message: 'AI provider unavailable or failed to respond',
            code: 'AI.PROVIDER_UNAVAILABLE',
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      // 7. Parse and validate structured model output
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(completion.content);
      } catch {
        executionStatus = 'VALIDATION_ERROR';
        errorCode = 'AI.INVALID_MODEL_RESPONSE';
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
        executionStatus = 'VALIDATION_ERROR';
        errorCode = 'AI.INVALID_MODEL_RESPONSE';
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

      // 8. Validate claims against canonical grounding facts (fail-closed if provided)
      let validatedClaims: GroundedClaimV1[] | undefined;
      const tValidationStart = performance.now();
      if (claims && claims.length > 0) {
        claimValidationCount = 1;
        const claimValidation = validateGroundedClaims(claims, context, {
          targetAssetId:
            validatedInput.scope?.type === 'ASSET' ? validatedInput.scope.assetId : undefined,
        });
        if (!claimValidation.valid) {
          executionStatus = 'VALIDATION_ERROR';
          errorCode = 'AI.INVALID_MODEL_RESPONSE';
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
        claimCount = validatedClaims.length;
      }

      // 9. Strict evidence validation against CURRENT grounding context
      const validation = validateExplanationEvidence(evidenceFactIds, context);
      claimValidationMs = performance.now() - tValidationStart;

      if (!validation.valid) {
        executionStatus = 'VALIDATION_ERROR';
        errorCode = 'AI.INVALID_MODEL_RESPONSE';
        throw new HttpException(
          {
            message: `Model cited unknown facts: ${validation.unknownFactIds.join(', ')}`,
            code: 'AI.INVALID_MODEL_RESPONSE',
            details: { unknownFactIds: validation.unknownFactIds },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      if (validation.resolvedEvidence.length === 0) {
        executionStatus = 'VALIDATION_ERROR';
        errorCode = 'AI.INVALID_MODEL_RESPONSE';
        throw new HttpException(
          {
            message: 'Model response lacks verified financial evidence citations',
            code: 'AI.INVALID_MODEL_RESPONSE',
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      evidenceCount = validation.resolvedEvidence.length;

      // 10. Render authoritative server-validated answer from claims if present
      const tRenderStart = performance.now();
      rendererCount = 1;
      const serverRenderedAnswer =
        validatedClaims && validatedClaims.length > 0 ? renderValidatedClaims(validatedClaims) : '';
      renderMs = performance.now() - tRenderStart;

      // 11. Build minimal exact-decimal evidence audit snapshot
      const minimalSnapshot = buildMinimalEvidenceSnapshot(validation.resolvedEvidence);
      const resolvedLimitations =
        limitations.length > 0 ? limitations : context.limitations.map((l) => l.description);

      // 12. Persist safe turn atomically in database with claims
      const tPersistStart = performance.now();
      let turn;
      try {
        turn = await this.conversationRepository.appendTurn(
          validatedInput.conversationId,
          { content: validatedInput.question },
          {
            content: serverRenderedAnswer || parseResult.data.answer || '',
            status: 'ANSWERED',
            intent,
            evidenceSnapshot: minimalSnapshot,
            claims: validatedClaims,
            limitations: resolvedLimitations,
            provider: process.env.AI_PROVIDER || 'openai',
            model: process.env.AI_MODEL || 'gpt-4o-mini',
          },
        );
        persistenceMs = performance.now() - tPersistStart;
      } catch (err: unknown) {
        persistenceMs = performance.now() - tPersistStart;
        executionStatus = 'PERSISTENCE_ERROR';
        errorCode = 'AI.CONVERSATION_PERSISTENCE_FAILED';
        throw err;
      }

      executionStatus = 'ANSWERED';

      // 13. Return safe structured conversation turn response
      return {
        schemaVersion: '1',
        status: 'ANSWERED',
        intent,
        answer: serverRenderedAnswer || parseResult.data.answer || '',
        claims: validatedClaims,
        evidence: validation.resolvedEvidence,
        limitations: resolvedLimitations,
        model: {
          provider: process.env.AI_PROVIDER || 'openai',
          model: process.env.AI_MODEL || 'gpt-4o-mini',
        },
        userMessageId: turn.userMessage.id,
        assistantMessageId: turn.assistantMessage.id,
      };
    } catch (err: unknown) {
      if (err instanceof HttpException) {
        const resp = err.getResponse() as { code?: string };
        if (resp.code && !errorCode) {
          errorCode = resp.code;
        }
      }
      throw err;
    } finally {
      const completedAt = new Date().toISOString();
      const totalMs = performance.now() - startTime;

      try {
        const telemetry = buildAiExecutionTelemetry({
          requestId,
          operation: 'CONVERSATION_MESSAGE',
          deliveryMode: 'SYNC',
          intent: detectedIntent,
          status: executionStatus,
          provider: process.env.AI_PROVIDER || 'openai',
          model: process.env.AI_MODEL || 'gpt-4o-mini',
          startedAt,
          completedAt,
          durations: {
            totalMs,
            intentGateMs,
            ownershipMs,
            historyLoadMs,
            groundingMs,
            assetGroundingMs,
            timelineGroundingMs,
            promptBuildMs,
            providerMs,
            claimValidationMs,
            renderMs,
            persistenceMs,
          },
          usage: {
            inputTokens,
            outputTokens,
            totalTokens,
            source: usageSource,
          },
          counts: {
            groundingCallCount,
            providerCallCount,
            claimValidationCount,
            rendererCount,
            claimCount,
            evidenceCount,
            questionLength: validatedInput.question.length,
            historyMessageCount,
            historyChars,
            groundingFactCount,
            assetFactCount,
            groundingSerializedBytes,
            eventCount: timelineEventCount,
            eventLimitReached: timelineEventLimitReached,
          },
          scopeType: validatedInput.scope?.type ?? 'PORTFOLIO',
          portfolioId: validatedInput.portfolioId,
          conversationId: validatedInput.conversationId,
          errorCode,
          retryable: isRetryable,
        });

        if (this.telemetrySink) {
          this.telemetrySink.record(telemetry);
        }
      } catch {
        // Fail-open guarantee (ADR-204)
      }
    }
  }
}
