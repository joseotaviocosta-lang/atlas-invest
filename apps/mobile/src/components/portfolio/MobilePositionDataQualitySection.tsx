import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  themeTokens,
  describeAffectedCapability,
  describeDataQualityIssueDetail,
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

interface PositionDataQualityData {
  portfolioId: string;
  assetId: string;
  ticker: string | null;
  currency: string;
  status: string;
  issueCount: number;
  blockingCount: number;
  reviewCount: number;
  issues: QualityIssueView[];
  affectedCapabilities: string[];
  generatedAt: string;
  marketDataAsOf: string | null;
  limitations: string[];
}

export interface MobilePositionDataQualitySectionProps {
  portfolioId: string;
  assetId: string;
}

/**
 * Phase 5R-E (mobile) — position data quality, read-only.
 * Issues with affected capabilities for one open position. Text only.
 */
export function MobilePositionDataQualitySection({
  portfolioId,
  assetId,
}: MobilePositionDataQualitySectionProps) {
  const qualityQuery = useQuery({
    queryKey: ['position-data-quality', portfolioId, assetId],
    queryFn: async () => {
      const res = await portfoliosApi.getPositionDataQuality(portfolioId, assetId);
      return res.data as PositionDataQualityData;
    },
    enabled: Boolean(portfolioId) && Boolean(assetId),
    staleTime: 30_000,
    retry: false,
  });

  const data = qualityQuery.data ?? null;

  return (
    <View testID="position-data-quality">
      <Card style={styles.card}>
        <Text style={styles.sectionHeading}>DADOS E PENDÊNCIAS</Text>
        {qualityQuery.isLoading ? (
          <Text style={styles.muted}>Carregando diagnóstico…</Text>
        ) : qualityQuery.isError || !data ? (
          <Text style={styles.muted}>Não foi possível carregar o diagnóstico desta posição.</Text>
        ) : data.issues.length === 0 ? (
          <Text style={styles.row} testID="position-data-quality-clean">
            {describeDataQualityStatus(data.status)}: nenhum problema de dados para esta posição.
          </Text>
        ) : (
          <View>
            <Text style={styles.value} testID="position-data-quality-status">
              {describeDataQualityStatus(data.status)}
            </Text>
            {data.issues.map((issue) => (
              <Text key={issue.code} style={styles.row}>
                {describeDataQualityIssue(issue.code)}: {describeDataQualityIssueDetail(issue.code)}{' '}
                Afeta: {issue.affectedCapabilities.map(describeAffectedCapability).join(', ')}.
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
  value: { fontSize: 16, fontWeight: '700', color: themeTokens.colors.text, marginVertical: 4 },
  row: { fontSize: 13, color: themeTokens.colors.text, marginVertical: 2 },
  muted: { fontSize: 12, color: themeTokens.colors.textMuted, marginVertical: 4 },
});
