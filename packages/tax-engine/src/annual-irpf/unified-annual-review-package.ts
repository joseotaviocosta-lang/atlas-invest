import { createHash } from 'crypto';
import { stableStringify, type FilingSupportNote } from './high-income-review-package';
import {
  UNIFIED_MODULE_ORDER,
  type UnifiedAnnualIrpfState,
  type UnifiedAnnualStatus,
  type UnifiedConsistencyIssue,
  type UnifiedModuleId,
  type UnifiedModuleSummary,
  type UnifiedRequirement,
  type UnifiedRuleVersions,
} from './unified-annual-irpf';
import {
  UnifiedAnnualReviewFilingRegistry,
  unifiedExerciseLabel,
} from './unified-annual-review-package-registry';

/**
 * Phase 4J.2 — Unified Annual Review / Support Package.
 *
 * Pure, deterministic SUPPORT/REVIEW projection over the already-computed
 * 4J.1 `UnifiedAnnualIrpfState`. It arranges, labels and serializes the
 * unified annual state for user/accountant review, filing-support guidance,
 * export and provenance inspection. It performs NO tax math, introduces NO
 * second tax engine, recomputes NOTHING from the ledger or the 4H/4I engines,
 * uses NO float (canonical decimal strings only), persists NOTHING, and emits
 * NOTHING resembling a Receita file, DIRPF transmission, DARF, payment,
 * refund or Tax-AI output.
 *
 * Canonical flow:
 *   4H + 4I → 4J.1 UnifiedAnnualIrpfState → 4J.2 UnifiedAnnualReviewPackage
 *
 * This is NOT an official Receita file, DIRPF transmission, declaration
 * submission, Receita validation, payment instrument or DARF generator.
 */

export const UNIFIED_ANNUAL_REVIEW_PACKAGE_VERSION = 'unified-annual-review-package-v1';

/** Compulsory human-review banner carried verbatim in every exported human artifact. */
export const UNIFIED_ANNUAL_REVIEW_BANNER =
  'DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL';

/**
 * Build the compulsory support-only disclaimer for an annual identity.
 * Deterministic from (calendarYear, declarationExercise); carries no PII.
 */
export function buildUnifiedAnnualReviewDisclaimer(
  calendarYear: number,
  declarationExercise: number,
): string {
  return (
    'DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL. ' +
    'Pacote de revisão e conferência anual unificada do IRPF (módulos 4H e tributação ' +
    'mínima de alta renda — IRPFM, Lei 15.270/2025), referente ao ' +
    `Exercício ${declarationExercise} (ano-calendário ${calendarYear}). Não constitui ` +
    'transmissão, validação ou aceitação pela Receita Federal, não é DIRPF, DARF, ' +
    'pagamento, restituição nem declaração enviada.'
  );
}

// ---------------------------------------------------------------------------
// Sections A–H
// ---------------------------------------------------------------------------

export interface SectionAAnnualIdentity {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly packageVersion: string;
  readonly generatedAt: string;
}

export interface SectionBGlobalReadiness {
  /** Verbatim copy of the 4J.1 global status — never more optimistic. */
  readonly globalStatus: UnifiedAnnualStatus;
  readonly moduleCount: number;
  readonly readyCount: number;
  readonly actionRequiredCount: number;
  readonly blockedCount: number;
  readonly noActivityCount: number;
  readonly notApplicableCount: number;
  readonly unsupportedCount: number;
  readonly blockingIssueCount: number;
  readonly requirementCount: number;
}

export interface SectionCModuleRow {
  readonly module: UnifiedModuleId;
  readonly source: UnifiedModuleSummary['source'];
  readonly status: UnifiedModuleSummary['status'];
  readonly authoritative: boolean;
  readonly blockingReasons: readonly string[];
  readonly requirementsCount: number;
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string | null;
  /** UI route metadata for the existing detailed 4H/4I page, or null. No IDs. */
  readonly deepLink: string | null;
}

export interface SectionCModuleSummary {
  readonly modules: readonly SectionCModuleRow[];
}

