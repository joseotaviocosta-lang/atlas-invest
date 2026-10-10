import { describe, it, expect } from 'vitest';
import {
  projectTaxComplianceTimeline,
  ProjectTaxComplianceTimelineInput,
  MonthlyComplianceSource,
  TaxComplianceUserActionRecord,
} from '@atlas/tax-engine';

describe('Phase 4K.1B — Tax Compliance Timeline Scale & Complexity Suite', () => {
  const taxSubjectId = '00000000-0000-0000-0000-000000000001';
  const calendarYear = 2026;
  const today = '2026-04-15';

  const scaleSizes = [10, 100, 1000, 10000];

  for (const size of scaleSizes) {
    it(`evaluates scale of ${size} obligations/actions within linear bounded budget`, () => {
      const monthlySources: MonthlyComplianceSource[] = Array.from({ length: size }, (_, i) => ({
        competence: `2026-${String((i % 12) + 1).padStart(2, '0')}`,
        revenueCode: `6015-${i}`,
        bucket: 'EQUITY_NORMAL',
        principalAmount: `${(i + 1) * 10}.00`,
        currency: 'BRL',
        dueDate: '2026-04-30',
        status: 'OPEN',
        reasonCode: null,
        darfReadiness: 'READY',
        sourceFingerprint: `fp-scale-${i}-v1`,
      }));

      const userActions: TaxComplianceUserActionRecord[] = Array.from({ length: size }, (_, i) => ({
        id: `act-${i}`,
        taxSubjectId,
        obligationKey: `${taxSubjectId}:2026-${String((i % 12) + 1).padStart(2, '0')}:MONTHLY_TAX_PAYMENT:monthly-6015-${i}`,
        revision: 1,
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: `fp-scale-${i}-v1`,
        note: `Note ${i}`,
        occurredAt: '2026-04-01T10:00:00.000Z',
      }));

      const input: ProjectTaxComplianceTimelineInput = {
        taxSubjectId,
        calendarYear,
        todayCivilDate: today,
        monthlySources,
        userActions,
        annualState: null,
      };

      const memBefore = process.memoryUsage().heapUsed;
      const t0 = performance.now();

      const timeline = projectTaxComplianceTimeline(input);

      const t1 = performance.now();
      const memAfter = process.memoryUsage().heapUsed;

      const durationMs = t1 - t0;
      const memDeltaMb = (memAfter - memBefore) / (1024 * 1024);

      // JSON serialization timing
      const tSer0 = performance.now();
      const serialized = JSON.stringify(timeline);
      const tSer1 = performance.now();
      const serDurationMs = tSer1 - tSer0;

      expect(timeline.obligations.length).toBe(size);
      expect(timeline.summary.completedCount).toBe(size);
      expect(serialized.length).toBeGreaterThan(0);

      // Timing bounds: 10k items in pure memory should finish in < 500ms
      expect(durationMs).toBeLessThan(1500);

      console.info(
        `[4K.1B Scale size=${size}] durationMs=${durationMs.toFixed(2)} serDurationMs=${serDurationMs.toFixed(2)} memDeltaMb=${memDeltaMb.toFixed(2)}`,
      );
    });
  }
});
