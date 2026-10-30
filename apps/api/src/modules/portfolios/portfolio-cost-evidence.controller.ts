import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CostEvidenceUseCase, CostEvidenceAssessmentUseCase } from '../../application/cost-evidence';
import {
  CostEvidenceCreateSchema,
  CostEvidenceReviseSchema,
  CostEvidenceRejectSchema,
  CostEvidenceListQuerySchema,
  CostAssessmentQuerySchema,
  CostEvidenceSwaggerDto,
  type CostEvidenceCreateBody,
  type CostEvidenceReviseBody,
  type CostEvidenceRejectBody,
} from './dto/cost-evidence.dto';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';
import type { CostEvidenceStatus } from '@atlas/domain';

const VALID_STATUSES: CostEvidenceStatus[] = ['DRAFT', 'REVIEW_REQUIRED', 'VERIFIED', 'REJECTED'];

function parseStatuses(raw: string | undefined): CostEvidenceStatus[] | undefined {
  if (!raw) return undefined;
  const parsed = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is CostEvidenceStatus => (VALID_STATUSES as string[]).includes(s));
  return parsed.length > 0 ? parsed : undefined;
}

@ApiTags('Portfolios')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/cost-evidence')
export class PortfolioCostEvidenceController {
  constructor(
    @Inject(CostEvidenceUseCase)
    private readonly costEvidenceUseCase: CostEvidenceUseCase,
    @Inject(CostEvidenceAssessmentUseCase)
    private readonly assessmentUseCase: CostEvidenceAssessmentUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create cost-basis evidence (DRAFT or REVIEW_REQUIRED, never VERIFIED)',
    description:
      'Appends an audited cost-evidence record. The record is not a ledger event: quantity is never created, moved, or rewritten. Verification happens through a separate transition.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiBody({ type: CostEvidenceSwaggerDto })
  @ApiResponse({ status: 201, description: 'Evidence created (or idempotent duplicate)' })
  @ApiResponse({ status: 400, description: 'Validation failed or domain rule violated' })
  @ApiResponse({ status: 404, description: 'Portfolio, account, or asset not found' })
  async create(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(CostEvidenceCreateSchema)) body: CostEvidenceCreateBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const { outcome, record } = await this.costEvidenceUseCase.create(
      portfolioId,
      principal.userId,
      body,
    );
    return { data: record, meta: { created: outcome === 'CREATED' } };
  }

  @Get()
  @ApiOperation({ summary: 'List cost-basis evidence (current and historical revisions)' })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiResponse({ status: 200, description: 'Evidence rows, newest first' })
  @ApiResponse({ status: 404, description: 'Portfolio not found or unauthorized' })
  async list(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query(new ZodValidationPipe(CostEvidenceListQuerySchema))
    query: { accountId?: string; assetId?: string; statuses?: string },
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.costEvidenceUseCase.list(portfolioId, principal.userId, {
      accountId: query.accountId,
      assetId: query.assetId,
      statuses: parseStatuses(query.statuses),
    });
    return { data };
  }

  @Get('assessment')
  @ApiOperation({
    summary: 'Read-side cost-coverage assessment (ledger lots + VERIFIED evidence)',
    description:
      'Pure derived view. Never writes, never touches the ledger, never feeds tax calculations.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiResponse({ status: 200, description: 'Coverage assessment with exact decimal strings' })
  @ApiResponse({ status: 404, description: 'Portfolio or position not found' })
  async assess(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query(new ZodValidationPipe(CostAssessmentQuerySchema))
    query: { accountId: string; assetId: string },
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.assessmentUseCase.assess(
      portfolioId,
      principal.userId,
      query.accountId,
      query.assetId,
    );
    return { data };
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview a hypothetical evidence record against live coverage',
    description:
      'Ephemeral projection as if the draft were VERIFIED. Nothing is persisted.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiBody({ type: CostEvidenceSwaggerDto })
  @ApiResponse({ status: 200, description: 'Projected coverage returned' })
  @ApiResponse({ status: 400, description: 'Validation failed or domain rule violated' })
  @ApiResponse({ status: 404, description: 'Portfolio or position not found' })
  async preview(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(CostEvidenceCreateSchema)) body: CostEvidenceCreateBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.assessmentUseCase.preview(portfolioId, principal.userId, body);
    return { data };
  }

  @Post(':evidenceId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit DRAFT evidence for review (DRAFT → REVIEW_REQUIRED)' })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiParam({ name: 'evidenceId', description: 'UUID of the evidence record' })
  @ApiResponse({ status: 200, description: 'New REVIEW_REQUIRED revision returned' })
  @ApiResponse({ status: 404, description: 'Evidence not found' })
  @ApiResponse({ status: 409, description: 'Invalid transition or superseded revision' })
  async submit(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('evidenceId', UUIDParamPipe) evidenceId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.costEvidenceUseCase.submit(portfolioId, principal.userId, evidenceId);
    return { data };
  }

  @Post(':evidenceId/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify evidence (REVIEW_REQUIRED → VERIFIED)',
    description:
      'Owner confirmation. Refused with 409 when verification would over-cover the live position.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiParam({ name: 'evidenceId', description: 'UUID of the evidence record' })
  @ApiResponse({ status: 200, description: 'New VERIFIED revision returned' })
  @ApiResponse({ status: 404, description: 'Evidence not found' })
  @ApiResponse({ status: 409, description: 'Invalid transition, over-coverage, or superseded' })
  async verify(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('evidenceId', UUIDParamPipe) evidenceId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.costEvidenceUseCase.verify(portfolioId, principal.userId, evidenceId);
    return { data };
  }

  @Post(':evidenceId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject evidence with a mandatory reason' })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiParam({ name: 'evidenceId', description: 'UUID of the evidence record' })
  @ApiResponse({ status: 200, description: 'New REJECTED revision returned' })
  @ApiResponse({ status: 404, description: 'Evidence not found' })
  @ApiResponse({ status: 409, description: 'Invalid transition or superseded revision' })
  async reject(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('evidenceId', UUIDParamPipe) evidenceId: string,
    @Body(new ZodValidationPipe(CostEvidenceRejectSchema)) body: CostEvidenceRejectBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.costEvidenceUseCase.reject(
      portfolioId,
      principal.userId,
      evidenceId,
      body.reason,
    );
    return { data };
  }

  @Post(':evidenceId/revise')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revise evidence content (new REVIEW_REQUIRED revision, audit preserved)',
    description:
      'Content edits never carry VERIFIED status forward. The previous row is preserved via supersedesId.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiParam({ name: 'evidenceId', description: 'UUID of the evidence record' })
  @ApiResponse({ status: 200, description: 'New revision returned' })
  @ApiResponse({ status: 404, description: 'Evidence not found' })
  @ApiResponse({ status: 409, description: 'Superseded revision' })
  async revise(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('evidenceId', UUIDParamPipe) evidenceId: string,
    @Body(new ZodValidationPipe(CostEvidenceReviseSchema)) body: CostEvidenceReviseBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const { outcome, record } = await this.costEvidenceUseCase.revise(
      portfolioId,
      principal.userId,
      evidenceId,
      body,
    );
    return { data: record, meta: { created: outcome === 'CREATED' } };
  }
}
