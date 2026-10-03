import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Inject,
  HttpCode,
  HttpStatus,
  ConflictException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { GetMonthlyTaxStateUseCase } from '../../application/fiscal/get-monthly-tax-state.use-case';
import { GetMonthlyTaxLiabilityUseCase } from '../../application/fiscal/get-monthly-tax-liability.use-case';
import {
  GetTaxCompensationElectionUseCase,
  PutTaxCompensationElectionUseCase,
} from '../../application/fiscal/tax-compensation-election.use-case';
import { GetTaxInputReadinessUseCase } from '../../application/fiscal/get-tax-input-readiness.use-case';
import {
  RecordFiiTaxEligibilityFactsUseCase,
  RecordTradeClassificationUseCase,
  RecordWithholdingInputUseCase,
} from '../../application/fiscal/record-tax-inputs.use-case';
import { ListTaxInputsUseCase } from '../../application/fiscal/list-tax-inputs.use-case';
import {
  ResolveTaxInputConflictUseCase,
  type TaxInputEntity,
} from '../../application/fiscal/resolve-tax-input-conflict.use-case';
import { MaterializeTaxObligationUseCase } from '../../application/fiscal/materialize-tax-obligation.use-case';
import {
  GetTaxObligationUseCase,
  ListTaxObligationsUseCase,
} from '../../application/fiscal/tax-obligation-query.use-case';
import { RecordTaxPaymentUseCase } from '../../application/fiscal/record-tax-payment.use-case';
import { GetTaxPaymentAdjustmentUseCase } from '../../application/fiscal/get-tax-payment-adjustment.use-case';
import { GetTaxPaymentSummaryUseCase } from '../../application/fiscal/get-tax-payment-summary.use-case';
import { SettleTaxPaymentAggregationUseCase } from '../../application/fiscal/settle-tax-payment-aggregation.use-case';
import { GetDarfReadinessUseCase } from '../../application/fiscal/get-darf-readiness.use-case';
import { CreateDarfHandoffUseCase } from '../../application/fiscal/create-darf-handoff.use-case';
import {
  GetDarfGenerationUseCase,
  ListDarfGenerationsUseCase,
} from '../../application/fiscal/darf-generation-query.use-case';
import {
  GetTaxpayerIdentityUseCase,
  RecordTaxpayerIdentityUseCase,
} from '../../application/fiscal/taxpayer-identity.use-case';
import { GetAnnualPositionReportUseCase } from '../../application/fiscal/get-annual-position-report.use-case';
import { GetAnnualCapitalMarketSummaryUseCase } from '../../application/fiscal/get-annual-capital-market-summary.use-case';
import { GetAnnualInvestmentIncomeSummaryUseCase } from '../../application/fiscal/get-annual-investment-income-summary.use-case';
import { RecordAnnualOpeningPositionUseCase } from '../../application/fiscal/record-annual-opening-position.use-case';
import { ListAnnualOpeningPositionsUseCase } from '../../application/fiscal/list-annual-opening-positions.use-case';
import { ConfirmAnnualOpeningPositionUseCase } from '../../application/fiscal/confirm-annual-opening-position.use-case';
import { GetAnnualTaxReadinessUseCase } from '../../application/fiscal/get-annual-tax-readiness.use-case';
import { GetAnnualTaxReportingPackageUseCase } from '../../application/fiscal/get-annual-tax-reporting-package.use-case';
import { RecordTaxpayerConfirmationUseCase } from '../../application/fiscal/record-taxpayer-confirmation.use-case';
import { ZodValidationPipe } from '../../common/pipes';

import {
  AnnualPositionsQuery,
  AnnualPositionsQuerySchema,
  ListAnnualOpeningPositionsQuery,
  ListAnnualOpeningPositionsQuerySchema,
  RecordAnnualOpeningPositionBody,
  RecordAnnualOpeningPositionBodySchema,
} from './dto/annual-position.dto';
import {
  AnnualCapitalMarketParam,
  AnnualCapitalMarketParamSchema,
} from './dto/annual-capital-market.dto';
import {
  AnnualInvestmentIncomeParam,
  AnnualInvestmentIncomeParamSchema,
} from './dto/annual-investment-income.dto';
import {
  AnnualTaxReadinessParam,
  AnnualTaxReadinessParamSchema,
  RecordTaxpayerConfirmationBody,
  RecordTaxpayerConfirmationBodySchema,
} from './dto/annual-tax-readiness.dto';
import {
  AnnualTaxReportingParam,
  AnnualTaxReportingParamSchema,
} from './dto/annual-tax-reporting.dto';

