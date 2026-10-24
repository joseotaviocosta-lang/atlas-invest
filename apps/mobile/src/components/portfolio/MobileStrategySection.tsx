import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { themeTokens } from '@atlas/ui';
import {
  describeScenarioLimitation,
  formatAggregatePp,
  formatCentsBr,
  formatScenarioBp,
  parseScenarioMoneyToCents,
  scenarioCategoryLabel,
} from '@atlas/ui';
import { Card } from '@/components/ui';

export interface MobileStrategyTarget {
  category: string;
  targetBp: number;
}

export interface MobileStrategyComparisonRow {
  category: string;
  targetBp: number;
  currentBp: number | null;
  deviationBp: number | null;
  state: 'ABOVE_TARGET' | 'BELOW_TARGET' | 'ON_TARGET' | 'UNAVAILABLE';
}

export interface MobileStrategyState {
  strategy: {
    portfolioId: string;
    targets: MobileStrategyTarget[];
    updatedAt: string | null;
  } | null;
  comparison: {
    rows: MobileStrategyComparisonRow[];
    outsideTolerance: string[];
    coveragePercent: string;
    qualified: boolean;
    denominator: string;
    asOf: string | null;
  } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  STOCK: 'Ações',
  FII: 'FIIs',
  ETF: 'ETFs',
  BDR: 'BDRs',
  FIXED_INCOME: 'Renda Fixa',
  TREASURY: 'Tesouro Direto',
  FUND: 'Fundos',
  CASH: 'Caixa',
  OTHER: 'Outros',
};

function formatBp(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value)) return '—';
  const negative = value < 0;
  const abs = Math.abs(value);
  const intPart = Math.floor(abs / 100).toString();
  const frac = String(abs % 100).padStart(2, '0');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped},${frac}%`;
}

function formatDeviation(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const intPart = Math.floor(abs / 100).toString();
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${intPart},${frac} p.p.`;
}

function stateLabel(state: string): string {
  if (state === 'ABOVE_TARGET') return 'Acima da meta';
  if (state === 'BELOW_TARGET') return 'Abaixo da meta';
  if (state === 'ON_TARGET') return 'Na meta';
  return 'Dados indisponíveis';
}

/**
 * Phase 5Q-E (mobile) — saved scenarios list + read-only live detail.
 * Creating and editing stay web-only (forms are web-only in v1); opening
 * a scenario shows the live recomputation read-only. No dead actions,
 * no execution, no advice.
 */
interface SavedScenarioSummary {
  id: string;
  name: string;
  hypotheticalTotal: string;
  updatedAt: string;
}

interface SavedScenarioDetail {
  saved: SavedScenarioSummary & {
    changes: Array<{ category: string; amount: string }>;
  };
  live: {
    totals: { projected: string; currency: string };
    rows: Array<{
      category: string;
      targetBp: number;
      currentBp: number | null;
      projectedBp: number;
      currentDeviationBp: number | null;
      projectedDeviationBp: number;
    }>;
    beforeOutsideCount: number;
    afterOutsideCount: number;
    beforeTotalAbsDeviationBp: number;
    afterTotalAbsDeviationBp: number;
  } | null;
  limitations: string[];
}

