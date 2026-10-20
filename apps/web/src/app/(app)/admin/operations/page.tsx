'use client';

/**
 * Phase 5H - Operator console (web).
 *
 * Operations client over frozen Phase 5G/5E/5F admin APIs. All values are
 * rendered from backend-provided strings; the console performs zero
 * financial math. Reads are persisted-only (zero-live-read); only explicit,
 * confirmed operator mutations (manual run, backfill run) may trigger
 * provider calls server-side.
 */
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import {
  BACKFILL_DOMAINS,
  INGESTION_JOB_TYPES,
  fetchAlertById,
  fetchAlerts,
  fetchJobById,
  fetchJobHistory,
  fetchJobsHealth,
  fetchOperationsMetrics,
  fetchOperationsStatus,
  fetchSchedulerReadiness,
  formatTargetPeriod,
  isValidCivilDate,
  operationsQueryKeys,
  planBackfill,
  executeBackfill,
  reasonCodeCopy,
  runManualJob,
  type JobRunDto,
  type OperationalAlertDto,
} from '@/api/operations';
import {
  Button,
  Card,
  Badge,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Select,
  Skeleton,
  Tabs,
} from '@/components/ui';
import { spacing } from '@atlas/ui';
import {
  OperationalStateBadge,
  SeverityBadge,
  ReasonBadge,
} from '@/components/operations/OperationsBadges';

const REFRESH_INTERVAL_MS = 45000;

