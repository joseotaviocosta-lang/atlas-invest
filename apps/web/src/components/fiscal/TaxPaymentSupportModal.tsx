'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import {
  colors,
  spacing,
  borderRadius,
  mapToTaxPaymentSupportViewModel,
  taxPaymentSupportQueryKey,
  taxPaymentEvidenceQueryKey,
  type RawTaxPaymentSupport,
  type RawTaxPaymentEvidenceRecord,
} from '@atlas/ui';
import { Skeleton, Badge, Button } from '@/components/ui';

interface TaxPaymentSupportModalProps {
  readonly obligationKey: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function TaxPaymentSupportModal({
  obligationKey,
  isOpen,
  onClose,
}: TaxPaymentSupportModalProps) {
  const queryClient = useQueryClient();
  const authReady = useAuthReady();

  const [paymentDate, setPaymentDate] = useState<string>('');
  const [amountReported, setAmountReported] = useState<string>('');
  const [revenueCodeReported, setRevenueCodeReported] = useState<string>('');
  const [referencePeriod, setReferencePeriod] = useState<string>('');
  const [externalReference, setExternalReference] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setPaymentDate(new Date().toISOString().slice(0, 10));
  }, []);

  const {
    data: rawSupport,
    isLoading: isSupportLoading,
    isError: isSupportError,
  } = useQuery({
    queryKey: taxPaymentSupportQueryKey(obligationKey),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxPaymentSupport }>(
        `/api/v1/fiscal/compliance/${encodeURIComponent(obligationKey)}/payment-support`,
      );
      return res.data;
    },
    enabled: authReady && isOpen,
    staleTime: 10_000,
  });

  const { data: rawEvidenceHistory } = useQuery({
    queryKey: taxPaymentEvidenceQueryKey(obligationKey),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxPaymentEvidenceRecord[] }>(
        `/api/v1/fiscal/compliance/${encodeURIComponent(obligationKey)}/payment-evidence`,
      );
      return res.data;
    },
    enabled: authReady && isOpen,
    staleTime: 10_000,
  });

  const viewModel = useMemo(
    () => (rawSupport ? mapToTaxPaymentSupportViewModel(rawSupport) : null),
    [rawSupport],
  );

  // Prefill defaults when support loads
  React.useEffect(() => {
    if (viewModel && !amountReported) {
      setAmountReported(viewModel.rawAmount);
      setReferencePeriod(viewModel.periodFormatted.replace('/', '-'));
      setRevenueCodeReported(viewModel.revenueCode);
    }
  }, [viewModel, amountReported]);

  const recordEvidenceMutation = useMutation({
    mutationFn: async () => {
      if (!authReady) {
        throw new Error('Sessão não está pronta. Entre novamente para continuar.');
      }

      const cleanAmount = amountReported.trim();
      if (!/^\d+(\.\d{1,18})?$/.test(cleanAmount) || /^0(\.0+)?$/.test(cleanAmount)) {
        throw new Error('Informe um valor monetário positivo válido (ex: 150.00).');
      }

      const res = await apiClient.post<{ data: RawTaxPaymentEvidenceRecord }>(
        `/api/v1/fiscal/compliance/${encodeURIComponent(obligationKey)}/payment-evidence`,
        {
          paymentDate,
          amountReported: cleanAmount,
          revenueCodeReported: revenueCodeReported.trim() || undefined,
          referencePeriod: rawSupport?.period ?? referencePeriod.trim(),
          externalReference: externalReference.trim() || undefined,
          note: note.trim() || undefined,
        },
      );
      return res.data;
    },
    onSuccess: () => {
      setFormError(null);
      setNote('');
      setExternalReference('');
      void queryClient.invalidateQueries({ queryKey: taxPaymentSupportQueryKey(obligationKey) });
      void queryClient.invalidateQueries({ queryKey: taxPaymentEvidenceQueryKey(obligationKey) });
      void queryClient.invalidateQueries({ queryKey: ['fiscal', 'compliance'] });
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Falha ao registrar comprovante.');
    },
  });

  async function handleExport(format: 'json' | 'csv') {
    if (!authReady) return;

    try {
      const res = await apiClient.get<string>(
        `/api/v1/fiscal/compliance/${encodeURIComponent(obligationKey)}/payment-support/export?format=${format}`,
      );
      const mime = format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json;charset=utf-8;';
      const blob = new Blob([res], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `atlas-darf-apoio-${obligationKey.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format}`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // export error handling
    }
  }

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: `${spacing.md}px`,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          backgroundColor: colors.surface,
          borderRadius: `${borderRadius.lg}px`,
          maxWidth: '720px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          border: `1px solid ${colors.border}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: `${spacing.md}px ${spacing.lg}px`,
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '1.125rem',
                fontWeight: 600,
                color: colors.textPrimary,
              }}
            >
              Apoio ao Pagamento de DARF
            </h3>
            <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              Orientações para preparação manual e registro de comprovante
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              color: colors.textSecondary,
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content body */}
        <div style={{ padding: `${spacing.lg}px`, overflowY: 'auto', flex: 1 }}>
          {isSupportLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
              <Skeleton width="100%" height={80} />
              <Skeleton width="100%" height={120} />
            </div>
          ) : isSupportError || !viewModel ? (
            <div style={{ color: colors.negative, padding: `${spacing.md}px 0` }}>
              Esta obrigação não possui suporte a pagamento de DARF disponível ou você não tem
              acesso.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
              {/* Badges / Status row */}
              <div
                style={{
                  display: 'flex',
                  gap: `${spacing.sm}px`,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <Badge variant={viewModel.supportStatusVariant}>
                  {viewModel.supportStatusLabel}
                </Badge>
                <Badge variant={viewModel.isMismatch || viewModel.isStale ? 'warning' : 'neutral'}>
                  {viewModel.reconciliationLabel}
                </Badge>
                {viewModel.isOverdue && <Badge variant="danger">Vencida</Badge>}
              </div>

              {/* Provisional framing: calculated but not payable yet */}
              {viewModel.isProvisionalPending && (
                <div
                  style={{
                    padding: `${spacing.sm}px`,
                    backgroundColor: colors.warningSubtle,
                    color: colors.warning,
                    borderRadius: `${borderRadius.md}px`,
                    fontSize: '0.8125rem',
                  }}
                >
                  <strong>Apuração provisória:</strong> o imposto foi calculado, mas a obrigação
                  ainda não está pagável (competência em apuração ou vencimento oficial
                  indisponível). Nenhum DARF oficial é gerado pelo Atlas.
                </div>
              )}

              {/* Warnings if stale or mismatch */}
              {viewModel.isStale && (
                <div
                  style={{
                    padding: `${spacing.sm}px`,
                    backgroundColor: colors.warningSubtle,
                    color: colors.warning,
                    borderRadius: `${borderRadius.md}px`,
                    fontSize: '0.8125rem',
                  }}
                >
                  <strong>Atenção:</strong> A apuração fiscal desta obrigação foi recalculada após a
                  data deste comprovante. Verifique se o valor recolhido confere com a apuração
                  atual.
                </div>
              )}

              {viewModel.isMismatch && (
                <div
                  style={{
                    padding: `${spacing.sm}px`,
                    backgroundColor: colors.warningSubtle,
                    color: colors.warning,
                    borderRadius: `${borderRadius.md}px`,
                    fontSize: '0.8125rem',
                  }}
                >
                  <strong>Divergência detectada:</strong> O valor ou período informado no
                  comprovante não coincide com os dados apurados para esta obrigação.
                </div>
              )}

              {/* Obligation Data Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: `${spacing.sm}px`,
                  padding: `${spacing.sm}px`,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: `${borderRadius.md}px`,
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    Valor Principal
                  </div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, color: colors.textPrimary }}>
                    {viewModel.amountFormatted}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    Período de Apuração
                  </div>
                  <div
                    style={{ fontSize: '0.9375rem', fontWeight: 600, color: colors.textPrimary }}
                  >
                    {viewModel.periodFormatted}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    Código de Receita
                  </div>
                  <div
                    style={{ fontSize: '0.9375rem', fontWeight: 600, color: colors.textPrimary }}
                  >
                    {viewModel.revenueCode}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Vencimento</div>
                  <div
                    style={{ fontSize: '0.9375rem', fontWeight: 600, color: colors.textPrimary }}
                  >
                    {viewModel.dueDateFormatted}
                  </div>
                </div>
              </div>

              {/* Operational Instructions */}
              <div>
                <h4
                  style={{ margin: `0 0 ${spacing.xs}px 0`, fontSize: '0.875rem', fontWeight: 600 }}
                >
                  Como realizar o pagamento:
                </h4>
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: '20px',
                    fontSize: '0.8125rem',
                    color: colors.textSecondary,
                  }}
                >
                  {viewModel.paymentInstructions.map((instruction, idx) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>
                      {instruction}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Export Buttons (only when support is actionable) */}
              {(viewModel.supportStatus === 'NOT_APPLICABLE' ||
                viewModel.supportStatus === 'BLOCKED') && (
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Guias de apoio disponíveis após a liberação do pagamento.
                </div>
              )}
              {viewModel.supportStatus !== 'NOT_APPLICABLE' &&
                viewModel.supportStatus !== 'BLOCKED' && (
                  <div style={{ display: 'flex', gap: `${spacing.sm}px` }}>
                    <Button size="sm" variant="outline" onClick={() => void handleExport('json')}>
                      Baixar Guia de Apoio (JSON)
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void handleExport('csv')}>
                      Baixar Guia de Apoio (CSV)
                    </Button>
                  </div>
                )}

              {/* Record External Payment Evidence Section */}
              <div
                style={{
                  padding: `${spacing.md}px`,
                  border: `1px solid ${colors.border}`,
                  borderRadius: `${borderRadius.md}px`,
                  backgroundColor: colors.surfaceElevated,
                }}
              >
                <h4
                  style={{ margin: `0 0 ${spacing.xs}px 0`, fontSize: '0.875rem', fontWeight: 600 }}
                >
                  Registrar Comprovante de Pagamento
                </h4>
                {(viewModel.supportStatus === 'NOT_APPLICABLE' ||
                  viewModel.supportStatus === 'BLOCKED') && (
                  <div style={{ fontSize: '0.8125rem', color: colors.warning }}>
                    Registro indisponível enquanto a obrigação não estiver pagável. Nenhum
                    comprovante foi salvo.
                  </div>
                )}
                {viewModel.supportStatus !== 'NOT_APPLICABLE' &&
                viewModel.supportStatus !== 'BLOCKED' ? (
                  <>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: colors.textSecondary,
                        marginBottom: `${spacing.sm}px`,
                      }}
                    >
                      Informe os dados do pagamento realizado no banco para manter sua gestão
                      organizada. Este registro é declaratório e não é enviado à Receita Federal.
                    </div>

                    {formError && (
                      <div
                        style={{
                          color: colors.negative,
                          fontSize: '0.8125rem',
                          marginBottom: `${spacing.xs}px`,
                        }}
                      >
                        {formError}
                      </div>
                    )}

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: `${spacing.sm}px`,
                      }}
                    >
                      <div>
                        <label style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                          Data do Pagamento
                        </label>
                        <input
                          type="date"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px',
                            borderRadius: `${borderRadius.sm}px`,
                            border: `1px solid ${colors.border}`,
                            backgroundColor: colors.surface,
                            color: colors.textPrimary,
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                          Valor Pago (R$)
                        </label>
                        <input
                          type="text"
                          value={amountReported}
                          onChange={(e) => setAmountReported(e.target.value)}
                          placeholder="Ex: 150.00"
                          style={{
                            width: '100%',
                            padding: '6px',
                            borderRadius: `${borderRadius.sm}px`,
                            border: `1px solid ${colors.border}`,
                            backgroundColor: colors.surface,
                            color: colors.textPrimary,
                          }}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: `${spacing.sm}px`,
                        marginTop: `${spacing.xs}px`,
                      }}
                    >
                      <div>
                        <label style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                          Código de Receita
                        </label>
                        <input
                          type="text"
                          value={revenueCodeReported}
                          onChange={(e) => setRevenueCodeReported(e.target.value)}
                          placeholder="6015"
                          style={{
                            width: '100%',
                            padding: '6px',
                            borderRadius: `${borderRadius.sm}px`,
                            border: `1px solid ${colors.border}`,
                            backgroundColor: colors.surface,
                            color: colors.textPrimary,
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                          Autenticação / Protocolo Bancário
                        </label>
                        <input
                          type="text"
                          value={externalReference}
                          onChange={(e) => setExternalReference(e.target.value)}
                          placeholder="Ex: Autenticação internet banking"
                          style={{
                            width: '100%',
                            padding: '6px',
                            borderRadius: `${borderRadius.sm}px`,
                            border: `1px solid ${colors.border}`,
                            backgroundColor: colors.surface,
                            color: colors.textPrimary,
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: `${spacing.xs}px` }}>
                      <label style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                        Observação interna (opcional)
                      </label>
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Anotações sobre a conta de débito ou recolhimento"
                        style={{
                          width: '100%',
                          padding: '6px',
                          borderRadius: `${borderRadius.sm}px`,
                          border: `1px solid ${colors.border}`,
                          backgroundColor: colors.surface,
                          color: colors.textPrimary,
                        }}
                      />
                    </div>

                    <div
                      style={{
                        marginTop: `${spacing.sm}px`,
                        display: 'flex',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={recordEvidenceMutation.isPending}
                        onClick={() => recordEvidenceMutation.mutate()}
                      >
                        {recordEvidenceMutation.isPending ? 'Salvando...' : 'Salvar Comprovante'}
                      </Button>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Evidence History List */}
              {rawEvidenceHistory && rawEvidenceHistory.length > 0 && (
                <div>
                  <h4
                    style={{
                      margin: `0 0 ${spacing.xs}px 0`,
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    Histórico de Comprovantes Registrados ({rawEvidenceHistory.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
                    {rawEvidenceHistory.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          padding: `${spacing.xs}px ${spacing.sm}px`,
                          border: `1px solid ${colors.border}`,
                          borderRadius: `${borderRadius.sm}px`,
                          fontSize: '0.8125rem',
                          backgroundColor: colors.surface,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <strong>Rev {ev.revision}:</strong> R$ {ev.amountReported} em{' '}
                          {ev.paymentDate}
                          {ev.externalReference && <span> ({ev.externalReference})</span>}
                          {ev.note && (
                            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                              {ev.note}
                            </div>
                          )}
                        </div>
                        <Badge variant="neutral">Declarado</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Legal Disclaimer */}
              <div
                style={{
                  padding: `${spacing.sm}px`,
                  borderLeft: `3px solid ${colors.accent}`,
                  backgroundColor: colors.surfaceElevated,
                  fontSize: '0.75rem',
                  color: colors.textMuted,
                  lineHeight: 1.4,
                }}
              >
                {viewModel.disclaimer}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: `${spacing.sm}px ${spacing.lg}px`,
            borderTop: `1px solid ${colors.border}`,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Button size="sm" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
