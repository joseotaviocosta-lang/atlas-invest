'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { apiClient, ApiError } from '@/api/client';
import {
  colors,
  spacing,
  borderRadius,
  mapToFiscalMonthlyViewModel,
  mapToMonthlyTaxLiabilityViewModel,
  mapToTaxInputReadinessViewModel,
  fiscalMonthlyQueryKey,
  taxLiabilityQueryKey,
  taxInputReadinessQueryKey,
  type RawFiscalMonthlyState,
  type RawMonthlyTaxLiability,
  type RawTaxInputReadiness,
} from '@atlas/ui';
import { Card, Skeleton, ErrorState, EmptyState, PageHeader, SectionHeader, Tabs } from '@/components/ui';
import { TaxInputEntry } from '@/components/fiscal/TaxInputEntry';
import { TaxObligationSection } from '@/components/fiscal/TaxObligationSection';
import { EquityFiscalSection } from '@/components/fiscal/EquityFiscalSection';
import { Composed6015Section } from '@/components/fiscal/Composed6015Section';
import { AnnualPositionsSection } from '@/components/fiscal/AnnualPositionsSection';
import { AnnualCapitalMarketSection } from '@/components/fiscal/AnnualCapitalMarketSection';
import { AnnualInvestmentIncomeSection } from '@/components/fiscal/AnnualInvestmentIncomeSection';
import { AnnualReadinessSection } from '@/components/fiscal/AnnualReadinessSection';
import { AnnualReportingSection } from '@/components/fiscal/AnnualReportingSection';
import { ComplianceTimelineSection } from '@/components/fiscal/ComplianceTimelineSection';
import { TaxComplianceRemindersSection } from '@/components/fiscal/TaxComplianceRemindersSection';
import { TaxComplianceActionCenterSection } from '@/components/fiscal/TaxComplianceActionCenterSection';
import { TaxCompliancePeriodCloseSection } from '@/components/fiscal/TaxCompliancePeriodCloseSection';