function SavedScenarios({ portfolioId }: { portfolioId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['portfolio-allocation-scenarios', portfolioId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: { scenarios: SavedScenarioSummary[] } }>(
        `/api/v1/portfolios/${portfolioId}/allocation-scenarios`,
      );
      return res.data;
    },
    enabled: !!portfolioId,
    staleTime: 30000,
  });
  const detail = useQuery({
    queryKey: ['portfolio-allocation-scenarios', portfolioId, 'detail', openId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: SavedScenarioDetail }>(
        `/api/v1/portfolios/${portfolioId}/allocation-scenarios/${openId}`,
      );
      return res.data;
    },
    enabled: !!portfolioId && openId !== null,
    staleTime: 30000,
  });

  if (list.isLoading || list.isError || !list.data || list.data.scenarios.length === 0) {
    return null;
  }

  const opened = detail.data && detail.data.saved.id === openId ? detail.data : null;

  return (
    <View style={{ marginTop: 12 }} testID="saved-scenarios">
      <Text style={styles.title}>Cenários salvos</Text>
      {list.data.scenarios.map((scenario) => (
        <View key={scenario.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.category}>{scenario.name}</Text>
            <Text style={styles.muted}>
              {formatCentsBr(parseScenarioMoneyToCents(scenario.hypotheticalTotal) ?? BigInt(0))}
            </Text>
          </View>
          <Pressable
            onPress={() => setOpenId(openId === scenario.id ? null : scenario.id)}
            accessibilityRole="button"
            accessibilityLabel={
              openId === scenario.id ? `Fechar ${scenario.name}` : `Abrir ${scenario.name}`
            }
          >
            <Text style={styles.link}>{openId === scenario.id ? 'Fechar' : 'Abrir'}</Text>
          </Pressable>
        </View>
      ))}
      {opened?.live ? (
        <View style={{ marginTop: 8 }} testID="saved-scenario-detail">
          <Text style={styles.muted}>
            Antes: {opened.live.beforeOutsideCount} fora da meta. Após a hipótese:{' '}
            {opened.live.afterOutsideCount} fora da meta. Desvio agregado{' '}
            {formatAggregatePp(opened.live.afterTotalAbsDeviationBp)}.
          </Text>
          {opened.live.rows.map((row) => (
            <View key={row.category} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.category}>{scenarioCategoryLabel(row.category)}</Text>
                <Text style={styles.muted}>
                  {formatScenarioBp(row.currentBp)} → {formatScenarioBp(row.projectedBp)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.value}>{formatScenarioBp(row.targetBp)}</Text>
                <Text style={styles.muted}>meta</Text>
              </View>
            </View>
          ))}
          {opened.limitations.map((limitation) => (
            <Text key={limitation} style={styles.note}>
              {describeScenarioLimitation(limitation)}
            </Text>
          ))}
        </View>
      ) : opened && opened.live === null ? (
        <View style={{ marginTop: 8 }} testID="saved-scenario-detail">
          {opened.limitations.map((limitation) => (
            <Text key={limitation} style={styles.note}>
              {describeScenarioLimitation(limitation)}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.note}>
        Criar e editar cenários estão disponíveis na versão web. O resultado acima é recalculado com
        a carteira e as metas atuais.
      </Text>
    </View>
  );
}

/**
 * Phase 5Q-C (mobile) — read-only strategy view.
 * Editing stays web-only for now (explicit note); the card never
 * offers a dead-end action.
 */
export function MobileStrategySection({ portfolioId }: { portfolioId: string | null }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['portfolio-allocation-strategy', portfolioId],
    queryFn: async () => {
      if (!portfolioId) return null;
      const res = await apiClient.get<{ data: MobileStrategyState }>(
        `/api/v1/portfolios/${portfolioId}/allocation-strategy`,
      );
      return res.data;
    },
    enabled: !!portfolioId,
    staleTime: 30000,
  });

  if (!portfolioId || isLoading) {
    return null;
  }

  if (isError || !data) {
    return null;
  }

  if (!data.strategy) {
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>Metas de alocação</Text>
        <Text style={styles.body}>
          Você ainda não definiu metas de alocação para esta carteira. Defina suas metas na versão
          web.
        </Text>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Metas de alocação</Text>
      {data.comparison?.qualified === true && data.comparison.coveragePercent !== null ? (
        <Text style={styles.muted}>
          Comparação sobre {data.comparison.coveragePercent}% do valor conhecido.
        </Text>
      ) : null}
      {data.comparison?.rows.map((row) => (
        <View key={row.category} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.category}>{CATEGORY_LABELS[row.category] ?? row.category}</Text>
            <Text style={styles.muted}>{stateLabel(row.state)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.value}>
              {formatBp(row.targetBp)} → {formatBp(row.currentBp)}
            </Text>
            <Text style={styles.muted}>{formatDeviation(row.deviationBp)}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.note}>
        Metas definidas por você. Para ajustar, use a versão web. O Atlas não faz recomendações de
        investimento.
      </Text>
      <Text style={styles.note}>Simulações de aporte hipotético disponíveis na versão web.</Text>
      <SavedScenarios portfolioId={portfolioId} />
    </Card>
  );
}

const styles = {
  card: { marginBottom: 16 },
  title: { fontSize: 15, fontWeight: '700' as const, marginBottom: 8 },
  body: { fontSize: 14, color: themeTokens.colors.text },
  muted: { fontSize: 12, color: themeTokens.colors.textMuted, marginTop: 2 },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
  },
  category: { fontSize: 14, fontWeight: '600' as const },
  value: { fontSize: 14, fontWeight: '600' as const },
  link: { fontSize: 14, fontWeight: '600' as const, color: themeTokens.colors.primary },
  note: { fontSize: 12, color: themeTokens.colors.textMuted, marginTop: 8 },
};
