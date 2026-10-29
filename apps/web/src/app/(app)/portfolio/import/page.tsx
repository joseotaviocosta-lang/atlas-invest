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
  describeIntegrationRunTrigger,
  describeScheduleCadence,
  describeScheduleFrequency,
  describeScheduleNextRun,
  describeIntegrationStatus,
  describeIntegrationConnection,
  describeIntegrationConnectionState,
  describeIntegrationTimezone,
  describeIntegrationAvailability,
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
  Tabs,
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
  runId?: string | null;
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
  trigger: string | null;
  error: { code: string; message: string } | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  recovery?: {
    recoveryState: string;
    recommendedAction: string;
    canRetry: boolean;
    canResume: boolean;
    requiresReview: boolean;
    reason: string;
  };
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

interface IntegrationScheduleItem {
  id: string;
  portfolioId: string;
  source: string;
  provider: string;
  environment: string;
  cadence: string;
  hourLocal: number | null;
  minuteLocal: number | null;
  timezone: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

interface IntegrationSettingsRunSummary {
  id: string;
  status: string;
  trigger: string | null;
  partial: boolean;
  createdAt: string;
  completedAt: string | null;
  newRecords: number;
  exactDuplicates: number;
  probableDuplicates: number;
  conflicts: number;
  unsupported: number;
  invalid: number;
}

interface IntegrationSourceSettings {
  source: string;
  provider: string;
  environment: string;
  availability: string;
  connection: {
    state: string;
    authorizedAt: string | null;
    lastCheckedAt: string | null;
    lifecycle: string | null;
  };
  canEnable: boolean;
  canDisable: boolean;
  canEditSchedule: boolean;
  schedule: IntegrationScheduleItem | null;
  lastRun: IntegrationSettingsRunSummary | null;
  lastSuccessfulRun: { id: string; at: string } | null;
  pendingReviewCount: number;
  status: string;
}

/**
 * Phase 5P-C — explicit-timezone instant display. The IANA zone travels
 * with the data; the device zone is never used silently.
 */
function formatSettingsInstant(iso: string | null, timezone: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    });
  } catch {
    return '—';
  }
}

function scheduleErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const message = error.message ?? '';
    if (message.trim().length > 0) return message;
  }
  return 'Não foi possível concluir a operação. Tente novamente.';
}

const SCHEDULE_HOURS = Array.from({ length: 24 }, (_, value) => String(value).padStart(2, '0'));
const SCHEDULE_MINUTES = ['00', '15', '30', '45'];

