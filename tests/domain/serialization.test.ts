import { describe, it, expect } from 'vitest';
import {
  TransactionFactory,
  serializeTransaction,
  Money,
  Quantity,
  LocalDate,
} from '../../packages/domain/src/index';

describe('Domain: Serialization and Round-Trip Verification', () => {
  it('should serialize a complex TradeTransaction preserving exact decimal strings without float truncation', () => {
    const tx = TransactionFactory.createBuy({
      id: '12345678-1234-4234-8234-123456789abc',
      portfolioId: '22222222-2222-4222-8222-222222222222',
      accountId: '33333333-3333-4333-8333-333333333333',
      assetId: '44444444-4444-4444-8444-444444444444',
      quantity: '100.55443322',
      unitPrice: '31.074532',
      currency: 'BRL',
      fees: '12.34',
      taxes: '2.50',
      tradeDate: '2026-09-15',
      settlementDate: '2026-09-17',
      source: 'B3',
      provider: 'B3_CEI',
      externalId: 'ext_99999',
      notes: 'Executado via Home Broker',
      createdAt: new Date('2026-09-15T14:30:00.000Z'),
    });

    const json = serializeTransaction(tx);

    expect(json).toEqual({
      id: '12345678-1234-4234-8234-123456789abc',
      portfolioId: '22222222-2222-4222-8222-222222222222',
      accountId: '33333333-3333-4333-8333-333333333333',
      assetId: '44444444-4444-4444-8444-444444444444',
      type: 'BUY',
      currency: 'BRL',
      quantity: '100.55443322',
      unitPrice: { amount: '31.074532', currency: 'BRL' },
      fees: { amount: '12.34', currency: 'BRL' },
      taxes: { amount: '2.5', currency: 'BRL' },
      tradeDate: '2026-09-15',
      settlementDate: '2026-09-17',
      source: 'B3',
      provider: 'B3_CEI',
      externalId: 'ext_99999',
      notes: 'Executado via Home Broker',
      createdAt: '2026-09-15T14:30:00.000Z',
    });
  });

  it('should verify property-like matrix values in complete round-trip (input -> domain -> serialize -> parse -> equality)', () => {
    const testMatrix = [
      '0',
      '0.01',
      '0.1',
      '1',
      '1.00000001',
      '999999999.999999',
      '123456789.123456789',
    ];

    for (const val of testMatrix) {
      // Money roundtrip
      const moneyOriginal = Money.from(val, 'BRL');
      const moneyJSON = moneyOriginal.toJSON();
      const moneyRestored = Money.fromJSON(moneyJSON);
      expect(moneyRestored.equals(moneyOriginal)).toBe(true);

      // Quantity roundtrip
      const qtyOriginal = Quantity.from(val);
      const qtyJSON = qtyOriginal.toJSON();
      const qtyRestored = Quantity.fromJSON(qtyJSON);
      expect(qtyRestored.equals(qtyOriginal)).toBe(true);
    }
  });

  it('LocalDate round-trip preserves calendar value without timezone distortion', () => {
    const dates = ['2024-02-29', '2026-01-01', '2026-12-31', '2030-07-20'];
    for (const d of dates) {
      const orig = LocalDate.from(d);
      const json = orig.toJSON();
      const parsed = LocalDate.fromJSON(json);
      expect(parsed.equals(orig)).toBe(true);
      expect(parsed.toString()).toBe(d);
    }
  });
});
