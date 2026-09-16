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
  constructor(
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: ISessionRepository,
    @Inject(TokenService)
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: RefreshSessionDto): Promise<RefreshSessionResponseDto> {
    const presentedHash = this.tokenService.hashRefreshToken(dto.refreshToken);

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

    if (session.revokedAt !== null || session.expiresAt <= new Date()) {
      throw new UnauthorizedException({
        message: 'Session has been revoked or expired.',
        code: 'AUTH.SESSION_REVOKED',
      });
    }

    // 3. Rotate refresh token with concurrency protection
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
    } catch (error) {
      // If concurrent rotation detected, revoke session and throw UnauthorizedException
      await this.sessionRepository.revoke(session.id).catch(() => {});
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
