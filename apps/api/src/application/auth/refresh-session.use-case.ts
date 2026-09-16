import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { SESSION_REPOSITORY } from '../../database/tokens';
import { ISessionRepository } from '@atlas/database';
import { TokenService } from '../../auth/services/token.service';

export interface RefreshSessionDto {
  refreshToken: string;
}

export interface RefreshSessionResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class RefreshSessionUseCase {
  private readonly inFlightRefreshes = new Map<string, Promise<RefreshSessionResponseDto>>();

  constructor(
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: ISessionRepository,
    @Inject(TokenService)
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: RefreshSessionDto): Promise<RefreshSessionResponseDto> {
    const presentedHash = this.tokenService.hashRefreshToken(dto.refreshToken);

    // If another request is currently refreshing the exact same token in-flight,
    // this is a concurrent race condition. We wait for the leader and then fail safely
    // as a concurrency conflict WITHOUT revoking the winner's session.
    const existing = this.inFlightRefreshes.get(presentedHash);
    if (existing) {
      try {
        await existing;
      } catch {
        // leader failed or rejected
      }
      throw new UnauthorizedException({
        message: 'Concurrent refresh conflict or invalid session state.',
        code: 'AUTH.INVALID_REFRESH_TOKEN',
      });
    }

    const refreshPromise = this.performRefresh(presentedHash);
    this.inFlightRefreshes.set(presentedHash, refreshPromise);

    try {
      return await refreshPromise;
    } finally {
      this.inFlightRefreshes.delete(presentedHash);
    }
  }

  private async performRefresh(presentedHash: string): Promise<RefreshSessionResponseDto> {
    // 1. Detect token reuse from any previously rotated token in the session family
    const reusedSession =
      await this.sessionRepository.findByAnyPreviousRefreshTokenHash(presentedHash);
    if (reusedSession) {
      await this.sessionRepository.revoke(reusedSession.id);
      throw new UnauthorizedException({
        message: 'Refresh token reuse detected. Session has been revoked.',
        code: 'AUTH.INVALID_REFRESH_TOKEN',
      });
    }

    // 2. Lookup session by current active refresh token hash
    const session = await this.sessionRepository.findByRefreshTokenHash(presentedHash);
    if (!session) {
      throw new UnauthorizedException({
        message: 'Invalid or expired refresh token.',
        code: 'AUTH.INVALID_REFRESH_TOKEN',
      });
    }

    if (session.revokedAt !== null) {
      throw new UnauthorizedException({
        message: 'Session has been revoked or expired.',
        code: 'AUTH.SESSION_REVOKED',
      });
    }

    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedException({
        message: 'Session has expired.',
        code: 'AUTH.SESSION_EXPIRED',
      });
    }

    // 3. Generate new refresh token and rotate in database atomically
    const newRawRefreshToken = this.tokenService.generateRefreshToken();
    const newRefreshTokenHash = this.tokenService.hashRefreshToken(newRawRefreshToken);
    const newExpiresAt = this.tokenService.getRefreshTokenExpiresAt();

    try {
      await this.sessionRepository.rotateRefreshToken(
        session.id,
        newRefreshTokenHash,
        newExpiresAt,
        presentedHash,
      );
    } catch {
      // If concurrent rotation detected, another transaction already succeeded.
      // Do NOT revoke the session so the winner remains valid!
      throw new UnauthorizedException({
        message: 'Concurrent refresh conflict or invalid session state.',
        code: 'AUTH.INVALID_REFRESH_TOKEN',
      });
    }

    // 4. Issue new access token
    const accessToken = this.tokenService.generateAccessToken({
      userId: session.userId,
      sessionId: session.id,
    });

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: this.tokenService.getAccessTokenExpiresIn(),
    };
  }
}
