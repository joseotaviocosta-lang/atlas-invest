import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PortfolioContributionPlansUseCase } from '../../application/portfolios/portfolio-contribution-plans.use-case';
import { MAX_ACTIVE_CONTRIBUTION_PLANS_PER_PORTFOLIO } from '@atlas/portfolio-strategy';
import {
  CreateContributionPlanBody,
  CreateContributionPlanBodySchema,
  CreateContributionPlanSwaggerDto,
  PlanTrackingGroupBody,
  PlanTrackingGroupBodySchema,
  PlanTrackingGroupSwaggerDto,
  PlanTrackingLinkBody,
  PlanTrackingLinkBodySchema,
  PlanTrackingLinkSwaggerDto,
  UpdateContributionPlanBody,
  UpdateContributionPlanBodySchema,
  UpdateContributionPlanSwaggerDto,
} from './dto/portfolio-contribution-plans.dto';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase 5Q-F — user-declared contribution plans (future intent, not advice).
 *
 * Plans record what the user intends to contribute. Completing or
 * cancelling flips status only — never creates transactions, orders or
 * ledger writes. Live impact always recomputes against the current
 * portfolio + strategy.
 */
@ApiTags('PortfolioContributionPlans')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/contribution-plans')
export class PortfolioContributionPlansController {
  constructor(
    @Inject(PortfolioContributionPlansUseCase)
    private readonly plans: PortfolioContributionPlansUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Declare a contribution plan (intent only)',
    description:
      'Persists the user-declared intent (name, date-only plannedDate, per-category amounts). Never creates transactions or orders.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiBody({ type: CreateContributionPlanSwaggerDto })
  @ApiResponse({ status: 201, description: 'Declared plan' })
  @ApiResponse({ status: 400, description: 'Invalid name, date, category or amount' })
  @ApiResponse({ status: 404, description: 'Portfolio or source scenario not found' })
  async createPlan(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(CreateContributionPlanBodySchema))
    body: CreateContributionPlanBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const plan = await this.plans.createPlan({
      portfolioId,
      userId: principal.userId,
      name: body.name,
      plannedDate: body.plannedDate,
      items: body.items,
      sourceScenarioId: body.sourceScenarioId ?? null,
    });
    return { data: { plan } };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List contribution plans (upcoming + history, no live impact)',
    description:
      'Returns declared intents only. Upcoming PLANNED plans sort by date ascending; terminal history sorts newest first.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiQuery({ name: 'status', required: false, enum: ['PLANNED', 'COMPLETED', 'CANCELLED'] })
  @ApiResponse({ status: 200, description: 'Plans grouped by lifecycle' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async listPlans(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('status') status?: string,
  ) {
    if (status !== undefined && !['PLANNED', 'COMPLETED', 'CANCELLED'].includes(status)) {
      // Unknown filter values fail closed with an empty (not misleading) list.
      return {
        data: {
          upcoming: [],
          history: [],
          activeLimit: MAX_ACTIVE_CONTRIBUTION_PLANS_PER_PORTFOLIO,
        },
      };
    }
    const result = await this.plans.listPlans(portfolioId, principal.userId);
    if (status === 'PLANNED') {
      return { data: { ...result, history: [] } };
    }
    if (status === 'COMPLETED' || status === 'CANCELLED') {
      return {
        data: {
          ...result,
          upcoming: [],
          history: result.history.filter((plan) => plan.status === status),
        },
      };
    }
    return { data: result };
  }

  @Get('next')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read the next planned contribution (Today surface)',
    description:
      'Returns the earliest PLANNED plan, or null when none exists. Intent only — no live impact computed here.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Next plan or null' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getNext(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.plans.getNextPlanned(portfolioId, principal.userId);
    return { data: result };
  }

  @Get(':planId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Open a plan with live impact',
    description:
      'Returns the declared intent plus a live impact recomputed against the current portfolio and strategy.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'planId', description: 'UUID of the contribution plan' })
  @ApiResponse({ status: 200, description: 'Plan with live impact' })
  @ApiResponse({ status: 404, description: 'Portfolio or plan not found' })
  async getPlan(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('planId', UUIDParamPipe) planId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.plans.getPlanDetail({
      planId,
      portfolioId,
      userId: principal.userId,
    });
    return { data: result };
  }

  @Put(':planId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Replace a PLANNED plan (atomic full replacement)',
    description:
      'Only PLANNED plans are editable. Completed and cancelled history stays immutable.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'planId', description: 'UUID of the contribution plan' })
  @ApiBody({ type: UpdateContributionPlanSwaggerDto })
  @ApiResponse({ status: 200, description: 'Updated plan' })
  @ApiResponse({ status: 400, description: 'Invalid input or immutable status' })
  @ApiResponse({ status: 404, description: 'Portfolio or plan not found' })
  async updatePlan(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('planId', UUIDParamPipe) planId: string,
    @Body(new ZodValidationPipe(UpdateContributionPlanBodySchema))
    body: UpdateContributionPlanBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const plan = await this.plans.updatePlan({
      planId,
      portfolioId,
      userId: principal.userId,
      name: body.name,
      plannedDate: body.plannedDate,
      items: body.items,
    });
    return { data: { plan } };
  }

  @Post(':planId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a plan as completed (status only)',
    description: 'Flips PLANNED to COMPLETED. Creates no transaction, order or ledger write.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'planId', description: 'UUID of the contribution plan' })
  @ApiResponse({ status: 200, description: 'Completed plan' })
  @ApiResponse({ status: 400, description: 'Plan is not PLANNED' })
  @ApiResponse({ status: 404, description: 'Portfolio or plan not found' })
  async completePlan(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('planId', UUIDParamPipe) planId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const plan = await this.plans.completePlan({ planId, portfolioId, userId: principal.userId });
    return { data: { plan } };
  }

  @Post(':planId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a plan (status only)',
    description: 'Flips PLANNED to CANCELLED. The portfolio and history are untouched.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'planId', description: 'UUID of the contribution plan' })
  @ApiResponse({ status: 200, description: 'Cancelled plan' })
  @ApiResponse({ status: 400, description: 'Plan is not PLANNED' })
  @ApiResponse({ status: 404, description: 'Portfolio or plan not found' })
  async cancelPlan(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('planId', UUIDParamPipe) planId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const plan = await this.plans.cancelPlan({ planId, portfolioId, userId: principal.userId });
    return { data: { plan } };
  }

  @Delete(':planId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a PLANNED plan',
    description:
      'Only PLANNED plans are deletable. Completed and cancelled plans are preserved as history.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'planId', description: 'UUID of the contribution plan' })
  @ApiResponse({ status: 200, description: 'Plan deleted' })
  @ApiResponse({ status: 400, description: 'Plan is not PLANNED' })
  @ApiResponse({ status: 404, description: 'Portfolio or plan not found' })
  async deletePlan(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('planId', UUIDParamPipe) planId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    await this.plans.deletePlan({ planId, portfolioId, userId: principal.userId });
    return { data: { deleted: true } };
  }

  @Get(':planId/tracking')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read planned vs actual tracking (confirmed links only)',
    description:
      'Aggregates CONFIRMED ledger links against the declared plan and derives deterministic candidates on read. Candidates are suggestions only — never counted until you confirm.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'planId', description: 'UUID of the contribution plan' })
  @ApiResponse({ status: 200, description: 'Plan with tracking, confirmed links and candidates' })
  @ApiResponse({ status: 404, description: 'Portfolio or plan not found' })
  async getTracking(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('planId', UUIDParamPipe) planId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.plans.getPlanTracking({
      planId,
      portfolioId,
      userId: principal.userId,
    });
    return { data: result };
  }

  @Post(':planId/tracking/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm a ledger transaction as plan actual',
    description:
      'Explicit human confirmation only. Creates no transaction and changes no plan status. Idempotent for the same link.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'planId', description: 'UUID of the contribution plan' })
  @ApiBody({ type: PlanTrackingLinkSwaggerDto })
  @ApiResponse({ status: 200, description: 'Link confirmed' })
  @ApiResponse({ status: 400, description: 'Ineligible transaction or immutable plan' })
  @ApiResponse({ status: 404, description: 'Portfolio, plan or transaction not found' })
  async confirmLink(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('planId', UUIDParamPipe) planId: string,
    @Body(new ZodValidationPipe(PlanTrackingLinkBodySchema)) body: PlanTrackingLinkBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const link = await this.plans.confirmPlanLink({
      planId,
      portfolioId,
      userId: principal.userId,
      transactionId: body.transactionId,
    });
    return { data: { link } };
  }

  @Post(':planId/tracking/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject a candidate (memory so it never reappears)',
    description: 'Idempotent. Does not touch the transaction or the plan.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'planId', description: 'UUID of the contribution plan' })
  @ApiBody({ type: PlanTrackingLinkSwaggerDto })
  @ApiResponse({ status: 200, description: 'Candidate rejected' })
  @ApiResponse({ status: 404, description: 'Portfolio, plan or transaction not found' })
  async rejectLink(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('planId', UUIDParamPipe) planId: string,
    @Body(new ZodValidationPipe(PlanTrackingLinkBodySchema)) body: PlanTrackingLinkBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const link = await this.plans.rejectPlanLink({
      planId,
      portfolioId,
      userId: principal.userId,
      transactionId: body.transactionId,
    });
    return { data: { link } };
  }

  @Post(':planId/tracking/confirm-group')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm a pair of transactions together (atomic)',
    description:
      'One explicit group action: both links persist in a single transaction or neither does. Vincular estas operações ao plano? Isso apenas registra a relação entre o plano e operações já existentes. Nenhum lançamento será criado ou executado.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'planId', description: 'UUID of the contribution plan' })
  @ApiBody({ type: PlanTrackingGroupSwaggerDto })
  @ApiResponse({ status: 200, description: 'Group confirmed atomically' })
  @ApiResponse({
    status: 400,
    description: 'Invalid IDs, same ID twice, ineligible or owned elsewhere',
  })
  @ApiResponse({ status: 404, description: 'Portfolio, plan or transaction not found' })
  async confirmGroup(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('planId', UUIDParamPipe) planId: string,
    @Body(new ZodValidationPipe(PlanTrackingGroupBodySchema)) body: PlanTrackingGroupBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.plans.confirmPlanGroup({
      planId,
      portfolioId,
      userId: principal.userId,
      transactionIds: body.transactionIds,
    });
    return { data: result };
  }

  @Get(':planId/tracking/search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually search ledger deposits in an explicit date range',
    description:
      'Same eligibility and currency rules as discovery; rejected and already-confirmed transactions stay hidden. Span capped at 90 days. Read-only.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'planId', description: 'UUID of the contribution plan' })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Date-only YYYY-MM-DD (default planned − 90d)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Date-only YYYY-MM-DD (default planned + 90d)',
  })
  @ApiResponse({ status: 200, description: 'Manual search candidates' })
  @ApiResponse({ status: 400, description: 'Invalid range' })
  @ApiResponse({ status: 404, description: 'Portfolio or plan not found' })
  async searchTransactions(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('planId', UUIDParamPipe) planId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const result = await this.plans.searchPlanTransactions({
      planId,
      portfolioId,
      userId: principal.userId,
      from,
      to,
    });
    return { data: result };
  }

  @Delete(':planId/tracking/:transactionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unlink a confirmed transaction (keeps the audit row)',
    description: 'Flips CONFIRMED to REJECTED. Already-rejected is a no-op success.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'planId', description: 'UUID of the contribution plan' })
  @ApiParam({ name: 'transactionId', description: 'UUID of the ledger transaction' })
  @ApiResponse({ status: 200, description: 'Link unlinked' })
  @ApiResponse({ status: 404, description: 'Portfolio, plan, transaction or link not found' })
  async unlinkLink(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('planId', UUIDParamPipe) planId: string,
    @Param('transactionId', UUIDParamPipe) transactionId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const link = await this.plans.unlinkPlanLink({
      planId,
      portfolioId,
      userId: principal.userId,
      transactionId,
    });
    return { data: { link } };
  }
}
