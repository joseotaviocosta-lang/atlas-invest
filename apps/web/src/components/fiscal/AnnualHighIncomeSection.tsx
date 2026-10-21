'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  colors,
  spacing,
  borderRadius,
  annualHighIncomeQueryKey,
  formatAnnualHighIncomeViewModel,
  highIncomeReviewPackageQueryKey,
  formatHighIncomeReviewPackageViewModel,
  type RawAnnualHighIncomeAssessment,
  type AnnualHighIncomeViewModel,
  type RawHighIncomeReviewPackage,
} from '@atlas/ui';
import { apiClient, ApiError } from '@/api/client';
import { getInMemoryAccessToken } from '@/stores/auth.store';
import { useAuthReady } from '@/hooks/use-auth-ready';
import {
  Card,
  SectionHeader,
  ErrorState,
  Skeleton,
  EmptyState,
  Button,
  Modal,
  Badge,
} from '@/components/ui';

const DISCLAIMER =
  'Este cálculo é um suporte fiscal baseado nos dados disponíveis no Atlas e não representa ' +
  'transmissão, validação ou aceitação pela Receita Federal. Não constitui DARF, pagamento ou ' +
  'declaração enviada.';

function errorMessageFor(error: unknown): { title: string; message: string } {
  if (error instanceof ApiError) {
    if (error.statusCode === 401) {
      return { title: 'Sessão expirada', message: 'Entre novamente para continuar.' };
    }
    if (error.statusCode === 404) {
      return {
        title: 'Recurso não encontrado',
        message: 'A fonte pagadora informada não pertence aos seus dados deste ano.',
      };
    }
    if (error.statusCode === 409) {
      return {
        title: 'Há evidências conflitantes para esta fonte pagadora.',
        message: 'Revise o histórico abaixo e escolha manter ou aceitar a revisão atual.',
      };
    }
    if (error.code) {
      return { title: 'Não foi possível concluir', message: `Código: ${error.code}` };
    }
  }
  return {
    title: 'Erro ao carregar a apuração de alta renda',
    message: error instanceof Error ? error.message : 'Tente novamente em instantes.',
  };
}

function SummaryCard({
  label,
  value,
  hint,
  testId,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  testId: string;
  accent?: boolean;
}) {
  return (
    <Card style={{ padding: `${spacing.md}px` }}>
      <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginBottom: '4px' }}>
        {label}
      </div>
      <div
        data-testid={testId}
        style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: accent ? colors.accent : colors.textPrimary,
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '4px' }}>
          {hint}
        </div>
      )}
    </Card>
  );
}

type EvidenceFormState = {
  evidenceType: 'CORPORATE_TAX' | 'ANNUAL_ADJUSTMENT_IRPF' | 'ANNUAL_INCOME_TOTAL';
  payerId: string;
  payerType: 'STANDARD_CORPORATE' | 'INSURANCE_CAPITALIZATION_REGULATED' | 'FINANCIAL_INSTITUTION';
  profitPeriodExercise: number;
  evidenceMode: 'FULL' | 'SIMPLIFIED';
  accountingProfit: string;
  irDue: string;
  csllDue: string;
  prouniTaxCredit: string;
  simplifiedRevenue: string;
  adjustmentAmount: string;
  evidenceSource: 'PJ_FINANCIAL_STATEMENTS' | 'RFB_PREFILLED' | 'TAXPAYER_CONFIRMED';
};

const EMPTY_FORM: EvidenceFormState = {
  evidenceType: 'CORPORATE_TAX',
  payerId: '',
  payerType: 'STANDARD_CORPORATE',
  profitPeriodExercise: 2026,
  evidenceMode: 'FULL',
  accountingProfit: '',
  irDue: '',
  csllDue: '',
  prouniTaxCredit: '',
  simplifiedRevenue: '',
  adjustmentAmount: '',
  evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
};

const PROFIT_PERIOD_YEARS = [2024, 2025, 2026, 2027, 2028];

