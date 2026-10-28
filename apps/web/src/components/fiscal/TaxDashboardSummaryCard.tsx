'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import {
  colors,
  spacing,
  borderRadius,
  mapToTaxObligationViewModel,
  taxObligationQueryKey,
  type MonthlyTaxLiabilityViewModel,
  type TaxObligationViewModel,
  type FiscalMonthlyViewModel,
  type TaxInputReadinessViewModel,
  type RawTaxObligation,
} from '@atlas/ui';
import { Card, Badge, Button, Skeleton } from '@/components/ui';

export interface TaxDashboardSummaryCardProps {
  competence: string;
  onCompetenceChange: (competence: string) => void;
  liability: MonthlyTaxLiabilityViewModel | null;
  obligation?: TaxObligationViewModel | null;
  fiscalMonthly: FiscalMonthlyViewModel | null;
  inputReadiness: TaxInputReadinessViewModel | null;
  isLoading: boolean;
}

function shiftCompetence(comp: string, deltaMonths: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(comp);
  if (!match) return comp;
  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10) - 1; // 0-indexed
  const date = new Date(Date.UTC(year, month + deltaMonths, 1));
  const newYear = date.getUTCFullYear();
  const newMonth = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${newYear}-${newMonth}`;
}

export function TaxDashboardSummaryCard({
  competence,
  onCompetenceChange,
  liability,
  obligation: propObligation,
  fiscalMonthly,
  inputReadiness,
  isLoading,
}: TaxDashboardSummaryCardProps) {
  const authReady = useAuthReady();
  const [yearStr, monthStr] = competence.split('-');
  const competenceDisplay = monthStr && yearStr ? `${monthStr}/${yearStr}` : competence;

  const { data: rawObligation, isLoading: isObligationLoading } = useQuery({
    queryKey: taxObligationQueryKey(competence),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxObligation }>(
        `/api/v1/fiscal/monthly/${competence}/obligation`,
      );
      return res.data;
    },
    enabled: authReady && propObligation === undefined && /^\d{4}-\d{2}$/.test(competence),
    staleTime: 30_000,
  });

  const internalObligation = useMemo(
    () => mapToTaxObligationViewModel(rawObligation ?? null),
    [rawObligation],
  );

  const obligation = propObligation !== undefined ? propObligation : internalObligation;
  const effectiveLoading = isLoading || (propObligation === undefined && isObligationLoading);

  // Determine overall status and color
  let statusBadgeLabel = 'Aguardando apuração';
  let statusBadgeVariant: 'neutral' | 'success' | 'warning' | 'danger' = 'neutral';

  if (liability) {
    if (liability.isComplete) {
      statusBadgeLabel = 'Apuração concluída';
      statusBadgeVariant = 'success';
    } else if (liability.isNoActivity) {
      statusBadgeLabel = 'Sem movimentação tributável';
      statusBadgeVariant = 'neutral';
    } else if (liability.isPartial) {
      statusBadgeLabel = 'Apuração parcial';
      statusBadgeVariant = 'warning';
    } else if (liability.isBlocked) {
      statusBadgeLabel = 'Apuração bloqueada';
      statusBadgeVariant = 'danger';
    }
  }

  // Derive DARF Readiness & Status
  let darfStatusLabel = '—';
  let darfStatusColor: string = colors.textMuted;
  if (obligation) {
    darfStatusLabel = obligation.statusLabel;
    darfStatusColor = obligation.statusColor;
  } else if (liability?.isNoActivity) {
    darfStatusLabel = 'Sem imposto a recolher';
    darfStatusColor = colors.textMuted;
  }

  // Quality issues check
  const dataIssues = [
    ...(fiscalMonthly?.dataQuality.issueLabels ?? []),
    ...(liability?.qualityLabels ?? []),
    ...(inputReadiness?.issueLabels ?? []),
  ];
  const uniqueIssues = Array.from(new Set(dataIssues));
  const hasIssues = uniqueIssues.length > 0 || Boolean(liability?.isBlocked);

  // Compensated losses in month
  const compensatedLossesText = React.useMemo(() => {
    if (!liability || liability.categories.length === 0) return '—';
    const nonZeroLossApplied = liability.categories.filter(
      (c) =>
        c.lossAppliedFormatted &&
        c.lossAppliedFormatted !== '—' &&
        c.lossAppliedFormatted !== 'R$ 0,00',
    );
    if (nonZeroLossApplied.length === 0) return 'R$ 0,00';
    return nonZeroLossApplied
      .map((c) => `${c.categoryLabel}: ${c.lossAppliedFormatted}`)
      .join(' · ');
  }, [liability]);

  // Carried forward accumulated losses
  const carriedForwardLossesText = React.useMemo(() => {
    if (!liability || liability.closingLosses.length === 0) return 'Nenhum prejuízo acumulado';
    return (
      liability.closingLosses
        .filter((l) => l.amountFormatted !== 'R$ 0,00' && l.amountFormatted !== '—')
        .map((l) => `${l.categoryLabel}: ${l.amountFormatted}`)
        .join(' · ') || 'Nenhum prejuízo acumulado'
    );
  }, [liability]);

  return (
    <Card
      data-testid="tax-dashboard-summary-card"
      style={{
        padding: `${spacing.lg}px`,
        marginBottom: `${spacing.xl}px`,
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
      }}
    >
      {/* Top Bar: Title, Competence Controls & Status */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: `${spacing.md}px`,
          marginBottom: `${spacing.lg}px`,
          paddingBottom: `${spacing.md}px`,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: colors.textPrimary,
                margin: 0,
              }}
            >
              Posição Fiscal da Competência
            </h2>
            <Badge variant={statusBadgeVariant}>{statusBadgeLabel}</Badge>
          </div>
          <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: '2px' }}>
            Visão consolidada de apuração de ganhos, compensações, imposto devido e obrigações de
            DARF.
          </div>
        </div>

        {/* Competence Selector with Month Steps */}
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
          <button
            type="button"
            data-testid="tax-prev-month-button"
            onClick={() => onCompetenceChange(shiftCompetence(competence, -1))}
            aria-label="Mês anterior"
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            ←
          </button>

          <input
            id="competence-selector-input"
            type="month"
            value={competence}
            onChange={(e) => onCompetenceChange(e.target.value)}
            data-testid="tax-competence-month-input"
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              fontSize: '0.875rem',
              fontWeight: 600,
              color: colors.textPrimary,
              backgroundColor: colors.surface,
            }}
          />

          <button
            type="button"
            data-testid="tax-next-month-button"
            onClick={() => onCompetenceChange(shiftCompetence(competence, 1))}
            aria-label="Próximo mês"
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            →
          </button>
        </div>
      </div>

      {/* Main Metric Cards Grid (4 columns responsive) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: `${spacing.base}px`,
          marginBottom: `${spacing.lg}px`,
        }}
      >
        {/* Metric 1: Imposto Apurado */}
        <div
          data-testid="tax-metric-calculated-tax"
          style={{
            padding: `${spacing.base}px`,
            borderRadius: `${borderRadius.md}px`,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              color: colors.textSecondary,
              fontWeight: 600,
            }}
          >
            Imposto Apurado
          </div>
          {effectiveLoading ? (
            <Skeleton width="100px" height="1.75rem" />
          ) : (
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: liability?.isBlocked
                  ? colors.negative
                  : liability?.hasTaxDue
                    ? colors.textPrimary
                    : colors.textMuted,
                margin: `${spacing.xs}px 0 2px`,
              }}
            >
              {liability?.isBlocked || liability?.isPartial
                ? '—'
                : liability?.isNoActivity
                  ? 'R$ 0,00'
                  : (liability?.taxDueFormatted ?? '—')}
            </div>
          )}
          <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
            {liability?.isBlocked
              ? 'Dados incompletos impedem cálculo'
              : liability?.isNoActivity
                ? 'Sem operações com fato gerador'
                : liability?.taxDueFormatted === 'R$ 0,00'
                  ? 'Isento ou compensado integralmente'
                  : 'Calculado via regras verificadas'}
          </div>
        </div>

        {/* Metric 2: Saldo DARF a Pagar */}
        <div
          data-testid="tax-metric-darf-due"
          style={{
            padding: `${spacing.base}px`,
            borderRadius: `${borderRadius.md}px`,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              color: colors.textSecondary,
              fontWeight: 600,
            }}
          >
            Saldo DARF 6015
          </div>
          {effectiveLoading ? (
            <Skeleton width="100px" height="1.75rem" />
          ) : (
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color:
                  obligation?.status === 'PAID'
                    ? colors.positive
                    : obligation?.status === 'OVERDUE'
                      ? colors.negative
                      : colors.textPrimary,
                margin: `${spacing.xs}px 0 2px`,
              }}
            >
              {obligation?.status === 'NO_PAYMENT_DUE'
                ? 'R$ 0,00'
                : obligation?.principalFormatted && obligation.principalFormatted !== '—'
                  ? obligation.principalFormatted
                  : '—'}
            </div>
          )}
          <div style={{ fontSize: '0.75rem', color: darfStatusColor, fontWeight: 600 }}>
            {darfStatusLabel}
            {obligation?.dueDateFormatted && obligation.dueDateFormatted !== '—'
              ? ` · Vencimento: ${obligation.dueDateFormatted}`
              : obligation?.dueDatePendingLabel
                ? ` · ${obligation.dueDatePendingLabel}`
                : ''}
          </div>
        </div>

        {/* Metric 3: Compensações & Prejuízos */}
        <div
          data-testid="tax-metric-losses-compensated"
          style={{
            padding: `${spacing.base}px`,
            borderRadius: `${borderRadius.md}px`,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              color: colors.textSecondary,
              fontWeight: 600,
            }}
          >
            Compensação Aplicada
          </div>
          {effectiveLoading ? (
            <Skeleton width="100px" height="1.75rem" />
          ) : (
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: colors.textPrimary,
                margin: `${spacing.xs}px 0 2px`,
              }}
            >
              {compensatedLossesText}
            </div>
          )}
          <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
            Saldo futuro: {carriedForwardLossesText}
          </div>
        </div>

        {/* Metric 4: Integridade & Qualidade de Dados */}
        <div
          data-testid="tax-metric-data-quality"
          style={{
            padding: `${spacing.base}px`,
            borderRadius: `${borderRadius.md}px`,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              color: colors.textSecondary,
              fontWeight: 600,
            }}
          >
            Qualidade dos Dados
          </div>
          {effectiveLoading ? (
            <Skeleton width="100px" height="1.75rem" />
          ) : (
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: hasIssues ? colors.warning : colors.positive,
                margin: `${spacing.xs}px 0 2px`,
              }}
            >
              {hasIssues ? `${uniqueIssues.length} pendência(s)` : 'Dados íntegros'}
            </div>
          )}
          <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
            {hasIssues ? (
              <Link
                href="/portfolio/maintenance"
                style={{ color: colors.accent, textDecoration: 'none', fontWeight: 600 }}
              >
                Resolver pendências →
              </Link>
            ) : (
              'Transações e cotações validadas'
            )}
          </div>
        </div>
      </div>

      {/* Structured Explanation Strip: Flow of calculation */}
      {liability && (
        <div
          data-testid="tax-calculation-flow-strip"
          style={{
            padding: `${spacing.base}px`,
            borderRadius: `${borderRadius.md}px`,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            fontSize: '0.8125rem',
            color: colors.textSecondary,
            lineHeight: 1.6,
          }}
        >
          <div
            style={{ fontWeight: 600, color: colors.textPrimary, marginBottom: `${spacing.xs}px` }}
          >
            Entenda a apuração de {competenceDisplay}:
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: `${spacing.xs}px`,
            }}
          >
            <span>Resultado realizado das operações</span>
            <span style={{ fontWeight: 700, color: colors.textPrimary }}>→</span>
            <span>(-) Prejuízos anteriores compensados</span>
            <span style={{ fontWeight: 700, color: colors.textPrimary }}>→</span>
            <span>(-) IRRF retido na fonte</span>
            <span style={{ fontWeight: 700, color: colors.textPrimary }}>→</span>
            <span>(=) Imposto líquido apurado ({liability.taxDueFormatted})</span>
            <span style={{ fontWeight: 700, color: colors.textPrimary }}>→</span>
            <span>(=) Saldo DARF a recolher</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '6px' }}>
            * O Atlas deriva os valores do livro-razão e regras oficiais da Receita Federal. O
            pagamento deve ser realizado via Internet Banking ou Sicalcweb pelo próprio investidor.
          </div>
        </div>
      )}

      {/* Data Quality Action Banner (when blocked or issues exist) */}
      {hasIssues && (
        <div
          data-testid="tax-data-quality-alert-banner"
          style={{
            marginTop: `${spacing.md}px`,
            padding: `${spacing.base}px`,
            borderRadius: `${borderRadius.md}px`,
            backgroundColor: `${colors.warning}15`,
            border: `1px solid ${colors.warning}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: `${spacing.base}px`,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.875rem' }}>
              Pendências de dados impedem apuração definitiva nesta competência
            </div>
            <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: '2px' }}>
              {uniqueIssues.length > 0
                ? uniqueIssues.join(' · ')
                : 'Faltam regras tributárias ou classificações de transação para esta competência.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: `${spacing.sm}px` }}>
            <Link href="/portfolio/maintenance">
              <Button size="sm" variant="secondary">
                Manutenção de dados
              </Button>
            </Link>
            <Link href="/reviews">
              <Button size="sm" variant="secondary">
                Revisar importações
              </Button>
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}
