import { describe, it, expect } from 'vitest';
import { sanitizeContext, Logger } from '../../packages/logger/src/index';

describe('Foundation: Logger Sanitization & Sensitive Data Rules', () => {
  it('should mask sensitive keys including password, token, patrimonio, and saldo', () => {
    const context = {
      user: 'investor_123',
      password: 'my-secret-password',
      token: 'jwt.token.here',
      patrimonio: 150000.5,
      saldo: 2300.0,
      safeMetric: 42,
    };

    const sanitized = sanitizeContext(context);
    expect(sanitized).toBeDefined();
    expect(sanitized?.user).toBe('investor_123');
    expect(sanitized?.password).toBe('[REDACTED]');
    expect(sanitized?.token).toBe('[REDACTED]');
    expect(sanitized?.patrimonio).toBe('[REDACTED]');
    expect(sanitized?.saldo).toBe('[REDACTED]');
    expect(sanitized?.safeMetric).toBe(42);
  });

  it('should recursively sanitize nested objects', () => {
    const context = {
      account: {
        id: 'acc_01',
        balance: 99999,
      },
    };

    const sanitized = sanitizeContext(context);
    expect((sanitized?.account as Record<string, unknown>).balance).toBe('[REDACTED]');
  });

  it('should instantiate Logger with default or custom options', () => {
    const logger = new Logger({ service: 'test-service', minLevel: 'debug' });
    expect(logger).toBeDefined();
  });
});
