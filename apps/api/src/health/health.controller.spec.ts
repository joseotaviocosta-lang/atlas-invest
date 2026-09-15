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
});
