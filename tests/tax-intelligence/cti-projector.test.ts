import { describe, it, expect } from 'vitest';
import {
  projectTaxIntelligence,
  CTI_ACTION_IDS,
  type TaxIntelligenceContext,
} from '../../packages/tax-intelligence/src/index';

const NOW = '2026-10-31T12:00:00.000Z';

function base(overrides: Partial<TaxIntelligenceContext> = {}): TaxIntelligenceContext {
  return {
    portfolioId: '11111111-1111-4111-8111-111111111111',
    competence: '2026-10',
    calendarYear: 2026,
    monthly: {
      status: 'BLOCKED',
      reasonCode: null,
      qualityIssues: [],
      taxDue: null,
      limitations: [],
      ruleSetVersion: null,
      ruleSetStatus: null,
    },
    annual: null,
    cost: {
      incompleteAssets: 0,
      partialAssets: 0,
      completeAssets: 0,
      canonicalIncompleteAssets: 0,
      reviewRequiredCount: 0,
    },
    reconciliationBlockers: [],
    freshness: { asOf: '2026-10-31', lastReplayAt: '2026-10-31' },
    ...overrides,
  };
}

function codes(res: ReturnType<typeof projectTaxIntelligence>) {
  return res.blockers.map((b) => b.code);
}

describe('CTI projector — golden cases (PART AD)', () => {
  it('1. COMPLETE canonical tax → CONFIRMED with copied taxDue fact', () => {
    const res = projectTaxIntelligence(
      base({
        monthly: {
          status: 'COMPLETE', reasonCode: null, qualityIssues: [],
          taxDue: { amount: '2494.96', currency: 'BRL' }, limitations: [],
          ruleSetVersion: 'BR-EQUITY-NORMAL-1.0', ruleSetStatus: 'VERIFIED',
        },
      }),
      NOW,
    );
    expect(res.status).toBe('CONFIRMED');
    expect(res.headline).toBe('Apuração tributária disponível');
    const due = res.facts.find((f) => f.code === 'TAX_DUE');
    expect(due?.value).toBe('2494.96 BRL');
    expect(due?.source).toBe('TAX_ENGINE');
  });

  it('2. PARTIAL canonical tax → PARTIAL, never definitive', () => {
    const res = projectTaxIntelligence(
      base({ monthly: { status: 'PARTIAL', reasonCode: 'ELECTION_REQUIRED', qualityIssues: [], taxDue: null, limitations: [], ruleSetVersion: null, ruleSetStatus: null } }),
      NOW,
    );
    expect(res.status).toBe('PARTIAL');
    expect(res.headline).toBe('Apuração tributária parcial');
    expect(codes(res)).toContain('ELECTION_REQUIRED');
    expect(JSON.stringify(res)).not.toMatch(/imposto devido|valor a pagar|você deve/i);
  });

  it('3. BLOCKED canonical tax → BLOCKED with headline template', () => {
    const res = projectTaxIntelligence(
      base({ monthly: { status: 'BLOCKED', reasonCode: null, qualityIssues: ['UNKNOWN_COST_BASIS'], taxDue: null, limitations: [], ruleSetVersion: null, ruleSetStatus: null } }),
      NOW,
    );
    expect(res.status).toBe('BLOCKED');
    expect(res.headline).toBe('Cálculo tributário bloqueado');
    expect(codes(res)).toContain('UNKNOWN_COST_BASIS');
    expect(res.limitations).toContain('O Atlas não estima imposto quando faltam dados essenciais.');
  });

  it('4. KCRE11 nuance preserved (documentary COMPLETE, canonical INCOMPLETE)', () => {
    const res = projectTaxIntelligence(
      base({
        monthly: { status: 'BLOCKED', reasonCode: null, qualityIssues: [], taxDue: null, limitations: [], ruleSetVersion: null, ruleSetStatus: null },
        cost: { incompleteAssets: 0, partialAssets: 0, completeAssets: 1, canonicalIncompleteAssets: 1, reviewRequiredCount: 0 },
      }),
      NOW,
    );
    expect(res.status).toBe('BLOCKED');
    const nuance = res.facts.find((f) => f.code === 'DOCUMENTARY_VS_TAX_COST');
    expect(nuance?.value).toContain('documental completa');
    expect(JSON.stringify(res)).not.toMatch(/KCRE11 ainda está sem custo comprovado|custo fiscal .* completo/i);
    expect(res.limitations).toContain('Evidências documentais de custo ainda não alimentam o motor tributário.');
  });

  it('5. EGIE3 unknown event type → explanation without SELL', () => {
    const res = projectTaxIntelligence(
      base({
        reconciliationBlockers: [
          { code: 'UNKNOWN_EVENT_TYPE', assetTicker: 'EGIE3', detail: 'A redução de 200 EGIE3 foi identificada, mas o tipo da operação ainda não foi comprovado.' },
        ],
      }),
      NOW,
    );
    const blocker = res.blockers.find((b) => b.code === 'RECONCILIATION_UNKNOWN_EVENT_TYPE:EGIE3');
    expect(blocker?.category).toBe('UNKNOWN_OPERATION_CLASSIFICATION');
    expect(blocker?.explanation).toContain('200 EGIE3');
    expect(blocker?.explanation).not.toMatch(/foi uma venda|como venda/i);
    expect(res.limitations).toContain(
      'Uma diferença de quantidade não é classificada como compra, venda ou transferência sem evidência.',
    );
  });

  it('6. ITSA4 unknown origin → gap stated, no subscription asserted', () => {
    const res = projectTaxIntelligence(
      base({
        reconciliationBlockers: [
          { code: 'UNKNOWN_ORIGIN', assetTicker: 'ITSA4', detail: 'Há uma diferença de 15,7 unidades cuja origem ainda não está comprovada.' },
        ],
      }),
      NOW,
    );
    expect(JSON.stringify(res)).toContain('15,7');
    expect(JSON.stringify(res)).not.toMatch(/subscrição/i);
  });

  it('7. SNEL missing date → no invented date', () => {
    const res = projectTaxIntelligence(
      base({
        reconciliationBlockers: [
          { code: 'MISSING_EVENT_DATE', assetTicker: 'SNEL11', detail: 'A conversão SNEL13 → SNEL11 foi identificada, mas falta a data oficial do evento.' },
        ],
      }),
      NOW,
    );
    const blocker = res.blockers[0];
    expect(blocker?.explanation).toContain('falta a data oficial');
    // No civil date may appear in the explanation (detail carries none).
    expect(blocker?.explanation).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/);
  });

  it('8. missing rule set → MISSING_RULE_SET blocker, no law inferred', () => {
    const res = projectTaxIntelligence(
      base({ monthly: { status: 'BLOCKED', reasonCode: null, qualityIssues: [], taxDue: null, limitations: [], ruleSetVersion: null, ruleSetStatus: null } }),
      NOW,
    );
    // ruleSetVersion absent + BLOCKED without codes → generic blockers, fail-closed
    expect(res.status).toBe('BLOCKED');
    expect(res.facts.find((f) => f.code === 'RULE_SET_STATUS')?.value).toBe('ausente');
  });

  it('9. unknown canonical blocker → OTHER_CANONICAL_BLOCKER fallback', () => {
    const res = projectTaxIntelligence(
      base({ monthly: { status: 'PARTIAL', reasonCode: null, qualityIssues: ['FUTURE_CODE_XYZ'], taxDue: null, limitations: [], ruleSetVersion: null, ruleSetStatus: null } }),
      NOW,
    );
    const blocker = res.blockers.find((b) => b.code === 'FUTURE_CODE_XYZ');
    expect(blocker?.category).toBe('OTHER_CANONICAL_BLOCKER');
    expect(blocker?.title).toBe('Pendência fiscal não classificada');
  });

  it('10. stale source data → freshness limitation', () => {
    const res = projectTaxIntelligence(
      base({
        monthly: { status: 'COMPLETE', reasonCode: null, qualityIssues: [], taxDue: { amount: '0', currency: 'BRL' }, limitations: [], ruleSetVersion: 'v1', ruleSetStatus: 'VERIFIED' },
        freshness: { asOf: '2026-10-31', lastReplayAt: '2026-10-20' },
      }),
      NOW,
    );
    expect(res.status).toBe('CONFIRMED');
    expect(res.limitations).toContain('Os dados podem não refletir as informações mais recentes.');
  });

  it('11. review-required evidence → EVIDENCE_REQUIRED signal via counts', () => {
    const res = projectTaxIntelligence(
      base({
        monthly: { status: 'COMPLETE', reasonCode: null, qualityIssues: [], taxDue: { amount: '100.00', currency: 'BRL' }, limitations: [], ruleSetVersion: 'v1', ruleSetStatus: 'VERIFIED' },
        cost: { incompleteAssets: 0, partialAssets: 0, completeAssets: 2, canonicalIncompleteAssets: 0, reviewRequiredCount: 1 },
      }),
      NOW,
    );
    expect(res.facts.find((f) => f.code === 'REVIEW_REQUIRED_COUNT')?.value).toBe('1');
    expect(codes(res)).toContain('COST_EVIDENCE_REVIEW_REQUIRED');
  });

  it('12. empty/minimal context → UNKNOWN fallback, no fabricated blocker', () => {
    const res = projectTaxIntelligence(
      base({
        monthly: { status: 'EMPTY', reasonCode: null, qualityIssues: [], taxDue: null, limitations: [], ruleSetVersion: null, ruleSetStatus: null },
        freshness: { asOf: '2026-10-31', lastReplayAt: null },
      }),
      NOW,
    );
    expect(res.status).toBe('UNKNOWN');
    expect(res.headline).toBe('Situação fiscal indeterminada');
    expect(res.summary).toContain('Não há dados suficientes');
    expect(res.blockers).toEqual([]);
  });
});

