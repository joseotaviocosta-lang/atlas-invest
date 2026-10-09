'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing } from '@atlas/ui';
import { apiClient, ApiError } from '@/api/client';
import { getInMemoryAccessToken } from '@/stores/auth.store';
import { Card, SectionHeader, ErrorState, Skeleton, EmptyState, Badge } from '@/components/ui';
import {
  isPackageStale,
  isValidReviewPackage,
  isValidWire,
  reviewPackageFallbackFilename,
  reviewPackageFilenameFromContentDisposition,
  reviewPackageFingerprintOf,
  unifiedAnnualReviewPackageQueryKey,
} from './unified-annual-wire';

// --- Verbatim label maps (presentation only; never alters substance) ---

const GLOBAL_STATUS_LABEL: Record<string, string> = {
  READY_FOR_REVIEW: 'Pronto para revisão',
  REQUIRES_ACTION: 'Ação necessária',
  PARTIAL: 'Parcial',
  BLOCKED: 'Bloqueado',
  NO_ACTIVITY: 'Sem movimentação',
  UNSUPPORTED: 'Não suportado',
};

const MODULE_LABEL: Record<string, string> = {
  ANNUAL_POSITIONS: 'Posições anuais',
  CAPITAL_MARKETS: 'Mercado de capitais',
  INVESTMENT_INCOME: 'Rendimentos de investimentos',
  READINESS_EVIDENCE: 'Prontidão e evidências',
  HIGH_INCOME_MINIMUM_TAX: 'Tributação mínima de alta renda',
};

const MODULE_STATUS_LABEL: Record<string, string> = {
  READY: 'Pronto',
  PARTIAL: 'Parcial',
  REQUIRES_CONFIRMATION: 'Requer confirmação',
  BLOCKED: 'Bloqueado',
  NO_ACTIVITY: 'Sem movimentação',
  NOT_APPLICABLE: 'Não aplicável',
  UNSUPPORTED: 'Não suportado',
};

/** Deep links into the existing detailed 4H/4I pages (never duplicated UI). */
const MODULE_DEEP_LINK: Record<string, (year: number) => string | null> = {
  HIGH_INCOME_MINIMUM_TAX: () => '/tax/high-income',
  ANNUAL_POSITIONS: () => '/portfolio',
  CAPITAL_MARKETS: () => null,
  INVESTMENT_INCOME: () => null,
  READINESS_EVIDENCE: () => null,
};

function globalStatusVariant(status: string): 'positive' | 'negative' | 'warning' | 'neutral' {
  switch (status) {
    case 'READY_FOR_REVIEW':
      return 'positive';
    case 'BLOCKED':
      return 'negative';
    case 'REQUIRES_ACTION':
    case 'PARTIAL':
      return 'warning';
    default:
      return 'neutral';
  }
}

function errorMessageFor(error: unknown): { title: string; message: string } {
  if (error instanceof ApiError) {
    if (error.statusCode === 401) {
      return { title: 'Sessão expirada', message: 'Entre novamente para continuar.' };
    }
    if (error.statusCode === 422) {
      return {
        title: 'Fontes anuais inconsistentes',
        message: 'As fontes mudaram durante a leitura. Tente novamente em instantes.',
      };
    }
    if (error.code) {
      return { title: 'Não foi possível carregar', message: `Código: ${error.code}` };
    }
  }
  return {
    title: 'Erro ao carregar a visão unificada',
    message: error instanceof Error ? error.message : 'Tente novamente em instantes.',
  };
}

