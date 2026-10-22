import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
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
import {
  ConfirmPortfolioImportUseCase,
  PreviewPortfolioImportUseCase,
  IntegrationRunService,
} from '../../application/imports';
import {
  ConfirmPortfolioImportBody,
  ConfirmPortfolioImportBodySchema,
  ConfirmPortfolioImportSwaggerDto,
  IntegrationRunListQuery,
  IntegrationRunListQuerySchema,
  PreviewPortfolioImportBody,
  PreviewPortfolioImportBodySchema,
  PreviewPortfolioImportSwaggerDto,
} from './dto/portfolio-import.dto';
import { mapIntegrationRunToResponse } from './integration-run.mapper';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

@ApiTags('PortfolioImports')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/imports')
export class PortfolioImportsController {
  constructor(
    @Inject(PreviewPortfolioImportUseCase)
    private readonly previewUseCase: PreviewPortfolioImportUseCase,
    @Inject(ConfirmPortfolioImportUseCase)
    private readonly confirmUseCase: ConfirmPortfolioImportUseCase,
    @Inject(IntegrationRunService)
    private readonly runService: IntegrationRunService,
  ) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview a CSV import without writing to the ledger',
    description:
      'Parses, normalizes and reconciles a GENERIC_CSV payload against the portfolio ledger. No canonical transaction is written.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiBody({ type: PreviewPortfolioImportSwaggerDto })
  @ApiResponse({ status: 200, description: 'Import preview with per-row status and summary' })
  @ApiResponse({ status: 400, description: 'Invalid file, missing columns or unsupported source' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async preview(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(PreviewPortfolioImportBodySchema)) body: PreviewPortfolioImportBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const preview = await this.previewUseCase.execute({
      portfolioId,
      userId: principal.userId,
      sourceType: body.sourceType,
      provider: body.provider,
      fileName: body.fileName,
      content: body.content,
      defaultAccountId: body.defaultAccountId,
    });
    return { data: preview };
  }

  @Post('confirm')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Confirm a CSV import through the canonical ledger path',
    description:
      'Re-validates the payload, applies row decisions and appends READY rows via the canonical transaction service. Idempotent on retry.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiBody({ type: ConfirmPortfolioImportSwaggerDto })
  @ApiResponse({ status: 201, description: 'Import receipt with created transaction IDs' })
  @ApiResponse({ status: 400, description: 'Invalid file or no importable rows' })
  @ApiResponse({ status: 404, description: 'Portfolio, account or asset not found' })
  @ApiResponse({ status: 409, description: 'Cross-portfolio violation or duplicate external ID' })
  async confirm(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(ConfirmPortfolioImportBodySchema)) body: ConfirmPortfolioImportBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const receipt = await this.confirmUseCase.execute({
      portfolioId,
      userId: principal.userId,
      sourceType: body.sourceType,
      provider: body.provider,
      fileName: body.fileName,
      content: body.content,
      defaultAccountId: body.defaultAccountId,
      decisions: body.decisions,
      runId: body.runId,
    });
    return { data: receipt };
  }

  @Get('runs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List import/sync run history for a portfolio',
    description:
      'Operational history of CSV imports and source syncs: counts, duplicates, confirmations and reconciliation summaries. Ledger data itself stays in the Transaction ledger.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (1-200)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor (run id)' })
  @ApiResponse({ status: 200, description: 'Cursor-paginated run history' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async listRuns(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query(new ZodValidationPipe(IntegrationRunListQuerySchema)) query: IntegrationRunListQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const { rows, hasMore } = await this.runService.listRuns(portfolioId, principal.userId, {
      limit: query.limit,
      cursor: query.cursor ?? null,
    });
    const data = rows.map(mapIntegrationRunToResponse);
    return {
      data,
      meta: {
        limit: query.limit,
        cursor: query.cursor ?? null,
        nextCursor: hasMore && data.length > 0 ? (data[data.length - 1]?.id ?? null) : null,
        hasMore,
      },
    };
  }

  @Get('runs/:runId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a single import/sync run with its operational summary',
    description:
      'Run detail: source, status, candidate counts, confirmation outcome and reconciliation summary.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiParam({ name: 'runId', description: 'UUID of the integration run' })
  @ApiResponse({ status: 200, description: 'Run detail' })
  @ApiResponse({ status: 404, description: 'Portfolio or run not found' })
  async getRun(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('runId', UUIDParamPipe) runId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const run = await this.runService.getRun(portfolioId, runId, principal.userId);
    return { data: mapIntegrationRunToResponse(run) };
  }
}
