'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  colors,
  spacing,
  borderRadius,
  annualInvestmentIncomeQueryKey,
  formatAnnualInvestmentIncomeViewModel,
  type RawAnnualInvestmentIncomeSummary,
} from '@atlas/ui';
import { apiClient } from '@/api/client';
import { Card, SectionHeader, ErrorState, Skeleton } from '@/components/ui';

export function AnnualInvestmentIncomeSection() {
  const currentYear = new Date().getFullYear() - 1;
  const [calendarYear, setCalendarYear] = useState<number>(currentYear > 2000 ? currentYear : 2025);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: annualInvestmentIncomeQueryKey(calendarYear),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawAnnualInvestmentIncomeSummary }>(
        `/api/v1/fiscal/annual/${calendarYear}/income`,
      );
      return res.data;
    },
    enabled: Boolean(calendarYear >= 1900 && calendarYear <= 2100),
    staleTime: 30_000,
  });

  const viewModel = useMemo(
    () => (data ? formatAnnualInvestmentIncomeViewModel(data) : null),
    [data],
  );

  return (
    <div
      data-testid="annual-investment-income-section"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${spacing.md}px`,
        marginTop: `${spacing.lg}px`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
        }}
      >
        <SectionHeader
          title={`Rendimentos e Proventos (Ano-Calendário ${calendarYear})`}
          description="Acompanhamento consolidado de Dividendos, JCP e Rendimentos de FII com retenção na fonte."
        />

        <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
          {[2024, 2025, 2026].map((yr) => (
            <button
              key={yr}
              type="button"
              data-testid={`year-selector-${yr}`}
              onClick={() => setCalendarYear(yr)}
              style={{
                padding: `${spacing.xs}px ${spacing.sm}px`,
                borderRadius: `${borderRadius.md}px`,
                border: `1px solid ${calendarYear === yr ? colors.accent : colors.border}`,
                backgroundColor: calendarYear === yr ? colors.surfaceElevated : colors.surface,
                color: calendarYear === yr ? colors.accent : colors.textPrimary,
                fontWeight: calendarYear === yr ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <Card style={{ padding: `${spacing.lg}px` }}>
          <Skeleton style={{ height: '40px', width: '100%', marginBottom: `${spacing.sm}px` }} />
          <Skeleton style={{ height: '120px', width: '100%' }} />
        </Card>
      )}

      {isError && (
        <ErrorState
          title="Erro ao carregar proventos"
          message={error instanceof Error ? error.message : 'Não foi possível carregar os rendimentos anuais.'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && viewModel && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
          {/* Status Banner */}
          {!viewModel.isComplete && (
            <div
              style={{
                padding: `${spacing.sm}px ${spacing.md}px`,
                backgroundColor: colors.surfaceElevated,
                border: `1px solid ${colors.border}`,
                borderRadius: `${borderRadius.md}px`,
                fontSize: '0.875rem',
                color: colors.textSecondary,
              }}
            >
              Status: <strong>{viewModel.statusLabel}</strong>. Algumas informações de proventos requerem comprovação documental.
            </div>
          )}

          {/* 3 Categories Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: `${spacing.md}px`,
            }}
          >
            {/* Dividends Card */}
            <Card style={{ padding: `${spacing.md}px` }}>
              <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginBottom: '4px' }}>
                Dividendos Recebidos
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.positive }}>
                {viewModel.dividends.formattedGrossAmount}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '4px' }}>
                {viewModel.dividends.taxTreatmentLabel} ({viewModel.dividends.eventCount} eventos)
              </div>
            </Card>

            {/* JCP Card */}
            <Card style={{ padding: `${spacing.md}px` }}>
              <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginBottom: '4px' }}>
                Juros sobre Capital Próprio (JCP)
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.textPrimary }}>
                {viewModel.jcp.formattedGrossAmount}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '4px' }}>
                IRRF Retido: <strong>{viewModel.jcp.formattedWithheldTax}</strong> ({viewModel.jcp.taxTreatmentLabel})
              </div>
            </Card>

            {/* FII Income Card */}
            <Card style={{ padding: `${spacing.md}px` }}>
              <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginBottom: '4px' }}>
                Rendimentos de FII
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.positive }}>
                {viewModel.fiiIncome.formattedGrossAmount}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '4px' }}>
                {viewModel.fiiIncome.taxTreatmentLabel} ({viewModel.fiiIncome.eventCount} eventos)
              </div>
            </Card>
          </div>

          {/* Payers Table */}
          {viewModel.payers.length > 0 && (
            <Card style={{ padding: `${spacing.base}px` }}>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: colors.textPrimary, marginBottom: `${spacing.xs}px` }}>
                Discriminação por Fonte Pagadora
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}`, textAlign: 'left', color: colors.textSecondary }}>
                      <th style={{ padding: `${spacing.xs}px` }}>Fonte Pagadora</th>
                      <th style={{ padding: `${spacing.xs}px` }}>Dividendos</th>
                      <th style={{ padding: `${spacing.xs}px` }}>JCP Bruto</th>
                      <th style={{ padding: `${spacing.xs}px` }}>IRRF JCP</th>
                      <th style={{ padding: `${spacing.xs}px` }}>FII</th>
                      <th style={{ padding: `${spacing.xs}px`, fontWeight: 700 }}>Total Bruto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewModel.payers.map((p) => (
                      <tr key={p.payerId} style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <td style={{ padding: `${spacing.xs}px`, fontWeight: 600 }}>{p.payerDisplayName}</td>
                        <td style={{ padding: `${spacing.xs}px` }}>{p.formattedDividendGross}</td>
                        <td style={{ padding: `${spacing.xs}px` }}>{p.formattedJcpGross}</td>
                        <td style={{ padding: `${spacing.xs}px` }}>{p.formattedJcpWithheld}</td>
                        <td style={{ padding: `${spacing.xs}px` }}>{p.formattedFiiIncomeGross}</td>
                        <td style={{ padding: `${spacing.xs}px`, fontWeight: 700 }}>{p.formattedTotalGross}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* 12 Months Distribution Table */}
          <Card style={{ padding: `${spacing.base}px` }}>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: colors.textPrimary, marginBottom: `${spacing.xs}px` }}>
              Evolução Mensal dos Proventos
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border}`, textAlign: 'left', color: colors.textSecondary }}>
                    <th style={{ padding: `${spacing.xs}px` }}>Mês</th>
                    <th style={{ padding: `${spacing.xs}px` }}>Dividendos</th>
                    <th style={{ padding: `${spacing.xs}px` }}>JCP</th>
                    <th style={{ padding: `${spacing.xs}px` }}>FII</th>
                    <th style={{ padding: `${spacing.xs}px`, fontWeight: 700 }}>Total Recebido</th>
                    <th style={{ padding: `${spacing.xs}px` }}>Eventos</th>
                  </tr>
                </thead>
                <tbody>
                  {viewModel.months.map((m) => (
                    <tr key={m.competence} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td style={{ padding: `${spacing.xs}px`, fontWeight: 600 }}>{m.monthLabel}</td>
                      <td style={{ padding: `${spacing.xs}px` }}>{m.formattedDividendsGross}</td>
                      <td style={{ padding: `${spacing.xs}px` }}>{m.formattedJcpGross}</td>
                      <td style={{ padding: `${spacing.xs}px` }}>{m.formattedFiiIncomeGross}</td>
                      <td style={{ padding: `${spacing.xs}px`, fontWeight: 700 }}>{m.formattedTotalGross}</td>
                      <td style={{ padding: `${spacing.xs}px` }}>{m.eventCount}</td>
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

