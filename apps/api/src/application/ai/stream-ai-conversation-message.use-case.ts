import { Inject, Injectable, HttpException, HttpStatus, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  classifyConversationIntent,
  buildCompactConversationPrompt,
  resolveClaimReferences,
  resolveEvidenceReferences,
  GroundingSelectionManifestV1,
  AiBudgetUtilizationBucket,
  classifyBudgetUtilization,
  validateExplanationEvidence,
  buildMinimalEvidenceSnapshot,
  selectConversationHistory,
  validateGroundedClaims,
  renderValidatedClaims,
  buildAiExecutionTelemetry,
  AiExecutionStatus,
  INTENT_REFUSAL_MESSAGES,
  AIProvider,
  GroundedAiStreamEmitter,
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
import { evaluateProviderContextBudget } from './context-budget';
import {
  SendAiConversationMessageInput,
  SendAiConversationMessageInputSchema,
} from './send-ai-conversation-message.use-case';
import { AI_CONVERSATION_REPOSITORY } from '../../database/tokens';
import { AI_PROVIDER_TOKEN } from '../../infrastructure/ai/openai-ai.provider';
import {
  AI_TELEMETRY_SINK_TOKEN,
  AiTelemetrySink,
} from '../../infrastructure/ai/ai-telemetry.sink';
import { z } from 'zod';

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
 * StreamAiConversationMessageUseCase (Phase 3U, Phase 3V, ADR-199–ADR-207)
 *
 * Canonical orchestrator for multi-turn grounded conversations with streaming delivery:
 * 1. Validates ownership before streaming headers (hidden 404).
 * 2. Emits deterministic, non-authoritative server progress events (STARTED, CLASSIFYING, GROUNDING, GENERATING, VALIDATING, RENDERING).
 * 3. Prohibits early streaming of unvalidated partial financial prose or numbers (ADR-200).
 * 4. Bounded multi-turn history with fresh grounding context rebuilt per turn.
 * 5. Pre-provider context budget check (ADR-207).
 * 6. Strict server-authoritative claim validation and exact-decimal server rendering.
 * 7. Persist-before-FINAL: validated assistant turn is committed to DB before emitting FINAL event (ADR-203).
 * 8. Clean client abort / cancellation support with zero zombie generation or false answered records (ADR-201).
 * 9. Privacy-safe operational telemetry dispatch in finally (ADR-204–ADR-206).
 * 10. Zero financial delta compared to non-streaming 3T route.
 */
@Injectable()
export class StreamAiConversationMessageUseCase {
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

  /**
   * Verify ownership before streaming response headers are committed.
   * Throws hidden 404 if conversation or portfolio does not belong to user.
   */
  async verifyOwnership(params: { portfolioId: string; conversationId: string; userId: string }) {
    const conversation = await this.conversationRepository.findConversationById(
      params.conversationId,
      params.portfolioId,
      params.userId,
    );

    if (!conversation) {
      throw new HttpException(
        {
          message: 'Conversation not found',
          code: 'CONVERSATION.NOT_FOUND',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return conversation;
  }

  /**
   * Execute streaming delivery over an SSE emitter.
   */
  async executeStream(
    input: SendAiConversationMessageInput,
    writeChunk: (chunk: string) => void,
    clientSignal?: AbortSignal,
  ): Promise<void> {
    const startTime = performance.now();
    const startedAt = new Date().toISOString();
    const requestId = input.requestId ?? randomUUID();

    let intentGateMs: number | undefined;
    let historyLoadMs: number | undefined;
    let groundingMs: number | undefined;
    let assetGroundingMs: number | undefined;
    let timelineGroundingMs: number | undefined;
    let promptBuildMs: number | undefined;
    let providerMs: number | undefined;
    let claimValidationMs: number | undefined;
    let renderMs: number | undefined;
    let persistenceMs: number | undefined;
    let timeToFirstEventMs: number | undefined;

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
    let timelineEventCount: number | undefined;
    let timelineEventLimitReached: boolean | undefined;
    let groundingSerializedBytes: number | undefined;
    let selectionManifest: GroundingSelectionManifestV1 | undefined;
    let contextBytesMeasured: number | undefined;
    let budgetBucket: AiBudgetUtilizationBucket | undefined;

    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let totalTokens: number | null = null;
    let usageSource: 'PROVIDER' | 'UNAVAILABLE' | 'NOT_APPLICABLE' = 'UNAVAILABLE';

    const emitter = new GroundedAiStreamEmitter(writeChunk);
    const validatedInput = SendAiConversationMessageInputSchema.parse(input);

    try {
      // Check if client already disconnected
      if (clientSignal?.aborted) {
        executionStatus = 'ABORTED';
        errorCode = 'AI.STREAM_ABORTED';
        return;
      }

      // 1. Emit STARTED (Sequence 1)
      emitter.emitStarted(validatedInput.conversationId);
      timeToFirstEventMs = performance.now() - startTime;

      // 2. Emit PROGRESS: CLASSIFYING (Sequence 2)
      emitter.emitProgress('CLASSIFYING');

      // Load recent history (max 20 messages)
      const tHistoryStart = performance.now();
      const rawHistory = await this.conversationRepository.listMessages(
        validatedInput.conversationId,
        { limit: 20, order: 'asc' },
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

      const selectedHistory = selectConversationHistory(historyMessages, {
        maxMessages: 10,
        maxChars: 14000,
      });
      historyMessageCount = selectedHistory.messages.length;
      historyChars = selectedHistory.totalChars;

      // Deterministic intent gate BEFORE any financial or model work
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
        // Upstream refusal: ZERO grounding, ZERO provider calls
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

        emitter.emitFinal({
          schemaVersion: '1',
          status: 'UNSUPPORTED',
          intent,
          reason,
          answer: refusalAnswer,
          evidence: [],
          claims: [],
          limitations: [],
          userMessageId: turn.userMessage.id,
          assistantMessageId: turn.assistantMessage.id,
        });

        return;
      }

      if (clientSignal?.aborted) {
        executionStatus = 'ABORTED';
        errorCode = 'AI.STREAM_ABORTED';
        return;
      }

      // 3. Emit PROGRESS: GROUNDING (Sequence 3)
      emitter.emitProgress('GROUNDING');

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
        const timelineContext = await this.getTimelineGroundingContextUseCase.execute({
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
        timelineEventCount = timelineContext.events.length;
        timelineEventLimitReached = timelineContext.eventLimitReached;
        context = timelineContext;
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

      if (clientSignal?.aborted) {
        executionStatus = 'ABORTED';
        errorCode = 'AI.STREAM_ABORTED';
        return;
      }

      // 4. Emit PROGRESS: GENERATING (Sequence 4)
      emitter.emitProgress('GENERATING');

      const tPromptStart = performance.now();
      const { messages, selection, projection } = buildCompactConversationPrompt(
        context,
        validatedInput.question,
        intent,
        selectedHistory.messages,
      );
      promptBuildMs = performance.now() - tPromptStart;
      selectionManifest = selection.manifest;

      // Authoritative registry for THIS turn is the selected subset only (ADR-227).
      const authoritativeContext = { ...context, facts: selection.selectedFacts };

      // 4.1 Enforce TOTAL provider context budget AFTER compaction, before the
      // provider call (ADR-207, ADR-225). Single authoritative decision over the
      // exact provider payload.
      const budgetCheck = evaluateProviderContextBudget(messages);
      contextBytesMeasured = budgetCheck.sizeBytes;
      budgetBucket = classifyBudgetUtilization(budgetCheck.sizeBytes, budgetCheck.maxBytes);
      if (!budgetCheck.ok) {
        executionStatus = 'CONTEXT_BUDGET_EXCEEDED';
        errorCode = 'AI.CONTEXT_BUDGET_EXCEEDED';
        isRetryable = false;
        emitter.emitError(
          'AI.CONTEXT_BUDGET_EXCEEDED',
          `Tamanho do contexto da requisição (${budgetCheck.sizeBytes} bytes) excede o limite permitido (${budgetCheck.maxBytes} bytes).`,
        );
        return;
      }

      let completion;
      const tProviderStart = performance.now();
      providerCallCount = 1;
      try {
        completion = await this.aiProvider.complete(messages, {
          temperature: 0.1,
          signal: clientSignal,
        });
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
        if (clientSignal?.aborted) {
          executionStatus = 'ABORTED';
          errorCode = 'AI.STREAM_ABORTED';
          return;
        }
        executionStatus = 'PROVIDER_ERROR';
        if (err instanceof HttpException) {
          const res = err.getResponse() as Record<string, unknown>;
          const code = (res?.code as string) || 'AI.PROVIDER_ERROR';
          const msg = (res?.message as string) || 'Erro no provedor de IA';
          errorCode = code;
          isRetryable = err.getStatus() >= 500 || err.getStatus() === 429;
          emitter.emitError(code, msg);
          return;
        }
        errorCode = 'AI.PROVIDER_UNAVAILABLE';
        isRetryable = true;
        emitter.emitError(
          'AI.PROVIDER_UNAVAILABLE',
          'O serviço de inteligência artificial está temporariamente indisponível.',
        );
        return;
      }

      if (clientSignal?.aborted) {
        executionStatus = 'ABORTED';
        errorCode = 'AI.STREAM_ABORTED';
        return;
      }

      // 5. Emit PROGRESS: VALIDATING (Sequence 5)
      emitter.emitProgress('VALIDATING');

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(completion.content);
      } catch {
        executionStatus = 'VALIDATION_ERROR';
        errorCode = 'AI.INVALID_MODEL_RESPONSE';
        emitter.emitError(
          'AI.INVALID_MODEL_RESPONSE',
          'A resposta do modelo não está em formato JSON válido.',
        );
        return;
      }

      const parseResult = ModelOutputSchema.safeParse(parsedJson);
      if (!parseResult.success) {
        executionStatus = 'VALIDATION_ERROR';
        errorCode = 'AI.INVALID_MODEL_RESPONSE';
        emitter.emitError(
          'AI.INVALID_MODEL_RESPONSE',
          'A resposta do modelo violou o esquema estrutural esperado.',
        );
        return;
      }

      const { claims, evidenceFactIds, limitations } = parseResult.data;

      // Validate claims against canonical grounding context
      let validatedClaims: GroundedClaimV1[] | undefined;
      const tValidationStart = performance.now();
      if (claims && claims.length > 0) {
        claimValidationCount = 1;
        // Resolve request-local aliases to canonical identity (ADR-224) and
        // validate strictly against the SELECTED authority (ADR-227).
        const canonicalClaims = resolveClaimReferences(claims, projection.aliases);
        const claimValidation = validateGroundedClaims(canonicalClaims, authoritativeContext, {
          targetAssetId:
            validatedInput.scope?.type === 'ASSET'
              ? validatedInput.scope.assetId
              : validatedInput.scope?.type === 'ASSET_TIMELINE'
                ? validatedInput.scope.assetId
                : undefined,
        });
        if (!claimValidation.valid) {
          executionStatus = 'VALIDATION_ERROR';
          errorCode = 'AI.INVALID_MODEL_RESPONSE';
          emitter.emitError(
            'AI.INVALID_MODEL_RESPONSE',
            `Validação de alegações falhou: ${claimValidation.invalidReasons.join('; ')}`,
          );
          return;
        }
        validatedClaims = claimValidation.validatedClaims as GroundedClaimV1[];
        claimCount = validatedClaims.length;
      }

      // Validate evidence citations
      const canonicalEvidenceFactIds = resolveEvidenceReferences(
        evidenceFactIds,
        projection.aliases,
      );
      const validation = validateExplanationEvidence(
        canonicalEvidenceFactIds,
        authoritativeContext,
      );
      claimValidationMs = performance.now() - tValidationStart;

      if (!validation.valid || validation.resolvedEvidence.length === 0) {
        executionStatus = 'VALIDATION_ERROR';
        errorCode = 'AI.INVALID_MODEL_RESPONSE';
        emitter.emitError(
          'AI.INVALID_MODEL_RESPONSE',
          'A resposta do modelo carece de evidências factuais comprovadas no ledger.',
        );
        return;
      }
      evidenceCount = validation.resolvedEvidence.length;

      if (clientSignal?.aborted) {
        executionStatus = 'ABORTED';
        errorCode = 'AI.STREAM_ABORTED';
        return;
      }

      // 6. Emit PROGRESS: RENDERING (Sequence 6)
      emitter.emitProgress('RENDERING');

      const tRenderStart = performance.now();
      rendererCount = 1;
      const serverRenderedAnswer =
        validatedClaims && validatedClaims.length > 0 ? renderValidatedClaims(validatedClaims) : '';
      const finalAnswer = serverRenderedAnswer || parseResult.data.answer || '';
      renderMs = performance.now() - tRenderStart;

      const minimalSnapshot = buildMinimalEvidenceSnapshot(validation.resolvedEvidence);
      const resolvedLimitations =
        limitations.length > 0 ? limitations : context.limitations.map((l) => l.description);

      // Persist validated assistant message in DB BEFORE emitting FINAL event (ADR-203)
      const tPersistStart = performance.now();
      let turn;
      try {
        turn = await this.conversationRepository.appendTurn(
          validatedInput.conversationId,
          { content: validatedInput.question },
          {
            content: finalAnswer,
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
      } catch {
        persistenceMs = performance.now() - tPersistStart;
        executionStatus = 'PERSISTENCE_ERROR';
        errorCode = 'AI.PERSISTENCE_ERROR';
        emitter.emitError(
          'AI.PERSISTENCE_ERROR',
          'Falha ao persistir a resposta validada da conversa no banco de dados.',
        );
        return;
      }

      executionStatus = 'ANSWERED';

      // 7. Emit FINAL (Sequence 7)
      emitter.emitFinal({
        schemaVersion: '1',
        status: 'ANSWERED',
        intent,
        answer: finalAnswer,
        claims: validatedClaims,
        evidence: validation.resolvedEvidence,
        limitations: resolvedLimitations,
        model: {
          provider: process.env.AI_PROVIDER || 'openai',
          model: process.env.AI_MODEL || 'gpt-4o-mini',
        },
        userMessageId: turn.userMessage.id,
        assistantMessageId: turn.assistantMessage.id,
      });
    } catch (err: unknown) {
      if (clientSignal?.aborted) {
        executionStatus = 'ABORTED';
        errorCode = 'AI.STREAM_ABORTED';
        return;
      }
      if (!emitter.completed) {
        const errorMsg =
          err instanceof Error ? err.message : 'Erro interno durante processamento da transmissão';
        executionStatus = 'PROVIDER_ERROR';
        errorCode = 'AI.STREAM_INTERNAL_ERROR';
        emitter.emitError('AI.STREAM_INTERNAL_ERROR', errorMsg);
      }
    } finally {
      const completedAt = new Date().toISOString();
      const totalMs = performance.now() - startTime;

      try {
        const telemetry = buildAiExecutionTelemetry({
          requestId,
          operation: 'CONVERSATION_STREAM',
          deliveryMode: 'STREAM',
          intent: detectedIntent,
          status: executionStatus,
          provider: process.env.AI_PROVIDER || 'openai',
          model: process.env.AI_MODEL || 'gpt-4o-mini',
          startedAt,
          completedAt,
          durations: {
            totalMs,
            intentGateMs,
            historyLoadMs,
            groundingMs,
            assetGroundingMs,
            timelineGroundingMs,
            promptBuildMs,
            providerMs,
            claimValidationMs,
            renderMs,
            persistenceMs,
            timeToFirstEventMs,
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
            streamEventCount: emitter.sequence,
            claimCount,
            evidenceCount,
            questionLength: validatedInput.question.length,
            historyMessageCount,
            historyChars,
            groundingFactCount,
            assetFactCount,
            eventCount: timelineEventCount,
            eventLimitReached: timelineEventLimitReached,
            groundingSerializedBytes,
            availableFactCount: selectionManifest?.availableFactCount,
            selectedFactCount: selectionManifest?.selectedFactCount,
            contextBytes: contextBytesMeasured,
          },
          scopeType: validatedInput.scope?.type ?? 'PORTFOLIO',
          portfolioId: validatedInput.portfolioId,
          conversationId: validatedInput.conversationId,
          errorCode,
          retryable: isRetryable,
          selectionPolicyVersion: selectionManifest?.policyVersion,
          budgetUtilizationBucket: budgetBucket,
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
