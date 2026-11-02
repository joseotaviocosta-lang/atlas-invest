'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Card, Skeleton, ErrorState, Badge, SectionHeader } from '@/components/ui';
import {
  colors,
  spacing,
  borderRadius,
  taxIntelligenceQueryKey,
  mapCtiStatusToPresentation,
  mapCtiActionToTarget,
  formatCtiGeneratedAt,
  resolveBlockerTitle,
  resolveBlockerExplanation,
  resolveFactValue,
  type RawTaxIntelligenceResponse,
} from '@atlas/ui';

/**
 * CTI-2 contextual explanation panel (ADR-311).
 *
 * Renders the deterministic CTI-1 response verbatim: status, headline,
 * summary, ordered blockers, allowlisted navigation actions, limitations,
 * collapsible facts and sources. No tax reasoning lives here — every fiscal
 * semantic arrives from the server. Degrades independently: a CTI failure
 * never breaks the surrounding Fiscal page.
 */
export function TaxIntelligencePanel({
  portfolioId,
  competence,
}: {
  portfolioId: string | null;
  competence: string;
}) {
  const authReady = useAuthReady();
  const enabled =
    authReady && Boolean(portfolioId) && /^\d{4}-\d{2}$/.test(competence);

  const ctiQuery = useQuery({
    queryKey: taxIntelligenceQueryKey(portfolioId, competence),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxIntelligenceResponse }>(
        `/api/v1/portfolios/${portfolioId}/tax-intelligence?competence=${competence}`,
      );
      return res.data;
    },
    enabled,
    staleTime: 30_000,
    retry: false,
  });

  const data = ctiQuery.data ?? null;
  const statusView = data ? mapCtiStatusToPresentation(data.status) : null;

  return (
    <Card
      id="entenda"
      style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}
    >
      <SectionHeader
        title="Entenda sua situação fiscal"
        description="Explicação determinística da situação fiscal desta competência, derivada do estado canônico."
      />

      {ctiQuery.isPending && (
        <div>
          <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
            Analisando a situação fiscal…
          </div>
          <Skeleton />
        </div>
      )}

      {ctiQuery.isError && !ctiQuery.isPending && (
        <ErrorState
          title="Explicação indisponível"
          message="Não foi possível carregar a explicação fiscal. O restante da página continua funcionando normalmente."
          onRetry={() => ctiQuery.refetch()}
        />
      )}

      {data && statusView && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
            <Badge variant={statusView.variant}>{statusView.label}</Badge>
            <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              {formatCtiGeneratedAt(data.generatedAt)}
            </span>
          </div>

          <h3 style={{ fontSize: '1rem', margin: 0, color: colors.textPrimary }}>
            {data.headline}
          </h3>
          <p style={{ fontSize: '0.875rem', margin: 0, color: colors.textSecondary }}>
            {data.summary}
          </p>

          {data.blockers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
                {data.blockers.length === 1
                  ? '1 pendência prioritária'
                  : `${data.blockers.length} pendências prioritárias`}
              </div>
              {data.blockers.map((blocker) => {
                const title = resolveBlockerTitle(blocker.title);
                const explanation = resolveBlockerExplanation(blocker.explanation);
                return (
                <div
                  key={blocker.code}
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: `${borderRadius.md}px`,
                    padding: `${spacing.md}px`,
                  }}
                >
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
                    {title}
                  </div>
                  {explanation && (
                  <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: '2px' }}>
                    {explanation}
                  </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {data.actions.length > 0 && portfolioId && (
            <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
              {data.actions.map((action) => {
                const target = mapCtiActionToTarget(action.actionId, action.label, portfolioId);
                if (!target) return null;
                return (
                  <Link
                    key={action.actionId}
                    href={target.href}
                    style={{
                      display: 'inline-block',
                      padding: '8px 14px',
                      borderRadius: `${borderRadius.md}px`,
                      border: `1px solid ${colors.accent}`,
                      color: colors.accent,
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    {target.label}
                  </Link>
                );
              })}
            </div>
          )}

          {data.limitations.length > 0 && (
            <div
              style={{
                backgroundColor: colors.warningSubtle,
                border: `1px solid ${colors.border}`,
                borderRadius: `${borderRadius.md}px`,
                padding: `${spacing.md}px`,
                fontSize: '0.8125rem',
                color: colors.textSecondary,
              }}
            >
              {data.limitations.map((limitation) => (
                <div key={limitation}>{limitation}</div>
              ))}
            </div>
          )}

          {data.facts.length > 0 && (
            <details>
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: colors.textPrimary,
                }}
              >
                Dados considerados
              </summary>
              <div
                style={{
                  fontSize: '0.8125rem',
                  color: colors.textSecondary,
                  marginTop: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                {data.facts.map((fact) => (
                  <div key={fact.code}>
                    {fact.label}: {resolveFactValue(fact.code, fact.value) ?? '—'}
                  </div>
                ))}
              </div>
            </details>
          )}

          {data.sources.length > 0 && (
            <details>
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: colors.textPrimary,
                }}
              >
                Fontes consideradas
              </summary>
              <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: '4px' }}>
                {data.sources.map((source) => source.label).join(' · ')}
              </div>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