import {
  AdjustmentQuery,
  AdjustmentQuerySchema,
  DarfHandoffBody,
  DarfHandoffBodySchema,
  DarfReadinessQuery,
  DarfReadinessQuerySchema,
  ListDarfGenerationsQuery,
  ListDarfGenerationsQuerySchema,
  ListTaxObligationsQuery,
  ListTaxObligationsQuerySchema,
  RecordTaxPaymentBody,
  RecordTaxPaymentBodySchema,
  RecordTaxpayerIdentityBody,
  RecordTaxpayerIdentityBodySchema,
  SettleTaxPaymentAggregationBody,
  SettleTaxPaymentAggregationBodySchema,
} from './dto/tax-obligation.dto';
import {
  RecordFiiMetadataBody,
  RecordFiiMetadataBodySchema,
  RecordTradeClassificationBody,
  RecordTradeClassificationBodySchema,
  RecordWithholdingBody,
  RecordWithholdingBodySchema,
  ResolveTaxInputConflictBody,
  ResolveTaxInputConflictBodySchema,
  PutEquityExemptLossElectionBody,
  PutEquityExemptLossElectionBodySchema,
} from './dto/tax-input.dto';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';

function conflict(): never {
  throw new ConflictException({
    message: 'A canonical tax input already exists for this identity with a different value.',
    code: 'TAX_INPUT.CONFLICT',
  });
}

@ApiTags('Fiscal')
@ApiBearerAuth()
@Controller('api/v1/fiscal')
export class FiscalController {
  constructor(
    @Inject(GetMonthlyTaxStateUseCase)
    private readonly getMonthlyTaxStateUseCase: GetMonthlyTaxStateUseCase,
    @Inject(GetMonthlyTaxLiabilityUseCase)
    private readonly getMonthlyTaxLiabilityUseCase: GetMonthlyTaxLiabilityUseCase,
    @Inject(GetTaxCompensationElectionUseCase)
    private readonly getTaxCompensationElectionUseCase: GetTaxCompensationElectionUseCase,
    @Inject(PutTaxCompensationElectionUseCase)
    private readonly putTaxCompensationElectionUseCase: PutTaxCompensationElectionUseCase,
    @Inject(GetTaxInputReadinessUseCase)
    private readonly getTaxInputReadinessUseCase: GetTaxInputReadinessUseCase,
    @Inject(RecordTradeClassificationUseCase)
    private readonly recordTradeClassificationUseCase: RecordTradeClassificationUseCase,
    @Inject(RecordWithholdingInputUseCase)
    private readonly recordWithholdingInputUseCase: RecordWithholdingInputUseCase,
    @Inject(RecordFiiTaxEligibilityFactsUseCase)
    private readonly recordFiiTaxEligibilityFactsUseCase: RecordFiiTaxEligibilityFactsUseCase,
    @Inject(ListTaxInputsUseCase)
    private readonly listTaxInputsUseCase: ListTaxInputsUseCase,
    @Inject(ResolveTaxInputConflictUseCase)
    private readonly resolveTaxInputConflictUseCase: ResolveTaxInputConflictUseCase,
    @Inject(MaterializeTaxObligationUseCase)
    private readonly materializeTaxObligationUseCase: MaterializeTaxObligationUseCase,
    @Inject(GetTaxObligationUseCase)
    private readonly getTaxObligationUseCase: GetTaxObligationUseCase,
    @Inject(ListTaxObligationsUseCase)
    private readonly listTaxObligationsUseCase: ListTaxObligationsUseCase,
    @Inject(RecordTaxPaymentUseCase)
    private readonly recordTaxPaymentUseCase: RecordTaxPaymentUseCase,
    @Inject(GetTaxPaymentAdjustmentUseCase)
    private readonly getTaxPaymentAdjustmentUseCase: GetTaxPaymentAdjustmentUseCase,
    @Inject(GetTaxPaymentSummaryUseCase)
    private readonly getTaxPaymentSummaryUseCase: GetTaxPaymentSummaryUseCase,
    @Inject(SettleTaxPaymentAggregationUseCase)
    private readonly settleTaxPaymentAggregationUseCase: SettleTaxPaymentAggregationUseCase,
    @Inject(GetDarfReadinessUseCase)
    private readonly getDarfReadinessUseCase: GetDarfReadinessUseCase,
    @Inject(CreateDarfHandoffUseCase)
    private readonly createDarfHandoffUseCase: CreateDarfHandoffUseCase,
    @Inject(GetDarfGenerationUseCase)
    private readonly getDarfGenerationUseCase: GetDarfGenerationUseCase,
    @Inject(ListDarfGenerationsUseCase)
    private readonly listDarfGenerationsUseCase: ListDarfGenerationsUseCase,
    @Inject(GetTaxpayerIdentityUseCase)
    private readonly getTaxpayerIdentityUseCase: GetTaxpayerIdentityUseCase,
    @Inject(RecordTaxpayerIdentityUseCase)
    private readonly recordTaxpayerIdentityUseCase: RecordTaxpayerIdentityUseCase,
    @Inject(GetAnnualPositionReportUseCase)
    private readonly getAnnualPositionReportUseCase: GetAnnualPositionReportUseCase,
    @Inject(GetAnnualCapitalMarketSummaryUseCase)
    private readonly getAnnualCapitalMarketSummaryUseCase: GetAnnualCapitalMarketSummaryUseCase,
    @Inject(GetAnnualInvestmentIncomeSummaryUseCase)
    private readonly getAnnualInvestmentIncomeSummaryUseCase: GetAnnualInvestmentIncomeSummaryUseCase,
    @Inject(RecordAnnualOpeningPositionUseCase)
    private readonly recordAnnualOpeningPositionUseCase: RecordAnnualOpeningPositionUseCase,
    @Inject(ListAnnualOpeningPositionsUseCase)
    private readonly listAnnualOpeningPositionsUseCase: ListAnnualOpeningPositionsUseCase,
    @Inject(ConfirmAnnualOpeningPositionUseCase)
    private readonly confirmAnnualOpeningPositionUseCase: ConfirmAnnualOpeningPositionUseCase,
    @Inject(GetAnnualTaxReadinessUseCase)
    private readonly getAnnualTaxReadinessUseCase: GetAnnualTaxReadinessUseCase,
    @Inject(GetAnnualTaxReportingPackageUseCase)
    private readonly getAnnualTaxReportingPackageUseCase: GetAnnualTaxReportingPackageUseCase,
    @Inject(RecordTaxpayerConfirmationUseCase)
    private readonly recordTaxpayerConfirmationUseCase: RecordTaxpayerConfirmationUseCase,
  ) {}

