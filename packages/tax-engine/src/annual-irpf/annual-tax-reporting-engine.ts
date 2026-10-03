import {
  AnnualTaxReportingPackage,
  AnnualTaxReportingSectionSummary,
  AnnualTaxReportingItem,
  AnnualTaxReportingSection,
  ANNUAL_REPORTING_DISCLAIMER,
  computeReportingPackageFingerprint,
} from './annual-tax-reporting';
import { AnnualTaxReportingRuleRegistry } from './annual-tax-reporting-registry';
import { AnnualTaxReadinessStatus, TaxpayerConfirmation } from './annual-tax-readiness';

export interface ReportingPositionInput {
  readonly assetId: string;
  readonly ticker?: string;
  readonly assetType?: string;
  readonly closingQuantity?: string;
  readonly closingTotalCost?: string;
  readonly openingQuantity?: string;
  readonly openingTotalCost?: string;
  readonly costBasisStatus?: string;
  readonly isBlocked?: boolean;
  readonly status?: string;
  readonly blockingReasons?: readonly string[];
  readonly isSoldOut?: boolean;
}

export interface ReportingAnnualPositionsInput {
  readonly positions?: readonly ReportingPositionInput[];
  readonly blockingReasons?: readonly string[];
}

export interface ReportingCapitalMarketMonthInput {
  readonly competence: string;
  readonly netGainSwingTrade?: string;
  readonly netGainDayTrade?: string;
  readonly netGainFii?: string;
  readonly darfPaid?: string;
  readonly darfDue?: string;
}

export interface ReportingCapitalMarketSummaryInput {
  readonly overallStatus?: string;
  readonly blockingReasons?: readonly string[];
  readonly normalEquities?: {
    readonly netGain?: string;
    readonly exemptSalesGross?: string;
    readonly exemptSalesNetGain?: string;
    readonly endingLossCarry?: string;
    readonly irrfTotalWithheld?: string;
    readonly irrfTerminalBalance?: string;
    readonly irrfTerminalStatus?: string;
  };
  readonly dayTrade?: {
    readonly netGain?: string;
    readonly endingLossCarry?: string;
    readonly irrfTotalWithheld?: string;
    readonly irrfTerminalBalance?: string;
    readonly irrfTerminalStatus?: string;
  };
  readonly fii?: {
    readonly netGain?: string;
    readonly endingLossCarry?: string;
  };
  readonly obligations6015?: {
    readonly totalPaid?: string;
    readonly totalBalancePayable?: string;
    readonly items?: ReadonlyArray<{
      readonly competence: string;
      readonly status: string;
      readonly balancePayable?: string;
      readonly paidAmount?: string;
    }>;
  };
  readonly months?: readonly ReportingCapitalMarketMonthInput[];
}

export interface ReportingPayerIncomeItemInput {
  readonly assetId: string;
  readonly ticker?: string;
  readonly payerName?: string;
  readonly payerDocument?: string;
  readonly incomeType: string;
  readonly taxTreatment?: string;
  readonly grossAmount?: string;
  readonly withheldAmount?: string;
  readonly netAmount?: string;
  readonly isTransition?: boolean;
  readonly transitionEligibility?: string;
  readonly fiiEligibility?: string;
  readonly status?: string;
}

export interface ReportingInvestmentIncomeSummaryInput {
  readonly overallStatus?: string;
  readonly blockingReasons?: readonly string[];
  readonly payers?: readonly ReportingPayerIncomeItemInput[];
}

export interface AnnualTaxReportingEngineInput {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly annualPositions?: ReportingAnnualPositionsInput | null;
  readonly capitalMarketSummary?: ReportingCapitalMarketSummaryInput | null;
  readonly investmentIncomeSummary?: ReportingInvestmentIncomeSummaryInput | null;
  readonly taxpayerConfirmations?: ReadonlyArray<TaxpayerConfirmation> | null;
}

