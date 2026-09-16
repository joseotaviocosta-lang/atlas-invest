import { PrismaClient } from '@prisma/client';
import { ISessionRepository, SessionRecord, CreateSessionData } from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

export class SessionRepository implements ISessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateSessionData): Promise<SessionRecord> {
    try {
      return await this.prisma.session.create({
        data: {
          userId: data.userId,
          refreshTokenHash: data.refreshTokenHash,
          expiresAt: data.expiresAt,
          userAgent: data.userAgent,
          ipHash: data.ipHash,
          deviceName: data.deviceName,
        },
      });
    } catch (error) {
      throw new PersistenceError(`Failed to create session: ${(error as Error).message}`);
    }
  }

  async findById(id: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({
      where: { id },
    });
  }

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<SessionRecord | null> {
    return this.prisma.session.findFirst({
      where: { refreshTokenHash },
    });
  }

  async findByPreviousRefreshTokenHash(
    previousRefreshTokenHash: string,
  ): Promise<SessionRecord | null> {
    return this.findByAnyPreviousRefreshTokenHash(previousRefreshTokenHash);
  }

  async findByAnyPreviousRefreshTokenHash(
    refreshTokenHash: string,
  ): Promise<SessionRecord | null> {
    return this.prisma.session.findFirst({
      where: {
        OR: [
          { previousRefreshTokenHash: refreshTokenHash },
          { usedRefreshTokenHashes: { has: refreshTokenHash } },
        ],
      },
    });
  }

  async rotateRefreshToken(
    sessionId: string,
    newRefreshTokenHash: string,
    newExpiresAt: Date,
    expectedCurrentHash?: string,
  ): Promise<SessionRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.session.findUnique({ where: { id: sessionId } });
        if (!current) {
          throw new PersistenceError(`Session ${sessionId} not found`);
        }
        if (expectedCurrentHash && current.refreshTokenHash !== expectedCurrentHash) {
          throw new PersistenceError(
            `Concurrent rotation detected: current token hash does not match expected hash`,
          );
        }
        const updatedUsedHashes = current.refreshTokenHash
          ? [...current.usedRefreshTokenHashes, current.refreshTokenHash]
          : current.usedRefreshTokenHashes;

        return await tx.session.update({
          where: { id: sessionId },
          data: {
            previousRefreshTokenHash: current.refreshTokenHash ?? null,
            usedRefreshTokenHashes: updatedUsedHashes,
            refreshTokenHash: newRefreshTokenHash,
            expiresAt: newExpiresAt,
            lastUsedAt: new Date(),
          },
        });
      });
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError(`Failed to rotate refresh token: ${(error as Error).message}`);
    }
  }

  async revoke(sessionId: string): Promise<void> {
    try {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          revokedAt: new Date(),
        },
      });
    } catch (error) {
      throw new PersistenceError(`Failed to revoke session: ${(error as Error).message}`);
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    try {
      await this.prisma.session.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } catch (error) {
      throw new PersistenceError(`Failed to revoke all user sessions: ${(error as Error).message}`);
    }
  }

  async touchLastUsed(sessionId: string): Promise<void> {
    try {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          lastUsedAt: new Date(),
        },
      });
    } catch (error) {
      throw new PersistenceError(`Failed to touch session lastUsedAt: ${(error as Error).message}`);
    }
  }
}
