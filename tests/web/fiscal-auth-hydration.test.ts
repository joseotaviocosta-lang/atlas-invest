import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { isAuthReady } from '@/lib/auth-ready';

function readWeb(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Web fiscal auth and hydration boundaries', () => {
  it('keeps protected reads disabled until auth is initialized and authenticated', () => {
    expect(isAuthReady('refreshing', false)).toBe(false);
    expect(isAuthReady('unauthenticated', true)).toBe(false);
    expect(isAuthReady('authenticated', false)).toBe(false);
    expect(isAuthReady('unknown', false)).toBe(false);
    expect(isAuthReady('authenticated', true)).toBe(true);
  });

  it('gates both high-income reads and retains the year condition', () => {
    const highIncome = readWeb('apps/web/src/components/fiscal/AnnualHighIncomeSection.tsx');

    expect(
      highIncome.match(
        /enabled: authReady && Boolean\(calendarYear >= 1900 && calendarYear <= 2100\)/g,
      ),
    ).toHaveLength(2);
    expect(highIncome).toContain('/api/v1/fiscal/annual/${calendarYear}/high-income`');
    expect(highIncome).toContain('/api/v1/fiscal/annual/${calendarYear}/high-income/review`');
  });

  it('gates the tax page and every mounted fiscal query component', () => {
    const taxPage = readWeb('apps/web/src/app/(app)/tax/page.tsx');
    const fiscalComponents = [
      'AnnualCapitalMarketSection.tsx',
      'AnnualInvestmentIncomeSection.tsx',
      'AnnualPositionsSection.tsx',
      'AnnualReadinessSection.tsx',
      'AnnualReportingSection.tsx',
      'ComplianceTimelineSection.tsx',
      'Composed6015Section.tsx',
      'TaxComplianceActionCenterSection.tsx',
      'TaxCompliancePeriodCloseSection.tsx',
      'TaxComplianceRemindersSection.tsx',
      'TaxObligationSection.tsx',
      'TaxPaymentSupportModal.tsx',
      'UnifiedAnnualSection.tsx',
    ];

    expect(taxPage.match(/enabled: authReady(?:\s*&&|,)/g)).toHaveLength(4);
    expect(taxPage).toContain('const status = useAuthStore((state) => state.status);');
    expect(taxPage).toContain(
      'const isInitialized = useAuthStore((state) => state.isInitialized);',
    );
    expect(taxPage).toContain("useState('')");
    expect(taxPage).toContain('setCompetence(currentCompetence())');
    expect(taxPage).toContain('portfoliosData[0]!.id');
    expect(taxPage).not.toMatch(/useAuthStore\(\(state\) => \(\{/);
    for (const file of fiscalComponents) {
      const component = readWeb(`apps/web/src/components/fiscal/${file}`);
      expect(component).toContain('useAuthReady');
      expect(component).toMatch(/enabled(?::|\s*=)\s*(?:authReady|authReady\s*&&|enabled)/);
    }
  });

  it('keeps the auth-dependent shell deterministic through first hydration', () => {
    const shell = readWeb('apps/web/src/app/(app)/layout.tsx');
    const readiness = readWeb('apps/web/src/components/fiscal/AnnualReadinessSection.tsx');

    expect(shell).toContain('const isHydrated = useHydrated();');
    expect(shell).toContain('const visibleUser = isHydrated ? user : null;');
    expect(shell).not.toContain('suppressHydrationWarning');
    expect(readiness).toContain("toLocaleDateString('pt-BR', { timeZone: 'UTC' })");
  });
});
