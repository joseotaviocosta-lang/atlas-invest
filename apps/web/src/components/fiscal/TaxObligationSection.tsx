'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import {
  colors,
  spacing,
  borderRadius,
  mapToTaxObligationViewModel,
  taxObligationQueryKey,
  taxObligationsQueryKey,
  type RawTaxObligation,
} from '@atlas/ui';
import { Card, Skeleton, EmptyState, SectionHeader } from '@/components/ui';

/**
 * Phase 4C.2 — Obrigações (tax obligations) section.
 *
 * Read-only rendering of server-derived obligations + DARF readiness. The client
 * never computes tax, due dates or overdue; it only records MANUAL_CONFIRMED
 * payment evidence with an explicit user confirmation. No official DARF is
 * generated here.
 */
export function TaxObligationSection({ competence }: { competence: string }) {
  const enabled = /^\d{4}-\d{2}$/.test(competence);
  const [payDate, setPayDate] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: taxObligationQueryKey(competence),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxObligation }>(
        `/api/v1/fiscal/monthly/${competence}/obligation`,
      );
      return res.data;
    },
    enabled,
    staleTime: 30_000,
  });

  const { data: list } = useQuery({
    queryKey: taxObligationsQueryKey(competence),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxObligation[] }>(
        `/api/v1/fiscal/obligations?competence=${competence}`,
      );
      return res.data;
    },
    enabled,
    staleTime: 30_000,
  });

  const obligation = useMemo(() => mapToTaxObligationViewModel(data ?? null), [data]);
  const raw = data ?? null;

  async function confirmPayment() {
    if (!raw || !raw.principalAmount || !raw.currency) return;
    const when = payDate || new Date().toISOString().slice(0, 10);
    if (
      !window.confirm(
        `Confirmar o pagamento de ${raw.principalAmount.amount} ${raw.currency} ` +
          `referente à competência ${raw.competence}?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await apiClient.post(`/api/v1/fiscal/obligations/${raw.id}/payments`, {
        paidAt: when,
        amount: raw.principalAmount.amount,
        currency: raw.currency,
        sourceType: 'MANUAL_CONFIRMED',
      });
      setMessage('Pagamento registrado. Estado atualizado.');
      await refetch();
    } catch (error) {
      setMessage((error as Error)?.message || 'Não foi possível registrar o pagamento.');
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;

  return (
    <div style={{ marginTop: `${spacing.xl}px` }}>
      <SectionHeader
        title="Obrigações"
        description="Compromissos fiscais derivados da apuração e do vencimento oficial (Agenda Tributária)"
      />

      {isLoading && (
        <Card style={{ padding: `${spacing.base}px` }}>
          <Skeleton width="100%" height="60px" />
        </Card>
      )}

      {!isLoading && !obligation && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Sem obrigação para esta competência"
            description="Não há apuração fiscal registrada para a competência selecionada."
          />
        </Card>
      )}

      {obligation && (
        <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.sm}px` }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <strong style={{ color: colors.textPrimary }}>
              {obligation.competenceLabel} · {obligation.bucketLabel}
            </strong>
            <span style={{ fontSize: '0.875rem', color: obligation.statusColor, fontWeight: 600 }}>
              {obligation.statusLabel}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: `${spacing.sm}px`,
              marginTop: `${spacing.sm}px`,
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                Valor principal
              </div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: colors.textPrimary }}>
                {obligation.principalFormatted}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Vencimento</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: colors.textPrimary }}>
                {obligation.dueDateFormatted}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                Código de receita
              </div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: colors.textPrimary }}>
                {obligation.revenueCode ?? '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                Dados para pagamento
              </div>
              <div
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  color: obligation.darfReadinessColor,
                }}
              >
                {obligation.darfReadinessLabel}
              </div>
            </div>
          </div>

          {obligation.sourceNote && (
            <div
              style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: `${spacing.sm}px` }}
            >
              {obligation.sourceNote}
              {obligation.sourceDocument ? ` — ${obligation.sourceDocument}` : ''}
            </div>
          )}

          <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '4px' }}>
            {obligation.darfReadinessNotice}
          </div>

          {obligation.status !== 'PAID' &&
            obligation.status !== 'NO_PAYMENT_DUE' &&
            obligation.status !== 'BLOCKED' &&
            obligation.status !== 'PROVISIONAL' &&
            obligation.isDarfReady && (
              <div
                style={{
                  marginTop: `${spacing.sm}px`,
                  display: 'flex',
                  gap: `${spacing.sm}px`,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <label
                  htmlFor="pay-date"
                  style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
                >
                  Data do pagamento
                </label>
                <input
                  id="pay-date"
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  style={{
                    padding: `${spacing.xs}px ${spacing.sm}px`,
                    borderRadius: `${borderRadius.md}px`,
                    border: `1px solid ${colors.border}`,
                    fontSize: '0.8125rem',
                    color: colors.textPrimary,
                    backgroundColor: colors.surface,
                    minHeight: '44px',
                  }}
                />
                <button
                  type="button"
                  onClick={confirmPayment}
                  disabled={busy}
                  style={{
                    minHeight: '44px',
                    padding: `${spacing.xs}px ${spacing.base}px`,
                    borderRadius: `${borderRadius.md}px`,
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.surface,
                    color: colors.textPrimary,
                    fontWeight: 600,
                    cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  {busy ? 'Registrando…' : 'Marcar como pago'}
                </button>
              </div>
            )}

          {message && (
            <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: '6px' }}>
              {message}
            </div>
          )}
        </Card>
      )}

      {list && list.length > 1 && (
        <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
          {list.length} obrigações registradas para esta competência.
        </div>
      )}
    </div>
  );
}
