import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { USER_REPOSITORY, SESSION_REPOSITORY } from '../../database/tokens';
import { IUserRepository, ISessionRepository } from '@atlas/database';
import { PASSWORD_HASHER, PasswordHasher } from '../../auth/services/password-hasher.interface';
import { TokenService } from '../../auth/services/token.service';

export interface LoginDto {
  email: string;
  password: string;
  userAgent?: string;
  ipHash?: string;
  deviceName?: string;
}

export interface LoginResponseDto {
  user: {
    id: string;
    email: string;
    name: string;
    locale: string;
    timezone: string;
    baseCurrency: string;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: ISessionRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(TokenService)
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: LoginDto): Promise<LoginResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.userRepository.findByEmail(normalizedEmail);
    if (!user) {
      await this.passwordHasher.verifyDummy();
      throw new UnauthorizedException({
        message: 'Invalid credentials.',
        code: 'AUTH.INVALID_CREDENTIALS',
      });
    }

    const isValid = await this.passwordHasher.verify(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException({
        message: 'Invalid credentials.',
        code: 'AUTH.INVALID_CREDENTIALS',
      });
    }

    const rawRefreshToken = this.tokenService.generateRefreshToken();
    const refreshTokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);

    const session = await this.sessionRepository.create({
      userId: user.id,
      refreshTokenHash,
      expiresAt: this.tokenService.getRefreshTokenExpiresAt(),
      userAgent: dto.userAgent,
      ipHash: dto.ipHash,
      deviceName: dto.deviceName,
    });

    const accessToken = this.tokenService.generateAccessToken({
      userId: user.id,
      sessionId: session.id,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        timezone: user.timezone,
        baseCurrency: user.baseCurrency,
      },
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: this.tokenService.getAccessTokenExpiresIn(),
    };
  }
}
