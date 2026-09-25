import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GetPortfolioAiGroundingContextUseCase } from '../../application/ai/get-portfolio-ai-grounding-context.use-case';
import {
  ExplainPortfolioWithAiUseCase,
  ExplainPortfolioBodySchema,
  ExplainPortfolioBody,
} from '../../application/ai/explain-portfolio-with-ai.use-case';
import {
  CreateAiConversationUseCase,
  CreateAiConversationBodySchema,
  CreateAiConversationBody,
} from '../../application/ai/create-ai-conversation.use-case';
import { ListAiConversationsUseCase } from '../../application/ai/list-ai-conversations.use-case';
import { GetAiConversationUseCase } from '../../application/ai/get-ai-conversation.use-case';
import {
  SendAiConversationMessageUseCase,
  SendAiConversationMessageBodySchema,
  SendAiConversationMessageBody,
} from '../../application/ai/send-ai-conversation-message.use-case';
import { UUIDParamPipe, ZodValidationPipe } from '../../common/pipes';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';

@ApiTags('Portfolios')
@ApiBearerAuth()
@Controller('api/v1/portfolios')
export class AiController {
  constructor(
    @Inject(GetPortfolioAiGroundingContextUseCase)
    private readonly getPortfolioAiGroundingContextUseCase: GetPortfolioAiGroundingContextUseCase,
    @Inject(ExplainPortfolioWithAiUseCase)
    private readonly explainPortfolioWithAiUseCase: ExplainPortfolioWithAiUseCase,
    @Inject(CreateAiConversationUseCase)
    private readonly createAiConversationUseCase: CreateAiConversationUseCase,
    @Inject(ListAiConversationsUseCase)
    private readonly listAiConversationsUseCase: ListAiConversationsUseCase,
    @Inject(GetAiConversationUseCase)
    private readonly getAiConversationUseCase: GetAiConversationUseCase,
    @Inject(SendAiConversationMessageUseCase)
    private readonly sendAiConversationMessageUseCase: SendAiConversationMessageUseCase,
  ) {}

  @Get(':portfolioId/ai/grounding')
  @ApiOperation({
    summary:
      'Get deterministic Portfolio AI Grounding Context — compact, versioned, traceable facts and capabilities/limitations for future AI boundary (Phase 3Q)',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Portfolio AI grounding context' })
  @ApiResponse({ status: 400, description: 'Invalid period' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getAiGroundingContext(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getPortfolioAiGroundingContextUseCase.execute({
      portfolioId,
      userId: principal.userId,
      startDate,
      endDate,
    });
    return { data };
  }

  @Post(':portfolioId/ai/explain')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Grounded AI Explanation — factual, evidence-bound explanation of portfolio facts (Phase 3R)',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Grounded AI explanation response' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  @ApiResponse({ status: 422, description: 'Unprocessable entity / invalid model response' })
  @ApiResponse({ status: 503, description: 'AI provider unavailable' })
  async explainPortfolio(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(ExplainPortfolioBodySchema)) body: ExplainPortfolioBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.explainPortfolioWithAiUseCase.execute({
      portfolioId,
      userId: principal.userId,
      question: body.question,
      startDate: body.startDate,
      endDate: body.endDate,
    });
    return { data };
  }

  @Post(':portfolioId/ai/conversations')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Create a new AI conversation scoped to a portfolio and user (Phase 3S)',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 201, description: 'Conversation created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async createConversation(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(CreateAiConversationBodySchema)) body: CreateAiConversationBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.createAiConversationUseCase.execute({
      portfolioId,
      userId: principal.userId,
      title: body.title,
    });
    return { data };
  }

  @Get(':portfolioId/ai/conversations')
  @ApiOperation({
    summary: 'List AI conversations for a portfolio (Phase 3S)',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'List of conversations' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async listConversations(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query('limit') limitStr: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const limit = limitStr ? Number(limitStr) : undefined;
    const result = await this.listAiConversationsUseCase.execute({
      portfolioId,
      userId: principal.userId,
      limit,
      cursor,
    });
    return {
      data: result.items,
      meta: {
        limit: limit ?? 20,
        cursor,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  @Get(':portfolioId/ai/conversations/:conversationId')
  @ApiOperation({
    summary: 'Get an AI conversation with paginated messages (Phase 3S)',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'conversationId', description: 'UUID of the conversation' })
  @ApiResponse({ status: 200, description: 'Conversation and messages' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Conversation or portfolio not found' })
  async getConversation(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('conversationId', UUIDParamPipe) conversationId: string,
    @Query('limit') limitStr: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const limit = limitStr ? Number(limitStr) : undefined;
    const result = await this.getAiConversationUseCase.execute({
      portfolioId,
      conversationId,
      userId: principal.userId,
      limit,
      cursor,
    });
    return {
      data: {
        ...result.conversation,
        messages: result.messages,
      },
      meta: {
        limit: limit ?? 50,
        cursor,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  @Post(':portfolioId/ai/conversations/:conversationId/messages')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Send a message in an AI conversation with bounded history and fresh grounding (Phase 3S)',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'conversationId', description: 'UUID of the conversation' })
  @ApiResponse({ status: 200, description: 'Conversation turn response' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Conversation or portfolio not found' })
  @ApiResponse({ status: 422, description: 'Unprocessable entity / invalid model response' })
  @ApiResponse({ status: 503, description: 'AI provider unavailable' })
  async sendMessage(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('conversationId', UUIDParamPipe) conversationId: string,
    @Body(new ZodValidationPipe(SendAiConversationMessageBodySchema))
    body: SendAiConversationMessageBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.sendAiConversationMessageUseCase.execute({
      portfolioId,
      conversationId,
      userId: principal.userId,
      question: body.question,
      startDate: body.startDate,
      endDate: body.endDate,
    });
    return { data };
  }
}
