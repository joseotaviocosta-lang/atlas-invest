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
