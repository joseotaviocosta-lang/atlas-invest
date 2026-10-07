import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { formatHighIncomeReviewPackageViewModel, type RawHighIncomeReviewPackage } from '@atlas/ui';

function readWeb(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const COMPONENT = 'apps/web/src/components/fiscal/AnnualHighIncomeSection.tsx';

describe('Web: high-income review-package export action (Phase 4I.6)', () => {
  const component = readWeb(COMPONENT);

  it('renders an accessible export button labeled "Exportar relatório de apoio"', () => {
    expect(component).toMatch(/data-testid="high-income-export"/);
    expect(component).toMatch(/Exportar relatório de apoio/);
    // Native <button type="button"> is keyboard operable by default.
    expect(component).toMatch(/<button[\s\S]*?data-testid="high-income-export"/);
  });

  it('export control group is labeled and the button has a 44px touch target', () => {
    expect(component).toMatch(/aria-label="Exportar relatório de apoio"/);
    expect(component).toMatch(/minHeight: '44px'/);
  });

  it('offers CSV (default) and JSON accessible format controls', () => {
    expect(component).toMatch(/data-testid="high-income-export-format"/);
    expect(component).toMatch(/useState<'csv' \| 'json'>\('csv'\)/);
    expect(component).toMatch(/<option value="csv">CSV<\/option>/);
    expect(component).toMatch(/<option value="json">JSON<\/option>/);
  });

  it('fetches the canonical export URL with the chosen format and parses Content-Disposition', () => {
    expect(component).toMatch(
      /\/api\/v1\/fiscal\/annual\/\$\{calendarYear\}\/high-income\/export\?format=\$\{exportFormat\}/,
    );
    expect(component).toMatch(/Content-Disposition/);
    expect(component).toMatch(/atlas-alta-renda-\$\{calendarYear\}-relatorio-apoio\.\$\{ext\}/);
  });

  it('disables the download on a malformed package (fail-safe)', () => {
    expect(component).toMatch(/packageMalformed/);
    expect(component).toMatch(/const canExport =/);
    expect(component).toMatch(/disabled=\{!canExport \|\| exporting\}/);
  });

  it('renders a package-level stale indicator (text + icon/badge, role=status)', () => {
    expect(component).toMatch(/data-testid="high-income-package-stale"/);
    expect(component).toMatch(/role="status"[\s\S]*?data-testid="high-income-package-stale"/);
    expect(component).toMatch(/Pacote desatualizado/);
  });

  it('returns focus to the trigger button after download', () => {
    expect(component).toMatch(/exportButtonRef/);
    expect(component).toMatch(/exportButtonRef\.current\?\.focus\(\)/);
  });

  it('performs no client-side tax math in the export path', () => {
    expect(component).not.toMatch(/parseFloat/);
    expect(component).not.toMatch(/Number\(/);
    expect(component).not.toMatch(/\bMath\.(pow|sqrt|round|floor|ceil|max|min)\b/);
    expect(component).not.toMatch(/\.amount\s*[*/+-]/);
  });

  it('null/zero/na labels come from the shared @atlas/ui view-model', () => {
    const malformed = formatHighIncomeReviewPackageViewModel(
      {} as unknown as RawHighIncomeReviewPackage,
    );
    expect(malformed).toBeNull();
    // Component uses the shared formatter, never inline formatting.
    expect(component).toMatch(/formatHighIncomeReviewPackageViewModel/);
    expect(component).toMatch(/highIncomeReviewPackageQueryKey/);
  });
});
