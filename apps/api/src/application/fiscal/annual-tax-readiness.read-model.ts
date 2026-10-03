import {
  AnnualTaxReadinessAssessment,
  AnnualReadinessSectionSummary,
  AnnualEvidenceRequirement,
  AnnualTaxReadinessStatus,
  TaxpayerConfirmation,
} from '@atlas/tax-engine';
import { TaxpayerConfirmationRow } from '@atlas/database';

export interface TaxpayerConfirmationReadModel {
  id: string;
  taxSubjectId: string;
  calendarYear: number;
  confirmationType: string;
  subjectReference: string;
  decision: string;
  statementVersion: string;
  sourceFingerprint: string;
  source: string;
  createdByPrincipal: string;
  revision: number;
  fingerprint: string;
  supersedesId: string | null;
  notes: string | null;
  confirmedAt: string;
  createdAt: string;
  updatedAt: string;
}

export function mapTaxpayerConfirmationRowToReadModel(
  row: TaxpayerConfirmationRow,
): TaxpayerConfirmationReadModel {
  return {
    id: row.id,
    taxSubjectId: row.taxSubjectId,
    calendarYear: row.calendarYear,
    confirmationType: row.confirmationType,
    subjectReference: row.subjectReference,
    decision: row.decision,
    statementVersion: row.statementVersion,
    sourceFingerprint: row.sourceFingerprint,
    source: row.source,
    createdByPrincipal: row.createdByPrincipal,
    revision: row.revision,
    fingerprint: row.fingerprint,
    supersedesId: row.supersedesId,
    notes: row.notes,
    confirmedAt: row.confirmedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapTaxpayerConfirmationRowToDomain(
  row: TaxpayerConfirmationRow,
): TaxpayerConfirmation {
  return {
    id: row.id,
    userId: row.taxSubjectId,
    calendarYear: row.calendarYear,
    scope: row.confirmationType as TaxpayerConfirmation['scope'],
    subjectId: row.subjectReference,
    status: (row.supersedesId ? 'CONFIRMED' : 'CONFIRMED') as TaxpayerConfirmation['status'],
    sourceFingerprint: row.sourceFingerprint,
    notes: row.notes,
    metadata: null,
    revision: row.revision,
    confirmedAt: row.confirmedAt.toISOString(),
    revokedAt: null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface AnnualTaxReadinessReadModel {
  calendarYear: number;
  declarationExercise: number;
  overallStatus: AnnualTaxReadinessStatus;
  isReadyForDirpf: boolean;
  sections: ReadonlyArray<AnnualReadinessSectionSummary>;
  requirements: ReadonlyArray<AnnualEvidenceRequirement>;
  confirmations: ReadonlyArray<TaxpayerConfirmationReadModel>;
  blockingReasons: ReadonlyArray<string>;
  fingerprint: string;
}

export function mapAssessmentToReadModel(
  assessment: AnnualTaxReadinessAssessment,
  confirmationRows: TaxpayerConfirmationRow[],
): AnnualTaxReadinessReadModel {
  return {
    calendarYear: assessment.calendarYear,
    declarationExercise: assessment.declarationExercise,
    overallStatus: assessment.overallStatus,
    isReadyForDirpf: assessment.isReadyForDirpf,
    sections: assessment.sections,
    requirements: assessment.requirements,
    confirmations: confirmationRows.map(mapTaxpayerConfirmationRowToReadModel),
    blockingReasons: assessment.blockingReasons,
    fingerprint: assessment.fingerprint,
  };
}
