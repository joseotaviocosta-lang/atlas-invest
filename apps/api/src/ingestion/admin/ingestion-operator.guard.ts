/**
 * Phase 5E (R3-C) - Server-side operator authorization for ingestion admin.
 *
 * There is no pre-existing RBAC/role table in the repository. The minimal safe
 * mechanism is a server-side allowlist of authenticated user IDs:
 *
 *   INGESTION_OPERATOR_USER_IDS=<uuid>[,<uuid>...]
 *
 * Empty/unset => every privileged request is denied. Client-supplied roles,
 * headers or user IDs are never trusted.
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedPrincipal } from '../../auth/principal/authenticated-principal';

export const INGESTION_OPERATOR_FORBIDDEN = 'INGESTION.OPERATOR_FORBIDDEN';

export function parseOperatorUserIds(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

export function isOperatorUser(
  userId: string | undefined,
  rawAllowlist: string | undefined,
): boolean {
  if (!userId) return false;
  return parseOperatorUserIds(rawAllowlist).has(userId);
}

@Injectable()
export class IngestionOperatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedPrincipal }>();
    const userId = request.user?.userId;

    if (!userId) {
      throw new UnauthorizedException({
        message: 'Authentication is required for ingestion administration.',
        code: 'AUTH.UNAUTHORIZED',
      });
    }

    if (!isOperatorUser(userId, process.env.INGESTION_OPERATOR_USER_IDS)) {
      throw new ForbiddenException({
        message: 'Ingestion administration is restricted to authorized operators.',
        code: INGESTION_OPERATOR_FORBIDDEN,
      });
    }

    return true;
  }
}
