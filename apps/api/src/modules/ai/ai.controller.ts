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
}
