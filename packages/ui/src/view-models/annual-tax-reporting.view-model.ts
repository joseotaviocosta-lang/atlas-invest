import type { AnnualTaxReadinessStatus } from './annual-tax-readiness.view-model';

export type AnnualTaxReportingSection =
  | 'BENS_E_DIREITOS'
  | 'RENDIMENTOS_ISENTOS'
  | 'RENDIMENTOS_EXCLUSIVOS'
  | 'RENDA_VARIAVEL_MENSAL'
  | 'IMPOSTO_PAGO_E_RETIDO'
  | 'EVIDENCIAS_E_CONFIRMACOES';

export type ReportingCategoryStatus =
  'OFFICIAL' | 'PROVISIONAL' | 'REQUIRES_CONFIRMATION' | 'UNSUPPORTED';

export interface RawAnnualTaxReportingItem {
  readonly reportingItemId: string;
  readonly section: AnnualTaxReportingSection;
  readonly category: string;
  readonly officialMappingCode: string;
  readonly officialMappingLabel: string;
  readonly mappingStatus: ReportingCategoryStatus;
  readonly description: string;
  readonly assetId?: string;
  readonly ticker?: string;
  readonly payerId?: string;
  readonly payerName?: string;
  readonly economicPeriod?: string;
  readonly grossAmount?: string;
  readonly withheldAmount?: string;
  readonly netAmount?: string;
  readonly costBasis?: string;
  readonly openingCostBasis?: string;
  readonly closingCostBasis?: string;
  readonly openingQuantity?: string;
  readonly closingQuantity?: string;
  readonly currency: string;
  readonly reportingStatus: AnnualTaxReadinessStatus;
  readonly isBlocked: boolean;
  readonly blockingReasons: readonly string[];
  readonly sourceReferences: readonly string[];
  readonly sourceFingerprint: string;
  readonly evidenceStatus?: string;
  readonly confirmationStatus?: string;
  readonly notesKey?: string;
  readonly ruleVersion: string;
}

export interface RawAnnualTaxReportingSectionSummary {
  readonly section: AnnualTaxReportingSection;
  readonly title: string;
  readonly status: AnnualTaxReadinessStatus;
  readonly isComplete: boolean;
  readonly itemCount: number;
  readonly items: readonly RawAnnualTaxReportingItem[];
  readonly blockingReasons: readonly string[];
}

export interface RawAnnualTaxReportingPackage {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly overallStatus: AnnualTaxReadinessStatus;
  readonly isReadyForReporting: boolean;
  readonly reportingRuleVersion: string;
  readonly generatedAt: string;
  readonly sections: readonly RawAnnualTaxReportingSectionSummary[];
  readonly blockedItems: readonly RawAnnualTaxReportingItem[];
  readonly pendingConfirmations: readonly RawAnnualTaxReportingItem[];
  readonly packageFingerprint: string;
  readonly disclaimer: string;
}

export interface ReportingSectionVM {
  section: AnnualTaxReportingSection;
  title: string;
  status: AnnualTaxReadinessStatus;
  statusLabel: string;
  statusVariant: 'success' | 'warning' | 'danger' | 'neutral';
  itemCount: number;
  blockedCount: number;
  isComplete: boolean;
  blockingReasons: readonly string[];
  items: AnnualTaxReportingItemVM[];
}

export interface AnnualTaxReportingItemVM {
  reportingItemId: string;
  section: AnnualTaxReportingSection;
  category: string;
  officialMappingCode: string;
  officialMappingLabel: string;
  mappingStatus: ReportingCategoryStatus;
  mappingStatusLabel: string;
  mappingStatusVariant: 'success' | 'warning' | 'neutral';
  description: string;
  assetId?: string;
  ticker?: string;
  payerId?: string;
  payerName?: string;
  economicPeriod?: string;
  grossAmount?: string;
  withheldAmount?: string;
  netAmount?: string;
  costBasis?: string;
  openingCostBasis?: string;
  closingCostBasis?: string;
  openingQuantity?: string;
  closingQuantity?: string;
  currency: string;
  reportingStatus: AnnualTaxReadinessStatus;
  isBlocked: boolean;
  blockingReasons: readonly string[];
  sourceReferences: readonly string[];
  sourceFingerprint: string;
  evidenceStatus?: string;
  confirmationStatus?: string;
  notesKey?: string;
  ruleVersion: string;
}

export interface AnnualTaxReportingViewModel {
  taxSubjectId: string;
  calendarYear: number;
  declarationExercise: number;
  overallStatus: AnnualTaxReadinessStatus;
  overallStatusLabel: string;
  overallStatusVariant: 'success' | 'warning' | 'danger' | 'neutral';
  isReadyForReporting: boolean;
  reportingRuleVersion: string;
  generatedAt: string;
  disclaimer: string;
  sections: ReportingSectionVM[];
  totalItemCount: number;
  totalBlockedCount: number;
  blockedItems: AnnualTaxReportingItemVM[];
  pendingConfirmations: AnnualTaxReportingItemVM[];
  packageFingerprint: string;
}

