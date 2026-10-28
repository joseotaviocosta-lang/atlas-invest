import { Controller, Get, Param, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';
import { UUIDParamPipe } from '../../common/pipes';
import { MarketService } from './market.service';

@ApiTags('Market')
@ApiBearerAuth()
@Controller('api/v1/market')
export class MarketController {
  constructor(
    @Inject(MarketService)
    private readonly marketService: MarketService,
  ) {}

  @Get('assets/:assetId')
  @ApiOperation({ summary: 'Get market detail for an asset' })
  @ApiParam({ name: 'assetId', description: 'UUID of the asset' })
  @ApiResponse({ status: 200, description: 'Market asset detail' })
  @ApiResponse({ status: 404, description: 'Asset not found' })
  async getAssetDetail(
    @Param('assetId', UUIDParamPipe) assetId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.marketService.getAssetDetail(assetId, principal.userId);
    return { data };
  }
}
