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
  detectClientSourceType,
  groupMovementNotices,
  type EffectiveRowState,
  type ClientSourceType,
  type MovementNoticeLike,
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
  institutionId?: string;
}

interface InstitutionOption {
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
  accountLabel?: string;
  normalizedInstitution?: string;
  externalId?: string;
  notes?: string;
  targetTicker?: string;
  targetQuantity?: string;
  conversionRatio?: string;
  conversionType?: string;
  unsettledExceptionEligible?: boolean;
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

interface UniqueAssetSummary {
  ticker: string;
  rowCount: number;
  assetId: string | null;
  status: 'RESOLVED' | 'NEEDS_MAPPING' | 'AMBIGUOUS';
  name?: string;
  type?: string;
}

interface UniqueInstitutionSummary {
  rawName: string;
  normalizedName: string;
  institutionId: string | null;
  matchedAccountId: string | null;
  matchedAccountName: string | null;
  rowCount: number;
  operationCount?: number;
  uniqueAssetCount?: number;
  rawNames?: string[];
  status: 'RESOLVED' | 'NEEDS_ACCOUNT' | 'AMBIGUOUS';
}

interface PreviewResponse {
  sourceType: string;
  provider: string;
  fileName: string;
  runId?: string | null;
  candidates: PreviewCandidate[];
  notices?: MovementNoticeLike[];
  detectedLayout?: string | null;
  detectedName?: string | null;
  summary: PreviewSummary;
  assetSummary?: UniqueAssetSummary[];
  institutionSummary?: UniqueInstitutionSummary[];
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
  failed: Array<{ rowNumber: number; message: string; kind: 'pending-review' | 'unsupported' | 'error' }>;
  pendingReviewCount: number;
  unsupportedCount: number;
  errorCount: number;
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
  pending: 'Pendente (não será importada)',
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
  const [sourceType, setSourceType] = useState<ClientSourceType>('GENERIC_CSV');
  const [detectedFormatName, setDetectedFormatName] = useState<string | null>(null);
  const [provider, setProvider] = useState('Corretora');
  const [defaultAccountId, setDefaultAccountId] = useState('');
  const [skipRows, setSkipRows] = useState<Set<number>>(new Set());
  const [assetOverrides, setAssetOverrides] = useState<Record<number, string>>({});
  const [accountOverrides, setAccountOverrides] = useState<Record<number, string>>({});
  const [editingAccountRows, setEditingAccountRows] = useState<Set<number>>(new Set());
  const [forceRows, setForceRows] = useState<Set<number>>(new Set());
  const [resolutionRows, setResolutionRows] = useState<
    Record<number, { reason: string; declaredSettlementDate: string }>
  >({});
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

