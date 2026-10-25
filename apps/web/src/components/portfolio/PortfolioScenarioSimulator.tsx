'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { Button, Badge } from '@/components/ui';
import { colors, spacing } from '@atlas/ui';
import { dispatchCreatePlan } from './PortfolioContributionPlans';
import {
  describeScenarioState,
  formatCentsBr,
  formatScenarioBp,
  formatScenarioDeviationTransition,
  formatScenarioMoney,
  parseScenarioMoneyToCents,
  scenarioCategoryLabel,
  type AllocationScenarioRowView,
} from '@atlas/ui';

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

interface SimulateResponse {
  data: {
    comparison: unknown;
    scenario: {
      totals: { current: string; scenario: string; projected: string; currency: string };
      rows: AllocationScenarioRowView[];
      beforeOutsideCount: number;
      afterOutsideCount: number;
      beforeTotalAbsDeviationBp: number;
      afterTotalAbsDeviationBp: number;
      qualified: boolean;
      denominator: string;
      asOf: string | null;
    } | null;
    limitations: string[];
  };
}

/** Local aliases: edge parsing/formatting live in the shared view-model. */
const parseMoneyToCents = parseScenarioMoneyToCents;
const formatCents = formatCentsBr;

function scenarioErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const message = error.message ?? '';
    if (message.trim().length > 0) return message;
  }
  return 'Não foi possível simular. Verifique os valores informados.';
}

/**
 * Phase 5Q-D — hypothetical contribution simulator (ephemeral).
 * The user declares where a hypothetical contribution goes; the server
 * returns the projected allocation. No persistence, no execution, no orders.
 */
