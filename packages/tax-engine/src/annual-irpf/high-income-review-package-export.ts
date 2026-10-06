import { HighIncomeReviewPackage, HIGH_INCOME_REVIEW_BANNER } from './high-income-review-package';
import { escapeCsvCell } from './csv-escape';

/**
 * Pure JSON serializer for the high-income review package.
 *
 * Round-trips every canonical decimal string with no precision loss (no float
 * is ever introduced). The output is the machine package exactly as assembled;
 * it carries no DB id/supersedesId/CPF/token/stack.
 */
export function serializeHighIncomeReviewPackageToJson(pkg: HighIncomeReviewPackage): string {
  return JSON.stringify(pkg);
}

/**
 * Pure, deterministic CSV exporter for the high-income annual review package.
 *
 * Semicolon-delimited, CRLF line endings, OWASP CSV-injection-safe via the shared
 * `escapeCsvCell`. The comment header carries the compulsory banner
 * 'DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL' plus the full
 * disclaimer line. Never emits evidence id/supersedesId/CPF/token/stack.
 */
export function exportHighIncomeReviewPackageToCsv(pkg: HighIncomeReviewPackage): string {
  const lines: string[] = [];
  const identity = pkg.section1Identity;

  // Metadata comments / header
  lines.push('# ==============================================================================');
  lines.push(`# ${HIGH_INCOME_REVIEW_BANNER}`);
  lines.push('# PROJECT ATLAS - RELATÓRIO DE APOIO IRPFM (TRIBUTAÇÃO MÍNIMA DE ALTA RENDA)');
  lines.push(
    `# Exercicio: ${identity.declarationExercise} (Ano-Calendario: ${identity.calendarYear})`,
  );
  lines.push(`# Status do Pacote: ${pkg.status}`);
  lines.push(`# Versao do Pacote: ${pkg.packageVersion}`);
  lines.push(`# Fingerprint do Pacote: ${pkg.packageFingerprint}`);
  lines.push(`# Gerado em: ${pkg.generatedAt}`);
  lines.push(`# AVISO LEGAL: ${pkg.disclaimer}`);
  lines.push('# ==============================================================================');
  lines.push('');

  const push = (cells: readonly unknown[]): void => {
    lines.push(cells.map(escapeCsvCell).join(';'));
  };

  // SECTION 2 — Applicability
  lines.push('# SECAO 2 - APLICABILIDADE');
  push(['Campo', 'Valor']);
  push(['Status', pkg.section2Applicability.status]);
  push(['Renda Anual Total', pkg.section2Applicability.totalAnnualIncome ?? '']);
  push(['Limite de Elegibilidade', pkg.section2Applicability.eligibilityThreshold ?? '']);
  push(['Metrica do Limite', pkg.section2Applicability.thresholdMetric]);
  push([
    'Aplicavel',
    pkg.section2Applicability.applicable === null
      ? ''
      : pkg.section2Applicability.applicable
        ? 'SIM'
        : 'NAO',
  ]);
  push(['Motivos de Bloqueio', pkg.section2Applicability.blockingReasons.join(' | ')]);
  lines.push('');

  // SECTION 3 — Income composition
  lines.push('# SECAO 3 - COMPOSICAO DA RENDA');
  push([
    'Categoria',
    'Classificacao',
    'Valor Bruto',
    'Valor Incluido',
    'Valor Excluido',
    'Qtd. Itens',
    'Fontes Pagadoras',
    'Motivo',
    'Base Legal',
  ]);
  for (const row of pkg.section3IncomeComposition.rows) {
    push([
      row.category,
      row.classification,
      row.grossAmount,
      row.includedAmount,
      row.excludedAmount,
      row.itemCount,
      row.payerIds.join(' | '),
      row.reason,
      row.legalReference,
    ]);
  }
  lines.push('');

  // SECTION 4 — Calculation
  lines.push('# SECAO 4 - CALCULO DA TRIBUTACAO MINIMA');
  push(['Campo', 'Valor']);
  push(['Base da Tributacao Minima', pkg.section4Calculation.minimumTaxBase ?? '']);
  push(['Faixa de Aliquota', pkg.section4Calculation.rateBand ?? '']);
  push(['Aliquota Minima (%)', pkg.section4Calculation.minimumRatePercentage ?? '']);
  push(['Tributo Minimo Bruto', pkg.section4Calculation.grossMinimumTax ?? '']);
  push(['Total de Creditos Suportados', pkg.section4Calculation.supportedCreditsTotal ?? '']);
  push(['Total de Reducoes Suportadas', pkg.section4Calculation.supportedReductionsTotal ?? '']);
  push([
    'Total do Redutor Societario Suportado',
    pkg.section4Calculation.corporateRedutorSupportedTotal ?? '',
  ]);
  push(['Tributo Minimo Liquido', pkg.section4Calculation.netMinimumTax ?? '']);
  push(['Excesso de Credito', pkg.section4Calculation.creditExcess ?? '']);
  push(['Liquido e Autoritativo', pkg.section4Calculation.netIsAuthoritative ? 'SIM' : 'NAO']);
  lines.push('');

  // SECTION 5 — Credits & reductions
  lines.push('# SECAO 5 - CREDITOS E REDUCOES');
  push([
    'Tipo',
    'Especie',
    'Papel',
    'Suportado',
    'Fornecido',
    'Valor',
    'Aplicado',
    'Exigido p/ Liquido',
    'Base Legal',
    'Motivo',
  ]);
  for (const credit of pkg.section5Credits.credits) {
    push([
      'CREDITO',
      credit.kind,
      credit.role,
      credit.supported ? 'SIM' : 'NAO',
      credit.provided ? 'SIM' : 'NAO',
      credit.amount ?? '',
      credit.applied ? 'SIM' : 'NAO',
      credit.requiredForNet ? 'SIM' : 'NAO',
      credit.legalReference,
      credit.reason,
    ]);
  }
  for (const reduction of pkg.section5Credits.reductions) {
    push([
      'REDUCAO',
      reduction.kind,
      reduction.role,
      reduction.supported ? 'SIM' : 'NAO',
      reduction.provided ? 'SIM' : 'NAO',
      reduction.amount ?? '',
      reduction.applied ? 'SIM' : 'NAO',
      reduction.requiredForNet ? 'SIM' : 'NAO',
      reduction.legalReference,
      reduction.reason,
    ]);
  }
  lines.push('');

  // SECTION 6 — Corporate redutor by payer
  lines.push('# SECAO 6 - REDUTOR SOCIETARIO POR FONTE PAGADORA');
  push(['Presente', pkg.section6CorporateRedutorByPayer.present ? 'SIM' : 'NAO']);
  push([
    'Fonte Pagadora',
    'Tipo',
    'Status',
    'Aliquota Referencia (%)',
    'Aliquota Efetiva PJ (%)',
    'Aliquota Efetiva PF (%)',
    'Dividendos Elegiveis',
    'Reducao Exata',
    'Status Evidencia',
    'Motivos de Bloqueio',
  ]);
  for (const payer of pkg.section6CorporateRedutorByPayer.payers) {
    push([
      payer.payerId,
      payer.payerType,
      payer.status,
      payer.referenceRatePercentage ?? '',
      payer.corporateEffectiveRatePercentage ?? '',
      payer.pfEffectiveRatePercentage,
      payer.eligibleDividends,
      payer.reductionExact,
      payer.evidenceStatus,
      payer.blockingReasons.join(' | '),
    ]);
  }
  lines.push('');

  // SECTION 7 — Readiness / evidence
  lines.push('# SECAO 7 - PRONTIDAO E EVIDENCIAS');
  push(['Contagem', 'Valor']);
  push(['Total', pkg.section7Readiness.counts.total]);
  push(['Prontas', pkg.section7Readiness.counts.ready]);
  push(['Faltantes', pkg.section7Readiness.counts.missing]);
  push(['Desatualizadas', pkg.section7Readiness.counts.stale]);
  push(['Em Conflito', pkg.section7Readiness.counts.conflicting]);
  push(['Nao Suportadas', pkg.section7Readiness.counts.unsupported]);
  lines.push('');
  push([
    'Chave',
    'Tipo de Evidencia',
    'Fonte Pagadora',
    'Autoridade',
    'Origem',
    'Status Conflito',
    'Desatualizada',
    'Revisao',
  ]);
  for (const row of pkg.section7Readiness.evidence) {
    push([
      row.rowKey,
      row.evidenceType,
      row.payerId ?? '',
      row.authority,
      row.evidenceSource,
      row.conflictStatus,
      row.stale ? 'SIM' : 'NAO',
      row.revision,
    ]);
  }
  lines.push('');

  // SECTION 8 — Provenance
  lines.push('# SECAO 8 - PROVENIENCIA');
  push(['Campo', 'Fingerprint']);
  push(['Mercado de Capitais (4H)', pkg.section8Provenance.upstreamCapitalMarketFingerprint]);
  push(['Renda (4H)', pkg.section8Provenance.upstreamIncomeFingerprint]);
  push(['Status da Renda (4H)', pkg.section8Provenance.upstreamIncomeStatus]);
  push(['Fonte (4I)', pkg.section8Provenance.sourceFingerprint]);
  push(['Calculo (4I)', pkg.section8Provenance.calculationFingerprint]);
  push([
    'Redutor Societario - Fonte',
    pkg.section8Provenance.corporateRedutorSourceFingerprint ?? '',
  ]);
  push([
    'Redutor Societario - Calculo',
    pkg.section8Provenance.corporateRedutorCalculationFingerprint ?? '',
  ]);
  push(['Pacote', pkg.section8Provenance.packageFingerprint]);
  lines.push('');

  // SECTION 9 — Filing-support notes
  lines.push('# SECAO 9 - NOTAS DE APOIO A DECLARACAO');
  push(['Exercicio', pkg.section9FilingSupportNotes.exerciseLabel]);
  push(['Status Mapeamento', 'Base Legal', 'Nota']);
  for (const note of pkg.section9FilingSupportNotes.notes) {
    push([note.mappingStatus, note.legalReference, note.text]);
  }

  return lines.join('\r\n') + '\r\n';
}
