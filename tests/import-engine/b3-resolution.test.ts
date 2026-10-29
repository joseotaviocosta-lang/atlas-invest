import { describe, it, expect } from 'vitest';
import {
  inferB3Asset,
  normalizeB3InstitutionName,
  matchAccountForB3Institution,
} from '../../packages/import-engine/src';

describe('B3 Import Auto-Resolution: Assets & Institutions', () => {
  describe('inferB3Asset', () => {
    it('resolves known equities from the catalog', () => {
      const itsa4 = inferB3Asset('ITSA4');
      expect(itsa4).not.toBeNull();
      expect(itsa4?.ticker).toBe('ITSA4');
      expect(itsa4?.name).toBe('Itaúsa PN');
      expect(itsa4?.type).toBe('STOCK');
      expect(itsa4?.currency).toBe('BRL');
      expect(itsa4?.exchange).toBe('BVMF');

      const jhsf3 = inferB3Asset('JHSF3');
      expect(jhsf3).not.toBeNull();
      expect(jhsf3?.type).toBe('STOCK');

      const bbas3 = inferB3Asset('BBAS3');
      expect(bbas3).not.toBeNull();
      expect(bbas3?.type).toBe('STOCK');
    });

    it('resolves known FIIs, Fiagros and ETFs from the catalog', () => {
      const irim11 = inferB3Asset('IRIM11');
      expect(irim11).not.toBeNull();
      expect(irim11?.name).toContain('Iridium');
      expect(irim11?.type).toBe('FII');

      const snag11 = inferB3Asset('SNAG11');
      expect(snag11).not.toBeNull();
      expect(snag11?.type).toBe('FII');

      const bova11 = inferB3Asset('BOVA11');
      expect(bova11).not.toBeNull();
      expect(bova11?.type).toBe('ETF');
    });

    it('resolves known BDRs from the catalog', () => {
      const roxo34 = inferB3Asset('ROXO34');
      expect(roxo34).not.toBeNull();
      expect(roxo34?.name).toContain('Nu Holdings');
      expect(roxo34?.type).toBe('BDR');
    });

    it('returns null for unknown or fictional tickers not in catalog (ADR-238 fail-closed)', () => {
      expect(inferB3Asset('ZZZZ4')).toBeNull();
      expect(inferB3Asset('ABCD3')).toBeNull();
      expect(inferB3Asset('ZZZZ11')).toBeNull();
      expect(inferB3Asset('TEST34')).toBeNull();
    });

    it('returns null for malformed or non-B3 tickers', () => {
      expect(inferB3Asset('')).toBeNull();
      expect(inferB3Asset('INVALID_TICKER_123')).toBeNull();
      expect(inferB3Asset('12345')).toBeNull();
    });
  });

  describe('normalizeB3InstitutionName', () => {
    it('normalizes XP Investimentos variants', () => {
      expect(normalizeB3InstitutionName('XP INVESTIMENTOS CCTVM S/A.')).toBe('XP Investimentos');
      expect(normalizeB3InstitutionName('XP INVESTIMENTOS CCTVM S/A')).toBe('XP Investimentos');
      expect(normalizeB3InstitutionName('XP INVESTIMENTOS')).toBe('XP Investimentos');
      expect(normalizeB3InstitutionName('XP')).toBe('XP Investimentos');
    });

    it('normalizes NuInvest / Nubank variants', () => {
      expect(normalizeB3InstitutionName('NU INVESTIMENTOS S.A. - CTVM')).toBe('Nubank / NuInvest');
      expect(normalizeB3InstitutionName('NU INVEST')).toBe('Nubank / NuInvest');
      expect(normalizeB3InstitutionName('NUBANK')).toBe('Nubank / NuInvest');
      expect(normalizeB3InstitutionName('EASYNVEST')).toBe('Nubank / NuInvest');
    });

    it('normalizes other major Brazilian brokers', () => {
      expect(normalizeB3InstitutionName('CLEAR CORRETORA - GRUPO XP')).toBe('Clear Corretora');
      expect(normalizeB3InstitutionName('RICO INVESTIMENTOS - GRUPO XP')).toBe('Rico Investimentos');
      expect(normalizeB3InstitutionName('BTG PACTUAL CTVM S.A.')).toBe('BTG Pactual');
      expect(normalizeB3InstitutionName('INTER DTVM LTDA')).toBe('Inter DTVM');
    });

    it('returns trimmed string for unknown institution without crashing', () => {
      expect(normalizeB3InstitutionName('  CORRETORA REGIONAL LTDA  ')).toBe(
        'CORRETORA REGIONAL LTDA',
      );
    });
  });

  describe('matchAccountForB3Institution', () => {
    const catalog = [
      { id: 'inst-xp', name: 'XP Investimentos' },
      { id: 'inst-nu', name: 'Nubank / NuInvest' },
    ];

    it('returns NOT_FOUND when portfolio has 0 accounts', () => {
      const match = matchAccountForB3Institution('XP INVESTIMENTOS CCTVM S/A.', [], catalog);
      expect(match.resolution).toBe('NOT_FOUND');
      expect(match.normalizedInstitution).toBe('XP Investimentos');
      expect(match.matchedInstitutionId).toBe('inst-xp');
      expect(match.account).toBeNull();
    });

    it('auto-resolves single matching account by institutionId', () => {
      const accounts = [
        { id: 'acc-xp', name: 'Minha Conta XP', institutionId: 'inst-xp' },
        { id: 'acc-nu', name: 'Minha Conta Nu', institutionId: 'inst-nu' },
      ];
      const match = matchAccountForB3Institution('XP INVESTIMENTOS CCTVM S/A.', accounts, catalog);
      expect(match.resolution).toBe('RESOLVED');
      expect(match.account?.id).toBe('acc-xp');
    });

    it('auto-resolves single matching account by name when institutionId is unset', () => {
      const accounts = [
        { id: 'acc-xp-2', name: 'XP Investimentos' },
        { id: 'acc-nu-2', name: 'Nubank' },
      ];
      const match = matchAccountForB3Institution('XP INVESTIMENTOS CCTVM S/A.', accounts);
      expect(match.resolution).toBe('RESOLVED');
      expect(match.account?.id).toBe('acc-xp-2');
    });

    it('returns AMBIGUOUS when portfolio has multiple accounts for the same institution', () => {
      const accounts = [
        { id: 'acc-xp-1', name: 'XP Conta 1', institutionId: 'inst-xp' },
        { id: 'acc-xp-2', name: 'XP Conta 2', institutionId: 'inst-xp' },
      ];
      const match = matchAccountForB3Institution('XP INVESTIMENTOS CCTVM S/A.', accounts, catalog);
      expect(match.resolution).toBe('AMBIGUOUS');
      expect(match.account).toBeNull();
      expect(match.candidates).toHaveLength(2);
    });
  });
});
