import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenService } from '../services/token.service';
import { SESSION_REPOSITORY } from '../../database/tokens';
import { ISessionRepository } from '@atlas/database';
import {
  LOCAL_OWNER_USER_ID,
  LOCAL_OWNER_SESSION_ID,
  ATLAS_CLIENT_HEADER,
  DESKTOP_LOCAL_CLIENT_VALUE,
} from '../constants/local-owner.constants';

export function isLoopbackAddress(ip?: string): boolean {
  if (!ip) return false;
  const cleanIp = ip.trim().toLowerCase();
  return (
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp === '::ffff:127.0.0.1' ||
    cleanIp === 'localhost'
  );
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(TokenService)
    private readonly tokenService: TokenService,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: ISessionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const clientHeader = request.headers[ATLAS_CLIENT_HEADER];

    // Desktop Local Owner Mode loopback bypass
    if (clientHeader === DESKTOP_LOCAL_CLIENT_VALUE) {
      const clientIp = request.ip || request.socket?.remoteAddress;
      if (!isLoopbackAddress(clientIp)) {
        throw new UnauthorizedException({
          message: 'Desktop local owner mode is only accessible via loopback interface.',
          code: 'AUTH.LOOPBACK_ONLY',
        });
      }

      const isLocalModeAllowed =
        process.env.NODE_ENV !== 'production' ||
        process.env.ATLAS_LOCAL_OWNER_MODE === 'true';

      if (!isLocalModeAllowed) {
        throw new UnauthorizedException({
          message: 'Desktop local owner mode is disabled on this server.',
          code: 'AUTH.LOCAL_MODE_DISABLED',
        });
      }

      (request as Request & { user: unknown }).user = {
        userId: LOCAL_OWNER_USER_ID,
        sessionId: LOCAL_OWNER_SESSION_ID,
      };

      return true;
    }

    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        message: 'Missing or malformed authorization token.',
        code: 'AUTH.UNAUTHORIZED',
      });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException({
        message: 'Missing authorization token.',
        code: 'AUTH.UNAUTHORIZED',
      });
    }

    let payload;
    try {
      payload = this.tokenService.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException({
        message: 'Invalid or expired access token.',
        code: 'AUTH.UNAUTHORIZED',
      });
    }

    const session = await this.sessionRepository.findById(payload.sessionId);
    if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
      throw new UnauthorizedException({
        message: 'Session has been revoked or expired.',
        code: 'AUTH.SESSION_REVOKED',
      });
    }

    // Attach principal to request
    (request as Request & { user: unknown }).user = {
      userId: payload.userId,
      sessionId: payload.sessionId,
    };

    // Asynchronously touch lastUsedAt without blocking request
    this.sessionRepository.touchLastUsed(session.id).catch(() => {});

    return true;
  }
}
