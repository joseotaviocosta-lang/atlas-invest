import { Inject, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import {
  IAiConversationRepository,
  AiConversationRecord,
  AiConversationMessageRecord,
} from '@atlas/database';
import { AI_CONVERSATION_REPOSITORY } from '../../database/tokens';

export const GetAiConversationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().uuid().optional(),
});

export type GetAiConversationQuery = z.infer<typeof GetAiConversationQuerySchema>;

export const GetAiConversationInputSchema = GetAiConversationQuerySchema.extend({
  conversationId: z.string().uuid({ message: 'conversationId must be a valid UUID' }),
  portfolioId: z.string().uuid({ message: 'portfolioId must be a valid UUID' }),
  userId: z.string().min(1, { message: 'userId is required' }),
});

export type GetAiConversationInput = z.infer<typeof GetAiConversationInputSchema>;

export interface GetAiConversationResult {
  conversation: AiConversationRecord;
  messages: AiConversationMessageRecord[];
  nextCursor?: string;
  hasMore: boolean;
}

@Injectable()
export class GetAiConversationUseCase {
  constructor(
    @Inject(AI_CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IAiConversationRepository,
  ) {}

  async execute(input: GetAiConversationInput): Promise<GetAiConversationResult> {
    const validated = GetAiConversationInputSchema.parse(input);

    const conversation = await this.conversationRepository.findConversationById(
      validated.conversationId,
      validated.portfolioId,
      validated.userId,
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

    const {
      items: messages,
      nextCursor,
      hasMore,
    } = await this.conversationRepository.listMessages(validated.conversationId, {
      limit: validated.limit,
      cursor: validated.cursor,
      order: 'asc',
    });

    return {
      conversation,
      messages,
      nextCursor,
      hasMore,
    };
  }
}
