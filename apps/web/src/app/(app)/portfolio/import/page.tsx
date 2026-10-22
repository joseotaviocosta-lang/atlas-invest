'use client';

import React, { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import {
  getConfirmEligibility,
  getEffectiveRowState,
  type EffectiveRowState,
} from '@/lib/import-review';
import {
  colors,
  spacing,
  borderRadius,
  formatCurrency,
  formatQuantity,
  formatCivilDateDisplay,
} from '@atlas/ui';
import {
  B3_IMPORT_METHOD_CATALOG,
  B3_EXPLANATION_SECTIONS,
  B3_SIMULATION_NOTICE,
  resolveB3IntegrationAvailability,
  IMPORT_RUN_STATUS_PRESENTATION,
  buildImportRunSummaryLines,
  buildImportRunReconciliationLines,
  describeImportRunSource,
  type ImportRunStatus,
} from '@atlas/ui';
import {
  Card,
  Skeleton,
  ErrorState,
  EmptyState,
  PageHeader,
  SectionHeader,
  Button,
  Badge,
  Modal,
} from '@/components/ui';

interface PortfolioOption {
  id: string;
  name: string;
}

interface AccountOption {
  id: string;
  name: string;
}

interface AssetOption {
  id: string;
  ticker: string;
  exchange: string;
}

interface PreviewIssue {
  code: string;
  field?: string;
  message: string;
}

interface PreviewCandidate {
  rowNumber: number;
  tradeDate: string;
  ticker: string;
  operation: string;
  rawOperation: string;
  quantity: string;
  unitPrice: string;
  fees: string;
  currency: string;
  brokerLabel?: string;
  externalId?: string;
  status: 'READY' | 'DUPLICATE' | 'AMBIGUOUS_ASSET' | 'INVALID' | 'UNSUPPORTED' | 'NEEDS_REVIEW';
  issues: PreviewIssue[];
  assetId: string | null;
  assetResolution: string;
  accountId: string | null;
  duplicate: 'NEW' | 'EXACT_DUPLICATE' | 'PROBABLE_DUPLICATE' | 'CONFLICT';
  provider: string;
}

interface PreviewSummary {
  totalRows: number;
  ready: number;
  duplicates: number;
  needsReview: number;
  invalid: number;
  unsupported: number;
  ambiguousAssets: number;
}

interface PreviewResponse {
  sourceType: string;
  provider: string;
  fileName: string;
  candidates: PreviewCandidate[];
  summary: PreviewSummary;
}

interface ImportReceipt {
  receiptId: string;
  portfolioId: string;
  provider: string;
  fileName: string;
  totalRows: number;
  created: number;
  skippedDuplicates: number;
  skippedByUser: number;
  failed: Array<{ rowNumber: number; message: string }>;
  transactionIds: string[];
  confirmedAt: string;
}

interface ImportRunCounts {
  fetched: number;
  normalized: number;
  new: number;
  exactDuplicates: number;
  probableDuplicates: number;
  conflicts: number;
  unsupported: number;
  invalid: number;
  confirmed: number;
  ignored: number;
}

interface ImportRunItem {
  id: string;
  portfolioId: string;
  source: string;
  provider: string | null;
  environment: string | null;
  fileName: string | null;
  sourceAsOf: string | null;
  status: ImportRunStatus;
  counts: ImportRunCounts;
  reconciliation: {
    matched: number;
    divergent: number;
    missingLocal: number;
    missingSource: number;
    unresolved: number;
  } | null;
  partial: boolean;
  error: { code: string; message: string } | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const CSV_TEMPLATE = [
  'data;ticker;operacao;quantidade;preco_unitario;taxas;moeda;corretora;conta;external_id',
  '15/01/2026;PETR4;COMPRA;100;38,50;4,90;BRL;XP;Principal;NEG-1',
  '20/02/2026;VALE3;VENDA;50;72,10;2,50;BRL;XP;Principal;NEG-2',
].join('\n');

const STATUS_LABEL: Record<PreviewCandidate['status'], string> = {
  READY: 'Pronta',
  DUPLICATE: 'Duplicada',
  AMBIGUOUS_ASSET: 'Ativo ambíguo',
  INVALID: 'Inválida',
  UNSUPPORTED: 'Não suportada',
  NEEDS_REVIEW: 'Precisa de revisão',
};

const EFFECTIVE_LABEL: Record<EffectiveRowState, string> = {
  importable: 'Será importada',
  skipped: 'Será ignorada',
  auto_skipped: 'Ignorada automaticamente',
  blocked: 'Aguardando decisão',
};

function ImportHubContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const authReady = useAuthReady();

  const [portfolioId, setPortfolioId] = useState<string | null>(searchParams.get('portfolioId'));
  const [fileName, setFileName] = useState('');
  const [content, setContent] = useState('');
  const [provider, setProvider] = useState('Corretora');
  const [defaultAccountId, setDefaultAccountId] = useState('');
  const [skipRows, setSkipRows] = useState<Set<number>>(new Set());
  const [assetOverrides, setAssetOverrides] = useState<Record<number, string>>({});
  const [accountOverrides, setAccountOverrides] = useState<Record<number, string>>({});
  const [forceRows, setForceRows] = useState<Set<number>>(new Set());
  const [fileError, setFileError] = useState<string | null>(null);
  const [b3ModalOpen, setB3ModalOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const b3Availability = resolveB3IntegrationAvailability({
    realConnectionEnabled: process.env.NEXT_PUBLIC_B3_REAL_CONNECTION_ENABLED,
  });

  const { data: portfoliosData } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PortfolioOption[] }>('/api/v1/portfolios');
      return res.data;
    },
    enabled: authReady,
    staleTime: 60_000,
  });
  const portfolios = useMemo(() => portfoliosData ?? [], [portfoliosData]);
  const activePortfolioId = portfolioId ?? portfolios[0]?.id ?? null;

  const { data: accountsData } = useQuery({
    queryKey: ['portfolio-accounts', activePortfolioId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: AccountOption[] }>(
        `/api/v1/portfolios/${activePortfolioId}/accounts`,
      );
      return res.data;
    },
    enabled: authReady && activePortfolioId !== null,
    staleTime: 60_000,
  });
  const accounts = useMemo(() => accountsData ?? [], [accountsData]);

  const { data: assetsData } = useQuery({
    queryKey: ['assets'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: AssetOption[] }>('/api/v1/assets');
      return res.data;
    },
    enabled: authReady,
    staleTime: 300_000,
  });
  const assets = useMemo(() => assetsData ?? [], [assetsData]);

  const runsQuery = useQuery({
    queryKey: ['import-runs', activePortfolioId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ImportRunItem[] }>(
        `/api/v1/portfolios/${activePortfolioId}/imports/runs?limit=50`,
      );
      return res.data;
    },
    enabled: authReady && activePortfolioId !== null,
    staleTime: 30_000,
  });
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: PreviewResponse }>(
        `/api/v1/portfolios/${activePortfolioId}/imports/preview`,
        {
          sourceType: 'GENERIC_CSV',
          provider: provider.trim() === '' ? 'CSV' : provider.trim(),
          fileName: fileName === '' ? 'importacao.csv' : fileName,
          content,
          ...(defaultAccountId === '' ? {} : { defaultAccountId }),
        },
      );
      return res.data;
    },
  });

  const effectiveRows = useMemo(() => {
    const previewData = previewMutation.data ?? null;
    if (!previewData) return [];
    return previewData.candidates.map((candidate) => ({
      candidate,
      effective: getEffectiveRowState(candidate, {
        skipped: skipRows.has(candidate.rowNumber),
        assetOverrideId: assetOverrides[candidate.rowNumber],
        accountOverrideId: accountOverrides[candidate.rowNumber],
        forceImport: forceRows.has(candidate.rowNumber),
      }),
    }));
  }, [previewMutation.data, skipRows, assetOverrides, accountOverrides, forceRows]);

  const eligibility = useMemo(
    () =>
      getConfirmEligibility(
        effectiveRows.map((row) => ({
          candidate: row.candidate,
          decision: {
            skipped: skipRows.has(row.candidate.rowNumber),
            assetOverrideId: assetOverrides[row.candidate.rowNumber],
            accountOverrideId: accountOverrides[row.candidate.rowNumber],
            forceImport: forceRows.has(row.candidate.rowNumber),
          },
        })),
      ),
    [effectiveRows, skipRows, assetOverrides, accountOverrides, forceRows],
  );

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const previewData = previewMutation.data;
      if (!previewData) throw new Error('Gere a análise do arquivo antes de confirmar.');
      const decisions: Array<{
        rowNumber: number;
        action: 'skip' | 'import';
        assetId?: string;
        accountId?: string;
      }> = [];
      for (const candidate of previewData.candidates) {
        const rowNumber = candidate.rowNumber;
        if (skipRows.has(rowNumber)) {
          decisions.push({ rowNumber, action: 'skip' });
          continue;
        }
        const assetId = assetOverrides[rowNumber];
        const accountId = accountOverrides[rowNumber];
        if (assetId !== undefined || accountId !== undefined || forceRows.has(rowNumber)) {
          decisions.push({
            rowNumber,
            action: 'import',
            ...(assetId !== undefined ? { assetId } : {}),
            ...(accountId !== undefined ? { accountId } : {}),
          });
        }
      }
      const res = await apiClient.post<{ data: ImportReceipt }>(
        `/api/v1/portfolios/${activePortfolioId}/imports/confirm`,
        {
          sourceType: 'GENERIC_CSV',
          provider: provider.trim() === '' ? 'CSV' : provider.trim(),
          fileName: previewData.fileName,
          content,
          ...(defaultAccountId === '' ? {} : { defaultAccountId }),
          decisions,
        },
      );
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['portfolio-state', activePortfolioId] });
      await queryClient.invalidateQueries({ queryKey: ['portfolio-positions', activePortfolioId] });
      await queryClient.invalidateQueries({ queryKey: ['import-runs', activePortfolioId] });
    },
  });

  const preview = previewMutation.data ?? null;
  const receipt = confirmMutation.data ?? null;

  const handleFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setFileError('Arquivo excede o limite de 2 MB por importação.');
      return;
    }
    const text = await file.text();
    setContent(text);
    setFileName(file.name);
    setSkipRows(new Set());
    setAssetOverrides({});
    setAccountOverrides({});
    setForceRows(new Set());
    previewMutation.reset();
    confirmMutation.reset();
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'atlas-modelo-importacao.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toggleSkip = (rowNumber: number) => {
    setSkipRows((previous) => {
      const next = new Set(previous);
      if (next.has(rowNumber)) {
        next.delete(rowNumber);
      } else {
        next.add(rowNumber);
      }
      return next;
    });
  };

  const toggleForce = (rowNumber: number) => {
    setForceRows((previous) => {
      const next = new Set(previous);
      if (next.has(rowNumber)) {
        next.delete(rowNumber);
      } else {
        next.add(rowNumber);
      }
      return next;
    });
  };

  return (
    <div>
      <PageHeader
        title="Importar carteira"
        subtitle="Escolha como colocar seus investimentos no Atlas: sincronização automática, arquivo ou lançamento manual."
        breadcrumb="Carteira / Importar / Conectar"
        action={
          <Link
            href={activePortfolioId ? `/portfolio?portfolioId=${activePortfolioId}` : '/portfolio'}
            style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.accent }}
          >
            ← Carteira
          </Link>
        }
      />

      <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
        <SectionHeader title="Como quer colocar seus investimentos no Atlas?" />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
            gap: `${spacing.sm}px`,
            marginTop: `${spacing.sm}px`,
          }}
        >
          {B3_IMPORT_METHOD_CATALOG.map((method) => (
            <Card
              key={method.id}
              style={{
                padding: `${spacing.base}px`,
                display: 'flex',
                flexDirection: 'column',
                gap: `${spacing.sm}px`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${spacing.sm}px`,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '1rem', fontWeight: 700 }}>{method.title}</span>
                {method.badge ? <Badge variant="neutral">{method.badge}</Badge> : null}
              </div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.accent }}>
                {method.subtitle}
              </div>
              <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                {method.description}
              </div>
              <div style={{ marginTop: 'auto', paddingTop: `${spacing.sm}px` }}>
                {method.action === 'b3-explain' ? (
                  <Button
                    variant="outline"
                    onClick={() => setB3ModalOpen(true)}
                    aria-label="Saiba como funcionará a sincronização com a B3"
                    style={{ minHeight: 44 }}
                  >
                    {b3Availability === 'AVAILABLE' ? 'Conectar (simulação)' : method.ctaLabel}
                  </Button>
                ) : method.action === 'csv-anchor' ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      document
                        .getElementById('importador-arquivo')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                    aria-label="Ir para o importador de arquivo CSV"
                    style={{ minHeight: 44 }}
                  >
                    {method.ctaLabel}
                  </Button>
                ) : (
                  <Link
                    href={
                      activePortfolioId
                        ? `/portfolio?portfolioId=${activePortfolioId}&tab=operations`
                        : '/portfolio'
                    }
                    aria-label="Adicionar operação manualmente na carteira"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      minHeight: 44,
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: colors.accent,
                    }}
                  >
                    {method.ctaLabel} →
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      </Card>

      <Modal
        isOpen={b3ModalOpen}
        onClose={() => setB3ModalOpen(false)}
        title="Como funcionará a sincronização com a B3"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          <div>
            <Badge variant="neutral">Em preparação</Badge>
          </div>
          {b3Availability === 'AVAILABLE' ? (
            <p style={{ fontSize: '0.875rem', color: colors.warning }}>{B3_SIMULATION_NOTICE}</p>
          ) : null}
          {B3_EXPLANATION_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 4px' }}>
                {section.title}
              </h3>
              <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0 }}>
                {section.body}
              </p>
            </div>
          ))}
          <Button variant="outline" onClick={() => setB3ModalOpen(false)} style={{ minHeight: 44 }}>
            Entendi
          </Button>
        </div>
      </Modal>

      <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
        <SectionHeader title="Histórico de importações" />
        {runsQuery.isLoading ? (
          <Skeleton width="100%" height="120px" />
        ) : runsQuery.isError ? (
          <ErrorState
            title="Não foi possível carregar o histórico"
            message="Tente novamente. Se o problema persistir, verifique sua conexão."
            onRetry={() => runsQuery.refetch()}
          />
        ) : runs.length === 0 ? (
          <EmptyState
            title="Nenhuma importação registrada ainda"
            description="Quando você importar um arquivo ou sincronizar uma fonte, o resumo aparecerá aqui."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
            {runs.map((run) => {
              const presentation = IMPORT_RUN_STATUS_PRESENTATION[run.status] ?? {
                label: run.status,
                tone: 'neutral' as const,
                description: '',
              };
              const summary = buildImportRunSummaryLines({
                fetched: run.counts.fetched,
                normalized: run.counts.normalized,
                added: run.counts.new,
                exactDuplicates: run.counts.exactDuplicates,
                probableDuplicates: run.counts.probableDuplicates,
                conflicts: run.counts.conflicts,
                unsupported: run.counts.unsupported,
                invalid: run.counts.invalid,
                confirmed: run.counts.confirmed,
                ignored: run.counts.ignored,
                divergent: run.reconciliation?.divergent ?? 0,
              });
              const isSelected = selectedRunId === run.id;
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(isSelected ? null : run.id)}
                  aria-expanded={isSelected}
                  aria-label={`Ver detalhes da execução ${describeImportRunSource(run.source, run.fileName)} de ${formatCivilDateDisplay(run.createdAt.slice(0, 10))}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: `${spacing.sm}px`,
                    minHeight: 44,
                    textAlign: 'left',
                    backgroundColor: isSelected ? colors.surfaceElevated : colors.surface,
                    border: `1px solid ${isSelected ? colors.accent : colors.border}`,
                    borderRadius: `${borderRadius.lg}px`,
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: `${spacing.sm}px`,
                      flexWrap: 'wrap',
                    }}
                  >
                    <strong style={{ fontSize: '0.875rem' }}>
                      {describeImportRunSource(run.source, run.fileName)}
                    </strong>
                    <Badge variant={presentation.tone}>{presentation.label}</Badge>
                    {run.partial ? <Badge variant="warning">Parcial</Badge> : null}
                  </span>
                  <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                    {formatCivilDateDisplay(run.createdAt.slice(0, 10))}
                    {run.sourceAsOf ? ` · dados de ${formatCivilDateDisplay(run.sourceAsOf)}` : ''}
                  </span>
                  <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                    {summary.map((line) => line.text).join(' · ')}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {selectedRun ? (
          <Card
            style={{
              padding: `${spacing.base}px`,
              marginTop: `${spacing.base}px`,
              border: `1px solid ${colors.border}`,
            }}
          >
            <SectionHeader
              title={`Detalhes · ${describeImportRunSource(selectedRun.source, selectedRun.fileName)}`}
            />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
                gap: `${spacing.sm}px`,
                marginTop: `${spacing.sm}px`,
              }}
            >
              {[
                { label: 'Encontrados', value: selectedRun.counts.fetched },
                { label: 'Novos', value: selectedRun.counts.new },
                { label: 'Já conhecidos', value: selectedRun.counts.exactDuplicates },
                {
                  label: 'Revisão necessária',
                  value:
                    selectedRun.counts.probableDuplicates +
                    selectedRun.counts.conflicts +
                    selectedRun.counts.unsupported +
                    selectedRun.counts.invalid,
                },
                { label: 'Importados', value: selectedRun.counts.confirmed },
                { label: 'Ignorados', value: selectedRun.counts.ignored },
              ].map((stat) => (
                <div key={stat.label}>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{stat.value}</div>
                  <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
            {selectedRun.reconciliation ? (
              <div style={{ marginTop: `${spacing.sm}px` }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>
                  Posições
                </div>
                {buildImportRunReconciliationLines(selectedRun.reconciliation).map((line) => (
                  <div
                    key={line.text}
                    style={{ fontSize: '0.875rem', color: colors.textSecondary }}
                  >
                    {line.text}
                  </div>
                ))}
              </div>
            ) : null}
            {selectedRun.error ? (
              <div style={{ marginTop: `${spacing.sm}px` }}>
                <Badge variant="danger">{selectedRun.error.code}</Badge>
                <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: '4px 0 0' }}>
                  {selectedRun.error.message}
                </p>
              </div>
            ) : null}
            <div style={{ marginTop: `${spacing.sm}px` }}>
              <Button
                variant="outline"
                onClick={() => setSelectedRunId(null)}
                style={{ minHeight: 44 }}
              >
                Fechar detalhes
              </Button>
            </div>
          </Card>
        ) : null}
      </Card>

      <Card
        id="importador-arquivo"
        style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}
      >
        <SectionHeader title="1. Arquivo de origem" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
          <label htmlFor="import-portfolio" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
            Carteira de destino
          </label>
          <select
            id="import-portfolio"
            value={activePortfolioId ?? ''}
            onChange={(event) => {
              setPortfolioId(event.target.value === '' ? null : event.target.value);
              setSkipRows(new Set());
              setAssetOverrides({});
              setAccountOverrides({});
              setForceRows(new Set());
              previewMutation.reset();
              confirmMutation.reset();
            }}
            style={{ minHeight: 44, fontSize: '0.875rem' }}
          >
            <option value="">Selecione a carteira</option>
            {portfolios.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>

          <label htmlFor="import-file" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
            Arquivo CSV (modelo Atlas)
          </label>
          <input
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void handleFile(event.target.files?.[0])}
            style={{ minHeight: 44, fontSize: '0.875rem' }}
          />
          {fileError && (
            <ErrorState
              title="Arquivo inválido"
              message={fileError}
              onRetry={() => setFileError(null)}
            />
          )}

          <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.875rem' }}>
              Corretora/fonte{' '}
              <input
                aria-label="Corretora ou fonte"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                placeholder="XP"
                style={{ minHeight: 44, fontSize: '0.875rem', marginLeft: 8 }}
              />
            </label>
            <label style={{ fontSize: '0.875rem' }}>
              Conta padrão{' '}
              <select
                aria-label="Conta padrão"
                value={defaultAccountId}
                onChange={(event) => setDefaultAccountId(event.target.value)}
                style={{ minHeight: 44, fontSize: '0.875rem', marginLeft: 8 }}
              >
                <option value="">Usar conta do arquivo</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={downloadTemplate}>
              Baixar modelo CSV
            </Button>
            <Button
              onClick={() => previewMutation.mutate()}
              disabled={!activePortfolioId || content === '' || previewMutation.isPending}
            >
              {previewMutation.isPending ? 'Analisando…' : '2. Analisar arquivo'}
            </Button>
          </div>
          {previewMutation.isError && (
            <ErrorState
              title="Não foi possível analisar o arquivo"
              message={
                previewMutation.error instanceof ApiError
                  ? previewMutation.error.message
                  : 'Tente novamente com o modelo Atlas.'
              }
              onRetry={() => previewMutation.mutate()}
            />
          )}
        </div>
      </Card>

      {preview && (
        <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
          <SectionHeader title="3. Revisar análise" />
          <p style={{ fontSize: '0.875rem' }} aria-live="polite">
            {preview.summary.totalRows} operações encontradas · {preview.summary.ready} prontas ·{' '}
            {preview.summary.duplicates} duplicadas · {preview.summary.needsReview} precisam de
            revisão · {preview.summary.invalid} inválidas · {preview.summary.unsupported} não
            suportadas
            {preview.summary.ambiguousAssets > 0
              ? ` · ${preview.summary.ambiguousAssets} com ativo ambíguo`
              : ''}
          </p>
          <p style={{ fontSize: '0.875rem', fontWeight: 600 }} aria-live="polite">
            {eligibility.importableCount} serão importadas · {eligibility.skippedCount} ignoradas
            por você · {eligibility.autoSkippedCount} ignoradas automaticamente ·{' '}
            {eligibility.blockedCount} aguardando decisão
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    'Linha',
                    'Data',
                    'Ativo',
                    'Operação',
                    'Qtd',
                    'Preço',
                    'Taxas',
                    'Situação',
                    'Decisão',
                  ].map((header) => (
                    <th key={header} scope="col" style={{ textAlign: 'left', padding: 8 }}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {effectiveRows.map(({ candidate, effective }) => {
                  const rowNumber = candidate.rowNumber;
                  const skipped = skipRows.has(rowNumber);
                  const effectiveState = effective.state;
                  const systemHandled =
                    !skipped &&
                    (candidate.status === 'DUPLICATE' || candidate.status === 'UNSUPPORTED');
                  const needsAsset =
                    (candidate.status === 'NEEDS_REVIEW' ||
                      candidate.status === 'AMBIGUOUS_ASSET') &&
                    candidate.assetId === null;
                  const needsAccount =
                    (candidate.status === 'NEEDS_REVIEW' ||
                      candidate.status === 'AMBIGUOUS_ASSET') &&
                    candidate.accountId === null;
                  const sameTickerAssets = assets.filter(
                    (asset) => asset.ticker === candidate.ticker,
                  );
                  const assetOptions = sameTickerAssets.length > 0 ? sameTickerAssets : assets;
                  return (
                    <tr key={rowNumber} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={{ padding: 8 }}>{rowNumber}</td>
                      <td style={{ padding: 8 }}>{formatCivilDateDisplay(candidate.tradeDate)}</td>
                      <td style={{ padding: 8 }}>{candidate.ticker}</td>
                      <td style={{ padding: 8 }}>
                        {candidate.operation === 'BUY'
                          ? 'Compra'
                          : candidate.operation === 'SELL'
                            ? 'Venda'
                            : candidate.operation === 'TRANSFER_IN'
                              ? 'Transferência (entrada)'
                              : candidate.operation === 'TRANSFER_OUT'
                                ? 'Transferência (saída)'
                                : candidate.operation === 'DIVIDEND'
                                  ? 'Dividendo'
                                  : candidate.operation === 'JCP'
                                    ? 'JCP'
                                    : 'Rendimento FII'}
                      </td>
                      <td style={{ padding: 8 }}>{formatQuantity(candidate.quantity)}</td>
                      <td style={{ padding: 8 }}>
                        {formatCurrency(candidate.unitPrice, candidate.currency)}
                      </td>
                      <td style={{ padding: 8 }}>
                        {formatCurrency(candidate.fees, candidate.currency)}
                      </td>
                      <td style={{ padding: 8 }}>
                        <span>{STATUS_LABEL[candidate.status]}</span>
                        <div style={{ fontWeight: 600 }}>{EFFECTIVE_LABEL[effectiveState]}</div>
                        {candidate.issues.map((issue) => (
                          <div
                            key={issue.code}
                            style={{ color: colors.textSecondary, fontSize: '0.75rem' }}
                          >
                            {issue.message}
                          </div>
                        ))}
                        {needsAsset && (
                          <select
                            aria-label={`Ativo da linha ${rowNumber}`}
                            value={assetOverrides[rowNumber] ?? ''}
                            onChange={(event) =>
                              setAssetOverrides((previous) => ({
                                ...previous,
                                [rowNumber]: event.target.value,
                              }))
                            }
                            style={{ minHeight: 44, marginTop: 4 }}
                          >
                            <option value="">Selecionar ativo…</option>
                            {assetOptions.map((asset) => (
                              <option key={asset.id} value={asset.id}>
                                {asset.ticker} · {asset.exchange}
                              </option>
                            ))}
                          </select>
                        )}
                        {needsAccount && (
                          <select
                            aria-label={`Conta da linha ${rowNumber}`}
                            value={accountOverrides[rowNumber] ?? ''}
                            onChange={(event) =>
                              setAccountOverrides((previous) => ({
                                ...previous,
                                [rowNumber]: event.target.value,
                              }))
                            }
                            style={{ minHeight: 44, marginTop: 4 }}
                          >
                            <option value="">Selecionar conta…</option>
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {candidate.duplicate === 'PROBABLE_DUPLICATE' && !skipped && (
                          <label
                            style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}
                          >
                            <input
                              type="checkbox"
                              checked={forceRows.has(rowNumber)}
                              onChange={() => toggleForce(rowNumber)}
                              aria-label={`Importar mesmo assim a linha ${rowNumber}`}
                            />
                            Importar mesmo assim
                          </label>
                        )}
                      </td>
                      <td style={{ padding: 8 }}>
                        {systemHandled ? (
                          <span style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                            Automática
                          </span>
                        ) : (
                          <label
                            style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}
                          >
                            <input
                              type="checkbox"
                              checked={skipped}
                              onChange={() => toggleSkip(rowNumber)}
                              aria-label={`Ignorar linha ${rowNumber}`}
                            />
                            Ignorar
                          </label>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: `${spacing.base}px` }}>
            <Button
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending || !eligibility.canConfirm}
            >
              {confirmMutation.isPending ? 'Importando…' : '4. Confirmar importação'}
            </Button>
            {eligibility.hint && (
              <p style={{ fontSize: '0.875rem', marginTop: `${spacing.sm}px` }} aria-live="polite">
                {eligibility.hint}
              </p>
            )}
            {confirmMutation.isError && (
              <ErrorState
                title="Não foi possível concluir a importação"
                message={
                  confirmMutation.error instanceof ApiError
                    ? confirmMutation.error.message
                    : 'Revise as linhas e tente novamente.'
                }
                onRetry={() => confirmMutation.mutate()}
              />
            )}
          </div>
        </Card>
      )}

      {previewMutation.isPending && (
        <Card style={{ padding: `${spacing.base}px` }}>
          <Skeleton width="100%" height="120px" />
        </Card>
      )}

      {!preview && !previewMutation.isPending && content === '' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Nenhum arquivo selecionado"
            description="Envie um CSV no modelo Atlas para ver a análise antes de importar. Nada é lançado sem a sua confirmação."
            actionLabel="Baixar modelo CSV"
            onAction={downloadTemplate}
          />
        </Card>
      )}

      {receipt && (
        <Card style={{ padding: `${spacing.base}px` }}>
          <SectionHeader title="Importação concluída" />
          <p style={{ fontSize: '0.875rem' }} aria-live="polite">
            {receipt.created} operações lançadas · {receipt.skippedDuplicates} duplicadas ignoradas
            · {receipt.skippedByUser} ignoradas por você
            {receipt.failed.length > 0 ? ` · ${receipt.failed.length} com erro` : ''}
          </p>
          {receipt.failed.length > 0 && (
            <ul>
              {receipt.failed.map((failure) => (
                <li key={failure.rowNumber} style={{ fontSize: '0.875rem' }}>
                  Linha {failure.rowNumber}: {failure.message}
                </li>
              ))}
            </ul>
          )}
          <Link
            href={activePortfolioId ? `/portfolio?portfolioId=${activePortfolioId}` : '/portfolio'}
          >
            Voltar para a carteira
          </Link>
        </Card>
      )}
    </div>
  );
}

export default function PortfolioImportPage() {
  return (
    <Suspense fallback={<Skeleton width="100%" height="200px" />}>
      <ImportHubContent />
    </Suspense>
  );
}
