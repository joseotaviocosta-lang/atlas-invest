import { createHash } from 'crypto';
import { AnnualTaxReadinessStatus } from './annual-tax-readiness';

export type AnnualTaxReportingSection =
  | 'BENS_E_DIREITOS'
  | 'RENDIMENTOS_ISENTOS'
  | 'RENDIMENTOS_EXCLUSIVOS'
  | 'RENDA_VARIAVEL_MENSAL'
  | 'IMPOSTO_PAGO_E_RETIDO'
  | 'EVIDENCIAS_E_CONFIRMACOES';

export type ReportingCategoryStatus =
  | 'OFFICIAL'
  | 'PROVISIONAL'
  | 'UNSUPPORTED'
  | 'REQUIRES_CONFIRMATION';

export interface AnnualTaxReportingItem {
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

export interface AnnualTaxReportingSectionSummary {
  readonly section: AnnualTaxReportingSection;
  readonly title: string;
  readonly status: AnnualTaxReadinessStatus;
  readonly isComplete: boolean;
  readonly itemCount: number;
  readonly items: readonly AnnualTaxReportingItem[];
  readonly blockingReasons: readonly string[];
}

export interface AnnualTaxReportingPackage {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly overallStatus: AnnualTaxReadinessStatus;
  readonly isReadyForReporting: boolean;
  readonly reportingRuleVersion: string;
  readonly generatedAt: string;
  readonly sections: readonly AnnualTaxReportingSectionSummary[];
  readonly blockedItems: readonly AnnualTaxReportingItem[];
  readonly pendingConfirmations: readonly AnnualTaxReportingItem[];
  readonly packageFingerprint: string;
  readonly disclaimer: string;
}

export const ANNUAL_REPORTING_DISCLAIMER =
  'Documento de suporte e conferência para a Declaração de Ajuste Anual (DIRPF). Não substitui o Programa Gerador da Declaração (PGD) da Receita Federal nem constitui recibo de entrega ou transmissão oficial.';

export function computeReportingPackageFingerprint(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

