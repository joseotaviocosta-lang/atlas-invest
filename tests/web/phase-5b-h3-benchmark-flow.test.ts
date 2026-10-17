import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 5B-H3: Benchmark Ingestion Flow & UI Action Wiring', () => {
  const pagePath = path.join(
    process.cwd(),
    'apps/web/src/app/(app)/portfolio/performance/page.tsx',
  );
  const content = fs.readFileSync(pagePath, 'utf8');

  it('wires benchmark ingestion into backfillMutation when benchmark is selected', () => {
    // When selectedBenchmark is IBOV or CDI, calls POST /api/v1/benchmarks/${selectedBenchmark}/update
    expect(content).toContain("selectedBenchmark === 'IBOV' || selectedBenchmark === 'CDI'");
    expect(content).toContain('/api/v1/benchmarks/${selectedBenchmark}/update');
    // Also always calls portfolio backfill
    expect(content).toContain('/market-data/backfill');
  });

  it('runs only portfolio backfill when no benchmark is selected', () => {
    expect(content).toContain('if (!benchmarkPromise)');
    expect(content).toContain('return { portfolioReceipt: portfolioRes.data };');
  });

  it('formats combined receipt feedback distinguishing portfolio quotes and benchmark observations', () => {
    expect(content).toContain('formatCombinedReceiptFeedback');
    expect(content).toContain('observação atualizada');
    expect(content).toContain('observações atualizadas');
    expect(content).toContain('já atualizado');
    expect(content).toContain('Falha ao atualizar');
  });

  it('handles benchmark failure gracefully without aborting portfolio backfill results', () => {
    expect(content).toContain('benchmarkPromise.catch(');
    expect(content).toContain('benchmarkError: benchmarkRes.error');
  });

  it('invalidates relative risk and active performance queries on success', () => {
    expect(content).toContain("queryKey: ['portfolio-relative-risk'");
    expect(content).toContain("queryKey: ['portfolio-active-performance'");
    expect(content).toContain('refetchRelativeRisk()');
    expect(content).toContain('refetchActivePerformance()');
  });

  it('benchmark selector click only updates URL search params and never triggers auto-mutation', () => {
    expect(content).toContain('const handleBenchmarkChange = (value: string) => {');
    expect(content).toContain("params.set('benchmark', value)");
    // Ensure handleBenchmarkChange does NOT call backfillMutation.mutate
    const fnBody = content.slice(
      content.indexOf('const handleBenchmarkChange ='),
      content.indexOf('const handleWindowChange ='),
    );
    expect(fnBody).not.toContain('backfillMutation');
    expect(fnBody).not.toContain('mutate');
  });

  it('preserves clean button UI semantics without leaking provider symbols or math', () => {
    expect(content).toContain('Atualizando histórico...');
    expect(content).toContain('Atualizar histórico');
    expect(content).not.toMatch(/calculateBenchmarkReturn/);
    expect(content).not.toMatch(/calculateTWR/);
  });
});