function IntegrationSchedulesSection({
  portfolioId,
  b3Availability,
}: {
  portfolioId: string | null;
  b3Availability: string;
}) {
  const queryClient = useQueryClient();
  const authReady = useAuthReady();
  const [cadence, setCadence] = useState('DAILY');
  const [hour, setHour] = useState('08');
  const [minute, setMinute] = useState('00');
  const [enableOnCreate, setEnableOnCreate] = useState(false);
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [editCadence, setEditCadence] = useState('DAILY');
  const [editHour, setEditHour] = useState('08');
  const [editMinute, setEditMinute] = useState('00');
  const schedulesAvailable = b3Availability === 'AVAILABLE';

  const settingsQuery = useQuery({
    queryKey: ['portfolio-integrations', portfolioId],
    queryFn: async () => {
      const res = await apiClient.get<{
        data: { portfolioId: string; sources: IntegrationSourceSettings[] };
      }>(`/api/v1/portfolios/${portfolioId}/integrations`);
      return res.data;
    },
    enabled: authReady && portfolioId !== null,
    staleTime: 30_000,
  });
  const b3Settings = useMemo(
    () => settingsQuery.data?.sources.find((source) => source.source === 'B3') ?? null,
    [settingsQuery.data],
  );

  const schedulesQuery = useQuery({
    queryKey: ['import-schedules', portfolioId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: IntegrationScheduleItem[] }>(
        `/api/v1/portfolios/${portfolioId}/imports/schedules`,
      );
      return res.data;
    },
    enabled: authReady && portfolioId !== null,
    staleTime: 30_000,
  });
  const schedules = useMemo(() => schedulesQuery.data ?? [], [schedulesQuery.data]);
  const b3Schedule = useMemo(
    () => schedules.find((schedule) => schedule.source === 'B3') ?? null,
    [schedules],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      // Select-constrained time-of-day: index lookup, never float parsing.
      // Financial math stays server-side; the API re-validates ranges.
      const res = await apiClient.post<{ data: IntegrationScheduleItem }>(
        `/api/v1/portfolios/${portfolioId}/imports/schedules`,
        {
          source: 'B3',
          cadence,
          hourLocal: SCHEDULE_HOURS.indexOf(hour),
          minuteLocal: SCHEDULE_MINUTES.indexOf(minute) * 15,
          enabled: enableOnCreate,
        },
      );
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['import-schedules', portfolioId] });
      await queryClient.invalidateQueries({ queryKey: ['portfolio-integrations', portfolioId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.patch<{ data: IntegrationScheduleItem }>(
        `/api/v1/portfolios/${portfolioId}/imports/schedules/${b3Schedule?.id}`,
        {
          cadence: editCadence,
          hourLocal: SCHEDULE_HOURS.indexOf(editHour),
          minuteLocal: SCHEDULE_MINUTES.indexOf(editMinute) * 15,
        },
      );
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['import-schedules', portfolioId] });
      await queryClient.invalidateQueries({ queryKey: ['portfolio-integrations', portfolioId] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (schedule: IntegrationScheduleItem) => {
      const res = await apiClient.patch<{ data: IntegrationScheduleItem }>(
        `/api/v1/portfolios/${portfolioId}/imports/schedules/${schedule.id}`,
        { enabled: !schedule.enabled },
      );
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['import-schedules', portfolioId] });
      await queryClient.invalidateQueries({ queryKey: ['portfolio-integrations', portfolioId] });
      setConfirmingDisable(false);
    },
  });

  // Phase 5P-D — connection actions. Server owns source/provider/
  // environment; the client sends an empty strict body and never chooses
  // CERT/PROD. Buttons render only where the simulated flow is available.
  const connectionAction = async (action: string) => {
    const res = await apiClient.post<{ data: { status: string } }>(
      `/api/v1/portfolios/${portfolioId}/integrations/B3/${action}`,
      {},
    );
    return res.data;
  };

  const connectionMutation = useMutation({
    mutationFn: connectionAction,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['import-schedules', portfolioId] });
      await queryClient.invalidateQueries({ queryKey: ['portfolio-integrations', portfolioId] });
    },
  });

  // Phase 5P-C — capability gates come from the server read model, never
  // from client flags alone. The client flag stays as a fallback while
  // settings load, and as the PREPARING signal in production.
  const canEnable =
    b3Settings !== null
      ? b3Settings.canEnable
      : schedulesAvailable && b3Schedule !== null && !b3Schedule.enabled;
  const canDisable =
    b3Settings !== null ? b3Settings.canDisable : b3Schedule !== null && b3Schedule.enabled;
  const canEdit =
    b3Settings !== null ? b3Settings.canEditSchedule : schedulesAvailable && b3Schedule !== null;
  const settingsStatus = b3Settings !== null ? describeIntegrationStatus(b3Settings.status) : null;

  const renderScheduleRow = (schedule: IntegrationScheduleItem, readOnly: boolean) => (
    <div
      key={schedule.id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: `${spacing.sm}px`,
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: `${borderRadius.lg}px`,
      }}
    >
      <span
        style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}
      >
        <strong style={{ fontSize: '0.875rem' }}>
          {schedule.source === 'B3' ? 'Sincronização B3' : schedule.source}
        </strong>
        <Badge variant={schedule.enabled ? 'success' : 'neutral'}>
          {schedule.enabled ? 'Ativa' : 'Pausada'}
        </Badge>
        <Badge variant="neutral">{describeScheduleCadence(schedule.cadence)}</Badge>
        {settingsStatus !== null ? (
          <Badge variant={settingsStatus.tone}>{settingsStatus.label}</Badge>
        ) : null}
      </span>
      <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
        {describeScheduleFrequency({
          cadence: schedule.cadence,
          hourLocal: schedule.hourLocal,
          minuteLocal: schedule.minuteLocal,
          timezone: schedule.timezone,
        })}{' '}
        · {describeIntegrationTimezone(schedule.timezone)}
      </span>
      <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
        {describeScheduleNextRun(schedule.nextRunAt, schedule.enabled, schedule.timezone)}
      </span>
      {b3Settings?.lastRun ? (
        <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
          Última sincronização:{' '}
          {formatSettingsInstant(b3Settings.lastRun.createdAt, schedule.timezone)} ·{' '}
          {b3Settings.lastRun.trigger === 'SCHEDULED' ? 'automática' : 'manual'} ·{' '}
          {b3Settings.lastRun.status === 'FAILED'
            ? 'falhou'
            : b3Settings.lastRun.partial || b3Settings.lastRun.status === 'PARTIAL'
              ? 'parcial'
              : b3Settings.lastRun.status === 'COMPLETED'
                ? 'concluída'
                : 'aguardando revisão'}
        </span>
      ) : null}
      {b3Settings?.lastRun?.status === 'FAILED' && b3Settings.lastSuccessfulRun ? (
        <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
          Última sincronização concluída:{' '}
          {formatSettingsInstant(b3Settings.lastSuccessfulRun.at, schedule.timezone)}
        </span>
      ) : null}
      {b3Settings?.lastRun?.status === 'FAILED' ? (
        <span style={{ fontSize: '0.8125rem', color: colors.negative }}>
          Última sincronização falhou. <Link href="#import-history">Ver detalhes</Link>
        </span>
      ) : null}
      {b3Settings?.lastRun?.status === 'PARTIAL' || b3Settings?.lastRun?.partial ? (
        <span style={{ fontSize: '0.8125rem', color: colors.warning }}>
          Sincronização parcial: alguns dados não puderam ser obtidos.{' '}
          <Link href="#import-history">Ver detalhes</Link>
        </span>
      ) : null}
      {(b3Settings?.pendingReviewCount ?? 0) > 0 ? (
        <span style={{ fontSize: '0.8125rem' }}>
          <Link href={`/reviews?portfolioId=${portfolioId ?? ''}`}>
            {b3Settings?.pendingReviewCount === 1
              ? '1 item aguarda revisão — Revisar agora'
              : `${b3Settings?.pendingReviewCount} itens aguardam revisão — Revisar agora`}
          </Link>
        </span>
      ) : null}
      <span style={{ fontSize: '0.8125rem' }}>
        <Link href="#import-history">Ver histórico</Link>
      </span>
      {readOnly ? null : (
        <span style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
          {schedule.enabled ? (
            confirmingDisable ? (
              <>
                <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Desativar sincronização automática? Suas operações e histórico não serão apagados.
                </span>
                <Button
                  variant="outline"
                  onClick={() => toggleMutation.mutate(schedule)}
                  disabled={toggleMutation.isPending}
                  aria-label="Confirmar desativação da sincronização automática"
                  style={{ minHeight: 44 }}
                >
                  {toggleMutation.isPending ? 'Desativando…' : 'Confirmar desativação'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirmingDisable(false)}
                  disabled={toggleMutation.isPending}
                  aria-label="Manter sincronização automática ativada"
                  style={{ minHeight: 44 }}
                >
                  Manter ativada
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                onClick={() => setConfirmingDisable(true)}
                disabled={!canDisable || toggleMutation.isPending}
                aria-pressed={schedule.enabled}
                aria-label="Pausar sincronização automática"
                style={{ minHeight: 44 }}
              >
                Pausar
              </Button>
            )
          ) : (
            <Button
              variant="outline"
              onClick={() => toggleMutation.mutate(schedule)}
              disabled={!canEnable || toggleMutation.isPending}
              aria-pressed={schedule.enabled}
              aria-label="Ativar sincronização automática"
              style={{ minHeight: 44 }}
            >
              Ativar
            </Button>
          )}
        </span>
      )}
      {canEdit && schedule.enabled === false ? null : null}
      {canEdit ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: `${spacing.sm}px`,
            marginTop: `${spacing.sm}px`,
            alignItems: 'flex-end',
          }}
        >
          <label
            style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}
          >
            Frequência
            <select
              value={editCadence}
              onChange={(event) => setEditCadence(event.target.value)}
              aria-label="Editar frequência da sincronização"
              style={{ minHeight: 44 }}
            >
              <option value="DAILY">Diária</option>
              <option value="WEEKDAYS">Dias úteis</option>
              <option value="MANUAL_ONLY">Somente manual</option>
            </select>
          </label>
          <label
            style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}
          >
            Hora
            <select
              value={editHour}
              onChange={(event) => setEditHour(event.target.value)}
              aria-label="Editar hora local"
              style={{ minHeight: 44 }}
            >
              {SCHEDULE_HOURS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label
            style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}
          >
            Minuto
            <select
              value={editMinute}
              onChange={(event) => setEditMinute(event.target.value)}
              aria-label="Editar minuto local"
              style={{ minHeight: 44 }}
            >
              {SCHEDULE_MINUTES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            aria-label="Salvar ajustes da sincronização"
            style={{ minHeight: 44 }}
          >
            {updateMutation.isPending ? 'Salvando…' : 'Salvar ajustes'}
          </Button>
        </div>
      ) : null}
      {updateMutation.isError ? (
        <p
          role="alert"
          style={{ fontSize: '0.875rem', color: colors.negative, margin: `${spacing.sm}px 0 0` }}
        >
          {scheduleErrorMessage(updateMutation.error)}
        </p>
      ) : null}
      {updateMutation.isSuccess ? (
        <p
          role="status"
          style={{ fontSize: '0.875rem', color: colors.positive, margin: `${spacing.sm}px 0 0` }}
        >
          Ajustes salvos.
        </p>
      ) : null}
    </div>
  );

  return (
    <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
      <SectionHeader title="Sincronização automática" />
      <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: `${spacing.sm}px 0` }}>
        Sincronizações automáticas coletam e preparam os dados da fonte. A importação continua sendo
        confirmada por você — nada é gravado no livro-razão sem revisão.
      </p>
      {b3Settings !== null ? (
        <p
          style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: `${spacing.sm}px 0` }}
        >
          Estado: {describeIntegrationStatus(b3Settings.status).label} ·{' '}
          {describeIntegrationAvailability(b3Settings.availability)} ·{' '}
          {describeIntegrationConnection(b3Settings.connection.state)}
          {b3Settings.status === 'PREPARING'
            ? ' — Disponível quando a integração B3 for ativada.'
            : ` — ${describeIntegrationStatus(b3Settings.status).description}`}
        </p>
      ) : null}
      {b3Settings !== null && !settingsQuery.isLoading ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: `${spacing.sm}px`,
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${borderRadius.lg}px`,
            marginBottom: `${spacing.sm}px`,
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
            <strong style={{ fontSize: '0.875rem' }}>Conexão B3</strong>
            <Badge variant={describeIntegrationConnectionState(b3Settings.connection.state).tone}>
              {b3Settings.connection.lifecycle === 'REVOKED'
                ? 'Acesso revogado'
                : describeIntegrationConnectionState(b3Settings.connection.state).label}
            </Badge>
          </span>
          <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
            {b3Settings.connection.lifecycle === 'REVOKED'
              ? 'Seus dados já importados e o histórico permanecem no Atlas. Novas sincronizações param até nova autorização.'
              : describeIntegrationConnectionState(b3Settings.connection.state).description}
          </span>
          {b3Settings.connection.authorizedAt ? (
            <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              Autorizada em{' '}
              {formatSettingsInstant(
                b3Settings.connection.authorizedAt,
                b3Schedule?.timezone ?? 'America/Sao_Paulo',
              )}
            </span>
          ) : null}
          {schedulesAvailable ? (
            <span style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
              {b3Settings.connection.state === 'NOT_CONNECTED' ? (
                <Button
                  variant="outline"
                  onClick={() => connectionMutation.mutate('authorize')}
                  disabled={connectionMutation.isPending}
                  aria-label="Conectar fonte B3 (simulação)"
                  style={{ minHeight: 44 }}
                >
                  {connectionMutation.isPending ? 'Conectando…' : 'Conectar'}
                </Button>
              ) : null}
              {b3Settings.connection.state === 'AWAITING_AUTHORIZATION' ? (
                <Button
                  variant="outline"
                  onClick={() => connectionMutation.mutate('complete-authorization')}
                  disabled={connectionMutation.isPending}
                  aria-label="Continuar autorização da fonte B3"
                  style={{ minHeight: 44 }}
                >
                  {connectionMutation.isPending ? 'Concluindo…' : 'Continuar autorização'}
                </Button>
              ) : null}
              {b3Settings.connection.state === 'NEEDS_REAUTH' ? (
                <Button
                  variant="outline"
                  onClick={() => connectionMutation.mutate('authorize')}
                  disabled={connectionMutation.isPending}
                  aria-label="Autorizar novamente a fonte B3"
                  style={{ minHeight: 44 }}
                >
                  {connectionMutation.isPending ? 'Autorizando…' : 'Autorizar novamente'}
                </Button>
              ) : null}
              {b3Settings.connection.state === 'AUTHORIZED' ? (
                <Button
                  variant="outline"
                  onClick={() => connectionMutation.mutate('revoke')}
                  disabled={connectionMutation.isPending}
                  aria-label="Desconectar fonte B3"
                  style={{ minHeight: 44 }}
                >
                  {connectionMutation.isPending ? 'Desconectando…' : 'Desconectar'}
                </Button>
              ) : null}
            </span>
          ) : null}
          {connectionMutation.isError ? (
            <p
              role="alert"
              style={{
                fontSize: '0.875rem',
                color: colors.negative,
                margin: `${spacing.sm}px 0 0`,
              }}
            >
              {scheduleErrorMessage(connectionMutation.error)}
            </p>
          ) : null}
        </div>
      ) : null}
      {!schedulesAvailable ? (
        <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0 }}>
          Disponível quando a integração B3 for ativada.
        </p>
      ) : null}
      {settingsQuery.isLoading || schedulesQuery.isLoading ? (
        <Skeleton width="100%" height="96px" />
      ) : settingsQuery.isError && schedulesQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar as agendas"
          message="Tente novamente. Se o problema persistir, verifique sua conexão."
          onRetry={() => {
            void settingsQuery.refetch();
            void schedulesQuery.refetch();
          }}
        />
      ) : schedules.length === 0 ? (
        <EmptyState
          title="Nenhuma sincronização agendada"
          description={
            schedulesAvailable
              ? 'Crie uma agenda para coletar os dados da B3 automaticamente. Nova sincronização disponível quando a integração for ativada.'
              : 'Quando a integração B3 for ativada, você poderá agendar coletas automáticas aqui.'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
          {schedules.map((schedule) => renderScheduleRow(schedule, !schedulesAvailable))}
        </div>
      )}
      {schedulesAvailable && !b3Schedule ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: `${spacing.sm}px`,
            marginTop: `${spacing.sm}px`,
            alignItems: 'flex-end',
          }}
        >
          <label
            style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}
          >
            Frequência
            <select
              value={cadence}
              onChange={(event) => setCadence(event.target.value)}
              aria-label="Frequência da sincronização"
              style={{ minHeight: 44 }}
            >
              <option value="DAILY">Diária</option>
              <option value="WEEKDAYS">Dias úteis</option>
            </select>
          </label>
          <label
            style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}
          >
            Hora
            <select
              value={hour}
              onChange={(event) => setHour(event.target.value)}
              aria-label="Hora local"
              style={{ minHeight: 44 }}
            >
              {SCHEDULE_HOURS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label
            style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}
          >
            Minuto
            <select
              value={minute}
              onChange={(event) => setMinute(event.target.value)}
              aria-label="Minuto local"
              style={{ minHeight: 44 }}
            >
              {SCHEDULE_MINUTES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.8125rem',
              minHeight: 44,
            }}
          >
            <input
              type="checkbox"
              checked={enableOnCreate}
              onChange={(event) => setEnableOnCreate(event.target.checked)}
              aria-label="Ativar agenda após criar"
            />
            Ativar após criar
          </label>
          <Button
            variant="outline"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            aria-label="Criar sincronização automática da B3"
            style={{ minHeight: 44 }}
          >
            Agendar sincronização
          </Button>
        </div>
      ) : null}
      {createMutation.isError ? (
        <p style={{ fontSize: '0.875rem', color: colors.negative, margin: `${spacing.sm}px 0 0` }}>
          {scheduleErrorMessage(createMutation.error)}
        </p>
      ) : null}
      {toggleMutation.isError ? (
        <p style={{ fontSize: '0.875rem', color: colors.negative, margin: `${spacing.sm}px 0 0` }}>
          {scheduleErrorMessage(toggleMutation.error)}
        </p>
      ) : null}
    </Card>
  );
}

function ImportHubContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const authReady = useAuthReady();

  const [portfolioId, setPortfolioId] = useState<string | null>(searchParams.get('portfolioId'));
  const [fileName, setFileName] = useState('');
  const [content, setContent] = useState('');
  const [sourceType, setSourceType] = useState<'GENERIC_CSV' | 'B3_NEGOTIATION_XLSX'>('GENERIC_CSV');
  const [detectedFormatName, setDetectedFormatName] = useState<string | null>(null);
  const [provider, setProvider] = useState('Corretora');
  const [defaultAccountId, setDefaultAccountId] = useState('');
  const [skipRows, setSkipRows] = useState<Set<number>>(new Set());
  const [assetOverrides, setAssetOverrides] = useState<Record<number, string>>({});
  const [accountOverrides, setAccountOverrides] = useState<Record<number, string>>({});
  const [forceRows, setForceRows] = useState<Set<number>>(new Set());
  const [fileError, setFileError] = useState<string | null>(null);
  const [b3ModalOpen, setB3ModalOpen] = useState(false);
  const runIdParam = searchParams.get('runId');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(() => runIdParam);
  const [activeSection, setActiveSection] = useState<'import' | 'sync' | 'history'>(() =>
    runIdParam ? 'history' : 'import',
  );

  React.useEffect(() => {
    if (runIdParam && runIdParam !== selectedRunId) {
      setSelectedRunId(runIdParam);
      setActiveSection('history');
    }
  }, [runIdParam, selectedRunId]);

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

  const retryMutation = useMutation({
    mutationFn: async (runId: string) => {
      const res = await apiClient.post<{
        data: { originalRunId: string; newRunId: string; status: string; message: string };
      }>(`/api/v1/portfolios/${activePortfolioId}/imports/runs/${runId}/retry`);
      return res.data;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['import-runs', activePortfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-operations', activePortfolioId] });
      setSelectedRunId(res.newRunId);
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: PreviewResponse }>(
        `/api/v1/portfolios/${activePortfolioId}/imports/preview`,
        {
          ...(sourceType === 'B3_NEGOTIATION_XLSX'
            ? { sourceType: 'B3_NEGOTIATION_XLSX' as const }
            : { sourceType: 'GENERIC_CSV' as const }),
          provider: provider.trim() === '' ? (sourceType === 'B3_NEGOTIATION_XLSX' ? 'B3' : 'CSV') : provider.trim(),
          fileName: fileName === '' ? (sourceType === 'B3_NEGOTIATION_XLSX' ? 'negociacao.xlsx' : 'importacao.csv') : fileName,
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
          ...(sourceType === 'B3_NEGOTIATION_XLSX'
            ? { sourceType: 'B3_NEGOTIATION_XLSX' as const }
            : { sourceType: 'GENERIC_CSV' as const }),
          provider: provider.trim() === '' ? (sourceType === 'B3_NEGOTIATION_XLSX' ? 'B3' : 'CSV') : provider.trim(),
          fileName: previewData.fileName,
          content,
          ...(defaultAccountId === '' ? {} : { defaultAccountId }),
          decisions,
          ...(previewData.runId ? { runId: previewData.runId } : {}),
        },
      );
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['portfolio-state', activePortfolioId] });
      await queryClient.invalidateQueries({ queryKey: ['portfolio-positions', activePortfolioId] });
      await queryClient.invalidateQueries({ queryKey: ['import-runs', activePortfolioId] });
      await queryClient.invalidateQueries({ queryKey: ['integration-reviews'] });
      await queryClient.invalidateQueries({
        queryKey: ['portfolio-integrations', activePortfolioId],
      });
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
    const isXlsx =
      file.name.toLowerCase().endsWith('.xlsx') ||
      file.type.includes('spreadsheetml') ||
      file.type.includes('excel');

    if (isXlsx) {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const base64 = btoa(binary);
      setContent(base64);
      setSourceType('B3_NEGOTIATION_XLSX');
      setDetectedFormatName('Área do Investidor B3 — Negociação');
      setProvider('B3');
    } else {
      const text = await file.text();
      setContent(text);
      setSourceType('GENERIC_CSV');
      setDetectedFormatName(null);
      setProvider('Corretora');
    }
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

      <div style={{ marginBottom: `${spacing.base}px` }}>
        <Tabs
          tabs={[
            { id: 'import', label: 'Importar Arquivo' },
            { id: 'sync', label: 'Sincronização B3' },
            { id: 'history', label: 'Histórico de Importações' },
          ]}
          activeTab={activeSection}
          onTabChange={(id) => setActiveSection(id as 'import' | 'sync' | 'history')}
        />
      </div>

      <div style={{ display: activeSection === 'import' ? 'block' : 'none' }}>
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
      </div>

      <div style={{ display: activeSection === 'sync' ? 'block' : 'none' }}>
        <IntegrationSchedulesSection
          portfolioId={activePortfolioId}
          b3Availability={b3Availability}
        />
      </div>

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

      <div style={{ display: activeSection === 'history' ? 'block' : 'none' }}>
        <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
          <div id="import-history" style={{ scrollMarginTop: 72 }}>
            <SectionHeader title="Histórico de importações" />
          </div>
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
                    aria-label={`Ver detalhes da execução ${describeImportRunSource(run.source, run.fileName)} de ${run.createdAt ? formatCivilDateDisplay(run.createdAt.slice(0, 10)) : '—'}`}
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
                      {(() => {
                        const origin = describeIntegrationRunTrigger(run.trigger);
                        return <Badge variant={origin.tone}>{origin.label}</Badge>;
                      })()}
                      {run.partial ? <Badge variant="warning">Parcial</Badge> : null}
                    </span>
                    <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                      {run.createdAt ? formatCivilDateDisplay(run.createdAt.slice(0, 10)) : '—'}
                      {run.sourceAsOf
                        ? ` · dados de ${formatCivilDateDisplay(run.sourceAsOf)}`
                        : ''}
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
                  <p
                    style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: '4px 0 0' }}
                  >
                    {selectedRun.error.message}
                  </p>
                </div>
              ) : null}
              {selectedRun.status === 'AWAITING_REVIEW' ? (
                <p
                  style={{
                    fontSize: '0.875rem',
                    color: colors.textSecondary,
                    margin: `${spacing.sm}px 0 0`,
                  }}
                >
                  {selectedRun.trigger === 'SCHEDULED'
                    ? 'Nova sincronização disponível: revise os registros acima. A importação continua sendo feita por você — nada foi gravado no livro-razão.'
                    : 'Revise os registros acima antes de confirmar. Nada foi gravado no livro-razão.'}
                </p>
              ) : null}
              {selectedRun.recovery?.recoveryState === 'INTERRUPTED' ? (
                <div style={{ marginTop: `${spacing.sm}px` }}>
                  <Badge variant="warning">Interrompida</Badge>
                  <p style={{ fontSize: '0.875rem', color: colors.warning, margin: '4px 0 0' }}>
                    {selectedRun.recovery.reason}
                  </p>
                </div>
              ) : null}
              {selectedRun.recovery?.canRetry ? (
                <div style={{ marginTop: `${spacing.sm}px` }}>
                  <Button
                    variant="primary"
                    onClick={() => retryMutation.mutate(selectedRun.id)}
                    disabled={retryMutation.isPending}
                    aria-label="Tentar novamente"
                  >
                    {retryMutation.isPending ? 'Tentando novamente...' : 'Tentar novamente'}
                  </Button>
                  {retryMutation.isError ? (
                    <p style={{ fontSize: '0.8125rem', color: colors.negative, margin: '4px 0 0' }}>
                      Não foi possível repetir a sincronização. Tente novamente.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {selectedRun.recovery &&
              !selectedRun.recovery.canRetry &&
              selectedRun.status === 'FAILED' ? (
                <p
                  style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '4px 0 0' }}
                >
                  {selectedRun.recovery.reason}
                </p>
              ) : null}
              {selectedRun.recovery?.requiresReview ? (
                <div style={{ marginTop: `${spacing.sm}px` }}>
                  <Link
                    href={`/reviews?portfolioId=${activePortfolioId}`}
                    style={{ fontSize: '0.875rem', color: colors.accent, textDecoration: 'none' }}
                  >
                    Revisar pendências desta execução →
                  </Link>
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
      </div>

      <div style={{ display: activeSection === 'import' ? 'block' : 'none' }}>
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
              Arquivo da corretora ou B3 (CSV ou XLSX)
            </label>
            <input
              id="import-file"
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => void handleFile(event.target.files?.[0])}
              style={{ minHeight: 44, fontSize: '0.875rem' }}
            />
            {detectedFormatName && (
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: `${colors.accent}15`,
                  borderRadius: borderRadius.sm,
                  border: `1px solid ${colors.accent}`,
                  marginTop: 4,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.875rem',
                    color: colors.accent,
                    fontWeight: 600,
                  }}
                >
                  Formato detectado: {detectedFormatName}
                </p>
              </div>
            )}
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
                      'Instituição',
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
                        <td style={{ padding: 8 }}>
                          {formatCivilDateDisplay(candidate.tradeDate)}
                        </td>
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
                          {candidate.brokerLabel ?? provider}
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
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                minHeight: 44,
                              }}
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
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                minHeight: 44,
                              }}
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
              <Button
                variant="outline"
                onClick={() => {
                  previewMutation.reset();
                  setContent('');
                  setFileName('');
                  setDetectedFormatName(null);
                  setSkipRows(new Set());
                  setAssetOverrides({});
                  setAccountOverrides({});
                  setForceRows(new Set());
                }}
              >
                Cancelar
              </Button>
              {eligibility.hint && (
                <p
                  style={{ fontSize: '0.875rem', marginTop: `${spacing.sm}px` }}
                  aria-live="polite"
                >
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
              description="Envie um CSV no modelo Atlas ou XLSX da B3 para ver a análise antes de importar. Nada é lançado sem a sua confirmação."
              actionLabel="Baixar modelo CSV"
              onAction={downloadTemplate}
            />
          </Card>
        )}

        {receipt && (
          <Card style={{ padding: `${spacing.base}px` }}>
            <SectionHeader title="Importação concluída" />
            <p style={{ fontSize: '0.875rem' }} aria-live="polite">
              {receipt.created} operações lançadas · {receipt.skippedDuplicates} duplicadas
              ignoradas · {receipt.skippedByUser} ignoradas por você
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
              href={
                activePortfolioId ? `/portfolio?portfolioId=${activePortfolioId}` : '/portfolio'
              }
            >
              Voltar para a carteira
            </Link>
          </Card>
        )}
      </div>
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
