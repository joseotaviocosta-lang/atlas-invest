'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import {
  colors,
  spacing,
  borderRadius,
  formatCurrency,
  mapToDarfHandoffViewModel,
  mapToTaxObligationViewModel,
  taxObligationQueryKey,
  taxObligationsQueryKey,
  type RawDarfReadiness,
  type RawTaxObligation,
} from '@atlas/ui';

/** Allowlisted official origin for the Sicalc handoff (open-redirect defense). */
const OFFICIAL_DARF_ORIGIN = 'https://sicalc.receita.fazenda.gov.br/';
import { Card, Skeleton, EmptyState, SectionHeader } from '@/components/ui';

interface RawAdjustment {
  status: string;
  reasonCode: string | null;
  principalAmount: { amount: string; currency: string } | null;
  lateFeeAmount: { amount: string; currency: string } | null;
  interestAmount: { amount: string; currency: string } | null;
  updatedAmount: { amount: string; currency: string } | null;
  dueDate: string | null;
  paymentDate: string;
  authority: { source: string };
}

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
  const [adjustDate, setAdjustDate] = useState(() => new Date().toISOString().slice(0, 10));

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

  const { data: adjustment } = useQuery({
    queryKey: ['fiscal-adjustment', raw?.id ?? '', adjustDate],
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawAdjustment }>(
        `/api/v1/fiscal/obligations/${raw!.id}/adjustment?paymentDate=${adjustDate}`,
      );
      return res.data;
    },
    enabled: Boolean(raw) && /^\d{4}-\d{2}-\d{2}$/.test(adjustDate),
    staleTime: 30_000,
  });

  // Phase 4F — official DARF handoff readiness (read-only; never generates a document).
  const darfEnabled =
    Boolean(raw) &&
    raw!.darfReadiness === 'READY' &&
    !['PAID', 'NO_PAYMENT_DUE', 'BLOCKED', 'PROVISIONAL'].includes(raw!.status);
  const { data: darfReadiness } = useQuery({
    queryKey: ['fiscal-darf-readiness', raw?.id ?? ''],
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawDarfReadiness }>(
        `/api/v1/fiscal/obligations/${raw!.id}/darf-readiness`,
      );
      return res.data;
    },
    enabled: darfEnabled,
    staleTime: 30_000,
  });
  const darf = useMemo(() => mapToDarfHandoffViewModel(darfReadiness ?? null), [darfReadiness]);
  const officialDarfHref =
    darf?.destinationUrl && darf.destinationUrl.startsWith(OFFICIAL_DARF_ORIGIN)
      ? darf.destinationUrl
      : null;

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
              {obligation.dueDatePendingLabel && (
                <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '2px' }}>
                  {obligation.dueDatePendingLabel}
                </div>
              )}
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

          {darf && (
            <div
              style={{
                marginTop: `${spacing.base}px`,
                borderTop: `1px solid ${colors.border}`,
                paddingTop: `${spacing.sm}px`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: `${spacing.sm}px`,
                  flexWrap: 'wrap',
                }}
              >
                <strong style={{ color: colors.textPrimary }}>DARF oficial</strong>
                <span
                  style={{ fontSize: '0.8125rem', color: darf.statusColor, fontWeight: 600 }}
                  data-testid="darf-status"
                >
                  {darf.statusLabel}
                </span>
              </div>

              {darf.eligible && (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: `${spacing.sm}px`,
                      marginTop: `${spacing.sm}px`,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                        Valor principal
                      </div>
                      <div style={{ fontWeight: 700, color: colors.textPrimary }}>
                        {darf.principalFormatted}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                        Valor a pagar
                      </div>
                      <div style={{ fontWeight: 700, color: colors.textPrimary }}>
                        {darf.totalFormatted}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                        Vencimento
                      </div>
                      <div style={{ fontWeight: 700, color: colors.textPrimary }}>
                        {darf.dueDateFormatted}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                        Código de receita
                      </div>
                      <div style={{ fontWeight: 700, color: colors.textPrimary }}>
                        {darf.revenueCode ?? '—'}
                      </div>
                    </div>
                  </div>

                  {darf.carryForwardFormatted && (
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        color: colors.textSecondary,
                        marginTop: `${spacing.sm}px`,
                      }}
                    >
                      Valor acumulado de períodos anteriores: {darf.carryForwardFormatted}
                    </div>
                  )}

                  {darf.lateFeeFormatted && (
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        color: colors.textSecondary,
                        marginTop: '4px',
                      }}
                    >
                      Multa: {darf.lateFeeFormatted} · Juros: {darf.interestFormatted}
                    </div>
                  )}

                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: colors.textMuted,
                      marginTop: `${spacing.sm}px`,
                    }}
                  >
                    Fonte oficial: {darf.officialSourceLabel}. Conclua a emissão no site oficial da
                    Receita.
                  </div>

                  {officialDarfHref && (
                    <a
                      href={officialDarfHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="darf-open-sicalc"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '44px',
                        marginTop: `${spacing.sm}px`,
                        padding: `${spacing.xs}px ${spacing.base}px`,
                        borderRadius: `${borderRadius.md}px`,
                        backgroundColor: colors.accent,
                        color: colors.surface,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      {darf.actionLabel}
                    </a>
                  )}

                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: colors.textMuted,
                      marginTop: `${spacing.sm}px`,
                    }}
                  >
                    O documento oficial não marca a obrigação como paga; registre o pagamento
                    separadamente.
                  </div>
                </>
              )}

              {!darf.eligible && darf.reasonLabel && (
                <div
                  style={{
                    fontSize: '0.8125rem',
                    color: colors.warning,
                    marginTop: '4px',
                  }}
                >
                  {darf.reasonLabel}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {raw && (
        <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.sm}px` }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: `${spacing.sm}px`,
              flexWrap: 'wrap',
            }}
          >
            <strong style={{ color: colors.textPrimary }}>Valor atualizado (atraso)</strong>
            <div style={{ display: 'flex', gap: `${spacing.sm}px`, alignItems: 'center' }}>
              <label
                htmlFor="adjust-date"
                style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
              >
                Data prevista para pagamento
              </label>
              <input
                id="adjust-date"
                type="date"
                value={adjustDate}
                onChange={(e) => setAdjustDate(e.target.value)}
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
            </div>
          </div>

          {adjustment?.status === 'READY' && adjustment.updatedAmount && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: `${spacing.sm}px`,
                  marginTop: `${spacing.sm}px`,
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    Valor original
                  </div>
                  <div style={{ fontWeight: 700, color: colors.textPrimary }}>
                    {adjustment.principalAmount
                      ? formatCurrency(
                          adjustment.principalAmount.amount,
                          adjustment.principalAmount.currency,
                        )
                      : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Multa</div>
                  <div style={{ fontWeight: 700, color: colors.textPrimary }}>
                    {adjustment.lateFeeAmount
                      ? formatCurrency(
                          adjustment.lateFeeAmount.amount,
                          adjustment.lateFeeAmount.currency,
                        )
                      : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Juros</div>
                  <div style={{ fontWeight: 700, color: colors.textPrimary }}>
                    {adjustment.interestAmount
                      ? formatCurrency(
                          adjustment.interestAmount.amount,
                          adjustment.interestAmount.currency,
                        )
                      : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    Valor atualizado
                  </div>
                  <div style={{ fontWeight: 700, color: colors.textPrimary }}>
                    {formatCurrency(
                      adjustment.updatedAmount.amount,
                      adjustment.updatedAmount.currency,
                    )}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '4px' }}>
                Cálculo com base em dados oficiais da Receita/Sicalc.
              </div>
            </>
          )}

          {adjustment?.status === 'NOT_LATE' && (
            <div
              style={{
                fontSize: '0.8125rem',
                color: colors.textSecondary,
                marginTop: `${spacing.sm}px`,
              }}
            >
              Sem acréscimos para esta data (dentro do prazo).
            </div>
          )}

          {adjustment?.status === 'BLOCKED' && (
            <div
              style={{ fontSize: '0.8125rem', color: colors.warning, marginTop: `${spacing.sm}px` }}
            >
              Não foi possível calcular o valor atualizado com segurança ({adjustment.reasonCode}).
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
