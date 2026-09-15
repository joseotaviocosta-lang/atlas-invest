import { describe, it, expect } from 'vitest';
import { HealthController } from '../../apps/api/src/health/health.controller';

describe('Foundation: API Health Endpoint', () => {
  it('GET /health should return 200 payload with status ok', () => {
    const controller = new HealthController();
    const response = controller.getHealth();

    expect(response).toBeDefined();
    expect(response.status).toBe('ok');
    expect(response.service).toBe('atlas-api');
    expect(response.version).toBe('0.1.0');
    expect(typeof response.timestamp).toBe('string');
  });
});
