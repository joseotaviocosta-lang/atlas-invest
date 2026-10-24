import React from 'react';
import { View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { themeTokens } from '@atlas/ui';
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
  strategy: { portfolioId: string; targets: MobileStrategyTarget[]; updatedAt: string | null } | null;
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
          Você ainda não definiu metas de alocação para esta carteira. Defina suas metas na
          versão web.
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
        Metas definidas por você. Para ajustar, use a versão web. O Atlas não faz recomendações
        de investimento.
      </Text>
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
  note: { fontSize: 12, color: themeTokens.colors.textMuted, marginTop: 8 },
};