export function buildAnnualTaxReportingPackage(
  input: AnnualTaxReportingEngineInput,
): AnnualTaxReportingPackage {
  const calendarYear = input.calendarYear;
  const declarationExercise = calendarYear + 1;
  const reportingRuleVersion = '2026.1';
  const generatedAt = new Date().toISOString();

  const bensItems: AnnualTaxReportingItem[] = [];
  const isentosItems: AnnualTaxReportingItem[] = [];
  const exclusivosItems: AnnualTaxReportingItem[] = [];
  const rendaVariavelItems: AnnualTaxReportingItem[] = [];
  const impostoItems: AnnualTaxReportingItem[] = [];
  const evidenciasItems: AnnualTaxReportingItem[] = [];

  const blockedItems: AnnualTaxReportingItem[] = [];
  const pendingConfirmations: AnnualTaxReportingItem[] = [];

  // 1. BENS E DIREITOS
  if (input.annualPositions?.positions) {
    for (const pos of input.annualPositions.positions) {
      const isClosingNonZero =
        pos.closingQuantity &&
        pos.closingQuantity !== '0' &&
        pos.closingQuantity !== '0.00' &&
        !pos.closingQuantity.startsWith('0.000000');
      const isOpeningNonZero =
        pos.openingQuantity &&
        pos.openingQuantity !== '0' &&
        pos.openingQuantity !== '0.00' &&
        !pos.openingQuantity.startsWith('0.000000');

      if (!isClosingNonZero && !isOpeningNonZero) {
        continue;
      }

      let category = 'ACOES_BENS_E_DIREITOS';
      if (pos.assetType === 'FII') {
        category = 'FII_BENS_E_DIREITOS';
      } else if (!isClosingNonZero && isOpeningNonZero) {
        category = 'POSICAO_ALIENADA_BENS_E_DIREITOS';
      }

      const rule = AnnualTaxReportingRuleRegistry.getRule(category, calendarYear);
      const isBlocked = Boolean(
        pos.isBlocked || pos.costBasisStatus === 'BLOCKED' || pos.costBasisStatus === 'INCOMPLETE',
      );
      const itemStatus: AnnualTaxReadinessStatus = isBlocked
        ? 'BLOCKED'
        : pos.status === 'REQUIRES_CONFIRMATION' || pos.status === 'PENDING'
          ? 'REQUIRES_CONFIRMATION'
          : 'READY';

      const desc = `${pos.closingQuantity ? parseInt(pos.closingQuantity, 10) || pos.closingQuantity : '0'} ações/cotas de ${pos.ticker || pos.assetId}. Custo em 31/12/${calendarYear}: R$ ${pos.closingTotalCost ?? '0.00'}. Custo em 31/12/${calendarYear - 1}: R$ ${pos.openingTotalCost ?? '0.00'}.`;

      const blockingReasons: string[] = isBlocked
        ? pos.blockingReasons && pos.blockingReasons.length > 0
          ? [...pos.blockingReasons]
          : ['OPENING_COST_BASIS_UNCONFIRMED']
        : [];

      const item: AnnualTaxReportingItem = {
        reportingItemId: `bd-${pos.assetId}`,
        section: 'BENS_E_DIREITOS',
        category,
        officialMappingCode: rule.officialCode,
        officialMappingLabel: rule.officialLabel,
        mappingStatus: rule.defaultStatus,
        description: desc,
        assetId: pos.assetId,
        ticker: pos.ticker,
        costBasis: pos.closingTotalCost ?? '0.00',
        openingCostBasis: pos.openingTotalCost ?? '0.00',
        closingCostBasis: pos.closingTotalCost ?? '0.00',
        openingQuantity: pos.openingQuantity ?? '0',
        closingQuantity: pos.closingQuantity ?? '0',
        currency: 'BRL',
        reportingStatus: itemStatus,
        isBlocked,
        blockingReasons,
        sourceReferences: [pos.assetId],
        sourceFingerprint: computeReportingPackageFingerprint(pos),
        ruleVersion: reportingRuleVersion,
        notesKey: rule.regulatoryBasis,
      };

      bensItems.push(item);
      if (isBlocked) blockedItems.push(item);
      if (itemStatus === 'REQUIRES_CONFIRMATION') pendingConfirmations.push(item);
    }
  }

  // 2. RENDIMENTOS ISENTOS & EXCLUSIVOS
  if (input.investmentIncomeSummary?.payers) {
    for (const p of input.investmentIncomeSummary.payers) {
      const isRequiresConf =
        p.status === 'REQUIRES_CONFIRMATION' ||
        p.fiiEligibility === 'REQUIRES_CONFIRMATION' ||
        p.transitionEligibility === 'REQUIRES_CONFIRMATION';

      if (p.incomeType === 'DIVIDEND') {
        if (
          p.taxTreatment === 'EXEMPT' ||
          p.withheldAmount === '0.00' ||
          p.withheldAmount === '0' ||
          !p.withheldAmount
        ) {
          const cat =
            calendarYear >= 2026 && (p.isTransition || p.transitionEligibility === 'ELIGIBLE')
              ? 'DIVIDENDOS_ISENTOS_TRANSICAO'
              : 'DIVIDENDOS_ISENTOS_ORDINARIOS';
          const rule = AnnualTaxReportingRuleRegistry.getRule(cat, calendarYear);
          const item: AnnualTaxReportingItem = {
            reportingItemId: `inc-div-${p.assetId}-${p.payerDocument}`,
            section: 'RENDIMENTOS_ISENTOS',
            category: cat,
            officialMappingCode: rule.officialCode,
            officialMappingLabel: rule.officialLabel,
            mappingStatus: rule.defaultStatus,
            description: `Dividendos recebidos de ${p.payerName} (${p.payerDocument}) referente a ${p.ticker || p.assetId}. Total: R$ ${p.grossAmount}.`,
            assetId: p.assetId,
            ticker: p.ticker,
            payerId: p.payerDocument,
            payerName: p.payerName,
            grossAmount: p.grossAmount,
            withheldAmount: p.withheldAmount ?? '0.00',
            netAmount: p.netAmount ?? p.grossAmount,
            costBasis: p.grossAmount,
            currency: 'BRL',
            reportingStatus: isRequiresConf ? 'REQUIRES_CONFIRMATION' : 'READY',
            isBlocked: false,
            blockingReasons: [],
            sourceReferences: [p.assetId],
            sourceFingerprint: computeReportingPackageFingerprint(p),
            ruleVersion: reportingRuleVersion,
          };
          isentosItems.push(item);
          if (isRequiresConf) pendingConfirmations.push(item);
        } else {
          const rule = AnnualTaxReportingRuleRegistry.getRule(
            'DIVIDENDOS_TRIBUTADOS_2026',
            calendarYear,
          );
          const item: AnnualTaxReportingItem = {
            reportingItemId: `inc-div-trib-${p.assetId}-${p.payerDocument}`,
            section: 'RENDIMENTOS_EXCLUSIVOS',
            category: 'DIVIDENDOS_TRIBUTADOS_2026',
            officialMappingCode: rule.officialCode,
            officialMappingLabel: rule.officialLabel,
            mappingStatus: 'PROVISIONAL',
            description: `Dividendos sujeitos à retenção na fonte (Lei nº 15.270/2025) recebidos de ${p.payerName} (${p.payerDocument}). Bruto: R$ ${p.grossAmount}, Retido: R$ ${p.withheldAmount}.`,
            assetId: p.assetId,
            ticker: p.ticker,
            payerId: p.payerDocument,
            payerName: p.payerName,
            grossAmount: p.grossAmount,
            withheldAmount: p.withheldAmount,
            netAmount: p.netAmount,
            costBasis: p.grossAmount,
            currency: 'BRL',
            reportingStatus: isRequiresConf ? 'REQUIRES_CONFIRMATION' : 'READY',
            isBlocked: false,
            blockingReasons: [],
            sourceReferences: [p.assetId],
            sourceFingerprint: computeReportingPackageFingerprint(p),
            ruleVersion: reportingRuleVersion,
          };
          exclusivosItems.push(item);
          if (isRequiresConf) pendingConfirmations.push(item);
        }
      } else if (p.incomeType === 'JCP') {
        const rule = AnnualTaxReportingRuleRegistry.getRule(
          'JCP_TRIBUTACAO_EXCLUSIVA',
          calendarYear,
        );
        const item: AnnualTaxReportingItem = {
          reportingItemId: `inc-jcp-${p.assetId}-${p.payerDocument}`,
          section: 'RENDIMENTOS_EXCLUSIVOS',
          category: 'JCP_TRIBUTACAO_EXCLUSIVA',
          officialMappingCode: rule.officialCode,
          officialMappingLabel: rule.officialLabel,
          mappingStatus: rule.defaultStatus,
          description: `Juros sobre Capital Próprio recebidos de ${p.payerName} (${p.payerDocument}). Bruto: R$ ${p.grossAmount}, Retido: R$ ${p.withheldAmount}.`,
          assetId: p.assetId,
          ticker: p.ticker,
          payerId: p.payerDocument,
          payerName: p.payerName,
          grossAmount: p.grossAmount,
          withheldAmount: p.withheldAmount,
          netAmount: p.netAmount,
          costBasis: p.grossAmount,
          currency: 'BRL',
          reportingStatus: isRequiresConf ? 'REQUIRES_CONFIRMATION' : 'READY',
          isBlocked: false,
          blockingReasons: [],
          sourceReferences: [p.assetId],
          sourceFingerprint: computeReportingPackageFingerprint(p),
          ruleVersion: reportingRuleVersion,
        };
        exclusivosItems.push(item);
        if (isRequiresConf) pendingConfirmations.push(item);
      } else if (p.incomeType === 'FII_INCOME') {
        const rule = AnnualTaxReportingRuleRegistry.getRule(
          'FII_RENDIMENTOS_ISENTOS',
          calendarYear,
        );
        const item: AnnualTaxReportingItem = {
          reportingItemId: `inc-fii-${p.assetId}-${p.payerDocument}`,
          section: 'RENDIMENTOS_ISENTOS',
          category: 'FII_RENDIMENTOS_ISENTOS',
          officialMappingCode: rule.officialCode,
          officialMappingLabel: rule.officialLabel,
          mappingStatus: rule.defaultStatus,
          description: `Rendimentos de FII Isentos recebidos de ${p.payerName} (${p.payerDocument}). Total: R$ ${p.grossAmount}.`,
          assetId: p.assetId,
          ticker: p.ticker,
          payerId: p.payerDocument,
          payerName: p.payerName,
          grossAmount: p.grossAmount,
          withheldAmount: '0.00',
          netAmount: p.grossAmount,
          costBasis: p.grossAmount,
          currency: 'BRL',
          reportingStatus: isRequiresConf ? 'REQUIRES_CONFIRMATION' : 'READY',
          isBlocked: false,
          blockingReasons: [],
          sourceReferences: [p.assetId],
          sourceFingerprint: computeReportingPackageFingerprint(p),
          ruleVersion: reportingRuleVersion,
        };
        isentosItems.push(item);
        if (isRequiresConf) pendingConfirmations.push(item);
      }
    }
  }

  // 3. CAPITAL MARKET SUMMARY (RENDA VARIÁVEL, ISENÇÃO 20K & IMPOSTO RETIDO/PAGO)
  if (input.capitalMarketSummary) {
    const cms = input.capitalMarketSummary;

    // Normal equities
    if (cms.normalEquities) {
      const ne = cms.normalEquities;
      if (
        ne.exemptSalesNetGain &&
        ne.exemptSalesNetGain !== '0.00' &&
        ne.exemptSalesNetGain !== '0'
      ) {
        const rule = AnnualTaxReportingRuleRegistry.getRule('GANHO_ISENTO_ACOES_20K', calendarYear);
        isentosItems.push({
          reportingItemId: `inc-exempt-20k-${calendarYear}`,
          section: 'RENDIMENTOS_ISENTOS',
          category: 'GANHO_ISENTO_ACOES_20K',
          officialMappingCode: rule.officialCode,
          officialMappingLabel: rule.officialLabel,
          mappingStatus: rule.defaultStatus,
          description: `Ganhos líquidos isentos em alienações de ações até R$ 20.000/mês no ano ${calendarYear}: R$ ${ne.exemptSalesNetGain}.`,
          grossAmount: ne.exemptSalesNetGain,
          netAmount: ne.exemptSalesNetGain,
          costBasis: ne.exemptSalesNetGain,
          currency: 'BRL',
          reportingStatus: 'READY',
          isBlocked: false,
          blockingReasons: [],
          sourceReferences: [`${calendarYear}-exempt-20k`],
          sourceFingerprint: computeReportingPackageFingerprint(ne),
          ruleVersion: reportingRuleVersion,
        });
      }

      if (
        ne.netGain &&
        ne.netGain !== '0.00' &&
        ne.netGain !== '0' &&
        !ne.netGain.startsWith('-')
      ) {
        const rule = AnnualTaxReportingRuleRegistry.getRule('GANHO_LIQUIDO_COMUM', calendarYear);
        rendaVariavelItems.push({
          reportingItemId: `rv-comm-${calendarYear}`,
          section: 'RENDA_VARIAVEL_MENSAL',
          category: 'GANHO_LIQUIDO_COMUM',
          officialMappingCode: rule.officialCode,
          officialMappingLabel: rule.officialLabel,
          mappingStatus: rule.defaultStatus,
          description: `Ganhos líquidos em operações comuns (Mercado à Vista): R$ ${ne.netGain}.`,
          grossAmount: ne.netGain,
          netAmount: ne.netGain,
          costBasis: ne.netGain,
          currency: 'BRL',
          reportingStatus: 'READY',
          isBlocked: false,
          blockingReasons: [],
          sourceReferences: [`${calendarYear}-ne-gain`],
          sourceFingerprint: computeReportingPackageFingerprint(ne),
          ruleVersion: reportingRuleVersion,
        });
      }

      if (ne.endingLossCarry && ne.endingLossCarry !== '0.00' && ne.endingLossCarry !== '0') {
        const rule = AnnualTaxReportingRuleRegistry.getRule(
          'PREJUIZO_ACUMULADO_COMUM',
          calendarYear,
        );
        rendaVariavelItems.push({
          reportingItemId: `rv-loss-comm-${calendarYear}`,
          section: 'RENDA_VARIAVEL_MENSAL',
          category: 'PREJUIZO_ACUMULADO_COMUM',
          officialMappingCode: rule.officialCode,
          officialMappingLabel: rule.officialLabel,
          mappingStatus: rule.defaultStatus,
          description: `Prejuízo a compensar em operações comuns: R$ ${ne.endingLossCarry}.`,
          grossAmount: ne.endingLossCarry,
          netAmount: ne.endingLossCarry,
          costBasis: ne.endingLossCarry,
          currency: 'BRL',
          reportingStatus: 'READY',
          isBlocked: false,
          blockingReasons: [],
          sourceReferences: [`${calendarYear}-ne-loss`],
          sourceFingerprint: computeReportingPackageFingerprint(ne),
          ruleVersion: reportingRuleVersion,
        });
      }

      if (ne.irrfTotalWithheld && ne.irrfTotalWithheld !== '0.00' && ne.irrfTotalWithheld !== '0') {
        const rule = AnnualTaxReportingRuleRegistry.getRule('IRRF_RETIDO_COMUM', calendarYear);
        impostoItems.push({
          reportingItemId: `irrf-comm-${calendarYear}`,
          section: 'IMPOSTO_PAGO_E_RETIDO',
          category: 'IRRF_RETIDO_COMUM',
          officialMappingCode: rule.officialCode,
          officialMappingLabel: rule.officialLabel,
          mappingStatus: rule.defaultStatus,
          description: `IRRF retido na fonte em operações comuns (Lei nº 11.033/2004): R$ ${ne.irrfTotalWithheld}.`,
          grossAmount: ne.irrfTotalWithheld,
          withheldAmount: ne.irrfTotalWithheld,
          costBasis: ne.irrfTotalWithheld,
          currency: 'BRL',
          reportingStatus: 'READY',
          isBlocked: false,
          blockingReasons: [],
          sourceReferences: [`${calendarYear}-irrf-comm`],
          sourceFingerprint: computeReportingPackageFingerprint(ne),
          ruleVersion: reportingRuleVersion,
        });
      }
    }

    // Day trade
    if (cms.dayTrade) {
      const dt = cms.dayTrade;
      if (
        dt.netGain &&
        dt.netGain !== '0.00' &&
        dt.netGain !== '0' &&
        !dt.netGain.startsWith('-')
      ) {
        const rule = AnnualTaxReportingRuleRegistry.getRule(
          'GANHO_LIQUIDO_DAY_TRADE',
          calendarYear,
        );
        rendaVariavelItems.push({
          reportingItemId: `rv-dt-${calendarYear}`,
          section: 'RENDA_VARIAVEL_MENSAL',
          category: 'GANHO_LIQUIDO_DAY_TRADE',
          officialMappingCode: rule.officialCode,
          officialMappingLabel: rule.officialLabel,
          mappingStatus: rule.defaultStatus,
          description: `Ganhos líquidos em operações Day Trade: R$ ${dt.netGain}.`,
          grossAmount: dt.netGain,
          netAmount: dt.netGain,
          costBasis: dt.netGain,
          currency: 'BRL',
          reportingStatus: 'READY',
          isBlocked: false,
          blockingReasons: [],
          sourceReferences: [`${calendarYear}-dt-gain`],
          sourceFingerprint: computeReportingPackageFingerprint(dt),
          ruleVersion: reportingRuleVersion,
        });
      }

      if (dt.endingLossCarry && dt.endingLossCarry !== '0.00' && dt.endingLossCarry !== '0') {
        const rule = AnnualTaxReportingRuleRegistry.getRule(
          'PREJUIZO_ACUMULADO_DAY_TRADE',
          calendarYear,
        );
        rendaVariavelItems.push({
          reportingItemId: `rv-loss-dt-${calendarYear}`,
          section: 'RENDA_VARIAVEL_MENSAL',
          category: 'PREJUIZO_ACUMULADO_DAY_TRADE',
          officialMappingCode: rule.officialCode,
          officialMappingLabel: rule.officialLabel,
          mappingStatus: rule.defaultStatus,
          description: `Prejuízo a compensar em operações Day Trade: R$ ${dt.endingLossCarry}.`,
          grossAmount: dt.endingLossCarry,
          netAmount: dt.endingLossCarry,
          costBasis: dt.endingLossCarry,
          currency: 'BRL',
          reportingStatus: 'READY',
          isBlocked: false,
          blockingReasons: [],
          sourceReferences: [`${calendarYear}-dt-loss`],
          sourceFingerprint: computeReportingPackageFingerprint(dt),
          ruleVersion: reportingRuleVersion,
        });
      }

      if (dt.irrfTotalWithheld && dt.irrfTotalWithheld !== '0.00' && dt.irrfTotalWithheld !== '0') {
        const rule = AnnualTaxReportingRuleRegistry.getRule('IRRF_RETIDO_DAY_TRADE', calendarYear);
        impostoItems.push({
          reportingItemId: `irrf-dt-${calendarYear}`,
          section: 'IMPOSTO_PAGO_E_RETIDO',
          category: 'IRRF_RETIDO_DAY_TRADE',
          officialMappingCode: rule.officialCode,
          officialMappingLabel: rule.officialLabel,
          mappingStatus: rule.defaultStatus,
          description: `IRRF retido na fonte em operações Day Trade (1%): R$ ${dt.irrfTotalWithheld}.`,
          grossAmount: dt.irrfTotalWithheld,
          withheldAmount: dt.irrfTotalWithheld,
          costBasis: dt.irrfTotalWithheld,
          currency: 'BRL',
          reportingStatus: 'READY',
          isBlocked: false,
          blockingReasons: [],
          sourceReferences: [`${calendarYear}-irrf-dt`],
          sourceFingerprint: computeReportingPackageFingerprint(dt),
          ruleVersion: reportingRuleVersion,
        });
      }
    }

    // Obligations 6015
    if (cms.obligations6015?.items) {
      for (const ob of cms.obligations6015.items) {
        if (ob.status === 'PAID') {
          const rule = AnnualTaxReportingRuleRegistry.getRule('DARF_6015_PAGO', calendarYear);
          impostoItems.push({
            reportingItemId: `darf-6015-${ob.competence}`,
            section: 'IMPOSTO_PAGO_E_RETIDO',
            category: 'DARF_6015_PAGO',
            officialMappingCode: rule.officialCode,
            officialMappingLabel: rule.officialLabel,
            mappingStatus: rule.defaultStatus,
            description: `DARF Código 6015 pago referente à competência ${ob.competence}: R$ ${ob.paidAmount}.`,
            economicPeriod: ob.competence,
            grossAmount: ob.paidAmount,
            costBasis: ob.paidAmount,
            currency: 'BRL',
            reportingStatus: 'READY',
            isBlocked: false,
            blockingReasons: [],
            sourceReferences: [ob.competence],
            sourceFingerprint: computeReportingPackageFingerprint(ob),
            ruleVersion: reportingRuleVersion,
          });
        }
      }
    }

    // Months array
    if (cms.months) {
      for (const m of cms.months) {
        if (m.netGainSwingTrade && m.netGainSwingTrade !== '0.00' && m.netGainSwingTrade !== '0') {
          const rule = AnnualTaxReportingRuleRegistry.getRule('GANHO_LIQUIDO_COMUM', calendarYear);
          rendaVariavelItems.push({
            reportingItemId: `rv-swing-${m.competence}`,
            section: 'RENDA_VARIAVEL_MENSAL',
            category: 'GANHO_LIQUIDO_COMUM',
            officialMappingCode: rule.officialCode,
            officialMappingLabel: rule.officialLabel,
            mappingStatus: rule.defaultStatus,
            description: `Ganhos líquidos em operações comuns no mês ${m.competence}: R$ ${m.netGainSwingTrade}.`,
            economicPeriod: m.competence,
            grossAmount: m.netGainSwingTrade,
            netAmount: m.netGainSwingTrade,
            costBasis: m.netGainSwingTrade,
            currency: 'BRL',
            reportingStatus: 'READY',
            isBlocked: false,
            blockingReasons: [],
            sourceReferences: [m.competence],
            sourceFingerprint: computeReportingPackageFingerprint(m),
            ruleVersion: reportingRuleVersion,
          });
        }
        if (m.darfPaid && m.darfPaid !== '0.00' && m.darfPaid !== '0') {
          const rule = AnnualTaxReportingRuleRegistry.getRule('DARF_6015_PAGO', calendarYear);
          impostoItems.push({
            reportingItemId: `darf-paid-${m.competence}`,
            section: 'IMPOSTO_PAGO_E_RETIDO',
            category: 'DARF_6015_PAGO',
            officialMappingCode: rule.officialCode,
            officialMappingLabel: rule.officialLabel,
            mappingStatus: rule.defaultStatus,
            description: `DARF 6015 recolhido relativo à competência ${m.competence}: R$ ${m.darfPaid}.`,
            economicPeriod: m.competence,
            grossAmount: m.darfPaid,
            costBasis: m.darfPaid,
            currency: 'BRL',
            reportingStatus: 'READY',
            isBlocked: false,
            blockingReasons: [],
            sourceReferences: [m.competence],
            sourceFingerprint: computeReportingPackageFingerprint(m),
            ruleVersion: reportingRuleVersion,
          });
        }
      }
    }
  }

  // 4. Build Sections
  function makeSectionSummary(
    section: AnnualTaxReportingSection,
    title: string,
    items: AnnualTaxReportingItem[],
  ): AnnualTaxReportingSectionSummary {
    const hasBlocked = items.some((i) => i.isBlocked);
    const hasPending = items.some((i) => i.reportingStatus === 'REQUIRES_CONFIRMATION');
    const status: AnnualTaxReadinessStatus =
      items.length === 0
        ? 'READY'
        : hasBlocked
          ? 'BLOCKED'
          : hasPending
            ? 'REQUIRES_CONFIRMATION'
            : 'READY';

    return Object.freeze({
      section,
      title,
      status,
      isComplete: status === 'READY',
      itemCount: items.length,
      items: Object.freeze(items),
      blockingReasons: hasBlocked ? ['Itens bloqueados presentes'] : [],
    });
  }

  const sections: AnnualTaxReportingSectionSummary[] = [
    makeSectionSummary('BENS_E_DIREITOS', 'Bens e Direitos', bensItems),
    makeSectionSummary(
      'RENDIMENTOS_ISENTOS',
      'Rendimentos Isentos e Não Tributáveis',
      isentosItems,
    ),
    makeSectionSummary(
      'RENDIMENTOS_EXCLUSIVOS',
      'Rendimentos Sujeitos à Tributação Exclusiva/Definitiva',
      exclusivosItems,
    ),
    makeSectionSummary(
      'RENDA_VARIAVEL_MENSAL',
      'Renda Variável — Operações Comuns / Day Trade / FII',
      rendaVariavelItems,
    ),
    makeSectionSummary('IMPOSTO_PAGO_E_RETIDO', 'Imposto Pago e Retido na Fonte', impostoItems),
    makeSectionSummary(
      'EVIDENCIAS_E_CONFIRMACOES',
      'Evidências e Confirmações Fiscais',
      evidenciasItems,
    ),
  ];

  const totalItemCount =
    bensItems.length +
    isentosItems.length +
    exclusivosItems.length +
    rendaVariavelItems.length +
    impostoItems.length +
    evidenciasItems.length;

  let overallStatus: AnnualTaxReadinessStatus = 'READY';
  if (totalItemCount === 0) {
    overallStatus = 'NO_ACTIVITY';
  } else if (blockedItems.length > 0) {
    overallStatus = 'BLOCKED';
  } else if (pendingConfirmations.length > 0) {
    overallStatus = 'REQUIRES_CONFIRMATION';
  }

  const isReadyForReporting = overallStatus === 'READY' || overallStatus === 'NO_ACTIVITY';

  const packageFingerprint = computeReportingPackageFingerprint({
    taxSubjectId: input.taxSubjectId,
    calendarYear,
    declarationExercise,
    overallStatus,
    sections: sections.map((s) => ({
      section: s.section,
      itemCount: s.itemCount,
      status: s.status,
      items: s.items.map((it) => it.reportingItemId),
    })),
  });

  return Object.freeze({
    taxSubjectId: input.taxSubjectId,
    calendarYear,
    declarationExercise,
    overallStatus,
    isReadyForReporting,
    reportingRuleVersion,
    generatedAt,
    sections: Object.freeze(sections),
    blockedItems: Object.freeze(blockedItems),
    pendingConfirmations: Object.freeze(pendingConfirmations),
    packageFingerprint,
    disclaimer: ANNUAL_REPORTING_DISCLAIMER,
  });
}
