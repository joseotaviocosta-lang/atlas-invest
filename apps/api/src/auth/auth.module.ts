import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database';
import { AuthController } from './auth.controller';
import { PASSWORD_HASHER } from './services/password-hasher.interface';
import { Argon2PasswordHasher } from './services/argon2-password-hasher.service';
import { TokenService } from './services/token.service';
import {
  PASSWORD_RESET_NOTIFIER,
  InMemoryPasswordResetNotifier,
} from './services/password-reset-notifier.interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  RegisterUserUseCase,
  LoginUseCase,
  RefreshSessionUseCase,
  LogoutUseCase,
  GetCurrentUserUseCase,
  ForgotPasswordUseCase,
  ResetPasswordUseCase,
} from '../application/auth';

const USE_CASES = [
  RegisterUserUseCase,
  LoginUseCase,
  RefreshSessionUseCase,
  LogoutUseCase,
  GetCurrentUserUseCase,
  ForgotPasswordUseCase,
  ResetPasswordUseCase,
];

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    {
      provide: PASSWORD_HASHER,
      useClass: Argon2PasswordHasher,
    },
    TokenService,
    {
      provide: PASSWORD_RESET_NOTIFIER,
      useClass: InMemoryPasswordResetNotifier,
    },
    JwtAuthGuard,
    ...USE_CASES,
  ],
  exports: [PASSWORD_HASHER, TokenService, PASSWORD_RESET_NOTIFIER, JwtAuthGuard, ...USE_CASES],
})
export class AuthModule {}
