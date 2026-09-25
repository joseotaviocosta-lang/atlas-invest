import { Inject, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import {
  IPortfolioRepository,
  IAiConversationRepository,
  AiConversationRecord,
} from '@atlas/database';
import { PORTFOLIO_REPOSITORY, AI_CONVERSATION_REPOSITORY } from '../../database/tokens';

export const CreateAiConversationBodySchema = z.object({
  title: z.string().trim().max(255).optional(),
});

export type CreateAiConversationBody = z.infer<typeof CreateAiConversationBodySchema>;

export const CreateAiConversationInputSchema = CreateAiConversationBodySchema.extend({
  portfolioId: z.string().uuid({ message: 'portfolioId must be a valid UUID' }),
  userId: z.string().min(1, { message: 'userId is required' }),
});

export type CreateAiConversationInput = z.infer<typeof CreateAiConversationInputSchema>;

@Injectable()
export class CreateAiConversationUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(AI_CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IAiConversationRepository,
  ) {}

  async execute(input: CreateAiConversationInput): Promise<AiConversationRecord> {
    const validated = CreateAiConversationInputSchema.parse(input);

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

    return this.conversationRepository.createConversation({
      portfolioId: validated.portfolioId,
      userId: validated.userId,
      title: validated.title,
    });
  }
}
