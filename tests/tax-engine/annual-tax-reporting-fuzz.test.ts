import { describe, expect, it } from 'vitest';
import {
  buildAnnualTaxReportingPackage,
  ANNUAL_REPORTING_DISCLAIMER,
} from '../../packages/tax-engine/src/annual-irpf';

describe('Tax Engine: Annual Tax Reporting 10,000-Case Fuzz & Invariant Verification (Phase 4H.6)', () => {
  it(
    'runs 10,000 deterministic randomized reporting scenarios and validates domain invariants',
    { timeout: 60000 },
    () => {
      // Deterministic Linear Congruential Generator
      let seed = 123456789;
      function rand(): number {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      const ITERATIONS = 10000;
      const startTime = Date.now();

      for (let iteration = 0; iteration < ITERATIONS; iteration++) {
        const year = 2024 + Math.floor(rand() * 5); // 2024 to 2028

        const hasPositions = rand() < 0.8;
        const positionCount = hasPositions ? Math.floor(rand() * 5) + 1 : 0;
        const positions = [];
        for (let p = 0; p < positionCount; p++) {
          const isFii = rand() < 0.3;
          const isSold = rand() < 0.1;
          const isBlocked = rand() < 0.15;
          positions.push({
            assetId: `asset-${p}`,
            ticker: isFii ? `FII${p}11` : `EQT${p}3`,
            assetType: isFii ? 'FII' : 'BRAZILIAN_EQUITY',
            closingQuantity: isSold ? '0' : '100',
            closingTotalCost: isSold ? '0.00' : '2500.00',
            openingQuantity: '100',
            openingTotalCost: '2000.00',
            costBasisStatus: isBlocked ? 'INCOMPLETE' : 'COMPLETE',
            isBlocked,
            blockingReasons: isBlocked ? ['INCOMPLETE_COST_BASIS'] : [],
            isSoldOut: isSold,
          });
        }

        const hasCapitalMarket = rand() < 0.7;
        const cm = hasCapitalMarket
          ? {
              overallStatus: rand() < 0.1 ? 'BLOCKED' : 'READY',
              normalEquities: {
                netGain: '2000.00',
                exemptSalesGross: rand() < 0.3 ? '15000.00' : undefined,
                exemptSalesNetGain: rand() < 0.3 ? '1000.00' : undefined,
                irrfTotalWithheld: '10.00',
                irrfTerminalBalance: '10.00',
              },
              dayTrade: {
                netGain: '500.00',
                irrfTotalWithheld: '5.00',
                irrfTerminalBalance: '5.00',
              },
            }
          : null;

        const hasIncome = rand() < 0.6;
        const payers = [];
        if (hasIncome) {
          const payerCount = Math.floor(rand() * 3) + 1;
          for (let py = 0; py < payerCount; py++) {
            const is2026Reform = year >= 2026 && rand() < 0.5;
            const isJcp = rand() < 0.3;
            const isFii = rand() < 0.2;
            payers.push({
              assetId: `payer-${py}`,
              ticker: isFii ? `FII${py}11` : `EQT${py}3`,
              payerName: `PAYER CORP ${py}`,
              payerDocument: `00.000.000/000${py}-00`,
              incomeType: isFii ? 'FII_INCOME' : isJcp ? 'JCP' : 'DIVIDEND',
              taxTreatment: is2026Reform || isJcp ? 'EXCLUSIVE' : 'EXEMPT',
              grossAmount: is2026Reform ? '60000.00' : '500.00',
              withheldAmount: is2026Reform ? '6000.00' : isJcp ? '75.00' : '0.00',
              netAmount: is2026Reform ? '54000.00' : isJcp ? '425.00' : '500.00',
            });
          }
        }

        const pkg = buildAnnualTaxReportingPackage({
          taxSubjectId: `user-fuzz-${iteration}`,
          calendarYear: year,
          annualPositions: hasPositions ? { positions } : null,
          capitalMarketSummary: cm,
          investmentIncomeSummary: hasIncome ? { payers } : null,
        });

        // Invariant 1: Exercise year is always year + 1
        expect(pkg.declarationExercise).toBe(year + 1);

        // Invariant 2: Mandatory disclaimer is always present
        expect(pkg.disclaimer).toBe(ANNUAL_REPORTING_DISCLAIMER);

        // Invariant 3: Exactly 6 canonical sections
        expect(pkg.sections).toHaveLength(6);
        expect(Object.isFrozen(pkg)).toBe(true);
        expect(Object.isFrozen(pkg.sections)).toBe(true);

        // Invariant 4: Fingerprint is valid SHA-256
        expect(pkg.packageFingerprint).toMatch(/^[a-f0-9]{64}$/);

        // Invariant 5: Item structural integrity across sections
        for (const section of pkg.sections) {
          expect(section.section).toBeDefined();
          expect(section.title).toBeDefined();
          expect(section.status).toBeDefined();

          for (const item of section.items) {
            expect(item.reportingItemId).toBeTruthy();
            expect(item.officialMappingCode).toBeTruthy();
            expect(item.officialMappingLabel).toBeTruthy();
            expect(item.description).toBeTruthy();
            expect(['OFFICIAL', 'PROVISIONAL', 'UNSUPPORTED', 'REQUIRES_CONFIRMATION']).toContain(
              item.mappingStatus,
            );
            expect(item.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
          }
        }
      }

      const elapsedMs = Date.now() - startTime;
      expect(elapsedMs).toBeLessThan(45000);
    },
  );
});

