import { PrismaClient } from '@prisma/client';
import { ITaxpayerIdentityRepository, TaxpayerIdentityRow } from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

type Row = {
  id: string;
  userId: string;
  identityType: string;
  maskedIdentifier: string;
  secureReference: string;
  identityAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Phase 4F — taxpayer identity boundary. Stores only a masked display form and
 * an opaque HMAC reference; the raw CPF/CNPJ is never persisted (ADR-286).
 */
export class TaxpayerIdentityRepository implements ITaxpayerIdentityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: Row): TaxpayerIdentityRow {
    return {
      id: row.id,
      userId: row.userId,
      identityType: row.identityType,
      maskedIdentifier: row.maskedIdentifier,
      secureReference: row.secureReference,
      identityAvailable: row.identityAvailable,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findByUserId(userId: string): Promise<TaxpayerIdentityRow | null> {
    const row = await this.prisma.taxpayerIdentityRecord.findUnique({ where: { userId } });
    return row ? this.map(row) : null;
  }

  async upsert(
    input: Parameters<ITaxpayerIdentityRepository['upsert']>[0],
  ): Promise<TaxpayerIdentityRow> {
    try {
      const row = await this.prisma.taxpayerIdentityRecord.upsert({
        where: { userId: input.userId },
        create: {
          userId: input.userId,
          identityType: input.identityType,
          maskedIdentifier: input.maskedIdentifier,
          secureReference: input.secureReference,
          identityAvailable: input.identityAvailable,
        },
        update: {
          identityType: input.identityType,
          maskedIdentifier: input.maskedIdentifier,
          secureReference: input.secureReference,
          identityAvailable: input.identityAvailable,
        },
      });
      return this.map(row);
    } catch (error) {
      throw new PersistenceError(`Failed to upsert taxpayer identity: ${(error as Error).message}`);
    }
  }
}
