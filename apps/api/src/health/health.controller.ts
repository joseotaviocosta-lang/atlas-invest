import { Controller, Get } from '@nestjs/common';

export interface HealthCheckResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
}

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthCheckResponse {
    return {
      status: 'ok',
      service: 'atlas-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    };
  }
}
