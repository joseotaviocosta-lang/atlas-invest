import { describe, it, expect } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('should return ok status and service information', () => {
    const controller = new HealthController();
    const result = controller.getHealth();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('atlas-api');
    expect(result.version).toBe('0.1.0');
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).not.toBeNaN();
  });

  it('should return ok when database check succeeds', async () => {
    const mockPrisma = {
      $queryRawUnsafe: async () => [{ '?column?': 1 }],
    };
    const controller = new HealthController(mockPrisma as any);
    const mockRes = { status: () => mockRes } as any;

    const result = await controller.getReady(mockRes);
    expect(result.status).toBe('ok');
    expect(result.database).toBe('connected');
    expect(result.timestamp).toBeDefined();
  });

  it('should return error and 503 when database check fails', async () => {
    const mockPrisma = {
      $queryRawUnsafe: async () => {
        throw new Error('Connection refused');
      },
    };
    const controller = new HealthController(mockPrisma as any);
    let statusCode: number | undefined;
    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
    } as any;

    const result = await controller.getReady(mockRes);
    expect(statusCode).toBe(503);
    expect(result.status).toBe('error');
    expect(result.database).toBe('disconnected');
    expect(result.error).toBe('Connection refused');
  });
});
