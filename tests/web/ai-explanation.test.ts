import { describe, it, expect } from 'vitest';
import { mapToPortfolioAiExplanationVM } from '@atlas/ui';

const PAGE = 'apps/web/src/app/(app)/ai/page.tsx';
const VM = 'packages/ui/src/view-models/portfolio-ai-explanation.view-model.ts';

describe('Web AI Explanation experience (Phase 3R)', () => {
  it('IA tab has question input, starter questions and evidence/limitations sections', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(c).toContain('Pergunte sobre sua carteira');
    expect(c).toContain('Como foi o desempenho da minha carteira no período?');
    expect(c).toContain('Como minha carteira se compara ao Ibovespa?');
    expect(c).toContain('Explique o risco histórico da minha carteira.');
    expect(c).toContain('O que significa o cenário de queda de 10%?');
    expect(c).toContain('Há dados incompletos na minha carteira?');
    expect(c).toContain('Dados usados nesta resposta');
    expect(c).toContain('Limitações dos dados');
    expect(c).toContain('/ai/explain');
    // No recommendation starters
    expect(c).not.toMatch(/O que devo comprar|está barata|O que devo vender/i);
  });

  it('shows unsupported and provider-error states without implying ledger failure', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(c).toContain('Não suportado');
    expect(c).toContain('Não foi possível gerar a explicação agora');
  });

  it('performs no financial math and never touches provider keys', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const page = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    const vm = fs.readFileSync(path.join(process.cwd(), VM), 'utf8');
    expect(page).not.toMatch(/from ['"]openai['"]/i);
    expect(page).not.toMatch(/OPENAI_API_KEY/);
    for (const code of [page, vm]) {
      expect(code).not.toMatch(/Math\.pow|Math\.sqrt/);
      expect(code).not.toMatch(/parseFloat/);
      expect(code).not.toMatch(/Number\(/);
      expect(code).not.toMatch(
        /calculateSharpe|calculateBeta|calculateTWR|calculateAlpha|calculateVaR/,
      );
    }
    expect(vm).toContain('formatCurrency');
    expect(vm).toContain('formatPercentage');
  });

  it('maps ANSWERED dto to badges Historico/Hipotese and formatted values', () => {
    const vm = mapToPortfolioAiExplanationVM({
      schemaVersion: '1',
      status: 'ANSWERED',
      intent: 'EXPLAIN_RISK',
      answer: 'A volatilidade histórica no período foi X.',
      evidence: [
        {
          factId: 'BRL.RISK.VOLATILITY',
          category: 'RISK',
          metric: 'REALIZED_VOLATILITY_ANNUALIZED',
          scope: 'BRL',
          value: '16.5',
          unit: 'PERCENTAGE',
          nature: 'HISTORICAL',
          status: 'AVAILABLE',
        },
        {
          factId: 'BRL.SCENARIO.EQUITY_DOWN_10.STRESSED_VALUE',
          category: 'SCENARIO',
          metric: 'SCENARIO_STRESSED_VALUE',
          scope: 'BRL',
          value: '90000',
          unit: 'MONEY',
          nature: 'HYPOTHETICAL',
          status: 'AVAILABLE',
        },
      ],
      limitations: ['Dados parciais.'],
    });
    expect(vm.isAnswered).toBe(true);
    expect(vm.evidence[0]!.natureBadgeLabel).toBe('Histórico');
    expect(vm.evidence[1]!.natureBadgeLabel).toBe('Hipótese');
    expect(vm.evidence[0]!.valueFormatted).toContain('%');
    expect(vm.evidence[1]!.valueFormatted).toContain('90.000');
    expect(vm.hasLimitations).toBe(true);
  });

  it('maps UNSUPPORTED dto without evidence', () => {
    const vm = mapToPortfolioAiExplanationVM({
      schemaVersion: '1',
      status: 'UNSUPPORTED',
      intent: 'UNSUPPORTED_RECOMMENDATION',
      answer:
        'O Atlas pode explicar os dados da sua carteira, mas esta versão não recomenda compras, vendas ou rebalanceamentos.',
      evidence: [],
      limitations: [],
    });
    expect(vm.isUnsupported).toBe(true);
    expect(vm.hasEvidence).toBe(false);
  });
});
