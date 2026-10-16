import { Controller, Get, Inject, Optional, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { PRISMA_CLIENT } from '../database/tokens';
import { getPrismaClient } from '@atlas/database';

type AtlasPrismaClient = ReturnType<typeof getPrismaClient>;

export interface HealthCheckResponse {
  status: string;
  service: string;
  version: string;
  commitSha?: string;
  timestamp: string;
}

export interface ReadyCheckResponse {
  status: string;
  database: string;
  timestamp: string;
  error?: string;
}

import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller()
export class HealthController {
  constructor(
    @Optional()
    @Inject(PRISMA_CLIENT)
    private readonly prisma?: AtlasPrismaClient,
  ) {}

  @Get('health')
  getHealth(): HealthCheckResponse {
    return {
      status: 'ok',
      service: 'atlas-api',
      version: process.env.APP_VERSION || '0.1.0',
      commitSha: process.env.GIT_COMMIT_SHA || process.env.COMMIT_SHA || 'unknown',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async getReady(@Res({ passthrough: true }) res: Response): Promise<ReadyCheckResponse> {
    try {
      if (this.prisma) {
        await this.prisma.$queryRawUnsafe('SELECT 1');
      }
      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      console.error('[HealthController] Database readiness probe failed:', err);
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'error',
        database: 'disconnected',
        error: 'Database ping failed',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
