import { Controller, Get, Inject, Optional, HttpStatus, Res, Query } from '@nestjs/common';
import { Response } from 'express';
import { PRISMA_CLIENT } from '../database/tokens';
import { getPrismaClient } from '@atlas/database';
import { telemetry, TelemetrySnapshot } from '@atlas/logger';
import { Public } from '../auth/decorators/public.decorator';

type AtlasPrismaClient = ReturnType<typeof getPrismaClient>;

export interface HealthCheckResponse {
  status: string;
  service: string;
  version: string;
  commitSha?: string;
  uptimeSeconds?: number;
  timestamp: string;
}

export interface ReadyCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  database: 'connected' | 'disconnected' | 'not_configured';
  timestamp: string;
  error?: string;
  checks?: {
    database: string;
    migrations: {
      applied: number;
      expected: number;
      status: 'up_to_date' | 'mismatch';
    };
    providers?: Record<string, string>;
  };
  telemetry?: TelemetrySnapshot;
}

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
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async getReady(
    @Res({ passthrough: true }) res: Response,
    @Query('telemetry') includeTelemetry?: string,
  ): Promise<ReadyCheckResponse> {
    const checks: {
      database: string;
      migrations: {
        applied: number;
        expected: number;
        status: 'up_to_date' | 'mismatch';
      };
      providers?: Record<string, string>;
    } = {
      database: 'unknown',
      migrations: {
        applied: 0,
        expected: 49,
        status: 'mismatch',
      },
    };

    try {
      if (this.prisma) {
        const start = Date.now();
        await this.prisma.$queryRawUnsafe('SELECT 1');
        telemetry.recordDbLatency(Date.now() - start, true);
        checks.database = 'connected';

        // Migration count check (canonical 49 migrations release baseline)
        const migrationRows = await this.prisma.$queryRawUnsafe<
          { count: string | number | bigint }[]
        >('SELECT COUNT(*) as count FROM _prisma_migrations WHERE finished_at IS NOT NULL');
        const appliedCount = migrationRows[0] ? Number(migrationRows[0].count) : 0;
        checks.migrations.applied = appliedCount;

        if (appliedCount >= 49) {
          checks.migrations.status = 'up_to_date';
        } else {
          checks.migrations.status = 'mismatch';
          res.status(HttpStatus.SERVICE_UNAVAILABLE);
          return {
            status: 'error',
            database: 'connected',
            error: `Database migrations mismatch: ${appliedCount}/49 applied`,
            checks,
            timestamp: new Date().toISOString(),
          };
        }
      } else {
        checks.database = 'not_configured';
        checks.migrations.status = 'up_to_date';
      }

      // Check external provider degradation
      const isDegraded = telemetry.isAnyProviderDegraded();
      const status = isDegraded ? 'degraded' : 'ok';

      const response: ReadyCheckResponse = {
        status,
        database: 'connected',
        checks,
        timestamp: new Date().toISOString(),
      };

      if (includeTelemetry === 'true' || includeTelemetry === '1') {
        response.telemetry = telemetry.getSnapshot();
      }

      return response;
    } catch (err: unknown) {
      telemetry.recordDbLatency(0, false);
      console.error('[HealthController] Database readiness probe failed:', err);
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'error',
        database: 'disconnected',
        error: 'Database ping failed',
        checks,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('metrics')
  getMetrics(): TelemetrySnapshot {
    return telemetry.getSnapshot();
  }
}