  @Get('monthly/:competence')
  @ApiOperation({
    summary:
      'Get the deterministic Monthly Tax State (fiscal events, per-category facts and data quality) for a civil competence. Foundation only — no tax liability is computed.',
  })
  @ApiParam({ name: 'competence', description: 'Civil competence in canonical YYYY-MM format' })
  @ApiResponse({ status: 200, description: 'Monthly fiscal state (may be EMPTY/PARTIAL/BLOCKED)' })
  @ApiResponse({ status: 400, description: 'Invalid competence' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async getMonthlyTaxState(
    @Param('competence') competence: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getMonthlyTaxStateUseCase.execute({
      userId: principal.userId,
      competence,
    });
    return { data };
  }

  @Get('monthly/:competence/liability')
  @ApiOperation({
    summary:
      'Get the deterministic Monthly Tax Liability and loss compensation for a civil competence. Production tax due is emitted only under an effective VERIFIED rule; otherwise it fails closed.',
  })
  @ApiParam({ name: 'competence', description: 'Civil competence in canonical YYYY-MM format' })
  @ApiResponse({
    status: 200,
    description: 'Monthly tax liability (may be COMPLETE/PARTIAL/BLOCKED/NO_ACTIVITY)',
  })
  @ApiResponse({ status: 400, description: 'Invalid competence' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async getMonthlyTaxLiability(
    @Param('competence') competence: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getMonthlyTaxLiabilityUseCase.execute({
      userId: principal.userId,
      competence,
    });
    return { data };
  }

  @Get('monthly/:competence/elections/equity-exempt-loss')
  @ApiOperation({
    summary:
      'Get the current persisted compensation election for exempt-month normal equity loss recognition. The tax subject is derived from the authenticated principal; no client-supplied subject is accepted.',
  })
  @ApiParam({ name: 'competence', description: 'Civil competence in canonical YYYY-MM format' })
  @ApiResponse({ status: 200, description: 'Election (MISSING/DECLARED/NOT_DECLARED)' })
  @ApiResponse({ status: 400, description: 'Invalid competence' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async getEquityExemptLossElection(
    @Param('competence') competence: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getTaxCompensationElectionUseCase.execute({
      userId: principal.userId,
      competence,
    });
    return { data };
  }

  @Put('monthly/:competence/elections/equity-exempt-loss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Persist a compensation-election revision for exempt-month normal equity loss recognition. Same value is idempotent; a changed value creates a new immutable revision.',
  })
  @ApiParam({ name: 'competence', description: 'Civil competence in canonical YYYY-MM format' })
  @ApiResponse({ status: 200, description: 'Current effective revision (created: true/false)' })
  @ApiResponse({ status: 400, description: 'Invalid competence or election value' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async putEquityExemptLossElection(
    @Param('competence') competence: string,
    @Body(new ZodValidationPipe(PutEquityExemptLossElectionBodySchema))
    body: PutEquityExemptLossElectionBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.putTaxCompensationElectionUseCase.execute({
      userId: principal.userId,
      competence,
      value: body.value,
    });
    return { data: { ...result.election, created: result.created } };
  }

  @Get('monthly/:competence/obligation')
  @ApiOperation({
    summary:
      'Materialize (idempotent) and return the operational TaxObligation for a competence using the official direct deadline registry. Never recalculates tax; fails closed when no official deadline entry exists.',
  })
  @ApiParam({ name: 'competence', description: 'Civil competence in canonical YYYY-MM format' })
  @ApiResponse({
    status: 200,
    description: 'Tax obligation (may be BLOCKED/PROVISIONAL/OPEN/NO_PAYMENT_DUE)',
  })
  @ApiResponse({ status: 400, description: 'Invalid competence' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async getMonthlyTaxObligation(
    @Param('competence') competence: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.materializeTaxObligationUseCase.execute({
      userId: principal.userId,
      competence,
    });
    return { data };
  }

  @Get('monthly/:competence/payment-summary')
  @ApiOperation({
    summary:
      'Minimum-DARF payment eligibility and aggregation for a competence: current amount, carry-forward amount, total payable, minimum threshold, source breakdown and due date. Below-minimum amounts are deferred to the same revenue code (never discarded). No official DARF is generated.',
  })
  @ApiParam({ name: 'competence', description: 'Civil competence in canonical YYYY-MM format' })
  @ApiResponse({ status: 200, description: 'Payment eligibility summary' })
  @ApiResponse({ status: 400, description: 'Invalid competence' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async getTaxPaymentSummary(
    @Param('competence') competence: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getTaxPaymentSummaryUseCase.forCompetence({
      userId: principal.userId,
      competence,
    });
    return { data };
  }

  @Get('obligations')
  @ApiOperation({
    summary: 'List persisted tax obligations for the authenticated tax subject.',
  })
  @ApiResponse({ status: 200, description: 'Tax obligations' })
  async listTaxObligations(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query(new ZodValidationPipe(ListTaxObligationsQuerySchema)) query: ListTaxObligationsQuery,
  ) {
    return {
      data: await this.listTaxObligationsUseCase.execute({ userId: principal.userId, ...query }),
    };
  }

  @Get('obligations/:id')
  @ApiOperation({ summary: 'Get a persisted tax obligation and its manual payment evidence.' })
  @ApiResponse({ status: 200, description: 'Tax obligation' })
  @ApiResponse({ status: 404, description: 'Tax obligation not found' })
  async getTaxObligation(
    @Param('id') id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return { data: await this.getTaxObligationUseCase.execute({ userId: principal.userId, id }) };
  }

  @Get('obligations/:id/adjustment')
  @ApiOperation({
    summary:
      'Preview the overdue late fee and interest (updated payable amount) for an obligation at an explicit payment date. Non-mutating; fails closed without official authority/rates.',
  })
  @ApiResponse({ status: 200, description: 'Overdue adjustment preview' })
  @ApiResponse({ status: 400, description: 'Invalid paymentDate' })
  @ApiResponse({ status: 404, description: 'Tax obligation not found' })
  async getTaxPaymentAdjustment(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(AdjustmentQuerySchema)) query: AdjustmentQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return {
      data: await this.getTaxPaymentAdjustmentUseCase.execute({
        userId: principal.userId,
        obligationId: id,
        paymentDate: query.paymentDate,
      }),
    };
  }

  @Get('obligations/:id/payment-eligibility')
  @ApiOperation({
    summary:
      'Minimum-DARF payment eligibility for a single obligation: current amount, carry-forward amount, total payable, minimum threshold and due date. Below-minimum amounts are deferred to the same revenue code.',
  })
  @ApiResponse({ status: 200, description: 'Payment eligibility' })
  @ApiResponse({ status: 404, description: 'Tax obligation not found' })
  async getTaxPaymentEligibility(
    @Param('id') id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return {
      data: await this.getTaxPaymentSummaryUseCase.forObligation({
        userId: principal.userId,
        obligationId: id,
      }),
    };
  }

  @Post('payment-aggregations/:id/payments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Settle an aggregated payable amount (current + carry-forward) with exact MANUAL_CONFIRMED evidence. Consumes the source carry-forward entries exactly once. Never generates an official DARF or auto-pays.',
  })
  @ApiResponse({ status: 200, description: 'Settled (SETTLED/ALREADY_SETTLED)' })
  @ApiResponse({ status: 400, description: 'Invalid payment or not payable' })
  @ApiResponse({ status: 404, description: 'Aggregation not found' })
  @ApiResponse({ status: 409, description: 'Conflicting payment or carry-forward consumption' })
  async settleTaxPaymentAggregation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SettleTaxPaymentAggregationBodySchema))
    body: SettleTaxPaymentAggregationBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.settleTaxPaymentAggregationUseCase.execute({
      userId: principal.userId,
      aggregationId: id,
      paidAt: body.paidAt,
      amount: body.amount,
      currency: body.currency,
      sourceType: body.sourceType,
      sourceReference: body.sourceReference ?? null,
    });
    return { data };
  }

  @Post('obligations/:id/payments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record MANUAL_CONFIRMED payment evidence for a tax obligation. Exact decimal; full payment only. Never generates an official DARF or auto-pays.',
  })
  @ApiResponse({
    status: 200,
    description: 'Recorded (CREATED/DUPLICATE) and obligation marked PAID',
  })
  @ApiResponse({ status: 400, description: 'Invalid payment evidence or obligation not payable' })
  @ApiResponse({ status: 404, description: 'Tax obligation not found' })
  @ApiResponse({ status: 409, description: 'Conflicting payment evidence for the same source' })
  async recordTaxPayment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RecordTaxPaymentBodySchema)) body: RecordTaxPaymentBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.recordTaxPaymentUseCase.execute({
      userId: principal.userId,
      obligationId: id,
      paidAt: body.paidAt,
      amount: body.amount,
      currency: body.currency,
      sourceType: body.sourceType,
      sourceReference: body.sourceReference ?? null,
    });
    return { data };
  }

  // --- Canonical tax inputs (Phase 4B.3) ---
  // Specific routes are declared before `inputs/:competence` so they are not
  // captured by the competence param route.

  @Post('inputs/trade-classifications')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record a canonical trade classification (manual or imported). Idempotent; conflicts are explicit.',
  })
  @ApiResponse({ status: 200, description: 'Recorded (CREATED/DUPLICATE)' })
  @ApiResponse({ status: 409, description: 'Conflict with an existing canonical input' })
  async recordTradeClassification(
    @Body(new ZodValidationPipe(RecordTradeClassificationBodySchema))
    body: RecordTradeClassificationBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.recordTradeClassificationUseCase.execute({
      userId: principal.userId,
      ...body,
    });
    if (result.outcome === 'CONFLICT') conflict();
    return {
      data: { outcome: result.outcome, id: result.record.id, status: result.record.status },
    };
  }

