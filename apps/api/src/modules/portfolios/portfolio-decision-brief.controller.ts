import { Controller, Get, Post, Body, HttpCode, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { GetOpportunityRadarUseCase } from '../../application/portfolios/opportunity-radar/get-opportunity-radar.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

const DecisionBriefQuerySchema = z
  .object({
    contributionAmount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, {
        message: 'contributionAmount must be a positive decimal string with up to 2 decimal places.',
      })
      .refine((val) => !/^0+(\.0{1,2})?$/.test(val), {
        message: 'contributionAmount must be greater than zero.',
      })
      .optional(),
    refresh: z.enum(['true', 'false']).optional(),
  })
  .strict();

const SimulateContributionBodySchema = z
  .object({
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, {
        message: 'amount must be a positive decimal string with up to 2 decimal places.',
      })
      .refine((val) => !/^0+(\.0{1,2})?$/.test(val), {
        message: 'amount must be greater than zero.',
      })
      .refine((val) => parseFloat(val) <= 100_000_000, {
        message: 'amount exceeds maximum simulation limit of R$ 100.000.000,00.',
      }),
    currency: z.string().trim().length(3).optional(),
    refresh: z.boolean().optional(),
  })
  .strict();

const ContributionProgressQuerySchema = z
  .object({
    period: z
      .string()
      .trim()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
        message: 'period must be in YYYY-MM format.',
      })
      .optional(),
    contributionAmount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, {
        message: 'contributionAmount must be a positive decimal string with up to 2 decimal places.',
      })
      .refine((val) => !/^0+(\.0{1,2})?$/.test(val), {
        message: 'contributionAmount must be greater than zero.',
      })
      .optional(),
    refresh: z.enum(['true', 'false']).optional(),
  })
  .strict();

/**
 * Phase APP-16S — Daily Portfolio Decision Brief (Read-only analysis).
 *
 * Synthesizes existing Opportunity Radar, News Intelligence, FII dividend
 * calendar/cash rotation, and data-quality guards into an explainable daily
 * study shortlist without recalculating scores or executing orders.
 */
@ApiTags('PortfolioDecisionBrief')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/decision-brief')
export class PortfolioDecisionBriefController {
  constructor(
    @Inject(GetOpportunityRadarUseCase)
    private readonly radarUseCase: GetOpportunityRadarUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get daily portfolio decision brief (read-only)',
    description:
      'Returns a deterministic, explainable shortlist of portfolio assets to study first for a potential contribution, including data-quality cautions, blockers, FII cash rotation cues, and changes since the prior analysis.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiQuery({
    name: 'contributionAmount',
    required: false,
    description: 'Optional read-only simulated contribution amount as a positive decimal string (e.g., "1000.00"). Never persisted.',
  })
  @ApiQuery({
    name: 'refresh',
    required: false,
    description: 'Optional boolean string ("true" | "false") to force-refresh the underlying Opportunity Radar snapshot.',
  })
  @ApiResponse({ status: 200, description: 'Daily portfolio decision brief' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getDecisionBrief(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() rawQuery: Record<string, unknown>,
  ) {
    const query = DecisionBriefQuerySchema.parse(rawQuery);
    const data = await this.radarUseCase.getDecisionBrief({
      portfolioId,
      userId: principal.userId,
      contributionAmount: query.contributionAmount,
      forceRefresh: query.refresh === 'true',
    });
    return { data };
  }

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simulate contribution allocation across portfolio assets (read-only)',
    description:
      'Distributes a user-declared contribution amount among prioritized holdings using Decision Brief rankings, allocation gaps, opportunity scores, and confidence. Stateless, read-only, exact cents conservation, zero orders.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Contribution allocation simulation' })
  @ApiResponse({ status: 400, description: 'Invalid simulation input' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async simulateContribution(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() rawBody: Record<string, unknown>,
  ) {
    const body = SimulateContributionBodySchema.parse(rawBody);
    const data = await this.radarUseCase.simulateContributionAllocation({
      portfolioId,
      userId: principal.userId,
      contributionAmount: body.amount,
      currency: body.currency,
      forceRefresh: body.refresh,
    });
    return { data };
  }

  @Post('scenarios')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Compare contribution allocation scenarios (read-only)',
    description:
      'Compares three simulated contribution allocation modes (Cautious, Balanced, and Opportunity-Focused) across prioritized holdings without recalculating scores or executing orders. Uses a single underlying decision brief resolution.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Contribution scenario comparison' })
  @ApiResponse({ status: 400, description: 'Invalid simulation input' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async compareScenarios(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() rawBody: Record<string, unknown>,
  ) {
    const body = SimulateContributionBodySchema.parse(rawBody);
    const data = await this.radarUseCase.compareContributionScenarios({
      portfolioId,
      userId: principal.userId,
      contributionAmount: body.amount,
      currency: body.currency,
      forceRefresh: body.refresh,
    });
    return { data };
  }

  @Post('projection')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Project portfolio after contribution (read-only)',
    description:
      'Projects portfolio weights, class gaps, and concentration before vs after a simulated contribution. Read-only, exact cents conservation, zero orders.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Projected portfolio after contribution' })
  @ApiResponse({ status: 400, description: 'Invalid simulation input' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async projectPortfolio(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() rawBody: Record<string, unknown>,
  ) {
    const body = SimulateContributionBodySchema.parse(rawBody);
    const data = await this.radarUseCase.projectPortfolioAfterContribution({
      portfolioId,
      userId: principal.userId,
      contributionAmount: body.amount,
      currency: body.currency,
      forceRefresh: body.refresh,
    });
    return { data };
  }

  @Post('project-scenarios')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Project portfolio scenarios after contribution (read-only)',
    description:
      'Compares projected portfolio states across the three contribution modes (Cautious, Balanced, and Opportunity-Focused) on a shared before baseline. Read-only, zero orders.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Projected portfolio scenario comparison' })
  @ApiResponse({ status: 400, description: 'Invalid simulation input' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async projectScenarios(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() rawBody: Record<string, unknown>,
  ) {
    const body = SimulateContributionBodySchema.parse(rawBody);
    const data = await this.radarUseCase.projectPortfolioScenarioComparison({
      portfolioId,
      userId: principal.userId,
      contributionAmount: body.amount,
      currency: body.currency,
      forceRefresh: body.refresh,
    });
    return { data };
  }

  @Get('contribution-progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Track contribution plan progress against actual movements (read-only)',
    description:
      'Compares a planned contribution (from saved goal or explicit simulation) against actual purchase movements recorded in the ledger within the period. Zero orders, zero broker calls, exact cents conservation.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiQuery({
    name: 'period',
    required: false,
    description: 'Target month in YYYY-MM format. Defaults to current month.',
  })
  @ApiQuery({
    name: 'contributionAmount',
    required: false,
    description: 'Optional simulated contribution amount (decimal string). If omitted, uses active ContributionGoal.',
  })
  @ApiQuery({
    name: 'refresh',
    required: false,
    description: 'Optional boolean string ("true" | "false") to force-refresh underlying radar snapshot.',
  })
  @ApiResponse({ status: 200, description: 'Contribution plan tracking and progress' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getContributionProgress(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() rawQuery: Record<string, unknown>,
  ) {
    const query = ContributionProgressQuerySchema.parse(rawQuery);
    const data = await this.radarUseCase.getContributionProgress({
      portfolioId,
      userId: principal.userId,
      period: query.period,
      contributionAmount: query.contributionAmount,
      forceRefresh: query.refresh === 'true',
    });
    return { data };
  }
}
