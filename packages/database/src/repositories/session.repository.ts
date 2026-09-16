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
    return this.prisma.session.findFirst({
      where: { previousRefreshTokenHash },
    });
  }

  async rotateRefreshToken(
    sessionId: string,
    newRefreshTokenHash: string,
    newExpiresAt: Date,
  ): Promise<SessionRecord> {
    try {
      const current = await this.prisma.session.findUnique({ where: { id: sessionId } });
      return await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          previousRefreshTokenHash: current?.refreshTokenHash ?? null,
          refreshTokenHash: newRefreshTokenHash,
          expiresAt: newExpiresAt,
          lastUsedAt: new Date(),
        },
      });
    } catch (error) {
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
