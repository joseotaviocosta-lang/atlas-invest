import { Controller, Post, Get, Body, HttpCode, HttpStatus, Inject, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from './decorators/public.decorator';
import { CurrentPrincipal } from './decorators/current-principal.decorator';
import { AuthenticatedPrincipal } from './principal/authenticated-principal';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  RegisterInputSchema,
  LoginInputSchema,
  RefreshTokenInputSchema,
  ForgotPasswordInputSchema,
  ResetPasswordInputSchema,
} from '@atlas/validation';
import { RegisterDto, LoginDto, RefreshDto, ForgotPasswordDto, ResetPasswordDto } from './dto';
import {
  RegisterUserUseCase,
  LoginUseCase,
  RefreshSessionUseCase,
  LogoutUseCase,
  GetCurrentUserUseCase,
  ForgotPasswordUseCase,
  ResetPasswordUseCase,
} from '../application/auth';
import { TokenService } from './services/token.service';

@ApiTags('Authentication')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    @Inject(RegisterUserUseCase)
    private readonly registerUserUseCase: RegisterUserUseCase,
    @Inject(LoginUseCase)
    private readonly loginUseCase: LoginUseCase,
    @Inject(RefreshSessionUseCase)
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    @Inject(LogoutUseCase)
    private readonly logoutUseCase: LogoutUseCase,
    @Inject(GetCurrentUserUseCase)
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    @Inject(ForgotPasswordUseCase)
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    @Inject(ResetPasswordUseCase)
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    @Inject(TokenService)
    private readonly tokenService: TokenService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body(new ZodValidationPipe(RegisterInputSchema)) dto: RegisterDto) {
    const user = await this.registerUserUseCase.execute(dto);
    return { data: user };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Successfully authenticated' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body(new ZodValidationPipe(LoginInputSchema)) dto: LoginDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent'];
    const ip = req.ip || req.socket.remoteAddress;
    const ipHash = ip ? this.tokenService.hashIp(ip) : undefined;
    const result = await this.loginUseCase.execute({
      ...dto,
      userAgent,
      ipHash,
    });
    return { data: result };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  @ApiResponse({ status: 200, description: 'Tokens successfully rotated' })
  @ApiResponse({ status: 401, description: 'Invalid, expired, or reused refresh token' })
  async refresh(@Body(new ZodValidationPipe(RefreshTokenInputSchema)) dto: RefreshDto) {
    const result = await this.refreshSessionUseCase.execute(dto);
    return { data: result };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke current session' })
  @ApiResponse({ status: 200, description: 'Successfully logged out' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    const result = await this.logoutUseCase.execute(principal.sessionId);
    return { data: result };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    const user = await this.getCurrentUserUseCase.execute(principal.userId);
    return { data: user };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset token (generic response)' })
  @ApiResponse({ status: 200, description: 'Request accepted' })
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordInputSchema)) dto: ForgotPasswordDto,
  ) {
    const result = await this.forgotPasswordUseCase.execute(dto);
    return { data: result };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token and revoke all sessions' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset token' })
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordInputSchema)) dto: ResetPasswordDto,
  ) {
    const result = await this.resetPasswordUseCase.execute(dto);
    return { data: result };
  }
}
