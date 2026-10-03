import {
  AnnualTaxReadinessAssessment,
  AnnualReadinessSectionSummary,
  AnnualEvidenceRequirement,
  AnnualTaxReadinessStatus,
  TaxpayerConfirmation,
  resolveOverallReadinessStatus,
  computeReadinessFingerprint,
} from './annual-tax-readiness';

export interface AnnualReadinessEngineInput {
  readonly calendarYear: number;
  readonly openingPositions?: {
    readonly positions?: ReadonlyArray<{
      readonly assetId: string;
      readonly status: string;
      readonly isConfirmed?: boolean;
      readonly costBasisStatus?: string;
    }>;
    readonly blockingReasons?: readonly string[];
  } | null;
  readonly annualPositions?: {
    readonly positions?: ReadonlyArray<{
      readonly assetId: string;
      readonly costBasisStatus?: string;
      readonly isBlocked?: boolean;
    }>;
    readonly blockingReasons?: readonly string[];
  } | null;
  readonly capitalMarketSummary?: {
    readonly overallStatus?: string;
    readonly blockingReasons?: readonly string[];
    readonly months?: ReadonlyArray<{ readonly status: string; readonly month: number }>;
  } | null;
  readonly payments6015?: {
    readonly obligations?: ReadonlyArray<{
      readonly status: string;
      readonly competence: string;
      readonly balancePayable?: string;
    }>;
    readonly blockingReasons?: readonly string[];
  } | null;
  readonly transitionEvidence?: {
    readonly requirements?: ReadonlyArray<{
      readonly assetId: string;
      readonly ticker?: string;
      readonly isVerified: boolean;
      readonly sourceFingerprint?: string;
    }>;
    readonly blockingReasons?: readonly string[];
  } | null;
  readonly fiiEligibility?: {
    readonly items?: ReadonlyArray<{
      readonly assetId: string;
      readonly ticker: string;
      readonly isExempt: boolean;
      readonly requiresConfirmation: boolean;
      readonly sourceFingerprint?: string;
    }>;
    readonly blockingReasons?: readonly string[];
  } | null;
  readonly withholdingEvidence?: {
    readonly missingReports?: readonly string[];
    readonly blockingReasons?: readonly string[];
  } | null;
  readonly investmentIncomeSummary?: {
    readonly overallStatus?: string;
    readonly blockingReasons?: readonly string[];
    readonly payers?: ReadonlyArray<{
      readonly assetId: string;
      readonly status?: string;
    }>;
  } | null;
  readonly taxpayerConfirmations?: readonly TaxpayerConfirmation[];
}

