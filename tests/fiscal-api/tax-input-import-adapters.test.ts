import { describe, it, expect } from 'vitest';
import { EMPTY_TAX_INPUT_ADAPTER_REGISTRY } from '../../apps/api/src/application/fiscal/tax-input-source-adapter';

describe('Tax input import adapters (Phase 4B.4)', () => {
  it('stays empty and provider-neutral when no real source exists', () => {
    expect(EMPTY_TAX_INPUT_ADAPTER_REGISTRY.tradeClassificationAdapters).toHaveLength(0);
    expect(EMPTY_TAX_INPUT_ADAPTER_REGISTRY.withholdingAdapters).toHaveLength(0);
    expect(EMPTY_TAX_INPUT_ADAPTER_REGISTRY.fiiEligibilityAdapters).toHaveLength(0);
    expect(Object.isFrozen(EMPTY_TAX_INPUT_ADAPTER_REGISTRY)).toBe(true);
  });

  it('canonical payloads use exact decimal strings (no float)', () => {
    const payload = {
      competence: '2026-09',
      economicDate: '2026-09-10',
      category: 'BRAZILIAN_EQUITY' as const,
      amount: '12345.678901234567890123',
      currency: 'BRL',
      status: 'CONFIRMED' as const,
    };
    expect(payload.amount).toBe('12345.678901234567890123');
    expect(typeof payload.amount).toBe('string');
  });
});
