import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5S-F (web) — operational reliability & recovery UI surface.
 *
 * Verifies:
 * 1. Operations center surfaces recovery item when runs are interrupted or retryable.
 * 2. Run detail in import workspace provides a safe "Tentar novamente" button for retryable runs.
 * 3. Interrupted runs display an explicit "Interrompida" badge and factual explanation.
 * 4. Recovery actions navigate to existing safe surfaces (reviews, imports, run history).
 */
describe('Phase 5S-F: Operational Reliability & Recovery Web Surface', () => {
  const operationsSection = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioOperationsSection.tsx'),
    'utf8',
  );
  const importPage = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/import/page.tsx'),
    'utf8',
  );

  it('operations center includes operational recovery attention and section', () => {
    expect(operationsSection).toContain('data-testid="operations-recovery"');
    expect(operationsSection).toContain('Recuperação operacional');
    expect(operationsSection).toContain('sincronizações foram interrompidas');
    expect(operationsSection).toContain('execuções podem ser repetidas');
    expect(operationsSection).toContain('/portfolio/import?portfolioId=${portfolioId}#import-history');
  });

  it('import workspace provides retry mutation targeting the retry endpoint', () => {
    expect(importPage).toContain('/api/v1/portfolios/${activePortfolioId}/imports/runs/${runId}/retry');
    expect(importPage).toContain("queryKey: ['import-runs', activePortfolioId]");
    expect(importPage).toContain("queryKey: ['portfolio-operations', activePortfolioId]");
  });

  it('import workspace surfaces "Tentar novamente" button when run is retryable', () => {
    expect(importPage).toContain('selectedRun.recovery?.canRetry');
    expect(importPage).toContain('Tentar novamente');
    expect(importPage).toContain('retryMutation.isPending');
    expect(importPage).toContain('Não foi possível repetir a sincronização. Tente novamente.');
  });

  it('import workspace displays "Interrompida" badge and explanation for interrupted runs', () => {
    expect(importPage).toContain("selectedRun.recovery?.recoveryState === 'INTERRUPTED'");
    expect(importPage).toContain('Interrompida');
    expect(importPage).toContain('selectedRun.recovery.reason');
  });

  it('import workspace links to review inbox when run requires review', () => {
    expect(importPage).toContain('selectedRun.recovery?.requiresReview');
    expect(importPage).toContain('/reviews?portfolioId=${activePortfolioId}');
    expect(importPage).toContain('Revisar pendências desta execução →');
  });
});