  const { data: institutionsData } = useQuery({
    queryKey: ['institutions'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: InstitutionOption[] }>('/api/v1/institutions');
      return res.data;
    },
    enabled: authReady,
    staleTime: 300_000,
  });
  const institutions = useMemo(() => institutionsData ?? [], [institutionsData]);

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
          ...(sourceType === 'B3_ANNUAL_REPORT_XLSX'
            ? { sourceType: 'B3_ANNUAL_REPORT_XLSX' as const }
            : sourceType === 'B3_NEGOTIATION_XLSX'
              ? { sourceType: 'B3_NEGOTIATION_XLSX' as const }
              : sourceType === 'B3_MOVEMENT_XLSX'
                ? { sourceType: 'B3_MOVEMENT_XLSX' as const }
                : { sourceType: 'GENERIC_CSV' as const }),
          provider: provider.trim() === '' ? (sourceType !== 'GENERIC_CSV' ? 'B3' : 'CSV') : provider.trim(),
          fileName: fileName === '' ? (sourceType === 'B3_ANNUAL_REPORT_XLSX' ? 'anual.xlsx' : sourceType === 'B3_NEGOTIATION_XLSX' ? 'negociacao.xlsx' : sourceType === 'B3_MOVEMENT_XLSX' ? 'movimentacao.xlsx' : 'importacao.csv') : fileName,
          content,
          ...(defaultAccountId ? { defaultAccountId } : {}),
        },
      );
      // Hotfix B1 — the server re-detects the layout from the file bytes and
      // is the source of truth for the format label (declared sourceType is a hint).
      if (res.data.detectedName) {
        setDetectedFormatName(res.data.detectedName);
      } else if (res.data.sourceType === 'B3_ANNUAL_REPORT_XLSX') {
        setSourceType('B3_ANNUAL_REPORT_XLSX');
        setDetectedFormatName('Área do Investidor B3 — Relatório Consolidado Anual (Posição Inicial)');
      }
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
        ...(resolutionRows[candidate.rowNumber]
          ? { resolution: resolutionRows[candidate.rowNumber] }
          : {}),
      }),
    }));
  }, [previewMutation.data, skipRows, assetOverrides, accountOverrides, forceRows, resolutionRows]);

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
            ...(resolutionRows[row.candidate.rowNumber]
              ? { resolution: resolutionRows[row.candidate.rowNumber] }
              : {}),
          },
        })),
      ),
    [effectiveRows, skipRows, assetOverrides, accountOverrides, forceRows, resolutionRows],
  );

  const derivedSummary = useMemo(() => {
    const previewData = previewMutation.data ?? null;
    if (!previewData) return null;

    let ready = 0;
    let needsReview = 0;
    let duplicates = 0;
    let invalid = 0;
    let unsupported = 0;

    for (const row of effectiveRows) {
      const status = row.candidate.status;
      const effectiveState = row.effective.state;

      if (status === 'INVALID') {
        invalid += 1;
      } else if (status === 'UNSUPPORTED') {
        unsupported += 1;
      } else if (status === 'DUPLICATE') {
        duplicates += 1;
      } else if (effectiveState === 'importable') {
        ready += 1;
      } else if (effectiveState === 'blocked' || effectiveState === 'pending') {
        // Pending review rows keep the historical "precisam de revisão" count:
        // they stay visible and re-previewable, never silently dropped.
        needsReview += 1;
      } else if (effectiveState === 'skipped') {
        if (status === 'READY') {
          ready += 1;
        } else {
          needsReview += 1;
        }
      }
    }

    return {
      totalRows: previewData.candidates.length,
      ready,
      duplicates,
      needsReview,
      invalid,
      unsupported,
      ambiguousAssets: previewData.summary.ambiguousAssets,
    };
  }, [previewMutation.data, effectiveRows]);

  // Hotfix B1 (M2) — movement notices are display-only: grouped for review,
  // never counted as importable, never sent to confirm.
  const noticeGroups = useMemo(
    () => groupMovementNotices(previewMutation.data?.notices ?? []),
    [previewMutation.data],
  );
  const totalNotices = useMemo(
    () => noticeGroups.reduce((sum, group) => sum + group.count, 0),
    [noticeGroups],
  );

  const handleBatchAssetMap = (ticker: string, assetId: string) => {
    if (!previewMutation.data) return;
    const matchingRowNumbers = previewMutation.data.candidates
      .filter((c) => c.ticker.toUpperCase() === ticker.toUpperCase())
      .map((c) => c.rowNumber);

    setAssetOverrides((previous) => {
      const updated = { ...previous };
      for (const rowNum of matchingRowNumbers) {
        updated[rowNum] = assetId;
      }
      return updated;
    });
  };

  const handleBatchAccountMap = (instOrName: UniqueInstitutionSummary | string, accountId: string) => {
    if (!previewMutation.data) return;
    const normalized = typeof instOrName === 'string' ? instOrName.trim().toLowerCase() : instOrName.normalizedName.trim().toLowerCase();
    const raw = typeof instOrName === 'string' ? instOrName.trim().toLowerCase() : instOrName.rawName.trim().toLowerCase();
    const rawNames = typeof instOrName !== 'string' && instOrName.rawNames ? instOrName.rawNames.map((n) => n.toLowerCase()) : [];

    const matchingRowNumbers = previewMutation.data.candidates
      .filter((c) => {
        const rowBroker = (c.brokerLabel?.trim() || '').toLowerCase();
        const rowAccount = (c.accountLabel?.trim() || '').toLowerCase();
        const rowNormalized = (c.normalizedInstitution?.trim() || '').toLowerCase();
        return (
          (rowNormalized !== '' && rowNormalized === normalized) ||
          (rawNames.length > 0 && (rawNames.includes(rowBroker) || rawNames.includes(rowAccount))) ||
          rowBroker === normalized ||
          rowBroker === raw ||
          rowAccount === normalized ||
          rowAccount === raw ||
          (normalized.includes('xp') && (rowBroker.includes('xp') || rowAccount.includes('xp'))) ||
          (normalized.includes('nu') && (rowBroker.includes('nu') || rowAccount.includes('nu')))
        );
      })
      .map((c) => c.rowNumber);

    setAccountOverrides((previous) => {
      const updated = { ...previous };
      for (const rowNum of matchingRowNumbers) {
        updated[rowNum] = accountId;
      }
      return updated;
    });
  };

  const [creatingAccountFor, setCreatingAccountFor] = useState<string | null>(null);

  const handleCreateAccountForInstitution = async (inst: UniqueInstitutionSummary) => {
    if (!activePortfolioId) return;
    setCreatingAccountFor(inst.normalizedName);
    try {
      // 1. Idempotency / Duplicate Guard: reuse account if already exists in this portfolio
      const existingAccount = accounts.find(
        (a) =>
          a.name.toLowerCase() === inst.normalizedName.toLowerCase() ||
          (inst.institutionId && a.institutionId === inst.institutionId),
      );

      let targetAccountId = existingAccount?.id;

      if (!targetAccountId) {
        const instId =
          inst.institutionId ||
          institutions.find(
            (i) =>
              i.name.toLowerCase() === inst.normalizedName.toLowerCase() ||
              i.name.toLowerCase().includes(inst.normalizedName.toLowerCase()),
          )?.id;

        if (!instId) {
          setFileError(
            `Instituição "${inst.normalizedName}" não encontrada no catálogo para criação automática.`,
          );
          return;
        }

        const res = await apiClient.post<{ data: AccountOption }>(
          `/api/v1/portfolios/${activePortfolioId}/accounts`,
          {
            name: inst.normalizedName,
            institutionId: instId,
            currency: 'BRL',
          },
        );
        targetAccountId = res.data.id;
      }

      await queryClient.invalidateQueries({ queryKey: ['portfolio-accounts', activePortfolioId] });

      // Apply batch mapping to all rows of this institution
      handleBatchAccountMap(inst, targetAccountId);

      // Re-run preview against API so the server recognizes the newly created account in context.accounts
      await previewMutation.mutateAsync();
    } catch (err: unknown) {
      setFileError(err instanceof Error ? err.message : 'Falha ao criar conta para a instituição.');
    } finally {
      setCreatingAccountFor(null);
    }
  };

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const previewData = previewMutation.data;
      if (!previewData) throw new Error('Gere a análise do arquivo antes de confirmar.');
      const decisions: Array<{
        rowNumber: number;
        action: 'skip' | 'import';
        assetId?: string;
        accountId?: string;
        resolution?: {
          type: 'PRE_BASELINE_NOT_COVERED_BY_SNAPSHOT';
          reason: string;
          declaredSettlementDate?: string;
        };
      }> = [];
      for (const candidate of previewData.candidates) {
        const rowNumber = candidate.rowNumber;
        if (skipRows.has(rowNumber)) {
          decisions.push({ rowNumber, action: 'skip' });
          continue;
        }
        const assetId = assetOverrides[rowNumber];
        const accountId = accountOverrides[rowNumber];
        const resolution = resolutionRows[rowNumber];
        if (
          assetId !== undefined ||
          accountId !== undefined ||
          forceRows.has(rowNumber) ||
          resolution !== undefined
        ) {
          const declared = (resolution?.declaredSettlementDate ?? '').trim();
          decisions.push({
            rowNumber,
            action: 'import',
            ...(assetId !== undefined ? { assetId } : {}),
            ...(accountId !== undefined ? { accountId } : {}),
            ...(resolution !== undefined
              ? {
                  resolution: {
                    type: 'PRE_BASELINE_NOT_COVERED_BY_SNAPSHOT' as const,
                    reason: resolution.reason.trim(),
                    ...(declared !== '' ? { declaredSettlementDate: declared } : {}),
                  },
                }
              : {}),
          });
        }
      }
      const res = await apiClient.post<{ data: ImportReceipt }>(
        `/api/v1/portfolios/${activePortfolioId}/imports/confirm`,
        {
          ...(sourceType === 'B3_ANNUAL_REPORT_XLSX'
            ? { sourceType: 'B3_ANNUAL_REPORT_XLSX' as const }
            : sourceType === 'B3_NEGOTIATION_XLSX'
              ? { sourceType: 'B3_NEGOTIATION_XLSX' as const }
              : sourceType === 'B3_MOVEMENT_XLSX'
                ? { sourceType: 'B3_MOVEMENT_XLSX' as const }
                : { sourceType: 'GENERIC_CSV' as const }),
          provider: provider.trim() === '' ? (sourceType !== 'GENERIC_CSV' ? 'B3' : 'CSV') : provider.trim(),
          fileName: previewData.fileName,
          content,
          ...(defaultAccountId ? { defaultAccountId } : {}),
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
      // Filename sniffing is a UX hint only: the backend re-detects the layout
      // from the file bytes and wins for parsing and safety gates (hotfix B1).
      const hint = detectClientSourceType(file.name, true);
      setSourceType(hint.sourceType);
      setDetectedFormatName(hint.formatName);
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
    setEditingAccountRows(new Set());
    setForceRows(new Set());
    setResolutionRows({});
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

  const toggleResolution = (rowNumber: number) => {
    setResolutionRows((previous) => {
      const next = { ...previous };
      if (next[rowNumber] !== undefined) {
        delete next[rowNumber];
      } else {
        next[rowNumber] = { reason: '', declaredSettlementDate: '' };
      }
      return next;
    });
  };

  const updateResolution = (
    rowNumber: number,
    patch: Partial<{ reason: string; declaredSettlementDate: string }>,
  ) => {
    setResolutionRows((previous) => ({
      ...previous,
      [rowNumber]: {
        reason: previous[rowNumber]?.reason ?? '',
        declaredSettlementDate: previous[rowNumber]?.declaredSettlementDate ?? '',
        ...patch,
      },
    }));
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
                setEditingAccountRows(new Set());
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
                    ? previewMutation.error.details && Array.isArray(previewMutation.error.details)
                      ? `${previewMutation.error.message}: ${(
                          previewMutation.error.details as Array<{ path?: string; message?: string }>
                        )
                          .map((d) => (d.path ? `${d.path}: ${d.message ?? ''}` : d.message ?? ''))
                          .filter(Boolean)
                          .join('; ')}`
                      : previewMutation.error.message
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
              {(derivedSummary ?? preview.summary).totalRows} operações encontradas ·{' '}
              {(derivedSummary ?? preview.summary).ready} prontas ·{' '}
              {(derivedSummary ?? preview.summary).duplicates} duplicadas ·{' '}
              {(derivedSummary ?? preview.summary).needsReview} precisam de revisão ·{' '}
              {(derivedSummary ?? preview.summary).invalid} inválidas ·{' '}
              {(derivedSummary ?? preview.summary).unsupported} não suportadas
              {(derivedSummary ?? preview.summary).ambiguousAssets > 0
                ? ` · ${(derivedSummary ?? preview.summary).ambiguousAssets} com ativo ambíguo`
                : ''}
            </p>
            <p style={{ fontSize: '0.875rem', fontWeight: 600 }} aria-live="polite">
              {eligibility.importableCount} serão importadas · {eligibility.skippedCount} ignoradas
              por você · {eligibility.autoSkippedCount} ignoradas automaticamente ·{' '}
              {eligibility.pendingCount} aguardando revisão
              {eligibility.blockedCount > 0
                ? ` · ${eligibility.blockedCount} aguardando decisão`
                : ''}
            </p>

            {/* Step 17: Unique Asset Summary & Batch Resolution */}
            {preview.assetSummary && preview.assetSummary.length > 0 && (
              <div
                style={{
                  marginTop: `${spacing.base}px`,
                  marginBottom: `${spacing.base}px`,
                  padding: `${spacing.sm}px`,
                  backgroundColor: colors.surface,
                  borderRadius: borderRadius.sm,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    Ativos únicos encontrados ({preview.assetSummary.length})
                  </span>
                  <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                    Resolvidos automaticamente:{' '}
                    <strong style={{ color: colors.positive }}>
                      {
                        preview.assetSummary.filter(
                          (a) =>
                            a.status === 'RESOLVED' ||
                            preview.candidates.some(
                              (c) => c.ticker === a.ticker && assetOverrides[c.rowNumber],
                            ),
                        ).length
                      }
                    </strong>{' '}
                    · Precisam de decisão:{' '}
                    <strong
                      style={{
                        color:
                          preview.assetSummary.filter(
                            (a) =>
                              a.status !== 'RESOLVED' &&
                              !preview.candidates.some(
                                (c) => c.ticker === a.ticker && assetOverrides[c.rowNumber],
                              ),
                          ).length > 0
                            ? colors.warning
                            : colors.textSecondary,
                      }}
                    >
                      {
                        preview.assetSummary.filter(
                          (a) =>
                            a.status !== 'RESOLVED' &&
                            !preview.candidates.some(
                              (c) => c.ticker === a.ticker && assetOverrides[c.rowNumber],
                            ),
                        ).length
                      }
                    </strong>
                  </span>
                </div>

                {preview.assetSummary
                  .filter(
                    (a) =>
                      a.status !== 'RESOLVED' &&
                      !preview.candidates.some(
                        (c) => c.ticker === a.ticker && assetOverrides[c.rowNumber],
                      ),
                  )
                  .map((unresolved) => (
                    <div
                      key={unresolved.ticker}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '6px 8px',
                        backgroundColor: `${colors.warning}10`,
                        borderRadius: borderRadius.sm,
                        marginBottom: 4,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontSize: '0.8125rem' }}>
                        <strong>{unresolved.ticker}</strong> ({unresolved.rowCount} operações)
                      </span>
                      <select
                        aria-label={`Mapear ativo ${unresolved.ticker}`}
                        value={
                          preview.candidates.find(
                            (c) => c.ticker === unresolved.ticker && assetOverrides[c.rowNumber],
                          )
                            ? assetOverrides[
                                preview.candidates.find((c) => c.ticker === unresolved.ticker)!
                                  .rowNumber
                              ]
                            : ''
                        }
                        onChange={(event) => {
                          if (event.target.value) {
                            handleBatchAssetMap(unresolved.ticker, event.target.value);
                          }
                        }}
                        style={{ minHeight: 36, fontSize: '0.8125rem' }}
                      >
                        <option value="">
                          Aplicar a todas as ocorrências de {unresolved.ticker}…
                        </option>
                        {assets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.ticker} · {asset.exchange}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
              </div>
            )}

            {/* Step 16: File-level Institution Summary & Account Mapping */}
            {preview.institutionSummary && preview.institutionSummary.length > 0 && (
              <div
                style={{
                  marginBottom: `${spacing.base}px`,
                  padding: `${spacing.sm}px`,
                  backgroundColor: colors.surface,
                  borderRadius: borderRadius.sm,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 8 }}>
                  Instituições e contas de custódia
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {preview.institutionSummary.map((inst) => {
                    const normInst = inst.normalizedName.trim().toLowerCase();
                    const rawInst = inst.rawName.trim().toLowerCase();
                    const rawNames = inst.rawNames ? inst.rawNames.map((n) => n.toLowerCase()) : [];

                    const matchingCandidates = preview.candidates.filter((c) => {
                      const rowBroker = (c.brokerLabel?.trim() || '').toLowerCase();
                      const rowAccount = (c.accountLabel?.trim() || '').toLowerCase();
                      const rowNormalized = (c.normalizedInstitution?.trim() || '').toLowerCase();
                      return (
                        (rowNormalized !== '' && rowNormalized === normInst) ||
                        (rawNames.length > 0 && (rawNames.includes(rowBroker) || rawNames.includes(rowAccount))) ||
                        rowBroker === normInst ||
                        rowBroker === rawInst ||
                        rowAccount === normInst ||
                        rowAccount === rawInst ||
                        (normInst.includes('xp') && (rowBroker.includes('xp') || rowAccount.includes('xp'))) ||
                        (normInst.includes('nu') && (rowBroker.includes('nu') || rowAccount.includes('nu')))
                      );
                    });

                    const resolvedCandidates = matchingCandidates.filter((c) => {
                      const accId = accountOverrides[c.rowNumber] || c.accountId;
                      return Boolean(accId);
                    });

                    const isFullyResolved =
                      matchingCandidates.length > 0 &&
                      resolvedCandidates.length === matchingCandidates.length;

                    const sampleAccId =
                      (matchingCandidates[0] && accountOverrides[matchingCandidates[0].rowNumber]) ||
                      matchingCandidates[0]?.accountId ||
                      inst.matchedAccountId;
                    const resolvedAccount = sampleAccId
                      ? accounts.find((a) => a.id === sampleAccId)
                      : null;

                    const totalOps = inst.operationCount ?? inst.rowCount;
                    const uniqueAssets = inst.uniqueAssetCount;

                    return (
                      <div
                        key={inst.normalizedName}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 8,
                          padding: '8px 12px',
                          border: `1px solid ${colors.border}`,
                          borderRadius: borderRadius.sm,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                            {inst.normalizedName}{' '}
                            <span style={{ fontWeight: 400, color: colors.textSecondary }}>
                              — {totalOps} {totalOps === 1 ? 'operação' : 'operações'}
                              {uniqueAssets !== undefined
                                ? ` · ${uniqueAssets} ${uniqueAssets === 1 ? 'ativo único' : 'ativos únicos'}`
                                : ''}
                            </span>
                          </div>
                          {inst.rawName !== inst.normalizedName && (
                            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                              {inst.rawName}
                            </div>
                          )}
                          <div style={{ marginTop: 4 }}>
                            {isFullyResolved && resolvedAccount ? (
                              <Badge variant="success">Conta resolvida: {resolvedAccount.name}</Badge>
                            ) : resolvedCandidates.length > 0 ? (
                              <Badge variant="warning">
                                {resolvedCandidates.length} de {matchingCandidates.length} operações com conta
                              </Badge>
                            ) : (
                              <Badge variant="warning">Conta não definida</Badge>
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flexWrap: 'wrap',
                          }}
                        >
                          <select
                            aria-label={`Conta para operações de ${inst.normalizedName}`}
                            value={resolvedAccount ? resolvedAccount.id : ''}
                            onChange={(event) => {
                              if (event.target.value) {
                                handleBatchAccountMap(inst, event.target.value);
                              }
                            }}
                            style={{ minHeight: 40, fontSize: '0.8125rem' }}
                          >
                            <option value="">
                              {isFullyResolved && resolvedAccount
                                ? 'Trocar conta para todas…'
                                : 'Selecionar conta para todas…'}
                            </option>
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}
                              </option>
                            ))}
                          </select>

                          {!isFullyResolved && (
                            <Button
                              variant="secondary"
                              onClick={() => void handleCreateAccountForInstitution(inst)}
                              disabled={creatingAccountFor === inst.normalizedName}
                              style={{ minHeight: 40, fontSize: '0.8125rem' }}
                            >
                              {creatingAccountFor === inst.normalizedName
                                ? 'Criando conta…'
                                : `+ Criar conta "${inst.normalizedName}"`}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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

                    const effectiveAccountId = accountOverrides[rowNumber] ?? candidate.accountId;
                    const effectiveAssetId = assetOverrides[rowNumber] ?? candidate.assetId;
                    const isAccountResolved = Boolean(effectiveAccountId);
                    const isAssetResolved = Boolean(effectiveAssetId);

                    const needsAsset =
                      !isAssetResolved &&
                      (candidate.status === 'NEEDS_REVIEW' ||
                        candidate.status === 'AMBIGUOUS_ASSET');
                    const needsAccount =
                      (!isAccountResolved || editingAccountRows.has(rowNumber)) &&
                      (candidate.status === 'NEEDS_REVIEW' ||
                        candidate.status === 'AMBIGUOUS_ASSET');

                    const resolvedAccountObj = effectiveAccountId
                      ? accounts.find((a) => a.id === effectiveAccountId)
                      : null;

                    const sameTickerAssets = assets.filter(
                      (asset) => asset.ticker === candidate.ticker,
                    );
                    const assetOptions = sameTickerAssets.length > 0 ? sameTickerAssets : assets;

                    // Filter out issues that are resolved by overrides
                    const activeIssues = candidate.issues.filter((issue) => {
                      if (
                        isAccountResolved &&
                        (issue.code === 'ACCOUNT_REQUIRED' || issue.code === 'ACCOUNT_NOT_FOUND')
                      ) {
                        return false;
                      }
                      if (
                        isAssetResolved &&
                        (issue.code === 'UNKNOWN_ASSET' || issue.code === 'AMBIGUOUS_ASSET')
                      ) {
                        return false;
                      }
                      return true;
                    });
                    return (
                      <tr key={rowNumber} style={{ borderTop: `1px solid ${colors.border}` }}>
                        <td style={{ padding: 8 }}>{rowNumber}</td>
                        <td style={{ padding: 8 }}>
                          {formatCivilDateDisplay(candidate.tradeDate)}
                        </td>
                        <td style={{ padding: 8 }}>
                          <div>
                            <strong>{candidate.ticker}</strong>
                            {candidate.operation === 'RECEIPT_CONVERSION' &&
                              candidate.targetTicker && (
                                <div
                                  style={{
                                    fontSize: '0.75rem',
                                    color: colors.textSecondary,
                                    marginTop: 2,
                                  }}
                                >
                                  → {candidate.targetTicker}
                                  {candidate.targetQuantity &&
                                    ` · ${formatQuantity(candidate.targetQuantity)}`}
                                  {candidate.conversionRatio &&
                                    ` · proporção ${candidate.conversionRatio}`}
                                </div>
                              )}
                            {candidate.notes && (
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  color: colors.textMuted,
                                  marginTop: 2,
                                  maxWidth: 320,
                                }}
                              >
                                {candidate.notes}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: 8 }}>
                          {candidate.operation === 'BUY'
                            ? 'Compra'
                            : candidate.operation === 'SELL'
                              ? 'Venda'
                              : candidate.operation === 'BONUS'
                                ? 'Bonificação'
                                : candidate.operation === 'SUBSCRIPTION'
                                  ? 'Subscrição exercida'
                                  : candidate.operation === 'RECEIPT_CONVERSION'
                                    ? 'Conversão de recibo'
                                    : candidate.operation === 'TRANSFER_IN'
                                ? candidate.rawOperation === 'POSICAO_INICIAL'
                                  ? 'Posição Inicial'
                                  : 'Transferência (entrada)'
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
                          {(candidate.rawOperation === 'POSICAO_INICIAL' ||
                            candidate.operation === 'BONUS' ||
                            candidate.operation === 'RECEIPT_CONVERSION') &&
                          candidate.unitPrice === '0'
                            ? '—'
                            : formatCurrency(candidate.unitPrice, candidate.currency)}
                        </td>
                        <td style={{ padding: 8 }}>
                          {candidate.brokerLabel ?? provider}
                        </td>
                        <td style={{ padding: 8 }}>
                          {formatCurrency(candidate.fees, candidate.currency)}
                        </td>
                        <td style={{ padding: 8 }}>
                          <span>
                            {effectiveState === 'importable'
                              ? 'Pronta'
                              : STATUS_LABEL[candidate.status]}
                          </span>
                          <div style={{ fontWeight: 600 }}>{EFFECTIVE_LABEL[effectiveState]}</div>
                          {activeIssues.map((issue) => (
                            <div
                              key={issue.code}
                              style={{ color: colors.textSecondary, fontSize: '0.75rem' }}
                            >
                              {issue.message}
                            </div>
                          ))}
                          {resolvedAccountObj && !editingAccountRows.has(rowNumber) && (
                            <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: 4 }}>
                              Conta:{' '}
                              <strong style={{ color: colors.textPrimary }}>
                                {resolvedAccountObj.name}
                              </strong>
                              {accountOverrides[rowNumber] ? (
                                <span style={{ color: colors.accent, marginLeft: 4 }}>(manual)</span>
                              ) : null}
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingAccountRows((prev) => new Set(prev).add(rowNumber))
                                }
                                style={{
                                  fontSize: '0.75rem',
                                  color: colors.accent,
                                  background: 'none',
                                  border: 'none',
                                  padding: '0 4px',
                                  marginLeft: 6,
                                  cursor: 'pointer',
                                  textDecoration: 'underline',
                                }}
                              >
                                alterar
                              </button>
                            </div>
                          )}
                          {needsAsset && (
                            <div style={{ marginTop: 4 }}>
                              <select
                                aria-label={`Ativo da linha ${rowNumber}`}
                                value={assetOverrides[rowNumber] ?? ''}
                                onChange={(event) =>
                                  setAssetOverrides((previous) => ({
                                    ...previous,
                                    [rowNumber]: event.target.value,
                                  }))
                                }
                                style={{ minHeight: 44, width: '100%' }}
                              >
                                <option value="">Selecionar ativo…</option>
                                {assetOptions.map((asset) => (
                                  <option key={asset.id} value={asset.id}>
                                    {asset.ticker} · {asset.exchange}
                                  </option>
                                ))}
                              </select>
                              {assetOverrides[rowNumber] && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleBatchAssetMap(candidate.ticker, assetOverrides[rowNumber]!)
                                  }
                                  style={{
                                    fontSize: '0.75rem',
                                    color: colors.accent,
                                    background: 'none',
                                    border: 'none',
                                    padding: '2px 0',
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                  }}
                                >
                                  Aplicar a todas as ocorrências de {candidate.ticker}
                                </button>
                              )}
                            </div>
                          )}
                          {needsAccount && (
                            <div style={{ marginTop: 4 }}>
                              <select
                                aria-label={`Conta da linha ${rowNumber}`}
                                value={effectiveAccountId ?? ''}
                                onChange={(event) => {
                                  const val = event.target.value;
                                  setAccountOverrides((previous) => ({
                                    ...previous,
                                    [rowNumber]: val,
                                  }));
                                  setEditingAccountRows((prev) => {
                                    const next = new Set(prev);
                                    next.delete(rowNumber);
                                    return next;
                                  });
                                }}
                                style={{ minHeight: 44, width: '100%' }}
                              >
                                <option value="">Selecionar conta…</option>
                                {accounts.map((account) => (
                                  <option key={account.id} value={account.id}>
                                    {account.name}
                                  </option>
                                ))}
                              </select>
                              {effectiveAccountId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleBatchAccountMap(
                                      candidate.normalizedInstitution ??
                                        candidate.brokerLabel ??
                                        candidate.accountLabel ??
                                        '',
                                      effectiveAccountId,
                                    )
                                  }
                                  style={{
                                    fontSize: '0.75rem',
                                    color: colors.accent,
                                    background: 'none',
                                    border: 'none',
                                    padding: '2px 0',
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                  }}
                                >
                                  Usar esta conta para todas as operações desta instituição
                                </button>
                              )}
                            </div>
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
                          {candidate.unsettledExceptionEligible && !skipped && (
                            <div style={{ marginTop: 8 }}>
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
                                  checked={resolutionRows[rowNumber] !== undefined}
                                  onChange={() => toggleResolution(rowNumber)}
                                  aria-label={`Resolver trade pré-baseline não liquidado na linha ${rowNumber}`}
                                />
                                Trade liquidado após o snapshot
                              </label>
                              {resolutionRows[rowNumber] !== undefined && (
                                <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                                  <input
                                    type="text"
                                    value={resolutionRows[rowNumber]?.reason ?? ''}
                                    onChange={(event) =>
                                      updateResolution(rowNumber, { reason: event.target.value })
                                    }
                                    placeholder="Motivo com evidência (ex.: liquidação em 02/01/2025, após corte de 31/12)"
                                    aria-label={`Motivo da resolução na linha ${rowNumber}`}
                                    maxLength={500}
                                    style={{ minHeight: 44, width: '100%' }}
                                  />
                                  <input
                                    type="text"
                                    value={resolutionRows[rowNumber]?.declaredSettlementDate ?? ''}
                                    onChange={(event) =>
                                      updateResolution(rowNumber, {
                                        declaredSettlementDate: event.target.value,
                                      })
                                    }
                                    placeholder="Liquidação declarada AAAA-MM-DD (opcional)"
                                    aria-label={`Liquidação declarada na linha ${rowNumber}`}
                                    style={{ minHeight: 44, width: '100%' }}
                                  />
                                </div>
                              )}
                            </div>
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
            {/* Hotfix B1 (M2) — movement notices: display-only grouped section.
                Notices never enter readyCount / willImport / confirm payload. */}
            {noticeGroups.length > 0 && (
              <div style={{ marginTop: `${spacing.base}px` }} data-testid="movement-notices">
                <SectionHeader
                  title={`Avisos e eventos sem efeito direto (${totalNotices})`}
                  description="Proventos, direitos, empréstimos e marcadores informativos. Estes itens não serão importados."
                />
                {noticeGroups.map((group) => (
                  <details
                    key={group.key}
                    style={{
                      marginTop: `${spacing.sm}px`,
                      border: `1px solid ${colors.border}`,
                      borderRadius: `${borderRadius.md}px`,
                      padding: `${spacing.sm}px`,
                    }}
                  >
                    <summary
                      style={{
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: colors.textPrimary,
                        minHeight: 44,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {group.label} ({group.count})
                    </summary>
                    <ul style={{ listStyle: 'none', padding: 0, margin: `${spacing.sm}px 0 0` }}>
                      {group.items.map((notice) => (
                        <li
                          key={notice.rowNumber}
                          style={{
                            fontSize: '0.8125rem',
                            color: colors.textSecondary,
                            marginBottom: 4,
                          }}
                        >
                          <strong style={{ color: colors.textPrimary }}>
                            {notice.ticker || '—'}
                          </strong>{' '}
                          · {notice.movement}
                          {notice.tradeDate ? ` · ${formatCivilDateDisplay(notice.tradeDate)}` : ''} ·{' '}
                          {notice.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            )}
            <div style={{ marginTop: `${spacing.base}px` }}>
              <Button
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending || !eligibility.canConfirm}
              >
                {confirmMutation.isPending
                  ? 'Importando…'
                  : eligibility.importableCount > 0
                    ? `4. Confirmar ${eligibility.importableCount} evento${eligibility.importableCount === 1 ? '' : 's'} suportado${eligibility.importableCount === 1 ? '' : 's'}`
                    : '4. Confirmar importação'}
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
                  setEditingAccountRows(new Set());
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
            <SectionHeader
              title={
                receipt.pendingReviewCount > 0
                  ? 'Importação concluída parcialmente'
                  : 'Importação concluída'
              }
            />
            <p style={{ fontSize: '0.875rem' }} aria-live="polite">
              {receipt.created} {receipt.created === 1 ? 'evento importado' : 'eventos importados'}{' '}
              com sucesso.
              {receipt.pendingReviewCount > 0
                ? ` ${receipt.pendingReviewCount} ${receipt.pendingReviewCount === 1 ? 'item permanece' : 'itens permanecem'} pendente${receipt.pendingReviewCount === 1 ? '' : 's'} de revisão.`
                : ''}
              {receipt.unsupportedCount > 0
                ? ` ${receipt.unsupportedCount} ${receipt.unsupportedCount === 1 ? 'item não suportado foi' : 'itens não suportados foram'} ignorado${receipt.unsupportedCount === 1 ? '' : 's'} automaticamente.`
                : ''}
            </p>
            {receipt.errorCount === 0 ? (
              <p style={{ fontSize: '0.875rem', color: colors.positive }}>
                Nenhum erro técnico ocorreu.
              </p>
            ) : (
              <p style={{ fontSize: '0.875rem', color: colors.negative }}>
                {receipt.errorCount} {receipt.errorCount === 1 ? 'erro técnico precisa' : 'erros técnicos precisam'} da sua atenção.
              </p>
            )}
            {receipt.failed.some((failure) => failure.kind === 'pending-review') && (
              <details
                style={{
                  marginTop: `${spacing.sm}px`,
                  border: `1px solid ${colors.border}`,
                  borderRadius: `${borderRadius.md}px`,
                  padding: `${spacing.sm}px`,
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  Pendentes de revisão (
                  {receipt.failed.filter((failure) => failure.kind === 'pending-review').length})
                </summary>
                <ul style={{ listStyle: 'none', padding: 0, margin: `${spacing.sm}px 0 0` }}>
                  {receipt.failed
                    .filter((failure) => failure.kind === 'pending-review')
                    .map((failure) => (
                      <li
                        key={failure.rowNumber}
                        style={{
                          fontSize: '0.8125rem',
                          color: colors.textSecondary,
                          marginBottom: 4,
                        }}
                      >
                        Linha {failure.rowNumber}: {failure.message} Reanalise o arquivo quando
                        quiser concluí-las — nada foi perdido.
                      </li>
                    ))}
                </ul>
              </details>
            )}
            {receipt.failed.some((failure) => failure.kind === 'unsupported') && (
              <details
                style={{
                  marginTop: `${spacing.sm}px`,
                  border: `1px solid ${colors.border}`,
                  borderRadius: `${borderRadius.md}px`,
                  padding: `${spacing.sm}px`,
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  Não suportados / ignorados automaticamente (
                  {receipt.failed.filter((failure) => failure.kind === 'unsupported').length})
                </summary>
                <ul style={{ listStyle: 'none', padding: 0, margin: `${spacing.sm}px 0 0` }}>
                  {receipt.failed
                    .filter((failure) => failure.kind === 'unsupported')
                    .map((failure) => (
                      <li
                        key={failure.rowNumber}
                        style={{
                          fontSize: '0.8125rem',
                          color: colors.textSecondary,
                          marginBottom: 4,
                        }}
                      >
                        Linha {failure.rowNumber}: {failure.message}
                      </li>
                    ))}
                </ul>
              </details>
            )}
            {receipt.failed.some((failure) => failure.kind === 'error') && (
              <details
                open
                style={{
                  marginTop: `${spacing.sm}px`,
                  border: `1px solid ${colors.negative}`,
                  borderRadius: `${borderRadius.md}px`,
                  padding: `${spacing.sm}px`,
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  Erros reais ({receipt.failed.filter((failure) => failure.kind === 'error').length}
                  )
                </summary>
                <ul style={{ listStyle: 'none', padding: 0, margin: `${spacing.sm}px 0 0` }}>
                  {receipt.failed
                    .filter((failure) => failure.kind === 'error')
                    .map((failure) => (
                      <li
                        key={failure.rowNumber}
                        style={{
                          fontSize: '0.8125rem',
                          color: colors.textSecondary,
                          marginBottom: 4,
                        }}
                      >
                        Linha {failure.rowNumber}: {failure.message}
                      </li>
                    ))}
                </ul>
              </details>
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