const TABS = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'alerts', label: 'Alertas' },
  { id: 'jobs', label: 'Execuções' },
  { id: 'backfills', label: 'Backfills' },
  { id: 'readiness', label: 'Prontidão' },
  { id: 'metrics', label: 'Métricas' },
];

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (SP)`;
}

function AuthErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.statusCode === 401) {
    return (
      <ErrorState
        title="Sessão expirada"
        message="Sua sessão expirou. Entre novamente para continuar operando."
        onRetry={onRetry}
      />
    );
  }
  if (error instanceof ApiError && error.statusCode === 403) {
    return (
      <ErrorState
        title="Acesso restrito a operadores"
        message="Sua conta não está na lista de operadores. A autorização é verificada no servidor."
        onRetry={onRetry}
      />
    );
  }
  return (
    <ErrorState
      title="Falha ao carregar dados operacionais"
      message={error instanceof Error ? error.message : 'Erro desconhecido'}
      onRetry={onRetry}
    />
  );
}

function OverviewTab() {
  const statusQuery = useQuery({
    queryKey: [...operationsQueryKeys.status],
    queryFn: fetchOperationsStatus,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const readinessQuery = useQuery({
    queryKey: [...operationsQueryKeys.readiness],
    queryFn: fetchSchedulerReadiness,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  if (statusQuery.isError)
    return <AuthErrorState error={statusQuery.error} onRetry={() => statusQuery.refetch()} />;
  if (statusQuery.isLoading || !statusQuery.data) return <Skeleton />;
  const data = statusQuery.data;
  const healthy = data.sources.filter((s) => s.state === 'HEALTHY').length;
  const stale = data.sources.filter((s) => s.state === 'STALE' || s.state === 'FAILED').length;
  const critical = data.issues.filter((i) => i.severity === 'CRITICAL');
  const warnings = data.issues.filter((i) => i.severity !== 'CRITICAL');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
      <Card>
        <h2>Estado geral</h2>
        <p>
          <OperationalStateBadge state={data.overall} /> Agendador:{' '}
          {data.scheduler.enabled ? 'habilitado' : 'desabilitado'}
          {readinessQuery.data ? (
            <> · Prontidão: {readinessQuery.data.ready ? 'READY' : 'NOT_READY'}</>
          ) : null}
        </p>
        <p>
          Fontes saudáveis: {healthy} · Fontes com atraso/falha: {stale} · Questões críticas:{' '}
          {critical.length} · Avisos: {warnings.length}
        </p>
      </Card>
      <Card>
        <h2>Questões ativas</h2>
        {data.issues.length === 0 ? (
          <EmptyState
            title="Nenhuma questão ativa"
            description="O motor operacional não reporta pendências."
          />
        ) : (
          <ul>
            {data.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.source}-${index}`}>
                <SeverityBadge severity={issue.severity} /> <strong>{issue.code}</strong> (
                {issue.source}): {issue.detail}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2>Fontes monitoradas</h2>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Fonte</th>
                <th>Estado</th>
                <th>Esperado até</th>
                <th>Persistido até</th>
                <th>Períodos em atraso</th>
                <th>Motivo</th>
                <th>Último sucesso</th>
                <th>Última tentativa</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((source) => (
                <tr key={source.source}>
                  <td>{source.source}</td>
                  <td>
                    <OperationalStateBadge state={source.state} />
                  </td>
                  <td>{source.expectedThrough ?? '—'}</td>
                  <td>{source.actualThrough ?? '—'}</td>
                  <td>{source.lagPeriods ?? '—'}</td>
                  <td>
                    <ReasonBadge code={source.reasonCode} />
                  </td>
                  <td>{formatTimestamp(source.lastSuccessAt)}</td>
                  <td>{formatTimestamp(source.lastAttemptAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function AlertsTab() {
  const [severity, setSeverity] = React.useState('');
  const [status, setStatus] = React.useState<'ACTIVE' | 'RESOLVED'>('ACTIVE');
  const [limit, setLimit] = React.useState(50);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const alertsQuery = useQuery({
    queryKey: [...operationsQueryKeys.alerts(status, limit)],
    queryFn: () => fetchAlerts(status, limit),
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const detailQuery = useQuery({
    queryKey: ['operations', 'alert', selectedId],
    queryFn: () => fetchAlertById(selectedId as string),
    enabled: selectedId !== null,
  });

  if (alertsQuery.isLoading || !alertsQuery.data) return <Skeleton />;
  if (alertsQuery.isError)
    return <AuthErrorState error={alertsQuery.error} onRetry={() => alertsQuery.refetch()} />;
  const filtered = alertsQuery.data.filter((alert) =>
    severity ? alert.severity === severity : true,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
      <Card>
        <h2>Filtros</h2>
        <div style={{ display: 'flex', gap: `${spacing.base}px`, flexWrap: 'wrap' }}>
          <Select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'RESOLVED')}
            options={[
              { value: 'ACTIVE', label: 'Ativos' },
              { value: 'RESOLVED', label: 'Resolvidos' },
            ]}
          />
          <Select
            label="Severidade"
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            options={[
              { value: '', label: 'Todas' },
              { value: 'CRITICAL', label: 'Crítica' },
              { value: 'WARNING', label: 'Aviso' },
              { value: 'INFO', label: 'Informativa' },
            ]}
          />
          <Select
            label="Limite"
            value={String(limit)}
            onChange={(event) => setLimit(Number(event.target.value))}
            options={[
              { value: '25', label: '25' },
              { value: '50', label: '50' },
              { value: '100', label: '100' },
            ]}
          />
        </div>
      </Card>
      <Card>
        <h2>Alertas ({filtered.length})</h2>
        {filtered.length === 0 ? (
          <EmptyState
            title="Nenhum alerta"
            description="Nenhum alerta operacional corresponde aos filtros."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Severidade</th>
                  <th>Tipo</th>
                  <th>Fonte</th>
                  <th>Status</th>
                  <th>Ocorrências</th>
                  <th>Detectado em</th>
                  <th>Última detecção</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((alert: OperationalAlertDto) => (
                  <tr key={alert.id}>
                    <td>
                      <SeverityBadge severity={alert.severity} />
                    </td>
                    <td>{alert.alertType}</td>
                    <td>{alert.source}</td>
                    <td>{alert.status}</td>
                    <td>{alert.occurrenceCount}</td>
                    <td>{formatTimestamp(alert.firstDetectedAt)}</td>
                    <td>{formatTimestamp(alert.lastDetectedAt)}</td>
                    <td>
                      <Button onClick={() => setSelectedId(alert.id)}>Detalhe</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal
        isOpen={selectedId !== null}
        onClose={() => setSelectedId(null)}
        title="Detalhe do alerta"
      >
        {detailQuery.isLoading && <Skeleton />}
        {detailQuery.isError && (
          <ErrorState title="Falha ao carregar alerta" message="Tente novamente." />
        )}
        {detailQuery.data && (
          <dl>
            <dt>Chave de deduplicação</dt>
            <dd>{detailQuery.data.dedupeKey}</dd>
            <dt>Tipo</dt>
            <dd>{detailQuery.data.alertType}</dd>
            <dt>Fonte</dt>
            <dd>{detailQuery.data.source}</dd>
            <dt>Status</dt>
            <dd>{detailQuery.data.status}</dd>
            <dt>Ocorrências</dt>
            <dd>{detailQuery.data.occurrenceCount}</dd>
            <dt>Primeira detecção</dt>
            <dd>{formatTimestamp(detailQuery.data.firstDetectedAt)}</dd>
            <dt>Última detecção</dt>
            <dd>{formatTimestamp(detailQuery.data.lastDetectedAt)}</dd>
            <dt>Resolvido em</dt>
            <dd>{formatTimestamp(detailQuery.data.resolvedAt)}</dd>
            <dt>Motivo</dt>
            <dd>{reasonCodeCopy(detailQuery.data.reasonCode)}</dd>
          </dl>
        )}
      </Modal>
    </div>
  );
}

function JobsTab() {
  const queryClient = useQueryClient();
  const [jobType, setJobType] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [triggerType, setTriggerType] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [manualJobType, setManualJobType] = React.useState<string>(INGESTION_JOB_TYPES[0] ?? '');
  const [scheduledFor, setScheduledFor] = React.useState('');
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [receipt, setReceipt] = React.useState<Record<string, unknown> | null>(null);

  const [limit, setLimit] = React.useState(25);
  const params = React.useMemo(
    () => ({ jobType, status, triggerType, from, to, limit }),
    [jobType, status, triggerType, from, to, limit],
  );
  const [pages, setPages] = React.useState<JobRunDto[][]>([]);
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyError, setHistoryError] = React.useState<Error | null>(null);
  const paramsKey = JSON.stringify(params);

  const filterError =
    (from && !isValidCivilDate(from)) || (to && !isValidCivilDate(to)) || (from && to && from > to)
      ? 'Período inválido: use datas civis YYYY-MM-DD com início ≤ fim.'
      : null;

  const loadHistory = React.useCallback(
    async (nextCursor?: string, append = false) => {
      if (filterError) return;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const res = await fetchJobHistory(
          append && nextCursor ? { ...params, cursor: nextCursor } : params,
        );
        const meta = res.meta as { nextCursor?: string; hasMore?: boolean };
        setPages((previous) => (append ? [...previous, res.data] : [res.data]));
        setCursor(meta.nextCursor);
        setHasMore(Boolean(meta.hasMore));
      } catch (error) {
        setHistoryError(error instanceof Error ? error : new Error('Falha ao carregar histórico'));
      } finally {
        setHistoryLoading(false);
      }
    },
    [paramsKey, filterError, params],
  );

  React.useEffect(() => {
    void loadHistory(undefined, false);
  }, [loadHistory]);

  const historyRows = React.useMemo(() => {
    const seen = new Set<string>();
    const rows: JobRunDto[] = [];
    for (const page of pages) {
      for (const run of page) {
        if (!seen.has(run.jobRunId)) {
          seen.add(run.jobRunId);
          rows.push(run);
        }
      }
    }
    return rows;
  }, [pages]);
  const healthQuery = useQuery({
    queryKey: [...operationsQueryKeys.health],
    queryFn: fetchJobsHealth,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const detailQuery = useQuery({
    queryKey: ['ingestion', 'job', selectedId],
    queryFn: () => fetchJobById(selectedId as string),
    enabled: selectedId !== null,
  });
  const manualMutation = useMutation({
    mutationFn: () => runManualJob(manualJobType, scheduledFor || undefined),
    onSuccess: (data) => {
      setReceipt(data);
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['ingestion'] });
      void queryClient.invalidateQueries({ queryKey: ['operations'] });
    },
  });

  const scheduledForError =
    scheduledFor && !isValidCivilDate(scheduledFor)
      ? 'scheduledFor deve ser uma data civil válida YYYY-MM-DD (ou vazio para hoje).'
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
      {healthQuery.data && (
        <Card>
          <h2>Saúde das execuções</h2>
          <p>
            Falhas recentes: {healthQuery.data.recentFailures.length} · Parciais:{' '}
            {healthQuery.data.partialRuns.length} · Presas: {healthQuery.data.staleRunning.length} ·
            Retentativas esgotadas: {healthQuery.data.retryExhausted.length} · Agendadas perdidas:{' '}
            {healthQuery.data.missedSchedules.length}
          </p>
        </Card>
      )}
      <Card>
        <h2>Histórico de execuções</h2>
        <div style={{ display: 'flex', gap: `${spacing.base}px`, flexWrap: 'wrap' }}>
          <Select
            label="Tipo de job"
            value={jobType}
            onChange={(event) => setJobType(event.target.value)}
            options={[{ value: '', label: 'Todos' }].concat(
              INGESTION_JOB_TYPES.map((type) => ({ value: type, label: type })),
            )}
          />
          <Select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={[
              { value: '', label: 'Todos' },
              { value: 'SUCCESS', label: 'SUCCESS' },
              { value: 'PARTIAL', label: 'PARTIAL' },
              { value: 'FAILED', label: 'FAILED' },
              { value: 'SKIPPED_LOCKED', label: 'SKIPPED_LOCKED' },
            ]}
          />
          <Select
            label="Gatilho"
            value={triggerType}
            onChange={(event) => setTriggerType(event.target.value)}
            options={[
              { value: '', label: 'Todos' },
              { value: 'SCHEDULED', label: 'SCHEDULED' },
              { value: 'MANUAL', label: 'MANUAL' },
              { value: 'RETRY', label: 'RETRY' },
              { value: 'BACKFILL', label: 'BACKFILL' },
            ]}
          />
          <Input
            label="De (YYYY-MM-DD)"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            placeholder="2026-09-01"
          />
          <Input
            label="Até (YYYY-MM-DD)"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="2026-09-30"
          />
          <Select
            label="Limite por página"
            value={String(limit)}
            onChange={(event) => setLimit(Number(event.target.value))}
            options={[
              { value: '10', label: '10' },
              { value: '25', label: '25' },
              { value: '50', label: '50' },
            ]}
          />
        </div>
        {filterError && <ErrorState title="Filtro inválido" message={filterError} />}
        {historyLoading && pages.length === 0 && <Skeleton />}
        {historyError && !historyLoading && (
          <AuthErrorState error={historyError} onRetry={() => void loadHistory(undefined, false)} />
        )}
        {!historyLoading && !historyError && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Período</th>
                  <th>Gatilho</th>
                  <th>Status</th>
                  <th>Tentativa</th>
                  <th>Início</th>
                  <th>Fim</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((run: JobRunDto) => (
                  <tr key={run.jobRunId}>
                    <td>{run.jobType}</td>
                    <td>{formatTargetPeriod(run.targetPeriod, run.targetPeriodGranularity)}</td>
                    <td>{run.triggerType}</td>
                    <td>{run.status}</td>
                    <td>{run.attempt}</td>
                    <td>{formatTimestamp(run.startedAt)}</td>
                    <td>{formatTimestamp(run.finishedAt)}</td>
                    <td>
                      <Button onClick={() => setSelectedId(run.jobRunId)}>Detalhe</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {historyRows.length === 0 && <p>Nenhuma execução corresponde aos filtros.</p>}
            {hasMore && (
              <Button disabled={historyLoading} onClick={() => void loadHistory(cursor, true)}>
                {historyLoading ? 'Carregando…' : 'Carregar mais'}
              </Button>
            )}
          </div>
        )}
      </Card>
      <Card>
        <h2>Execução manual</h2>
        <p>
          Execuções manuais podem chamar provedores externos. Confira o tipo e o período antes de
          confirmar. Nenhum campo de provedor, URL ou código SGS é aceito.
        </p>
        <Select
          label="Tipo de job (allowlist fixa)"
          value={manualJobType}
          onChange={(event) => setManualJobType(event.target.value)}
          options={INGESTION_JOB_TYPES.map((type) => ({ value: type, label: type }))}
        />
        <Input
          label="scheduledFor (YYYY-MM-DD, vazio = hoje)"
          value={scheduledFor}
          onChange={(event) => setScheduledFor(event.target.value)}
          placeholder="2026-10-20"
          error={scheduledForError ?? undefined}
        />
        <Button
          disabled={manualMutation.isPending || Boolean(scheduledForError)}
          onClick={() => setConfirmOpen(true)}
        >
          {manualMutation.isPending ? 'Executando…' : 'Revisar e confirmar'}
        </Button>
        {manualMutation.isError && (
          <ErrorState
            title="Falha na execução manual"
            message={manualMutation.error instanceof Error ? manualMutation.error.message : 'Erro'}
          />
        )}
        {receipt && (
          <Card>
            <h3>Recibo</h3>
            <pre>{JSON.stringify(receipt, null, 2)}</pre>
          </Card>
        )}
      </Card>
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirmar execução manual"
      >
        <p>
          Job: <strong>{manualJobType}</strong>
        </p>
        <p>Data de execução: {scheduledFor || 'hoje (civil São Paulo)'}</p>
        <p>Esta ação pode chamar o provedor externo e será registrada no histórico.</p>
        <Button disabled={manualMutation.isPending} onClick={() => manualMutation.mutate()}>
          {manualMutation.isPending ? 'Executando…' : 'Confirmar execução'}
        </Button>
      </Modal>
      <Modal
        isOpen={selectedId !== null}
        onClose={() => setSelectedId(null)}
        title="Detalhe da execução"
      >
        {detailQuery.isLoading && <Skeleton />}
        {detailQuery.data && (
          <dl>
            <dt>jobRunId</dt>
            <dd>{detailQuery.data.jobRunId}</dd>
            <dt>logicalJobKey</dt>
            <dd>{detailQuery.data.logicalJobKey}</dd>
            <dt>Período (targetPeriod)</dt>
            <dd>
              {formatTargetPeriod(
                detailQuery.data.targetPeriod,
                detailQuery.data.targetPeriodGranularity,
              )}
            </dd>
            <dt>scheduledFor</dt>
            <dd>{detailQuery.data.scheduledFor}</dd>
            <dt>Gatilho</dt>
            <dd>{detailQuery.data.triggerType}</dd>
            <dt>Status</dt>
            <dd>{detailQuery.data.status}</dd>
            <dt>Código de erro</dt>
            <dd>{detailQuery.data.errorCode ?? '—'}</dd>
          </dl>
        )}
      </Modal>
    </div>
  );
}

function BackfillsTab() {
  const [domain, setDomain] = React.useState<string>(BACKFILL_DOMAINS[0] ?? '');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [plan, setPlan] = React.useState<Record<string, unknown> | null>(null);
  const [confirmLarge, setConfirmLarge] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [receipt, setReceipt] = React.useState<Record<string, unknown> | null>(null);
  const [planError, setPlanError] = React.useState<string | null>(null);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [planning, setPlanning] = React.useState(false);
  const [running, setRunning] = React.useState(false);

  const rangeError =
    !from || !to
      ? 'Informe início e fim (YYYY-MM-DD).'
      : !isValidCivilDate(from) || !isValidCivilDate(to)
        ? 'Datas devem ser civis válidas YYYY-MM-DD.'
        : from > to
          ? 'O início deve ser ≤ fim.'
          : null;

  async function handlePlan() {
    if (rangeError) return;
    setPlanning(true);
    setPlanError(null);
    try {
      setPlan((await planBackfill(domain, from, to)) as Record<string, unknown>);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : 'Falha no planejamento');
    } finally {
      setPlanning(false);
    }
  }

  async function handleRun() {
    if (rangeError) return;
    setRunning(true);
    setRunError(null);
    try {
      setReceipt(
        (await executeBackfill(domain, from, to, confirmLarge)) as Record<string, unknown>,
      );
      setConfirmOpen(false);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Falha na execução');
    } finally {
      setRunning(false);
    }
  }

  const requiresConfirmation =
    (plan as { requiresConfirmation?: boolean } | null)?.requiresConfirmation === true;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
      <Card>
        <h2>Plano dry-run (zero-live-read)</h2>
        <Select
          label="Domínio"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          options={BACKFILL_DOMAINS.map((value) => ({ value, label: value }))}
        />
        <Input
          label="De (YYYY-MM-DD)"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <Input
          label="Até (YYYY-MM-DD)"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        {rangeError && <p>{rangeError}</p>}
        <Button disabled={planning || Boolean(rangeError)} onClick={() => void handlePlan()}>
          {planning ? 'Planejando…' : 'Gerar plano (dry-run)'}
        </Button>
        {planError && <ErrorState title="Falha no planejamento" message={planError} />}
        {plan && (
          <Card>
            <h3>Plano</h3>
            <pre>{JSON.stringify(plan, null, 2)}</pre>
            {requiresConfirmation && (
              <p>
                <Badge variant="warning">Requer confirmação explícita (plano grande)</Badge>
              </p>
            )}
          </Card>
        )}
      </Card>
      <Card>
        <h2>Execução</h2>
        <p>Execute somente após inspecionar o plano. A execução pode chamar provedores.</p>
        <label>
          <input
            type="checkbox"
            checked={confirmLarge}
            onChange={(event) => setConfirmLarge(event.target.checked)}
          />{' '}
          Confirmo plano grande (confirmLargeBackfill)
        </label>
        <div>
          <Button
            disabled={running || Boolean(rangeError) || (requiresConfirmation && !confirmLarge)}
            onClick={() => setConfirmOpen(true)}
          >
            {running ? 'Executando…' : 'Revisar e executar'}
          </Button>
        </div>
        {runError && <ErrorState title="Falha na execução" message={runError} />}
        {receipt && (
          <Card>
            <h3>Recibo do backfill</h3>
            <pre>{JSON.stringify(receipt, null, 2)}</pre>
          </Card>
        )}
      </Card>
      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirmar backfill">
        <p>
          Domínio: <strong>{domain}</strong>
        </p>
        <p>
          Período: {from} → {to}
        </p>
        <p>Esta ação executa o backfill e pode chamar provedores externos.</p>
        <Button disabled={running} onClick={() => void handleRun()}>
          {running ? 'Executando…' : 'Confirmar execução'}
        </Button>
      </Modal>
    </div>
  );
}

function ReadinessTab() {
  const readinessQuery = useQuery({
    queryKey: [...operationsQueryKeys.readiness],
    queryFn: fetchSchedulerReadiness,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  if (readinessQuery.isError)
    return <AuthErrorState error={readinessQuery.error} onRetry={() => readinessQuery.refetch()} />;
  if (readinessQuery.isLoading || !readinessQuery.data) return <Skeleton />;
  const data = readinessQuery.data;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
      <Card>
        <h2>Prontidão do agendador</h2>
        <p>
          {data.ready ? (
            <Badge variant="positive">READY</Badge>
          ) : (
            <Badge variant="warning">NOT_READY</Badge>
          )}{' '}
          <Badge variant={data.runtimeState === 'RUNNING' ? 'info' : 'neutral'}>
            {data.runtimeState}
          </Badge>
        </p>
        <p>
          O agendador permanece desabilitado por padrão (controle por ambiente). NOT_READY com
          agendador intencionalmente desligado é estado de configuração, não falha crítica. Um
          agendador em execução legítima permanece READY + RUNNING; uma segunda tentativa de início
          é rejeitada sem efeito (sem registro duplicado). A prontidão reflete a configuração; o
          estado de execução é reportado separadamente.
        </p>
      </Card>
      <Card>
        <h2>Verificações</h2>
        <ul>
          {data.checks.map((check) => (
            <li key={check.name}>
              {check.pass ? (
                <Badge variant="positive">PASS</Badge>
              ) : (
                <Badge variant="danger">FAIL</Badge>
              )}{' '}
              <strong>{check.name}</strong> ({check.reasonCode})
              {check.detail ? ` — ${check.detail}` : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function MetricsTab() {
  const metricsQuery = useQuery({
    queryKey: [...operationsQueryKeys.metrics],
    queryFn: fetchOperationsMetrics,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  if (metricsQuery.isError)
    return <AuthErrorState error={metricsQuery.error} onRetry={() => metricsQuery.refetch()} />;
  if (metricsQuery.isLoading || !metricsQuery.data) return <Skeleton />;
  const metrics = metricsQuery.data;
  const total = Object.values(metrics.byStatus).reduce((sum, value) => sum + value, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
      <Card>
        <h2>Resumo da janela ({metrics.windowDays} dias)</h2>
        <p>
          Execuções: {metrics.runsTotal} · Falhas de provedor: {metrics.providerFailuresTotal} ·
          Retentativas: {metrics.retryAttemptsTotal} · Backfills: {metrics.backfillRunsTotal} ·
          Puladas: {metrics.jobsSkippedTotal} · Bloqueadas por lock: {metrics.jobsLockedTotal}
        </p>
        <p>Duração média: {metrics.avgDurationMs ?? '—'} ms</p>
      </Card>
      <Card>
        <h2>Distribuição por status</h2>
        {Object.entries(metrics.byStatus).map(([status, count]) => (
          <div key={status}>
            {status}: {count} ({total > 0 ? Math.round((count / total) * 100) : 0}%)
          </div>
        ))}
      </Card>
      <Card>
        <h2>Atraso de dados por fonte</h2>
        <ul>
          {Object.entries(metrics.dataLagPeriods).map(([source, lag]) => (
            <li key={source}>
              {source}: {lag ?? '—'}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function OperationsConsoleContent() {
  const [activeTab, setActiveTab] = React.useState('overview');
  const queryClient = useQueryClient();
  return (
    <div>
      <h1>Console de operações</h1>
      <p>
        Cliente operacional sobre as APIs 5G/5E/5F. Leituras são persistidas (zero-live-read);
        apenas execuções manuais/backfills confirmados podem chamar provedores.
        <Button
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ['operations'] });
            void queryClient.invalidateQueries({ queryKey: ['ingestion'] });
          }}
        >
          Atualizar agora
        </Button>
      </p>
      <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div role="tabpanel">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'alerts' && <AlertsTab />}
        {activeTab === 'jobs' && <JobsTab />}
        {activeTab === 'backfills' && <BackfillsTab />}
        {activeTab === 'readiness' && <ReadinessTab />}
        {activeTab === 'metrics' && <MetricsTab />}
      </div>
    </div>
  );
}

export default function OperationsConsolePage() {
  return (
    <React.Suspense fallback={<Skeleton />}>
      <OperationsConsoleContent />
    </React.Suspense>
  );
}
