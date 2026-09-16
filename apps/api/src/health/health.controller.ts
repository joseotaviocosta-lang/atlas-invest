import { Controller, Get, Inject, Optional, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { PRISMA_CLIENT } from '../database/tokens';
import { getPrismaClient } from '@atlas/database';

type AtlasPrismaClient = ReturnType<typeof getPrismaClient>;

export interface HealthCheckResponse {
  status: string;
  service: string;
  version: string;
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
      version: '0.1.0',
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
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'error',
        database: 'disconnected',
        error: err instanceof Error ? err.message : 'Database ping failed',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
