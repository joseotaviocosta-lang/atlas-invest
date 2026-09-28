import { colors } from '../tokens/colors';
import { fiscalQualityIssueLabel } from './fiscal-monthly.view-model';

/**
 * Tax-input readiness view-model (Phase 4B.2, ADR-252).
 *
 * Presentation only: shows whether canonical tax inputs are available. NEVER
 * calculates tax and NEVER fabricates availability.
 */

export interface RawTaxInputReadiness {
  competence: string;
  tradeClassificationStatus: string;
  withholdingStatus: string;
  fiiMetadataStatus: string;
  issues: string[];
  capabilities: {
    tradeClassificationComplete: boolean;
    withholdingComplete: boolean;
    fiiMetadataComplete: boolean;
  };
  classificationCoverage: { required: number; classified: number; unknown: number };
  provenanceReferences: string[];
  rows: Array<{ key: string; label: string; status: string; available: boolean }>;
  productionTaxLiabilityEnabled: boolean;
  ruleCoverage: 'AVAILABLE' | 'UNAVAILABLE';
  liabilityStatus: 'AVAILABLE' | 'BLOCKED';
  productionVerifiedRuleCount: number;
}

export interface TaxInputReadinessRowVM {
  key: string;
  label: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  available: boolean;
}

export interface TaxInputReadinessViewModel {
  competence: string;
  competenceLabel: string;
  rows: TaxInputReadinessRowVM[];
  issues: string[];
  issueLabels: string[];
  classificationCoverage: { required: number; classified: number; unknown: number };
  productionTaxLiabilityEnabled: boolean;
  ruleCoverage: 'AVAILABLE' | 'UNAVAILABLE';
  liabilityStatus: 'AVAILABLE' | 'BLOCKED';
  ruleCoverageLabel: string;
  ruleCoverageColor: string;
  liabilityStatusLabel: string;
  liabilityStatusColor: string;
  notice: string;
  accessibilitySummary: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  COMPLETE: { label: 'Disponível', color: colors.positive },
  PARTIAL: { label: 'Incompleto', color: colors.warning },
  MISSING: { label: 'Ausente', color: colors.warning },
  UNKNOWN: { label: 'Desconhecido', color: colors.warning },
  NOT_REQUIRED: { label: 'Não aplicável', color: colors.textMuted },
};

export function mapToTaxInputReadinessViewModel(
  data: RawTaxInputReadiness | null,
): TaxInputReadinessViewModel | null {
  if (!data) return null;
  const [year, month] = data.competence.split('-');

  const rows: TaxInputReadinessRowVM[] = data.rows.map((row) => {
    const presentation = STATUS_LABELS[row.status] ?? {
      label: row.status,
      color: colors.textMuted,
    };
    return {
      key: row.key,
      label: row.label,
      status: row.status,
      statusLabel: presentation.label,
      statusColor: presentation.color,
      available: row.available,
    };
  });

  const issueLabels = (data.issues ?? []).map(fiscalQualityIssueLabel);

  const notice =
    'Dados necessários para apuração (Fase 4B.2/4B.3). A presença destes dados não ativa ' +
    'cálculo de imposto: a cobertura de regras tributárias de produção é avaliada separadamente.';

  const ruleCoverageLabel = data.ruleCoverage === 'AVAILABLE' ? 'Disponíveis' : 'Indisponíveis';
  const ruleCoverageColor = data.ruleCoverage === 'AVAILABLE' ? colors.positive : colors.textMuted;
  const liabilityStatusLabel = data.liabilityStatus === 'AVAILABLE' ? 'Disponível' : 'Bloqueada';
  const liabilityStatusColor =
    data.liabilityStatus === 'AVAILABLE' ? colors.positive : colors.warning;

  const accessibilitySummary =
    `Competência ${month}/${year}: ` +
    rows.map((r) => `${r.label}: ${r.statusLabel}`).join('; ') +
    `. Regras tributárias: ${ruleCoverageLabel}. Apuração: ${liabilityStatusLabel}.` +
    (issueLabels.length > 0 ? ` Pendências: ${issueLabels.join('; ')}.` : '');

  return {
    competence: data.competence,
    competenceLabel: `${month}/${year}`,
    rows,
    issues: data.issues,
    issueLabels,
    classificationCoverage: data.classificationCoverage,
    productionTaxLiabilityEnabled: data.productionTaxLiabilityEnabled,
    ruleCoverage: data.ruleCoverage,
    liabilityStatus: data.liabilityStatus,
    ruleCoverageLabel,
    ruleCoverageColor,
    liabilityStatusLabel,
    liabilityStatusColor,
    notice,
    accessibilitySummary,
  };
}

export function taxInputReadinessQueryKey(competence: string): readonly string[] {
  return ['fiscal-input-readiness', competence] as const;
}
