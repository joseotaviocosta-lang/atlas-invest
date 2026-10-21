'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { getInMemoryAccessToken } from '@/stores/auth.store';
import { useAuthReady } from '@/hooks/use-auth-ready';
import {
  colors,
  spacing,
  taxCompliancePeriodCloseReadinessQueryKey,
  taxCompliancePeriodCloseHistoryQueryKey,
  taxCompliancePeriodCloseBinderQueryKey,
  mapToTaxCompliancePeriodCloseReadinessViewModel,
  mapToTaxCompliancePeriodCloseRecordListViewModel,
  TAX_PERIOD_CLOSE_SUPPORT_DISCLAIMER,
  TAX_PERIOD_CLOSE_OPERATIONAL_NOTICE,
  TAX_PERIOD_CLOSE_STALE_MESSAGE,
  type RawTaxCompliancePeriodCloseReadiness,
  type RawTaxCompliancePeriodCloseRecord,
  type RawTaxComplianceEvidenceBinder,
} from '@atlas/ui';
import { Card, Skeleton, ErrorState, SectionHeader, Badge, Button } from '@/components/ui';

const MIN_TOUCH_PX = 44;

function currentCompetence(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currentYear(): number {
  return new Date().getFullYear();
}

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) {
    return fallback;
  }
  const match = /filename="?([^"]+)"?/i.exec(header);
  const name = match && match[1] ? match[1] : fallback;
  // Defense in depth: strip traversal even though the server sends safe names.
  return name.replace(/[/\\]/g, '').replace(/\.\./g, '');
}

