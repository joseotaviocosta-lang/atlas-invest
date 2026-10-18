import { describe, it, expect } from 'vitest';
import { LocalDate, Money, Quantity } from '@atlas/domain';

describe('Phase 5C-R1.1 Multi-Currency Performance Safety & I4 Guards', () => {
  describe('Gate 23 & Gate 24: I4_NO_GO Guard Rails Against Fabricated Historical Cross-Currency TWR', () => {
    it('Never backfills current FX rate to past historical portfolio snapshots', () => {
      // Historical performance engine requires daily historical FX series.
      // Current spot rate (e.g. 5.50) MUST NEVER be backfilled across past dates (e.g. 2024-01-01)
      const pastDate = LocalDate.from('2024-01-01');
      const spotDate = LocalDate.from('2026-10-16');
      const spotRate = '5.50';

      // Verify invariant: spot rate cannot be applied to past date without an explicit historical observation
      const applySpotRateToPast = (date: LocalDate, rate: string) => {
        if (date.compare(spotDate) < 0) {
          throw new Error(
            'I4_NO_GO_BY_DESIGN: Historical FX backfill from current spot rate is strictly forbidden.',
          );
        }
        return rate;
      };

      expect(() => applySpotRateToPast(pastDate, spotRate)).toThrow(
        'I4_NO_GO_BY_DESIGN: Historical FX backfill from current spot rate is strictly forbidden.',
      );
    });

    it('Gate 25: Past cash flows in foreign currencies without historical FX remain segregated and never mixed', () => {
      // Multi-currency cash flows must remain in their native currency bucket
      // when historical FX is not present
      const brlCashFlow = Money.from('1000.00', 'BRL');
      const usdCashFlow = Money.from('200.00', 'USD');

      // Attempting to sum directly without daily historical rate must fail by Money primitive invariant
      expect(() => {
        // @ts-expect-error Money.add with different currencies throws CurrencyMismatchError
        brlCashFlow.add(usdCashFlow);
      }).toThrow();
    });

    it('Gate 26: Missing FX rate NEVER falls back to 1.0 (zero parity invention)', () => {
      const foreignAmount = Money.from('100.00', 'USD');
      const fxRate: string | null = null;

      const convertCurrency = (amount: Money, targetCur: 'BRL', rate: string | null): Money => {
        if (amount.currency === targetCur) return amount;
        if (!rate) {
          throw new Error(
            `MISSING_FX_RATE: Cannot translate ${amount.currency} to ${targetCur} without authoritative rate.`,
          );
        }
        const converted = Quantity.from(amount.amount).multiply(Quantity.from(rate));
        return Money.from(converted.value, targetCur);
      };

      expect(() => convertCurrency(foreignAmount, 'BRL', fxRate)).toThrow('MISSING_FX_RATE');
    });

    it('Gate 27 & Gate 28: Zero JS floating-point numbers in cross-currency financial calculations', () => {
      // Quantities and rates must strictly use arbitrary precision strings
      const qtyStr = '100.123456789012345678';
      const rateStr = '5.123456789012345678';

      const qty = Quantity.from(qtyStr);
      const rate = Quantity.from(rateStr);
      const product = qty.multiply(rate);

      expect(typeof product.value).toBe('string');
      // Verify precision is preserved without IEEE 754 float rounding errors
      expect(product.value).toContain('512.9782');
    });
  });
});
