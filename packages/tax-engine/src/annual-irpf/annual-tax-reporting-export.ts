import {
  AnnualTaxReportingPackage,
  AnnualTaxReportingSectionSummary,
  AnnualTaxReportingItem,
} from './annual-tax-reporting';
import { escapeCsvCell } from './csv-escape';

/**
 * Pure, deterministic CSV exporter for the Annual Tax Reporting Package.
 * Produces a human-readable support document formatted for conference and manual entry into DIRPF.
 */
export function exportAnnualTaxReportingToCsv(
  pkg: Pick<
    AnnualTaxReportingPackage,
    | 'calendarYear'
    | 'declarationExercise'
    | 'overallStatus'
    | 'isReadyForReporting'
    | 'packageFingerprint'
    | 'generatedAt'
    | 'disclaimer'
    | 'sections'
  >,
): string {
  const lines: string[] = [];

  // Metadata comments / header
  lines.push('# ==============================================================================');
  lines.push('# PROJECT ATLAS - DOCUMENTO DE SUPORTE E CONFERÊNCIA IRPF');
  lines.push(`# Exercicio: ${pkg.declarationExercise} (Ano-Calendario: ${pkg.calendarYear})`);
  lines.push(`# Status Geral: ${pkg.overallStatus}`);
  lines.push(`# Pronto para Declaracao: ${pkg.isReadyForReporting ? 'SIM' : 'NAO'}`);
  lines.push(`# Fingerprint do Pacote: ${pkg.packageFingerprint}`);
  lines.push(`# Gerado em: ${pkg.generatedAt}`);
  lines.push(
    `# AVISO LEGAL: NÃO É UM ARQUIVO DE TRANSMISSÃO OFICIAL DA RECEITA FEDERAL. ${pkg.disclaimer}`,
  );
  lines.push('# ==============================================================================');
  lines.push('');

  // Table Headers
  const headers = [
    'Secao',
    'Codigo Declaracao',
    'Item / Categoria',
    'Status Mapeamento',
    'Descricao / Discriminacao',
    'Ticker / Ativo',
    'Fonte Pagadora / CNPJ',
    'Periodo',
    'Quantidade Inicial',
    'Custo Inicial (R$)',
    'Quantidade Final',
    'Custo Final / Valor Bruto (R$)',
    'Imposto Retido / Pago (R$)',
    'Valor Liquido (R$)',
    'Status Prontidao',
    'Bloqueado',
    'Motivos Bloqueio',
    'Fontes de Evidencia',
  ];
  lines.push(headers.map(escapeCsvCell).join(';'));

  for (const section of pkg.sections as readonly AnnualTaxReportingSectionSummary[]) {
    for (const item of section.items as readonly AnnualTaxReportingItem[]) {
      const row = [
        item.section,
        item.officialMappingCode,
        item.officialMappingLabel,
        item.mappingStatus,
        item.description,
        item.ticker ?? item.assetId ?? '',
        item.payerName
          ? `${item.payerName}${item.payerId ? ` (${item.payerId})` : ''}`
          : (item.payerId ?? ''),
        item.economicPeriod ?? '',
        item.openingQuantity ?? '',
        item.openingCostBasis ?? '',
        item.closingQuantity ?? '',
        item.closingCostBasis ?? item.grossAmount ?? item.costBasis ?? '',
        item.withheldAmount ?? '',
        item.netAmount ?? '',
        item.reportingStatus,
        item.isBlocked ? 'SIM' : 'NAO',
        item.blockingReasons.join(' | '),
        item.sourceReferences.join(' | '),
      ];
      lines.push(row.map(escapeCsvCell).join(';'));
    }
  }

  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
