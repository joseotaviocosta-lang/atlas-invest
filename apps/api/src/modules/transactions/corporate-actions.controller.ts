import { Controller, Post, Body, Param, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { serializeTransaction } from '@atlas/domain';
import { CorporateActionsUseCase } from '../../application/transactions';
import {
  PreviewCorporateActionsBody,
  PreviewCorporateActionsBodySchema,
  ConfirmCorporateActionsBody,
  ConfirmCorporateActionsBodySchema,
  PreviewCorporateActionsSwaggerDto,
  ConfirmCorporateActionsSwaggerDto,
} from './dto/corporate-action.dto';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/corporate-actions')
export class PortfolioCorporateActionsController {
  constructor(
    @Inject(CorporateActionsUseCase)
    private readonly corporateActionsUseCase: CorporateActionsUseCase,
  ) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview staged corporate-action events without persisting',
    description:
      'Projects SPLIT / REVERSE_SPLIT legs sequentially from live ledger state. Nothing is written; the response carries a ledger fingerprint for stale protection at confirm time.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiBody({ type: PreviewCorporateActionsSwaggerDto })
  @ApiResponse({ status: 200, description: 'Sequential projection returned' })
  @ApiResponse({ status: 400, description: 'Validation failed or domain rule violated' })
  @ApiResponse({ status: 404, description: 'Portfolio, account, or asset not found' })
  async preview(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(PreviewCorporateActionsBodySchema))
    body: PreviewCorporateActionsBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.corporateActionsUseCase.preview({
      portfolioId,
      accountId: body.accountId,
      userId: principal.userId,
      currency: body.currency,
      legs: body.legs.map((leg) => ({
        assetId: leg.assetId,
        type: leg.type,
        tradeDate: leg.tradeDate,
        factor: leg.factor,
        notes: leg.notes,
        ...(leg.externalId ? { externalId: leg.externalId } : {}),
      })),
    });
    return { data: result };
  }

  @Post('confirm')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Confirm staged corporate-action events atomically',
    description:
      'Re-validates every leg, rejects stale previews and duplicates, then persists ALL legs in one database transaction. Either every leg lands or none does.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiBody({ type: ConfirmCorporateActionsSwaggerDto })
  @ApiResponse({ status: 201, description: 'Corporate-action events appended' })
  @ApiResponse({ status: 400, description: 'Validation failed or domain rule violated' })
  @ApiResponse({ status: 404, description: 'Portfolio, account, or asset not found' })
  @ApiResponse({
    status: 409,
    description: 'Stale preview, duplicate event, or cross-portfolio violation',
  })
  async confirm(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(ConfirmCorporateActionsBodySchema))
    body: ConfirmCorporateActionsBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const created = await this.corporateActionsUseCase.confirm({
      portfolioId,
      accountId: body.accountId,
      userId: principal.userId,
      currency: body.currency,
      expectedLedgerFingerprint: body.expectedLedgerFingerprint,
      legs: body.legs.map((leg) => ({
        assetId: leg.assetId,
        type: leg.type,
        tradeDate: leg.tradeDate,
        factor: leg.factor,
        notes: leg.notes,
        ...(leg.externalId ? { externalId: leg.externalId } : {}),
      })),
    });
    return { data: created.map((tx) => serializeTransaction(tx)) };
  }
}