export interface SectionDRequirementRow {
  /** Canonical semantic key copied verbatim from 4J.1 (never a DB UUID). */
  readonly key: string;
  readonly module: UnifiedModuleId;
  readonly category: string;
  /** Normalized display reference copied verbatim (never a raw DB id). */
  readonly subjectDisplay: string;
  readonly status: string;
  /** True unless SATISFIED/WAIVED. Derived, not new requirement logic. */
  readonly blocking: boolean;
  readonly blockingReason: string | null;
  /** Deterministic support label from the closed action map. */
  readonly recommendedAction: string;
  readonly deepLink: string | null;
}

export interface SectionDActionRequirements {
  readonly requirements: readonly SectionDRequirementRow[];
}

export interface SectionEConsistencyRow {
  readonly code: UnifiedConsistencyIssue['code'];
  readonly severity: UnifiedConsistencyIssue['severity'];
  readonly modules: readonly UnifiedModuleId[];
  readonly blocking: boolean;
  readonly explanation: string;
  readonly recommendedAction: string;
}

export interface SectionECrossModuleConsistency {
  readonly issues: readonly SectionEConsistencyRow[];
}

export interface SectionFFilingSupport {
  readonly notes: readonly FilingSupportNote[];
  readonly exerciseLabel: string;
}

export interface SectionGModuleProvenance {
  readonly module: UnifiedModuleId;
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string | null;
}

export interface SectionGProvenance {
  readonly annualFingerprint: string;
  readonly sourceFingerprint: string;
  readonly moduleFingerprints: readonly SectionGModuleProvenance[];
  readonly packageFingerprint: string;
  readonly packageVersion: string;
  readonly ruleVersions: UnifiedRuleVersions;
}

export interface SectionHDisclaimer {
  readonly text: string;
}

export interface UnifiedAnnualReviewPackage {
  readonly packageVersion: string;
  /** Verbatim 4J.1 global status. READY_FOR_REVIEW ≠ filed/submitted/paid. */
  readonly status: UnifiedAnnualStatus;
  readonly generatedAt: string;
  readonly packageFingerprint: string;
  readonly disclaimer: string;
  readonly sectionAIdentity: SectionAAnnualIdentity;
  readonly sectionBReadiness: SectionBGlobalReadiness;
  readonly sectionCModules: SectionCModuleSummary;
  readonly sectionDRequirements: SectionDActionRequirements;
  readonly sectionEConsistency: SectionECrossModuleConsistency;
  readonly sectionFFilingSupport: SectionFFilingSupport;
  readonly sectionGProvenance: SectionGProvenance;
  readonly sectionHDisclaimer: SectionHDisclaimer;
}

export interface UnifiedAnnualReviewFingerprintInput {
  readonly packageVersion: string;
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly annualFingerprint: string;
  readonly ruleVersions: UnifiedRuleVersions;
  readonly modules: ReadonlyArray<{
    readonly module: UnifiedModuleId;
    readonly status: string;
    readonly authoritative: boolean;
    readonly blockingReasons: readonly string[];
    readonly requirementsCount: number;
    readonly sourceFingerprint: string;
    readonly calculationFingerprint: string | null;
    readonly deepLink: string | null;
  }>;
  readonly requirements: ReadonlyArray<{
    readonly key: string;
    readonly module: string;
    readonly category: string;
    readonly subjectDisplay: string;
    readonly status: string;
    readonly blocking: boolean;
    readonly blockingReason: string | null;
    readonly recommendedAction: string;
  }>;
  readonly consistencyIssues: ReadonlyArray<{
    readonly code: string;
    readonly severity: string;
    readonly modules: readonly string[];
    readonly blocking: boolean;
  }>;
  readonly filingNotes: ReadonlyArray<{
    readonly mappingStatus: string;
    readonly legalReference: string;
    readonly text: string;
  }>;
}

export interface BuildUnifiedAnnualReviewPackageOptions {
  readonly generatedAt: string;
}

// ---------------------------------------------------------------------------
// Closed support-label maps (labeling only; never creates requirements)
// ---------------------------------------------------------------------------

/** UI route metadata for the existing detailed 4H/4I pages. No internal IDs. */
const MODULE_DEEP_LINKS: Readonly<Record<UnifiedModuleId, string | null>> = {
  ANNUAL_POSITIONS: '/portfolio',
  CAPITAL_MARKETS: null,
  INVESTMENT_INCOME: null,
  READINESS_EVIDENCE: null,
  HIGH_INCOME_MINIMUM_TAX: '/tax/high-income',
};

