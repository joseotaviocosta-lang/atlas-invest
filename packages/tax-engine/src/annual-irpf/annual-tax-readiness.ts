import { createHash } from 'crypto';

export type AnnualTaxReadinessStatus =
  'READY' | 'PARTIAL' | 'REQUIRES_CONFIRMATION' | 'BLOCKED' | 'NO_ACTIVITY';

export const READINESS_STATUS_SEVERITY: Record<AnnualTaxReadinessStatus, number> = {
  BLOCKED: 4,
  REQUIRES_CONFIRMATION: 3,
  PARTIAL: 2,
  READY: 1,
  NO_ACTIVITY: 0,
};

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

export type TaxpayerConfirmationScope =
  | 'DIVIDEND_TRANSITION_EVIDENCE'
  | 'FII_EXEMPTION_REQUIREMENTS'
  | 'OPENING_COST_BASIS'
  | 'WITHHOLDING_PROOF'
  | 'GENERAL_TAX_DATA';

export type TaxpayerConfirmationStatus = 'CONFIRMED' | 'REVOKED' | 'SUPERSEDED';

export type EvidenceRequirementStatus = 'PENDING' | 'SATISFIED' | 'WAIVED' | 'STALE';

export interface TaxpayerConfirmation {
  readonly id: string;
  readonly userId: string;
  readonly calendarYear: number;
  readonly scope: TaxpayerConfirmationScope;
  readonly subjectId: string;
  readonly status: TaxpayerConfirmationStatus;
  readonly sourceFingerprint: string;
  readonly notes?: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly revision: number;
  readonly confirmedAt: string;
  readonly revokedAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AnnualEvidenceRequirement {
  readonly requirementId: string;
  readonly section: AnnualReadinessSectionKey;
  readonly subjectId: string;
  readonly title: string;
  readonly description: string;
  readonly status: EvidenceRequirementStatus;
  readonly blockingReason: string;
  readonly sourceFingerprint: string;
  readonly satisfiedByConfirmationId?: string;
  readonly actionableUrl?: string;
}

export interface AnnualReadinessSectionSummary {
  readonly section: AnnualReadinessSectionKey;
  readonly title: string;
  readonly status: AnnualTaxReadinessStatus;
  readonly isComplete: boolean;
  readonly blockingReasons: readonly string[];
  readonly requirementIds: readonly string[];
}

export interface AnnualTaxReadinessAssessment {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly overallStatus: AnnualTaxReadinessStatus;
  readonly isReadyForDirpf: boolean;
  readonly sections: readonly AnnualReadinessSectionSummary[];
  readonly requirements: readonly AnnualEvidenceRequirement[];
  readonly confirmations: readonly TaxpayerConfirmation[];
  readonly blockingReasons: readonly string[];
  readonly fingerprint: string;
}

export function resolveOverallReadinessStatus(
  sectionStatuses: AnnualTaxReadinessStatus[],
): AnnualTaxReadinessStatus {
  if (sectionStatuses.length === 0) {
    return 'NO_ACTIVITY';
  }
  let maxSeverity = -1;
  let highestStatus: AnnualTaxReadinessStatus = 'NO_ACTIVITY';

  for (const st of sectionStatuses) {
    const sev = READINESS_STATUS_SEVERITY[st];
    if (sev > maxSeverity) {
      maxSeverity = sev;
      highestStatus = st;
    }
  }

  return highestStatus;
}

export function computeReadinessFingerprint(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
