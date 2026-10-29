import { Injectable, Inject } from '@nestjs/common';
import { USER_REPOSITORY, PASSWORD_RESET_TOKEN_REPOSITORY } from '../../database/tokens';
import { IUserRepository, IPasswordResetTokenRepository } from '@atlas/database';
import { TokenService } from '../../auth/services/token.service';
import {
  PASSWORD_RESET_NOTIFIER,
  PasswordResetNotifier,
} from '../../auth/services/password-reset-notifier.interface';
import { Logger } from '@atlas/logger';

export interface ForgotPasswordDto {
  email: string;
}

@Injectable()
export class ForgotPasswordUseCase {
  private readonly logger = new Logger({ service: 'ForgotPasswordUseCase' });

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly resetTokenRepository: IPasswordResetTokenRepository,
    @Inject(PASSWORD_RESET_NOTIFIER)
    private readonly notifier: PasswordResetNotifier,
    @Inject(TokenService)
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: ForgotPasswordDto): Promise<{ accepted: boolean }> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (user) {
      const rawToken = this.tokenService.generatePasswordResetToken();
      const tokenHash = this.tokenService.hashPasswordResetToken(rawToken);
      const expiresAt = this.tokenService.getPasswordResetExpiresAt();

      await this.resetTokenRepository.create({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      try {
        await this.notifier.sendResetEmail(user.email, rawToken);
      } catch (err: unknown) {
        // Step 10 & 9: Delivery failure is factually observable in server logs,
        // sanitized without raw token, while maintaining anti-enumeration for the client.
        this.logger.error('Failed to dispatch password reset email', {
          userId: user.id,
          recipient: user.email,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Always return generic accepted: true to prevent user enumeration
    return { accepted: true };
  }
}
