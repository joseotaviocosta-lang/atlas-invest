import type { TaxInputReadiness, TaxInputReadinessStatus } from '@atlas/tax-engine';

export interface TaxInputReadinessRowReadModel {
  readonly key: string;
  readonly label: string;
  readonly status: TaxInputReadinessStatus;
  readonly available: boolean;
}

export interface TaxInputReadinessReadModel {
  readonly competence: string;
  readonly tradeClassificationStatus: TaxInputReadinessStatus;
  readonly withholdingStatus: TaxInputReadinessStatus;
  readonly fiiMetadataStatus: TaxInputReadinessStatus;
  readonly issues: readonly string[];
  readonly capabilities: {
    readonly tradeClassificationComplete: boolean;
    readonly withholdingComplete: boolean;
    readonly fiiMetadataComplete: boolean;
  };
  readonly classificationCoverage: {
    readonly required: number;
    readonly classified: number;
    readonly unknown: number;
  };
  readonly provenanceReferences: readonly string[];
  readonly rows: readonly TaxInputReadinessRowReadModel[];
  /** True when at least one VERIFIED production rule exists (rule coverage). */
  readonly productionTaxLiabilityEnabled: boolean;
  /** Rule coverage is distinct from input readiness (ADR-261). */
  readonly ruleCoverage: 'AVAILABLE' | 'UNAVAILABLE';
  readonly liabilityStatus: 'AVAILABLE' | 'BLOCKED';
  readonly productionVerifiedRuleCount: number;
}

export function mapTaxInputReadinessToReadModel(
  readiness: TaxInputReadiness,
  ruleCoverage: { readonly verifiedRuleCount: number },
): TaxInputReadinessReadModel {
  const rulesAvailable = ruleCoverage.verifiedRuleCount > 0;
  return {
    competence: readiness.competence.value,
    tradeClassificationStatus: readiness.tradeClassificationStatus,
    withholdingStatus: readiness.withholdingStatus,
    fiiMetadataStatus: readiness.fiiMetadataStatus,
    issues: readiness.issues,
    capabilities: readiness.capabilities,
    classificationCoverage: readiness.classificationCoverage,
    provenanceReferences: readiness.provenanceReferences,
    rows: [
      {
        key: 'tradeClassification',
        label: 'Classificação de operações',
        status: readiness.tradeClassificationStatus,
        available: readiness.capabilities.tradeClassificationComplete,
      },
      {
        key: 'withholding',
        label: 'Retenções/IRRF',
        status: readiness.withholdingStatus,
        available: readiness.capabilities.withholdingComplete,
      },
      {
        key: 'fiiMetadata',
        label: 'Dados fiscais de FII',
        status: readiness.fiiMetadataStatus,
        available: readiness.capabilities.fiiMetadataComplete,
      },
    ],
    productionTaxLiabilityEnabled: rulesAvailable,
    ruleCoverage: rulesAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
    liabilityStatus: rulesAvailable ? 'AVAILABLE' : 'BLOCKED',
    productionVerifiedRuleCount: ruleCoverage.verifiedRuleCount,
  };
}
