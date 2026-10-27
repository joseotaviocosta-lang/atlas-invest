import { z } from 'zod';
import { UUIDSchema } from '@atlas/validation';
import { ApiProperty } from '@nestjs/swagger';

export const ReconciliationDecisionBodySchema = z
  .object({
    transactionId: UUIDSchema,
    decision: z.enum(['CONFIRM_MATCH', 'NOT_A_MATCH']),
  })
  .strict();

export type ReconciliationDecisionBody = z.infer<typeof ReconciliationDecisionBodySchema>;

export class ReconciliationDecisionBodySwaggerDto {
  @ApiProperty({ type: String, description: 'UUID of the linked local transaction' })
  transactionId!: string;

  @ApiProperty({ type: String, enum: ['CONFIRM_MATCH', 'NOT_A_MATCH'] })
  decision!: string;
}
