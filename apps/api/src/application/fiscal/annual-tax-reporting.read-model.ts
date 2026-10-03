import {
  AnnualTaxReportingPackage,
  AnnualTaxReportingSectionSummary,
  AnnualTaxReportingItem,
  AnnualTaxReportingSection,
  ReportingCategoryStatus,
  AnnualTaxReadinessStatus,
} from '@atlas/tax-engine';

export interface AnnualTaxReportingItemDTO {
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

export interface AnnualTaxReportingSectionDTO {
  readonly section: AnnualTaxReportingSection;
  readonly title: string;
  readonly status: AnnualTaxReadinessStatus;
  readonly isComplete: boolean;
  readonly itemCount: number;
  readonly items: readonly AnnualTaxReportingItemDTO[];
  readonly blockingReasons: readonly string[];
}

export interface AnnualTaxReportingReadModel {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly overallStatus: AnnualTaxReadinessStatus;
  readonly isReadyForReporting: boolean;
  readonly reportingRuleVersion: string;
  readonly generatedAt: string;
  readonly sections: readonly AnnualTaxReportingSectionDTO[];
  readonly blockedItems: readonly AnnualTaxReportingItemDTO[];
  readonly pendingConfirmations: readonly AnnualTaxReportingItemDTO[];
  readonly packageFingerprint: string;
  readonly disclaimer: string;
}

export function mapReportingItemToDTO(item: AnnualTaxReportingItem): AnnualTaxReportingItemDTO {
  return {
    reportingItemId: item.reportingItemId,
    section: item.section,
    category: item.category,
    officialMappingCode: item.officialMappingCode,
    officialMappingLabel: item.officialMappingLabel,
    mappingStatus: item.mappingStatus,
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
    isBlocked: item.isBlocked,
    blockingReasons: item.blockingReasons,
    sourceReferences: item.sourceReferences,
    sourceFingerprint: item.sourceFingerprint,
    evidenceStatus: item.evidenceStatus,
    confirmationStatus: item.confirmationStatus,
    notesKey: item.notesKey,
    ruleVersion: item.ruleVersion,
  };
}

export function mapReportingSectionToDTO(
  section: AnnualTaxReportingSectionSummary,
): AnnualTaxReportingSectionDTO {
  return {
    section: section.section,
    title: section.title,
    status: section.status,
    isComplete: section.isComplete,
    itemCount: section.itemCount,
    items: section.items.map(mapReportingItemToDTO),
    blockingReasons: section.blockingReasons,
  };
}

export function mapReportingPackageToReadModel(
  pkg: AnnualTaxReportingPackage,
): AnnualTaxReportingReadModel {
  return {
    taxSubjectId: pkg.taxSubjectId,
    calendarYear: pkg.calendarYear,
    declarationExercise: pkg.declarationExercise,
    overallStatus: pkg.overallStatus,
    isReadyForReporting: pkg.isReadyForReporting,
    reportingRuleVersion: pkg.reportingRuleVersion,
    generatedAt: pkg.generatedAt,
    sections: pkg.sections.map(mapReportingSectionToDTO),
    blockedItems: pkg.blockedItems.map(mapReportingItemToDTO),
    pendingConfirmations: pkg.pendingConfirmations.map(mapReportingItemToDTO),
    packageFingerprint: pkg.packageFingerprint,
    disclaimer: pkg.disclaimer,
  };
}