export function PortfolioScenarioSimulator({ portfolioId }: { portfolioId: string }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState('');

  const parsed = useMemo(() => {
    const entries: Array<{ category: string; amount: string }> = [];
    let invalid: string | null = null;
    let totalCents = BigInt(0);
    for (const category of SCENARIO_CATEGORIES) {
      const raw = values[category] ?? '';
      if (raw.trim() === '') continue;
      const cents = parseMoneyToCents(raw);
      if (cents === null || cents <= BigInt(0)) {
        invalid = `Valor inválido em ${scenarioCategoryLabel(category)}. Use formato como 10.000,50.`;
        break;
      }
      totalCents += cents;
      entries.push({ category, amount: raw.trim() });
    }
    return { entries, invalid, totalCents };
  }, [values]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<SimulateResponse>(
        `/api/v1/portfolios/${portfolioId}/allocation-strategy/simulate`,
        { type: 'CONTRIBUTION', changes: parsed.entries },
      );
      return res.data;
    },
    onSuccess: (data) => {
      const count = data.scenario?.rows.length ?? 0;
      setAnnouncement(`Simulação concluída. ${count} categorias projetadas.`);
    },
    onError: () => {
      setAnnouncement('Simulação indisponível. Verifique os valores informados.');
    },
  });

  const scenario = mutation.data?.scenario ?? null;
  const limitations = mutation.data?.limitations ?? [];

  if (!open) {
    return (
      <div style={{ marginTop: `${spacing.sm}px` }}>
        <Button
          variant="outline"
          onClick={() => setOpen(true)}
          aria-label="Simular aporte hipotético"
          style={{ minHeight: 44 }}
        >
          Simular aporte
        </Button>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: `${spacing.base}px`,
        borderTop: `1px solid ${colors.border}`,
        paddingTop: `${spacing.base}px`,
      }}
      data-testid="scenario-simulator"
    >
      <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 4px' }}>Simular aporte</h4>
      <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 12px' }}>
        Informe um aporte hipotético por categoria. O Atlas calcula a alocação projetada sem alterar
        sua carteira.
      </p>
      {SCENARIO_CATEGORIES.map((category) => (
        <label
          key={category}
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
        >
          <span style={{ flex: 1, fontSize: '0.875rem' }}>{scenarioCategoryLabel(category)}</span>
          <input
            value={values[category] ?? ''}
            onChange={(event) => {
              setValues((previous) => ({ ...previous, [category]: event.target.value }));
              mutation.reset();
            }}
            inputMode="decimal"
            placeholder="R$ 0,00"
            aria-label={`Aporte hipotético em ${scenarioCategoryLabel(category)} em reais`}
            data-testid={`scenario-input-${category}`}
            style={{
              width: 140,
              minHeight: 44,
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              fontSize: '0.875rem',
              textAlign: 'right',
            }}
          />
        </label>
      ))}
      <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: '8px 0' }}>
        Aporte hipotético total:{' '}
        <strong data-testid="scenario-total">{formatCents(parsed.totalCents)}</strong>
      </p>
      {parsed.invalid ? (
        <p role="alert" style={{ fontSize: '0.875rem', color: colors.negative }}>
          {parsed.invalid}
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Button
          variant="primary"
          onClick={() => mutation.mutate()}
          disabled={parsed.entries.length === 0 || parsed.invalid !== null || mutation.isPending}
          aria-label="Simular cenário hipotético"
          data-testid="scenario-simulate"
          style={{ minHeight: 44 }}
        >
          {mutation.isPending ? 'Simulando…' : 'Simular'}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setValues({});
            mutation.reset();
            setAnnouncement('Simulação limpa.');
          }}
          aria-label="Limpar simulação"
          data-testid="scenario-reset"
          style={{ minHeight: 44 }}
        >
          Limpar simulação
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setOpen(false);
            setValues({});
            mutation.reset();
          }}
          aria-label="Fechar simulação"
          style={{ minHeight: 44 }}
        >
          Fechar
        </Button>
      </div>
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
      {mutation.isError ? (
        <p
          role="alert"
          style={{ fontSize: '0.875rem', color: colors.negative }}
          data-testid="scenario-error"
        >
          {scenarioErrorMessage(mutation.error)}
        </p>
      ) : null}
      {scenario ? (
        <div data-testid="scenario-result">
          <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '12px 0 4px' }}>
            Resultado da simulação
          </h4>
          <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 12px' }}>
            Esta simulação não altera sua carteira e não executa operações.
          </p>
          {limitations.includes('PARTIAL_COVERAGE') ? (
            <p
              style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
              data-testid="scenario-limitation"
            >
              <Badge variant="warning">Dados parciais</Badge> A simulação considera apenas o valor
              conhecido da carteira.
            </p>
          ) : null}
          <p style={{ fontSize: '0.875rem', margin: '8px 0' }} data-testid="scenario-impact">
            Antes:{' '}
            {scenario.beforeOutsideCount === 1
              ? '1 categoria fora da meta'
              : `${scenario.beforeOutsideCount} categorias fora da meta`}
            . Após a hipótese:{' '}
            {scenario.afterOutsideCount === 1
              ? '1 categoria fora da meta'
              : `${scenario.afterOutsideCount} categorias fora da meta`}
            .
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: colors.textSecondary }}>
                  <th scope="col" style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>
                    Categoria
                  </th>
                  <th
                    scope="col"
                    style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                  >
                    Meta
                  </th>
                  <th
                    scope="col"
                    style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                  >
                    Atual
                  </th>
                  <th
                    scope="col"
                    style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                  >
                    Projetado
                  </th>
                  <th
                    scope="col"
                    style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                  >
                    Aporte simulado
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
                {scenario.rows.map((row) => (
                  <tr key={row.category} style={{ borderTop: `1px solid ${colors.border}` }}>
                    <td style={{ padding: '8px 8px 8px 0' }}>
                      <div style={{ fontWeight: 600 }}>{scenarioCategoryLabel(row.category)}</div>
                      <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                        {describeScenarioState(row.state)}
                      </div>
                    </td>
                    <td style={{ padding: 8, textAlign: 'right' }}>
                      {formatScenarioBp(row.targetBp)}
                    </td>
                    <td style={{ padding: 8, textAlign: 'right' }}>
                      {formatScenarioBp(row.currentBp)}
                    </td>
                    <td style={{ padding: 8, textAlign: 'right' }}>
                      {formatScenarioBp(row.projectedBp)}
                    </td>
                    <td style={{ padding: 8, textAlign: 'right' }}>
                      {formatScenarioMoney(row.scenarioAmount, scenario.totals.currency)}
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
          <p style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
            Projetado sobre{' '}
            {formatScenarioMoney(scenario.totals.projected, scenario.totals.currency)}. Pesos
            calculados pelo servidor; exibição arredondada pode somar 99,99% ou 100,01%.
          </p>
          <SaveCurrentSimulation portfolioId={portfolioId} entries={parsed.entries} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Phase 5Q-E — persists the current hypothetical inputs (never the
 * projected result). The saved scenario recomputes live on open.
 */
export function allocationScenariosQueryKey(portfolioId: string) {
  return ['portfolio-allocation-scenarios', portfolioId];
}

function SaveCurrentSimulation({
  portfolioId,
  entries,
}: {
  portfolioId: string;
  entries: Array<{ category: string; amount: string }>;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: unknown }>(
        `/api/v1/portfolios/${portfolioId}/allocation-scenarios`,
        { name: name.trim(), type: 'CONTRIBUTION', changes: entries },
      );
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: allocationScenariosQueryKey(portfolioId),
      });
      setSaved(true);
    },
    onError: () => {
      setSaved(false);
    },
  });
  return (
    <div
      style={{
        marginTop: `${spacing.sm}px`,
        borderTop: `1px solid ${colors.border}`,
        paddingTop: `${spacing.sm}px`,
      }}
      data-testid="scenario-save"
    >
      <label
        style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 8 }}
        htmlFor="scenario-save-name"
      >
        Salvar cenário
      </label>
      <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 8px' }}>
        O Atlas salvará os valores hipotéticos informados. O resultado será recalculado com a
        carteira e as metas atuais sempre que você abrir este cenário.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          id="scenario-save-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
            saveMutation.reset();
          }}
          placeholder="Aporte de novembro"
          maxLength={80}
          aria-label="Nome do cenário hipotético"
          data-testid="scenario-save-name"
          style={{
            flex: 1,
            minWidth: 200,
            minHeight: 44,
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.surface,
            color: colors.textPrimary,
            fontSize: '0.875rem',
          }}
        />
        <Button
          variant="outline"
          onClick={() => saveMutation.mutate()}
          disabled={name.trim() === '' || saveMutation.isPending}
          aria-label="Salvar cenário hipotético"
          data-testid="scenario-save-button"
          style={{ minHeight: 44 }}
        >
          {saveMutation.isPending ? 'Salvando…' : 'Salvar cenário'}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            dispatchCreatePlan({
              name: name.trim() === '' ? 'Plano de aporte' : name.trim(),
              items: entries,
            })
          }
          style={{ minHeight: 44 }}
          aria-label="Criar plano a partir desta simulação"
          data-testid="scenario-create-plan"
        >
          Criar plano
        </Button>
      </div>
      {saveMutation.isError ? (
        <p role="alert" style={{ fontSize: '0.875rem', color: colors.negative }}>
          {scenarioErrorMessage(saveMutation.error)}
        </p>
      ) : null}
      {saved ? (
        <p role="status" style={{ fontSize: '0.875rem', color: colors.positive }}>
          Cenário salvo. Veja em Cenários salvos.
        </p>
      ) : null}
    </div>
  );
}
