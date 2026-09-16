import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import {
  USER_REPOSITORY,
  SESSION_REPOSITORY,
  PASSWORD_RESET_TOKEN_REPOSITORY,
} from '../../database/tokens';
import {
  IUserRepository,
  ISessionRepository,
  IPasswordResetTokenRepository,
} from '@atlas/database';
import { PASSWORD_HASHER, PasswordHasher } from '../../auth/services/password-hasher.interface';
import { TokenService } from '../../auth/services/token.service';

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: ISessionRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly resetTokenRepository: IPasswordResetTokenRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(TokenService)
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: ResetPasswordDto): Promise<{ success: boolean }> {
    const tokenHash = this.tokenService.hashPasswordResetToken(dto.token);

    const record = await this.resetTokenRepository.findByTokenHash(tokenHash);
    if (!record || record.usedAt !== null) {
      throw new BadRequestException({
        message: 'Invalid or already used password reset token.',
        code: 'AUTH.INVALID_RESET_TOKEN',
      });
    }

    if (record.expiresAt <= new Date()) {
      throw new BadRequestException({
        message: 'Password reset token has expired.',
        code: 'AUTH.RESET_TOKEN_EXPIRED',
      });
    }

    // 1. Mark token as used immediately (single-use invariant)
    await this.resetTokenRepository.markAsUsed(record.id);

    // 2. Hash new password and update user record
    const passwordHash = await this.passwordHasher.hash(dto.newPassword);
    await this.userRepository.updatePassword(record.userId, passwordHash);

    // 3. Mandatory security invariant: Revoke ALL existing active sessions for this user
    await this.sessionRepository.revokeAllForUser(record.userId);

    return { success: true };
  }
}
