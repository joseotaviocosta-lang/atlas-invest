import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  themeTokens,
  formatCurrency,
  mapToFiscalMonthlyViewModel,
  mapToMonthlyTaxLiabilityViewModel,
  mapToTaxInputReadinessViewModel,
  mapToDarfHandoffViewModel,
  mapToTaxObligationViewModel,
  fiscalMonthlyQueryKey,
  taxLiabilityQueryKey,
  taxInputReadinessQueryKey,
  taxObligationQueryKey,
  type RawDarfReadiness,
  type RawFiscalMonthlyState,
  type RawMonthlyTaxLiability,
  type RawTaxInputReadiness,
  type RawTaxObligation,
} from '@atlas/ui';
import {
  Screen,
  Header,
  Card,
  LoadingState,
  EmptyState,
  ErrorState,
} from '../../../src/components/ui';
import { apiClient, ApiError } from '../../../src/api/client';

/** Allowlisted official origin for the Sicalc handoff (open-redirect defense). */
const OFFICIAL_DARF_ORIGIN = 'https://sicalc.receita.fazenda.gov.br/';

function currentCompetence(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}

interface MobileAdjustment {
  status: string;
  reasonCode: string | null;
  lateFeeAmount: { amount: string; currency: string } | null;
  interestAmount: { amount: string; currency: string } | null;
  updatedAmount: { amount: string; currency: string } | null;
}

function shiftCompetence(competence: string, delta: number): string {
  const [y, m] = competence.split('-').map((v) => parseInt(v, 10));
  const base = new Date(y!, m! - 1 + delta, 1);
  return `${base.getFullYear()}-${(base.getMonth() + 1).toString().padStart(2, '0')}`;
}