function buildEvidencePayload(form: EvidenceFormState): Record<string, unknown> {
  if (form.evidenceType === 'CORPORATE_TAX') {
    return {
      evidenceType: form.evidenceType,
      payerId: form.payerId,
      payerType: form.payerType,
      profitPeriodExercise: form.profitPeriodExercise,
      evidenceMode: form.evidenceMode,
      accountingProfit: form.accountingProfit,
      irDue: form.irDue,
      csllDue: form.csllDue,
      ...(form.prouniTaxCredit ? { prouniTaxCredit: form.prouniTaxCredit } : {}),
      ...(form.simplifiedRevenue ? { simplifiedRevenue: form.simplifiedRevenue } : {}),
      evidenceSource: form.evidenceSource,
    };
  }
  return {
    evidenceType: form.evidenceType,
    adjustmentAmount: form.adjustmentAmount,
    evidenceSource: form.evidenceSource,
  };
}

export function AnnualHighIncomeSection({ initialYear }: { initialYear?: number }) {
  const authReady = useAuthReady();
  const [calendarYear, setCalendarYear] = useState<number>(initialYear ?? 2025);
  const [payerSort, setPayerSort] = useState<'payer' | 'status'>('payer');
  const [payerStatusFilter, setPayerStatusFilter] = useState<string>('ALL');
  const [payerEvidenceFilter, setPayerEvidenceFilter] = useState<string>('ALL');
  const [visiblePayers, setVisiblePayers] = useState<number>(100);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<EvidenceFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialYear === undefined) {
      const previousYear = new Date().getFullYear() - 1;
      setCalendarYear(previousYear > 2000 ? previousYear : 2026);
    }
  }, [initialYear]);

  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: annualHighIncomeQueryKey(calendarYear),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawAnnualHighIncomeAssessment }>(
        `/api/v1/fiscal/annual/${calendarYear}/high-income`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(calendarYear >= 1900 && calendarYear <= 2100),
    staleTime: 30_000,
  });

  const viewModel: AnnualHighIncomeViewModel | null = useMemo(
    () => (data ? formatAnnualHighIncomeViewModel(data) : null),
    [data],
  );

  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportButtonRef = React.useRef<HTMLButtonElement>(null);

  // Review/support package (derived; drives the stale indicator + export).
  const { data: reviewPackageData, isError: reviewPackageError } = useQuery({
    queryKey: highIncomeReviewPackageQueryKey(calendarYear),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawHighIncomeReviewPackage }>(
        `/api/v1/fiscal/annual/${calendarYear}/high-income/review`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(calendarYear >= 1900 && calendarYear <= 2100),
    staleTime: 30_000,
  });

  const reviewPackageViewModel = useMemo(
    () => (reviewPackageData ? formatHighIncomeReviewPackageViewModel(reviewPackageData) : null),
    [reviewPackageData],
  );

  // Fail-safe: a malformed/unparseable package disables the download.
  const packageMalformed = reviewPackageError || (!!reviewPackageData && !reviewPackageViewModel);
  const canExport = Boolean(reviewPackageViewModel) && !packageMalformed;
  const packageStale = reviewPackageViewModel?.isStale ?? false;

  function filenameFromContentDisposition(header: string | null, fallback: string): string {
    if (!header) {
      return fallback;
    }
    const match = /filename="?([^"]+)"?/i.exec(header);
    return match && match[1] ? match[1] : fallback;
  }

  async function handleExport() {
    if (!authReady || !canExport || exporting) {
      return;
    }
    setExporting(true);
    setExportError(null);
    const ext = exportFormat === 'json' ? 'json' : 'csv';
    const fallbackName = `atlas-alta-renda-${calendarYear}-relatorio-apoio.${ext}`;
    try {
      const token = getInMemoryAccessToken();
      const base = apiClient.getBaseUrl();
      const response = await fetch(
        `${base}/api/v1/fiscal/annual/${calendarYear}/high-income/export?format=${exportFormat}`,
        {
          method: 'GET',
          headers: {
            Accept: exportFormat === 'json' ? 'application/json' : 'text/csv',
            'x-atlas-client': 'web',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      );
      if (!response.ok) {
        throw new Error(`Falha ao exportar (status ${response.status}).`);
      }
      const blob = await response.blob();
      const filename = filenameFromContentDisposition(
        response.headers.get('Content-Disposition'),
        fallbackName,
      );
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Falha ao exportar.');
    } finally {
      setExporting(false);
      // Focus-safe: return focus to the trigger after download.
      exportButtonRef.current?.focus();
    }
  }

  const payerOptions = useMemo(() => {
    if (!viewModel) {
      return [];
    }
    const ids = new Set<string>();
    for (const entry of viewModel.incomeBreakdown) {
      for (const payerId of entry.payerIds) {
        ids.add(payerId);
      }
    }
    return [...ids].sort();
  }, [viewModel]);

  const filteredPayers = useMemo(() => {
    const payers = viewModel?.corporateRedutor?.payers ?? [];
    const filtered = payers.filter((payer) => {
      if (payerStatusFilter !== 'ALL' && payer.status !== payerStatusFilter) {
        return false;
      }
      if (payerEvidenceFilter !== 'ALL' && payer.evidenceStatus !== payerEvidenceFilter) {
        return false;
      }
      return true;
    });
    const sorted = [...filtered].sort((a, b) =>
      payerSort === 'status'
        ? a.status.localeCompare(b.status) || a.payerId.localeCompare(b.payerId)
        : a.payerId.localeCompare(b.payerId),
    );
    return sorted;
  }, [viewModel, payerSort, payerStatusFilter, payerEvidenceFilter]);

  const evidenceMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      if (!authReady) {
        throw new Error('Sessão não está pronta. Entre novamente para continuar.');
      }
      return apiClient.post(`/api/v1/fiscal/annual/${calendarYear}/high-income/evidence`, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: annualHighIncomeQueryKey(calendarYear) });
      setFormOpen(false);
      setForm(EMPTY_FORM);
      setFormError(null);
    },
    onError: (mutationError: unknown) => {
      const mapped = errorMessageFor(mutationError);
      setFormError(`${mapped.title} ${mapped.message}`);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'KEEP_EXISTING' | 'ACCEPT_NEW' }) => {
      if (!authReady) {
        throw new Error('Sessão não está pronta. Entre novamente para continuar.');
      }
      return apiClient.post(
        `/api/v1/fiscal/annual/${calendarYear}/high-income/evidence/${id}/resolve`,
        {
          decision,
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: annualHighIncomeQueryKey(calendarYear) });
      setResolvingId(null);
    },
  });

  const submitEvidence = () => {
    if (form.evidenceType === 'CORPORATE_TAX') {
      if (!form.payerId || !form.accountingProfit || !form.irDue || !form.csllDue) {
        setFormError('Preencha pagador, lucro contábil, IRPJ e CSLL.');
        return;
      }
    } else if (!form.adjustmentAmount) {
      setFormError('Preencha o valor.');
      return;
    }
    setFormError(null);
    evidenceMutation.mutate(buildEvidencePayload(form));
  };

  const errorInfo = isError ? errorMessageFor(error) : null;

  return (
    <div
      data-testid="annual-high-income-section"
      style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
        }}
      >
        <SectionHeader
          title={`Tributação mínima de alta renda (Ano-calendário ${calendarYear})`}
          description="Avaliação anual derivada dos dados do Atlas. Nenhum cálculo é feito no navegador."
        />
        <div
          style={{ display: 'flex', gap: `${spacing.xs}px` }}
          role="group"
          aria-label="Ano-calendário"
        >
          {[2024, 2025, 2026].map((yr) => (
            <button
              key={yr}
              type="button"
              data-testid={`high-income-year-${yr}`}
              onClick={() => {
                setCalendarYear(yr);
                setVisiblePayers(100);
              }}
              aria-pressed={calendarYear === yr}
              style={{
                padding: `${spacing.xs}px ${spacing.sm}px`,
                borderRadius: `${borderRadius.md}px`,
                border: `1px solid ${calendarYear === yr ? colors.accent : colors.border}`,
                backgroundColor: calendarYear === yr ? colors.surfaceElevated : colors.surface,
                color: calendarYear === yr ? colors.accent : colors.textPrimary,
                fontWeight: calendarYear === yr ? 600 : 400,
                cursor: 'pointer',
                minHeight: '44px',
              }}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <Card style={{ padding: `${spacing.lg}px` }}>
          <Skeleton style={{ height: '40px', width: '100%', marginBottom: `${spacing.sm}px` }} />
          <Skeleton style={{ height: '120px', width: '100%' }} />
        </Card>
      )}

      {isError && !isLoading && (
        <Card style={{ padding: `${spacing.base}px` }}>
          <ErrorState
            title={errorInfo?.title ?? 'Erro ao carregar'}
            message={errorInfo?.message ?? 'Tente novamente.'}
            onRetry={() => refetch()}
          />
        </Card>
      )}

      {!isLoading && !isError && !viewModel && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Resposta inválida do servidor"
            description="A avaliação anual não pôde ser interpretada. Tente recarregar."
          />
        </Card>
      )}

      {!isLoading && !isError && viewModel && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
          {/* Status card */}
          <Card style={{ padding: `${spacing.md}px` }} data-testid="high-income-status-card">
            <div
              role="status"
              style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}
            >
              <span data-testid="high-income-status-badge">
                <Badge>{viewModel.statusLabel}</Badge>
              </span>
              <span style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                Ano-calendário {viewModel.calendarYear} · Exercício {viewModel.declarationExercise}
              </span>
            </div>
            {viewModel.status === 'CALCULABLE' && !viewModel.isAuthoritativeNet && (
              <div style={{ marginTop: `${spacing.xs}px`, fontSize: '0.875rem' }}>
                Resultado parcial: o imposto líquido ainda depende de comprovações.
              </div>
            )}

            {/* Package stale indicator (text + icon/badge, role=status). */}
            {packageStale && (
              <div
                role="status"
                data-testid="high-income-package-stale"
                style={{
                  marginTop: `${spacing.sm}px`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${spacing.xs}px`,
                  fontSize: '0.8125rem',
                }}
              >
                <span aria-hidden="true">⚠️</span>
                <Badge>Pacote desatualizado</Badge>
                <span style={{ color: colors.textSecondary }}>
                  Os dados de origem mudaram; gere o relatório novamente antes de revisar.
                </span>
              </div>
            )}

            {/* Export / support-document download controls. */}
            <div
              role="group"
              aria-label="Exportar relatório de apoio"
              style={{
                marginTop: `${spacing.sm}px`,
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: `${spacing.sm}px`,
              }}
            >
              <label style={{ fontSize: '0.8125rem' }}>
                Formato{' '}
                <select
                  data-testid="high-income-export-format"
                  value={exportFormat}
                  onChange={(event) => setExportFormat(event.target.value as 'csv' | 'json')}
                  style={{ minHeight: '44px' }}
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
              </label>
              <button
                ref={exportButtonRef}
                type="button"
                data-testid="high-income-export"
                onClick={handleExport}
                disabled={!canExport || exporting}
                aria-disabled={!canExport || exporting}
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  borderRadius: `${borderRadius.md}px`,
                  border: `1px solid ${colors.accent}`,
                  backgroundColor: canExport ? colors.surfaceElevated : colors.surface,
                  color: canExport ? colors.accent : colors.textSecondary,
                  fontWeight: 600,
                  cursor: canExport && !exporting ? 'pointer' : 'not-allowed',
                  minHeight: '44px',
                }}
              >
                {exporting ? 'Exportando…' : 'Exportar relatório de apoio'}
              </button>
              {exportError && (
                <span role="alert" style={{ color: colors.negative, fontSize: '0.8125rem' }}>
                  {exportError}
                </span>
              )}
            </div>
          </Card>

          {/* Summary cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: `${spacing.md}px`,
            }}
          >
            <SummaryCard
              label="Renda anual total"
              value={viewModel.formattedTotalAnnualIncome}
              hint="Base do limiar de R$ 600 mil (soma de todos os rendimentos)"
              testId="high-income-total"
            />
            <SummaryCard
              label="Base da tributação mínima"
              value={viewModel.formattedMinimumTaxBase}
              hint="Após exclusões legais — difere da renda total"
              testId="high-income-base"
            />
            <SummaryCard
              label="Alíquota mínima"
              value={viewModel.formattedMinimumRate}
              hint={viewModel.rateBandLabel ?? undefined}
              testId="high-income-rate"
            />
            <SummaryCard
              label="Imposto mínimo bruto"
              value={viewModel.formattedGrossMinimumTax}
              testId="high-income-gross"
            />
            <SummaryCard
              label="Créditos considerados"
              value={viewModel.formattedSupportedCreditsTotal}
              testId="high-income-credits"
            />
            <SummaryCard
              label="Redutor corporativo"
              value={
                viewModel.corporateRedutor
                  ? viewModel.corporateRedutor.formattedTotalSupportedReduction
                  : '—'
              }
              hint="Por fonte pagadora (art. 16-B)"
              testId="high-income-redutor"
            />
            <SummaryCard
              label="Imposto mínimo líquido"
              value={viewModel.formattedNetMinimumTax}
              hint={
                viewModel.isAuthoritativeNet
                  ? 'Valor autoritativo com evidências completas'
                  : 'Não disponível — ver pendências abaixo'
              }
              testId="high-income-net"
              accent={viewModel.isAuthoritativeNet}
            />
          </div>

          {viewModel.formattedCreditExcess && (
            <Card style={{ padding: `${spacing.md}px` }}>
              <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                Excesso de créditos sobre o bruto (informativo, sem restituição calculada):{' '}
                <strong>{viewModel.formattedCreditExcess}</strong>
              </div>
            </Card>
          )}

          {/* Blockers */}
          {viewModel.blockerPriority.length > 0 && (
            <Card style={{ padding: `${spacing.md}px` }} data-testid="high-income-blockers">
              <div style={{ fontWeight: 700, marginBottom: `${spacing.xs}px` }}>
                O que impede o cálculo final
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {viewModel.blockerPriority.map((reason) => (
                  <li key={reason} style={{ fontSize: '0.875rem' }}>
                    {reason}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Base breakdown */}
          <Card style={{ padding: `${spacing.base}px` }}>
            <div style={{ fontWeight: 700, marginBottom: `${spacing.xs}px` }}>
              Composição da base
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border}`, textAlign: 'left' }}>
                    <th style={{ padding: `${spacing.xs}px` }}>Categoria</th>
                    <th style={{ padding: `${spacing.xs}px` }}>Bruto</th>
                    <th style={{ padding: `${spacing.xs}px` }}>Incluído</th>
                    <th style={{ padding: `${spacing.xs}px` }}>Excluído</th>
                    <th style={{ padding: `${spacing.xs}px` }}>Classificação</th>
                  </tr>
                </thead>
                <tbody>
                  {viewModel.incomeBreakdown.map((entry) => (
                    <tr
                      key={`${entry.category}-${entry.classification}`}
                      style={{ borderBottom: `1px solid ${colors.border}` }}
                    >
                      <td style={{ padding: `${spacing.xs}px`, fontWeight: 600 }}>
                        {entry.categoryLabel}
                      </td>
                      <td style={{ padding: `${spacing.xs}px` }}>{entry.formattedGrossAmount}</td>
                      <td style={{ padding: `${spacing.xs}px` }}>
                        {entry.formattedIncludedAmount}
                      </td>
                      <td style={{ padding: `${spacing.xs}px` }}>
                        {entry.formattedExcludedAmount}
                      </td>
                      <td style={{ padding: `${spacing.xs}px` }}>{entry.classificationLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Credits */}
          {viewModel.credits.length > 0 && (
            <Card style={{ padding: `${spacing.base}px` }}>
              <div style={{ fontWeight: 700, marginBottom: `${spacing.xs}px` }}>Créditos</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}`, textAlign: 'left' }}>
                      <th style={{ padding: `${spacing.xs}px` }}>Espécie</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Valor</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewModel.credits.map((credit) => (
                      <tr key={credit.kind} style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <td style={{ padding: `${spacing.xs}px` }}>{credit.kind}</td>
                        <td style={{ padding: `${spacing.xs}px` }}>{credit.formattedAmount}</td>
                        <td style={{ padding: `${spacing.xs}px` }}>{credit.reasonLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Payer redutor table */}
          {viewModel.corporateRedutor && (
            <Card style={{ padding: `${spacing.base}px` }} data-testid="high-income-payers">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: `${spacing.sm}px`,
                  marginBottom: `${spacing.xs}px`,
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  Redutor por fonte pagadora ({viewModel.corporateRedutor.payerCount})
                </div>
                <div style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.8125rem' }}>
                    Ordenar{' '}
                    <select
                      data-testid="high-income-payer-sort"
                      value={payerSort}
                      onChange={(event) => setPayerSort(event.target.value as 'payer' | 'status')}
                      style={{ minHeight: '44px' }}
                    >
                      <option value="payer">Pagador</option>
                      <option value="status">Status</option>
                    </select>
                  </label>
                  <label style={{ fontSize: '0.8125rem' }}>
                    Status{' '}
                    <select
                      data-testid="high-income-payer-status-filter"
                      value={payerStatusFilter}
                      onChange={(event) => setPayerStatusFilter(event.target.value)}
                      style={{ minHeight: '44px' }}
                    >
                      <option value="ALL">Todos</option>
                      <option value="APPLICABLE">Apurado</option>
                      <option value="REQUIRES_EVIDENCE">Evidência necessária</option>
                      <option value="BLOCKED">Bloqueado</option>
                    </select>
                  </label>
                  <label style={{ fontSize: '0.8125rem' }}>
                    Evidência{' '}
                    <select
                      data-testid="high-income-payer-evidence-filter"
                      value={payerEvidenceFilter}
                      onChange={(event) => setPayerEvidenceFilter(event.target.value)}
                      style={{ minHeight: '44px' }}
                    >
                      <option value="ALL">Todas</option>
                      <option value="AUTHORITATIVE">Válida</option>
                      <option value="REQUIRES_CONFIRMATION">Aguardando</option>
                      <option value="MISSING">Ausente</option>
                      <option value="CONFLICTING">Conflitante</option>
                    </select>
                  </label>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}`, textAlign: 'left' }}>
                      <th style={{ padding: `${spacing.xs}px` }}>Pagador</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Tipo</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Dividendos</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Alíquota efetiva PJ</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Teto</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Redutor</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Evidência</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayers.slice(0, visiblePayers).map((payer) => (
                      <tr
                        key={payer.payerId}
                        data-testid={`high-income-payer-${payer.payerId}`}
                        style={{ borderBottom: `1px solid ${colors.border}` }}
                      >
                        <td style={{ padding: `${spacing.xs}px`, fontWeight: 600 }}>
                          {payer.payerId}
                        </td>
                        <td style={{ padding: `${spacing.xs}px` }}>{payer.payerTypeLabel}</td>
                        <td style={{ padding: `${spacing.xs}px` }}>
                          {payer.formattedEligibleDividends}
                        </td>
                        <td style={{ padding: `${spacing.xs}px` }}>
                          {payer.formattedCorporateEffectiveRate}
                        </td>
                        <td style={{ padding: `${spacing.xs}px` }}>
                          {payer.formattedReferenceRate}
                        </td>
                        <td style={{ padding: `${spacing.xs}px` }}>
                          {payer.formattedReductionExact}
                        </td>
                        <td style={{ padding: `${spacing.xs}px` }}>{payer.evidenceStatusLabel}</td>
                        <td style={{ padding: `${spacing.xs}px` }}>{payer.statusLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredPayers.length > visiblePayers && (
                <Button
                  variant="outline"
                  onClick={() => setVisiblePayers((count) => count + 100)}
                  data-testid="high-income-payers-more"
                  style={{ minHeight: '44px', marginTop: `${spacing.sm}px` }}
                >
                  Mostrar mais ({filteredPayers.length - visiblePayers} restantes)
                </Button>
              )}
            </Card>
          )}

          {/* Evidence requirements */}
          {viewModel.evidenceRequirements.length > 0 && (
            <Card style={{ padding: `${spacing.base}px` }} data-testid="high-income-requirements">
              <div style={{ fontWeight: 700, marginBottom: `${spacing.xs}px` }}>
                Evidências necessárias
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {viewModel.evidenceRequirements.map((requirement) => (
                  <li
                    key={requirement.requirementId}
                    data-testid={`high-income-requirement-${requirement.requirement}`}
                    style={{ fontSize: '0.875rem', marginBottom: '4px' }}
                  >
                    <strong>{requirement.title}</strong> — {requirement.statusLabel}
                    {requirement.blockingReason ? ` (${requirement.blockingReason})` : ''}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Evidence states (current revisions) */}
          {viewModel.evidence.length > 0 && (
            <Card style={{ padding: `${spacing.base}px` }} data-testid="high-income-evidence">
              <div style={{ fontWeight: 700, marginBottom: `${spacing.xs}px` }}>
                Evidências registradas (revisões atuais)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}`, textAlign: 'left' }}>
                      <th style={{ padding: `${spacing.xs}px` }}>Tipo</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Pagador</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Revisão</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Autoridade</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Origem</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewModel.evidence.map((row) => (
                      <tr key={row.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <td style={{ padding: `${spacing.xs}px` }}>{row.evidenceTypeLabel}</td>
                        <td style={{ padding: `${spacing.xs}px` }}>{row.payerId ?? '—'}</td>
                        <td style={{ padding: `${spacing.xs}px` }}>
                          {row.revision}
                          {row.supersedesId ? ' (substitui anterior)' : ' (original)'}
                        </td>
                        <td style={{ padding: `${spacing.xs}px` }}>{row.authorityLabel}</td>
                        <td style={{ padding: `${spacing.xs}px` }}>{row.sourceLabel}</td>
                        <td style={{ padding: `${spacing.xs}px` }}>
                          {row.stale && (
                            <span data-testid={`high-income-stale-${row.id}`}>
                              Desatualizada — dados de origem mudaram; revise a confirmação.
                            </span>
                          )}
                          {row.conflictLabel && (
                            <span data-testid={`high-income-conflict-${row.id}`}>
                              {row.conflictLabel}
                              <Button
                                variant="outline"
                                data-testid={`high-income-resolve-keep-${row.id}`}
                                disabled={resolvingId === row.id || resolveMutation.isPending}
                                onClick={() => {
                                  setResolvingId(row.id);
                                  resolveMutation.mutate({
                                    id: row.id,
                                    decision: 'KEEP_EXISTING',
                                  });
                                }}
                                style={{ minHeight: '44px', marginLeft: `${spacing.xs}px` }}
                              >
                                Manter anterior
                              </Button>
                              <Button
                                variant="outline"
                                data-testid={`high-income-resolve-accept-${row.id}`}
                                disabled={resolvingId === row.id || resolveMutation.isPending}
                                onClick={() => {
                                  setResolvingId(row.id);
                                  resolveMutation.mutate({
                                    id: row.id,
                                    decision: 'ACCEPT_NEW',
                                  });
                                }}
                                style={{ minHeight: '44px', marginLeft: `${spacing.xs}px` }}
                              >
                                Aceitar atual
                              </Button>
                            </span>
                          )}
                          {!row.stale && !row.conflictLabel && '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Evidence form */}
          <Card style={{ padding: `${spacing.base}px` }}>
            <div style={{ fontWeight: 700, marginBottom: `${spacing.xs}px` }}>
              Registrar evidência
            </div>
            <Button
              variant="primary"
              data-testid="high-income-evidence-open"
              onClick={() => {
                setFormError(null);
                setFormOpen(true);
              }}
              style={{ minHeight: '44px' }}
            >
              Nova evidência
            </Button>
          </Card>

          {/* Disclaimer */}
          <Card style={{ padding: `${spacing.md}px` }} data-testid="high-income-disclaimer">
            <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>{DISCLAIMER}</div>
          </Card>
        </div>
      )}

      <Modal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setFormError(null);
        }}
        title="Registrar evidência de alta renda"
      >
        <form
          data-testid="high-income-evidence-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitEvidence();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}
        >
          <label style={{ fontSize: '0.875rem' }}>
            Tipo de evidência
            <select
              data-testid="high-income-form-type"
              value={form.evidenceType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  evidenceType: event.target.value as EvidenceFormState['evidenceType'],
                }))
              }
              style={{ display: 'block', width: '100%', minHeight: '44px', marginTop: '4px' }}
            >
              <option value="CORPORATE_TAX">Tributos da fonte pagadora</option>
              <option value="ANNUAL_ADJUSTMENT_IRPF">IRPF do ajuste anual</option>
              <option value="ANNUAL_INCOME_TOTAL">Total anual de rendimentos</option>
            </select>
          </label>

          {form.evidenceType === 'CORPORATE_TAX' ? (
            <>
              <label style={{ fontSize: '0.875rem' }}>
                Fonte pagadora
                <select
                  data-testid="high-income-form-payer"
                  value={form.payerId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, payerId: event.target.value }))
                  }
                  style={{ display: 'block', width: '100%', minHeight: '44px', marginTop: '4px' }}
                >
                  <option value="">Selecione…</option>
                  {payerOptions.map((payerId) => (
                    <option key={payerId} value={payerId}>
                      {payerId}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: '0.875rem' }}>
                Tipo da pagadora
                <select
                  data-testid="high-income-form-payer-type"
                  value={form.payerType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      payerType: event.target.value as EvidenceFormState['payerType'],
                    }))
                  }
                  style={{ display: 'block', width: '100%', minHeight: '44px', marginTop: '4px' }}
                >
                  <option value="STANDARD_CORPORATE">Empresa — regime geral (teto 34%)</option>
                  <option value="INSURANCE_CAPITALIZATION_REGULATED">
                    Seguradora / capitalização (teto 40%)
                  </option>
                  <option value="FINANCIAL_INSTITUTION">Instituição financeira (teto 45%)</option>
                </select>
              </label>
              <label style={{ fontSize: '0.875rem' }}>
                Exercício do lucro
                <select
                  data-testid="high-income-form-period"
                  value={form.profitPeriodExercise}
                  onChange={(event) => {
                    const selected = PROFIT_PERIOD_YEARS[event.target.selectedIndex] ?? 2026;
                    setForm((current) => ({ ...current, profitPeriodExercise: selected }));
                  }}
                  style={{ display: 'block', width: '100%', minHeight: '44px', marginTop: '4px' }}
                >
                  {PROFIT_PERIOD_YEARS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: '0.875rem' }}>
                Lucro contábil (decimal, ex.: 800000.00)
                <input
                  data-testid="high-income-form-profit"
                  type="text"
                  inputMode="decimal"
                  value={form.accountingProfit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, accountingProfit: event.target.value }))
                  }
                  style={{ display: 'block', width: '100%', minHeight: '44px', marginTop: '4px' }}
                />
              </label>
              <label style={{ fontSize: '0.875rem' }}>
                IRPJ devido (decimal)
                <input
                  data-testid="high-income-form-irpj"
                  type="text"
                  inputMode="decimal"
                  value={form.irDue}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, irDue: event.target.value }))
                  }
                  style={{ display: 'block', width: '100%', minHeight: '44px', marginTop: '4px' }}
                />
              </label>
              <label style={{ fontSize: '0.875rem' }}>
                CSLL devida (decimal)
                <input
                  data-testid="high-income-form-csll"
                  type="text"
                  inputMode="decimal"
                  value={form.csllDue}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, csllDue: event.target.value }))
                  }
                  style={{ display: 'block', width: '100%', minHeight: '44px', marginTop: '4px' }}
                />
              </label>
            </>
          ) : (
            <label style={{ fontSize: '0.875rem' }}>
              Valor (decimal, ex.: 15000.00)
              <input
                data-testid="high-income-form-amount"
                type="text"
                inputMode="decimal"
                value={form.adjustmentAmount}
                onChange={(event) =>
                  setForm((current) => ({ ...current, adjustmentAmount: event.target.value }))
                }
                style={{ display: 'block', width: '100%', minHeight: '44px', marginTop: '4px' }}
              />
            </label>
          )}

          <label style={{ fontSize: '0.875rem' }}>
            Origem da comprovação
            <select
              data-testid="high-income-form-source"
              value={form.evidenceSource}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  evidenceSource: event.target.value as EvidenceFormState['evidenceSource'],
                }))
              }
              style={{ display: 'block', width: '100%', minHeight: '44px', marginTop: '4px' }}
            >
              <option value="PJ_FINANCIAL_STATEMENTS">Demonstrações financeiras da pagadora</option>
              <option value="RFB_PREFILLED">Declaração pré-preenchida (RFB)</option>
              <option value="TAXPAYER_CONFIRMED">Atestado pelo contribuinte</option>
            </select>
          </label>

          {formError && (
            <div role="alert" style={{ color: colors.negative, fontSize: '0.875rem' }}>
              {formError}
            </div>
          )}

          <Button
            variant="primary"
            type="submit"
            data-testid="high-income-evidence-submit"
            disabled={evidenceMutation.isPending}
            style={{ minHeight: '44px' }}
          >
            {evidenceMutation.isPending ? 'Enviando…' : 'Enviar evidência'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
