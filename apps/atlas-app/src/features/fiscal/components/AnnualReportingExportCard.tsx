import { useState } from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { Card } from '../../../components/ui';
import { fiscalApi } from '../api';
import type { AnnualTaxReportingViewModel } from '../types';

interface AnnualReportingExportCardProps {
  viewModel: AnnualTaxReportingViewModel | null | undefined;
  calendarYear: number;
  portfolioId?: string | null;
}

export function AnnualReportingExportCard({
  viewModel,
  calendarYear,
  portfolioId,
}: AnnualReportingExportCardProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);
    setSuccessMessage(null);

    try {
      const csvData = await fiscalApi.getReportingExportCsv(calendarYear, portfolioId);
      if (!csvData) {
        throw new Error('Conteúdo CSV não retornado pelo servidor.');
      }

      // Prepend UTF-8 BOM if missing so Excel handles Brazilian special characters
      const content = csvData.startsWith('\uFEFF') ? csvData : '\uFEFF' + csvData;
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `atlas-dirpf-${calendarYear}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccessMessage(`Arquivo atlas-dirpf-${calendarYear}.csv exportado com sucesso!`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Falha ao exportar relatório CSV.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card style={{ marginTop: `${spacing.lg}px` }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: `${spacing.md}px`,
        }}
      >
        <div>
          <h4
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: colors.textPrimary,
              margin: '0 0 4px 0',
            }}
          >
            Exportação do Pacote DIRPF ({calendarYear})
          </h4>
          <p
            style={{
              fontSize: '0.8125rem',
              color: colors.textSecondary,
              margin: 0,
            }}
          >
            Gera o arquivo CSV estruturado com todas as fichas (Bens e Direitos, Rendimentos Isentos, Tributação Exclusiva, Ganhos Líquidos) para preenchimento da declaração.
          </p>
        </div>

        <button
          type="button"
          data-testid="export-reporting-csv-btn"
          disabled={isExporting}
          onClick={handleExport}
          style={{
            padding: `${spacing.sm}px ${spacing.md}px`,
            borderRadius: `${borderRadius.md}px`,
            backgroundColor: isExporting ? colors.surfaceElevated : colors.accent,
            color: '#ffffff',
            border: 'none',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: isExporting ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
          }}
        >
          {isExporting ? 'Exportando...' : 'Exportar Pacote DIRPF (CSV)'}
        </button>
      </div>

      {viewModel && (
        <div
          style={{
            marginTop: `${spacing.md}px`,
            padding: `${spacing.sm}px ${spacing.md}px`,
            backgroundColor: colors.surfaceElevated,
            borderRadius: `${borderRadius.sm}px`,
            display: 'flex',
            gap: `${spacing.lg}px`,
            fontSize: '0.8125rem',
            color: colors.textSecondary,
            flexWrap: 'wrap',
          }}
        >
          <span>
            Total de Itens Mapeados: <strong style={{ color: colors.textPrimary }}>{viewModel.totalItemCount}</strong>
          </span>
          <span>
            Fichas Disponíveis: <strong style={{ color: colors.textPrimary }}>{viewModel.sections.length}</strong>
          </span>
        </div>
      )}

      {successMessage && (
        <div
          style={{
            marginTop: `${spacing.sm}px`,
            padding: `${spacing.sm}px`,
            borderRadius: `${borderRadius.sm}px`,
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            border: `1px solid ${colors.positive}`,
            color: colors.positive,
            fontSize: '0.8125rem',
          }}
          data-testid="export-success-message"
        >
          {successMessage}
        </div>
      )}

      {exportError && (
        <div
          style={{
            marginTop: `${spacing.sm}px`,
            padding: `${spacing.sm}px`,
            borderRadius: `${borderRadius.sm}px`,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${colors.negative}`,
            color: colors.negative,
            fontSize: '0.8125rem',
          }}
          data-testid="export-error-message"
        >
          {exportError}
        </div>
      )}
    </Card>
  );
}

