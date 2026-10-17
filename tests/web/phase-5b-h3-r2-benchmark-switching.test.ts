import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 5B-H3-R2: Selected Benchmark Runtime Switching & Isolation', () => {
  const pagePath = path.join(
    process.cwd(),
    'apps/web/src/app/(app)/portfolio/performance/page.tsx',
  );
  const content = fs.readFileSync(pagePath, 'utf8');

  it('uses performanceQueryKey parameterized by selectedBenchmark', () => {
    expect(content).toContain('performanceQueryKey(');
    expect(content).toContain('selectedBenchmark');
    // Ensure performance query includes selectedBenchmark in its key
    const perfQuerySection = content.slice(
      content.indexOf('useQuery<'),
      content.indexOf('queryFn: () =>'),
    );
    expect(perfQuerySection).toContain('selectedBenchmark');
  });

  it('passes selectedBenchmark to IntelligenceSummarySection', () => {
    expect(content).toContain('<IntelligenceSummarySection');
    expect(content).toContain('selectedBenchmark={selectedBenchmark}');
  });

  it('ensures relativeRisk query reflects effective selected benchmark', () => {
    expect(content).toContain('effectiveRelativeBenchmark');
    expect(content).toContain('relativeRiskQueryKey(');
    expect(content).toContain('benchmark=${effectiveRelativeBenchmark}');
  });

  it('ensures activePerformance query is partitioned by effective selected benchmark', () => {
    expect(content).toContain('benchmark=${effectiveRelativeBenchmark}');
  });

  it('isolates benchmark selector click strictly to URL search params without triggering mutations', () => {
    const fnBody = content.slice(
      content.indexOf('const handleBenchmarkChange ='),
      content.indexOf('const handleWindowChange ='),
    );
    expect(fnBody).toContain("params.set('benchmark', value)");
    expect(fnBody).toContain("params.delete('benchmark')");
    expect(fnBody).not.toContain('mutate');
  });

  it('never performs benchmark math or rate calculations on the client', () => {
    expect(content).not.toMatch(/calculateRateBenchmarkReturn/);
    expect(content).not.toMatch(/calculateBenchmarkReturn/);
    expect(content).not.toMatch(/calculateTWR/);
  });
});
