'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import {
  Card,
  Skeleton,
  ErrorState,
  EmptyState,
  SectionHeader,
  Button,
  Badge,
} from '@/components/ui';
import { colors, spacing, borderRadius } from '@atlas/ui';

const STRATEGY_CATEGORIES = [
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

const CATEGORY_LABELS: Record<string, string> = {
  STOCK: 'Ações',
  FII: 'Fundos Imobiliários (FIIs)',
  ETF: 'ETFs',
  BDR: 'BDRs',
  FIXED_INCOME: 'Renda Fixa',
  TREASURY: 'Tesouro Direto',
  FUND: 'Fundos',
  CASH: 'Caixa',
  OTHER: 'Outros',
};

interface StrategyTargetDto {
  category: string;
  targetBp: number;
}

interface StrategyComparisonRowDto {
  category: string;
  targetBp: number;
  currentBp: number | null;
  deviationBp: number | null;
  state: 'ABOVE_TARGET' | 'BELOW_TARGET' | 'ON_TARGET' | 'UNAVAILABLE';
}

interface AllocationStrategyResponse {
  data: {
    strategy: {
      portfolioId: string;
      targets: StrategyTargetDto[];
      updatedAt: string | null;
    } | null;
    comparison: {
      rows: StrategyComparisonRowDto[];
      outsideTolerance: string[];
      worstGap: { category: string; deviationBp: number } | null;
      coveragePercent: string;
      qualified: boolean;
      denominator: string;
      asOf: string | null;
    } | null;
  };
}

export function allocationStrategyQueryKey(portfolioId: string) {
  return ['portfolio-allocation-strategy', portfolioId];
}

/** Integer basis points -> '25,00%'. String math only, display only. */
function formatBp(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value)) return '—';
  const negative = value < 0;
  const abs = Math.abs(value);
  const intPart = Math.floor(abs / 100).toString();
  const frac = String(abs % 100).padStart(2, '0');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped},${frac}%`;
}

/** Integer basis-point deviation -> '+7,00 p.p.' / '-5,00 p.p.' / '0,00 p.p.'. Display only. */
function formatDeviationBp(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const intPart = Math.floor(abs / 100).toString();
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${intPart},${frac} p.p.`;
}

/**
 * Parses a locale percent string ('25', '25.5', '25,25') into integer basis
 * points or null. Decimal-string math only: locale commas are handled
 * explicitly and binary floats never touch monetary values.
 */
function parseLocalePercentToBp(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '' || normalized.startsWith('-') || normalized.startsWith('+')) return null;
  const match = /^(\d*)(?:\.(\d*))?$/.exec(normalized);
  if (!match) return null;
  if (match[1] === '' && (match[2] ?? '') === '') return null;
  const intPart = match[1] === '' ? 0 : Number(match[1]);
  const frac = ((match[2] ?? '') + '00').slice(0, 2);
  if (!Number.isSafeInteger(intPart)) return null;
  return intPart * 100 + Number(frac);
}

function strategyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const message = error.message ?? '';
    if (message.trim().length > 0) return message;
  }
  return 'Não foi possível concluir a operação. Tente novamente.';
}

