import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { USER_REPOSITORY } from '../../database/tokens';
import { IUserRepository, UserAlreadyExistsError } from '@atlas/database';
import { PASSWORD_HASHER, PasswordHasher } from '../../auth/services/password-hasher.interface';

export interface RegisterUserDto {
  email: string;
  password: string;
  name: string;
}

export interface UserResponseDto {
  id: string;
  email: string;
  name: string;
  locale: string;
  timezone: string;
  baseCurrency: string;
  createdAt: string;
}

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(dto: RegisterUserDto): Promise<UserResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existing = await this.userRepository.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException({
        message: 'A user with this email address already exists.',
        code: 'AUTH.EMAIL_ALREADY_EXISTS',
      });
    }

    const passwordHash = await this.passwordHasher.hash(dto.password);

    try {
      const user = await this.userRepository.create({
        email: normalizedEmail,
        name: dto.name.trim(),
        passwordHash,
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        timezone: user.timezone,
        baseCurrency: user.baseCurrency,
        createdAt: user.createdAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof UserAlreadyExistsError) {
        throw new ConflictException({
          message: 'A user with this email address already exists.',
          code: 'AUTH.EMAIL_ALREADY_EXISTS',
        });
      }
      throw error;
    }
  }
}