const DEFAULT_RECOMMENDED_ACTION =
  'Revisar a pendência no detalhe do módulo e concluir a ação indicada.';

/**
 * Closed deterministic map from `${module}::${category}` to a support action
 * label. Unknown combinations fall back to the generic default (never an
 * invented requirement, never tax advice).
 */
const REQUIREMENT_ACTIONS: Readonly<Record<string, string>> = {
  'READINESS_EVIDENCE::OPENING_POSITIONS':
    'Informar a posição de abertura (custódia e custo histórico) anterior ao livro-razão e aguardar confirmação.',
  'READINESS_EVIDENCE::ANNUAL_POSITIONS':
    'Revisar as posições com custo desconhecido e completar a documentação de aquisição.',
  'READINESS_EVIDENCE::CAPITAL_MARKET_FISCAL':
    'Revisar o resumo de mercado de capitais do período indicado.',
  'READINESS_EVIDENCE::PAYMENTS_6015': 'Verificar as obrigações e os pagamentos 6015 do período.',
  'READINESS_EVIDENCE::TRANSITION_EVIDENCE':
    'Anexar a comprovação de transição aplicável ao rendimento indicado.',
  'READINESS_EVIDENCE::FII_ELIGIBILITY':
    'Confirmar os requisitos de elegibilidade do FII para o rendimento indicado.',
  'READINESS_EVIDENCE::WITHHOLDING_EVIDENCE':
    'Registrar a evidência de retenção (IRRF) correspondente.',
  'READINESS_EVIDENCE::INVESTMENT_INCOME':
    'Revisar os rendimentos de investimento do período indicado.',
  'READINESS_EVIDENCE::TAXPAYER_CONFIRMATIONS': 'Revisar e confirmar a informação solicitada.',
  'HIGH_INCOME_MINIMUM_TAX::CORPORATE_EFFECTIVE_TAX_EVIDENCE':
    'Anexar a documentação contábil da fonte pagadora (lucro, IR e CSLL).',
  'HIGH_INCOME_MINIMUM_TAX::ANNUAL_ADJUSTMENT_TAX_DUE':
    'Informar o IR devido no ajuste anual correspondente.',
  'HIGH_INCOME_MINIMUM_TAX::ANNUAL_INCOME_TOTAL':
    'Confirmar o total de rendimentos anuais indicado.',
};

function recommendedActionFor(module: string, category: string): string {
  return REQUIREMENT_ACTIONS[`${module}::${category}`] ?? DEFAULT_RECOMMENDED_ACTION;
}

const CONSISTENCY_GUIDANCE: Readonly<
  Record<string, { readonly explanation: string; readonly recommendedAction: string }>
> = {
  YEAR_MISMATCH: {
    explanation: 'Módulos referem-se a anos-calendário diferentes do ano solicitado.',
    recommendedAction: 'Verificar o ano-calendário de cada módulo e recarregar o período correto.',
  },
  EXERCISE_MISMATCH: {
    explanation: 'Módulo declara exercício divergente do exercício canônico (ano + 1).',
    recommendedAction: 'Verificar o exercício declarado e recarregar o período correto.',
  },
  SOURCE_FINGERPRINT_MISMATCH: {
    explanation: 'A apuração de alta renda foi calculada sobre revisão diferente dos fatos anuais.',
    recommendedAction:
      'Recarregar o estado unificado para reconstruir a apuração sobre os fatos atuais.',
  },
  PAYER_IDENTITY_MISMATCH: {
    explanation:
      'A apuração de alta renda referencia fonte pagadora ausente dos rendimentos anuais.',
    recommendedAction: 'Conferir a identidade da fonte pagadora entre rendimentos e evidências.',
  },
  STALE_CONFIRMATION: {
    explanation: 'Confirmação ou evidência exigida está desatualizada diante dos fatos atuais.',
    recommendedAction: 'Revisar novamente a confirmação ou evidência desatualizada.',
  },
  CONFLICTING_EVIDENCE: {
    explanation: 'Evidência em conflito exige resolução explícita.',
    recommendedAction: 'Resolver o conflito de evidência na origem antes de revisar.',
  },
  UPSTREAM_NOT_READY: {
    explanation: 'Módulo de origem não está pronto; a apuração dependente não é autoritativa.',
    recommendedAction: 'Aguardar a prontidão do módulo de origem e recarregar.',
  },
  ANNUAL_AMOUNT_MISMATCH: {
    explanation: 'Divergência informativa de valores agregados entre regimes.',
    recommendedAction: 'Conferir os valores agregados; por padrão não bloqueia a revisão.',
  },
};

