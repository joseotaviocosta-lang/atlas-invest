import { Controller, Get, HttpCode, HttpStatus, Inject, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IntegrationSettingsService } from '../../application/imports/integration-settings.service';
import { mapIntegrationSettingsToResponse } from './integration-settings.mapper';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

@ApiTags('IntegrationSettings')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/integrations')
export class IntegrationSettingsController {
  constructor(
    @Inject(IntegrationSettingsService)
    private readonly settingsService: IntegrationSettingsService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get integration settings for a portfolio',
    description:
      'Aggregated, read-only settings read model per source: product availability, connection state, schedule intent, latest execution outcome, pending review count and the derived user-facing status. create/update stay on the schedules endpoints.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Integration settings by source' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getSettings(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const model = await this.settingsService.getSettings(principal.userId, portfolioId);
    return { data: mapIntegrationSettingsToResponse(model) };
  }
}