export default function TaxScreen() {
  const router = useRouter();
  const [competence, setCompetence] = useState(currentCompetence());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: fiscalMonthlyQueryKey(competence),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawFiscalMonthlyState }>(
        `/api/v1/fiscal/monthly/${competence}`,
      );
      return res.data;
    },
  });

  const vm = useMemo(() => mapToFiscalMonthlyViewModel(data ?? null), [data]);

  const { data: liabilityData } = useQuery({
    queryKey: taxLiabilityQueryKey(competence),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawMonthlyTaxLiability }>(
        `/api/v1/fiscal/monthly/${competence}/liability`,
      );
      return res.data;
    },
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
  });

  const inputReadiness = useMemo(
    () => mapToTaxInputReadinessViewModel(inputReadinessData ?? null),
    [inputReadinessData],
  );

  const { data: obligationData } = useQuery({
    queryKey: taxObligationQueryKey(competence),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxObligation }>(
        `/api/v1/fiscal/monthly/${competence}/obligation`,
      );
      return res.data;
    },
  });

  const obligation = useMemo(
    () => mapToTaxObligationViewModel(obligationData ?? null),
    [obligationData],
  );

  const paymentDate = new Date().toISOString().slice(0, 10);
  const { data: adjustmentData } = useQuery({
    queryKey: ['fiscal-adjustment', obligationData?.id ?? '', paymentDate],
    queryFn: async () => {
      const res = await apiClient.get<{ data: MobileAdjustment }>(
        `/api/v1/fiscal/obligations/${obligationData!.id}/adjustment?paymentDate=${paymentDate}`,
      );
      return res.data;
    },
    enabled: Boolean(obligationData),
  });

  // Phase 4F — official DARF handoff readiness (read-only; never generates a document).
  const darfEnabled =
    Boolean(obligationData) &&
    obligationData!.darfReadiness === 'READY' &&
    !['PAID', 'NO_PAYMENT_DUE', 'BLOCKED', 'PROVISIONAL'].includes(obligationData!.status);
  const { data: darfReadinessData } = useQuery({
    queryKey: ['fiscal-darf-readiness', obligationData?.id ?? ''],
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawDarfReadiness }>(
        `/api/v1/fiscal/obligations/${obligationData!.id}/darf-readiness`,
      );
      return res.data;
    },
    enabled: darfEnabled,
  });
  const darf = useMemo(
    () => mapToDarfHandoffViewModel(darfReadinessData ?? null),
    [darfReadinessData],
  );
  const officialDarfHref =
    darf?.destinationUrl && darf.destinationUrl.startsWith(OFFICIAL_DARF_ORIGIN)
      ? darf.destinationUrl
      : null;

  return (
    <Screen>
      <Header
        title="Fiscal"
        subtitle="Apuração fiscal mensal (fundação)"
        rightAction={{ title: 'Perfil', onPress: () => router.push('/(app)/profile') }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.competenceRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Competência anterior"
              onPress={() => setCompetence((c) => shiftCompetence(c, -1))}
              style={styles.competenceButton}
            >
              <Text style={styles.competenceButtonText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.competenceLabel}>{vm ? vm.competenceLabel : competence}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Próxima competência"
              onPress={() => setCompetence((c) => shiftCompetence(c, 1))}
              style={styles.competenceButton}
            >
              <Text style={styles.competenceButtonText}>›</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {isLoading && <LoadingState message="Carregando apuração fiscal..." />}

        {isError && !isLoading && (
          <ErrorState
            message={(error as ApiError)?.message || 'Erro ao consultar o estado fiscal.'}
            onRetry={() => refetch()}
          />
        )}

        {vm && (
          <>
            <Card>
              <Text style={styles.sectionTitle}>Status da apuração</Text>
              <Text style={[styles.status, { color: vm.statusColor }]}>{vm.statusLabel}</Text>
              <Text style={styles.meta}>{vm.ruleSetLabel}</Text>
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>Eventos fiscais</Text>
              <Text style={styles.meta}>{vm.eventCount} evento(s) na competência</Text>
              {vm.eventsSummary.length > 0 && (
                <Text style={styles.meta}>
                  {vm.eventsSummary.map((e) => `${e.count} ${e.label}`).join(' · ')}
                </Text>
              )}
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>Categorias de ativos</Text>
              {vm.categories.length === 0 ? (
                <EmptyState
                  title="Sem eventos"
                  description="Nenhum evento fiscal registrado para esta competência."
                />
              ) : (
                vm.categories.map((c) => (
                  <View key={`${c.categoryLabel}-${c.currency}`} style={styles.categoryRow}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryTitle}>
                        {c.categoryLabel} · {c.currency}
                      </Text>
                      <Text style={[styles.categoryCapability, { color: c.capabilityColor }]}>
                        {c.capabilityLabel}
                      </Text>
                    </View>
                    <Text style={styles.meta}>
                      {c.eventCount} evento(s) · Vendas: {c.salesProceedsFormatted} · Proventos:{' '}
                      {c.incomeFormatted}
                    </Text>
                    {c.qualityLabels.length > 0 && (
                      <Text style={styles.warning}>Pendências: {c.qualityLabels.join(' · ')}</Text>
                    )}
                  </View>
                ))
              )}
            </Card>

            {vm.dataQuality.hasIssues && (
              <Card>
                <Text style={styles.sectionTitle}>Dados incompletos</Text>
                {vm.dataQuality.issueLabels.map((label) => (
                  <Text key={label} style={styles.warning}>
                    • {label}
                  </Text>
                ))}
              </Card>
            )}

            {liability && (
              <Card>
                <Text style={styles.sectionTitle}>Apuração de imposto (4B)</Text>
                <Text style={[styles.status, { color: liability.statusColor }]}>
                  {liability.statusLabel}
                </Text>
                <Text style={styles.meta}>Imposto calculado: {liability.taxDueFormatted}</Text>
                <Text style={styles.meta}>
                  {liability.productionRuleVerified
                    ? 'Regra de produção verificada'
                    : 'Sem regra de produção verificada'}
                </Text>
              </Card>
            )}

            {liability && liability.categories.length > 0 && (
              <Card>
                <Text style={styles.sectionTitle}>Categorias</Text>
                {liability.categories.map((c, i) => (
                  <View key={`${c.categoryLabel}-${c.currency}-${i}`} style={styles.categoryRow}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryTitle}>
                        {c.categoryLabel} · {c.currency}
                      </Text>
                      <Text style={[styles.categoryCapability, { color: c.statusColor }]}>
                        {c.statusLabel}
                      </Text>
                    </View>
                    <Text style={styles.meta}>
                      Base antes de prejuízos: {c.taxableBaseBeforeLossesFormatted}
                    </Text>
                    <Text style={styles.meta}>
                      Prejuízo anterior: {c.openingLossFormatted} · Compensado:{' '}
                      {c.lossAppliedFormatted} · Final: {c.closingLossFormatted}
                    </Text>
                    <Text style={styles.meta}>
                      Alíquota: {c.rateFormatted} · Retenção: {c.withholdingAppliedFormatted} ·
                      Imposto: {c.taxDueFormatted}
                    </Text>
                    {c.qualityLabels.length > 0 && (
                      <Text style={styles.warning}>Pendências: {c.qualityLabels.join(' · ')}</Text>
                    )}
                  </View>
                ))}
              </Card>
            )}

            {liability && liability.qualityLabels.length > 0 && (
              <Card>
                <Text style={styles.sectionTitle}>Pendências de dados</Text>
                {liability.qualityLabels.map((label) => (
                  <Text key={label} style={styles.warning}>
                    • {label}
                  </Text>
                ))}
              </Card>
            )}

            {liability && liability.trace.length > 0 && (
              <Card>
                <Text style={styles.sectionTitle}>Como foi calculado</Text>
                {liability.trace.map((t, i) => (
                  <Text key={`${t.stage}-${i}`} style={styles.meta}>
                    {t.stage} · {t.operation} · {t.status}
                    {t.ruleVersion ? ` · regra ${t.ruleVersion}` : ''}
                  </Text>
                ))}
              </Card>
            )}

            {inputReadiness && (
              <Card>
                <Text style={styles.sectionTitle}>Dados necessários para apuração</Text>
                {inputReadiness.rows.map((row) => (
                  <View key={row.key} style={styles.categoryHeader}>
                    <Text style={styles.meta}>{row.label}</Text>
                    <Text style={[styles.categoryCapability, { color: row.statusColor }]}>
                      {row.statusLabel}
                    </Text>
                  </View>
                ))}
                <View style={styles.categoryHeader}>
                  <Text style={styles.meta}>Regras tributárias</Text>
                  <Text
                    style={[styles.categoryCapability, { color: inputReadiness.ruleCoverageColor }]}
                  >
                    {inputReadiness.ruleCoverageLabel}
                  </Text>
                </View>
                <View style={styles.categoryHeader}>
                  <Text style={styles.meta}>Apuração</Text>
                  <Text
                    style={[
                      styles.categoryCapability,
                      { color: inputReadiness.liabilityStatusColor },
                    ]}
                  >
                    {inputReadiness.liabilityStatusLabel}
                  </Text>
                </View>
                {inputReadiness.issueLabels.length > 0 && (
                  <Text style={styles.warning}>
                    Pendências: {inputReadiness.issueLabels.join(' · ')}
                  </Text>
                )}
              </Card>
            )}

            {obligation && (
              <Card>
                <Text style={styles.sectionTitle}>Obrigações</Text>
                <View style={styles.categoryHeader}>
                  <Text style={styles.categoryTitle}>
                    {obligation.competenceLabel} · {obligation.bucketLabel}
                  </Text>
                  <Text style={[styles.categoryCapability, { color: obligation.statusColor }]}>
                    {obligation.statusLabel}
                  </Text>
                </View>
                <Text style={styles.meta}>Valor principal: {obligation.principalFormatted}</Text>
                <Text style={styles.meta}>Vencimento: {obligation.dueDateFormatted}</Text>
                <Text style={styles.meta}>Código de receita: {obligation.revenueCode ?? '—'}</Text>
                <Text style={styles.meta}>
                  Dados para pagamento: {obligation.darfReadinessLabel}
                </Text>
                {obligation.sourceNote && (
                  <Text style={styles.meta}>
                    {obligation.sourceNote}
                    {obligation.sourceDocument ? ` — ${obligation.sourceDocument}` : ''}
                  </Text>
                )}
                {adjustmentData?.status === 'READY' && adjustmentData.updatedAmount && (
                  <>
                    <Text style={styles.meta}>
                      Multa:{' '}
                      {formatCurrency(
                        adjustmentData.lateFeeAmount?.amount ?? null,
                        adjustmentData.lateFeeAmount?.currency ?? 'BRL',
                      )}
                    </Text>
                    <Text style={styles.meta}>
                      Juros:{' '}
                      {formatCurrency(
                        adjustmentData.interestAmount?.amount ?? null,
                        adjustmentData.interestAmount?.currency ?? 'BRL',
                      )}
                    </Text>
                    <Text style={styles.meta}>
                      Valor atualizado:{' '}
                      {formatCurrency(
                        adjustmentData.updatedAmount.amount,
                        adjustmentData.updatedAmount.currency,
                      )}
                    </Text>
                  </>
                )}
                {adjustmentData?.status === 'BLOCKED' && (
                  <Text style={styles.warning}>Atualização do valor indisponível.</Text>
                )}

                {darf && (
                  <>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.sectionTitle}>DARF oficial</Text>
                      <Text style={[styles.categoryCapability, { color: darf.statusColor }]}>
                        {darf.statusLabel}
                      </Text>
                    </View>
                    {darf.eligible ? (
                      <>
                        <Text style={styles.meta}>Valor a pagar: {darf.totalFormatted}</Text>
                        <Text style={styles.meta}>Vencimento: {darf.dueDateFormatted}</Text>
                        {darf.carryForwardFormatted && (
                          <Text style={styles.meta}>
                            Valor acumulado de períodos anteriores: {darf.carryForwardFormatted}
                          </Text>
                        )}
                        {darf.lateFeeFormatted && (
                          <Text style={styles.meta}>
                            Multa: {darf.lateFeeFormatted} · Juros: {darf.interestFormatted}
                          </Text>
                        )}
                        <Text style={styles.meta}>
                          Fonte oficial: {darf.officialSourceLabel}. Conclua a emissão no site
                          oficial da Receita.
                        </Text>
                        {officialDarfHref && (
                          <TouchableOpacity
                            accessibilityRole="link"
                            accessibilityLabel="Abrir Sicalc"
                            style={styles.darfButton}
                            onPress={() => Linking.openURL(officialDarfHref)}
                          >
                            <Text style={styles.darfButtonText}>{darf.actionLabel}</Text>
                          </TouchableOpacity>
                        )}
                        <Text style={styles.meta}>
                          O documento oficial não marca a obrigação como paga; registre o pagamento
                          separadamente.
                        </Text>
                      </>
                    ) : (
                      darf.reasonLabel && <Text style={styles.warning}>{darf.reasonLabel}</Text>
                    )}
                  </>
                )}
              </Card>
            )}

            <Text style={styles.notice}>{vm.foundationNotice}</Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: themeTokens.spacing.md,
    gap: themeTokens.spacing.md,
  },
  competenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  competenceButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  competenceButtonText: {
    color: themeTokens.colors.primary,
    fontSize: 24,
    fontWeight: '700',
  },
  competenceLabel: {
    color: themeTokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitle: {
    color: themeTokens.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  status: {
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  categoryRow: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themeTokens.colors.border ?? themeTokens.colors.textMuted,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  categoryTitle: {
    color: themeTokens.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  categoryCapability: {
    fontSize: 12,
    fontWeight: '600',
  },
  warning: {
    color: themeTokens.colors.warning ?? themeTokens.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  notice: {
    color: themeTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 4,
  },
  darfButton: {
    minHeight: 44,
    marginTop: themeTokens.spacing.sm,
    borderRadius: themeTokens.borderRadius.md,
    backgroundColor: themeTokens.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: themeTokens.spacing.md,
  },
  darfButtonText: {
    color: themeTokens.colors.text,
    fontWeight: '700',
  },
});