export function annualTaxReportingQueryKey(calendarYear: number): readonly [string, number] {
  return ['annual-tax-reporting', calendarYear] as const;
}

export function mapStatusToBadge(status: AnnualTaxReadinessStatus): {
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'neutral';
} {
  switch (status) {
    case 'READY':
      return { label: 'Pronto p/ Declaração', variant: 'success' };
    case 'REQUIRES_CONFIRMATION':
      return { label: 'Requer Confirmação', variant: 'warning' };
    case 'PARTIAL':
      return { label: 'Parcial / Incompleto', variant: 'warning' };
    case 'BLOCKED':
      return { label: 'Bloqueado', variant: 'danger' };
    case 'NO_ACTIVITY':
      return { label: 'Sem Movimentação', variant: 'neutral' };
    default:
      return { label: status, variant: 'neutral' };
  }
}

export function mapMappingStatusToBadge(status: ReportingCategoryStatus): {
  label: string;
  variant: 'success' | 'warning' | 'neutral';
} {
  switch (status) {
    case 'OFFICIAL':
      return { label: 'Layout Oficial RFB', variant: 'success' };
    case 'PROVISIONAL':
      return { label: 'Regra Provisória (2026+)', variant: 'warning' };
    case 'REQUIRES_CONFIRMATION':
      return { label: 'Requer Confirmação', variant: 'warning' };
    case 'UNSUPPORTED':
      return { label: 'Não Suportado', variant: 'neutral' };
    default:
      return { label: status, variant: 'neutral' };
  }
}

export function mapReportingItemToVM(item: RawAnnualTaxReportingItem): AnnualTaxReportingItemVM {
  const badge = mapMappingStatusToBadge(item.mappingStatus);
  return {
    reportingItemId: item.reportingItemId,
    section: item.section,
    category: item.category,
    officialMappingCode: item.officialMappingCode,
    officialMappingLabel: item.officialMappingLabel,
    mappingStatus: item.mappingStatus,
    mappingStatusLabel: badge.label,
    mappingStatusVariant: badge.variant,
    description: item.description,
    assetId: item.assetId,
    ticker: item.ticker,
    payerId: item.payerId,
    payerName: item.payerName,
    economicPeriod: item.economicPeriod,
    grossAmount: item.grossAmount,
    withheldAmount: item.withheldAmount,
    netAmount: item.netAmount,
    costBasis: item.costBasis,
    openingCostBasis: item.openingCostBasis,
    closingCostBasis: item.closingCostBasis,
    openingQuantity: item.openingQuantity,
    closingQuantity: item.closingQuantity,
    currency: item.currency,
    reportingStatus: item.reportingStatus,
    isBlocked: Boolean(item.isBlocked),
    blockingReasons: item.blockingReasons ?? [],
    sourceReferences: item.sourceReferences ?? [],
    sourceFingerprint: item.sourceFingerprint,
    evidenceStatus: item.evidenceStatus,
    confirmationStatus: item.confirmationStatus,
    notesKey: item.notesKey,
    ruleVersion: item.ruleVersion,
  };
}

export function mapReportingPackageToViewModel(
  raw: RawAnnualTaxReportingPackage,
): AnnualTaxReportingViewModel {
  const overallBadge = mapStatusToBadge(raw.overallStatus);

  const sections: ReportingSectionVM[] = (raw.sections ?? []).map(
    (sec: RawAnnualTaxReportingSectionSummary) => {
      const badge = mapStatusToBadge(sec.status);
      const itemVMs = (sec.items ?? []).map((i: RawAnnualTaxReportingItem) =>
        mapReportingItemToVM(i),
      );
      const blockedCount = itemVMs.filter((i) => i.isBlocked).length;
      return {
        section: sec.section,
        title: sec.title,
        status: sec.status,
        statusLabel: badge.label,
        statusVariant: badge.variant,
        itemCount: sec.itemCount ?? itemVMs.length,
        blockedCount,
        isComplete: sec.isComplete,
        blockingReasons: sec.blockingReasons ?? [],
        items: itemVMs,
      };
    },
  );

  const totalItemCount = sections.reduce((acc, s) => acc + s.itemCount, 0);
  const totalBlockedCount = sections.reduce((acc, s) => acc + s.blockedCount, 0);

  return {
    taxSubjectId: raw.taxSubjectId,
    calendarYear: raw.calendarYear,
    declarationExercise: raw.declarationExercise,
    overallStatus: raw.overallStatus,
    overallStatusLabel: overallBadge.label,
    overallStatusVariant: overallBadge.variant,
    isReadyForReporting: raw.isReadyForReporting,
    reportingRuleVersion: raw.reportingRuleVersion,
    generatedAt: raw.generatedAt,
    disclaimer: raw.disclaimer,
    sections,
    totalItemCount,
    totalBlockedCount,
    blockedItems: (raw.blockedItems ?? []).map((i: RawAnnualTaxReportingItem) =>
      mapReportingItemToVM(i),
    ),
    pendingConfirmations: (raw.pendingConfirmations ?? []).map((i: RawAnnualTaxReportingItem) =>
      mapReportingItemToVM(i),
    ),
    packageFingerprint: raw.packageFingerprint,
  };
}
