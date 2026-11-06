import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
  ApiProperty,
} from '@nestjs/swagger';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';
import { UUIDParamPipe } from '../../common/pipes';
import { MarketService } from './market.service';
import { MarketDataConfigService } from '../../market-data/market-data-config.service';

export class ConfigureMarketDataTokenDto {
  @ApiProperty({ description: 'Chave de API do provedor de mercado (BRAPI)', example: 'abc123xyz' })
  token!: string;
}

@ApiTags('Market')
@ApiBearerAuth()
@Controller('api/v1/market')
export class MarketController {
  constructor(
    @Inject(MarketService)
    private readonly marketService: MarketService,
    @Inject(MarketDataConfigService)
    private readonly configService: MarketDataConfigService,
  ) {}

  @Get('provider-status')
  @ApiOperation({ summary: 'Get market data provider status and authentication health' })
  @ApiResponse({ status: 200, description: 'Provider status' })
  async getProviderStatus() {
    const data = this.configService.getStatus();
    return { data };
  }

  @Post('configure-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Securely configure market data provider API token in local secret store' })
  @ApiBody({ type: ConfigureMarketDataTokenDto })
  @ApiResponse({ status: 200, description: 'Provider status after token configuration' })
  async configureToken(@Body() body: ConfigureMarketDataTokenDto) {
    const data = this.configService.configureToken(body?.token);
    return { data };
  }

  @Delete('configure-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove market data provider API token from local secret store' })
  @ApiResponse({ status: 200, description: 'Provider status after token removal' })
  async clearToken() {
    const data = this.configService.clearToken();
    return { data };
  }

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

