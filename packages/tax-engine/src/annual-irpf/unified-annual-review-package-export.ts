import { escapeCsvCell } from './csv-escape';
import {
  UNIFIED_ANNUAL_REVIEW_BANNER,
  type UnifiedAnnualReviewPackage,
} from './unified-annual-review-package';

/**
 * Phase 4J.2 — Unified Annual Review Package serialization (JSON + CSV).
 *
 * Pure serializers over the already-built `UnifiedAnnualReviewPackage`. No
 * tax math, no float, no PII beyond what the package already carries (the
 * package itself carries no subject id, DB UUID, token or stack).
 */

export function serializeUnifiedAnnualReviewPackageToJson(pkg: UnifiedAnnualReviewPackage): string {
  return JSON.stringify(pkg);
}

function simNao(value: boolean): string {
  return value ? 'SIM' : 'NAO';
}

function cell(value: string | null): string {
  return escapeCsvCell(value ?? '');
}

/**
 * Export the package as a `;`-delimited, CRLF, OWASP-escaped CSV support
 * document. Every cell passes through the shared `escapeCsvCell`; the header
 * carries the compulsory support-only banner verbatim.
 */
export function exportUnifiedAnnualReviewPackageToCsv(pkg: UnifiedAnnualReviewPackage): string {
  const lines: string[] = [
    `# ${UNIFIED_ANNUAL_REVIEW_BANNER}`,
    '# PROJECT ATLAS - RELATORIO DE APOIO IRPF ANUAL UNIFICADO',
    `# Ano-calendario: ${pkg.sectionAIdentity.calendarYear}`,
    `# Exercicio: ${pkg.sectionAIdentity.declarationExercise}`,
    `# Status do Pacote: ${pkg.status}`,
    `# Versao do Pacote: ${pkg.packageVersion}`,
    `# Fingerprint do Pacote: ${pkg.packageFingerprint}`,
    `# Fingerprint Anual (4J.1): ${pkg.sectionGProvenance.annualFingerprint}`,
    `# Gerado em: ${pkg.generatedAt}`,
    `# AVISO LEGAL: ${pkg.disclaimer}`,
    '',
    'SECAO A - IDENTIDADE ANUAL',
    'Campo;Valor',
    `Ano-calendario;${pkg.sectionAIdentity.calendarYear}`,
    `Exercicio;${pkg.sectionAIdentity.declarationExercise}`,
    `Versao do Pacote;${escapeCsvCell(pkg.sectionAIdentity.packageVersion)}`,
    `Gerado em;${escapeCsvCell(pkg.sectionAIdentity.generatedAt)}`,
    '',
    'SECAO B - PRONTIDAO GLOBAL',
    'Campo;Valor',
    `Status Global;${escapeCsvCell(pkg.sectionBReadiness.globalStatus)}`,
    `Modulos;${pkg.sectionBReadiness.moduleCount}`,
    `Prontos;${pkg.sectionBReadiness.readyCount}`,
    `Com Acao;${pkg.sectionBReadiness.actionRequiredCount}`,
    `Bloqueados;${pkg.sectionBReadiness.blockedCount}`,
    `Sem Movimentacao;${pkg.sectionBReadiness.noActivityCount}`,
    `Nao Aplicaveis;${pkg.sectionBReadiness.notApplicableCount}`,
    `Nao Suportados;${pkg.sectionBReadiness.unsupportedCount}`,
    `Inconsistencias Bloqueantes;${pkg.sectionBReadiness.blockingIssueCount}`,
    `Pendencias;${pkg.sectionBReadiness.requirementCount}`,
    '',
    'SECAO C - RESUMO DOS MODULOS',
    'Modulo;Fonte;Status;Autoritativo;Bloqueios;Pendencias;Fingerprint de Origem;Fingerprint de Calculo;Link',
    ...pkg.sectionCModules.modules.map((m) =>
      [
        m.module,
        m.source,
        m.status,
        simNao(m.authoritative),
        m.blockingReasons.join(' | '),
        String(m.requirementsCount),
        m.sourceFingerprint,
        m.calculationFingerprint,
        m.deepLink,
      ]
        .map((v) => cell(v))
        .join(';'),
    ),
    '',
    'SECAO D - PENDENCIAS DE ACAO',
    'Chave;Modulo;Categoria;Referencia;Status;Bloqueante;Motivo;Recomendacao;Link',
    ...pkg.sectionDRequirements.requirements.map((r) =>
      [
        r.key,
        r.module,
        r.category,
        r.subjectDisplay,
        r.status,
        simNao(r.blocking),
        r.blockingReason,
        r.recommendedAction,
        r.deepLink,
      ]
        .map((v) => cell(v))
        .join(';'),
    ),
    '',
    'SECAO E - CONSISTENCIA ENTRE MODULOS',
    'Codigo;Severidade;Bloqueante;Modulos;Explicacao;Recomendacao',
    ...pkg.sectionEConsistency.issues.map((i) =>
      [
        i.code,
        i.severity,
        simNao(i.blocking),
        i.modules.join(' | '),
        i.explanation,
        i.recommendedAction,
      ]
        .map((v) => cell(v))
        .join(';'),
    ),
    '',
    'SECAO F - APOIO A DECLARACAO',
    `Exercicio;${escapeCsvCell(pkg.sectionFFilingSupport.exerciseLabel)}`,
    'Status;Base Legal;Nota',
    ...pkg.sectionFFilingSupport.notes.map((n) =>
      [n.mappingStatus, n.legalReference, n.text].map((v) => cell(v)).join(';'),
    ),
    '',
    'SECAO G - PROVENIENCIA',
    'Campo;Valor',
    `Fingerprint Anual (4J.1);${escapeCsvCell(pkg.sectionGProvenance.annualFingerprint)}`,
    `Fingerprint de Origem;${escapeCsvCell(pkg.sectionGProvenance.sourceFingerprint)}`,
    `Fingerprint do Pacote;${escapeCsvCell(pkg.sectionGProvenance.packageFingerprint)}`,
    `Versao do Pacote;${escapeCsvCell(pkg.sectionGProvenance.packageVersion)}`,
    'Modulo;Fingerprint de Origem;Fingerprint de Calculo',
    ...pkg.sectionGProvenance.moduleFingerprints.map((m) =>
      [m.module, m.sourceFingerprint, m.calculationFingerprint].map((v) => cell(v)).join(';'),
    ),
    '',
    'SECAO H - AVISO LEGAL',
    `${escapeCsvCell(pkg.sectionHDisclaimer.text)}`,
  ];
  return `${lines.join('\r\n')}\r\n`;
}
