import { Injectable, Inject } from '@nestjs/common';
import { SESSION_REPOSITORY } from '../../database/tokens';
import { ISessionRepository } from '@atlas/database';

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: ISessionRepository,
  ) {}

  async execute(sessionId: string): Promise<{ success: boolean }> {
    await this.sessionRepository.revoke(sessionId);
    return { success: true };
  }
}