export function buildAnnualTaxReadinessAssessment(
  input: AnnualReadinessEngineInput,
): AnnualTaxReadinessAssessment {
  const calendarYear = input.calendarYear;
  const declarationExercise = calendarYear + 1;
  const confirmations = input.taxpayerConfirmations ?? [];

  // Active (CONFIRMED) confirmations lookup by scope:subjectId for the assessment calendar year
  const activeConfirmations = confirmations.filter(
    (c) => c.status === 'CONFIRMED' && c.calendarYear === calendarYear,
  );

  const requirements: AnnualEvidenceRequirement[] = [];
  const sectionSummaries: AnnualReadinessSectionSummary[] = [];

  // 1. OPENING_POSITIONS
  {
    const op = input.openingPositions;
    const blockingReasons: string[] = [];
    const reqIds: string[] = [];
    let status: AnnualTaxReadinessStatus = 'READY';

    if (!op || (!op.positions?.length && !op.blockingReasons?.length)) {
      status = 'NO_ACTIVITY';
    } else {
      if (op.blockingReasons?.length) {
        blockingReasons.push(...op.blockingReasons);
        status = 'BLOCKED';
      }
      for (const p of op.positions ?? []) {
        if (p.costBasisStatus === 'INCOMPLETE' || p.costBasisStatus === 'UNKNOWN') {
          const reqId = `req_opening_cost_${p.assetId}`;
          const fp = computeReadinessFingerprint({
            assetId: p.assetId,
            costBasisStatus: p.costBasisStatus,
          });
          const matchConf = activeConfirmations.find(
            (c) => c.scope === 'OPENING_COST_BASIS' && c.subjectId === p.assetId,
          );
          let reqStatus: AnnualEvidenceRequirement['status'] = 'PENDING';
          if (matchConf) {
            reqStatus = matchConf.sourceFingerprint === fp ? 'SATISFIED' : 'STALE';
          }
          requirements.push({
            requirementId: reqId,
            section: 'OPENING_POSITIONS',
            subjectId: p.assetId,
            title: `Custo de aquisição de abertura ausente: ${p.assetId}`,
            description: `Informe ou confirme o custo de aquisição histórico para o ativo pré-Atlas.`,
            status: reqStatus,
            blockingReason: 'UNKNOWN_OPENING_COST_BASIS',
            sourceFingerprint: fp,
            satisfiedByConfirmationId: reqStatus === 'SATISFIED' ? matchConf?.id : undefined,
          });
          reqIds.push(reqId);
          if (reqStatus !== 'SATISFIED') {
            blockingReasons.push('UNKNOWN_OPENING_COST_BASIS');
            status = reqStatus === 'STALE' ? 'REQUIRES_CONFIRMATION' : 'BLOCKED';
          }
        }
      }
    }

    sectionSummaries.push({
      section: 'OPENING_POSITIONS',
      title: 'Posições de Abertura (31/12 Anterior)',
      status,
      isComplete: status === 'READY' || status === 'NO_ACTIVITY',
      blockingReasons: Object.freeze(blockingReasons),
      requirementIds: Object.freeze(reqIds),
    });
  }

  // 2. ANNUAL_POSITIONS
  {
    const ap = input.annualPositions;
    const blockingReasons: string[] = [];
    const reqIds: string[] = [];
    let status: AnnualTaxReadinessStatus = 'READY';

    if (!ap || (!ap.positions?.length && !ap.blockingReasons?.length)) {
      status = 'NO_ACTIVITY';
    } else {
      if (ap.blockingReasons?.length) {
        blockingReasons.push(...ap.blockingReasons);
        status = 'BLOCKED';
      }
      for (const p of ap.positions ?? []) {
        if (p.isBlocked || p.costBasisStatus === 'INCOMPLETE') {
          blockingReasons.push('INCOMPLETE_ANNUAL_POSITION_COST');
          status = 'BLOCKED';
        }
      }
    }

    sectionSummaries.push({
      section: 'ANNUAL_POSITIONS',
      title: 'Posições de Encerramento (31/12)',
      status,
      isComplete: status === 'READY' || status === 'NO_ACTIVITY',
      blockingReasons: Object.freeze(blockingReasons),
      requirementIds: Object.freeze(reqIds),
    });
  }

  // 3. CAPITAL_MARKET_FISCAL
  {
    const cm = input.capitalMarketSummary;
    const blockingReasons: string[] = [];
    const reqIds: string[] = [];
    let status: AnnualTaxReadinessStatus = 'READY';

    if (
      !cm ||
      (!cm.months?.length && !cm.blockingReasons?.length) ||
      cm.overallStatus === 'NO_ACTIVITY' ||
      (cm.months?.every((m) => m.status === 'EMPTY' || m.status === 'NO_ACTIVITY') &&
        !cm.blockingReasons?.length)
    ) {
      status = 'NO_ACTIVITY';
    } else {
      if (cm.blockingReasons?.length) {
        blockingReasons.push(...cm.blockingReasons);
      }
      if (cm.overallStatus === 'BLOCKED') {
        status = 'BLOCKED';
      } else if (cm.overallStatus === 'PARTIAL') {
        status = 'PARTIAL';
      } else if (cm.overallStatus === 'REQUIRES_CONFIRMATION') {
        status = 'REQUIRES_CONFIRMATION';
      } else if (cm.overallStatus === 'READY' || cm.overallStatus === 'COMPLETE') {
        status = 'READY';
      }
    }

    sectionSummaries.push({
      section: 'CAPITAL_MARKET_FISCAL',
      title: 'Apuração Mensal de Renda Variável',
      status,
      isComplete: status === 'READY' || status === 'NO_ACTIVITY',
      blockingReasons: Object.freeze(blockingReasons),
      requirementIds: Object.freeze(reqIds),
    });
  }

  // 4. PAYMENTS_6015
  {
    const pay = input.payments6015;
    const blockingReasons: string[] = [];
    const reqIds: string[] = [];
    let status: AnnualTaxReadinessStatus = 'READY';

    if (!pay || (!pay.obligations?.length && !pay.blockingReasons?.length)) {
      status = 'NO_ACTIVITY';
    } else {
      if (pay.blockingReasons?.length) {
        blockingReasons.push(...pay.blockingReasons);
        status = 'BLOCKED';
      }
      for (const ob of pay.obligations ?? []) {
        if (ob.status === 'OVERDUE' || ob.status === 'UNPAID') {
          const reqId = `req_payment_6015_${ob.competence}`;
          const fp = computeReadinessFingerprint({
            competence: ob.competence,
            status: ob.status,
            balancePayable: ob.balancePayable,
          });
          const matchConf = activeConfirmations.find(
            (c) => c.scope === 'GENERAL_TAX_DATA' && c.subjectId === `6015_${ob.competence}`,
          );
          let reqStatus: AnnualEvidenceRequirement['status'] = 'PENDING';
          if (matchConf) {
            reqStatus = matchConf.sourceFingerprint === fp ? 'SATISFIED' : 'STALE';
          }
          requirements.push({
            requirementId: reqId,
            section: 'PAYMENTS_6015',
            subjectId: `6015_${ob.competence}`,
            title: `Comprovante de pagamento DARF 6015 (${ob.competence})`,
            description: `Apresente ou confirme o pagamento da obrigação DARF 6015.`,
            status: reqStatus,
            blockingReason: 'PENDING_DARF_PAYMENT_EVIDENCE',
            sourceFingerprint: fp,
            satisfiedByConfirmationId: reqStatus === 'SATISFIED' ? matchConf?.id : undefined,
          });
          reqIds.push(reqId);
          if (reqStatus !== 'SATISFIED') {
            blockingReasons.push('PENDING_DARF_PAYMENT_EVIDENCE');
            if (status !== 'BLOCKED') {
              status = 'REQUIRES_CONFIRMATION';
            }
          }
        }
      }
    }

    sectionSummaries.push({
      section: 'PAYMENTS_6015',
      title: 'Pagamentos e Débitos DARF 6015',
      status,
      isComplete: status === 'READY' || status === 'NO_ACTIVITY',
      blockingReasons: Object.freeze(blockingReasons),
      requirementIds: Object.freeze(reqIds),
    });
  }

  // 5. TRANSITION_EVIDENCE
  {
    const te = input.transitionEvidence;
    const blockingReasons: string[] = [];
    const reqIds: string[] = [];
    let status: AnnualTaxReadinessStatus = 'READY';

    if (!te || (!te.requirements?.length && !te.blockingReasons?.length)) {
      status = 'NO_ACTIVITY';
    } else {
      if (te.blockingReasons?.length) {
        blockingReasons.push(...te.blockingReasons);
        status = 'BLOCKED';
      }
      for (const r of te.requirements ?? []) {
        if (!r.isVerified) {
          const reqId = `req_trans_${r.assetId}`;
          const fp =
            r.sourceFingerprint ??
            computeReadinessFingerprint({
              assetId: r.assetId,
              calendarYear,
            });
          const matchConf = activeConfirmations.find(
            (c) => c.scope === 'DIVIDEND_TRANSITION_EVIDENCE' && c.subjectId === r.assetId,
          );
          let reqStatus: AnnualEvidenceRequirement['status'] = 'PENDING';
          if (matchConf) {
            reqStatus = matchConf.sourceFingerprint === fp ? 'SATISFIED' : 'STALE';
          }
          requirements.push({
            requirementId: reqId,
            section: 'TRANSITION_EVIDENCE',
            subjectId: r.assetId,
            title: `Comprovação societária de lucros pré-2026 (${r.ticker ?? r.assetId})`,
            description: `Apresente ata ou documento comprobatório de deliberação societária até 31/12/2025 para isenção dos dividendos pagos em ${calendarYear}.`,
            status: reqStatus,
            blockingReason: 'TRANSITION_EVIDENCE_REQUIRED',
            sourceFingerprint: fp,
            satisfiedByConfirmationId: reqStatus === 'SATISFIED' ? matchConf?.id : undefined,
          });
          reqIds.push(reqId);
          if (reqStatus !== 'SATISFIED') {
            blockingReasons.push('TRANSITION_EVIDENCE_REQUIRED');
            if (status !== 'BLOCKED') {
              status = 'REQUIRES_CONFIRMATION';
            }
          }
        }
      }
    }

    sectionSummaries.push({
      section: 'TRANSITION_EVIDENCE',
      title: 'Transição de Dividendos Pré-2026 (Lei 15.270/2025)',
      status,
      isComplete: status === 'READY' || status === 'NO_ACTIVITY',
      blockingReasons: Object.freeze(blockingReasons),
      requirementIds: Object.freeze(reqIds),
    });
  }

  // 6. FII_ELIGIBILITY
  {
    const fii = input.fiiEligibility;
    const blockingReasons: string[] = [];
    const reqIds: string[] = [];
    let status: AnnualTaxReadinessStatus = 'READY';

    if (!fii || (!fii.items?.length && !fii.blockingReasons?.length)) {
      status = 'NO_ACTIVITY';
    } else {
      if (fii.blockingReasons?.length) {
        blockingReasons.push(...fii.blockingReasons);
        status = 'BLOCKED';
      }
      for (const item of fii.items ?? []) {
        if (item.requiresConfirmation || !item.isExempt) {
          const reqId = `req_fii_${item.assetId}`;
          const fp =
            item.sourceFingerprint ??
            computeReadinessFingerprint({
              assetId: item.assetId,
              ticker: item.ticker,
              calendarYear,
            });
          const matchConf = activeConfirmations.find(
            (c) => c.scope === 'FII_EXEMPTION_REQUIREMENTS' && c.subjectId === item.assetId,
          );
          let reqStatus: AnnualEvidenceRequirement['status'] = 'PENDING';
          if (matchConf) {
            reqStatus = matchConf.sourceFingerprint === fp ? 'SATISFIED' : 'STALE';
          }
          requirements.push({
            requirementId: reqId,
            section: 'FII_ELIGIBILITY',
            subjectId: item.assetId,
            title: `Condições legais de isenção de FII (${item.ticker})`,
            description: `Confirme o cumprimento dos 3 requisitos legais cumulativos (mínimo de cotistas, negociação em bolsa e limite de cotas).`,
            status: reqStatus,
            blockingReason: 'FII_ELIGIBILITY_UNVERIFIED',
            sourceFingerprint: fp,
            satisfiedByConfirmationId: reqStatus === 'SATISFIED' ? matchConf?.id : undefined,
          });
          reqIds.push(reqId);
          if (reqStatus !== 'SATISFIED') {
            blockingReasons.push('FII_ELIGIBILITY_UNVERIFIED');
            if (status !== 'BLOCKED') {
              status = 'REQUIRES_CONFIRMATION';
            }
          }
        }
      }
    }

    sectionSummaries.push({
      section: 'FII_ELIGIBILITY',
      title: 'Condições de Isenção de FII (Lei 14.754/2023)',
      status,
      isComplete: status === 'READY' || status === 'NO_ACTIVITY',
      blockingReasons: Object.freeze(blockingReasons),
      requirementIds: Object.freeze(reqIds),
    });
  }

  // 7. WITHHOLDING_EVIDENCE
  {
    const we = input.withholdingEvidence;
    const blockingReasons: string[] = [];
    const reqIds: string[] = [];
    let status: AnnualTaxReadinessStatus = 'READY';

    if (!we || (!we.missingReports?.length && !we.blockingReasons?.length)) {
      status = 'NO_ACTIVITY';
    } else {
      if (we.blockingReasons?.length) {
        blockingReasons.push(...we.blockingReasons);
        status = 'BLOCKED';
      }
      for (const rep of we.missingReports ?? []) {
        const reqId = `req_withholding_${rep}`;
        const fp = computeReadinessFingerprint({ report: rep, calendarYear });
        const matchConf = activeConfirmations.find(
          (c) => c.scope === 'WITHHOLDING_PROOF' && c.subjectId === rep,
        );
        let reqStatus: AnnualEvidenceRequirement['status'] = 'PENDING';
        if (matchConf) {
          reqStatus = matchConf.sourceFingerprint === fp ? 'SATISFIED' : 'STALE';
        }
        requirements.push({
          requirementId: reqId,
          section: 'WITHHOLDING_EVIDENCE',
          subjectId: rep,
          title: `Informe de rendimentos / comprovante de retenção: ${rep}`,
          description: `Anexe ou confirme o informe oficial de rendimentos da fonte pagadora.`,
          status: reqStatus,
          blockingReason: 'MISSING_WITHHOLDING_REPORT',
          sourceFingerprint: fp,
          satisfiedByConfirmationId: reqStatus === 'SATISFIED' ? matchConf?.id : undefined,
        });
        reqIds.push(reqId);
        if (reqStatus !== 'SATISFIED') {
          blockingReasons.push('MISSING_WITHHOLDING_REPORT');
          if (status !== 'BLOCKED') {
            status = 'REQUIRES_CONFIRMATION';
          }
        }
      }
    }

    sectionSummaries.push({
      section: 'WITHHOLDING_EVIDENCE',
      title: 'Informes de Rendimento e Retenção na Fonte',
      status,
      isComplete: status === 'READY' || status === 'NO_ACTIVITY',
      blockingReasons: Object.freeze(blockingReasons),
      requirementIds: Object.freeze(reqIds),
    });
  }

  // 8. INVESTMENT_INCOME
  {
    const inc = input.investmentIncomeSummary;
    const blockingReasons: string[] = [];
    const reqIds: string[] = [];
    let status: AnnualTaxReadinessStatus = 'READY';

    if (!inc || (!inc.payers?.length && !inc.blockingReasons?.length)) {
      status = 'NO_ACTIVITY';
    } else {
      if (inc.blockingReasons?.length) {
        blockingReasons.push(...inc.blockingReasons);
      }
      if (inc.overallStatus === 'BLOCKED') {
        status = 'BLOCKED';
      } else if (inc.overallStatus === 'REQUIRES_CONFIRMATION') {
        status = 'REQUIRES_CONFIRMATION';
      } else if (inc.overallStatus === 'PARTIAL') {
        status = 'PARTIAL';
      } else if (inc.overallStatus === 'READY') {
        status = 'READY';
      }
    }

    sectionSummaries.push({
      section: 'INVESTMENT_INCOME',
      title: 'Resumo Anual de Rendimentos (Dividendos, JCP, FII)',
      status,
      isComplete: status === 'READY' || status === 'NO_ACTIVITY',
      blockingReasons: Object.freeze(blockingReasons),
      requirementIds: Object.freeze(reqIds),
    });
  }

  // 9. TAXPAYER_CONFIRMATIONS
  {
    const staleReqs = requirements.filter((r) => r.status === 'STALE');
    const pendingReqs = requirements.filter((r) => r.status === 'PENDING');
    const blockingReasons: string[] = [];
    let status: AnnualTaxReadinessStatus = 'READY';

    if (requirements.length === 0 && confirmations.length === 0) {
      status = 'NO_ACTIVITY';
    } else if (staleReqs.length > 0) {
      status = 'REQUIRES_CONFIRMATION';
      blockingReasons.push('STALE_TAXPAYER_CONFIRMATIONS');
    } else if (pendingReqs.length > 0) {
      status = 'REQUIRES_CONFIRMATION';
      blockingReasons.push('PENDING_TAXPAYER_CONFIRMATIONS');
    }

    sectionSummaries.push({
      section: 'TAXPAYER_CONFIRMATIONS',
      title: 'Confirmações do Contribuinte',
      status,
      isComplete: status === 'READY' || status === 'NO_ACTIVITY',
      blockingReasons: Object.freeze(blockingReasons),
      requirementIds: Object.freeze(requirements.map((r) => r.requirementId)),
    });
  }

  // Overall evaluation
  const allSectionStatuses = sectionSummaries.map((s) => s.status);
  const overallStatus = resolveOverallReadinessStatus(allSectionStatuses);
  const allBlockingReasons = Array.from(
    new Set(sectionSummaries.flatMap((s) => s.blockingReasons)),
  );

  const assessment: AnnualTaxReadinessAssessment = {
    calendarYear,
    declarationExercise,
    overallStatus,
    isReadyForDirpf: overallStatus === 'READY' || overallStatus === 'NO_ACTIVITY',
    sections: Object.freeze(sectionSummaries),
    requirements: Object.freeze(requirements),
    confirmations: Object.freeze(confirmations),
    blockingReasons: Object.freeze(allBlockingReasons),
    fingerprint: '',
  };

  const fp = computeReadinessFingerprint({
    calendarYear: assessment.calendarYear,
    overallStatus: assessment.overallStatus,
    sections: assessment.sections,
    requirements: assessment.requirements,
    confirmations: assessment.confirmations,
  });

  return Object.freeze({
    ...assessment,
    fingerprint: fp,
  });
}
