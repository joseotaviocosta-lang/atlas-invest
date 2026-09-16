import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { USER_REPOSITORY } from '../../database/tokens';
import { IUserRepository } from '@atlas/database';
import { UserResponseDto } from './register-user.use-case';

@Injectable()
export class GetCurrentUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException({
        message: 'User was not found.',
        code: 'COMMON.NOT_FOUND',
      });
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      timezone: user.timezone,
      baseCurrency: user.baseCurrency,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
