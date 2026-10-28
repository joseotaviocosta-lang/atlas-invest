import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';
import { ZodValidationPipe } from '../../common/pipes';
import { PrivacyService } from './privacy.service';
import {
  AcceptLegalDocumentDto,
  AcceptLegalDocumentSchema,
  AcceptLegalDocumentSwaggerDto,
  UpdateConsentDto,
  UpdateConsentSchema,
  UpdateConsentSwaggerDto,
  CreateDataSubjectRequestDto,
  CreateDataSubjectRequestSchema,
  CreateDataSubjectRequestSwaggerDto,
  DeactivateAccountDto,
  DeactivateAccountSchema,
  DeactivateAccountSwaggerDto,
} from './dto/privacy.dto';

@ApiTags('Privacy & LGPD')
@ApiBearerAuth()
@Controller('api/v1/privacy')
export class PrivacyController {
  constructor(
    @Inject(PrivacyService)
    private readonly privacyService: PrivacyService,
  ) {}

  @Get('documents')
  @ApiOperation({
    summary: 'List versioned legal documents with watermarks and compliance metadata',
  })
  @ApiResponse({ status: 200, description: 'List of versioned legal documents' })
  getDocuments() {
    const data = this.privacyService.getDocuments();
    return { data };
  }

  @Get('acceptances')
  @ApiOperation({ summary: 'List legal document acceptances for authenticated user' })
  @ApiResponse({ status: 200, description: 'Acceptance audit records' })
  async getAcceptances(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    const data = await this.privacyService.getAcceptances(principal.userId);
    return { data };
  }

  @Post('acceptances')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record acceptance of Terms of Service or Privacy Policy' })
  @ApiBody({ type: AcceptLegalDocumentSwaggerDto })
  @ApiResponse({ status: 201, description: 'Acceptance recorded successfully' })
  async acceptDocument(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(AcceptLegalDocumentSchema)) dto: AcceptLegalDocumentDto,
    @Req() req: Request,
  ) {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const data = await this.privacyService.acceptDocument(
      principal.userId,
      dto,
      clientIp,
      userAgent,
    );
    return { data };
  }

  @Get('consents')
  @ApiOperation({ summary: 'List granular processing consents for authenticated user' })
  @ApiResponse({ status: 200, description: 'List of granular consents' })
  async getConsents(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    const data = await this.privacyService.getConsents(principal.userId);
    return { data };
  }

  @Post('consents')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grant or revoke a granular processing consent' })
  @ApiBody({ type: UpdateConsentSwaggerDto })
  @ApiResponse({ status: 200, description: 'Consent state updated successfully' })
  async updateConsent(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(UpdateConsentSchema)) dto: UpdateConsentDto,
    @Req() req: Request,
  ) {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const data = await this.privacyService.updateConsent(
      principal.userId,
      dto,
      clientIp,
      userAgent,
    );
    return { data };
  }

  @Get('requests')
  @ApiOperation({ summary: 'List Data Subject Requests (DSR) submitted by user under LGPD' })
  @ApiResponse({ status: 200, description: 'List of data subject requests' })
  async getRequests(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    const data = await this.privacyService.getRequests(principal.userId);
    return { data };
  }

  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a new Data Subject Request (access, export, delete, rectify, etc.)',
  })
  @ApiBody({ type: CreateDataSubjectRequestSwaggerDto })
  @ApiResponse({ status: 201, description: 'Request registered for processing' })
  async createRequest(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(CreateDataSubjectRequestSchema)) dto: CreateDataSubjectRequestDto,
  ) {
    const data = await this.privacyService.createRequest(principal.userId, dto);
    return { data };
  }

  @Post('account/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate user account, revoke sessions, and record retention notice',
  })
  @ApiBody({ type: DeactivateAccountSwaggerDto })
  @ApiResponse({ status: 200, description: 'Account deactivated safely without ledger cascade' })
  async deactivateAccount(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(DeactivateAccountSchema)) _dto: DeactivateAccountDto,
  ) {
    const data = await this.privacyService.deactivateAccount(principal.userId);
    return { data };
  }

  @Get('export')
  @ApiOperation({ summary: 'Export complete structured JSON data package for authenticated user' })
  @ApiResponse({ status: 200, description: 'Machine-readable JSON data export' })
  async exportData(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Res() res: Response) {
    const data = await this.privacyService.exportData(principal.userId);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="atlas-privacy-export-${principal.userId}.json"`,
    );
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(HttpStatus.OK).json({ data });
  }

  @Get('sharing')
  @ApiOperation({ summary: 'Get transparent data sharing and third-party processor inventory' })
  @ApiResponse({ status: 200, description: 'Data sharing entities and conditions' })
  getSharing() {
    const data = this.privacyService.getSharingInventory();
    return { data };
  }
}