export function UnifiedAnnualSection({ calendarYear }: { calendarYear: number }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['unified-annual-irpf', calendarYear],
    queryFn: async () => {
      const res = await apiClient.get<{ data: unknown }>(`/api/v1/fiscal/annual/${calendarYear}`);
      return res.data;
    },
    enabled: Boolean(calendarYear >= 1900 && calendarYear <= 2100),
    staleTime: 30_000,
  });

  const wire = useMemo(() => (isValidWire(data) ? data : null), [data]);

  const errorInfo = isError ? errorMessageFor(error) : null;

  const actionRequirements = useMemo(
    () =>
      wire
        ? wire.requirements.filter((r) => r.status !== 'SATISFIED' && r.status !== 'WAIVED')
        : [],
    [wire],
  );
  const blockingIssues = useMemo(
    () => (wire ? wire.consistencyIssues.filter((i) => i.severity === 'BLOCKING') : []),
    [wire],
  );
  const warningIssues = useMemo(
    () => (wire ? wire.consistencyIssues.filter((i) => i.severity !== 'BLOCKING') : []),
    [wire],
  );

  // --- Phase 4J.2 — review/support package + export (support-only) ---

  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExportedFingerprint, setLastExportedFingerprint] = useState<string | null>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);

  const { data: reviewPackageData, isError: reviewPackageError } = useQuery({
    queryKey: unifiedAnnualReviewPackageQueryKey(calendarYear),
    queryFn: async () => {
      const res = await apiClient.get<{ data: unknown }>(
        `/api/v1/fiscal/annual/${calendarYear}/review-package`,
      );
      return res.data;
    },
    enabled: Boolean(calendarYear >= 1900 && calendarYear <= 2100),
    staleTime: 30_000,
  });

  const reviewPackageValid = useMemo(
    () => (reviewPackageData !== undefined ? isValidReviewPackage(reviewPackageData) : null),
    [reviewPackageData],
  );
  const currentPackageFingerprint = useMemo(
    () => reviewPackageFingerprintOf(reviewPackageData ?? null),
    [reviewPackageData],
  );

  // Fail-safe: a malformed/unparseable package disables the download.
  const packageMalformed =
    reviewPackageError || (reviewPackageData !== undefined && reviewPackageValid === false);
  const canExport = reviewPackageValid === true && !packageMalformed && !exporting;
  const packageStale = isPackageStale(lastExportedFingerprint, currentPackageFingerprint);

  async function handleExport() {
    if (!canExport || exporting) {
      return;
    }
    setExporting(true);
    setExportError(null);
    const ext = exportFormat === 'json' ? 'json' : 'csv';
    const fallbackName = reviewPackageFallbackFilename(calendarYear, ext);
    try {
      const token = getInMemoryAccessToken();
      const base = apiClient.getBaseUrl();
      const response = await fetch(
        `${base}/api/v1/fiscal/annual/${calendarYear}/review-package/export?format=${exportFormat}`,
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
      const filename = reviewPackageFilenameFromContentDisposition(
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
      if (currentPackageFingerprint) {
        setLastExportedFingerprint(currentPackageFingerprint);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Falha ao exportar.');
    } finally {
      setExporting(false);
      // Focus-safe: return focus to the trigger after download.
      exportButtonRef.current?.focus();
    }
  }

  return (
    <div
      data-testid="unified-annual-section"
      style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}
    >
      <SectionHeader
        title={`IRPF anual unificado (Ano-calendário ${calendarYear})`}
        description="Projeção dos resultados autoritativos de 4H/4I. Nenhum cálculo é feito no navegador; 'pronto para revisão' não significa enviado nem pago."
      />

      {isLoading && (
        <Card style={{ padding: `${spacing.lg}px` }} data-testid="unified-annual-loading">
          <Skeleton style={{ height: '40px', width: '100%', marginBottom: `${spacing.sm}px` }} />
          <Skeleton style={{ height: '160px', width: '100%' }} />
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

      {!isLoading && !isError && !wire && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Resposta inválida do servidor"
            description="A visão anual não pôde ser interpretada. Tente recarregar."
          />
        </Card>
      )}

      {!isLoading && !isError && wire && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
          {/* Overall status — status conveyed by text + badge, never color only. */}
          <Card style={{ padding: `${spacing.md}px` }} data-testid="unified-annual-status-card">
            <div
              role="status"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: `${spacing.sm}px`,
                flexWrap: 'wrap',
              }}
            >
              <span data-testid="unified-annual-status-badge">
                <Badge variant={globalStatusVariant(wire.status)}>
                  {GLOBAL_STATUS_LABEL[wire.status] ?? wire.status}
                </Badge>
              </span>
              <span style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                Ano-calendário {wire.calendarYear} · Exercício {wire.declarationExercise}
              </span>
            </div>
            <div
              style={{
                marginTop: `${spacing.sm}px`,
                fontSize: '0.8125rem',
                color: colors.textSecondary,
              }}
            >
              {wire.summary.readyCount} prontos · {wire.summary.actionRequiredCount} com ação ·{' '}
              {wire.summary.blockedCount} bloqueados
            </div>
          </Card>

          {/* Consistency issues — BLOCKING made highly visible. */}
          {blockingIssues.length > 0 && (
            <Card
              style={{
                padding: `${spacing.md}px`,
                border: `2px solid ${colors.negative}`,
              }}
              data-testid="unified-annual-blocking-issues"
            >
              <div
                role="alert"
                style={{ fontWeight: 700, color: colors.negative, marginBottom: `${spacing.xs}px` }}
              >
                ⛔ Inconsistências que impedem a revisão ({blockingIssues.length})
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {blockingIssues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} style={{ fontSize: '0.875rem' }}>
                    <strong>{issue.code}</strong> — {issue.detail}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {warningIssues.length > 0 && (
            <Card
              style={{ padding: `${spacing.md}px` }}
              data-testid="unified-annual-warning-issues"
            >
              <div style={{ fontWeight: 700, marginBottom: `${spacing.xs}px` }}>
                Avisos de consistência ({warningIssues.length})
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {warningIssues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} style={{ fontSize: '0.875rem' }}>
                    <strong>{issue.code}</strong> — {issue.detail}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Module cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: `${spacing.md}px`,
            }}
            data-testid="unified-annual-modules"
          >
            {wire.modules.map((mod) => {
              const deepLink = MODULE_DEEP_LINK[mod.module]?.(calendarYear) ?? null;
              return (
                <Card
                  key={mod.module}
                  style={{ padding: `${spacing.md}px` }}
                  data-testid={`unified-annual-module-${mod.module}`}
                >
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                    {MODULE_LABEL[mod.module] ?? mod.module}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: colors.textSecondary,
                      marginBottom: `${spacing.xs}px`,
                    }}
                  >
                    Fonte {mod.source}
                  </div>
                  <div style={{ marginBottom: `${spacing.xs}px` }}>
                    <Badge>{MODULE_STATUS_LABEL[mod.status] ?? mod.status}</Badge>
                  </div>
                  {mod.blockingReasons.length > 0 && (
                    <ul
                      style={{
                        margin: `0 0 ${spacing.xs}px`,
                        paddingLeft: '1.1rem',
                        fontSize: '0.8125rem',
                        color: colors.negative,
                      }}
                    >
                      {mod.blockingReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                  {deepLink && (
                    <Link
                      href={deepLink}
                      data-testid={`unified-annual-deeplink-${mod.module}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        minHeight: '44px',
                        color: colors.accent,
                        fontSize: '0.875rem',
                      }}
                    >
                      Ver detalhe →
                    </Link>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Action-required list */}
          <Card style={{ padding: `${spacing.base}px` }} data-testid="unified-annual-actions">
            <div style={{ fontWeight: 700, marginBottom: `${spacing.xs}px` }}>
              Pendências ({actionRequirements.length})
            </div>
            {actionRequirements.length === 0 ? (
              <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                Nenhuma pendência de evidência ou confirmação.
              </div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {actionRequirements.map((req) => (
                  <li key={req.key} style={{ fontSize: '0.875rem' }}>
                    <strong>{MODULE_LABEL[req.module] ?? req.module}</strong> · {req.category} ·{' '}
                    {req.status}
                    {req.blockingReason ? ` — ${req.blockingReason}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Phase 4J.2 — review/support package export (support-only). */}
          <Card style={{ padding: `${spacing.base}px` }} data-testid="unified-annual-export">
            <div style={{ fontWeight: 700, marginBottom: `${spacing.xs}px` }}>
              Relatório anual de apoio
            </div>
            <div
              style={{
                fontSize: '0.8125rem',
                color: colors.textSecondary,
                marginBottom: `${spacing.sm}px`,
              }}
            >
              Documento de apoio à revisão — não é arquivo oficial da Receita Federal.
            </div>
            {packageMalformed ? (
              <div
                style={{ fontSize: '0.875rem', color: colors.textSecondary }}
                data-testid="unified-annual-export-unavailable"
              >
                Relatório indisponível no momento. Tente recarregar a página.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${spacing.sm}px`,
                  flexWrap: 'wrap',
                }}
              >
                <label
                  htmlFor="unified-annual-export-format"
                  style={{ fontSize: '0.875rem', color: colors.textSecondary }}
                >
                  Formato
                </label>
                <select
                  id="unified-annual-export-format"
                  data-testid="unified-annual-export-format"
                  value={exportFormat}
                  onChange={(event) =>
                    setExportFormat(event.target.value === 'json' ? 'json' : 'csv')
                  }
                  style={{ minHeight: '44px', fontSize: '0.875rem' }}
                >
                  <option value="csv">CSV (apoio)</option>
                  <option value="json">JSON</option>
                </select>
                <button
                  ref={exportButtonRef}
                  type="button"
                  data-testid="unified-annual-export-button"
                  onClick={handleExport}
                  disabled={!canExport}
                  style={{
                    minHeight: '44px',
                    padding: `0 ${spacing.md}px`,
                    fontSize: '0.875rem',
                    fontWeight: 700,
                  }}
                >
                  {exporting ? 'Exportando…' : 'Exportar relatório anual de apoio'}
                </button>
              </div>
            )}
            {packageStale && (
              <div
                role="status"
                data-testid="unified-annual-package-stale"
                style={{
                  marginTop: `${spacing.sm}px`,
                  fontSize: '0.875rem',
                  fontWeight: 700,
                }}
              >
                O pacote atual mudou desde a última exportação — exporte novamente para revisar a
                versão atual.
              </div>
            )}
            {exportError && (
              <div role="alert" style={{ marginTop: `${spacing.sm}px`, fontSize: '0.875rem' }}>
                {exportError}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
