import { describe, it, expect } from 'vitest';
import { Response } from 'express';
import { HealthController } from './health.controller';
import { getPrismaClient } from '@atlas/database';

type AtlasPrismaClient = ReturnType<typeof getPrismaClient>;

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
    } as unknown as AtlasPrismaClient;
    const controller = new HealthController(mockPrisma);
    const mockRes = { status: () => mockRes } as unknown as Response;

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
    } as unknown as AtlasPrismaClient;
    const controller = new HealthController(mockPrisma);
    let statusCode: number | undefined;
    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
    } as unknown as Response;

    const result = await controller.getReady(mockRes);
    expect(statusCode).toBe(503);
    expect(result.status).toBe('error');
    expect(result.database).toBe('disconnected');
    expect(result.error).toBe('Connection refused');
  });
});
