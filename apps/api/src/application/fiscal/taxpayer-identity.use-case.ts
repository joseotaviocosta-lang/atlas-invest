import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import type { ITaxpayerIdentityRepository } from '@atlas/database';
import {
  isValidTaxpayerIdentifier,
  maskTaxpayerIdentifier,
  normalizeTaxpayerIdentifier,
  type TaxpayerIdentityType,
} from '@atlas/tax-engine';
import { TAXPAYER_IDENTITY_REPOSITORY } from '../../database/tokens';
import { hashTaxpayerIdentifier } from './darf-generation-fingerprint';
import {
  mapIdentityToReadModel,
  type TaxpayerIdentityReadModel,
} from './darf-generation.read-model';

/**
 * Phase 4F — records the taxpayer identity boundary. The raw CPF/CNPJ is never
 * persisted: only the masked display form and an opaque HMAC reference are
 * stored. PII never reaches the tax engine, logs, telemetry or AI (ADR-286).
 */
@Injectable()
export class RecordTaxpayerIdentityUseCase {
  constructor(
    @Inject(TAXPAYER_IDENTITY_REPOSITORY)
    private readonly repository: ITaxpayerIdentityRepository,
  ) {}

  async execute(params: {
    userId: string;
    identityType: TaxpayerIdentityType;
    identifier: string;
  }): Promise<TaxpayerIdentityReadModel> {
    if (!isValidTaxpayerIdentifier(params.identifier, params.identityType)) {
      throw new BadRequestException({
        message: `Invalid ${params.identityType} identifier.`,
        code: 'TAXPAYER_IDENTITY.INVALID_IDENTIFIER',
      });
    }
    const normalized = normalizeTaxpayerIdentifier(params.identifier)!;
    const masked = maskTaxpayerIdentifier(normalized, params.identityType)!;
    const row = await this.repository.upsert({
      userId: params.userId,
      identityType: params.identityType,
      maskedIdentifier: masked,
      secureReference: hashTaxpayerIdentifier(normalized),
      identityAvailable: true,
    });
    return mapIdentityToReadModel(row);
  }
}

/** Phase 4F — reads the taxpayer identity boundary (masked only). */
@Injectable()
export class GetTaxpayerIdentityUseCase {
  constructor(
    @Inject(TAXPAYER_IDENTITY_REPOSITORY)
    private readonly repository: ITaxpayerIdentityRepository,
  ) {}

  async execute(params: { userId: string }): Promise<TaxpayerIdentityReadModel> {
    const row = await this.repository.findByUserId(params.userId);
    return mapIdentityToReadModel(row);
  }
}
