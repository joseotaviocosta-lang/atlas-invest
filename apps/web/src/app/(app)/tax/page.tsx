'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import {
  colors,
  spacing,
  borderRadius,
  mapToFiscalMonthlyViewModel,
  fiscalMonthlyQueryKey,
  type RawFiscalMonthlyState,
} from '@atlas/ui';
import { Card, Skeleton, ErrorState, EmptyState, PageHeader, SectionHeader } from '@/components/ui';

function currentCompetence(): string {
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

function FiscalContent() {
  const [competence, setCompetence] = useState(currentCompetence());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: fiscalMonthlyQueryKey(competence),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawFiscalMonthlyState }>(
        `/api/v1/fiscal/monthly/${competence}`,
      );
      return res.data;
    },
    enabled: /^\d{4}-\d{2}$/.test(competence),
    staleTime: 30_000,
  });

  const viewModel = useMemo(() => mapToFiscalMonthlyViewModel(data ?? null), [data]);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <PageHeader
        title="Fiscal"
        subtitle="Apuração fiscal mensal derivada do livro-razão imutável (fundação)"
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${spacing.sm}px`,
          marginBottom: `${spacing.lg}px`,
        }}
      >
        <label htmlFor="competence" style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
          Competência
        </label>
        <input
          id="competence"
          type="month"
          value={competence}
          onChange={(e) => setCompetence(e.target.value)}
          style={{
            padding: `${spacing.xs}px ${spacing.sm}px`,
            borderRadius: `${borderRadius.md}px`,
            border: `1px solid ${colors.border}`,
            fontSize: '0.875rem',
            color: colors.textPrimary,
            backgroundColor: colors.surface,
          }}
        />
      </div>

      {isLoading && (
        <Card style={{ padding: `${spacing.xxl}px` }}>
          <Skeleton width="200px" height="1.5rem" />
          <Skeleton width="100%" height="80px" />
        </Card>
      )}

      {isError && !isLoading && (
        <Card style={{ padding: `${spacing.xxl}px` }}>
          <ErrorState
            title="Falha ao carregar a apuração fiscal"
            message={
              (error as ApiError)?.message || 'Ocorreu um erro ao consultar o estado fiscal.'
            }
            onRetry={() => refetch()}
          />
        </Card>
      )}

      {viewModel && (
        <>
          <SectionHeader
            title={`Competência ${viewModel.competenceLabel}`}
            description={viewModel.statusLabel}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: `${spacing.base}px`,
              marginBottom: `${spacing.xl}px`,
            }}
          >
            <Card style={{ padding: `${spacing.base}px` }}>
              <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                Eventos fiscais
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: colors.textPrimary }}>
                {viewModel.eventCount}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '4px' }}>
                {viewModel.eventsSummary.map((e) => `${e.count} ${e.label}`).join(' · ') || '—'}
              </div>
            </Card>
            <Card style={{ padding: `${spacing.base}px` }}>
              <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                Status da apuração
              </span>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: viewModel.statusColor }}>
                {viewModel.status}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '4px' }}>
                {viewModel.ruleSetLabel}
              </div>
            </Card>
            <Card style={{ padding: `${spacing.base}px` }}>
              <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                Pendências de dados
              </span>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: viewModel.dataQuality.hasIssues ? colors.warning : colors.positive,
                }}
              >
                {viewModel.dataQuality.issueLabels.length}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '4px' }}>
                {viewModel.dataQuality.hasIssues
                  ? 'Dados incompletos impedem conclusão total'
                  : 'Nenhuma pendência'}
              </div>
            </Card>
          </div>

          <SectionHeader
            title="Categorias de ativos"
            description="Fatos fiscais normalizados por categoria e moeda (sem conversão cambial)"
          />
          {viewModel.categories.length === 0 ? (
            <Card style={{ padding: `${spacing.xl}px` }}>
              <EmptyState
                title="Nenhum evento fiscal nesta competência"
                description="Não há transações fiscais registradas para a competência selecionada."
              />
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
              {viewModel.categories.map((c) => (
                <Card
                  key={`${c.categoryLabel}-${c.currency}`}
                  style={{ padding: `${spacing.base}px` }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <strong style={{ color: colors.textPrimary }}>
                      {c.categoryLabel} · {c.currency}
                    </strong>
                    <span style={{ fontSize: '0.8125rem', color: c.capabilityColor }}>
                      {c.capabilityLabel}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      color: colors.textSecondary,
                      marginTop: '6px',
                    }}
                  >
                    {c.eventCount} evento(s) · Vendas: {c.salesProceedsFormatted} · Proventos:{' '}
                    {c.incomeFormatted}
                  </div>
                  {c.qualityLabels.length > 0 && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: colors.warning,
                        marginTop: '4px',
                      }}
                    >
                      Pendências: {c.qualityLabels.join(' · ')}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {viewModel.dataQuality.hasIssues && (
            <div style={{ marginTop: `${spacing.xl}px` }}>
              <SectionHeader
                title="Dados incompletos"
                description="A apuração não pôde ser concluída integralmente"
              />
              <Card style={{ padding: `${spacing.base}px` }}>
                <ul style={{ margin: 0, paddingLeft: `${spacing.base}px`, color: colors.warning }}>
                  {viewModel.dataQuality.issueLabels.map((label) => (
                    <li key={label} style={{ fontSize: '0.875rem' }}>
                      {label}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          <div
            style={{
              marginTop: `${spacing.xl}px`,
              fontSize: '0.8125rem',
              color: colors.textMuted,
              lineHeight: 1.6,
            }}
          >
            {viewModel.foundationNotice}
          </div>
        </>
      )}
    </div>
  );
}

function FiscalSkeleton() {
  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <Skeleton width="220px" height="1.75rem" />
      <Card style={{ padding: `${spacing.base}px`, marginTop: `${spacing.base}px` }}>
        <Skeleton width="100%" height="80px" />
      </Card>
    </div>
  );
}

export default function TaxPage() {
  return (
    <React.Suspense fallback={<FiscalSkeleton />}>
      <FiscalContent />
    </React.Suspense>
  );
}