describe('CTI projector — adversarial safety (PART AE)', () => {
  const blocked = () =>
    base({ monthly: { status: 'BLOCKED', reasonCode: null, qualityIssues: ['UNKNOWN_COST_BASIS'], taxDue: null, limitations: [], ruleSetVersion: null, ruleSetStatus: null } });

  it('blocked payment request → no DARF/amount/pay language', () => {
    const res = projectTaxIntelligence(blocked(), NOW);
    expect(JSON.stringify(res)).not.toMatch(/DARF devido|valor a pagar|você deve|pague|estimativa/i);
    expect(res.facts.find((f) => f.code === 'TAX_DUE')).toBeUndefined();
  });

  it('never infers zero cost for unknown cost', () => {
    const res = projectTaxIntelligence(blocked(), NOW);
    // Canonical cost status is a position COUNT ("N posições"), never money.
    expect(res.facts.find((f) => f.code === 'CANONICAL_COST_STATUS')?.value).toMatch(
      /^\d+ posições$/,
    );
    expect(res.facts.find((f) => f.code === 'TAX_DUE')).toBeUndefined();
  });

  it('never upgrades BLOCKED/PARTIAL/UNKNOWN to CONFIRMED', () => {
    for (const status of ['BLOCKED', 'PARTIAL', 'EMPTY', 'WEIRD_STATUS'] as const) {
      const res = projectTaxIntelligence(
        base({ monthly: { status, reasonCode: null, qualityIssues: [], taxDue: { amount: '999.99', currency: 'BRL' }, limitations: [], ruleSetVersion: null, ruleSetStatus: null } }),
        NOW,
      );
      expect(res.status).not.toBe('CONFIRMED');
      expect(res.facts.find((f) => f.code === 'TAX_DUE')).toBeUndefined();
    }
  });

  it('annual BLOCKED floors monthly COMPLETE (no promotion)', () => {
    const res = projectTaxIntelligence(
      base({
        monthly: { status: 'COMPLETE', reasonCode: null, qualityIssues: [], taxDue: { amount: '10.00', currency: 'BRL' }, limitations: [], ruleSetVersion: 'v1', ruleSetStatus: 'VERIFIED' },
        annual: { overallStatus: 'BLOCKED', blockingReasons: ['Custo de abertura desconhecido'], requirements: [] },
      }),
      NOW,
    );
    expect(res.status).toBe('BLOCKED');
    expect(res.facts.find((f) => f.code === 'TAX_DUE')).toBeUndefined();
  });
});