function ComparisonTable({ rows }: { rows: StrategyComparisonRowDto[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: colors.textSecondary }}>
            <th style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>Categoria</th>
            <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Meta</th>
            <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Atual</th>
            <th style={{ padding: '6px 0 6px 8px', fontWeight: 600, textAlign: 'right' }}>
              Desvio
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const stateLabel =
              row.state === 'ABOVE_TARGET'
                ? 'Acima da meta'
                : row.state === 'BELOW_TARGET'
                  ? 'Abaixo da meta'
                  : row.state === 'ON_TARGET'
                    ? 'Na meta'
                    : 'Dados indisponíveis';
            return (
              <tr key={row.category} style={{ borderTop: `1px solid ${colors.border}` }}>
                <td style={{ padding: '8px 8px 8px 0' }}>
                  <div style={{ fontWeight: 600 }}>
                    {CATEGORY_LABELS[row.category] ?? row.category}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    {stateLabel}
                  </div>
                </td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatBp(row.targetBp)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatBp(row.currentBp)}</td>
                <td style={{ padding: '8px 0 8px 8px', textAlign: 'right' }}>
                  {formatDeviationBp(row.deviationBp)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StrategyEditor({
  portfolioId,
  initial,
  onDone,
}: {
  portfolioId: string;
  initial: Record<string, number>;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const category of STRATEGY_CATEGORIES) {
      const bp = initial[category] ?? 0;
      next[category] = bp === 0 ? '' : String(bp / 100).replace('.', ',');
    }
    return next;
  });
  const [touched, setTouched] = useState(false);

  const parsed = useMemo(() => {
    const entries: Array<{ category: string; targetBp: number }> = [];
    let invalid = false;
    for (const category of STRATEGY_CATEGORIES) {
      const raw = values[category] ?? '';
      if (raw.trim() === '') continue;
      const bp = parseLocalePercentToBp(raw);
      if (bp === null || bp < 0 || bp > 10000) {
        invalid = true;
        break;
      }
      entries.push({ category, targetBp: bp });
    }
    return { entries, invalid };
  }, [values]);

  const total = parsed.entries.reduce((sum, entry) => sum + entry.targetBp, 0);
  const totalValid = !parsed.invalid && parsed.entries.length > 0 && total === 10000;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.put<{ data: unknown }>(
        `/api/v1/portfolios/${portfolioId}/allocation-strategy`,
        { targets: parsed.entries },
      );
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: allocationStrategyQueryKey(portfolioId) });
      await queryClient.invalidateQueries({ queryKey: ['portfolio-review', portfolioId] });
      onDone();
    },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
      {STRATEGY_CATEGORIES.map((category) => (
        <label
          key={category}
          style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}
        >
          <span style={{ flex: 1, fontSize: '0.875rem' }}>{CATEGORY_LABELS[category]}</span>
          <input
            value={values[category] ?? ''}
            onChange={(event) => {
              setTouched(true);
              setValues((previous) => ({ ...previous, [category]: event.target.value }));
            }}
            inputMode="decimal"
            placeholder="0"
            aria-label={`Meta para ${CATEGORY_LABELS[category]} em percentual`}
            style={{
              width: '120px',
              minHeight: 44,
              padding: '8px 12px',
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              fontSize: '0.875rem',
              textAlign: 'right',
            }}
          />
          <span style={{ fontSize: '0.875rem', color: colors.textSecondary, width: 24 }}>%</span>
        </label>
      ))}
      <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0 }}>
        Total: <strong>{formatBp(total)}</strong>
        {touched && !totalValid ? ' — As metas precisam totalizar 100%.' : ''}
      </p>
      {saveMutation.isError ? (
        <p role="alert" style={{ fontSize: '0.875rem', color: colors.negative, margin: 0 }}>
          {strategyErrorMessage(saveMutation.error)}
        </p>
      ) : null}
      {saveMutation.isSuccess ? (
        <p role="status" style={{ fontSize: '0.875rem', color: colors.positive, margin: 0 }}>
          Metas salvas.
        </p>
      ) : null}
      <div>
        <Button
          variant="primary"
          onClick={() => saveMutation.mutate()}
          disabled={!totalValid || saveMutation.isPending}
          aria-label="Salvar metas de alocação"
          style={{ minHeight: 44 }}
        >
          {saveMutation.isPending ? 'Salvando…' : 'Salvar metas'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Phase 5Q-C — user-declared allocation targets vs current allocation.
 * Intent only: shows deviations from the user's own targets, never trade
 * suggestions. Editing lives here (web); mobile stays read-only.
 */
export function PortfolioStrategySection({ portfolioId }: { portfolioId: string | null }) {
  const queryClient = useQueryClient();
  const authReady = useAuthReady();
  const [editing, setEditing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const strategyQuery = useQuery({
    queryKey: ['portfolio-allocation-strategy', portfolioId],
    queryFn: async () => {
      const res = await apiClient.get<AllocationStrategyResponse>(
        `/api/v1/portfolios/${portfolioId}/allocation-strategy`,
      );
      return res.data;
    },
    enabled: authReady && portfolioId !== null,
    staleTime: 30_000,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/api/v1/portfolios/${portfolioId}/allocation-strategy`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: allocationStrategyQueryKey(portfolioId ?? ''),
      });
      await queryClient.invalidateQueries({ queryKey: ['portfolio-review', portfolioId] });
      setConfirmingClear(false);
      setEditing(false);
    },
  });

  const data = strategyQuery.data ?? null;
  const initialTargets = useMemo(() => {
    const next: Record<string, number> = {};
    for (const target of data?.strategy?.targets ?? []) {
      next[target.category] = target.targetBp;
    }
    return next;
  }, [data]);

  return (
    <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
      <SectionHeader
        title="Minha estratégia"
        description="Metas de alocação definidas por você, comparadas com a carteira atual."
      />
      <p
        style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: `${spacing.sm}px 0` }}
      >
        Estas metas foram definidas por você. O Atlas compara a composição atual com essas metas e
        não realiza recomendações automáticas de investimento.
      </p>
      {strategyQuery.isLoading ? (
        <Skeleton width="100%" height="120px" />
      ) : strategyQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar as metas"
          message="Tente novamente. Se o problema persistir, verifique sua conexão."
          onRetry={() => strategyQuery.refetch()}
        />
      ) : editing ? (
        <>
          <StrategyEditor
            portfolioId={portfolioId ?? ''}
            initial={initialTargets}
            onDone={() => setEditing(false)}
          />
          <div style={{ marginTop: `${spacing.sm}px` }}>
            <Button variant="outline" onClick={() => setEditing(false)} style={{ minHeight: 44 }}>
              Cancelar
            </Button>
          </div>
        </>
      ) : !data?.strategy ? (
        <EmptyState
          title="Você ainda não definiu metas de alocação para esta carteira."
          description="Defina percentuais por classe de ativo. O total precisa ser 100%."
          actionLabel="Definir metas"
          onAction={() => setEditing(true)}
        />
      ) : (
        <>
          {data.comparison?.qualified === true ? (
            <p style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              A comparação considera {data.comparison.coveragePercent}% do valor conhecido da
              carteira.
            </p>
          ) : null}
          {data.comparison ? (
            <>
              {data.comparison.outsideTolerance.length > 0 ? (
                <p style={{ fontSize: '0.875rem', margin: `${spacing.sm}px 0` }}>
                  <Badge variant="warning">
                    {data.comparison.outsideTolerance.length === 1
                      ? '1 categoria fora das metas'
                      : `${data.comparison.outsideTolerance.length} categorias fora das metas`}
                  </Badge>
                </p>
              ) : (
                <p style={{ fontSize: '0.875rem', margin: `${spacing.sm}px 0` }}>
                  <Badge variant="success">Dentro das metas</Badge>
                </p>
              )}
              <ComparisonTable rows={data.comparison.rows} />
              <p style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                Desvios de até ±1 p.p. são considerados dentro da meta. Dados de{' '}
                {data.comparison.asOf ?? '—'}.
              </p>
            </>
          ) : (
            <EmptyState
              title="Sem dados para comparar"
              description="Não foi possível comparar as metas com a carteira atual."
            />
          )}
          <div
            style={{
              display: 'flex',
              gap: `${spacing.sm}px`,
              flexWrap: 'wrap',
              marginTop: `${spacing.sm}px`,
            }}
          >
            <Button variant="outline" onClick={() => setEditing(true)} style={{ minHeight: 44 }}>
              Editar metas
            </Button>
            {confirmingClear ? (
              <>
                <span
                  style={{
                    fontSize: '0.8125rem',
                    color: colors.textSecondary,
                    alignSelf: 'center',
                  }}
                >
                  Remover metas? Suas operações, alocação e histórico não serão afetados.
                </span>
                <Button
                  variant="outline"
                  onClick={() => clearMutation.mutate()}
                  disabled={clearMutation.isPending}
                  aria-label="Confirmar remoção das metas"
                  style={{ minHeight: 44 }}
                >
                  {clearMutation.isPending ? 'Removendo…' : 'Confirmar remoção'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirmingClear(false)}
                  disabled={clearMutation.isPending}
                  style={{ minHeight: 44 }}
                >
                  Manter metas
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                onClick={() => setConfirmingClear(true)}
                style={{ minHeight: 44 }}
              >
                Remover metas
              </Button>
            )}
          </div>
          {clearMutation.isError ? (
            <p role="alert" style={{ fontSize: '0.875rem', color: colors.negative }}>
              {strategyErrorMessage(clearMutation.error)}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
