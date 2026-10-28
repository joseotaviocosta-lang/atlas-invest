'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Skeleton, ErrorState, EmptyState, SectionHeader, Button, Badge } from '@/components/ui';
import { colors, spacing, borderRadius } from '@atlas/ui';
import {
  describeScenarioLimitation,
  describeScenarioState,
  formatAggregatePp,
  formatCentsBr,
  formatScenarioBp,
  formatScenarioDeviationTransition,
  formatScenarioMoney,
  parseScenarioMoneyToCents,
  scenarioCategoryLabel,
  type AllocationScenarioRowView,
} from '@atlas/ui';
import { allocationScenariosQueryKey } from './PortfolioScenarioSimulator';
import { dispatchCreatePlan } from './PortfolioContributionPlans';

const SCENARIO_CATEGORIES = [
  'STOCK',
  'FII',
  'ETF',
  'BDR',
  'FIXED_INCOME',
  'TREASURY',
  'FUND',
  'CASH',
  'OTHER',
] as const;

interface SavedScenarioDto {
  id: string;
  portfolioId: string;
  name: string;
  type: string;
  changes: Array<{ category: string; amount: string }>;
  hypotheticalTotal: string;
  createdAt: string;
  updatedAt: string;
}

interface LiveResultView {
  totals: { current: string; scenario: string; projected: string; currency: string };
  rows: AllocationScenarioRowView[];
  beforeOutsideCount: number;
  afterOutsideCount: number;
  beforeTotalAbsDeviationBp: number;
  afterTotalAbsDeviationBp: number;
  worstGap: { category: string; deviationBp: number } | null;
  qualified: boolean;
  denominator: string;
  generatedAt: string;
  marketDataAsOf: string | null;
}

interface ScenarioDetailData {
  saved: SavedScenarioDto;
  strategy: { targets: Array<{ category: string; targetBp: number }> } | null;
  live: LiveResultView | null;
  limitations: string[];
}

interface CompareSide {
  scenarioId: string;
  name: string;
  scenarioTotal: string;
  projectedTotal: string;
  outsideCount: number;
  totalAbsDeviationBp: number;
  projectedWeights: Array<{ category: string; projectedBp: number; projectedDeviationBp: number }>;
}

interface ScenarioCompareData {
  scenarios: [SavedScenarioDto, SavedScenarioDto];
  comparison: { currency: string; sameScenarioTotal: boolean; sides: [CompareSide, CompareSide] };
  limitations: string[];
  generatedAt: string;
  marketDataAsOf: string | null;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const message = error.message ?? '';
    if (message.trim().length > 0) return message;
  }
  return fallback;
}

function formatDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function outsideLabel(count: number): string {
  return count === 1 ? '1 categoria fora da meta' : `${count} categorias fora da meta`;
}

