'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  colors,
  spacing,
  borderRadius,
  annualCapitalMarketQueryKey,
  mapToAnnualCapitalMarketViewModel,
  type RawAnnualCapitalMarketFiscalSummary,
} from '@atlas/ui';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Card, SectionHeader, ErrorState, Skeleton } from '@/components/ui';

export function AnnualCapitalMarketSection() {
  const authReady = useAuthReady();
  const [calendarYear, setCalendarYear] = useState<number>(2025);

  useEffect(() => {
    const previousYear = new Date().getFullYear() - 1;
    setCalendarYear(previousYear > 2000 ? previousYear : 2025);
  }, []);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: annualCapitalMarketQueryKey(calendarYear),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawAnnualCapitalMarketFiscalSummary }>(
        `/api/v1/fiscal/annual/${calendarYear}/capital-market`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(calendarYear >= 1900 && calendarYear <= 2100),
    staleTime: 30_000,
  });

  const viewModel = useMemo(() => (data ? mapToAnnualCapitalMarketViewModel(data) : null), [data]);

  return (
    <div style={{ marginTop: `${spacing.xl}px` }} data-testid="annual-capital-market-section">
      <SectionHeader
        title="IRPF Anual — Renda Variável (Operações Comuns / Day Trade / FII)"
        description="Resumo fiscal anual consolidado de operações de mercado de capitais para preenchimento da Declaração de Ajuste Anual (DIRPF)."
      />

      {/* Year Selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${spacing.md}px`,
          marginBottom: `${spacing.md}px`,
          flexWrap: 'wrap',
        }}
      >
        <label
          htmlFor="annual-capital-market-year-select"
          style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textSecondary }}
        >
          Ano-calendário:
        </label>
        <select
          id="annual-capital-market-year-select"
          value={calendarYear}
          onChange={(e) => setCalendarYear(Number(e.target.value))}
          style={{
            padding: `${spacing.xs}px ${spacing.sm}px`,
            borderRadius: `${borderRadius.sm}px`,
            border: `1px solid ${colors.border}`,
            background: colors.surface,
            color: colors.textPrimary,
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
          data-testid="annual-capital-market-year-select"
        >
          {[2024, 2025, 2026, 2027].map((yr) => (
            <option key={yr} value={yr}>
              {yr} (Exercício {yr + 1})
            </option>
          ))}
        </select>

        {viewModel && (
          <span
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.sm}px`,
              fontSize: '0.75rem',
              fontWeight: 700,
              color: viewModel.statusBadge.color,
              backgroundColor: viewModel.statusBadge.bg,
              border: `1px solid ${viewModel.statusBadge.color}`,
            }}
            data-testid="annual-capital-market-status-badge"
          >
            {viewModel.statusBadge.label}
          </span>
        )}
      </div>

      {isLoading && (
        <Card style={{ padding: `${spacing.base}px` }}>
          <Skeleton width="100%" height="120px" />
        </Card>
      )}

      {isError && (
        <Card style={{ padding: `${spacing.base}px` }}>
          <ErrorState
            title="Erro ao carregar resumo anual"
            message={(error as Error)?.message || 'Falha ao consultar resumo fiscal anual.'}
            onRetry={() => refetch()}
          />
        </Card>
      )}

      {viewModel && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
          {/* Category Totals Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: `${spacing.base}px`,
            }}
          >
            {/* Normal Equities Card */}
            <Card style={{ padding: `${spacing.base}px` }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.9375rem',
                  color: colors.textPrimary,
                  marginBottom: `${spacing.xs}px`,
                }}
              >
                Ações — Operações Comuns (15%)
              </div>
              <div
                style={{
                  fontSize: '0.8125rem',
                  color: colors.textSecondary,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div>
                  Total de Vendas: <strong>{viewModel.normalEquities.formattedGrossSales}</strong>
                </div>
                <div>
                  Ganhos Isentos (&le; R$ 20k):{' '}
                  <strong style={{ color: colors.positive }}>
                    {viewModel.normalEquities.formattedExemptProfits}
                  </strong>
                </div>
                <div>
                  Ganhos Tributáveis:{' '}
                  <strong>{viewModel.normalEquities.formattedTaxableProfits}</strong>
                </div>
                <div>
                  Prejuízos do Ano:{' '}
                  <strong style={{ color: colors.negative }}>
                    {viewModel.normalEquities.formattedLossesIncurred}
                  </strong>
                </div>
                <div>
                  Prejuízos Compensados:{' '}
                  <strong>{viewModel.normalEquities.formattedLossesCompensated}</strong>
                </div>
                <div>
                  Base Tributável Líquida:{' '}
                  <strong>{viewModel.normalEquities.formattedNetTaxableBase}</strong>
                </div>
                <div>
                  Imposto Devido: <strong>{viewModel.normalEquities.formattedTaxDue}</strong>
                </div>
                <div>
                  IRRF Retido na Fonte:{' '}
                  <strong>{viewModel.normalEquities.formattedIrrfDeducted}</strong>
                </div>
                <div>
                  IRRF a Compensar na DIRPF:{' '}
                  <strong style={{ color: colors.accent }}>
                    {viewModel.normalEquities.formattedUncompensatedIrrf}
                  </strong>{' '}
                  ({viewModel.normalEquities.uncompensatedIrrfTerminalState})
                </div>
              </div>
            </Card>

            {/* Day Trade Card */}
            <Card style={{ padding: `${spacing.base}px` }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.9375rem',
                  color: colors.textPrimary,
                  marginBottom: `${spacing.xs}px`,
                }}
              >
                Ações — Day Trade (20%)
              </div>
              <div
                style={{
                  fontSize: '0.8125rem',
                  color: colors.textSecondary,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div>
                  Ganhos Brutos:{' '}
                  <strong style={{ color: colors.positive }}>
                    {viewModel.dayTrade.formattedGrossProfits}
                  </strong>
                </div>
                <div>
                  Prejuízos do Ano:{' '}
                  <strong style={{ color: colors.negative }}>
                    {viewModel.dayTrade.formattedLossesIncurred}
                  </strong>
                </div>
                <div>
                  Prejuízos Compensados:{' '}
                  <strong>{viewModel.dayTrade.formattedLossesCompensated}</strong>
                </div>
                <div>
                  Base Tributável Líquida:{' '}
                  <strong>{viewModel.dayTrade.formattedNetTaxableBase}</strong>
                </div>
                <div>
                  Imposto Devido: <strong>{viewModel.dayTrade.formattedTaxDue}</strong>
                </div>
                <div>
                  IRRF Retido na Fonte: <strong>{viewModel.dayTrade.formattedIrrfDeducted}</strong>
                </div>
                <div>
                  IRRF a Restituir:{' '}
                  <strong style={{ color: colors.accent }}>
                    {viewModel.dayTrade.formattedUncompensatedIrrf}
                  </strong>{' '}
                  ({viewModel.dayTrade.uncompensatedIrrfTerminalState})
                </div>
              </div>
            </Card>

            {/* FII Card */}
            <Card style={{ padding: `${spacing.base}px` }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.9375rem',
                  color: colors.textPrimary,
                  marginBottom: `${spacing.xs}px`,
                }}
              >
                Fundos Imobiliários — FII (20%)
              </div>
              <div
                style={{
                  fontSize: '0.8125rem',
                  color: colors.textSecondary,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div>
                  Ganhos Líquidos:{' '}
                  <strong style={{ color: colors.positive }}>
                    {viewModel.fii.formattedGrossProfits}
                  </strong>
                </div>
                <div>
                  Prejuízos do Ano:{' '}
                  <strong style={{ color: colors.negative }}>
                    {viewModel.fii.formattedLossesIncurred}
                  </strong>
                </div>
                <div>
                  Prejuízos Compensados: <strong>{viewModel.fii.formattedLossesCompensated}</strong>
                </div>
                <div>
                  Base Tributável Líquida: <strong>{viewModel.fii.formattedNetTaxableBase}</strong>
                </div>
                <div>
                  Imposto Devido: <strong>{viewModel.fii.formattedTaxDue}</strong>
                </div>
              </div>
            </Card>
          </div>

          {/* Loss Carry Continuity */}
          <Card style={{ padding: `${spacing.base}px` }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: '0.9375rem',
                color: colors.textPrimary,
                marginBottom: `${spacing.xs}px`,
              }}
            >
              Continuidade de Prejuízos Acumulados a Compensar
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: `1px solid ${colors.border}`,
                      textAlign: 'left',
                      color: colors.textSecondary,
                    }}
                  >
                    <th style={{ padding: `${spacing.xs}px` }}>Categoria</th>
                    <th style={{ padding: `${spacing.xs}px` }}>Saldo em 01/Jan</th>
                    <th style={{ padding: `${spacing.xs}px` }}>Prejuízos no Ano</th>
                    <th style={{ padding: `${spacing.xs}px` }}>Compensados no Ano</th>
                    <th style={{ padding: `${spacing.xs}px` }}>
                      Saldo em 31/Dez (Transfere para o ano seguinte)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: `${spacing.xs}px`, fontWeight: 600 }}>
                      Operações Comuns
                    </td>
                    <td style={{ padding: `${spacing.xs}px` }}>
                      {viewModel.lossCarry.normalEquities.formattedOpeningLoss}
                    </td>
                    <td style={{ padding: `${spacing.xs}px`, color: colors.negative }}>
                      {viewModel.lossCarry.normalEquities.formattedLossesAdded}
                    </td>
                    <td style={{ padding: `${spacing.xs}px` }}>
                      {viewModel.lossCarry.normalEquities.formattedLossesConsumed}
                    </td>
                    <td style={{ padding: `${spacing.xs}px`, fontWeight: 700 }}>
                      {viewModel.lossCarry.normalEquities.formattedClosingLoss}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: `${spacing.xs}px`, fontWeight: 600 }}>Day Trade</td>
                    <td style={{ padding: `${spacing.xs}px` }}>
                      {viewModel.lossCarry.dayTrade.formattedOpeningLoss}
                    </td>
                    <td style={{ padding: `${spacing.xs}px`, color: colors.negative }}>
                      {viewModel.lossCarry.dayTrade.formattedLossesAdded}
                    </td>
                    <td style={{ padding: `${spacing.xs}px` }}>
                      {viewModel.lossCarry.dayTrade.formattedLossesConsumed}
                    </td>
                    <td style={{ padding: `${spacing.xs}px`, fontWeight: 700 }}>
                      {viewModel.lossCarry.dayTrade.formattedClosingLoss}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: `${spacing.xs}px`, fontWeight: 600 }}>FIIs</td>
                    <td style={{ padding: `${spacing.xs}px` }}>
                      {viewModel.lossCarry.fii.formattedOpeningLoss}
                    </td>
                    <td style={{ padding: `${spacing.xs}px`, color: colors.negative }}>
                      {viewModel.lossCarry.fii.formattedLossesAdded}
                    </td>
                    <td style={{ padding: `${spacing.xs}px` }}>
                      {viewModel.lossCarry.fii.formattedLossesConsumed}
                    </td>
                    <td style={{ padding: `${spacing.xs}px`, fontWeight: 700 }}>
                      {viewModel.lossCarry.fii.formattedClosingLoss}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* 12 Months Evolution Table */}
          <Card style={{ padding: `${spacing.base}px` }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: '0.9375rem',
                color: colors.textPrimary,
                marginBottom: `${spacing.xs}px`,
              }}
            >
              Evolução Mensal (Janeiro a Dezembro)
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: `1px solid ${colors.border}`,
                      textAlign: 'left',
                      color: colors.textSecondary,
                    }}
                  >
                    <th style={{ padding: `${spacing.xs}px` }}>Mês</th>
                    <th style={{ padding: `${spacing.xs}px` }}>Vendas Ações</th>
                    <th style={{ padding: `${spacing.xs}px` }}>Res. Ações</th>
                    <th style={{ padding: `${spacing.xs}px` }}>Res. Day Trade</th>
                    <th style={{ padding: `${spacing.xs}px` }}>Res. FII</th>
                    <th style={{ padding: `${spacing.xs}px` }}>Imposto Total</th>
                    <th style={{ padding: `${spacing.xs}px` }}>DARF 6015</th>
                  </tr>
                </thead>
                <tbody>
                  {viewModel.months.map((m) => (
                    <tr key={m.competence} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td style={{ padding: `${spacing.xs}px`, fontWeight: 600 }}>
                        {m.monthLabel}
                      </td>
                      <td style={{ padding: `${spacing.xs}px` }}>
                        {m.normalEquities.formattedGrossSales}
                      </td>
                      <td style={{ padding: `${spacing.xs}px` }}>
                        {m.normalEquities.formattedProfitOrLoss}
                      </td>
                      <td style={{ padding: `${spacing.xs}px` }}>
                        {m.dayTrade.formattedProfitOrLoss}
                      </td>
                      <td style={{ padding: `${spacing.xs}px` }}>{m.fii.formattedProfitOrLoss}</td>
                      <td style={{ padding: `${spacing.xs}px`, fontWeight: 600 }}>
                        {m.formattedTotalTaxDue}
                      </td>
                      <td style={{ padding: `${spacing.xs}px` }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '2px 6px',
                            borderRadius: `${borderRadius.sm}px`,
                            backgroundColor: colors.surfaceElevated,
                          }}
                        >
                          {m.darf6015.statusLabel} ({m.darf6015.formattedPrincipalAmount})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