const DEFAULT_CONSISTENCY_GUIDANCE = {
  explanation: 'Inconsistência entre módulos detectada na orquestração anual.',
  recommendedAction: 'Revisar os módulos indicados e recarregar o estado unificado.',
};

function guidanceFor(code: string): {
  readonly explanation: string;
  readonly recommendedAction: string;
} {
  return CONSISTENCY_GUIDANCE[code] ?? DEFAULT_CONSISTENCY_GUIDANCE;
}

// ---------------------------------------------------------------------------
// Deterministic ordering helpers (defensive: input order never leaks)
// ---------------------------------------------------------------------------

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function moduleOrderIndex(module: UnifiedModuleId): number {
  return UNIFIED_MODULE_ORDER.indexOf(module);
}

function sortModuleRows(rows: readonly SectionCModuleRow[]): readonly SectionCModuleRow[] {
  return [...rows].sort((a, b) => moduleOrderIndex(a.module) - moduleOrderIndex(b.module));
}

function sortRequirementRows(
  rows: readonly SectionDRequirementRow[],
): readonly SectionDRequirementRow[] {
  return [...rows].sort((a, b) => compareStrings(a.key, b.key));
}

function sortConsistencyRows(
  rows: readonly SectionEConsistencyRow[],
): readonly SectionEConsistencyRow[] {
  return [...rows].sort(
    (a, b) =>
      compareStrings(a.code, b.code) ||
      compareStrings(a.severity, b.severity) ||
      compareStrings(a.modules.join(','), b.modules.join(',')),
  );
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function computeUnifiedAnnualReviewPackageFingerprint(
  canonicalContent: UnifiedAnnualReviewFingerprintInput,
): string {
  return sha256Hex(stableStringify(canonicalContent));
}

// ---------------------------------------------------------------------------
// Pure assembler
// ---------------------------------------------------------------------------

function isUnresolvedRequirementStatus(status: string): boolean {
  return status !== 'SATISFIED' && status !== 'WAIVED';
}

function toModuleRow(summary: UnifiedModuleSummary): SectionCModuleRow {
  return {
    module: summary.module,
    source: summary.source,
    status: summary.status,
    authoritative: summary.authoritative,
    blockingReasons: [...summary.blockingReasons].sort(compareStrings),
    requirementsCount: summary.requirements.length,
    sourceFingerprint: summary.sourceFingerprint,
    calculationFingerprint: summary.calculationFingerprint,
    deepLink: MODULE_DEEP_LINKS[summary.module],
  };
}

function toRequirementRow(requirement: UnifiedRequirement): SectionDRequirementRow {
  const blocking = isUnresolvedRequirementStatus(requirement.status);
  return {
    key: requirement.key,
    module: requirement.module,
    category: requirement.category,
    subjectDisplay: requirement.subjectReference,
    status: requirement.status,
    blocking,
    blockingReason: requirement.blockingReason,
    recommendedAction: recommendedActionFor(requirement.module, requirement.category),
    deepLink: MODULE_DEEP_LINKS[requirement.module],
  };
}

function toConsistencyRow(issue: UnifiedConsistencyIssue): SectionEConsistencyRow {
  const guidance = guidanceFor(issue.code);
  const modules = [...issue.modules].sort(
    (a, b) => moduleOrderIndex(a) - moduleOrderIndex(b) || compareStrings(a, b),
  );
  return {
    code: issue.code,
    severity: issue.severity,
    modules,
    blocking: issue.severity === 'BLOCKING',
    explanation: guidance.explanation,
    recommendedAction: guidance.recommendedAction,
  };
}

/**
 * Pure, deterministic assembler. Copies the 4J.1 state verbatim into review
 * sections, applies only closed support labels, and fingerprints the canonical
 * content (generatedAt excluded). No I/O, no `Date.now`, no float, no tax math.
 */
export function buildUnifiedAnnualReviewPackage(
  state: UnifiedAnnualIrpfState,
  options: BuildUnifiedAnnualReviewPackageOptions,
): UnifiedAnnualReviewPackage {
  const { calendarYear, declarationExercise } = state.identity;
  const disclaimer = buildUnifiedAnnualReviewDisclaimer(calendarYear, declarationExercise);

  const moduleRows = sortModuleRows(state.modules.map(toModuleRow));
  const requirementRows = sortRequirementRows(state.requirements.map(toRequirementRow));
  const consistencyRows = sortConsistencyRows(state.consistencyIssues.map(toConsistencyRow));
  const filingNotes = [...UnifiedAnnualReviewFilingRegistry.getNotes()];
  const exerciseLabel = unifiedExerciseLabel(calendarYear, declarationExercise);

  const annualFingerprint = state.identity.annualFingerprint;
  const packageFingerprint = computeUnifiedAnnualReviewPackageFingerprint({
    packageVersion: UNIFIED_ANNUAL_REVIEW_PACKAGE_VERSION,
    calendarYear,
    declarationExercise,
    annualFingerprint,
    ruleVersions: state.identity.ruleVersions,
    modules: moduleRows.map((m) => ({
      module: m.module,
      status: m.status,
      authoritative: m.authoritative,
      blockingReasons: [...m.blockingReasons],
      requirementsCount: m.requirementsCount,
      sourceFingerprint: m.sourceFingerprint,
      calculationFingerprint: m.calculationFingerprint,
      deepLink: m.deepLink,
    })),
    requirements: requirementRows.map((r) => ({
      key: r.key,
      module: r.module,
      category: r.category,
      subjectDisplay: r.subjectDisplay,
      status: r.status,
      blocking: r.blocking,
      blockingReason: r.blockingReason,
      recommendedAction: r.recommendedAction,
    })),
    consistencyIssues: consistencyRows.map((i) => ({
      code: i.code,
      severity: i.severity,
      modules: [...i.modules],
      blocking: i.blocking,
    })),
    filingNotes: filingNotes.map((n) => ({
      mappingStatus: n.mappingStatus,
      legalReference: n.legalReference,
      text: n.text,
    })),
  });

  return {
    packageVersion: UNIFIED_ANNUAL_REVIEW_PACKAGE_VERSION,
    status: state.identity.status,
    generatedAt: options.generatedAt,
    packageFingerprint,
    disclaimer,
    sectionAIdentity: {
      calendarYear,
      declarationExercise,
      packageVersion: UNIFIED_ANNUAL_REVIEW_PACKAGE_VERSION,
      generatedAt: options.generatedAt,
    },
    sectionBReadiness: {
      globalStatus: state.identity.status,
      moduleCount: state.summary.moduleCount,
      readyCount: state.summary.readyCount,
      actionRequiredCount: state.summary.actionRequiredCount,
      blockedCount: state.summary.blockedCount,
      noActivityCount: state.summary.noActivityCount,
      notApplicableCount: state.summary.notApplicableCount,
      unsupportedCount: state.summary.unsupportedCount,
      blockingIssueCount: state.summary.blockingIssueCount,
      requirementCount: requirementRows.length,
    },
    sectionCModules: { modules: moduleRows },
    sectionDRequirements: { requirements: requirementRows },
    sectionEConsistency: { issues: consistencyRows },
    sectionFFilingSupport: { notes: filingNotes, exerciseLabel },
    sectionGProvenance: {
      annualFingerprint,
      sourceFingerprint: state.identity.sourceFingerprint,
      moduleFingerprints: moduleRows.map((m) => ({
        module: m.module,
        sourceFingerprint: m.sourceFingerprint,
        calculationFingerprint: m.calculationFingerprint,
      })),
      packageFingerprint,
      packageVersion: UNIFIED_ANNUAL_REVIEW_PACKAGE_VERSION,
      ruleVersions: state.identity.ruleVersions,
    },
    sectionHDisclaimer: { text: disclaimer },
  };
}
