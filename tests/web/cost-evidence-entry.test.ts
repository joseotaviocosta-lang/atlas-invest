import { describe, expect, it } from 'vitest';
import {
  COST_EVIDENCE_TYPE_LABELS,
  COST_EVIDENCE_TYPE_OPTIONS,
  COST_EVIDENCE_STATUS_LABELS,
  COST_EVIDENCE_ASSESSMENT_LABELS,
  COST_EVIDENCE_TAX_MESSAGE,
  validateCostEvidenceDraft,
  normalizeDecimalField,
  buildCostEvidencePayload,
  getEvidenceRowViewState,
  shouldShowTaxCostDisclosure,
} from '@/lib/cost-evidence-entry';

describe('Cost evidence entry helpers', () => {
  it('exposes the five validated evidence types with pt-BR labels', () => {
    expect(COST_EVIDENCE_TYPE_OPTIONS.map((o) => o.value).sort()).toEqual([
      'ANNUAL_TAX_STATEMENT',
      'BROKERAGE_NOTE',
      'BROKER_STATEMENT',
      'MANUAL_DOCUMENTED',
      'OFFICIAL_POSITION_REPORT',
    ]);
    expect(COST_EVIDENCE_TYPE_LABELS.BROKERAGE_NOTE).toBe('Nota de corretagem');
    expect(COST_EVIDENCE_STATUS_LABELS.VERIFIED).toBe('Confirmada');
    expect(COST_EVIDENCE_ASSESSMENT_LABELS.PARTIAL).toBe('Cobertura parcial');
  });

  it('carries the tax-safety label (integration never implied)', () => {
    expect(COST_EVIDENCE_TAX_MESSAGE).toContain('bloqueado');
    expect(COST_EVIDENCE_TAX_MESSAGE).not.toContain('DARF');
  });

  it('validates draft shapes without any financial math', () => {
    const base = {
      evidenceType: 'BROKERAGE_NOTE',
      acquisitionDate: '2024-12-26',
      evidenceDate: '',
      quantityCovered: '120',
      unitCost: '8.50',
      totalCost: '1020.00',
      currency: 'BRL',
      sourceReference: 'XP-NOTA-2024-1234',
      notes: '',
    };
    expect(validateCostEvidenceDraft(base)).toBeNull();
    // Unit-only and total-only drafts are both acceptable (server derives).
    expect(validateCostEvidenceDraft({ ...base, totalCost: '' })).toBeNull();
    expect(validateCostEvidenceDraft({ ...base, unitCost: '' })).toBeNull();
    expect(validateCostEvidenceDraft({ ...base, evidenceType: 'GUESS' })).toContain('tipo');
    expect(validateCostEvidenceDraft({ ...base, acquisitionDate: '26/12/2024' })).toContain(
      'AAAA-MM-DD',
    );
    expect(validateCostEvidenceDraft({ ...base, quantityCovered: '0' })).toContain('maior que zero');
    expect(validateCostEvidenceDraft({ ...base, quantityCovered: '-5' })).toContain('maior que zero');
    expect(
      validateCostEvidenceDraft({ ...base, unitCost: '', totalCost: '' }),
    ).toContain('preço unitário ou o valor total');
    expect(validateCostEvidenceDraft({ ...base, unitCost: 'abc' })).toContain('inválido');
    expect(validateCostEvidenceDraft({ ...base, sourceReference: '   ' })).toContain('referência');
  });

  it('normalizes decimal fields and omits empty optionals from the payload', () => {
    expect(normalizeDecimalField(' 8,50 ')).toBe('8.50');
    const payload = buildCostEvidencePayload({
      evidenceType: 'BROKERAGE_NOTE',
      acquisitionDate: '2024-12-26',
      evidenceDate: '',
      quantityCovered: '120',
      unitCost: '8,50',
      totalCost: '',
      currency: 'BRL',
      sourceReference: ' XP-1 ',
      notes: '',
    });
    expect(payload).toEqual({
      evidenceType: 'BROKERAGE_NOTE',
      acquisitionDate: '2024-12-26',
      quantityCovered: '120',
      unitCost: '8.50',
      currency: 'BRL',
      sourceReference: 'XP-1',
    });
  });
});

