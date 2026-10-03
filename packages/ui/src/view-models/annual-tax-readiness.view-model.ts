export type AnnualTaxReadinessStatus =
  'READY' | 'PARTIAL' | 'REQUIRES_CONFIRMATION' | 'BLOCKED' | 'NO_ACTIVITY';

export type AnnualReadinessSectionKey =
  | 'OPENING_POSITIONS'
  | 'ANNUAL_POSITIONS'
  | 'CAPITAL_MARKET_FISCAL'
  | 'PAYMENTS_6015'
  | 'TRANSITION_EVIDENCE'
  | 'FII_ELIGIBILITY'
  | 'WITHHOLDING_EVIDENCE'
  | 'INVESTMENT_INCOME'
  | 'TAXPAYER_CONFIRMATIONS';

export interface RawAnnualReadinessSectionSummary {
  readonly section: AnnualReadinessSectionKey;
  readonly title: string;
  readonly status: AnnualTaxReadinessStatus;
  readonly isComplete: boolean;
  readonly blockingReasons: readonly string[];
  readonly requirementIds: readonly string[];
}

export interface RawAnnualEvidenceRequirement {
  readonly requirementId: string;
  readonly section: AnnualReadinessSectionKey;
  readonly subjectId: string;
  readonly title: string;
  readonly description: string;
  readonly status: 'PENDING' | 'SATISFIED' | 'WAIVED' | 'STALE';
  readonly blockingReason: string;
  readonly sourceFingerprint: string;
  readonly satisfiedByConfirmationId?: string;
  readonly actionableUrl?: string;
}

export interface TaxpayerConfirmationVM {
  id: string;
  confirmationType: string;
  subjectReference: string;
  decision: string;
  statementVersion: string;
  sourceFingerprint: string;
  revision: number;
  confirmedAt: string;
  notes: string | null;
}

export interface AnnualReadinessSectionVM {
  section: AnnualReadinessSectionKey;
  title: string;
  status: AnnualTaxReadinessStatus;
  statusLabel: string;
  statusVariant: 'success' | 'warning' | 'danger' | 'neutral';
  isComplete: boolean;
  blockingReasons: readonly string[];
  requirementIds: readonly string[];
}

export interface AnnualEvidenceRequirementVM {
  requirementId: string;
  section: AnnualReadinessSectionKey;
  subjectId: string;
  title: string;
  description: string;
  status: 'PENDING' | 'SATISFIED' | 'WAIVED' | 'STALE';
  statusLabel: string;
  statusVariant: 'success' | 'warning' | 'danger' | 'neutral';
  blockingReason: string;
  sourceFingerprint: string;
  isSatisfied: boolean;
  satisfiedByConfirmationId?: string;
}

export interface AnnualTaxReadinessViewModel {
  calendarYear: number;
  declarationExercise: number;
  overallStatus: AnnualTaxReadinessStatus;
  overallStatusLabel: string;
  overallStatusVariant: 'success' | 'warning' | 'danger' | 'neutral';
  isReadyForDirpf: boolean;
  sections: AnnualReadinessSectionVM[];
  requirements: AnnualEvidenceRequirementVM[];
  confirmations: TaxpayerConfirmationVM[];
  blockingReasons: readonly string[];
  fingerprint: string;
  summaryText: string;
}

export function annualTaxReadinessQueryKey(calendarYear: number): readonly [string, number] {
  return ['annual-tax-readiness', calendarYear] as const;
}

function mapStatusToBadge(status: AnnualTaxReadinessStatus): {
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'neutral';
} {
  switch (status) {
    case 'READY':
      return { label: 'Pronto para IRPF', variant: 'success' };
    case 'NO_ACTIVITY':
      return { label: 'Sem Atividade', variant: 'neutral' };
    case 'PARTIAL':
      return { label: 'Parcial', variant: 'warning' };
    case 'REQUIRES_CONFIRMATION':
      return { label: 'Confirmação Necessária', variant: 'warning' };
    case 'BLOCKED':
      return { label: 'Bloqueado', variant: 'danger' };
    default:
      return { label: 'Desconhecido', variant: 'neutral' };
  }
}

