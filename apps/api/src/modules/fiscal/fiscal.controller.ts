import {
  Controller,
  Get,
  Post,
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
import { ZodValidationPipe } from '../../common/pipes';
import {
  AdjustmentQuery,
  AdjustmentQuerySchema,
  ListTaxObligationsQuery,
  ListTaxObligationsQuerySchema,
  RecordTaxPaymentBody,
  RecordTaxPaymentBodySchema,
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
}