describe('Cost evidence version currency (stale-action gating)', () => {
  const v1 = { id: 'ev-1', status: 'DRAFT', version: 1, supersedesId: null };
  const v2 = { id: 'ev-2', status: 'REVIEW_REQUIRED', version: 2, supersedesId: 'ev-1' };
  const v3 = { id: 'ev-3', status: 'VERIFIED', version: 3, supersedesId: 'ev-2' };

  it('Test 1 — current DRAFT exposes submit only', () => {
    const view = getEvidenceRowViewState(v1, [v1]);
    expect(view.isCurrent).toBe(true);
    expect(view.showSubmit).toBe(true);
    expect(view.showVerify).toBe(false);
    expect(view.showReject).toBe(false);
    expect(view.historicalLabel).toBeNull();
  });

  it('Test 2 — superseded DRAFT hides submit and labels history', () => {
    const view = getEvidenceRowViewState(v1, [v1, v2]);
    expect(view.isCurrent).toBe(false);
    expect(view.showSubmit).toBe(false);
    expect(view.showVerify).toBe(false);
    expect(view.showReject).toBe(false);
    expect(view.historicalLabel).toBe('Substituída pela v2');
  });

  it('Test 3 — current REVIEW_REQUIRED exposes verify + reject', () => {
    const view = getEvidenceRowViewState(v2, [v2]);
    expect(view.isCurrent).toBe(true);
    expect(view.showSubmit).toBe(false);
    expect(view.showVerify).toBe(true);
    expect(view.showReject).toBe(true);
    expect(view.historicalLabel).toBeNull();
  });

  it('Test 4 — superseded REVIEW_REQUIRED hides all actions and labels history', () => {
    const view = getEvidenceRowViewState(v2, [v1, v2, v3]);
    expect(view.isCurrent).toBe(false);
    expect(view.showSubmit).toBe(false);
    expect(view.showVerify).toBe(false);
    expect(view.showReject).toBe(false);
    expect(view.historicalLabel).toBe('Substituída pela v3');
  });

  it('Test 5 — current VERIFIED exposes no lifecycle actions', () => {
    const view = getEvidenceRowViewState(v3, [v3]);
    expect(view.isCurrent).toBe(true);
    expect(view.showSubmit).toBe(false);
    expect(view.showVerify).toBe(false);
    expect(view.showReject).toBe(false);
    expect(view.historicalLabel).toBeNull();
  });

  it('Test 6 — full KCRE11 chain: v3 acts, v1/v2 read-only, zero stale buttons', () => {
    const chain = [v1, v2, v3];
    const states = chain.map((row) => getEvidenceRowViewState(row, chain));
    expect(states.map((s) => s.isCurrent)).toEqual([false, false, true]);
    expect(states.map((s) => s.historicalLabel)).toEqual([
      'Substituída pela v2',
      'Substituída pela v3',
      null,
    ]);
    const staleButtons = states
      .filter((s) => !s.isCurrent)
      .reduce((count, s) => count + Number(s.showSubmit) + Number(s.showVerify) + Number(s.showReject), 0);
    expect(staleButtons).toBe(0);
    const currentButtons =
      Number(states[2]!.showSubmit) + Number(states[2]!.showVerify) + Number(states[2]!.showReject);
    expect(currentButtons).toBe(0);
  });

  it('treats rows without a listed successor as current (list-scoped currency)', () => {
    // Currency is decided within the listed set only; the section always
    // lists the full unfiltered chain, so this is exact in production.
    // Enforcement for any partial-view edge stays server-side (409).
    const orphan = { id: 'ev-9', status: 'DRAFT', version: 1, supersedesId: 'ev-0' };
    const view = getEvidenceRowViewState(orphan, [orphan]);
    expect(view.isCurrent).toBe(true);
    expect(view.historicalLabel).toBeNull();
  });
});

describe('Tax-cost disclosure gate (CTE-4, presentation only)', () => {
  const complete = {
    enrichmentEnabled: true,
    status: 'COMPLETE_WITH_VERIFIED_EVIDENCE',
    resolvedCost: { amount: '2494.96', currency: 'BRL' },
  };

  it('shows the block for complete resolutions under an enabled gate', () => {
    expect(shouldShowTaxCostDisclosure(complete)).toBe(true);
    expect(
      shouldShowTaxCostDisclosure({ ...complete, status: 'COMPLETE_LEDGER_ONLY' }),
    ).toBe(true);
  });

  it('hides the block when the gate is off, even with complete data', () => {
    expect(shouldShowTaxCostDisclosure({ ...complete, enrichmentEnabled: false })).toBe(false);
  });

  it('hides the block for partial/blocked/unknown states', () => {
    for (const status of ['PARTIAL', 'BLOCKED', 'UNKNOWN', null]) {
      expect(shouldShowTaxCostDisclosure({ ...complete, status })).toBe(false);
    }
  });

  it('hides the block without a resolved cost or without input', () => {
    expect(shouldShowTaxCostDisclosure({ ...complete, resolvedCost: null })).toBe(false);
    expect(shouldShowTaxCostDisclosure(null)).toBe(false);
    expect(shouldShowTaxCostDisclosure(undefined)).toBe(false);
  });
});