  @Get('inputs/trade-classifications')
  @ApiOperation({ summary: 'List persisted canonical trade classifications for the tax subject.' })
  async listTradeClassifications(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.listTaxInputsUseCase.listTradeClassifications(principal.userId) };
  }

  @Post('inputs/withholdings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record a canonical withholding/IRRF input. Exact decimal; never estimated.',
  })
  @ApiResponse({ status: 200, description: 'Recorded (CREATED/DUPLICATE)' })
  @ApiResponse({ status: 409, description: 'Conflict with an existing canonical input' })
  async recordWithholding(
    @Body(new ZodValidationPipe(RecordWithholdingBodySchema)) body: RecordWithholdingBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.recordWithholdingInputUseCase.execute({
      userId: principal.userId,
      ...body,
      amount: body.amount ?? null,
    });
    if (result.outcome === 'CONFLICT') conflict();
    return {
      data: { outcome: result.outcome, id: result.record.id, status: result.record.status },
    };
  }

  @Get('inputs/withholdings')
  @ApiOperation({
    summary: 'List persisted canonical withholding/IRRF inputs for the tax subject.',
  })
  async listWithholdings(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('competence') competence?: string,
  ) {
    return { data: await this.listTaxInputsUseCase.listWithholdings(principal.userId, competence) };
  }

  @Post('inputs/fii-metadata')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record factual FII tax-condition metadata (not tax treatment).' })
  @ApiResponse({ status: 200, description: 'Recorded (CREATED/DUPLICATE)' })
  @ApiResponse({ status: 409, description: 'Conflict with an existing canonical input' })
  async recordFiiMetadata(
    @Body(new ZodValidationPipe(RecordFiiMetadataBodySchema)) body: RecordFiiMetadataBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.recordFiiTaxEligibilityFactsUseCase.execute({
      userId: principal.userId,
      ...body,
      holderCount: body.holderCount ?? null,
      investorOwnershipPercent: body.investorOwnershipPercent ?? null,
      isExchangeTraded: body.isExchangeTraded ?? null,
    });
    if (result.outcome === 'CONFLICT') conflict();
    return {
      data: { outcome: result.outcome, id: result.record.id, status: result.record.status },
    };
  }

  @Get('inputs/fii-metadata')
  @ApiOperation({
    summary: 'List persisted factual FII tax-condition metadata for an asset at an as-of date.',
  })
  @ApiResponse({ status: 400, description: 'Missing/invalid assetId or asOf' })
  async listFiiMetadata(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('assetId') assetId: string,
    @Query('asOf') asOf: string,
  ) {
    return {
      data: await this.listTaxInputsUseCase.listFiiEligibility(principal.userId, assetId, asOf),
    };
  }

  @Post('inputs/:entity/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Resolve a tax-input conflict explicitly (KEEP_EXISTING or ACCEPT_NEW); original records are retained.',
  })
  @ApiResponse({ status: 200, description: 'Resolved' })
  @ApiResponse({ status: 404, description: 'Tax input not found' })
  async resolveTaxInputConflict(
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ResolveTaxInputConflictBodySchema))
    body: ResolveTaxInputConflictBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.resolveTaxInputConflictUseCase.execute({
      userId: principal.userId,
      entity: entity as TaxInputEntity,
      id,
      action: body.action,
      resolutionSource: body.resolutionSource ?? 'USER_RESOLUTION',
    });
    return { data };
  }

  @Get('inputs/:competence')
  @ApiOperation({
    summary:
      'Get canonical tax-input readiness for a competence (trade classification, withholding/IRRF, FII condition metadata). Read-only; no tax is calculated.',
  })
  @ApiParam({ name: 'competence', description: 'Civil competence in canonical YYYY-MM format' })
  @ApiResponse({ status: 200, description: 'Tax input readiness (may be MISSING/PARTIAL/UNKNOWN)' })
  @ApiResponse({ status: 400, description: 'Invalid competence' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async getTaxInputReadiness(
    @Param('competence') competence: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getTaxInputReadinessUseCase.execute({
      userId: principal.userId,
      competence,
    });
    return { data };
  }

  // --- Phase 4F: official DARF readiness, handoff & taxpayer identity ---

  @Get('obligations/:id/darf-readiness')
  @ApiOperation({
    summary:
      'Official DARF readiness for an obligation: prepared values (revenue code, PA, due date, principal, multa/juros, total) and the official Sicalc handoff. Atlas never generates the document.',
  })
  @ApiResponse({ status: 200, description: 'DARF readiness (may be USER_ACTION_REQUIRED/BLOCKED)' })
  @ApiResponse({ status: 404, description: 'Tax obligation not found' })
  async getDarfReadiness(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(DarfReadinessQuerySchema)) query: DarfReadinessQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return {
      data: await this.getDarfReadinessUseCase.execute({
        userId: principal.userId,
        obligationId: id,
        paymentDate: query.paymentDate ?? null,
      }),
    };
  }

  @Post('obligations/:id/darf-handoff')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Materialize the official DARF interactive-handoff record (idempotent). Prepares exact values for the official Sicalc service; never generates a document, barcode, PIX or QR.',
  })
  @ApiResponse({ status: 200, description: 'Handoff record (USER_ACTION_REQUIRED or BLOCKED)' })
  @ApiResponse({ status: 404, description: 'Tax obligation not found' })
  async createDarfHandoff(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DarfHandoffBodySchema)) body: DarfHandoffBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return {
      data: await this.createDarfHandoffUseCase.execute({
        userId: principal.userId,
        obligationId: id,
        paymentDate: body.paymentDate ?? null,
      }),
    };
  }

  @Get('darfs')
  @ApiOperation({ summary: 'List persisted DARF generation/handoff records.' })
  async listDarfGenerations(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query(new ZodValidationPipe(ListDarfGenerationsQuerySchema))
    query: ListDarfGenerationsQuery,
  ) {
    return {
      data: await this.listDarfGenerationsUseCase.execute({
        userId: principal.userId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.obligationId ? { obligationId: query.obligationId } : {}),
      }),
    };
  }

  @Get('darfs/:id')
  @ApiOperation({ summary: 'Get a persisted DARF generation/handoff record.' })
  @ApiResponse({ status: 404, description: 'DARF generation record not found' })
  async getDarfGeneration(
    @Param('id') id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return { data: await this.getDarfGenerationUseCase.execute({ userId: principal.userId, id }) };
  }

  @Get('taxpayer-identity')
  @ApiOperation({
    summary: 'Get the taxpayer identity boundary (masked identifier only; never the raw CPF/CNPJ).',
  })
  async getTaxpayerIdentity(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.getTaxpayerIdentityUseCase.execute({ userId: principal.userId }) };
  }

  @Put('taxpayer-identity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record the taxpayer identity (validated and immediately masked; the raw CPF/CNPJ is never persisted or logged).',
  })
  @ApiResponse({ status: 200, description: 'Identity recorded (masked)' })
  @ApiResponse({ status: 400, description: 'Invalid identifier' })
  async recordTaxpayerIdentity(
    @Body(new ZodValidationPipe(RecordTaxpayerIdentityBodySchema))
    body: RecordTaxpayerIdentityBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return {
      data: await this.recordTaxpayerIdentityUseCase.execute({
        userId: principal.userId,
        identityType: body.identityType,
        identifier: body.identifier,
      }),
    };
  }

  // --- Phase 4H.2: Annual IRPF Period & Year-End Position Foundation ---

  @Get('annual/:calendarYear/positions')
  @ApiOperation({
    summary:
      'Get authoritative annual positions at December 31st of the calendar year with historical acquisition cost (never market valuation). Fails closed on incomplete cost basis or overlaps.',
  })
  @ApiParam({ name: 'calendarYear', description: 'Economic calendar year (e.g. 2025)' })
  @ApiResponse({ status: 200, description: 'Annual position report' })
  @ApiResponse({ status: 400, description: 'Invalid calendar year or input' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getAnnualPositions(
    @Param('calendarYear') calendarYear: string,
    @Query(new ZodValidationPipe(AnnualPositionsQuerySchema)) query: AnnualPositionsQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const year = parseInt(calendarYear, 10);
    const data = await this.getAnnualPositionReportUseCase.execute({
      taxSubjectId: principal.userId,
      portfolioId: query.portfolioId,
      calendarYear: year,
    });
    return { data };
  }

  @Get('annual/opening-positions')
  @ApiOperation({
    summary: 'List canonical pre-Atlas opening position inputs for the authenticated investor.',
  })
  @ApiResponse({ status: 200, description: 'List of opening positions' })
  async listAnnualOpeningPositions(
    @Query(new ZodValidationPipe(ListAnnualOpeningPositionsQuerySchema))
    query: ListAnnualOpeningPositionsQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.listAnnualOpeningPositionsUseCase.execute({
      taxSubjectId: principal.userId,
      portfolioId: query.portfolioId,
      status: query.status,
    });
    return { data };
  }

  @Post('annual/opening-positions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Record or supersede a canonical opening position input for pre-Atlas holdings (with revision tracking and idempotency).',
  })
  @ApiResponse({ status: 201, description: 'Opening position recorded' })
  @ApiResponse({ status: 400, description: 'Invalid opening position input' })
  @ApiResponse({ status: 404, description: 'Portfolio, account or asset not found' })
  async recordAnnualOpeningPosition(
    @Body(new ZodValidationPipe(RecordAnnualOpeningPositionBodySchema))
    body: RecordAnnualOpeningPositionBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.recordAnnualOpeningPositionUseCase.execute({
      taxSubjectId: principal.userId,
      portfolioId: body.portfolioId,
      accountId: body.accountId,
      assetId: body.assetId,
      effectiveDate: body.effectiveDate,
      quantity: body.quantity,
      totalHistoricalCost: body.totalHistoricalCost,
      currency: body.currency,
      source: body.source,
      status: body.status,
      notes: body.notes,
    });
    return { data: result.position, meta: { outcome: result.outcome } };
  }

  @Post('annual/opening-positions/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Explicitly confirm a draft opening position input.',
  })
  @ApiResponse({ status: 200, description: 'Opening position confirmed' })
  @ApiResponse({ status: 404, description: 'Opening position not found' })
  async confirmAnnualOpeningPosition(
    @Param('id') id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.confirmAnnualOpeningPositionUseCase.execute({
      id,
      taxSubjectId: principal.userId,
    });
    return { data };
  }

  @Get('annual/:calendarYear/capital-market')
  @ApiOperation({
    summary:
      'Get authoritative annual fiscal summary for capital-market operations (normal equities, day trade, FII, loss carry continuity, 6015 obligations).',
  })
  @ApiParam({ name: 'calendarYear', description: 'Economic calendar year (e.g. 2025)' })
  @ApiResponse({ status: 200, description: 'Annual capital market fiscal summary' })
  @ApiResponse({ status: 400, description: 'Invalid calendar year or input' })
  async getAnnualCapitalMarketSummary(
    @Param(new ZodValidationPipe(AnnualCapitalMarketParamSchema)) params: AnnualCapitalMarketParam,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getAnnualCapitalMarketSummaryUseCase.execute({
      taxSubjectId: principal.userId,
      calendarYear: params.calendarYear,
    });
    return { data };
  }

  @Get('annual/:calendarYear/income')
  @ApiOperation({
    summary:
      'Get authoritative annual summary for investment income (dividends, JCP with 15% exclusive withholding, FII distributions).',
  })
  @ApiParam({ name: 'calendarYear', description: 'Economic calendar year (e.g. 2025)' })
  @ApiResponse({ status: 200, description: 'Annual investment income summary' })
  @ApiResponse({ status: 400, description: 'Invalid calendar year or input' })
  async getAnnualInvestmentIncomeSummary(
    @Param(new ZodValidationPipe(AnnualInvestmentIncomeParamSchema))
    params: AnnualInvestmentIncomeParam,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getAnnualInvestmentIncomeSummaryUseCase.execute({
      taxSubjectId: principal.userId,
      calendarYear: params.calendarYear,
    });
    return { data };
  }

  @Get('annual/:calendarYear/readiness')
  @ApiOperation({
    summary:
      'Get authoritative annual tax readiness and evidence completeness assessment for DIRPF.',
  })
  @ApiParam({ name: 'calendarYear', description: 'Economic calendar year (e.g. 2025)' })
  @ApiResponse({ status: 200, description: 'Annual tax readiness assessment' })
  @ApiResponse({ status: 400, description: 'Invalid calendar year or input' })
  async getAnnualTaxReadiness(
    @Param(new ZodValidationPipe(AnnualTaxReadinessParamSchema))
    params: AnnualTaxReadinessParam,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getAnnualTaxReadinessUseCase.execute({
      taxSubjectId: principal.userId,
      calendarYear: params.calendarYear,
    });
    return { data };
  }

  @Post('annual/:calendarYear/confirmations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record or supersede a formal taxpayer confirmation for annual tax readiness evidence.',
  })
  @ApiParam({ name: 'calendarYear', description: 'Economic calendar year (e.g. 2025)' })
  @ApiResponse({ status: 200, description: 'Taxpayer confirmation recorded' })
  @ApiResponse({ status: 400, description: 'Invalid confirmation input' })
  async recordTaxpayerConfirmation(
    @Param(new ZodValidationPipe(AnnualTaxReadinessParamSchema))
    params: AnnualTaxReadinessParam,
    @Body(new ZodValidationPipe(RecordTaxpayerConfirmationBodySchema))
    body: RecordTaxpayerConfirmationBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.recordTaxpayerConfirmationUseCase.execute({
      taxSubjectId: principal.userId,
      calendarYear: params.calendarYear,
      confirmationType: body.confirmationType,
      subjectReference: body.subjectReference,
      decision: body.decision,
      statementVersion: body.statementVersion,
      sourceFingerprint: body.sourceFingerprint,
      source: body.source,
      createdByPrincipal: principal.userId,
      notes: body.notes,
    });
    return { data: result.confirmation, meta: { outcome: result.outcome } };
  }

  @Get('annual/:calendarYear/reporting')
  @ApiOperation({
    summary:
      'Get the authoritative Annual Tax Reporting & Declaration Preparation Package for a calendar year.',
  })
  @ApiParam({ name: 'calendarYear', description: 'Economic calendar year (e.g. 2025)' })
  @ApiResponse({
    status: 200,
    description: 'Authoritative annual tax reporting support package',
  })
  @ApiResponse({ status: 400, description: 'Invalid calendar year or input' })
  async getAnnualTaxReportingPackage(
    @Param(new ZodValidationPipe(AnnualTaxReportingParamSchema))
    params: AnnualTaxReportingParam,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getAnnualTaxReportingPackageUseCase.execute({
      taxSubjectId: principal.userId,
      calendarYear: params.calendarYear,
    });
    return { data };
  }
}

