import { Body, Controller, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ConfirmPortfolioImportUseCase,
  PreviewPortfolioImportUseCase,
} from '../../application/imports';
import {
  ConfirmPortfolioImportBody,
  ConfirmPortfolioImportBodySchema,
  ConfirmPortfolioImportSwaggerDto,
  PreviewPortfolioImportBody,
  PreviewPortfolioImportBodySchema,
  PreviewPortfolioImportSwaggerDto,
} from './dto/portfolio-import.dto';
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
    });
    return { data: receipt };
  }
}
