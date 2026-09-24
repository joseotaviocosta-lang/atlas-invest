import { Controller, Get, Param, Query, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { GetPortfolioAiGroundingContextUseCase } from '../../application/ai/get-portfolio-ai-grounding-context.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';

@ApiTags('Portfolios')
@ApiBearerAuth()
@Controller('api/v1/portfolios')
export class AiController {
  constructor(
    @Inject(GetPortfolioAiGroundingContextUseCase)
    private readonly getPortfolioAiGroundingContextUseCase: GetPortfolioAiGroundingContextUseCase,
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
}