function mapRequirementStatusToBadge(status: 'PENDING' | 'SATISFIED' | 'WAIVED' | 'STALE'): {
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'neutral';
} {
  switch (status) {
    case 'SATISFIED':
      return { label: 'Confirmado', variant: 'success' };
    case 'PENDING':
      return { label: 'Pendente', variant: 'warning' };
    case 'STALE':
      return { label: 'Revalidação Necessária', variant: 'danger' };
    case 'WAIVED':
      return { label: 'Dispensado', variant: 'neutral' };
    default:
      return { label: 'Pendente', variant: 'warning' };
  }
}

export function buildAnnualTaxReadinessViewModel(data: {
  calendarYear: number;
  declarationExercise: number;
  overallStatus: AnnualTaxReadinessStatus;
  isReadyForDirpf: boolean;
  sections: readonly RawAnnualReadinessSectionSummary[];
  requirements: readonly RawAnnualEvidenceRequirement[];
  confirmations: ReadonlyArray<{
    id: string;
    confirmationType: string;
    subjectReference: string;
    decision: string;
    statementVersion: string;
    sourceFingerprint: string;
    revision: number;
    confirmedAt: string;
    notes?: string | null;
  }>;
  blockingReasons: readonly string[];
  fingerprint: string;
}): AnnualTaxReadinessViewModel {
  const badge = mapStatusToBadge(data.overallStatus);

  const sectionsVM: AnnualReadinessSectionVM[] = data.sections.map((sec) => {
    const secBadge = mapStatusToBadge(sec.status);
    return {
      section: sec.section,
      title: sec.title,
      status: sec.status,
      statusLabel: secBadge.label,
      statusVariant: secBadge.variant,
      isComplete: sec.isComplete,
      blockingReasons: sec.blockingReasons,
      requirementIds: sec.requirementIds,
    };
  });

  const requirementsVM: AnnualEvidenceRequirementVM[] = data.requirements.map((req) => {
    const reqBadge = mapRequirementStatusToBadge(req.status);
    return {
      requirementId: req.requirementId,
      section: req.section,
      subjectId: req.subjectId,
      title: req.title,
      description: req.description,
      status: req.status,
      statusLabel: reqBadge.label,
      statusVariant: reqBadge.variant,
      blockingReason: req.blockingReason,
      sourceFingerprint: req.sourceFingerprint,
      isSatisfied: req.status === 'SATISFIED',
      satisfiedByConfirmationId: req.satisfiedByConfirmationId,
    };
  });

  const confirmationsVM: TaxpayerConfirmationVM[] = data.confirmations.map((c) => ({
    id: c.id,
    confirmationType: c.confirmationType,
    subjectReference: c.subjectReference,
    decision: c.decision,
    statementVersion: c.statementVersion,
    sourceFingerprint: c.sourceFingerprint,
    revision: c.revision,
    confirmedAt: c.confirmedAt,
    notes: c.notes ?? null,
  }));

  let summaryText = '';
  if (data.isReadyForDirpf) {
    summaryText = `Todos os dados e evidências para o ano-calendário ${data.calendarYear} estão completos e validados para o exercício DIRPF ${data.declarationExercise}.`;
  } else if (data.overallStatus === 'REQUIRES_CONFIRMATION') {
    summaryText = `Existem confirmações ou evidências probatórias pendentes de validação para o ano-calendário ${data.calendarYear}.`;
  } else {
    summaryText = `A apuração do ano-calendário ${data.calendarYear} contém inconsistências ou bloqueios que impedem a emissão autoritativa.`;
  }

  return {
    calendarYear: data.calendarYear,
    declarationExercise: data.declarationExercise,
    overallStatus: data.overallStatus,
    overallStatusLabel: badge.label,
    overallStatusVariant: badge.variant,
    isReadyForDirpf: data.isReadyForDirpf,
    sections: sectionsVM,
    requirements: requirementsVM,
    confirmations: confirmationsVM,
    blockingReasons: data.blockingReasons,
    fingerprint: data.fingerprint,
    summaryText,
  };
}