export function LiveResultTable({ live }: { live: LiveResultView }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: colors.textSecondary }}>
            <th scope="col" style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>
              Categoria
            </th>
            <th scope="col" style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>
              Meta
            </th>
            <th scope="col" style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>
              Atual
            </th>
            <th scope="col" style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>
              Projetado
            </th>
            <th scope="col" style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>
              Aporte hipotético
            </th>
            <th
              scope="col"
              style={{ padding: '6px 0 6px 8px', fontWeight: 600, textAlign: 'right' }}
            >
              Desvio projetado
            </th>
          </tr>
        </thead>
        <tbody>
          {live.rows.map((row) => (
            <tr key={row.category} style={{ borderTop: `1px solid ${colors.border}` }}>
              <td style={{ padding: '8px 8px 8px 0' }}>
                <div style={{ fontWeight: 600 }}>{scenarioCategoryLabel(row.category)}</div>
                <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                  {describeScenarioState(row.state)}
                </div>
              </td>
              <td style={{ padding: 8, textAlign: 'right' }}>{formatScenarioBp(row.targetBp)}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{formatScenarioBp(row.currentBp)}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>
                {formatScenarioBp(row.projectedBp)}
              </td>
              <td style={{ padding: 8, textAlign: 'right' }}>
                {formatScenarioMoney(row.scenarioAmount, live.totals.currency)}
              </td>
              <td style={{ padding: '8px 0 8px 8px', textAlign: 'right' }}>
                {formatScenarioDeviationTransition(
                  row.currentDeviationBp,
                  row.projectedDeviationBp,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LimitationsNote({ codes }: { codes: string[] }) {
  if (codes.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '8px 0' }}>
      {codes.map((code) => (
        <p
          key={code}
          style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: 0 }}
          data-testid={`limitation-${code}`}
        >
          {code === 'PARTIAL_COVERAGE' ? (
            <>
              <Badge variant="warning">Dados parciais</Badge> {describeScenarioLimitation(code)}
            </>
          ) : (
            describeScenarioLimitation(code)
          )}
        </p>
      ))}
    </div>
  );
}

/**
 * Phase 5Q-E — saved hypothetical scenarios (input only).
 * Lists stored hypotheses, opens them with a live recomputation against
 * the current portfolio + strategy, and compares two on one shared basis.
 * No choosing between scenarios, no scoring, no execution: facts only.
 */
export function PortfolioSavedScenarios({ portfolioId }: { portfolioId: string | null }) {
  const queryClient = useQueryClient();
  const authReady = useAuthReady();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formSnapshot, setFormSnapshot] = useState<{
    name: string;
    values: Record<string, string>;
  } | null>(null);
  const [formName, setFormName] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const listQuery = useQuery({
    queryKey: allocationScenariosQueryKey(portfolioId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<{ data: { scenarios: SavedScenarioDto[]; limit: number } }>(
        `/api/v1/portfolios/${portfolioId}/allocation-scenarios`,
      );
      return res.data;
    },
    enabled: authReady && portfolioId !== null,
    staleTime: 30_000,
  });

  const detailQuery = useQuery({
    queryKey: [...allocationScenariosQueryKey(portfolioId ?? ''), 'detail', openId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ScenarioDetailData }>(
        `/api/v1/portfolios/${portfolioId}/allocation-scenarios/${openId}`,
      );
      return res.data;
    },
    enabled: authReady && portfolioId !== null && openId !== null,
    staleTime: 30_000,
  });

  const parsed = useMemo(() => {
    const entries: Array<{ category: string; amount: string }> = [];
    let invalid: string | null = null;
    let totalCents = BigInt(0);
    const name = formName.trim();
    if (name === '') invalid = 'Informe um nome para o cenário.';
    else if (name.length > 80) invalid = 'O nome precisa ter até 80 caracteres.';
    else if (name.includes('<') || name.includes('>')) invalid = 'O nome não pode conter < ou >.';
    for (const category of SCENARIO_CATEGORIES) {
      const raw = formValues[category] ?? '';
      if (raw.trim() === '') continue;
      const cents = parseScenarioMoneyToCents(raw);
      if (cents === null || cents <= BigInt(0)) {
        invalid = `Valor inválido em ${scenarioCategoryLabel(category)}. Use formato como 10.000,50.`;
        break;
      }
      totalCents += cents;
      entries.push({ category, amount: raw.trim() });
    }
    if (invalid === null && entries.length === 0)
      invalid = 'Informe ao menos um aporte hipotético.';
    return { entries, invalid, totalCents };
  }, [formName, formValues]);

  const dirty = useMemo(() => {
    if (!formOpen || !formSnapshot) return false;
    if (formSnapshot.name !== formName.trim()) return true;
    for (const category of SCENARIO_CATEGORIES) {
      if ((formSnapshot.values[category] ?? '') !== (formValues[category] ?? '')) return true;
    }
    return false;
  }, [formOpen, formSnapshot, formName, formValues]);

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({
      queryKey: allocationScenariosQueryKey(portfolioId ?? ''),
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const res = await apiClient.put<{ data: unknown }>(
          `/api/v1/portfolios/${portfolioId}/allocation-scenarios/${editingId}`,
          { name: formName.trim(), type: 'CONTRIBUTION', changes: parsed.entries },
        );
        return res.data;
      }
      const res = await apiClient.post<{ data: unknown }>(
        `/api/v1/portfolios/${portfolioId}/allocation-scenarios`,
        { name: formName.trim(), type: 'CONTRIBUTION', changes: parsed.entries },
      );
      return res.data;
    },
    onSuccess: async () => {
      await invalidateAll();
      setAnnouncement(editingId ? 'Alterações salvas.' : 'Cenário salvo.');
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (scenarioId: string) => {
      await apiClient.delete(
        `/api/v1/portfolios/${portfolioId}/allocation-scenarios/${scenarioId}`,
      );
    },
    onSuccess: async (_data, scenarioId) => {
      await invalidateAll();
      if (openId === scenarioId) setOpenId(null);
      setCompareIds((previous) => previous.filter((id) => id !== scenarioId));
      setDeleteConfirmId(null);
      setAnnouncement('Cenário excluído.');
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (target: string) => {
      const res = await apiClient.post<{
        data: { scenario: LiveResultView | null; limitations: string[] };
      }>(`/api/v1/portfolios/${portfolioId}/allocation-strategy/simulate`, {
        type: 'CONTRIBUTION',
        changes: parsed.entries,
      });
      setPreviewFor(target);
      return res.data.scenario;
    },
  });

  const compareMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: ScenarioCompareData }>(
        `/api/v1/portfolios/${portfolioId}/allocation-scenarios/compare`,
        { scenarioIds: compareIds },
      );
      return res.data;
    },
    onSuccess: () => {
      setAnnouncement('Comparação calculada sobre a mesma base atual.');
    },
  });

  const openFormForCreate = (prefill?: { name: string; values: Record<string, string> }) => {
    setEditingId(null);
    setFormSnapshot({ name: prefill?.name ?? '', values: prefill?.values ?? {} });
    setFormName(prefill?.name ?? '');
    setFormValues(prefill?.values ?? {});
    setFormOpen(true);
    previewMutation.reset();
    setPreviewFor(null);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormSnapshot(null);
    setFormName('');
    setFormValues({});
    previewMutation.reset();
    setPreviewFor(null);
  };

  const openDetail = (scenario: SavedScenarioDto) => {
    setOpenId(scenario.id);
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setTimeout(() => {
        const el = document.getElementById('scenario-detail-section');
        const prefersReduced =
          typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        if (el)
          el.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'nearest' });
      }, 100);
    }
  };

  const startEdit = (scenario: SavedScenarioDto) => {
    const values: Record<string, string> = {};
    for (const change of scenario.changes) {
      values[change.category] = change.amount.replace('.', ',');
    }
    setEditingId(scenario.id);
    setFormSnapshot({ name: scenario.name, values: { ...values } });
    setFormName(scenario.name);
    setFormValues(values);
    setFormOpen(true);
    previewMutation.reset();
    setPreviewFor(null);
  };

  const startDuplicate = async (scenario: SavedScenarioDto) => {
    const detail = await apiClient.get<{ data: ScenarioDetailData }>(
      `/api/v1/portfolios/${portfolioId}/allocation-scenarios/${scenario.id}`,
    );
    const values: Record<string, string> = {};
    for (const change of detail.data.saved.changes) {
      values[change.category] = change.amount.replace('.', ',');
    }
    const base = detail.data.saved.name;
    const suffix = ' — cópia';
    const copyName =
      `${base}${suffix}`.length <= 80
        ? `${base}${suffix}`
        : `${base.slice(0, 80 - suffix.length).trimEnd()}${suffix}`;
    openFormForCreate({ name: copyName, values });
    setAnnouncement('Duplicata pronta para salvar. Ajuste o nome se quiser.');
  };

  const toggleCompare = (scenarioId: string) => {
    compareMutation.reset();
    setCompareIds((previous) => {
      if (previous.includes(scenarioId)) return previous.filter((id) => id !== scenarioId);
      if (previous.length >= 2) return previous;
      return [...previous, scenarioId];
    });
  };

  const scenarios = listQuery.data?.scenarios ?? [];
  const compareResult = compareMutation.data ?? null;
  const rawDetail = detailQuery.data ?? null;
  const detail = rawDetail && rawDetail.saved.id === openId ? rawDetail : null;

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: '0.875rem',
  };

  return (
    <div
      style={{
        marginTop: `${spacing.base}px`,
        borderTop: `1px solid ${colors.border}`,
        paddingTop: `${spacing.base}px`,
      }}
      data-testid="saved-scenarios"
    >
      <SectionHeader
        title="Cenários salvos"
        description="Hipóteses guardadas por você. O resultado é recalculado com a carteira e as metas atuais sempre que você abrir um cenário."
      />
      <div
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      >
        {announcement}
      </div>

      {listQuery.isLoading ? (
        <Skeleton width="100%" height="80px" />
      ) : listQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar os cenários"
          message="Tente novamente."
          onRetry={() => listQuery.refetch()}
        />
      ) : (
        <>
          {scenarios.length === 0 && !formOpen ? (
            <EmptyState
              title="Você ainda não salvou nenhum cenário."
              description="Guarde uma hipótese de aporte para comparar efeitos depois."
              actionLabel="Criar simulação"
              onAction={() => openFormForCreate()}
            />
          ) : (
            <>
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {scenarios.map((scenario) => {
                  const selected = compareIds.includes(scenario.id);
                  return (
                    <li
                      key={scenario.id}
                      style={{
                        border: `1px solid ${colors.border}`,
                        borderRadius: `${borderRadius.md}px`,
                        padding: '12px',
                        backgroundColor: colors.surface,
                      }}
                      data-testid={`saved-scenario-${scenario.id}`}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <label
                          style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'flex-start',
                            flex: 1,
                            cursor: compareIds.length < 2 || selected ? 'pointer' : 'default',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={compareIds.length >= 2 && !selected}
                            onChange={() => toggleCompare(scenario.id)}
                            aria-label={`Selecionar ${scenario.name} para comparar`}
                            data-testid={`compare-select-${scenario.id}`}
                            style={{ width: 20, height: 20, marginTop: 2 }}
                          />
                          <span>
                            <span
                              style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem' }}
                            >
                              {scenario.name}
                            </span>
                            <span
                              style={{
                                display: 'block',
                                fontSize: '0.8125rem',
                                color: colors.textSecondary,
                              }}
                            >
                              {formatCentsBr(
                                parseScenarioMoneyToCents(scenario.hypotheticalTotal) ?? BigInt(0),
                              )}{' '}
                              • Atualizado em {formatDateTime(scenario.updatedAt)}
                            </span>
                          </span>
                        </label>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDetail(scenario)}
                          style={{ minHeight: 44 }}
                          aria-label={`Abrir ${scenario.name}`}
                          data-testid={`scenario-open-${scenario.id}`}
                        >
                          Abrir
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(scenario)}
                          style={{ minHeight: 44 }}
                          aria-label={`Editar ${scenario.name}`}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startDuplicate(scenario)}
                          style={{ minHeight: 44 }}
                          aria-label={`Duplicar ${scenario.name}`}
                        >
                          Duplicar
                        </Button>
                        {deleteConfirmId === scenario.id ? (
                          <>
                            <span
                              style={{
                                fontSize: '0.8125rem',
                                color: colors.textSecondary,
                                alignSelf: 'center',
                              }}
                            >
                              Excluir este cenário salvo? Sua carteira, estratégia e operações não
                              serão alteradas.
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteMutation.mutate(scenario.id)}
                              disabled={deleteMutation.isPending}
                              style={{ minHeight: 44 }}
                              aria-label={`Confirmar exclusão de ${scenario.name}`}
                              data-testid={`scenario-delete-confirm-${scenario.id}`}
                            >
                              {deleteMutation.isPending ? 'Excluindo…' : 'Confirmar exclusão'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeleteConfirmId(null)}
                              style={{ minHeight: 44 }}
                            >
                              Manter
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteConfirmId(scenario.id)}
                            style={{ minHeight: 44 }}
                            aria-label={`Excluir ${scenario.name}`}
                          >
                            Excluir
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {!formOpen ? (
                  <Button
                    variant="outline"
                    onClick={() => openFormForCreate()}
                    style={{ minHeight: 44 }}
                    aria-label="Criar novo cenário"
                    data-testid="scenario-create-open"
                  >
                    Criar simulação
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  onClick={() => compareMutation.mutate()}
                  disabled={compareIds.length !== 2 || compareMutation.isPending}
                  style={{ minHeight: 44 }}
                  aria-label="Comparar cenários selecionados"
                  data-testid="scenario-compare-run"
                >
                  {compareMutation.isPending
                    ? 'Comparando…'
                    : `Comparar${compareIds.length > 0 ? ` (${compareIds.length}/2)` : ''}`}
                </Button>
                {compareIds.length > 0 ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCompareIds([]);
                      compareMutation.reset();
                    }}
                    style={{ minHeight: 44 }}
                    aria-label="Limpar seleção de comparação"
                  >
                    Limpar comparação
                  </Button>
                ) : null}
              </div>
              {compareMutation.isError ? (
                <p role="alert" style={{ fontSize: '0.875rem', color: colors.negative }}>
                  {errorMessage(
                    compareMutation.error,
                    'Não foi possível comparar. Verifique a base atual.',
                  )}
                </p>
              ) : null}
            </>
          )}

          {formOpen ? (
            <div
              style={{ marginTop: 16, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}
              data-testid="scenario-form"
            >
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 4px' }}>
                {editingId ? 'Editar cenário' : 'Novo cenário'}
              </h4>
              <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 12px' }}>
                O Atlas salvará os valores hipotéticos informados. O resultado será recalculado com
                a carteira e as metas atuais sempre que você abrir este cenário.
              </p>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>
                  Nome do cenário
                </span>
                <input
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  placeholder="Aporte de novembro"
                  maxLength={80}
                  aria-label="Nome do cenário"
                  data-testid="scenario-form-name"
                  style={{ ...inputStyle, width: '100%', minHeight: 44 }}
                />
              </label>
              {SCENARIO_CATEGORIES.map((category) => (
                <label
                  key={category}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
                >
                  <span style={{ flex: 1, fontSize: '0.875rem' }}>
                    {scenarioCategoryLabel(category)}
                  </span>
                  <input
                    value={formValues[category] ?? ''}
                    onChange={(event) => {
                      setFormValues((previous) => ({
                        ...previous,
                        [category]: event.target.value,
                      }));
                      previewMutation.reset();
                      setPreviewFor(null);
                    }}
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                    aria-label={`Aporte hipotético em ${scenarioCategoryLabel(category)} em reais`}
                    data-testid={`scenario-form-${category}`}
                    style={{ ...inputStyle, width: 140, minHeight: 44, textAlign: 'right' }}
                  />
                </label>
              ))}
              <p style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                Aporte hipotético total:{' '}
                <strong data-testid="scenario-form-total">
                  {formatCentsBr(parsed.totalCents)}
                </strong>
                {editingId && dirty ? (
                  <>
                    {' '}
                    • <Badge variant="warning">Alterações não salvas</Badge>
                  </>
                ) : null}
              </p>
              {parsed.invalid ? (
                <p role="alert" style={{ fontSize: '0.875rem', color: colors.negative }}>
                  {parsed.invalid}
                </p>
              ) : null}
              {saveMutation.isError ? (
                <p role="alert" style={{ fontSize: '0.875rem', color: colors.negative }}>
                  {errorMessage(
                    saveMutation.error,
                    'Não foi possível salvar. Verifique os valores.',
                  )}
                </p>
              ) : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <Button
                  variant="primary"
                  onClick={() => saveMutation.mutate()}
                  disabled={
                    parsed.invalid !== null ||
                    saveMutation.isPending ||
                    (editingId !== null && !dirty)
                  }
                  style={{ minHeight: 44 }}
                  aria-label={editingId ? 'Salvar alterações do cenário' : 'Salvar cenário'}
                  data-testid="scenario-form-save"
                >
                  {saveMutation.isPending
                    ? 'Salvando…'
                    : editingId
                      ? 'Salvar alterações'
                      : 'Salvar cenário'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => previewMutation.mutate(editingId ?? 'new')}
                  disabled={parsed.invalid !== null || previewMutation.isPending}
                  style={{ minHeight: 44 }}
                  aria-label="Simular valores sem salvar"
                  data-testid="scenario-form-preview"
                >
                  {previewMutation.isPending ? 'Simulando…' : 'Simular sem salvar'}
                </Button>
                <Button
                  variant="outline"
                  onClick={closeForm}
                  style={{ minHeight: 44 }}
                  aria-label="Cancelar edição"
                >
                  Cancelar
                </Button>
              </div>
              {previewMutation.isError ? (
                <p role="alert" style={{ fontSize: '0.875rem', color: colors.negative }}>
                  {errorMessage(
                    previewMutation.error,
                    'Não foi possível simular. Verifique os valores.',
                  )}
                </p>
              ) : null}
              {previewMutation.data && previewFor !== null ? (
                <div style={{ marginTop: 12 }} data-testid="scenario-form-preview-result">
                  <h5 style={{ fontSize: '0.875rem', fontWeight: 700, margin: '0 0 4px' }}>
                    Prévia com valores editados (não salva)
                  </h5>
                  <p style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    Antes: {outsideLabel(previewMutation.data.beforeOutsideCount)}. Após a hipótese:{' '}
                    {outsideLabel(previewMutation.data.afterOutsideCount)}.
                  </p>
                  <LiveResultTable live={previewMutation.data} />
                </div>
              ) : null}
            </div>
          ) : null}

          {openId && detail ? (
            <div
              id="scenario-detail-section"
              style={{
                marginTop: 16,
                borderTop: `1px solid ${colors.border}`,
                paddingTop: 12,
                scrollMarginTop: 80,
              }}
              data-testid="scenario-detail"
            >
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 4px' }}>
                {detail.saved.name}
              </h4>
              <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 4px' }}>
                Hipótese salva em {formatDateTime(detail.saved.createdAt)} • Aporte hipotético{' '}
                {formatCentsBr(
                  parseScenarioMoneyToCents(detail.saved.hypotheticalTotal) ?? BigInt(0),
                )}
                . Simulação recalculada com as metas atuais da carteira.
              </p>
              {detail.live ? (
                <>
                  <LimitationsNote codes={detail.limitations} />
                  <p
                    style={{ fontSize: '0.875rem', margin: '8px 0' }}
                    data-testid="scenario-detail-impact"
                  >
                    Antes: {outsideLabel(detail.live.beforeOutsideCount)}. Após a hipótese:{' '}
                    {outsideLabel(detail.live.afterOutsideCount)}.
                  </p>
                  <LiveResultTable live={detail.live} />
                  <p style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    Recalculado agora sobre{' '}
                    {formatScenarioMoney(detail.live.totals.projected, detail.live.totals.currency)}
                    .
                  </p>
                  <div style={{ marginTop: 8 }}>
                    <Button
                      variant="outline"
                      onClick={() =>
                        dispatchCreatePlan({
                          name: detail.saved.name,
                          items: detail.saved.changes.map((change) => ({
                            category: change.category,
                            amount: change.amount,
                          })),
                        })
                      }
                      style={{ minHeight: 44 }}
                      aria-label={`Criar plano a partir de ${detail.saved.name}`}
                      data-testid="scenario-create-plan"
                    >
                      Criar plano
                    </Button>
                  </div>
                </>
              ) : (
                <LimitationsNote
                  codes={detail.limitations.length > 0 ? detail.limitations : ['INSUFFICIENT_DATA']}
                />
              )}
              <div style={{ marginTop: 8 }}>
                <Button
                  variant="outline"
                  onClick={() => setOpenId(null)}
                  style={{ minHeight: 44 }}
                  aria-label="Fechar cenário aberto"
                >
                  Fechar
                </Button>
              </div>
            </div>
          ) : openId && detailQuery.isLoading ? (
            <Skeleton width="100%" height="120px" />
          ) : null}

          {compareResult ? (
            <div
              style={{ marginTop: 16, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}
              data-testid="scenario-compare-result"
            >
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 4px' }}>
                Comparação de cenários
              </h4>
              <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 8px' }}>
                Ambos calculados sobre a mesma carteira e as mesmas metas atuais. Nenhum cenário é
                apontado como melhor: compare os números.
              </p>
              <LimitationsNote codes={compareResult.limitations} />
              {!compareResult.comparison.sameScenarioTotal ? (
                <p
                  style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
                  data-testid="compare-different-totals"
                >
                  Os aportes hipotéticos têm totais diferentes — a comparação não presume
                  equivalência.
                </p>
              ) : null}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: colors.textSecondary }}>
                      <th scope="col" style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>
                        Indicador
                      </th>
                      {compareResult.comparison.sides.map((side) => (
                        <th
                          key={side.scenarioId}
                          scope="col"
                          style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                        >
                          {side.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={{ padding: '8px 8px 8px 0' }}>Aporte hipotético total</td>
                      {compareResult.comparison.sides.map((side) => (
                        <td key={side.scenarioId} style={{ padding: 8, textAlign: 'right' }}>
                          {formatScenarioMoney(
                            side.scenarioTotal,
                            compareResult.comparison.currency,
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={{ padding: '8px 8px 8px 0' }}>
                        Categorias fora da meta (após hipótese)
                      </td>
                      {compareResult.comparison.sides.map((side) => (
                        <td key={side.scenarioId} style={{ padding: 8, textAlign: 'right' }}>
                          {side.outsideCount}
                        </td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={{ padding: '8px 8px 8px 0' }}>Desvio absoluto agregado</td>
                      {compareResult.comparison.sides.map((side) => (
                        <td key={side.scenarioId} style={{ padding: 8, textAlign: 'right' }}>
                          {formatAggregatePp(side.totalAbsDeviationBp)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: colors.textSecondary }}>
                      <th scope="col" style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>
                        Categoria
                      </th>
                      {compareResult.comparison.sides.map((side) => (
                        <th
                          key={side.scenarioId}
                          scope="col"
                          style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                        >
                          {side.name} — projetado
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const categories = Array.from(
                        new Set(
                          compareResult.comparison.sides.flatMap((side) =>
                            side.projectedWeights.map((weight) => weight.category),
                          ),
                        ),
                      );
                      return categories.map((category) => (
                        <tr key={category} style={{ borderTop: `1px solid ${colors.border}` }}>
                          <td style={{ padding: '8px 8px 8px 0', fontWeight: 600 }}>
                            {scenarioCategoryLabel(category)}
                          </td>
                          {compareResult.comparison.sides.map((side) => {
                            const weight = side.projectedWeights.find(
                              (item) => item.category === category,
                            );
                            return (
                              <td key={side.scenarioId} style={{ padding: 8, textAlign: 'right' }}>
                                {weight
                                  ? `${formatScenarioBp(weight.projectedBp)} (${formatScenarioDeviationTransition(null, weight.projectedDeviationBp)})`
                                  : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
