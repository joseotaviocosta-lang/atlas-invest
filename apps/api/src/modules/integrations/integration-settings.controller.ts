import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IntegrationConnectionService } from '../../application/imports/integration-connection.service';
import { IntegrationSettingsService } from '../../application/imports/integration-settings.service';
import { mapIntegrationSettingsToResponse } from './integration-settings.mapper';
import {
  IntegrationConnectionActionBody,
  IntegrationConnectionActionBodySchema,
} from './dto/integration-connection.dto';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

function toConnectionResponse(state: {
  status: string;
  authorizedAt: Date | null;
  lastCheckedAt: Date | null;
}) {
  return {
    status: state.status,
    authorizedAt: state.authorizedAt ? state.authorizedAt.toISOString() : null,
    lastCheckedAt: state.lastCheckedAt ? state.lastCheckedAt.toISOString() : null,
  };
}

@ApiTags('IntegrationSettings')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/integrations')
export class IntegrationSettingsController {
  constructor(
    @Inject(IntegrationSettingsService)
    private readonly settingsService: IntegrationSettingsService,
    @Inject(IntegrationConnectionService)
    private readonly connectionService: IntegrationConnectionService,
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

  @Post(':source/authorize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Begin integration authorization (simulated flow)',
    description:
      'Opens the authorization flow for a portfolio + source. No real OAuth, no external URL, no secrets: the simulated flow advances the persisted connection lifecycle only. Blocked while the product is PREPARING.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'source', description: 'Integration source (B3)' })
  @ApiResponse({ status: 200, description: 'Connection state after beginning authorization' })
  @ApiResponse({
    status: 400,
    description: 'Unknown source, invalid transition or blocked environment',
  })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async beginAuthorization(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('source') source: string,
    @Body(new ZodValidationPipe(IntegrationConnectionActionBodySchema))
    _body: IntegrationConnectionActionBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const state = await this.connectionService.beginAuthorization({
      portfolioId,
      userId: principal.userId,
      source,
    });
    return { data: toConnectionResponse(state) };
  }

  @Post(':source/complete-authorization')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete simulated authorization (dev/test harness only)',
    description:
      'Completes an open authorization flow. Only available where simulated connections are allowed; never a real B3 grant.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'source', description: 'Integration source (B3)' })
  @ApiResponse({ status: 200, description: 'Connection state after completion' })
  @ApiResponse({
    status: 400,
    description: 'No open flow, invalid transition or blocked environment',
  })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async completeAuthorization(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('source') source: string,
    @Body(new ZodValidationPipe(IntegrationConnectionActionBodySchema))
    _body: IntegrationConnectionActionBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const state = await this.connectionService.completeAuthorization({
      portfolioId,
      userId: principal.userId,
      source,
    });
    return { data: toConnectionResponse(state) };
  }

  @Post(':source/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke an integration connection',
    description:
      'Revokes the connection: future executions stop, history and ledger are preserved, schedule preference is untouched.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'source', description: 'Integration source (B3)' })
  @ApiResponse({ status: 200, description: 'Connection state after revocation' })
  @ApiResponse({
    status: 400,
    description: 'Nothing to revoke, invalid transition or blocked environment',
  })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async revokeConnection(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('source') source: string,
    @Body(new ZodValidationPipe(IntegrationConnectionActionBodySchema))
    _body: IntegrationConnectionActionBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const state = await this.connectionService.revoke({
      portfolioId,
      userId: principal.userId,
      source,
    });
    return { data: toConnectionResponse(state) };
  }

  @Post(':source/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh the local authorization check',
    description:
      'Reconciles the persisted connection against the simulated provider truth. A technical check failure never revokes: only the check timestamp moves.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'source', description: 'Integration source (B3)' })
  @ApiResponse({ status: 200, description: 'Connection state after the check' })
  @ApiResponse({ status: 400, description: 'Unknown source' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async checkAuthorization(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('source') source: string,
    @Body(new ZodValidationPipe(IntegrationConnectionActionBodySchema))
    _body: IntegrationConnectionActionBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const state = await this.connectionService.checkAuthorization({
      portfolioId,
      userId: principal.userId,
      source,
    });
    return { data: toConnectionResponse(state) };
  }
}
