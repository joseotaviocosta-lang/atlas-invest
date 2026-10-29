/**
 * Canonical reference catalog and type inference for B3 assets.
 * Used during import preview to automatically resolve and provision
 * canonical Asset metadata with ZERO financial transactions (ledger delta = 0).
 */

export interface B3ReferenceAsset {
  ticker: string;
  name: string;
  type: 'STOCK' | 'FII' | 'ETF' | 'BDR';
  currency: 'BRL';
  exchange: 'BVMF';
}

export const B3_REFERENCE_CATALOG: ReadonlyMap<string, B3ReferenceAsset> = new Map([
  // Equities (Stocks)
  ['ITSA4', { ticker: 'ITSA4', name: 'Itaúsa PN', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['ITSA3', { ticker: 'ITSA3', name: 'Itaúsa ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['JHSF3', { ticker: 'JHSF3', name: 'JHSF Participações ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['BBAS3', { ticker: 'BBAS3', name: 'Banco do Brasil ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['SAPR4', { ticker: 'SAPR4', name: 'Sanepar PN', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['SAPR3', { ticker: 'SAPR3', name: 'Sanepar ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['SAPR11', { ticker: 'SAPR11', name: 'Sanepar Unit', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['EZTC3', { ticker: 'EZTC3', name: 'EZTEC ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['HYPE3', { ticker: 'HYPE3', name: 'Hypera ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['FESA4', { ticker: 'FESA4', name: 'Ferbasa PN', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['SOJA3', { ticker: 'SOJA3', name: 'Boa Safra Sementes ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['STBP3', { ticker: 'STBP3', name: 'Santos Brasil ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['BRAP4', { ticker: 'BRAP4', name: 'Bradespar PN', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['PETR4', { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['PETR3', { ticker: 'PETR3', name: 'Petrobras ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['VALE3', { ticker: 'VALE3', name: 'Vale ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['ITUB4', { ticker: 'ITUB4', name: 'Itaú Unibanco PN', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['BBDC4', { ticker: 'BBDC4', name: 'Banco Bradesco PN', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['B3SA3', { ticker: 'B3SA3', name: 'B3 ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['WEGE3', { ticker: 'WEGE3', name: 'WEG ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['RENT3', { ticker: 'RENT3', name: 'Localiza ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['ABEV3', { ticker: 'ABEV3', name: 'Ambev ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['MGLU3', { ticker: 'MGLU3', name: 'Magazine Luiza ON', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['TAEE11', { ticker: 'TAEE11', name: 'Taesa Unit', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['KLBN11', { ticker: 'KLBN11', name: 'Klabin Unit', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['COGN3', { ticker: 'COGN3', name: 'Cogna Educação S.A.', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['EGIE3', { ticker: 'EGIE3', name: 'Engie Brasil Energia S.A.', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['FLRY3', { ticker: 'FLRY3', name: 'Fleury S.A.', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['IRBR3', { ticker: 'IRBR3', name: 'IRB - Brasil Resseguros S.A.', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['ISAE4', { ticker: 'ISAE4', name: 'ISA Energia Brasil S.A.', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['MRFG3', { ticker: 'MRFG3', name: 'Marfrig Global Foods S.A.', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['PRIO3', { ticker: 'PRIO3', name: 'PRIO S.A.', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['TUPY3', { ticker: 'TUPY3', name: 'Tupy S.A.', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['UNIP3', { ticker: 'UNIP3', name: 'Unipar Carbocloro S.A.', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['VIVT3', { ticker: 'VIVT3', name: 'Telefônica Brasil S.A.', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],
  ['WIZC3', { ticker: 'WIZC3', name: 'Wiz Co Participações S.A.', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' }],

  // Real Estate Funds (FIIs) & Fiagros
  ['IRIM11', { ticker: 'IRIM11', name: 'Iridium Recebíveis Imobiliários FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['SNAG11', { ticker: 'SNAG11', name: 'Suno Agro Fiagro', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['SNCI11', { ticker: 'SNCI11', name: 'Suno Recebíveis Imobiliários FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['SNEL11', { ticker: 'SNEL11', name: 'Suno Energias Limpas FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['SNEL13', { ticker: 'SNEL13', name: 'Suno Energias Limpas FII Recibo', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['SNFF11', { ticker: 'SNFF11', name: 'Suno Fundo de Fundos FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['SNFZ11', { ticker: 'SNFZ11', name: 'Suno Fazendas Fiagro', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['VGIP11', { ticker: 'VGIP11', name: 'Valora CRI CDI FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['BRCR11', { ticker: 'BRCR11', name: 'BC Fund FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['HGLG11', { ticker: 'HGLG11', name: 'CSHG Logística FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['KNRI11', { ticker: 'KNRI11', name: 'Kinea Renda Imobiliária FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['MALL11', { ticker: 'MALL11', name: 'Genial Malls FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['MXRF11', { ticker: 'MXRF11', name: 'Maxi Renda FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['RBRP11', { ticker: 'RBRP11', name: 'RBR Properties FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['SNID11', { ticker: 'SNID11', name: 'Suno Infra FI-Infra', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['MCCI11', { ticker: 'MCCI11', name: 'Mauá Capital Recebíveis FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['KCRE11', { ticker: 'KCRE11', name: 'Kinea Crédito Real FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['XPLG11', { ticker: 'XPLG11', name: 'XP Log FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['VISC11', { ticker: 'VISC11', name: 'Vinci Shopping Centers FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['XPML11', { ticker: 'XPML11', name: 'XP Malls FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['KNCR11', { ticker: 'KNCR11', name: 'Kinea Rendimentos Imobiliários FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['CPTS11', { ticker: 'CPTS11', name: 'Capitânia Securities FII', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],
  ['BTAG11', { ticker: 'BTAG11', name: 'BTG Agro Fiagro', type: 'FII', currency: 'BRL', exchange: 'BVMF' }],

  // ETFs
  ['BOVA11', { ticker: 'BOVA11', name: 'iShares Ibovespa Fundo de Índice', type: 'ETF', currency: 'BRL', exchange: 'BVMF' }],
  ['IVVB11', { ticker: 'IVVB11', name: 'iShares S&P 500 Fundo de Índice', type: 'ETF', currency: 'BRL', exchange: 'BVMF' }],
  ['SMAL11', { ticker: 'SMAL11', name: 'iShares Small Cap Fundo de Índice', type: 'ETF', currency: 'BRL', exchange: 'BVMF' }],
  ['HASH11', { ticker: 'HASH11', name: 'Hashdex Nasdaq Crypto Index ETF', type: 'ETF', currency: 'BRL', exchange: 'BVMF' }],

  // BDRs
  ['ROXO34', { ticker: 'ROXO34', name: 'Nu Holdings BDR', type: 'BDR', currency: 'BRL', exchange: 'BVMF' }],
  ['AAPL34', { ticker: 'AAPL34', name: 'Apple BDR', type: 'BDR', currency: 'BRL', exchange: 'BVMF' }],
  ['MSFT34', { ticker: 'MSFT34', name: 'Microsoft BDR', type: 'BDR', currency: 'BRL', exchange: 'BVMF' }],
  ['NVDA34', { ticker: 'NVDA34', name: 'Nvidia BDR', type: 'BDR', currency: 'BRL', exchange: 'BVMF' }],
  ['AMZO34', { ticker: 'AMZO34', name: 'Amazon BDR', type: 'BDR', currency: 'BRL', exchange: 'BVMF' }],
  ['GOGL34', { ticker: 'GOGL34', name: 'Alphabet BDR', type: 'BDR', currency: 'BRL', exchange: 'BVMF' }],
]);

/**
 * Checks if a ticker can be resolved from the authoritative B3 reference catalog.
 * Returns null if the ticker is unknown, requiring human review or batch mapping (ADR-238).
 */
export function inferB3Asset(rawTicker: string): B3ReferenceAsset | null {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) return null;

  return B3_REFERENCE_CATALOG.get(ticker) ?? null;
}
