import type { OfficialDarfDestination } from '@atlas/tax-engine';

/**
 * Phase 4F — official DARF generation authority & destination registry.
 *
 * Research (2026-09-29, full text inspected): the official generator for federal
 * DARFs is the RFB/SERPRO **SicalcWeb** (`sicalc.receita.fazenda.gov.br`), a
 * browser application. There is NO officially documented, supported programmatic
 * API for DARF generation under revenue code 6015 (the new RFB APIs cover only
 * CBS/RAD/PCONT, in beta, and are out of scope). Atlas therefore uses an explicit
 * `OFFICIAL_INTERACTIVE_HANDOFF`: it never generates the document and never calls
 * an undocumented browser endpoint as if it were a supported API
 * (ADR-284, ADR-285).
 */
export const OFFICIAL_DARF_DESTINATION: OfficialDarfDestination = Object.freeze({
  sourceSystem: 'RFB_SICALC',
  url: 'https://sicalc.receita.fazenda.gov.br/sicalc/principal',
  // No official prefill parameters are documented; never fabricate URL params.
  prefillSupported: false,
});

export const PRODUCTION_DARF_SUPPORTED_REVENUE_CODES: readonly string[] = Object.freeze(['6015']);

export const DARF_GENERATION_POLICY = Object.freeze({
  mode: 'OFFICIAL_INTERACTIVE_HANDOFF' as const,
  /** True only if an official supported programmatic API exists. */
  directOfficialApi: false,
  /** Sicalc requires the taxpayer to type CPF/date of birth and (some flows) a captcha. */
  captchaBypass: false,
  domAutomation: false,
  scraping: false,
  officialApi: false,
  reason:
    'No officially supported programmatic DARF-generation API exists for IRPF/ganhos líquidos (6015). ' +
    'The official generator is SicalcWeb (browser, captcha, taxpayer interaction).',
  sourceReference:
    'https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/pagamentos-e-parcelamentos/darf-calculo-e-impressao-programa-sicalc-1',
  verifiedAt: '2026-09-29',
});

/** Version of the handoff preparation semantics. */
export const DARF_GENERATION_VERSION = 'darf-generation-v1';