export function TaxCompliancePeriodCloseSection() {
  const queryClient = useQueryClient();
  const authReady = useAuthReady();
  const [scope, setScope] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [month, setMonth] = useState('2025-01');
  const [year, setYear] = useState(2025);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenTargetId, setReopenTargetId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    setMonth(currentCompetence());
    setYear(currentYear());
  }, []);

  const period = scope === 'MONTHLY' ? month : String(year);
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

  const readinessQs = useMemo(() => {
    const params = new URLSearchParams({ scope, calendarYear: String(year) });
    if (scope === 'MONTHLY') {
      params.set('month', month);
    } else {
      params.set('exercise', String(year + 1));
    }
    return params.toString();
  }, [scope, year, month]);

  const {
    data: rawReadiness,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: taxCompliancePeriodCloseReadinessQueryKey(scope, year, period),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxCompliancePeriodCloseReadiness }>(
        `/api/v1/fiscal/compliance/period-close/readiness?${readinessQs}`,
      );
      return res.data;
    },
    enabled: authReady && (scope === 'ANNUAL' || validMonth),
    staleTime: 30_000,
  });

  const vm = useMemo(
    () => (rawReadiness ? mapToTaxCompliancePeriodCloseReadinessViewModel(rawReadiness) : null),
    [rawReadiness],
  );

  const { data: rawHistory } = useQuery({
    queryKey: taxCompliancePeriodCloseHistoryQueryKey(),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxCompliancePeriodCloseRecord[] }>(
        '/api/v1/fiscal/compliance/period-close/history?limit=20&offset=0',
      );
      return res.data;
    },
    enabled: authReady,
    staleTime: 30_000,
  });

  const history = useMemo(
    () => mapToTaxCompliancePeriodCloseRecordListViewModel(rawHistory ?? null),
    [rawHistory],
  );

  const { data: rawBinder } = useQuery({
    queryKey: taxCompliancePeriodCloseBinderQueryKey(scope, year, period),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxComplianceEvidenceBinder }>(
        `/api/v1/fiscal/compliance/period-close/binder?${readinessQs}`,
      );
      return res.data;
    },
    enabled: authReady && (scope === 'ANNUAL' || validMonth) && vm !== null,
    staleTime: 30_000,
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!authReady) {
        throw new Error('Sessão não está pronta. Entre novamente para continuar.');
      }
      const body: Record<string, unknown> = { scope, calendarYear: year };
      if (scope === 'MONTHLY') {
        body.month = month;
      } else {
        body.exercise = year + 1;
      }
      const res = await apiClient.post<{ data: RawTaxCompliancePeriodCloseRecord }>(
        '/api/v1/fiscal/compliance/period-close',
        body,
      );
      return res.data;
    },
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({
        queryKey: taxCompliancePeriodCloseHistoryQueryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: taxCompliancePeriodCloseReadinessQueryKey(scope, year, period),
      });
      queryClient.invalidateQueries({
        queryKey: taxCompliancePeriodCloseBinderQueryKey(scope, year, period),
      });
    },
    onError: (err) => {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'Falha ao fechar o período. Verifique as pendências.',
      );
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      if (!authReady) {
        throw new Error('Sessão não está pronta. Entre novamente para continuar.');
      }
      const res = await apiClient.post<{ data: RawTaxCompliancePeriodCloseRecord }>(
        `/api/v1/fiscal/compliance/period-close/${encodeURIComponent(id)}/reopen`,
        { reason },
      );
      return res.data;
    },
    onSuccess: () => {
      setActionError(null);
      setReopenTargetId(null);
      setReopenReason('');
      queryClient.invalidateQueries({
        queryKey: taxCompliancePeriodCloseHistoryQueryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: taxCompliancePeriodCloseReadinessQueryKey(scope, year, period),
      });
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Falha ao reabrir o período.');
    },
  });

  async function handleExport(format: 'csv' | 'json') {
    if (!authReady || exporting) {
      return;
    }
    setExporting(true);
    setExportError(null);
    const ext = format === 'json' ? 'json' : 'csv';
    const fallbackName = `atlas-fechamento-${scope === 'MONTHLY' ? 'mensal' : 'anual'}-${period}-apoio.${ext}`;
    try {
      const token = getInMemoryAccessToken();
      const base = apiClient.getBaseUrl();
      const response = await fetch(
        `${base}/api/v1/fiscal/compliance/period-close/binder/export?${readinessQs}&format=${format}`,
        {
          method: 'GET',
          headers: {
            Accept: format === 'json' ? 'application/json' : 'text/csv',
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
    }
  }

  return (
    <Card style={{ padding: `${spacing.base}px`, marginTop: `${spacing.base}px` }}>
      <SectionHeader
        title="Fechamento de período fiscal"
        description="Avalie se o mês ou ano está operacionalmente pronto para fechar, feche com fingerprint auditável, monte o dossiê de evidências e gere o pacote de apoio ao profissional."
      />

      <div
        style={{
          display: 'flex',
          gap: `${spacing.sm}px`,
          flexWrap: 'wrap',
          marginBottom: `${spacing.base}px`,
        }}
      >
        <label style={{ fontSize: '0.8125rem' }}>
          Escopo:{' '}
          <select
            aria-label="Escopo do fechamento"
            value={scope}
            onChange={(event) => setScope(event.target.value as 'MONTHLY' | 'ANNUAL')}
            style={{ minHeight: `${MIN_TOUCH_PX}px` }}
          >
            <option value="MONTHLY">Mensal</option>
            <option value="ANNUAL">Anual</option>
          </select>
        </label>
        {scope === 'MONTHLY' ? (
          <label style={{ fontSize: '0.8125rem' }}>
            Competência:{' '}
            <input
              aria-label="Competência do fechamento"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              placeholder="AAAA-MM"
              style={{ minHeight: `${MIN_TOUCH_PX}px` }}
            />
          </label>
        ) : (
          <label style={{ fontSize: '0.8125rem' }}>
            Ano-calendário:{' '}
            <input
              aria-label="Ano-calendário do fechamento"
              type="number"
              value={year}
              onChange={(event) => setYear(parseInt(event.target.value, 10) || currentYear())}
              style={{ minHeight: `${MIN_TOUCH_PX}px`, width: '100px' }}
            />
          </label>
        )}
      </div>

      {!(scope === 'ANNUAL' || validMonth) && (
        <ErrorState message="Informe uma competência válida (AAAA-MM)." onRetry={() => refetch()} />
      )}

      {(scope === 'ANNUAL' || validMonth) && (
        <>
          {isLoading && <Skeleton />}
          {isError && (
            <ErrorState
              message={error instanceof Error ? error.message : 'Falha ao avaliar o período.'}
              onRetry={() => refetch()}
            />
          )}
          {!isLoading && !isError && vm && (
            <>
              <div
                data-testid="period-close-readiness"
                style={{
                  display: 'flex',
                  gap: `${spacing.sm}px`,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginBottom: `${spacing.sm}px`,
                }}
              >
                <Badge variant={vm.statusVariant}>{vm.readinessLabel}</Badge>
                <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  {vm.periodLabel}
                  {vm.exerciseLabel ? ` · ${vm.exerciseLabel}` : ''}
                </span>
                <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                  Origem: {vm.sourceFingerprintShort}…
                </span>
              </div>

              {vm.isStaleVsPreviousClose && (
                <div
                  role="alert"
                  style={{
                    fontSize: '0.875rem',
                    color: colors.warning,
                    marginBottom: `${spacing.sm}px`,
                  }}
                >
                  {TAX_PERIOD_CLOSE_STALE_MESSAGE}
                </div>
              )}

              <h3 style={{ fontSize: '0.9375rem' }}>Lista de verificação</h3>
              {vm.checklist.map((entry) => (
                <div key={entry.category} style={{ fontSize: '0.8125rem', padding: '4px 0' }}>
                  <strong>{entry.categoryLabel}</strong>: {entry.stateLabel} — {entry.detail}
                </div>
              ))}

              {vm.unresolvedItems.length > 0 && (
                <>
                  <h3 style={{ fontSize: '0.9375rem', marginTop: `${spacing.sm}px` }}>
                    Itens pendentes ({vm.unresolvedItems.length})
                  </h3>
                  {vm.unresolvedItems.map((item) => (
                    <div
                      key={`${item.ref}::${item.kind}`}
                      style={{ fontSize: '0.8125rem', padding: '4px 0' }}
                    >
                      <strong>{item.kindLabel}</strong> — {item.title}
                      <div style={{ color: colors.textSecondary }}>{item.reason}</div>
                    </div>
                  ))}
                </>
              )}

              {vm.cleanCloseAllowed ? (
                <div style={{ marginTop: `${spacing.base}px` }}>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: colors.textMuted,
                      marginBottom: `${spacing.xs}px`,
                    }}
                  >
                    {TAX_PERIOD_CLOSE_OPERATIONAL_NOTICE}
                  </div>
                  <Button
                    onClick={() => closeMutation.mutate()}
                    disabled={closeMutation.isPending}
                    aria-label="Fechar período operacionalmente"
                  >
                    {closeMutation.isPending ? 'Fechando…' : 'Fechar período'}
                  </Button>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: '0.8125rem',
                    color: colors.textSecondary,
                    marginTop: `${spacing.base}px`,
                  }}
                >
                  Fechamento limpo indisponível: resolva as pendências acima. Nenhum fechamento
                  silencioso é permitido.
                </div>
              )}
              {actionError && (
                <div
                  role="alert"
                  style={{
                    fontSize: '0.8125rem',
                    color: colors.negative,
                    marginTop: `${spacing.xs}px`,
                  }}
                >
                  {actionError}
                </div>
              )}

              {rawBinder && (
                <>
                  <h3 style={{ fontSize: '0.9375rem', marginTop: `${spacing.base}px` }}>
                    Dossiê de evidências
                  </h3>
                  {rawBinder.sections.map((section) => (
                    <details
                      key={section.code}
                      style={{ fontSize: '0.8125rem', marginBottom: '4px' }}
                    >
                      <summary style={{ cursor: 'pointer', minHeight: `${MIN_TOUCH_PX}px` }}>
                        {section.title} ({section.lines.length})
                      </summary>
                      <div style={{ paddingLeft: `${spacing.sm}px`, color: colors.textSecondary }}>
                        {section.lines.slice(0, 20).map((line, index) => (
                          <div key={index} style={{ padding: '2px 0' }}>
                            {line}
                          </div>
                        ))}
                        {section.lines.length > 20 && (
                          <div>
                            … e mais {section.lines.length - 20} linhas no pacote exportado.
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                  <div
                    style={{
                      display: 'flex',
                      gap: `${spacing.sm}px`,
                      marginTop: `${spacing.sm}px`,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Button
                      variant="secondary"
                      onClick={() => handleExport('csv')}
                      disabled={exporting}
                      aria-label="Exportar dossiê em CSV"
                    >
                      Exportar CSV
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleExport('json')}
                      disabled={exporting}
                      aria-label="Exportar dossiê em JSON"
                    >
                      Exportar JSON
                    </Button>
                  </div>
                  {exportError && (
                    <div
                      role="alert"
                      style={{
                        fontSize: '0.8125rem',
                        color: colors.negative,
                        marginTop: `${spacing.xs}px`,
                      }}
                    >
                      {exportError}
                    </div>
                  )}
                </>
              )}

              {history.length > 0 && (
                <>
                  <h3 style={{ fontSize: '0.9375rem', marginTop: `${spacing.base}px` }}>
                    Histórico de fechamentos
                  </h3>
                  {history
                    .filter((entry) => entry.period === period && entry.scope === scope)
                    .map((entry) => (
                      <div key={entry.id} style={{ fontSize: '0.8125rem', padding: '4px 0' }}>
                        <Badge variant={entry.statusVariant}>{entry.recordStatusLabel}</Badge>{' '}
                        {entry.revisionLabel} · {entry.closedAtFormatted} · origem{' '}
                        {entry.sourceFingerprintShort}…
                        {entry.reason && (
                          <div style={{ color: colors.textSecondary }}>Motivo: {entry.reason}</div>
                        )}
                        {entry.recordStatus === 'CLOSED' && (
                          <div>
                            {reopenTargetId === entry.id ? (
                              <div
                                style={{
                                  display: 'flex',
                                  gap: `${spacing.sm}px`,
                                  marginTop: '4px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <input
                                  aria-label="Motivo da reabertura"
                                  value={reopenReason}
                                  onChange={(event) => setReopenReason(event.target.value)}
                                  placeholder="Motivo da reabertura"
                                  style={{
                                    minHeight: `${MIN_TOUCH_PX}px`,
                                    flex: 1,
                                    minWidth: '200px',
                                  }}
                                />
                                <Button
                                  variant="secondary"
                                  disabled={
                                    reopenMutation.isPending || reopenReason.trim().length === 0
                                  }
                                  onClick={() =>
                                    reopenMutation.mutate({ id: entry.id, reason: reopenReason })
                                  }
                                  aria-label="Confirmar reabertura"
                                >
                                  Confirmar
                                </Button>
                                <Button
                                  variant="secondary"
                                  onClick={() => setReopenTargetId(null)}
                                  aria-label="Cancelar reabertura"
                                >
                                  Cancelar
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="secondary"
                                onClick={() => setReopenTargetId(entry.id)}
                                aria-label={`Reabrir ${entry.revisionLabel}`}
                              >
                                Reabrir
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                </>
              )}

              <div
                style={{
                  marginTop: `${spacing.base}px`,
                  fontSize: '0.75rem',
                  color: colors.textMuted,
                  lineHeight: 1.6,
                }}
              >
                {TAX_PERIOD_CLOSE_SUPPORT_DISCLAIMER}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}
