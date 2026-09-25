import { Inject, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import {
  classifyConversationIntent,
  buildConversationPrompt,
  validateExplanationEvidence,
  buildMinimalEvidenceSnapshot,
  selectConversationHistory,
  validateGroundedClaims,
  renderValidatedClaims,
  INTENT_REFUSAL_MESSAGES,
  AIProvider,
  GroundedAiStreamEmitter,
  ConversationHistoryMessage,
  ExplanationIntent,
  GroundedClaimV1,
} from '@atlas/ai-engine';
import { IAiConversationRepository } from '@atlas/database';
import { GetPortfolioAiGroundingContextUseCase } from './get-portfolio-ai-grounding-context.use-case';
import {
  SendAiConversationMessageInput,
  SendAiConversationMessageInputSchema,
} from './send-ai-conversation-message.use-case';
import { AI_CONVERSATION_REPOSITORY } from '../../database/tokens';
import { AI_PROVIDER_TOKEN } from '../../infrastructure/ai/openai-ai.provider';
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
 * StreamAiConversationMessageUseCase (Phase 3U, ADR-199–ADR-203)
 *
 * Canonical orchestrator for multi-turn grounded conversations with streaming delivery:
 * 1. Validates ownership before streaming headers (hidden 404).
 * 2. Emits deterministic, non-authoritative server progress events (STARTED, CLASSIFYING, GROUNDING, GENERATING, VALIDATING, RENDERING).
 * 3. Prohibits early streaming of unvalidated partial financial prose or numbers (ADR-200).
 * 4. Bounded multi-turn history with fresh grounding context rebuilt per turn.
 * 5. Strict server-authoritative claim validation and exact-decimal server rendering.
 * 6. Persist-before-FINAL: validated assistant turn is committed to DB before emitting FINAL event (ADR-203).
 * 7. Clean client abort / cancellation support with zero zombie generation or false answered records (ADR-201).
 * 8. Zero financial delta compared to non-streaming 3T route.
 */
@Injectable()
export class StreamAiConversationMessageUseCase {
  constructor(
    @Inject(AI_CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IAiConversationRepository,
    @Inject(GetPortfolioAiGroundingContextUseCase)
    private readonly getGroundingContextUseCase: GetPortfolioAiGroundingContextUseCase,
    @Inject(AI_PROVIDER_TOKEN)
    private readonly aiProvider: AIProvider,
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
    const emitter = new GroundedAiStreamEmitter(writeChunk);
    const validatedInput = SendAiConversationMessageInputSchema.parse(input);

    try {
      // Check if client already disconnected
      if (clientSignal?.aborted) {
        return;
      }

      // 1. Emit STARTED (Sequence 1)
      emitter.emitStarted(validatedInput.conversationId);

      // 2. Emit PROGRESS: CLASSIFYING (Sequence 2)
      emitter.emitProgress('CLASSIFYING');

      // Load recent history (max 20 messages)
      const rawHistory = await this.conversationRepository.listMessages(
        validatedInput.conversationId,
        { limit: 20, order: 'asc' },
      );

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

      // Deterministic intent gate BEFORE any financial or model work
      const { intent, reason } = classifyConversationIntent(
        validatedInput.question,
        selectedHistory.messages,
      );

      if (
        intent === 'UNSUPPORTED_RECOMMENDATION' ||
        intent === 'UNSUPPORTED_PREDICTION' ||
        intent === 'UNSUPPORTED_NEW_CALCULATION' ||
        intent === 'UNSUPPORTED_TAX' ||
        intent === 'UNSUPPORTED_OTHER'
      ) {
        // Upstream refusal: ZERO grounding, ZERO provider calls
        const refusalAnswer = INTENT_REFUSAL_MESSAGES[intent];

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
        return;
      }

      // 3. Emit PROGRESS: GROUNDING (Sequence 3)
      emitter.emitProgress('GROUNDING');

      const context = await this.getGroundingContextUseCase.execute({
        portfolioId: validatedInput.portfolioId,
        userId: validatedInput.userId,
        startDate: validatedInput.startDate,
        endDate: validatedInput.endDate,
      });

      if (clientSignal?.aborted) {
        return;
      }

      // 4. Emit PROGRESS: GENERATING (Sequence 4)
      emitter.emitProgress('GENERATING');

      const { messages } = buildConversationPrompt(
        context,
        validatedInput.question,
        intent,
        selectedHistory.messages,
      );

      let completion;
      try {
        completion = await this.aiProvider.complete(messages, {
          temperature: 0.1,
          signal: clientSignal,
        });
      } catch (err: unknown) {
        if (clientSignal?.aborted) {
          return;
        }
        if (err instanceof HttpException) {
          const res = err.getResponse() as Record<string, unknown>;
          const code = (res?.code as string) || 'AI.PROVIDER_ERROR';
          const msg = (res?.message as string) || 'Erro no provedor de IA';
          emitter.emitError(code, msg);
          return;
        }
        emitter.emitError(
          'AI.PROVIDER_UNAVAILABLE',
          'O serviço de inteligência artificial está temporariamente indisponível.',
        );
        return;
      }

      if (clientSignal?.aborted) {
        return;
      }

      // 5. Emit PROGRESS: VALIDATING (Sequence 5)
      emitter.emitProgress('VALIDATING');

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(completion.content);
      } catch {
        emitter.emitError(
          'AI.INVALID_MODEL_RESPONSE',
          'A resposta do modelo não está em formato JSON válido.',
        );
        return;
      }

      const parseResult = ModelOutputSchema.safeParse(parsedJson);
      if (!parseResult.success) {
        emitter.emitError(
          'AI.INVALID_MODEL_RESPONSE',
          'A resposta do modelo violou o esquema estrutural esperado.',
        );
        return;
      }

      const { claims, evidenceFactIds, limitations } = parseResult.data;

      // Validate claims against canonical grounding context
      let validatedClaims: GroundedClaimV1[] | undefined;
      if (claims && claims.length > 0) {
        const claimValidation = validateGroundedClaims(claims, context);
        if (!claimValidation.valid) {
          emitter.emitError(
            'AI.INVALID_MODEL_RESPONSE',
            `Validação de alegações falhou: ${claimValidation.invalidReasons.join('; ')}`,
          );
          return;
        }
        validatedClaims = claimValidation.validatedClaims as GroundedClaimV1[];
      }

      // Validate evidence citations
      const validation = validateExplanationEvidence(evidenceFactIds, context);
      if (!validation.valid || validation.resolvedEvidence.length === 0) {
        emitter.emitError(
          'AI.INVALID_MODEL_RESPONSE',
          'A resposta do modelo carece de evidências factuais comprovadas no ledger.',
        );
        return;
      }

      if (clientSignal?.aborted) {
        return;
      }

      // 6. Emit PROGRESS: RENDERING (Sequence 6)
      emitter.emitProgress('RENDERING');

      const serverRenderedAnswer =
        validatedClaims && validatedClaims.length > 0 ? renderValidatedClaims(validatedClaims) : '';
      const finalAnswer = serverRenderedAnswer || parseResult.data.answer || '';
      const minimalSnapshot = buildMinimalEvidenceSnapshot(validation.resolvedEvidence);
      const resolvedLimitations =
        limitations.length > 0 ? limitations : context.limitations.map((l) => l.description);

      // Persist validated assistant message in DB BEFORE emitting FINAL event (ADR-203)
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
      } catch {
        emitter.emitError(
          'AI.PERSISTENCE_ERROR',
          'Falha ao persistir a resposta validada da conversa no banco de dados.',
        );
        return;
      }

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
        return;
      }
      if (!emitter.completed) {
        const errorMsg =
          err instanceof Error ? err.message : 'Erro interno durante processamento da transmissão';
        emitter.emitError('AI.STREAM_INTERNAL_ERROR', errorMsg);
      }
    }
  }
}