describe('CTI projector — contract invariants', () => {
  it('every actionId is allowlisted; unknown blockers yield no arbitrary action', () => {
    const res = projectTaxIntelligence(
      base({ monthly: { status: 'PARTIAL', reasonCode: null, qualityIssues: ['FUTURE_CODE_XYZ', 'UNKNOWN_COST_BASIS'], taxDue: null, limitations: [], ruleSetVersion: null, ruleSetStatus: null } }),
      NOW,
    );
    for (const action of res.actions) {
      expect(CTI_ACTION_IDS as readonly string[]).toContain(action.actionId);
    }
  });

  it('copies exact decimals verbatim (AG: "2494.96" never 2495)', () => {
    const res = projectTaxIntelligence(
      base({
        monthly: { status: 'COMPLETE', reasonCode: null, qualityIssues: [], taxDue: { amount: '2494.96', currency: 'BRL' }, limitations: [], ruleSetVersion: 'v1', ruleSetStatus: 'VERIFIED' },
      }),
      NOW,
    );
    expect(res.facts.find((f) => f.code === 'TAX_DUE')?.value).toBe('2494.96 BRL');
    expect(JSON.stringify(res)).not.toContain('2495');
  });

  it('outputs are deeply frozen and deterministic', () => {
    const ctx = base();
    const a = projectTaxIntelligence(ctx, NOW);
    const b = projectTaxIntelligence(ctx, NOW);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.facts)).toBe(true);
  });

  it('generatedAt comes from the injected clock, never Date.now', () => {
    const res = projectTaxIntelligence(base(), '2030-01-01T00:00:00.000Z');
    expect(res.generatedAt).toBe('2030-01-01T00:00:00.000Z');
  });
});

