import { Inject, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import {
  IPortfolioRepository,
  IAiConversationRepository,
  AiConversationRecord,
} from '@atlas/database';
import { PORTFOLIO_REPOSITORY, AI_CONVERSATION_REPOSITORY } from '../../database/tokens';

export const ListAiConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().uuid().optional(),
});

export type ListAiConversationsQuery = z.infer<typeof ListAiConversationsQuerySchema>;

export const ListAiConversationsInputSchema = ListAiConversationsQuerySchema.extend({
  portfolioId: z.string().uuid({ message: 'portfolioId must be a valid UUID' }),
  userId: z.string().min(1, { message: 'userId is required' }),
});

export type ListAiConversationsInput = z.infer<typeof ListAiConversationsInputSchema>;

export interface ListAiConversationsResult {
  items: AiConversationRecord[];
  nextCursor?: string;
  hasMore: boolean;
}

@Injectable()
export class ListAiConversationsUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(AI_CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IAiConversationRepository,
  ) {}

  async execute(input: ListAiConversationsInput): Promise<ListAiConversationsResult> {
    const validated = ListAiConversationsInputSchema.parse(input);

    const portfolio = await this.portfolioRepository.findByIdAndUserId(
      validated.portfolioId,
      validated.userId,
    );

    if (!portfolio) {
      throw new HttpException(
        {
          message: 'Portfolio not found',
          code: 'PORTFOLIO.NOT_FOUND',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return this.conversationRepository.listConversations(validated.portfolioId, validated.userId, {
      limit: validated.limit,
      cursor: validated.cursor,
    });
  }
}
