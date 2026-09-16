import { PrismaClient } from '@prisma/client';
import {
  IPasswordResetTokenRepository,
  PasswordResetTokenRecord,
  CreatePasswordResetTokenData,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

export class PasswordResetTokenRepository implements IPasswordResetTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreatePasswordResetTokenData): Promise<PasswordResetTokenRecord> {
    try {
      return await this.prisma.passwordResetToken.create({
        data: {
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
      });
    } catch (error) {
      throw new PersistenceError(
        `Failed to create password reset token: ${(error as Error).message}`,
      );
    }
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    return this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
  }

  async markAsUsed(id: string): Promise<void> {
    try {
      await this.prisma.passwordResetToken.update({
        where: { id },
        data: {
          usedAt: new Date(),
        },
      });
    } catch (error) {
      throw new PersistenceError(
        `Failed to mark password reset token as used: ${(error as Error).message}`,
      );
    }
  }

  async markAsUsedIfUnused(id: string): Promise<boolean> {
    try {
      const result = await this.prisma.passwordResetToken.updateMany({
        where: {
          id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });
      return result.count > 0;
    } catch (error) {
      throw new PersistenceError(
        `Failed to mark password reset token as used: ${(error as Error).message}`,
      );
    }
  }
}
