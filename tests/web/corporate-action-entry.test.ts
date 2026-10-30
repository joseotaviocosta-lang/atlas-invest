import { describe, expect, it } from 'vitest';
import {
  CORPORATE_ACTION_TYPE_LABELS,
  CORPORATE_ACTION_TYPE_OPTIONS,
  describeCorporateActionLeg,
  validateCorporateActionDraft,
} from '@/lib/corporate-action-entry';

describe('Corporate action entry helpers', () => {
  it('exposes only the split whitelist with pt-BR labels', () => {
    expect(CORPORATE_ACTION_TYPE_OPTIONS.map((o) => o.value).sort()).toEqual([
      'REVERSE_SPLIT',
      'SPLIT',
    ]);
    expect(CORPORATE_ACTION_TYPE_LABELS.SPLIT).toBe('Desdobramento');
    expect(CORPORATE_ACTION_TYPE_LABELS.REVERSE_SPLIT).toBe('Grupamento');
  });

  it('validates drafts without any financial math', () => {
    const base = {
      assetId: 'asset-1',
      type: 'REVERSE_SPLIT' as const,
      tradeDate: '2025-04-15',
      factor: '40',
      notes: 'Telefônica Brasil — grupamento 40:1.',
    };
    expect(validateCorporateActionDraft(base)).toBeNull();
    expect(validateCorporateActionDraft({ ...base, assetId: '' })).toContain('ativo');
    expect(validateCorporateActionDraft({ ...base, type: 'BONUS' as never })).toContain('Tipo');
    expect(validateCorporateActionDraft({ ...base, tradeDate: '15/04/2025' })).toContain(
      'AAAA-MM-DD',
    );
    expect(validateCorporateActionDraft({ ...base, factor: '0' })).toContain('maior que zero');
    expect(validateCorporateActionDraft({ ...base, factor: '-40' })).toContain('maior que zero');
    expect(validateCorporateActionDraft({ ...base, factor: '1' })).toContain('não pode ser 1');
    expect(validateCorporateActionDraft({ ...base, factor: '1.00' })).toContain('não pode ser 1');
    expect(validateCorporateActionDraft({ ...base, notes: '  ' })).toContain('evidência');
  });

  it('describes legs from server strings only', () => {
    expect(describeCorporateActionLeg('REVERSE_SPLIT', '40', '200', '5')).toBe(
      'Grupamento 200 ÷ 40 = 5',
    );
    expect(describeCorporateActionLeg('SPLIT', '80', '5', '400')).toBe(
      'Desdobramento 5 × 80 = 400',
    );
    expect(describeCorporateActionLeg('SPLIT', '80', null, null)).toBe('Desdobramento');
  });
});
