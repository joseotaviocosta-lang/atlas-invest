import { z } from 'zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// -----------------------------------------------------------------------------
// Legal Document Acceptance
// -----------------------------------------------------------------------------

export const AcceptLegalDocumentSchema = z.object({
  documentType: z.enum(['TERMS_OF_SERVICE', 'PRIVACY_POLICY'], {
    errorMap: () => ({ message: 'documentType must be TERMS_OF_SERVICE or PRIVACY_POLICY' }),
  }),
  version: z.string().min(1, 'version is required').max(20),
});

export type AcceptLegalDocumentDto = z.infer<typeof AcceptLegalDocumentSchema>;

export class AcceptLegalDocumentSwaggerDto {
  @ApiProperty({
    enum: ['TERMS_OF_SERVICE', 'PRIVACY_POLICY'],
    example: 'TERMS_OF_SERVICE',
    description: 'Document type being accepted',
  })
  documentType!: 'TERMS_OF_SERVICE' | 'PRIVACY_POLICY';

  @ApiProperty({
    type: String,
    example: '1.0.0',
    description: 'Document version being accepted',
  })
  version!: string;
}

// -----------------------------------------------------------------------------
// Granular Consent
// -----------------------------------------------------------------------------

export const ConsentPurposes = [
  'AI_GROUNDED_EXPLANATIONS',
  'PRODUCT_COMMUNICATIONS',
  'ANALYTICS_TELEMETRY',
  'INTEGRATION_AUTOMATION',
] as const;

export const UpdateConsentSchema = z.object({
  purpose: z.enum(ConsentPurposes, {
    errorMap: () => ({ message: `purpose must be one of: ${ConsentPurposes.join(', ')}` }),
  }),
  granted: z.boolean(),
});

export type UpdateConsentDto = z.infer<typeof UpdateConsentSchema>;

export class UpdateConsentSwaggerDto {
  @ApiProperty({
    enum: ConsentPurposes,
    example: 'AI_GROUNDED_EXPLANATIONS',
    description: 'Specific processing purpose for consent',
  })
  purpose!: (typeof ConsentPurposes)[number];

  @ApiProperty({
    type: Boolean,
    example: true,
    description: 'Whether consent is granted (true) or revoked (false)',
  })
  granted!: boolean;
}

// -----------------------------------------------------------------------------
// Data Subject Request (DSR)
// -----------------------------------------------------------------------------

export const DsrTypes = [
  'ACCESS',
  'EXPORT',
  'CORRECTION',
  'DELETION',
  'ANONYMIZATION',
  'PORTABILITY',
  'CONSENT_REVOCATION',
  'SHARING_INFO',
] as const;

export const CreateDataSubjectRequestSchema = z.object({
  type: z.enum(DsrTypes, {
    errorMap: () => ({ message: `type must be one of: ${DsrTypes.join(', ')}` }),
  }),
  details: z.string().max(2000).optional(),
});

export type CreateDataSubjectRequestDto = z.infer<typeof CreateDataSubjectRequestSchema>;

export class CreateDataSubjectRequestSwaggerDto {
  @ApiProperty({
    enum: DsrTypes,
    example: 'EXPORT',
    description: 'Type of data subject right being exercised under LGPD',
  })
  type!: (typeof DsrTypes)[number];

  @ApiPropertyOptional({
    type: String,
    example: 'Solicito a correção do endereço de contato ou confirmação de retenção legal.',
    description: 'Optional additional explanation or details',
  })
  details?: string;
}

// -----------------------------------------------------------------------------
// Account Deactivation
// -----------------------------------------------------------------------------

export const DeactivateAccountSchema = z.object({
  confirmation: z.literal('DESATIVAR MINHA CONTA', {
    errorMap: () => ({ message: 'confirmation must be exactly "DESATIVAR MINHA CONTA"' }),
  }),
});

export type DeactivateAccountDto = z.infer<typeof DeactivateAccountSchema>;

export class DeactivateAccountSwaggerDto {
  @ApiProperty({
    type: String,
    example: 'DESATIVAR MINHA CONTA',
    description: 'Security confirmation string required to deactivate account',
  })
  confirmation!: 'DESATIVAR MINHA CONTA';
}

