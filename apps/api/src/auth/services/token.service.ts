import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

export interface AccessTokenPayload {
  userId: string;
  sessionId: string;
}

interface DecodedJwtPayload extends jwt.JwtPayload {
  sub: string;
  sid: string;
}

@Injectable()
export class TokenService {
  private readonly jwtSecret: string;
  private readonly jwtTtlSeconds: number;
  private readonly refreshTokenPepper: string;
  private readonly refreshTokenTtlDays: number;
  private readonly passwordResetPepper: string;
  private readonly passwordResetTtlMinutes: number;

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';

    const jwtSecret = process.env.JWT_ACCESS_SECRET;
    if (isProduction && (!jwtSecret || jwtSecret === 'replace-with-strong-secret')) {
      throw new Error('JWT_ACCESS_SECRET must be configured securely in production.');
    }
    this.jwtSecret = jwtSecret || 'dev-jwt-access-secret-32-chars-long-atlas-invest';

    const rfPepper = process.env.REFRESH_TOKEN_PEPPER;
    if (isProduction && (!rfPepper || rfPepper === 'replace-with-strong-secret')) {
      throw new Error('REFRESH_TOKEN_PEPPER must be configured securely in production.');
    }
    this.refreshTokenPepper = rfPepper || 'dev-refresh-token-pepper-32-chars-long-atlas';

    const prPepper = process.env.PASSWORD_RESET_PEPPER;
    if (isProduction && (!prPepper || prPepper === 'replace-with-strong-secret')) {
      throw new Error('PASSWORD_RESET_PEPPER must be configured securely in production.');
    }
    this.passwordResetPepper = prPepper || 'dev-password-reset-pepper-32-chars-long';

    this.jwtTtlSeconds = process.env.JWT_ACCESS_TTL_SECONDS
      ? parseInt(process.env.JWT_ACCESS_TTL_SECONDS, 10)
      : 900; // 15 minutes

    this.refreshTokenTtlDays = process.env.REFRESH_TOKEN_TTL_DAYS
      ? parseInt(process.env.REFRESH_TOKEN_TTL_DAYS, 10)
      : 30; // 30 days

    this.passwordResetTtlMinutes = process.env.PASSWORD_RESET_TTL_MINUTES
      ? parseInt(process.env.PASSWORD_RESET_TTL_MINUTES, 10)
      : 30; // 30 minutes
  }

  // --- Access Tokens (JWT) ---

  generateAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(
      {
        sub: payload.userId,
        sid: payload.sessionId,
      },
      this.jwtSecret,
      {
        algorithm: 'HS256',
        expiresIn: this.jwtTtlSeconds,
      },
    );
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
      }) as DecodedJwtPayload;

      if (!decoded.sub || !decoded.sid) {
        throw new UnauthorizedException('Token payload is missing required claims.');
      }

      return {
        userId: decoded.sub,
        sessionId: decoded.sid,
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Access token has expired.');
      }
      throw new UnauthorizedException('Invalid access token.');
    }
  }

  getAccessTokenExpiresIn(): number {
    return this.jwtTtlSeconds;
  }

  // --- Refresh Tokens (Opaque + HMAC-SHA256) ---

  generateRefreshToken(): string {
    return crypto.randomBytes(48).toString('hex');
  }

  hashRefreshToken(token: string): string {
    return crypto.createHmac('sha256', this.refreshTokenPepper).update(token).digest('hex');
  }

  getRefreshTokenExpiresAt(): Date {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshTokenTtlDays);
    return expiresAt;
  }

  // --- Password Reset Tokens (Opaque + HMAC-SHA256) ---

  generatePasswordResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  hashPasswordResetToken(token: string): string {
    return crypto.createHmac('sha256', this.passwordResetPepper).update(token).digest('hex');
  }

  getPasswordResetExpiresAt(): Date {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.passwordResetTtlMinutes);
    return expiresAt;
  }
}
