import { Inject, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import {
  classifyConversationIntent,
  buildConversationPrompt,
  validateExplanationEvidence,
  buildMinimalEvidenceSnapshot,
  selectConversationHistory,
  INTENT_REFUSAL_MESSAGES,
  AIProvider,
  GroundedAiExplanationResponseV1,
  ConversationHistoryMessage,
  ExplanationIntent,
} from '@atlas/ai-engine';
import { IAiConversationRepository } from '@atlas/database';
import { GetPortfolioAiGroundingContextUseCase } from './get-portfolio-ai-grounding-context.use-case';
import { AI_CONVERSATION_REPOSITORY } from '../../database/tokens';
import { AI_PROVIDER_TOKEN } from '../../infrastructure/ai/openai-ai.provider';

export const SendAiConversationMessageBodySchema = z.object({
  question: z
    .string()
    .trim()
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

export type SendAiConversationMessageBody = z.infer<typeof SendAiConversationMessageBodySchema>;

export const SendAiConversationMessageInputSchema = SendAiConversationMessageBodySchema.extend({
  conversationId: z.string().uuid({ message: 'conversationId must be a valid UUID' }),
  portfolioId: z.string().uuid({ message: 'portfolioId must be a valid UUID' }),
  userId: z.string().min(1, { message: 'userId is required' }),
});

export type SendAiConversationMessageInput = z.infer<typeof SendAiConversationMessageInputSchema>;

const ModelOutputSchema = z.object({
  answer: z.string().min(1, { message: 'Model answer cannot be empty' }),
  evidenceFactIds: z.array(z.string()),
  limitations: z.array(z.string()).default([]),
});

export interface GroundedConversationTurnResponseDto extends GroundedAiExplanationResponseV1 {
  readonly userMessageId?: string;
  readonly assistantMessageId?: string;
}

/**
 * SendAiConversationMessageUseCase (Phase 3S, ADR-186–ADR-192)
 *
 * Canonical orchestrator for multi-turn grounded conversations:
 * 1. Validates ownership (hidden 404).
 * 2. Retrieves bounded recent history from database.
 * 3. Evaluates deterministic intent gate before any grounding or model work.
 * 4. Refuses unsupported requests with 0 grounding calls and 0 model calls, persisting safe audit.
 * 5. Rebuilds fresh canonical PortfolioAiGroundingContextV1 for every supported turn (1 call).
 * 6. Bounds history deterministically (drop oldest first, char & count limits).
 * 7. Enforces system policy: prior assistant messages are contextual narrative only, NOT financial truth.
 * 8. Validates model citations strictly against CURRENT grounding facts.
 * 9. Persists turn atomically with minimal exact-decimal evidence snapshot.
 */
@Injectable()
export class SendAiConversationMessageUseCase {
  constructor(
    @Inject(AI_CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IAiConversationRepository,
    @Inject(GetPortfolioAiGroundingContextUseCase)
    private readonly getGroundingContextUseCase: GetPortfolioAiGroundingContextUseCase,
    @Inject(AI_PROVIDER_TOKEN)
    private readonly aiProvider: AIProvider,
  ) {}

  async execute(
    input: SendAiConversationMessageInput,
  ): Promise<GroundedConversationTurnResponseDto> {
    const validatedInput = SendAiConversationMessageInputSchema.parse(input);

    // 1. Ownership & Scoping check (hidden 404)
    const conversation = await this.conversationRepository.findConversationById(
      validatedInput.conversationId,
      validatedInput.portfolioId,
      validatedInput.userId,
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

    // 2. Load recent conversation history (up to 20 raw messages, sorted oldest-first)
    const rawHistory = await this.conversationRepository.listMessages(
      validatedInput.conversationId,
      {
        limit: 20,
        order: 'asc',
      },
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

    // Bounded history selection (max 10 messages, max 14k chars)
    const selectedHistory = selectConversationHistory(historyMessages, {
      maxMessages: 10,
      maxChars: 14000,
    });

    // 3. Deterministic intent / capability gate BEFORE model invocation
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
      // Upstream refusal: ZERO grounding calls, ZERO provider calls
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
    const context = await this.getGroundingContextUseCase.execute({
      portfolioId: validatedInput.portfolioId,
      userId: validatedInput.userId,
      startDate: validatedInput.startDate,
      endDate: validatedInput.endDate,
    });

    // 5. Build bounded multi-turn model request
    const { messages } = buildConversationPrompt(
      context,
      validatedInput.question,
      intent,
      selectedHistory.messages,
    );

    // 6. Call AI provider EXACTLY ONCE
    let completion;
    try {
      completion = await this.aiProvider.complete(messages, { temperature: 0.1 });
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

    // 7. Parse and validate structured model output
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

    // 8. Strict evidence validation against CURRENT grounding context
    const validation = validateExplanationEvidence(evidenceFactIds, context);
    if (!validation.valid) {
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
      throw new HttpException(
        {
          message: 'Model response lacks verified financial evidence citations',
          code: 'AI.INVALID_MODEL_RESPONSE',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 9. Build minimal exact-decimal evidence audit snapshot
    const minimalSnapshot = buildMinimalEvidenceSnapshot(validation.resolvedEvidence);
    const resolvedLimitations =
      limitations.length > 0 ? limitations : context.limitations.map((l) => l.description);

    // 10. Persist safe turn atomically in database
    const turn = await this.conversationRepository.appendTurn(
      validatedInput.conversationId,
      { content: validatedInput.question },
      {
        content: answer,
        status: 'ANSWERED',
        intent,
        evidenceSnapshot: minimalSnapshot,
        limitations: resolvedLimitations,
        provider: process.env.AI_PROVIDER || 'openai',
        model: process.env.AI_MODEL || 'gpt-4o-mini',
      },
    );

    // 11. Return safe structured conversation turn response
    return {
      schemaVersion: '1',
      status: 'ANSWERED',
      intent,
      answer,
      evidence: validation.resolvedEvidence,
      limitations: resolvedLimitations,
      model: {
        provider: process.env.AI_PROVIDER || 'openai',
        model: process.env.AI_MODEL || 'gpt-4o-mini',
      },
      userMessageId: turn.userMessage.id,
      assistantMessageId: turn.assistantMessage.id,
    };
  }
}
