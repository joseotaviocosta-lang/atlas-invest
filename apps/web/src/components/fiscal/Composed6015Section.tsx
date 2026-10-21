'use client';

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import {
  colors,
  spacing,
  formatCurrency,
  mapToComposed6015ViewModel,
  mapToTaxPaymentEligibilityViewModel,
  taxPaymentSummaryQueryKey,
  type RawTaxPaymentSummary,
} from '@atlas/ui';
import { Card, Skeleton, EmptyState, SectionHeader } from '@/components/ui';

/**
 * Phase 4G.2C — composed 6015 section.
 *
 * Renders the server-composed revenue-code 6015 amount (FII + ordinary equity +
 * day trade) together with the 4E minimum/carry view. The client NEVER sums the
 * components or recomputes tax; it only formats server values.
 */
export function Composed6015Section({ competence }: { competence: string }) {
  const authReady = useAuthReady();
  const enabled = authReady && /^\d{4}-\d{2}$/.test(competence);
  const { data, isLoading } = useQuery({
    queryKey: taxPaymentSummaryQueryKey(competence),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxPaymentSummary }>(
        `/api/v1/fiscal/monthly/${competence}/payment-summary`,
      );
      return res.data;
    },
    enabled,
    staleTime: 30_000,
  });

  const composition = useMemo(() => mapToComposed6015ViewModel(data?.composition ?? null), [data]);
  const eligibility = useMemo(() => mapToTaxPaymentEligibilityViewModel(data ?? null), [data]);

  if (!enabled) return null;

  const darfReady = data?.obligation?.darfReadiness === 'READY' && eligibility?.isPayable === true;

  return (
    <div style={{ marginTop: `${spacing.xl}px` }}>
      <SectionHeader
        title="Composição 6015"
        description="Obrigação mensal única por código de receita (FII + operações comuns + day trade)"
      />

      {isLoading && (
        <Card style={{ padding: `${spacing.base}px` }}>
          <Skeleton width="100%" height="60px" />
        </Card>
      )}

      {!isLoading && !composition && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Sem composição 6015"
            description="Não há dados de composição para a competência selecionada."
          />
        </Card>
      )}

      {composition && (
        <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.sm}px` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <strong style={{ color: colors.textPrimary }} data-testid="composed-6015-revenue-code">
              Código de receita {composition.revenueCode}
            </strong>
            <span
              style={{ fontSize: '0.875rem', color: composition.statusColor, fontWeight: 600 }}
              data-testid="composed-6015-status"
            >
              {composition.statusLabel}
            </span>
          </div>

          {composition.isBlocked ? (
            <div
              style={{ fontSize: '0.8125rem', color: colors.warning, marginTop: `${spacing.sm}px` }}
              data-testid="composed-6015-blocked"
            >
              {composition.blockedReasonLabel}
            </div>
          ) : (
            <>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: colors.textSecondary,
                  marginTop: `${spacing.sm}px`,
                }}
              >
                Componentes
              </div>
              {composition.components.map((component) => (
                <div
                  key={component.category}
                  data-testid={`composed-6015-component-${component.category}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.8125rem',
                    padding: '2px 0',
                    color: component.isBlocked ? colors.warning : colors.textPrimary,
                  }}
                >
                  <span>{component.label}</span>
                  <span>{component.amountFormatted}</span>
                </div>
              ))}

              {eligibility && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: `${spacing.sm}px`,
                    marginTop: `${spacing.sm}px`,
                    borderTop: `1px solid ${colors.border}`,
                    paddingTop: `${spacing.sm}px`,
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                      Total do mês
                    </div>
                    <div
                      style={{ fontWeight: 700, color: colors.textPrimary }}
                      data-testid="composed-6015-total"
                    >
                      {composition.totalFormatted}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                      Saldo anterior
                    </div>
                    <div
                      style={{ fontWeight: 700, color: colors.textPrimary }}
                      data-testid="composed-6015-carry"
                    >
                      {eligibility.carryForwardFormatted}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                      Valor considerado
                    </div>
                    <div style={{ fontWeight: 700, color: colors.textPrimary }}>
                      {eligibility.totalPayableFormatted}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                      Valor a pagar
                    </div>
                    <div
                      style={{ fontWeight: 700, color: colors.textPrimary }}
                      data-testid="composed-6015-payable"
                    >
                      {eligibility.isPayable ? eligibility.totalPayableFormatted : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                      Vencimento
                    </div>
                    <div style={{ fontWeight: 700, color: colors.textPrimary }}>
                      {eligibility.dueDateFormatted}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Situação</div>
                    <div
                      style={{ fontWeight: 700, color: eligibility.statusColor }}
                      data-testid="composed-6015-eligibility"
                    >
                      {eligibility.statusLabel}
                    </div>
                  </div>
                </div>
              )}

              {eligibility && (
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: colors.textMuted,
                    marginTop: `${spacing.sm}px`,
                  }}
                  data-testid="composed-6015-notice"
                >
                  {eligibility.notice}
                </div>
              )}

              {eligibility?.isDeferred && (
                <div
                  style={{
                    fontSize: '0.8125rem',
                    color: colors.warning,
                    marginTop: '4px',
                  }}
                  data-testid="composed-6015-deferred"
                >
                  Valor abaixo do mínimo: não há DARF a pagar nesta competência
                  {eligibility.carryForwardFormatted !== '—'
                    ? `; ${eligibility.totalPayableFormatted} serão acumulados.`
                    : '.'}
                </div>
              )}

              {darfReady && (
                <div
                  style={{
                    fontSize: '0.8125rem',
                    color: colors.textSecondary,
                    marginTop: `${spacing.sm}px`,
                  }}
                  data-testid="composed-6015-darf-ready"
                >
                  Pronto para emissão do DARF (código 6015). Conclua a emissão no site oficial da
                  Receita na seção de obrigações.
                </div>
              )}

              {data?.obligation?.status === 'OVERDUE' && (
                <div
                  style={{ fontSize: '0.8125rem', color: colors.warning, marginTop: '4px' }}
                  data-testid="composed-6015-overdue"
                >
                  Obrigação vencida. O valor atualizado com acréscimos é calculado na seção de
                  obrigações.
                </div>
              )}
            </>
          )}

          <div
            style={{
              fontSize: '0.75rem',
              color: colors.textMuted,
              marginTop: `${spacing.sm}px`,
            }}
          >
            {composition.totalFormatted !== '—'
              ? `Total apurado: ${formatCurrency(
                  data?.composition?.total?.amount ?? '0',
                  data?.composition?.total?.currency ?? 'BRL',
                )}.`
              : 'Sem valor apurado.'}
          </div>
        </Card>
      )}
    </div>
  );
}
