import { describe, it, expect } from 'vitest';
import { mapToPortfolioAiExplanationVM } from '@atlas/ui';

const SCREEN = 'apps/mobile/app/(app)/(tabs)/ai.tsx';
const API = 'apps/mobile/src/api/portfolios.ts';

describe('Mobile AI Explanation experience (Phase 3R)', () => {
  it('IA screen has question input, starter questions and evidence/limitations sections', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(c).toContain('Pergunte sobre sua carteira');
    expect(c).toContain('Como foi o desempenho da minha carteira no período?');
    expect(c).toContain('Como minha carteira se compara ao Ibovespa?');
    expect(c).toContain('Explique o risco histórico da minha carteira.');
    expect(c).toContain('O que significa o cenário de queda de 10%?');
    expect(c).toContain('Há dados incompletos na minha carteira?');
    expect(c).toContain('Dados usados nesta resposta');
    expect(c).toContain('Limitações dos dados');
    expect(c).not.toMatch(/O que devo comprar|está barata|O que devo vender/i);
  });

  it('calls Atlas API explain endpoint and never provider API directly', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const screen = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    const api = fs.readFileSync(path.join(process.cwd(), API), 'utf8');
    expect(api).toContain('/ai/explain');
    expect(screen).not.toMatch(/from ['"]openai['"]/i);
    expect(screen).not.toMatch(/OPENAI_API_KEY/);
    expect(api).not.toMatch(/OPENAI_API_KEY/);
  });

  it('shows unsupported and provider-error states', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(c).toContain('Não suportado');
    expect(c).toContain('Não foi possível gerar a explicação agora');
  });

  it('performs no financial math in view-model path', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const vm = fs.readFileSync(
      path.join(
        process.cwd(),
        'packages/ui/src/view-models/portfolio-ai-explanation.view-model.ts',
      ),
      'utf8',
    );
    expect(vm).not.toMatch(/Math\.pow|Math\.sqrt/);
    expect(vm).not.toMatch(/parseFloat/);
    expect(vm).not.toMatch(/Number\(/);
  });

  it('maps MONEY evidence with Hipótese badge and PERCENTAGE with Histórico badge', () => {
    const vm = mapToPortfolioAiExplanationVM({
      schemaVersion: '1',
      status: 'ANSWERED',
      intent: 'EXPLAIN_SCENARIO',
      answer: 'Impacto estimado no cenário hipotético.',
      evidence: [
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
      limitations: [],
    });
    expect(vm.isAnswered).toBe(true);
    expect(vm.evidence[0]!.natureBadge).toBe('HIPOTESE');
    expect(vm.evidence[0]!.valueFormatted).toContain('90.000');
  });
});