function currentCompetence(): string {
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

function FiscalContent() {
  const status = useAuthStore((state) => state.status);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const authReady = isInitialized && status === 'authenticated';

  const [competence, setCompetence] = useState('');
  const [activeTab, setActiveTab] = useState<'monthly' | 'annual' | 'high-income' | 'compliance'>('monthly');

  const taxTabs = [
    { id: 'monthly', label: 'Apuração Mensal & DARF' },
    { id: 'annual', label: 'Declaração Anual (DIRPF)' },
    { id: 'high-income', label: 'Alta Renda (Lei 15.270)' },
    { id: 'compliance', label: 'Conformidade & Prazos' },
  ];

  useEffect(() => {
    setCompetence(currentCompetence());
  }, []);

  const { data: portfoliosData } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Array<{ id: string; name: string }> }>(
        '/api/v1/portfolios',
      );
      return res.data;
    },
    enabled: authReady,
    staleTime: 60_000,
  });

  const selectedPortfolioId =
    portfoliosData && portfoliosData.length > 0 ? portfoliosData[0]!.id : null;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: fiscalMonthlyQueryKey(competence),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawFiscalMonthlyState }>(
        `/api/v1/fiscal/monthly/${competence}`,
      );
      return res.data;
    },
    enabled: authReady && /^\d{4}-\d{2}$/.test(competence),
    staleTime: 30_000,
  });

  const viewModel = useMemo(() => mapToFiscalMonthlyViewModel(data ?? null), [data]);

  const {
    data: liabilityData,
    isLoading: liabilityLoading,
    isError: liabilityError,
    error: liabilityErrorObj,
    refetch: refetchLiability,
  } = useQuery({
    queryKey: taxLiabilityQueryKey(competence),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawMonthlyTaxLiability }>(
        `/api/v1/fiscal/monthly/${competence}/liability`,
      );
      return res.data;
    },
    enabled: authReady && /^\d{4}-\d{2}$/.test(competence),
    staleTime: 30_000,
  });

  const liability = useMemo(
    () => mapToMonthlyTaxLiabilityViewModel(liabilityData ?? null),
    [liabilityData],
  );

  const { data: inputReadinessData } = useQuery({
    queryKey: taxInputReadinessQueryKey(competence),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxInputReadiness }>(
        `/api/v1/fiscal/inputs/${competence}`,
      );
      return res.data;
    },
    enabled: authReady && /^\d{4}-\d{2}$/.test(competence),
    staleTime: 30_000,
  });

  const inputReadiness = useMemo(
    () => mapToTaxInputReadinessViewModel(inputReadinessData ?? null),
    [inputReadinessData],
  );

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <PageHeader
        title="Fiscal"
        subtitle="Gestão tributária completa: apuração mensal de DARFs, declaração anual, regime de alta renda e prazos fiscais."
      />

      <div style={{ marginBottom: `${spacing.lg}px` }}>
        <Tabs
          tabs={taxTabs}
          activeTab={activeTab}
          onTabChange={(id) =>
            setActiveTab(id as 'monthly' | 'annual' | 'high-income' | 'compliance')
          }
        />
      </div>

      {/* TAB 1: APURAÇÃO MENSAL & DARF */}
      {activeTab === 'monthly' && (
        <div>
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
              <details style={{ marginBottom: `${spacing.xl}px` }}>
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    color: colors.textPrimary,
                  }}
                >
                  Diagnóstico Fiscal: {viewModel.status} · Competência {viewModel.competenceLabel}
                </summary>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: '4px' }}>
              Fatos fiscais normalizados e pendências de evidência. O resultado fiscal vigente é
              apurado nas seções Apuração de imposto, Ações e Composição 6015 abaixo.
            </div>
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
                  <ul
                    style={{ margin: 0, paddingLeft: `${spacing.base}px`, color: colors.warning }}
                  >
                    {viewModel.dataQuality.issueLabels.map((label) => (
                      <li key={label} style={{ fontSize: '0.875rem' }}>
                        {label}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            )}
          </details>

          {liability && (
            <div style={{ marginTop: `${spacing.xl}px` }}>
              <SectionHeader
                title="Apuração de imposto"
                description={liability.statusLabel}
              />
              <div
                style={{
                  fontSize: '0.8125rem',
                  color: colors.textSecondary,
                  marginBottom: `${spacing.base}px`,
                  lineHeight: 1.6,
                }}
              >
                Valores por categoria refletem o resultado realizado patrimonial (preço médio). O
                tratamento tributário por operação, incluindo day trade, está na seção Ações; o
                total composto para pagamento está em Composição 6015.
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: `${spacing.base}px`,
                  marginBottom: `${spacing.base}px`,
                }}
              >
                <Card style={{ padding: `${spacing.base}px` }}>
                  <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                    Imposto calculado
                  </span>
                  <div
                    style={{ fontSize: '1.5rem', fontWeight: 700, color: liability.statusColor }}
                  >
                    {liability.taxDueFormatted}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '4px' }}>
                    {liability.productionRuleVerified
                      ? 'Regra de produção verificada'
                      : 'Sem regra de produção verificada'}
                  </div>
                </Card>
              </div>

              {liability.categories.map((c, idx) => (
                <Card
                  key={`${c.categoryLabel}-${c.currency}-${idx}`}
                  style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.sm}px` }}
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
                    <span style={{ fontSize: '0.8125rem', color: c.statusColor }}>
                      {c.statusLabel}
                    </span>
                  </div>
                  <div
                    style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: '6px' }}
                  >
                    Vendas: {c.grossSalesFormatted} · Resultado realizado:{' '}
                    {c.realizedResultFormatted} · Base antes de prejuízos:{' '}
                    {c.taxableBaseBeforeLossesFormatted}
                  </div>
                  <div
                    style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: '2px' }}
                  >
                    Prejuízo anterior: {c.openingLossFormatted} · Compensado:{' '}
                    {c.lossAppliedFormatted} · Prejuízo gerado: {c.lossGeneratedFormatted} · Saldo
                    final: {c.closingLossFormatted}
                  </div>
                  <div
                    style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: '2px' }}
                  >
                    Base após prejuízos: {c.taxableBaseAfterLossesFormatted} · Alíquota:{' '}
                    {c.rateFormatted} · Retenção: {c.withholdingAppliedFormatted} · Imposto:{' '}
                    {c.taxDueFormatted}
                  </div>
                  {c.qualityLabels.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: colors.warning, marginTop: '4px' }}>
                      Pendências: {c.qualityLabels.join(' · ')}
                    </div>
                  )}
                </Card>
              ))}

              {(liability.openingLosses.length > 0 || liability.closingLosses.length > 0) && (
                <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.sm}px` }}>
                  <strong style={{ color: colors.textPrimary }}>Prejuízos a compensar</strong>
                  <div
                    style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: '4px' }}
                  >
                    {liability.closingLosses
                      .map((l) => `${l.categoryLabel} (${l.currency}): ${l.amountFormatted}`)
                      .join(' · ') || '—'}
                  </div>
                </Card>
              )}

              {liability.qualityLabels.length > 0 && (
                <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.sm}px` }}>
                  <strong style={{ color: colors.warning }}>Pendências de dados</strong>
                  <ul
                    style={{
                      margin: '6px 0 0 0',
                      paddingLeft: `${spacing.base}px`,
                      color: colors.warning,
                    }}
                  >
                    {liability.qualityLabels.map((label) => (
                      <li key={label} style={{ fontSize: '0.875rem' }}>
                        {label}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {liability.trace.length > 0 && (
                <details style={{ marginBottom: `${spacing.sm}px` }}>
                  <summary
                    style={{
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      color: colors.accent,
                      fontWeight: 600,
                    }}
                  >
                    Como foi calculado
                  </summary>
                  <Card style={{ padding: `${spacing.base}px`, marginTop: `${spacing.xs}px` }}>
                    {liability.trace.map((t, i) => (
                      <div
                        key={`${t.stage}-${i}`}
                        style={{
                          fontSize: '0.75rem',
                          color: colors.textSecondary,
                          padding: '2px 0',
                        }}
                      >
                        <strong>{t.stage}</strong> · {t.operation} · {t.status}
                        {t.ruleVersion ? ` · regra ${t.ruleVersion}` : ''}
                        {t.output ? ` · ${t.output}` : ''}
                      </div>
                    ))}
                  </Card>
                </details>
              )}

              <div style={{ fontSize: '0.75rem', color: colors.textMuted, lineHeight: 1.6 }}>
                {liability.disclaimer}
              </div>
            </div>
          )}

          <EquityFiscalSection
            competence={competence}
            equity={liabilityData?.equity ?? null}
            isLoading={liabilityLoading}
            isError={liabilityError}
            errorMessage={(liabilityErrorObj as ApiError)?.message}
            onRefetch={() => {
              void refetchLiability();
            }}
          />

          <Composed6015Section competence={competence} />

          {inputReadiness && (
            <div style={{ marginTop: `${spacing.xl}px` }}>
              <SectionHeader
                title="Dados necessários para apuração"
                description={`Competência ${inputReadiness.competenceLabel}`}
              />{' '}
              <Card style={{ padding: `${spacing.base}px` }}>
                {inputReadiness.rows.map((row) => (
                  <div
                    key={row.key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.875rem',
                      padding: '4px 0',
                    }}
                  >
                    <span style={{ color: colors.textPrimary }}>{row.label}</span>
                    <span style={{ color: row.statusColor, fontWeight: 600 }}>
                      {row.statusLabel}
                    </span>
                  </div>
                ))}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.875rem',
                    padding: '4px 0',
                    borderTop: `1px solid ${colors.border}`,
                    marginTop: '4px',
                  }}
                >
                  <span style={{ color: colors.textPrimary }}>Regras tributárias</span>
                  <span style={{ color: inputReadiness.ruleCoverageColor, fontWeight: 600 }}>
                    {inputReadiness.ruleCoverageLabel}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.875rem',
                    padding: '4px 0',
                  }}
                >
                  <span style={{ color: colors.textPrimary }}>Apuração</span>
                  <span style={{ color: inputReadiness.liabilityStatusColor, fontWeight: 600 }}>
                    {inputReadiness.liabilityStatusLabel}
                  </span>
                </div>
                {inputReadiness.issueLabels.length > 0 && (
                  <div
                    style={{
                      marginTop: `${spacing.sm}px`,
                      fontSize: '0.75rem',
                      color: colors.warning,
                    }}
                  >
                    Pendências: {inputReadiness.issueLabels.join(' · ')}
                  </div>
                )}
                <div
                  style={{
                    marginTop: `${spacing.sm}px`,
                    fontSize: '0.75rem',
                    color: colors.textMuted,
                    lineHeight: 1.6,
                  }}
                >
                  {inputReadiness.notice}
                </div>
              </Card>
            </div>
          )}

          <TaxObligationSection competence={competence} />

          <TaxInputEntry
            competence={competence}
            events={
              (data?.events ?? []) as unknown as {
                sourceTransactionId: string;
                eventType: string;
                economicDate: string;
                taxAssetCategory: string;
              }[]
            }
            onSaved={() => refetch()}
          />

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
  )}

  {/* TAB 2: DECLARAÇÃO ANUAL (DIRPF) */}
  {activeTab === 'annual' && (
    <div>
      <AnnualPositionsSection portfolioId={selectedPortfolioId} />
      <AnnualCapitalMarketSection />
      <AnnualInvestmentIncomeSection />
      <AnnualReadinessSection />
      <AnnualReportingSection />
    </div>
  )}

  {/* TAB 3: ALTA RENDA (LEI 15.270) */}
  {activeTab === 'high-income' && (
    <Card style={{ padding: `${spacing.xl}px` }}>
      <SectionHeader
        title="Tributação mínima de alta renda"
        description="Revisão anual do regime de altas rendas (Lei nº 15.270/2025): situação, base de cálculo, evidências e pendências."
      />
      <p
        style={{
          fontSize: '0.875rem',
          color: colors.textSecondary,
          lineHeight: 1.6,
          margin: `${spacing.md}px 0`,
        }}
      >
        O regime de alta renda monitora anualmente os rendimentos tributáveis e isentos sujeitos
        à alíquota efetiva mínima, permitindo o acompanhamento preventivo das obrigações e deduções
        legais.
      </p>
      <Link
        href="/tax/high-income"
        data-testid="tax-high-income-link"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          color: colors.accent,
          fontWeight: 600,
          fontSize: '0.875rem',
          textDecoration: 'none',
        }}
      >
        Abrir revisão anual completa de alta renda →
      </Link>
    </Card>
  )}

  {/* TAB 4: CONFORMIDADE & PRAZOS */}
  {activeTab === 'compliance' && (
    <div>
      <ComplianceTimelineSection />
      <TaxComplianceActionCenterSection />
      <TaxCompliancePeriodCloseSection />
      <TaxComplianceRemindersSection />
    </div>
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
