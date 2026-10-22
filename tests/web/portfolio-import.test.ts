import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

function readWeb(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Web Import Hub boundaries (Phase 5K)', () => {
  const page = () => readWeb('apps/web/src/app/(app)/portfolio/import/page.tsx');

  it('gates all import reads and writes behind auth readiness', () => {
    expect(page()).toContain('useAuthReady');
    expect(page()).toContain('enabled: authReady');
    expect(page()).not.toMatch(/skipAuth:\s*true/);
  });

  it('wraps useSearchParams in a Suspense boundary for static rendering', () => {
    expect(page()).toContain('useSearchParams');
    expect(page()).toContain('<Suspense');
  });

  it('performs zero client-side financial math', () => {
    expect(page()).not.toMatch(/parseFloat|Number\(|\+quantity|quantity\s*\*/);
    expect(page()).toContain('formatCurrency');
    expect(page()).toContain('formatQuantity');
    expect(page()).toContain('formatCivilDateDisplay');
  });

  it('sends provenance and decisions through the canonical imports endpoints', () => {
    expect(page()).toContain('/api/v1/portfolios/${activePortfolioId}/imports/preview');
    expect(page()).toContain('/api/v1/portfolios/${activePortfolioId}/imports/confirm');
    expect(page()).toContain("sourceType: 'GENERIC_CSV'");
  });

  it('renders PT copy with all six canonical row statuses', () => {
    for (const label of [
      'Pronta',
      'Duplicada',
      'Ativo ambíguo',
      'Inválida',
      'Não suportada',
      'Precisa de revisão',
    ]) {
      expect(page()).toContain(label);
    }
    expect(page()).toContain('Importar carteira');
    expect(page()).toContain('Importação concluída');
    expect(page()).toContain('Nada é lançado sem a sua confirmação');
  });

  it('offers skip, asset override and account override decisions per row', () => {
    expect(page()).toContain('Ignorar');
    expect(page()).toContain('Selecionar ativo');
    expect(page()).toContain('Selecionar conta');
    expect(page()).toContain('Baixar modelo CSV');
  });

  it('renders PT operation labels for trades, custody moves and income', () => {
    expect(page()).toContain('Compra');
    expect(page()).toContain('Venda');
    expect(page()).toContain('Transferência (entrada)');
    expect(page()).toContain('Transferência (saída)');
    // Phase 5O-A: importable income rows use canonical income vocabulary.
    expect(page()).toContain('Dividendo');
    expect(page()).toContain('JCP');
    expect(page()).toContain('Rendimento FII');
  });

  it('exposes the hub from the portfolio operations tab without touching canonical nav', () => {
    const portfolio = readWeb('apps/web/src/app/(app)/portfolio/page.tsx');
    expect(portfolio).toContain('/portfolio/import?portfolioId=');
    // Phase 5N: entry point renamed to the product surface "Importar / Conectar".
    expect(portfolio).toContain('Importar / Conectar');
  });

  it('derives confirmation eligibility from effective user decisions, not server summary', () => {
    const page = readWeb('apps/web/src/app/(app)/portfolio/import/page.tsx');
    expect(page).toContain('getConfirmEligibility');
    expect(page).toContain('getEffectiveRowState');
    expect(page).not.toMatch(/disabled=\{[^}]*preview\.summary\.ready === 0/);
    expect(page).toContain('eligibility.canConfirm');
    expect(page).toContain('eligibility.hint');
    expect(page).toContain('Será importada');
    expect(page).toContain('Importar mesmo assim');

    const helper = readWeb('apps/web/src/lib/import-review.ts');
    expect(helper).toContain('Nenhuma operação será importada');
    expect(helper).toContain('Resolva ou ignore');
  });
});
