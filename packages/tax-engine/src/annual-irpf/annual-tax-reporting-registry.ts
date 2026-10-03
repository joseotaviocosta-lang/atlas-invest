import { AnnualTaxReportingSection, ReportingCategoryStatus } from './annual-tax-reporting';

export interface ReportingRuleMapping {
  readonly category: string;
  readonly section: AnnualTaxReportingSection;
  readonly officialCode: string;
  readonly officialLabel: string;
  readonly defaultStatus: ReportingCategoryStatus;
  readonly regulatoryBasis: string;
  readonly version: string;
}

export class AnnualTaxReportingRuleRegistry {
  private static readonly RULES: ReadonlyArray<ReportingRuleMapping> = [
    // BENS E DIREITOS
    {
      category: 'ACOES_BENS_E_DIREITOS',
      section: 'BENS_E_DIREITOS',
      officialCode: '03-01',
      officialLabel: 'Bens e Direitos - Grupo 03 (Participações Societárias) Código 01 (Ações)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'Instrução Normativa RFB / Manual PGD IRPF',
      version: '2026.1',
    },
    {
      category: 'FII_BENS_E_DIREITOS',
      section: 'BENS_E_DIREITOS',
      officialCode: '07-03',
      officialLabel: 'Bens e Direitos - Grupo 07 (Fundos) Código 03 (FII)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'Instrução Normativa RFB / Manual PGD IRPF',
      version: '2026.1',
    },
    {
      category: 'POSICAO_ALIENADA_BENS_E_DIREITOS',
      section: 'BENS_E_DIREITOS',
      officialCode: '03-01',
      officialLabel: 'Bens e Direitos - Posição Alienada Totalmente (Saldo Final R$ 0,00)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'Instrução Normativa RFB / Perguntas e Respostas RFB',
      version: '2026.1',
    },

    // RENDIMENTOS ISENTOS
    {
      category: 'DIVIDENDOS_ISENTOS_ORDINARIOS',
      section: 'RENDIMENTOS_ISENTOS',
      officialCode: '09',
      officialLabel:
        'Rendimentos Isentos e Não Tributáveis - Código 09 (Lucros e dividendos recebidos)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'Lei nº 9.249/1995, art. 10',
      version: '2026.1',
    },
    {
      category: 'DIVIDENDOS_ISENTOS_TRANSICAO',
      section: 'RENDIMENTOS_ISENTOS',
      officialCode: '09',
      officialLabel:
        'Rendimentos Isentos - Código 09 (Dividendos Transição Pré-2026 - Lei 15.270/2025)',
      defaultStatus: 'PROVISIONAL',
      regulatoryBasis: 'Lei nº 15.270/2025',
      version: '2026.1',
    },
    {
      category: 'FII_RENDIMENTOS_ISENTOS',
      section: 'RENDIMENTOS_ISENTOS',
      officialCode: '26',
      officialLabel:
        'Rendimentos Isentos e Não Tributáveis - Código 26 (Outros - Rendimentos de FII Isentos)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'Lei nº 8.668/1993 e Lei nº 14.754/2023',
      version: '2026.1',
    },
    {
      category: 'GANHO_ISENTO_ACOES_20K',
      section: 'RENDIMENTOS_ISENTOS',
      officialCode: '20',
      officialLabel:
        'Rendimentos Isentos - Código 20 (Ganhos líquidos em alienações de ações até R$ 20.000/mês)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'Lei nº 7.713/1988, art. 22',
      version: '2026.1',
    },

    // RENDIMENTOS EXCLUSIVOS / DEFINITIVOS
    {
      category: 'JCP_TRIBUTACAO_EXCLUSIVA',
      section: 'RENDIMENTOS_EXCLUSIVOS',
      officialCode: '10',
      officialLabel:
        'Rendimentos Sujeitos à Tributação Exclusiva/Definitiva - Código 10 (Juros sobre capital próprio)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'Lei nº 9.249/1995, art. 9º',
      version: '2026.1',
    },
    {
      category: 'DIVIDENDOS_TRIBUTADOS_2026',
      section: 'RENDIMENTOS_EXCLUSIVOS',
      officialCode: 'TRIB_EXCL_DIV_2026',
      officialLabel:
        'Rendimentos Sujeitos à Tributação Exclusiva - Dividendos Tributados 2026 (Lei 15.270/2025)',
      defaultStatus: 'PROVISIONAL',
      regulatoryBasis: 'Lei nº 15.270/2025',
      version: '2026.1',
    },

    // RENDA VARIAVEL MENSAL
    {
      category: 'GANHO_LIQUIDO_COMUM',
      section: 'RENDA_VARIAVEL_MENSAL',
      officialCode: 'RV_MERCADO_VISTA_COMUM',
      officialLabel: 'Renda Variável - Operações Comuns (Mercado à Vista)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'Lei nº 11.033/2004 / RIR',
      version: '2026.1',
    },
    {
      category: 'GANHO_LIQUIDO_DAY_TRADE',
      section: 'RENDA_VARIAVEL_MENSAL',
      officialCode: 'RV_DAY_TRADE',
      officialLabel: 'Renda Variável - Operações Day Trade',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'Lei nº 11.033/2004 / RIR',
      version: '2026.1',
    },
    {
      category: 'GANHO_LIQUIDO_FII',
      section: 'RENDA_VARIAVEL_MENSAL',
      officialCode: 'RV_FII',
      officialLabel: 'Renda Variável - Operações com Fundos de Investimento Imobiliário (FII)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'Lei nº 8.668/1993',
      version: '2026.1',
    },
    {
      category: 'PREJUIZO_ACUMULADO_COMUM',
      section: 'RENDA_VARIAVEL_MENSAL',
      officialCode: 'RV_PREJUIZO_COMUM',
      officialLabel: 'Renda Variável - Prejuízo a Compensar (Operações Comuns)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'RIR / Perguntas e Respostas RFB',
      version: '2026.1',
    },
    {
      category: 'PREJUIZO_ACUMULADO_DAY_TRADE',
      section: 'RENDA_VARIAVEL_MENSAL',
      officialCode: 'RV_PREJUIZO_DAY_TRADE',
      officialLabel: 'Renda Variável - Prejuízo a Compensar (Day Trade)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'RIR / Perguntas e Respostas RFB',
      version: '2026.1',
    },
    {
      category: 'PREJUIZO_ACUMULADO_FII',
      section: 'RENDA_VARIAVEL_MENSAL',
      officialCode: 'RV_PREJUIZO_FII',
      officialLabel: 'Renda Variável - Prejuízo a Compensar (FII)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'RIR / Perguntas e Respostas RFB',
      version: '2026.1',
    },

    // IMPOSTO PAGO E RETIDO
    {
      category: 'IRRF_RETIDO_COMUM',
      section: 'IMPOSTO_PAGO_E_RETIDO',
      officialCode: 'IRRF_COMUM_11033',
      officialLabel: 'Imposto Pago/Retido - IRRF Lei 11.033/2004 (Operações Comuns 0,005%)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'Lei nº 11.033/2004, art. 2º',
      version: '2026.1',
    },
    {
      category: 'IRRF_RETIDO_DAY_TRADE',
      section: 'IMPOSTO_PAGO_E_RETIDO',
      officialCode: 'IRRF_DAY_TRADE_11033',
      officialLabel: 'Imposto Pago/Retido - IRRF Lei 11.033/2004 (Day Trade 1%)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'Lei nº 11.033/2004, art. 2º',
      version: '2026.1',
    },
    {
      category: 'DARF_6015_PAGO',
      section: 'IMPOSTO_PAGO_E_RETIDO',
      officialCode: 'DARF_6015',
      officialLabel: 'Imposto Pago - DARF Código 6015 (Ganhos Líquidos em Renda Variável)',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'Instrução Normativa RFB',
      version: '2026.1',
    },
    {
      category: 'DARF_6015_PENDENTE',
      section: 'IMPOSTO_PAGO_E_RETIDO',
      officialCode: 'DARF_6015_PENDENTE',
      officialLabel: 'Imposto Devido / Pendente de Recolhimento - DARF Código 6015',
      defaultStatus: 'OFFICIAL',
      regulatoryBasis: 'Instrução Normativa RFB',
      version: '2026.1',
    },
  ];

  static getRule(category: string, calendarYear?: number): ReportingRuleMapping {
    const rule = this.RULES.find((r) => r.category === category);
    if (!rule) {
      return {
        category,
        section: 'EVIDENCIAS_E_CONFIRMACOES',
        officialCode: 'OUTROS',
        officialLabel: `Categoria não mapeada: ${category}`,
        defaultStatus: 'UNSUPPORTED',
        regulatoryBasis: 'Não especificada',
        version: '2026.1',
      };
    }

    // If 2026+ dividend rules, mark as PROVISIONAL until formal PGD 2027 release
    if (calendarYear && calendarYear >= 2026 && category.startsWith('DIVIDENDOS')) {
      return {
        ...rule,
        defaultStatus: 'PROVISIONAL',
      };
    }

    return rule;
  }
}
