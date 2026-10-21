'use client';

import React, { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { colors, spacing, formatCurrency, formatQuantity, formatCivilDateDisplay } from '@atlas/ui';
import {
  Card,
  Skeleton,
  ErrorState,
  EmptyState,
  PageHeader,
  SectionHeader,
  Button,
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
  const [fileError, setFileError] = useState<string | null>(null);

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

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const preview = previewMutation.data;
      if (!preview) throw new Error('Gere a análise do arquivo antes de confirmar.');
      const decisions = preview.candidates.map((candidate) => ({
        rowNumber: candidate.rowNumber,
        action: (skipRows.has(candidate.rowNumber) ? 'skip' : 'import') as 'skip' | 'import',
        ...(assetOverrides[candidate.rowNumber]
          ? { assetId: assetOverrides[candidate.rowNumber] }
          : {}),
        ...(accountOverrides[candidate.rowNumber]
          ? { accountId: accountOverrides[candidate.rowNumber] }
          : {}),
      }));
      const res = await apiClient.post<{ data: ImportReceipt }>(
        `/api/v1/portfolios/${activePortfolioId}/imports/confirm`,
        {
          sourceType: 'GENERIC_CSV',
          provider: provider.trim() === '' ? 'CSV' : provider.trim(),
          fileName: preview.fileName,
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

  return (
    <div>
      <PageHeader
        title="Importar carteira"
        subtitle="Envie um arquivo CSV, revise a análise e confirme para lançar as operações no livro-razão."
        breadcrumb="Carteira / Importar"
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
                {preview.candidates.map((candidate) => (
                  <tr key={candidate.rowNumber} style={{ borderTop: `1px solid ${colors.border}` }}>
                    <td style={{ padding: 8 }}>{candidate.rowNumber}</td>
                    <td style={{ padding: 8 }}>{formatCivilDateDisplay(candidate.tradeDate)}</td>
                    <td style={{ padding: 8 }}>{candidate.ticker}</td>
                    <td style={{ padding: 8 }}>
                      {candidate.operation === 'BUY' ? 'Compra' : 'Venda'}
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
                      {candidate.issues.map((issue) => (
                        <div
                          key={issue.code}
                          style={{ color: colors.textSecondary, fontSize: '0.75rem' }}
                        >
                          {issue.message}
                        </div>
                      ))}
                      {(candidate.status === 'AMBIGUOUS_ASSET' ||
                        candidate.assetResolution !== 'RESOLVED') &&
                        candidate.assetId === null && (
                          <select
                            aria-label={`Ativo da linha ${candidate.rowNumber}`}
                            value={assetOverrides[candidate.rowNumber] ?? ''}
                            onChange={(event) =>
                              setAssetOverrides((previous) => ({
                                ...previous,
                                [candidate.rowNumber]: event.target.value,
                              }))
                            }
                            style={{ minHeight: 44, marginTop: 4 }}
                          >
                            <option value="">Selecionar ativo…</option>
                            {assets
                              .filter((asset) => asset.ticker === candidate.ticker)
                              .map((asset) => (
                                <option key={asset.id} value={asset.id}>
                                  {asset.ticker} · {asset.exchange}
                                </option>
                              ))}
                          </select>
                        )}
                      {candidate.accountId === null && candidate.status !== 'INVALID' && (
                        <select
                          aria-label={`Conta da linha ${candidate.rowNumber}`}
                          value={accountOverrides[candidate.rowNumber] ?? ''}
                          onChange={(event) =>
                            setAccountOverrides((previous) => ({
                              ...previous,
                              [candidate.rowNumber]: event.target.value,
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
                    </td>
                    <td style={{ padding: 8 }}>
                      <label
                        style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}
                      >
                        <input
                          type="checkbox"
                          checked={skipRows.has(candidate.rowNumber)}
                          onChange={() => toggleSkip(candidate.rowNumber)}
                          aria-label={`Ignorar linha ${candidate.rowNumber}`}
                        />
                        Ignorar
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: `${spacing.base}px` }}>
            <Button
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending || preview.summary.ready === 0}
            >
              {confirmMutation.isPending ? 'Importando…' : '4. Confirmar importação'}
            </Button>
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
