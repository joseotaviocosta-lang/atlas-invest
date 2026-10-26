import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  themeTokens,
  describeAffectedCapability,
  describeCompositionLimitation,
  describeDataQualityIssueDetail,
  describeDataQualityDomain,
  describeDataQualityIssue,
  describeDataQualityStatus,
} from '@atlas/ui';
import { Card } from '../ui/Card';
import { portfoliosApi } from '../../api/portfolios';

interface QualityIssueView {
  code: string;
  domain: string;
  severity: string;
  affectedCapabilities: string[];
  facts: {
    assetId: string | null;
    ticker: string | null;
    asOf: string | null;
    count: number | null;
  };
  actions: Array<{ type: string; assetId: string | null }>;
}

interface PortfolioDataQualityData {
  portfolioId: string;
  generatedAt: string;
  marketDataAsOf: string | null;
  status: string;
  summary: {
    positionsTotal: number;
    positionsWithoutIssues: number;
    positionsReviewRequired: number;
    positionsBlocked: number;
    issuesTotal: number;
    coveragePercent: string;
    unvaluedCount: number;
    knownCurrencies: string[];
  };
  issuesByDomain: Array<{ domain: string; count: number }>;
  positions: Array<{
    assetId: string;
    ticker: string | null;
    currency: string;
    status: string;
    issueCount: number;
    blockingCount: number;
    reviewCount: number;
    issues: QualityIssueView[];
    affectedCapabilities: string[];
  }>;
  portfolioIssues: QualityIssueView[];
  reconciliation: {
    matched: number;
    divergent: number;
    missingLocal: number;
    missingSource: number;
    unresolved: number;
    pendingReviews: number;
    truncated: boolean;
  };
  structuralLimitations: string[];
  limitations: string[];
}

/**
 * Phase 5R-E (mobile) — portfolio data quality, read-only.
 * Status, counts, issues by position and domain, reconciliation
 * summary and structural notes. Text only; navigation for actions.
 */
export function MobilePortfolioDataQualitySection({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const qualityQuery = useQuery({
    queryKey: ['portfolio-data-quality', portfolioId],
    queryFn: async () => {
      const res = await portfoliosApi.getPortfolioDataQuality(portfolioId);
      return res.data as PortfolioDataQualityData;
    },
    enabled: Boolean(portfolioId),
    staleTime: 30_000,
    retry: false,
  });

  const data = qualityQuery.data ?? null;

  return (
    <View testID="portfolio-data-quality">
      <Card style={styles.card}>
        <Text style={styles.sectionHeading}>QUALIDADE DOS DADOS</Text>
        <Text style={styles.lede}>
          Pendências de dados por posição e reconciliação — o que falta, o que é afetado e onde
          conferir.
        </Text>
        {qualityQuery.isLoading ? (
          <Text style={styles.muted}>Carregando diagnóstico…</Text>
        ) : qualityQuery.isError || !data ? (
          <Text style={styles.muted}>Não foi possível carregar o diagnóstico.</Text>
        ) : (
          <View>
            <Text style={styles.value} testID="data-quality-status">
              {describeDataQualityStatus(data.status)}
            </Text>
            <Text style={styles.muted} testID="data-quality-counts">
              {data.summary.positionsTotal} posições · {data.summary.positionsWithoutIssues} sem
              pendências · {data.summary.positionsReviewRequired} para revisar ·{' '}
              {data.summary.positionsBlocked} com dados insuficientes
            </Text>
            {data.issuesByDomain.length > 0 && (
              <View testID="data-quality-by-domain">
                {data.issuesByDomain.map((entry) => (
                  <Text key={entry.domain} style={styles.row}>
                    {describeDataQualityDomain(entry.domain)}: {entry.count}{' '}
                    {entry.count === 1 ? 'pendência' : 'pendências'}
                  </Text>
                ))}
              </View>
            )}
            {data.positions
              .filter((row) => row.issueCount > 0)
              .map((row) => (
                <View key={row.assetId} testID={`data-quality-position-${row.assetId}`}>
                  <Pressable
                    onPress={() =>
                      router.push(
                        `/(app)/portfolio/${row.assetId}?portfolioId=${portfolioId}` as never,
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Ver posição ${row.ticker ?? row.assetId}`}
                  >
                    <Text style={styles.subHeading}>
                      {row.ticker ?? row.assetId} — {describeDataQualityStatus(row.status)}
                    </Text>
                  </Pressable>
                  {row.issues.map((issue) => (
                    <Text key={issue.code} style={styles.row}>
                      {describeDataQualityIssue(issue.code)}:{' '}
                      {describeDataQualityIssueDetail(issue.code)} Afeta:{' '}
                      {issue.affectedCapabilities.map(describeAffectedCapability).join(', ')}.
                    </Text>
                  ))}
                </View>
              ))}
            {data.portfolioIssues.length > 0 && (
              <View testID="data-quality-portfolio-issues">
                <Text style={styles.subHeading}>Pendências da carteira</Text>
                {data.portfolioIssues.map((issue) => (
                  <Text key={issue.code} style={styles.row}>
                    {describeDataQualityIssue(issue.code)}
                    {issue.facts.count !== null ? ` (${issue.facts.count})` : ''}:{' '}
                    {describeDataQualityIssueDetail(issue.code)}
                  </Text>
                ))}
              </View>
            )}
            <View testID="data-quality-reconciliation">
              <Text style={styles.subHeading}>Reconciliação</Text>
              <Text style={styles.muted}>
                Conferidos: {data.reconciliation.matched} · Divergentes:{' '}
                {data.reconciliation.divergent} · Revisões pendentes:{' '}
                {data.reconciliation.pendingReviews}
              </Text>
            </View>
            {data.structuralLimitations.map((code) => (
              <Text key={code} style={styles.muted} testID={`data-quality-structural-${code}`}>
                {describeCompositionLimitation(code)}
              </Text>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginVertical: themeTokens.spacing.sm },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: themeTokens.colors.text,
    marginBottom: 4,
  },
  lede: { fontSize: 12, color: themeTokens.colors.textMuted, marginBottom: 8 },
  subHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: themeTokens.colors.text,
    marginTop: 12,
    marginBottom: 4,
  },
  value: { fontSize: 16, fontWeight: '700', color: themeTokens.colors.text, marginVertical: 4 },
  row: { fontSize: 13, color: themeTokens.colors.text, marginVertical: 2 },
  muted: { fontSize: 12, color: themeTokens.colors.textMuted, marginVertical: 4 },
});
