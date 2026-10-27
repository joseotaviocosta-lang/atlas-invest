'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Skeleton, SectionHeader } from '@/components/ui';
import { colors, spacing } from '@atlas/ui';
import {
  describeAffectedCapability,
  describeDataQualityIssueDetail,
  describeDataQualityIssue,
  describeDataQualityStatus,
} from '@atlas/ui';

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
  maintenance?: {
    status: string;
    actionType: string;
    route: string | null;
    explanation: string;
    safetyNote: string | null;
  } | null;
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

/**
 * Phase 5S-D — maintenance action labels (display only; actionability
 * comes from the backend policy).
 */
function maintenanceActionLabel(actionType: string): string {
  switch (actionType) {
    case 'REFRESH_MARKET_DATA':
      return 'atualizar dados de mercado';
    case 'REFRESH_FX_DATA':
      return 'atualizar câmbio (provedor)';
    case 'REVIEW_RECONCILIATION':
      return 'revisar reconciliação';
    case 'VIEW_OPERATIONS':
      return 'ver operações';
    case 'VIEW_POSITION':
      return 'ver posição';
    case 'VIEW_MARKET_DATA':
      return 'ver dados de mercado';
    case 'VIEW_REVIEWS':
      return 'ver revisões';
    default:
      return 'ver manutenção de dados';
  }
}

/**
 * Phase 5R-E — position data quality section (lazy, read-only).
 * Diagnostic summary for one open position: issues, affected
 * capabilities and where to look. Complements the 5R-A limitation
 * list with impact and actions. Diagnostics only.
 */
export function PositionDataQualitySection({
  portfolioId,
  assetId,
}: {
  portfolioId: string;
  assetId: string;
}) {
  const authReady = useAuthReady();
  const qualityQuery = useQuery({
    queryKey: ['position-data-quality', portfolioId, assetId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PositionDataQualityData }>(
        `/api/v1/portfolios/${portfolioId}/positions/${assetId}/data-quality`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(portfolioId) && Boolean(assetId),
    staleTime: 30_000,
    retry: false,
  });

  const data = qualityQuery.data ?? null;

  return (
    <div style={{ marginTop: `${spacing.base}px` }} data-testid="position-data-quality">
      <SectionHeader
        title="Dados e pendências"
        description="Diagnóstico dos dados desta posição — o que falta, o que é afetado e onde conferir."
      />
      {qualityQuery.isLoading ? (
        <Skeleton width="100%" height="120px" />
      ) : qualityQuery.isError || !data ? (
        <p style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
          Não foi possível carregar o diagnóstico desta posição. Tente novamente.
        </p>
      ) : data.issues.length === 0 ? (
        <p data-testid="position-data-quality-clean" style={{ fontSize: '0.8125rem' }}>
          {describeDataQualityStatus(data.status)}: nenhum problema de dados para esta posição.
        </p>
      ) : (
        <>
          <p data-testid="position-data-quality-status" style={{ fontSize: '0.875rem' }}>
            Situação: <strong>{describeDataQualityStatus(data.status)}</strong>
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {data.issues.map((issue) => (
              <li key={issue.code} style={{ fontSize: '0.8125rem', marginBottom: 4 }}>
                <strong>{describeDataQualityIssue(issue.code)}</strong>
                {': '}
                {describeDataQualityIssueDetail(issue.code)}
                {issue.affectedCapabilities.length > 0 && (
                  <span>
                    {' '}
                    Afeta: {issue.affectedCapabilities.map(describeAffectedCapability).join(', ')}.
                  </span>
                )}
                {issue.maintenance && issue.maintenance.status !== 'STRUCTURAL' && (
                  <span>
                    {' '}
                    Ação disponível: {maintenanceActionLabel(issue.maintenance.actionType)}.
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
